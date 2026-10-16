"""Synthetic transfer/edit workflow. Every API call is intercepted; no business writes."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3102')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--browser', choices=['chromium', 'webkit'], default='chromium')
parser.add_argument('--output', default='docs/qa/vehicle-transfers')
args = parser.parse_args()
out = Path(args.output) / args.browser
out.mkdir(parents=True, exist_ok=True)
checks, errors, writes, history = [], [], [], []
fail_transfer = True
fail_receive = True
stores = [dict(id=i, store_name=name, status='opening') for i, name in [(31, 'Cơ sở đi QA'), (32, 'Cơ sở đến QA')]]
vehicle = dict(id=701, name='Xe chuyển QA', license='QA-701', brand='Honda', type='xeso', year=2024, color='Đỏ',
    status='ready', store_id=31, current_store_id=31, store_name=stores[0]['store_name'], odometer=1000,
    created_at='2026-10-01T08:00:00Z', rentals=[], vehicle_revision='10')
labels = dict(name='Tên / dòng xe', license='Biển số', color='Màu sắc', odometer='Số km')


def log(action, label, before, changes, note):
    history.insert(0, dict(key=f'event-{len(history)+1}', action=action, label=label,
        vehicle_name=vehicle['name'], license=vehicle['license'], location=vehicle['store_name'],
        responsible_store=before['store_name'], beneficiary_store=vehicle['store_name'],
        at='2026-10-16T09:25:00Z', actor='Người thao tác QA', order_id=None, note=note, changes=changes))


def mock(route):
    global fail_transfer, fail_receive
    req = route.request
    endpoint = urlparse(req.url).path
    if req.method == 'POST' and endpoint == '/api/auth/vehicles/701/actions':
        body = req.post_data_json
        writes.append(body)
        assert body['revision'] == vehicle['vehicle_revision']
        assert 'created_by' not in body and 'created_at' not in body
        before = dict(vehicle)
        if body['action'] == 'transfer':
            assert body['to_store_id'] == '32' and vehicle['status'] == 'ready'
            if fail_transfer:
                fail_transfer = False
                route.fulfill(status=500, json=dict(status='error', message='Không lưu được thao tác xe QA.'))
                return
            vehicle.update(current_store_id=32, store_name=stores[1]['store_name'], status='in_transit', vehicle_revision='11',
                transfer_event_id=1,transfer_from_store_id=31,transfer_to_store_id=32,
                transfer_from_store_name=stores[0]['store_name'],transfer_to_store_name=stores[1]['store_name'],transfer_receivable=1)
            log('transfer', 'Chuyển kho', before, [dict(field='store_id', label='Cơ sở hiện tại', **{'from': before['store_name'], 'to': vehicle['store_name']}),
                dict(field='status', label='Trạng thái', **{'from': 'Lưu kho', 'to': 'Chờ luân chuyển'})], body['note'])
        else:
            assert body['action'] == 'receive' and body['transfer_event_id'] == '1'
            assert 'to_store_id' not in body and 'beneficiary_store_id' not in body
            if fail_receive:
                fail_receive=False
                route.fulfill(status=500,json=dict(status='error',message='Không thể ghi nhận xe QA.'))
                return
            vehicle.update(status='ready', vehicle_revision='12')
            log('transfer', 'Nhận xe', before, [dict(field='status', label='Trạng thái', **{'from': 'Chờ luân chuyển', 'to': 'Lưu kho'})], body['note'])
            history[0]['responsible_store']=before['transfer_from_store_name']
            history[0]['beneficiary_store']=before['transfer_to_store_name']
            for key in list(vehicle):
                if key.startswith('transfer_'):
                    del vehicle[key]
        route.fulfill(json=dict(status='success', data=dict(id=701, event_id=len(history))))
        return
    if req.method == 'PATCH' and endpoint == '/api/auth/vehicles/701':
        body = req.post_data_json
        assert body['revision'] == '12'
        writes.append(body)
        before = dict(vehicle)
        changes = [dict(field=key, label=labels[key], **{'from': str(before[key]), 'to': str(body[key])})
                   for key in labels if str(before[key]) != str(body[key])]
        vehicle.update(name=body['name'], license=body['license'], color=body['color'], odometer=int(body['odometer']), vehicle_revision='13')
        log('edit', 'Chỉnh sửa thông tin xe', before, changes, body['note'])
        route.fulfill(json=dict(status='success', data=dict(id=701)))
        return
    assert req.method == 'GET', f'Unexpected write: {req.method} {endpoint}'
    if endpoint == '/api/session':
        route.fulfill(json=dict(user=dict(name='Người thao tác QA')))
        return
    data = {'/api/auth/stores': stores, '/api/auth/vehicle/vehicles': [vehicle], '/api/auth/vehicles/701/history': history}.get(endpoint)
    assert data is not None, endpoint
    route.fulfill(json=dict(status='success', data=data))


with sync_playwright() as p:
    browser = getattr(p, args.browser).launch()
    context = browser.new_context(viewport=dict(width=375 if args.browser == 'webkit' else 1440, height=1000),
                                  timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
    context.add_cookies([dict(name='himoto_management_session', value=Path(args.session_cookie_file).read_text().strip(),
                             url=args.url, httpOnly=True, sameSite='Strict')])
    context.route('**/api/**', mock)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url + '/vehicles', wait_until='networkidle')

    def action(label):
        prefix = '.mg-mobile-card-actions' if page.viewport_size['width'] < 768 else 'tbody'
        page.locator(prefix + ' .mg-row-menu-trigger:visible').first.click()
        page.get_by_role('menuitem', name=label, exact=True).click()

    def open_history():
        action('Xem chi tiết')
        dialog = page.locator('dialog.mg-vehicle-detail')
        dialog.get_by_role('tab', name='Lịch sử', exact=False).click()
        if page.viewport_size['width'] < 768:
            expect(dialog.locator('.mg-mobile-record-card').first).to_be_visible()
            if history[0]['action'] == 'transfer':
                expect(dialog.locator('.mg-mobile-card-main .mg-transfer-direction').first).to_be_visible()
                assert dialog.locator('.mg-mobile-card-detail').first.get_attribute('open') is None
            dialog.locator('.mg-mobile-card-detail summary').first.click()
        else:
            expect(dialog.locator('tbody tr').first).to_be_visible()
        return dialog

    action('Chuyển xe')
    dialog = page.get_by_role('dialog', name='Chuyển xe', exact=True)
    expect(dialog.get_by_text('Khi lưu, xe chuyển sang Chờ luân chuyển tại cơ sở đích.', exact=False)).to_be_visible()
    expect(dialog.locator('#vehicle-action-to option[value="31"]')).to_have_count(0)
    dialog.locator('#vehicle-action-to').select_option('32')
    dialog.locator('#vehicle-action-note').fill('Giao xe theo yêu cầu QA')
    dialog.get_by_role('button', name='Chuyển xe', exact=True).click()
    expect(dialog.get_by_role('alert')).to_have_text('Không lưu được thao tác xe QA.')
    expect(dialog.locator('#vehicle-action-to')).to_have_value('32')
    expect(dialog.locator('#vehicle-action-note')).to_have_value('Giao xe theo yêu cầu QA')
    assert not history and vehicle['status'] == 'ready'
    checks.append('A failed transfer preserves destination/note for retry, with no displayed success or partial state change')
    dialog.get_by_role('button', name='Chuyển xe', exact=True).click()
    expect(dialog).not_to_be_visible()
    expect(page.locator('.mg-page-vehicles')).to_contain_text('Chờ luân chuyển')
    expect(page.get_by_role('button',name='Nhận xe',exact=True)).to_be_visible()
    page.screenshot(path=str(out / 'pending-receipt.png'))
    assert vehicle['current_store_id'] == 32 and vehicle['store_id'] == 31 and len(history) == 1
    action('Chuyển xe')
    dialog = page.get_by_role('dialog', name='Chuyển xe', exact=True)
    expect(dialog.get_by_role('button', name='Chuyển xe', exact=True)).to_be_disabled()
    expect(dialog.get_by_text('Chỉ chuyển xe đang Lưu kho.', exact=True)).to_be_visible()
    dialog.get_by_role('button', name='Hủy', exact=True).click()
    checks.append('Successful transfer refreshes branch/state; a second transfer is disabled while pending')
    dialog = open_history()
    expect(dialog.locator('.mg-transfer-pending .mg-transfer-direction')).to_have_text('Cơ sở đi QA → Cơ sở đến QA')
    expect(dialog.get_by_role('button',name='Nhận xe',exact=True)).to_be_visible()
    if page.viewport_size['width'] < 768:
        expect(dialog.locator('.mg-mobile-card-main .mg-transfer-direction').first).to_have_text('Cơ sở đi QA → Cơ sở đến QA')
    visible = dialog.locator('.mg-vehicle-audit-content:visible')
    expect(visible.first).to_contain_text('Cơ sở đi QA')
    expect(visible.first).to_contain_text('Cơ sở đến QA')
    expect(visible.first).to_contain_text('Lưu kho')
    expect(visible.first).to_contain_text('Chờ luân chuyển')
    expect(dialog).to_contain_text('Người thao tác QA')
    expect(dialog).to_contain_text('16:25')
    dialog.screenshot(path=str(out / 'transfer-history.png'))
    checks.append('Vehicle history displays the original/destination branch, old/new status, operation time and actor')
    dialog.get_by_role('button',name='Nhận xe',exact=True).click()
    dialog = page.get_by_role('dialog', name='Nhận xe', exact=True)
    expect(dialog.locator('#vehicle-receive-from')).to_have_value('Cơ sở đi QA')
    expect(dialog.locator('#vehicle-receive-to')).to_have_value('Cơ sở đến QA')
    assert vehicle['status']=='in_transit' and len(history)==1
    dialog.locator('#vehicle-action-note').fill('Đã nhận xe QA')
    dialog.screenshot(path=str(out / 'receive-confirmation.png'))
    dialog.get_by_role('button', name='Xác nhận đã nhận xe', exact=True).click()
    expect(dialog.get_by_role('alert')).to_have_text('Không thể ghi nhận xe QA.')
    assert vehicle['status']=='in_transit' and len(history)==1
    expect(dialog.locator('#vehicle-action-note')).to_have_value('Đã nhận xe QA')
    dialog.get_by_role('button', name='Xác nhận đã nhận xe', exact=True).click()
    expect(dialog).not_to_be_visible()
    assert vehicle['status'] == 'ready' and vehicle['current_store_id'] == 32
    expect(page.get_by_role('button',name='Nhận xe',exact=True)).to_have_count(0)
    checks.append('Pending cards/detail expose Receive; confirmation shows the exact route, failed receipt keeps pending state, and successful receipt hides the action and logs once')
    action('Chỉnh sửa')
    dialog = page.get_by_role('dialog', name='Chỉnh sửa xe', exact=True)
    dialog.locator('#vehicle-license').fill('QA-NEW')
    dialog.locator('#vehicle-color').fill('Xanh')
    dialog.locator('#vehicle-odometer').fill('1500')
    dialog.get_by_role('button', name='Lưu xe', exact=True).click()
    expect(dialog).not_to_be_visible()
    page.reload(wait_until='networkidle')
    dialog = open_history()
    expect(dialog.locator('.mg-vehicle-audit-content:visible').first).to_contain_text('Đỏ')
    expect(dialog.locator('.mg-vehicle-audit-content:visible').first).to_contain_text('Xanh')
    expect(dialog.locator('.mg-vehicle-audit-content:visible').first).to_contain_text('1000')
    expect(dialog.locator('.mg-vehicle-audit-content:visible').first).to_contain_text('1500')
    dialog.get_by_label('Lọc hành động').select_option('transfer')
    expect(dialog).to_contain_text('QA-701')
    dialog.get_by_label('Lọc hành động').select_option('edit')
    if page.viewport_size['width'] < 768:
        expect(dialog.locator('.mg-mobile-record-card')).to_have_count(1)
    else:
        expect(dialog.locator('tbody tr')).to_have_count(1)
    checks.append('Receiving and editing produce separate filtered log entries; reload keeps history and the original transfer plate')
    dialog.get_by_label('Lọc hành động').select_option('')
    page.set_viewport_size(dict(width=320, height=812))
    first_detail=dialog.locator('.mg-mobile-card-detail').first
    if first_detail.get_attribute('open') is None:
        first_detail.locator('summary').click()
    assert dialog.evaluate('el=>el.scrollWidth<=el.clientWidth+1')
    assert not dialog.locator('table:visible').count()
    dialog.screenshot(path=str(out / 'audit-history-320.png'))
    checks.append('Audit history uses mobile cards at 320px without horizontal page/dialog overflow')
    assert not errors, errors
    browser.close()

result = dict(passed=len(checks), checks=checks, errors=errors, syntheticWrites=len(writes), realBusinessWrites=0)
(out / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
