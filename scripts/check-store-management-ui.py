"""Store edit/delete UI checks. Synthetic API data; no real business writes."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3004')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='docs/qa/stores')
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
checks, errors, unexpected, writes = [], [], [], []
stores = [
    {'id': 2, 'code': 'CS-QA-2', 'store_name': 'Cơ sở có dữ liệu QA', 'store_phone': '0900000001', 'store_address': 'Địa chỉ QA', 'user_id': 8, 'manager_name': 'Người phụ trách QA', 'status': 'opening', 'store_revision': 'revision-1', 'vehicle_count': 3, 'staff_count': 2},
    {'id': 3, 'code': 'CS-QA-3', 'store_name': 'Cơ sở trống QA', 'store_phone': '', 'store_address': '', 'user_id': None, 'manager_name': '', 'status': 'opening', 'store_revision': 'revision-1', 'vehicle_count': 0, 'staff_count': 0},
]
mode = {'next': ''}

def mock_api(route):
    request = route.request
    endpoint = urlparse(request.url).path
    if endpoint == '/api/auth/stores/managers':
        if mode['next'] == 'manager-error':
            mode['next'] = ''
            route.fulfill(status=500, json={'status': 'error', 'message': 'Không tải được danh sách người phụ trách.'})
        else:
            route.fulfill(json={'status': 'success', 'data': [{'id': 8, 'name': 'Người phụ trách QA'}, {'id': 9, 'name': 'Người phụ trách mới QA'}]})
    elif endpoint == '/api/auth/stores' and request.method == 'POST':
        body = request.post_data_json
        writes.append({'method': 'POST', 'path': endpoint, 'body': body})
        assert set(body) == {'name', 'phone', 'address', 'status', 'user_id', 'code', 'kind'}
        if mode['next'] == 'offline':
            mode['next'] = ''
            route.abort('failed')
            return
        if mode['next'] == 'create-conflict':
            mode['next'] = ''
            route.fulfill(status=409, json={'status': 'error', 'message': 'Tên hoặc mã cơ sở này đã có trong danh sách.'})
            return
        store_id = max(item['id'] for item in stores) + 1
        store = {'id': store_id, 'code': body['code'] or f'CS-{store_id:03}', 'store_name': body['name'], 'store_phone': body['phone'], 'store_address': body['address'], 'user_id': body['user_id'], 'manager_name': 'Người phụ trách mới QA' if body['user_id'] == 9 else '', 'status': 'opening' if body['status'] == 'active' else 'inactive', 'kind': body['kind'], 'store_revision': 'revision-1', 'vehicle_count': 0, 'staff_count': 0}
        stores.append(store)
        route.fulfill(status=201, json={'status': 'success', 'data': store})
    elif endpoint.startswith('/api/auth/stores/') and request.method in ['PATCH', 'DELETE']:
        writes.append({'method': request.method, 'path': endpoint, 'body': request.post_data_json if request.method == 'PATCH' else None})
        if mode['next'] == 'offline':
            mode['next'] = ''
            route.abort('failed')
            return
        if mode['next'] == 'conflict':
            mode['next'] = ''
            route.fulfill(status=409, json={'status': 'error', 'message': 'Cơ sở đã được người khác cập nhật. Nhấn Làm mới và mở lại để sửa.'})
            return
        store = next(item for item in stores if str(item['id']) == endpoint.rsplit('/', 1)[-1])
        if request.method == 'DELETE':
            if store['id'] == 2:
                route.fulfill(status=409, json={'status': 'error', 'message': 'Không thể xóa cơ sở vì còn dữ liệu liên quan: xe, nhân sự, đơn thuê. Có thể chọn Tạm ngừng để giữ lịch sử.'})
            else:
                stores.remove(store)
                route.fulfill(json={'status': 'success', 'data': None})
        else:
            body = request.post_data_json
            assert set(body) == {'name', 'phone', 'address', 'status', 'user_id', 'revision'}
            store.update({'store_name': body['name'], 'store_phone': body['phone'], 'store_address': body['address'], 'user_id': body['user_id'], 'manager_name': 'Người phụ trách mới QA' if body['user_id'] == 9 else 'Người phụ trách QA', 'status': 'opening' if body['status'] == 'active' else 'inactive', 'store_revision': 'revision-2'})
            route.fulfill(json={'status': 'success', 'data': store})
    elif request.method == 'GET':
        if endpoint == '/api/session':
            route.fulfill(json={'user': {'id': 143, 'name': 'QA'}})
            return
        route.fulfill(json={'status': 'success', 'data': stores if endpoint == '/api/auth/stores' else []})
    else:
        unexpected.append(endpoint)
        route.abort('blockedbyclient')

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    context.add_cookies([{'name': 'himoto_management_session', 'value': Path(args.session_cookie_file).read_text(encoding='utf-8').strip(), 'url': args.url, 'httpOnly': True, 'sameSite': 'Strict'}])
    context.route('**/api/**', mock_api)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto(args.url + '/stores', wait_until='domcontentloaded', timeout=120000)
        expect(page.get_by_role('button', name='Sửa CS-QA-2', exact=True)).to_be_visible(timeout=30000)
        expect(page.get_by_role('button', name='Xóa Cơ sở có dữ liệu QA', exact=True)).to_be_visible()
        expect(page.locator('.mg-table tbody').get_by_text('Hoạt động', exact=True)).to_have_count(2)
        page.add_style_tag(content='.mg-user-menu strong { visibility: hidden !important; }')
        page.screenshot(path=str(output / 'actions-1440.png'), full_page=True)
        checks.append('stores table has view/edit/delete actions and legacy opening status displays as Hoạt động')

        page.get_by_role('button', name='Sửa CS-QA-2', exact=True).click()
        dialog = page.get_by_role('dialog')
        expect(dialog.get_by_role('button', name='Lưu cơ sở', exact=True)).to_be_enabled()
        expect(dialog.get_by_label('Người phụ trách', exact=True)).to_have_value('8')
        assert dialog.get_by_label('Email', exact=True).count() == 0
        assert dialog.get_by_label('Ghi chú', exact=True).count() == 0
        dialog.get_by_label('Tên cơ sở', exact=False).fill('')
        dialog.get_by_role('button', name='Lưu cơ sở', exact=True).click()
        expect(dialog.get_by_text('Nhập tên cơ sở.', exact=True)).to_be_visible()
        assert not writes
        dialog.get_by_label('Tên cơ sở', exact=False).fill('Cơ sở đã sửa QA')
        dialog.get_by_label('Số điện thoại', exact=True).fill('0900000009')
        dialog.get_by_label('Địa chỉ', exact=True).fill('Địa chỉ đã sửa QA')
        dialog.get_by_label('Người phụ trách', exact=True).select_option('9')
        dialog.get_by_label('Trạng thái', exact=True).select_option('inactive')
        page.screenshot(path=str(output / 'edit-1440.png'), full_page=True)
        dialog.get_by_role('button', name='Lưu cơ sở', exact=True).click()
        expect(dialog).to_have_count(0)
        expect(page.locator('.mg-table tbody').get_by_text('Cơ sở đã sửa QA', exact=True)).to_be_visible()
        expect(page.locator('.mg-table tbody').get_by_text('Tạm ngừng', exact=True)).to_be_visible()
        expect(page.get_by_label('Cơ sở đang xem', exact=True).locator('option').filter(has_text='Cơ sở đã sửa QA')).to_have_count(1)
        assert writes[-1]['body']['user_id'] == 9 and writes[-1]['body']['revision'] == 'revision-1'
        checks.append('edit validates before request, loads real manager choices, sends schema-backed fields and refreshes row/branch selector after save (mock write)')

        page.get_by_role('button', name='Xóa Cơ sở đã sửa QA', exact=True).click()
        dialog.get_by_role('button', name='Xóa cơ sở', exact=True).click()
        expect(dialog.get_by_role('alert')).to_contain_text('Không thể xóa cơ sở')
        expect(page.locator('.mg-title-count')).to_have_text('2')
        page.screenshot(path=str(output / 'delete-blocked-1440.png'), full_page=True)
        dialog.get_by_role('button', name='Hủy', exact=True).click()
        checks.append('delete requires confirmation and dependency rejection retains the store with an explicit reason')

        page.set_viewport_size({'width': 375, 'height': 900})
        page.wait_for_function('innerWidth === 375 && matchMedia("(max-width: 600px)").matches')
        page.get_by_role('button', name='Sửa CS-QA-2', exact=True).click()
        expect(dialog.get_by_role('button', name='Lưu cơ sở', exact=True)).to_be_enabled()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        rect = dialog.bounding_box()
        assert rect['x'] >= 0 and rect['x'] + rect['width'] <= 375
        for _ in range(12):
            page.keyboard.press('Tab')
            assert dialog.evaluate('(node) => node.contains(document.activeElement)')
        page.screenshot(path=str(output / 'edit-375.png'), full_page=True)
        mode['next'] = 'conflict'
        dialog.get_by_role('button', name='Lưu cơ sở', exact=True).click()
        expect(dialog.get_by_role('alert')).to_contain_text('được người khác cập nhật')
        expect(dialog.get_by_label('Tên cơ sở', exact=False)).to_have_value('Cơ sở đã sửa QA')
        dialog.get_by_role('button', name='Hủy', exact=True).click()
        checks.append('mobile edit stays in viewport, traps keyboard focus and retains entered data on a stale revision conflict')

        mode['next'] = 'manager-error'
        page.get_by_role('button', name='Sửa CS-QA-2', exact=True).click()
        expect(dialog.get_by_role('alert')).to_contain_text('Không tải được danh sách người phụ trách')
        expect(dialog.get_by_role('button', name='Lưu cơ sở', exact=True)).to_be_disabled()
        dialog.get_by_role('button', name='Tải lại người phụ trách', exact=True).click()
        expect(dialog.get_by_role('button', name='Lưu cơ sở', exact=True)).to_be_enabled()
        dialog.get_by_role('button', name='Hủy', exact=True).click()
        checks.append('manager lookup failure disables saving and provides working retry')

        page.get_by_label('Cơ sở đang xem', exact=True).select_option('3')
        page.get_by_role('button', name='Xóa Cơ sở trống QA', exact=True).click()
        mode['next'] = 'offline'
        dialog.get_by_role('button', name='Xóa cơ sở', exact=True).click()
        expect(dialog.get_by_role('alert')).to_be_visible()
        expect(page.locator('.mg-title-count')).to_have_text('1')
        dialog.get_by_role('button', name='Xóa cơ sở', exact=True).click()
        expect(dialog).to_have_count(0)
        expect(page.get_by_label('Cơ sở đang xem', exact=True)).to_have_value('all')
        expect(page.locator('.mg-title-count')).to_have_text('1')
        expect(page.get_by_role('button', name='Sửa CS-QA-3', exact=True)).to_have_count(0)
        checks.append('unused store deletion handles network failure, removes row on success and resets selected branch (mock write)')

        page.get_by_role('button', name='Thêm cơ sở', exact=True).click()
        expect(dialog.get_by_role('heading', name='Thêm cơ sở', exact=True)).to_be_visible()
        expect(dialog.get_by_role('button', name='Tạo cơ sở', exact=True)).to_be_enabled()
        expect(dialog.get_by_label('Mã cơ sở', exact=True)).to_have_value('')
        expect(dialog.get_by_label('Loại cơ sở', exact=True)).to_have_value('physical')
        expect(dialog.get_by_label('Trạng thái', exact=True)).to_have_value('active')
        expect(dialog.get_by_label('Người phụ trách', exact=True)).to_have_value('')
        previous_writes = len(writes)
        dialog.get_by_role('button', name='Tạo cơ sở', exact=True).click()
        expect(dialog.get_by_text('Nhập tên cơ sở.', exact=True)).to_be_visible()
        assert len(writes) == previous_writes
        dialog.get_by_label('Tên cơ sở', exact=False).fill('Cơ sở mới QA')
        dialog.get_by_label('Mã cơ sở', exact=True).fill('mã sai')
        dialog.get_by_role('button', name='Tạo cơ sở', exact=True).click()
        expect(dialog.locator('#store-create-code-error')).to_be_visible()
        assert len(writes) == previous_writes
        dialog.get_by_label('Mã cơ sở', exact=True).fill('qa-new')
        dialog.get_by_label('Số điện thoại', exact=True).fill('0900000010')
        dialog.get_by_label('Địa chỉ', exact=True).fill('Địa chỉ cơ sở mới QA')
        dialog.get_by_label('Người phụ trách', exact=True).select_option('9')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        rect = dialog.bounding_box()
        assert rect['x'] >= 0 and rect['x'] + rect['width'] <= 375
        page.screenshot(path=str(output / 'create-375.png'), full_page=True)
        mode['next'] = 'create-conflict'
        dialog.get_by_role('button', name='Tạo cơ sở', exact=True).click()
        expect(dialog.get_by_role('alert')).to_contain_text('Tên hoặc mã cơ sở này đã có')
        expect(dialog.get_by_label('Tên cơ sở', exact=False)).to_have_value('Cơ sở mới QA')
        assert writes[-1]['body']['code'] == 'QA-NEW'
        mode['next'] = 'offline'
        dialog.get_by_role('button', name='Tạo cơ sở', exact=True).click()
        expect(dialog.get_by_role('alert')).to_contain_text('Không kết nối được hệ thống')
        expect(dialog.get_by_label('Mã cơ sở', exact=True)).to_have_value('qa-new')
        checks.append('mobile add dialog defaults to active physical branch, validates name/code without writes and retains input after duplicate/network errors')

        page.set_viewport_size({'width': 1440, 'height': 1000})
        page.wait_for_function("getComputedStyle(document.querySelector('.mg-dialog')).maxWidth === '1408px'")
        page.screenshot(path=str(output / 'create-1440.png'), full_page=True)
        dialog.get_by_role('button', name='Tạo cơ sở', exact=True).click()
        expect(dialog).to_have_count(0)
        expect(page.locator('.mg-title-count')).to_have_text('2')
        expect(page.get_by_role('button', name='Sửa QA-NEW', exact=True)).to_be_visible()
        expect(page.get_by_label('Cơ sở đang xem', exact=True).locator('option').filter(has_text='Cơ sở mới QA')).to_have_count(1)
        assert writes[-1]['body']['user_id'] == 9
        checks.append('successful create POST adds the new store to table and branch selector with real returned ID/code (mock write)')

        page.get_by_label('Cơ sở đang xem', exact=True).select_option('2')
        page.get_by_role('searchbox').fill('no-match-qa')
        page.get_by_role('button', name='Thêm cơ sở', exact=True).click()
        expect(dialog.get_by_role('button', name='Tạo cơ sở', exact=True)).to_be_enabled()
        dialog.get_by_label('Tên cơ sở', exact=False).fill('Kho thuê mua mới QA')
        dialog.get_by_label('Loại cơ sở', exact=True).select_option('lease_to_own')
        dialog.get_by_role('button', name='Tạo cơ sở', exact=True).click()
        expect(dialog).to_have_count(0)
        expect(page.get_by_role('button', name='Sửa CS-004', exact=True)).to_be_visible()
        expect(page.get_by_label('Cơ sở đang xem', exact=True)).to_have_value('all')
        expect(page.get_by_role('searchbox')).to_have_value('')
        assert writes[-1]['body']['code'] == '' and writes[-1]['body']['kind'] == 'lease_to_own'
        checks.append('blank code supports automatic assignment, lease-to-own kind is saved and filters reset so the created store is visible (mock write)')
        assert not errors, errors
        assert not unexpected, unexpected
    finally:
        result = {'passed': len(checks), 'checks': checks, 'javascriptErrors': errors, 'unexpectedWritesBlocked': unexpected, 'realBusinessWrites': 0, 'dataSource': 'synthetic API responses; server layout authentication reads existing QA account only'}
        (output / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False))
        browser.close()
