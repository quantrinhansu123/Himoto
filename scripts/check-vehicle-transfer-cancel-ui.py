"""Sender cancellation UI; all business endpoints are synthetic and every unknown write fails."""
import argparse
import base64
import json
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3037')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--browser', choices=['chromium', 'webkit'], default='chromium')
parser.add_argument('--output', default='.backups/vehicle-transfer-cancel-ui')
args = parser.parse_args()
out = Path(args.output) / args.browser
out.mkdir(parents=True, exist_ok=True)
token = Path(args.session_cookie_file).read_text().strip()
actor = int(json.loads(base64.urlsafe_b64decode(token.split('.')[0] + '==='))['id'])
stores = [dict(id=80001, store_name='CS chuyển QA', status='opening'), dict(id=80002, store_name='CS nhận QA', status='opening')]
checks, errors, unexpected, writes = [], [], [], []
state = {}


def mock(route):
    req = route.request
    endpoint = urlparse(req.url).path
    if req.method == 'POST' and endpoint == '/api/auth/gps/refresh':
        route.fulfill(json=dict(status='success', data=dict(cached=True)))
        return
    if req.method != 'GET':
        if endpoint != '/api/auth/vehicles/91009/actions' or req.method != 'POST':
            unexpected.append(req.method + ' ' + endpoint)
            route.abort()
            return
        body = req.post_data_json
        writes.append(body)
        assert body['action'] == 'cancel' and body['transfer_event_id'] == '40009' and body['revision'] == '41'
        assert not any(key in body for key in ['created_by', 'created_at', 'to_store_id'])
        if state['fail']:
            state['fail'] = False
            route.fulfill(status=409, json=dict(status='error', message='QA: lệnh đang được kiểm tra, thử lại.'))
            return
        state['vehicle'].update(status='ready', current_store_id=80001, store_name='CS chuyển QA', vehicle_revision='42', transfer_receivable=0)
        state['history'] = [dict(key='event-40010', action='transfer', label='Huỷ điều chuyển', vehicle_name='Xe huỷ QA', license='QA-CANCEL-1',
            location='CS chuyển QA', responsible_store='CS chuyển QA', beneficiary_store='CS nhận QA', at='2026-10-30T05:00:00Z',
            actor='Người gửi QA', order_id=None, note=body['note'], changes=[])]
        route.fulfill(json=dict(status='success', data=dict(id=91009, event_id=40010)))
        return
    if endpoint == '/api/session':
        route.fulfill(json=dict(user=dict(id=actor, name='Người gửi QA')))
        return
    if endpoint in ['/api/auth/stores', '/api/auth/store-directory']:
        data = stores
    elif endpoint in ['/api/auth/vehicle/vehicles', '/api/auth/vehicles/inventory']:
        data = [state['vehicle']]
        if parse_qs(urlparse(req.url).query).get('table'):
            data = dict(rows=data, total=1, scopeCount=1, tabCount=1, page=1, pages=1, statusCounts=[[state['vehicle']['status'], 1]],
                statuses=[state['vehicle']['status']], dueCount=0, summary=None)
    elif endpoint == '/api/auth/vehicles/91009/history':
        data = state['history']
    elif endpoint == '/api/auth/gps/refresh':
        data = dict(cached=True)
    else:
        data = []
    route.fulfill(json=dict(status='success', data=data))


with sync_playwright() as p:
    browser = getattr(p, args.browser).launch()
    for width in ([320, 375] if args.browser == 'webkit' else [1440]):
        for scenario in ['sender', 'other', 'received']:
            state.clear()
            state.update(fail=True, history=[], vehicle=dict(id=91009, name='Xe huỷ QA', license='QA-CANCEL-1', status='in_transit',
                store_id=80001, current_store_id=80002, store_name='CS nhận QA', vehicle_revision='41', rentals=[], rental_blockers=[],
                transfer_event_id=40009, transfer_created_by=actor if scenario != 'other' else actor + 1,
                transfer_from_store_id=80001, transfer_to_store_id=80002, transfer_from_store_name='CS chuyển QA', transfer_to_store_name='CS nhận QA', transfer_receivable=1))
            if scenario == 'received':
                state['vehicle'].update(status='ready', transfer_receivable=0)
            context = browser.new_context(viewport=dict(width=width, height=900), timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce',
                is_mobile=width < 768, has_touch=width < 768)
            context.add_cookies([dict(name='himoto_management_session', value=token, url=args.url, httpOnly=True, sameSite='Strict')])
            context.route('**/api/**', mock)
            context.route('https://api.telegram.org/**', lambda route: route.abort())
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(args.url + '/vehicles', wait_until='networkidle', timeout=90000)
            cancel = page.get_by_role('button', name='Huỷ điều chuyển', exact=True)
            if scenario != 'sender':
                expect(cancel).to_have_count(0)
                if scenario == 'other':
                    expect(page.get_by_role('button', name='Nhận xe', exact=True)).to_be_visible()
                    expect(page.get_by_role('button', name='Từ chối điều chuyển', exact=True)).to_be_visible()
                checks.append(f'{width}px/{scenario}: cancellation hidden; receiver actions retain their meaning')
            else:
                expect(cancel).to_be_visible()
                expect(page.get_by_role('button', name='Nhận xe', exact=True)).to_have_count(0)
                expect(page.get_by_role('button', name='Từ chối điều chuyển', exact=True)).to_have_count(0)
                before = len(writes)
                page.screenshot(path=str(out / f'{width}-cancel-button.png'))
                cancel.click()
                dialog = page.get_by_role('dialog', name='Huỷ điều chuyển', exact=False)
                expect(dialog).to_contain_text('QA-CANCEL-1')
                expect(dialog).to_contain_text('Xe sẽ về Lưu kho tại CS chuyển QA')
                assert len(writes) == before
                dialog.get_by_role('button', name='Quay lại', exact=True).click()
                assert len(writes) == before and state['vehicle']['status'] == 'in_transit'
                cancel.click()
                dialog.locator('#vehicle-action-note').fill('Chọn nhầm tài khoản QA')
                dialog.screenshot(path=str(out / f'{width}-cancel-confirmation.png'))
                dialog.get_by_role('button', name='Xác nhận huỷ điều chuyển', exact=True).click()
                expect(dialog.get_by_role('alert')).to_contain_text('QA: lệnh đang được kiểm tra')
                expect(dialog.locator('#vehicle-action-note')).to_have_value('Chọn nhầm tài khoản QA')
                assert state['vehicle']['status'] == 'in_transit'
                dialog.get_by_role('button', name='Xác nhận huỷ điều chuyển', exact=True).click()
                expect(dialog).to_have_count(0)
                expect(cancel).to_have_count(0)
                expect(page.locator('body')).to_contain_text('Lưu kho')
                assert len(writes) == before + 2 and state['vehicle']['current_store_id'] == 80001 and len(state['history']) == 1
                page.wait_for_load_state('networkidle')
                page.locator('.mg-mobile-card-actions .mg-row-menu-trigger:visible' if width < 768 else 'tbody .mg-row-menu-trigger:visible').first.click()
                page.get_by_role('menuitem', name='Xem chi tiết', exact=True).click()
                detail = page.locator('dialog.mg-vehicle-detail')
                detail.get_by_role('tab', name='Lịch sử', exact=False).click()
                expect(detail).to_contain_text('Huỷ điều chuyển')
                checks.append(f'{width}px/sender: visible button, explicit confirmation/back, failed retry retains note, success restores source and history')
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
            context.unroute_all(behavior='ignoreErrors')
            context.close()
    browser.close()
assert not errors and not unexpected, (errors, unexpected)
result = dict(passed=len(checks), browser=args.browser, checks=checks, javascriptErrors=errors, unexpectedWrites=unexpected,
    simulatedWrites=len(writes), realBusinessWrites=0, realTelegramRequests=0)
(out / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
