"""Synthetic APIs intercept every business request; SSR only reads an existing QA session."""
import argparse
import json
import re
import tempfile
from pathlib import Path
from urllib.parse import urlparse
from openpyxl import Workbook, load_workbook
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3005')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='docs/qa/vehicle-import')
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
checks, errors, blocked, calls = [], [], [], []
vehicles = [{'id': 101, 'name': 'Xe có sẵn QA', 'brand': 'Honda', 'license': 'QA-00101', 'color': 'Đen',
             'type': 'xe_dien', 'year': 2025, 'store_id': 23, 'current_store_id': 23, 'status': 'using'}]
stores = [{'id': 23, 'code': 'QA-23', 'store_name': 'Cơ sở QA', 'status': 'opening'},
          {'id': 31, 'code': 'QA-31', 'store_name': 'Cơ sở QA 2', 'status': 'opening'}]
state = {'conflict': True, 'linked': True, 'slow': False}
backup_id = '11111111-1111-4111-8111-111111111111'


def mock(route):
    req = route.request
    endpoint = urlparse(req.url).path
    if endpoint == '/api/auth/vehicles/import' and req.method == 'POST':
        payload = req.post_data_json
        calls.append(payload)
        if payload['commit'] and state['conflict']:
            state['conflict'] = False
            route.fulfill(status=409, json={'status': 'error', 'message': 'Xe đã thay đổi. Kiểm tra lại trước khi nhập.'})
            return
        rows = []
        for item in payload['rows']:
            v = dict(item['values'])
            source = v['store'].removeprefix('Cơ sở cũ #') if payload['skipUnknownStores'] else v['store']
            store = next((s for s in stores if source in [str(s['id']), s['store_name'], s['code']]), None)
            old = next((row for row in vehicles if row['license'] == v['license']), None)
            action = 'update' if payload['mode'] == 'sync' and old else 'insert'
            skipped = payload['skipUnknownStores'] and not store and bool(source)
            row_errors = list(item.get('errors', []))
            warnings = list(item.get('warnings', []))
            if not skipped:
                if not store and action != 'update':
                    row_errors.append('Chưa khớp cơ sở.')
                if v['color'].isdigit():
                    row_errors.append('Màu sắc đang là số.')
                if action == 'update':
                    warnings.append('Giữ ID, cơ sở, trạng thái và dữ liệu giá hiện có của xe.')
            else:
                row_errors = ['Bỏ qua: cơ sở trong file không nằm trong danh sách hiện có.']
                warnings = []
            rows.append({'rowNumber': item['rowNumber'], 'values': v, 'state': 'skipped' if skipped else 'invalid' if row_errors else 'valid',
                         'action': action, 'targetId': old['id'] if old else int(v['id']) if v['id'] else None,
                         'storeId': store['id'] if store else None, 'errors': row_errors, 'warnings': warnings})
        eligible = [r for r in rows if r['state'] != 'skipped']
        references = [{'table': 'order_vehicle_details', 'column': 'vehicle_id', 'count': 1}] if payload['mode'] == 'replace' and state['linked'] else []
        data = {'rows': rows, 'total': len(rows), 'valid': sum(r['state'] == 'valid' for r in rows),
                'invalid': sum(r['state'] == 'invalid' for r in rows), 'skipped': sum(r['state'] == 'skipped' for r in rows),
                'inserted': sum(r['action'] == 'insert' for r in eligible), 'updated': sum(r['action'] == 'update' for r in eligible),
                'blankColors': sum(not r['values']['color'] for r in eligible), 'existing': len(vehicles), 'retained': 0,
                'revision': 'a' * 64, 'blocking': ['Không thể xóa / thay toàn bộ xe vì còn hợp đồng hoặc dữ liệu liên quan.'] if references else [],
                'references': references, 'committed': payload['commit']}
        if payload['commit']:
            assert not data['invalid'] and not data['blocking']
            assert payload['acceptWarnings'] and payload['revision'] == 'a' * 64
            for row in eligible:
                values = row['values']
                existing = next((v for v in vehicles if v['id'] == row['targetId']), None)
                if existing:
                    existing['color'] = values['color']
                else:
                    vehicles.append({**values, 'id': row['targetId'], 'store_id': row['storeId']})
            data['backupId'] = backup_id
        route.fulfill(status=201 if payload['commit'] else 200, json={'status': 'success', 'data': data})
    elif endpoint == '/api/auth/vehicles/reset':
        calls.append({'reset': req.method})
        if req.method == 'DELETE':
            assert not state['linked']
            assert req.post_data_json['confirmation'] == 'XÓA HẾT XE'
            count = len(vehicles)
            vehicles.clear()
            data = {'removed': count, 'backupId': backup_id}
        else:
            data = {'total': len(vehicles), 'revision': 'a' * 64,
                    'references': [{'table': 'order_vehicle_details', 'column': 'vehicle_id', 'count': 1}] if state['linked'] else [],
                    'blocking': ['Không thể xóa / thay toàn bộ xe vì còn hợp đồng hoặc dữ liệu liên quan.'] if state['linked'] else []}
        route.fulfill(json={'status': 'success', 'data': data})
    elif endpoint.startswith('/api/auth/vehicles/backups/'):
        route.fulfill(json={'id': backup_id, 'row_count': 1, 'payload': []}, headers={'Content-Disposition': 'attachment; filename="QA-backup.json"'})
    elif req.method == 'GET':
        if endpoint == '/api/session':
            route.fulfill(json={'user': {'id': 143, 'name': 'QA'}})
        else:
            data = stores if endpoint == '/api/auth/stores' else vehicles if endpoint == '/api/auth/vehicle/vehicles' else []
            route.fulfill(json={'status': 'success', 'data': data})
    else:
        blocked.append(endpoint)
        route.abort('blockedbyclient')


with tempfile.TemporaryDirectory(prefix='himoto-vehicle-ui-') as temp, sync_playwright() as p:
    temp = Path(temp)
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True, reduced_motion='reduce')
    context.add_cookies([{'name': 'himoto_management_session', 'value': Path(args.session_cookie_file).read_text().strip(), 'url': args.url, 'httpOnly': True, 'sameSite': 'Strict'}])
    context.route('**/api/**', mock)
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    try:
        page.goto(args.url + '/vehicles', wait_until='domcontentloaded', timeout=120000)
        expect(page.get_by_role('columnheader', name='Sắp xếp theo Màu sắc', exact=True)).to_be_visible(timeout=30000)
        expect(page.get_by_role('cell', name='Đen', exact=True)).to_be_visible()
        expect(page.get_by_role('cell', name='Xe điện', exact=True)).to_be_visible()
        page.add_style_tag(content='.mg-user-menu strong { visibility: hidden !important; }')
        page.screenshot(path=str(output / 'vehicles-1440.png'), full_page=True)
        checks.append('vehicle table renders DB color and electric type label')
        with page.expect_download(timeout=30000) as event:
            page.get_by_role('button', name='Tải mẫu Excel', exact=True).click()
        template = temp / 'template.xlsx'
        event.value.save_as(template)
        book = load_workbook(template)
        assert book['Xe']['G1'].value == 'Màu sắc'
        assert book['Xe']['F2'].number_format == '@'
        assert book['Xe']['H2'].number_format == '@'
        assert book['Cơ sở']['C2'].value == 'Cơ sở QA'
        assert book['Xe']['A2'].value is None
        checks.append('downloaded template has color, text plate/chassis and current branch dropdown without fake data')

        book = Workbook()
        sheet = book.active
        sheet.title = 'Worksheet'
        sheet.append(['Tên', 'Brand', 'Loại xe', 'Đời xe', 'Biển số', 'Màu sắc', 'Cửa hàng', 'Giá mua', 'Giá bán', 'Trạng thái', 'Ngày tạo'])
        for id_, store, color in [(101, 23, 'Đỏ'), (105, 23, 'Xanh'), (110, 4, 4)]:
            sheet.append([id_, f'Xe QA {id_}', 'Honda', 'xega', 2025, store, f'QA-{id_:05d}', '00123', '00456', 'ready', None, None, None, 143, '2026-01-01', '2026-01-02', color, 2, 0, 0, 123])
        filename = temp / 'Kho-xe-QA.xlsx'
        book.save(filename)
        page.get_by_role('button', name='Nhập / Đồng bộ Excel', exact=True).click()
        dialog = page.get_by_role('dialog', name='Nhập / Đồng bộ xe từ Excel', exact=True)
        dialog.locator('input[type=file]').set_input_files(filename)
        expect(dialog.get_by_role('button', name='Đồng bộ 3 xe', exact=True)).to_be_disabled(timeout=30000)
        assert calls[-1]['rows'][0]['values']['license'] == 'QA-00101'
        assert calls[-1]['rows'][0]['values']['color'] == 'Đỏ'
        dialog.get_by_label('Chỉ nhận cơ sở hiện có;', exact=False).check()
        dialog.get_by_role('button', name='Kiểm tra lại', exact=True).click()
        expect(dialog.get_by_role('button', name='Đồng bộ 2 xe', exact=True)).to_be_disabled()
        expect(dialog.locator('td strong').filter(has_text=re.compile('^Bỏ qua$'))).to_be_visible()
        with page.expect_download(timeout=30000) as event:
            dialog.get_by_role('button', name='Tải file đã khớp cột', exact=True).click()
        normalized = temp / 'normalized.xlsx'
        event.value.save_as(normalized)
        aligned = load_workbook(normalized)['Xe']
        assert aligned['F2'].value == 'QA-00101' and aligned['G2'].value == 'Đỏ'
        assert aligned['J2'].value == '23' and aligned['H2'].value == '00123'
        assert aligned['A4'].value is None
        page.screenshot(path=str(output / 'preview-1440.png'), full_page=True)
        checks.append('legacy parsing aligns fields, shows ignored extras, requires branch decision and exports only selected eligible rows with leading zeros')

        dialog.get_by_label('Tôi đã đối chiếu các cảnh báo;', exact=False).check()
        dialog.get_by_role('button', name='Đồng bộ 2 xe', exact=True).click()
        expect(dialog.get_by_role('alert')).to_contain_text('Xe đã thay đổi')
        expect(dialog.get_by_role('button', name='Đồng bộ 0 xe', exact=True)).to_be_disabled()
        dialog.get_by_role('button', name='Kiểm tra lại', exact=True).click()
        expect(dialog.get_by_role('button', name='Đồng bộ 2 xe', exact=True)).to_be_disabled()
        dialog.get_by_label('Tôi đã đối chiếu các cảnh báo;', exact=False).check()
        dialog.get_by_role('button', name='Đồng bộ 2 xe', exact=True).click()
        expect(dialog.get_by_text('Đã cập nhật 1 xe, thêm 1 xe.', exact=False)).to_be_visible()
        with page.expect_download() as event:
            dialog.get_by_role('button', name='Tải bản sao lưu trước thay đổi').click()
        event.value.save_as(temp / 'backup.json')
        assert json.loads((temp / 'backup.json').read_text())['id'] == backup_id
        dialog.get_by_role('button', name='Đóng', exact=True).click()
        expect(page.get_by_role('cell', name='Đỏ', exact=True)).to_be_visible()
        assert len(vehicles) == 2
        checks.append('409 conflict requires fresh preview/warning consent; successful sync refreshes table and exposes downloadable durable backup')

        page.get_by_role('button', name='Xóa hết', exact=True).click()
        reset = page.get_by_role('dialog', name='Xóa hết dữ liệu xe', exact=True)
        expect(reset.get_by_role('alert')).to_contain_text('Không thể xóa')
        expect(reset.get_by_role('button', name='Xóa hết xe', exact=True)).to_be_disabled()
        page.screenshot(path=str(output / 'reset-blocked-1440.png'), full_page=True)
        page.keyboard.press('Escape')
        expect(reset).not_to_be_visible()
        assert not any(c.get('reset') == 'DELETE' for c in calls)
        checks.append('reset discovers relationships and disables deletion before any DELETE request; Escape restores focus')

        page.get_by_role('button', name='Nhập / Đồng bộ Excel', exact=True).click()
        dialog = page.get_by_role('dialog', name='Nhập / Đồng bộ xe từ Excel', exact=True)
        dialog.get_by_label('Cách nhập', exact=True).select_option('replace')
        dialog.locator('input[type=file]').set_input_files(filename)
        expect(dialog.get_by_role('alert').filter(has_text='Không thể xóa')).to_be_visible()
        expect(dialog.get_by_role('button', name='Thay toàn bộ 3 xe', exact=True)).to_be_disabled()
        page.keyboard.press('Escape')
        checks.append('replace mode remains blocked by history even if the file was selected')

        page.set_viewport_size({'width': 375, 'height': 812})
        page.get_by_role('button', name='Nhập / Đồng bộ Excel', exact=True).click()
        dialog = page.get_by_role('dialog', name='Nhập / Đồng bộ xe từ Excel', exact=True)
        dialog.locator('input[type=file]').set_input_files(filename)
        expect(dialog.get_by_role('button', name='Đồng bộ 3 xe', exact=True)).to_be_disabled()
        page.screenshot(path=str(output / 'preview-375.png'), full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert dialog.evaluate('(e) => e.scrollWidth <= e.clientWidth + 1')
        page.keyboard.press('Escape')
        checks.append('375px layout keeps file controls, branch mapping and preview within the dialog without page overflow')

        state['linked'] = False
        page.get_by_role('button', name='Xóa hết', exact=True).click()
        reset = page.get_by_role('dialog', name='Xóa hết dữ liệu xe', exact=True)
        expect(reset.get_by_label('Nhập XÓA HẾT XE để xác nhận')).to_be_visible()
        expect(reset.get_by_role('button', name='Xóa hết xe', exact=True)).to_be_disabled()
        reset.get_by_label('Nhập XÓA HẾT XE để xác nhận').fill('XÓA HẾT XE')
        reset.get_by_role('button', name='Xóa hết xe', exact=True).click()
        expect(reset.get_by_text('Đã xóa dữ liệu xe.', exact=True)).to_be_visible()
        expect(reset.get_by_role('button', name='Tải bản sao lưu trước thay đổi')).to_be_visible()
        checks.append('unlinked reset requires exact confirmation, refreshes table and shows backup link (synthetic only)')
        assert not errors, errors
        assert not blocked, blocked
        report = {'passed': len(checks), 'checks': checks, 'pageErrors': errors, 'unexpectedRequests': blocked,
                  'businessWrites': 0, 'syntheticCommitCalls': sum(c.get('commit', False) for c in calls)}
        (output / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(report, ensure_ascii=False))
    except Exception:
        page.screenshot(path=str(output / 'failure.png'), full_page=True)
        raise
    finally:
        context.close()
        browser.close()
