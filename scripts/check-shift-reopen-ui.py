"""Browser check for Hết ca. All business writes use synthetic responses."""
import argparse
import copy
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3030')
parser.add_argument('--cookie-file', required=True)
args = parser.parse_args()
today = datetime.now(timezone(timedelta(hours=7))).date().isoformat()
template = dict(id=501, status='submitted', revision=9, updated_at=f'{today}T18:00:00+07:00', store_name='PGD QA',
    created_by_name='QA', photos=[], media=[], legacy_photos=[], stock_captures=[],
    payload=dict(store_id=34, date=today, staff='QA', report_type='end_shift', vehicles=0, daily_vehicles=4,
        monthly_vehicles=0, other_vehicles=0, batteries=0, charged=0, rented_batteries=0, transfers=0, cash=0, personal=0,
        company=0, electricity_off=True, notes=''))
state = {}

def mock(route):
    req = route.request
    url = urlparse(req.url)
    path = url.path
    if path == '/api/auth/shift-reports/501/reopen':
        if req.method == 'POST':
            raw = req.post_data_json
            assert raw['reason'] == 'QA sửa báo cáo' and raw['revision'] == 9 and not raw['manual']
            state['writes'].append('reopen')
            state['report'].update(status='draft', revision=10)
            state['report']['payload']['draft_missing'] = ['cash']
        route.fulfill(json=dict(data=dict(status=state['report']['status'], revision=state['report']['revision'],
            blocked_reason='', request=None, history=[], can_manual=True, report=state['report'])))
        return
    if path == '/api/auth/shift-reports':
        if req.method == 'POST':
            payload = req.post_data_json
            if not payload.get('id'):
                state['writes'].append('duplicate')
                route.fulfill(status=409, json=dict(code='SHIFT_REPORT_EXISTS', message='PGD đã có báo cáo cùng loại trong ngày.'))
                return
            assert payload['status'] == 'draft' and payload['id'] == 501
            assert payload['payload']['cash'] == 120000 and 'cash' not in payload['payload']['draft_missing']
            state['writes'].append('draft')
            state['report'].update(revision=11, payload=payload['payload'])
            route.fulfill(json=dict(data=dict(id=501, revision=11)))
            return
        route.fulfill(json=dict(data=[state['report']]))
        return
    if path == '/api/auth/shift-reports/autofill':
        query = parse_qs(url.query)
        route.fulfill(json=dict(data=dict(store_id=int(query['store_id'][0]), date=query['date'][0],
            section=query['section'][0], values={}, sources=[], notices=[], read_at=f'{today}T12:00:00+07:00')))
        return
    if path == '/api/auth/shift-reports/501/stock-photos':
        assert req.method == 'GET'
        route.fulfill(json=dict(data=dict(revision=state['report']['revision'], gps_configured=True,
            expected=[dict(id=70, name='QA', license='00AA-123.45')], captures=[])))
        return
    if path == '/api/auth/shift-reports/501/telegram':
        assert req.method == 'GET'
        route.fulfill(json=dict(data=dict(status='sent', message_id=120, error_code=None, attachment_count=0, media_count=0)))
        return
    assert req.method == 'GET', path
    stores = [dict(id=34, store_name='PGD QA', status='opening')]
    route.fulfill(json=dict(status='success', data=stores if path in ('/api/auth/stores', '/api/auth/store-directory') else []))

with sync_playwright() as pw:
    for engine, width, height in [('chromium', 1280, 800), ('webkit', 390, 844)]:
        state = dict(report=copy.deepcopy(template), writes=[])
        browser = getattr(pw, engine).launch()
        ctx = browser.new_context(viewport=dict(width=width, height=height), timezone_id='Asia/Ho_Chi_Minh')
        ctx.add_cookies([dict(name='himoto_management_session', value=Path(args.cookie_file).read_text().strip(),
            url=args.url, httpOnly=True, sameSite='Strict')])
        ctx.route('**/api/**', mock)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(args.url+'/shift-reports', wait_until='domcontentloaded')
        page.get_by_role('button', name='Tạo báo cáo', exact=True).click()
        page.locator('#shift-store').select_option('34')
        page.get_by_role('button', name='Lưu nháp', exact=True).click()
        page.once('dialog', lambda dialog: dialog.accept())
        page.get_by_role('button', name='Mở báo cáo đã có', exact=True).click()
        page.get_by_role('button', name='Thu hồi Telegram và mở lại báo cáo', exact=True).click()
        modal = page.get_by_role('dialog', name='Thu hồi Telegram và mở lại báo cáo', exact=True)
        modal.get_by_role('textbox', name='Lý do mở lại').fill('QA sửa báo cáo')
        modal.get_by_role('button', name='Thu hồi và mở lại', exact=True).click()
        expect(page.get_by_role('button', name='Tiếp tục soạn báo cáo')).to_be_visible()
        page.get_by_role('button', name='Chốt báo cáo', exact=True).click()
        issues = page.locator('.shift-missing-fields')
        expect(issues).to_contain_text('Thiếu ảnh 1 xe (00AA-123.45)')
        issues.get_by_role('button', name='Tiền mặt thực tế', exact=False).click()
        expect(page.locator('#shift-cash')).to_be_focused()
        expect(page.locator('#shift-cash')).to_have_value('')
        page.locator('#shift-cash').fill('120000')
        page.get_by_role('button', name='Lưu nháp', exact=True).click()
        expect(page.get_by_text('Đã lưu nháp báo cáo và ảnh.', exact=True)).to_be_visible()
        assert state['writes'] == ['duplicate', 'reopen', 'draft'], state['writes']
        assert not errors, errors
        browser.close()
        print(f'{engine} {width}px passed: duplicate shortcut, reopen, stock and cash checklist, partial save.')
