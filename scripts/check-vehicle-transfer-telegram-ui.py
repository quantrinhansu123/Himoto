"""Regular transfer/receipt previews with intercepted APIs; no real writes or Telegram calls."""
import argparse
import copy
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3021')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--browser', choices=['chromium', 'webkit'], default='chromium')
parser.add_argument('--output', default='.backups/regular-transfer-telegram/ui')
args = parser.parse_args()
out = Path(args.output) / args.browser
out.mkdir(parents=True, exist_ok=True)
expect.set_options(timeout=20000)
checks, errors, unexpected, writes = [], [], [], []
fail_preview = False
stores = [dict(id=1, store_name='Cơ sở đi QA', kind='physical', status='opening'), dict(id=2, store_name='Cơ sở nhận QA', kind='physical', status='opening')]
vehicle = dict(id=101, name='Xe thường QA', license='QA-101', store_id=1, current_store_id=1, status='ready', store_name=stores[0]['store_name'], type='xeso')
rows = [dict(id=event, vehicle_id=101, telegram_event_id=event, license='QA-101', vehicle_name=vehicle['name'], from_store_id=1, to_store_id=2,
    from_store=stores[0]['store_name'], to_store=stores[1]['store_name'], action=action, label=label, at='2026-10-21T09:14:13Z', actor='Nhân viên QA', note='', changes=[])
    for event, action, label in [(700, 'transfer', 'Chuyển xe'), (701, 'receive', 'Nhận xe')]]
states = {row['id']: dict(eligible=True, event_id=row['id'], vehicle_id=101, destination_label='Nhóm cơ sở Cơ sở đi QA · Nhóm cơ sở Cơ sở nhận QA',
    text=f"{'ĐIỀU CHUYỂN XE' if row['action'] == 'transfer' else 'ĐÃ NHẬN XE'}\nBsx: QA-101\nCơ sở chuyển đi: Cơ sở đi QA\nCơ sở nhận: Cơ sở nhận QA",
    status=None, can_send=True, message_count=0) for row in rows}


def mock(route):
    global fail_preview
    req = route.request
    path = urlparse(req.url).path.rstrip('/')
    if path == '/api/session':
        route.fulfill(json=dict(user=dict(name='Nhân viên QA')))
        return
    if path.startswith('/api/auth/vehicles/101/transfers/') and path.endswith('/telegram'):
        event = int(path.split('/')[-2])
        if req.method == 'POST':
            assert req.post_data_json == dict(action='send') and states[event]['can_send']
            writes.append(f'send-{event}')
            states[event].update(status='sent', can_send=False, message_count=2)
        elif fail_preview:
            fail_preview = False
            route.fulfill(status=503, json=dict(status='error', message='Lỗi tải thông báo QA'))
            return
        data = copy.deepcopy(states[event])
    elif path == '/api/auth/vehicles/101/actions' and req.method == 'POST':
        assert req.post_data_json['action'] == 'transfer' and req.post_data_json['to_store_id'] == '2'
        writes.append('transfer')
        vehicle.update(store_id=2, current_store_id=2, status='in_transit', store_name=stores[1]['store_name'])
        data = dict(id=101, event_id=700, telegram_event_id=700)
    elif path == '/api/auth/gps/refresh':
        data = []
    elif req.method != 'GET':
        unexpected.append(req.method + ' ' + path)
        route.abort()
        return
    elif path == '/api/auth/vehicles/transfers':
        data = dict(rows=rows, total=2, page=1, size=25)
    else:
        data = {'/api/auth/stores': stores, '/api/auth/store-directory': stores, '/api/auth/vehicle/vehicles': [vehicle],
            '/api/auth/customers': [], '/api/auth/order/car-rental': [], '/api/auth/hr/staff': [],
            '/api/auth/gps': [], '/api/auth/payment-events': [], '/api/auth/record-photos/vehicles/101': []}.get(path)
    if data is None:
        unexpected.append(req.method + ' ' + path)
        route.abort()
    else:
        route.fulfill(json=dict(status='success', data=data))


with sync_playwright() as p:
    browser = getattr(p, args.browser).launch()
    context = browser.new_context(viewport=dict(width=1440, height=1000), timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
    context.add_cookies([dict(name='himoto_management_session', value=Path(args.session_cookie_file).read_text().strip(), url=args.url, httpOnly=True, sameSite='Strict')])
    context.route('**/api/**', mock)
    context.route('https://api.telegram.org/**', lambda route: route.abort())
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url + '/vehicles', wait_until='networkidle')
    page.get_by_role('button', name='Chuyển xe', exact=True).click()
    move = page.get_by_role('dialog', name='Chuyển xe', exact=True)
    move.locator('#vehicle-action-vehicle').fill('QA-101 — Xe thường QA')
    move.locator('#vehicle-action-to').select_option('2')
    move.get_by_role('button', name='Chuyển xe', exact=True).click()
    saved = page.get_by_role('dialog', name='Đã chuyển xe · Tải ảnh', exact=True)
    expect(saved.get_by_text('Nơi nhận: ' + states[700]['destination_label'], exact=True)).to_be_visible()
    expect(saved.get_by_role('button', name='Gửi thông tin Telegram', exact=True)).to_be_enabled()
    assert writes == ['transfer']
    saved.get_by_role('button', name='Đóng', exact=True).click()
    assert writes == ['transfer']
    checks.append('Saving a regular transfer opens photo upload and both branch destinations; closing the preview queues no Telegram')

    for width in [1440, 390]:
        page.set_viewport_size(dict(width=width, height=900))
        page.goto(args.url + '/vehicles/transfers', wait_until='networkidle')
        if width < 768:
            page.locator('.mg-mobile-card-detail summary').first.click()
        page.get_by_role('button', name='Telegram lượt chuyển/nhận', exact=True).first.click()
        dialog = page.get_by_role('dialog', name='Telegram · Điều chuyển xe', exact=True)
        expect(dialog.locator('.mg-telegram-preview')).to_contain_text('ĐIỀU CHUYỂN XE\n')
        assert 'SỞ HỮU' not in dialog.inner_text()
        expect(dialog.get_by_text('Nơi nhận: ' + states[700]['destination_label'], exact=True)).to_be_visible()
        dialog.get_by_role('button', name='Làm mới trạng thái', exact=True).click()
        expect(dialog.get_by_role('button', name='Gửi thông tin Telegram', exact=True)).to_be_enabled()
        assert writes == ['transfer']
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        dialog.screenshot(path=str(out / f'regular-preview-{width}.png'))
        if width == 1440:
            dialog.get_by_role('button', name='Đóng', exact=True).click()
    checks.append('Historical regular transfers reopen on desktop and mobile with accurate titles and both branch groups; refresh sends nothing')

    fail_preview = True
    dialog.get_by_role('button', name='Làm mới trạng thái', exact=True).click()
    expect(dialog.get_by_role('alert')).to_have_text('Lỗi tải thông báo QA')
    dialog.get_by_role('button', name='Làm mới trạng thái', exact=True).click()
    expect(dialog.get_by_role('alert')).to_have_count(0)
    for status in ['unknown', 'pending', 'sending']:
        states[700].update(status=status, can_send=False)
        dialog.get_by_role('button', name='Làm mới trạng thái', exact=True).click()
        expect(dialog.get_by_role('button', name='Gửi thông tin Telegram' if status == 'unknown' else 'Đang gửi Telegram', exact=True)).to_be_disabled()
    assert writes == ['transfer']
    checks.append('Preview failures recover; uncertain, pending and sending states prevent repeat sends')
    states[700].update(status=None, can_send=False)
    dialog.get_by_role('button', name='Làm mới trạng thái', exact=True).click()
    expect(dialog.get_by_role('button', name='Gửi thông tin Telegram', exact=True)).to_be_disabled()
    states[700].update(can_send=True)
    dialog.get_by_role('button', name='Làm mới trạng thái', exact=True).click()
    dialog.get_by_role('button', name='Gửi thông tin Telegram', exact=True).click()
    expect(dialog.get_by_role('button', name='Đã gửi Telegram', exact=True)).to_be_disabled()
    assert writes == ['transfer', 'send-700']
    dialog.get_by_role('button', name='Đóng', exact=True).click()
    page.get_by_role('button', name='Telegram lượt chuyển/nhận', exact=True).first.click()
    expect(page.get_by_role('dialog').get_by_role('button', name='Đã gửi Telegram', exact=True)).to_be_disabled()
    page.get_by_role('dialog').get_by_role('button', name='Đóng', exact=True).click()
    checks.append('Read-only viewers cannot send; one explicit submit locks the event even after reopening')
    page.set_viewport_size(dict(width=1440, height=1000))
    page.get_by_role('button', name='Telegram lượt chuyển/nhận', exact=True).nth(1).click()
    dialog = page.get_by_role('dialog', name='Telegram · Điều chuyển xe', exact=True)
    expect(dialog.locator('.mg-telegram-preview')).to_contain_text('ĐÃ NHẬN XE\n')
    dialog.get_by_role('button', name='Gửi thông tin Telegram', exact=True).click()
    expect(dialog.get_by_role('button', name='Đã gửi Telegram', exact=True)).to_be_disabled()
    assert writes == ['transfer', 'send-700', 'send-701']
    checks.append('Receipt uses its own message and send state, independently from the preceding transfer')
    assert not errors and not unexpected, (errors, unexpected)
    browser.close()

result = dict(passed=len(checks), browser=args.browser, checks=checks, javascriptErrors=errors, unexpectedRequests=unexpected, realBusinessWrites=0, realTelegramRequests=0)
(out / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
