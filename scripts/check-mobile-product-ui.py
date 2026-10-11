"""Mobile dialogs and secondary lists. All business APIs, including Excel previews, are mocked."""
import argparse
import json
import subprocess
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3101')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='docs/qa/mobile-product')
parser.add_argument('--only-excel', action='store_true', help='Run only the Excel preview checks while diagnosing fixtures')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
fixtures = Path('.backups/mobile/product-fixtures')
fixtures.mkdir(parents=True, exist_ok=True)
checks, errors, blocked, previews = [], [], [], []
stores = [dict(id=i, code=f'CS-QA-{i}', store_name=f'Cơ sở QA {i}', status='opening', store_revision='1') for i in [1, 2]]
staff = [dict(id=8, full_name='Nhân sự QA', phone='0900000008', position='Nhân viên kinh doanh', status='1', store_id=1)]
vehicles = [dict(id=101+i, name=f'Honda Vision QA {i+1}', license=f'QA-{101+i}', brand='Honda', type='xega', color='Đen', year=2024,
    status='ready', store_id=1, daily_price=200000) for i in range(2)]
customers = [dict(id=12, code='KH-QA', name='Khách QA', phone='0900000012', id_card='001234567812', address='Địa chỉ QA', status='active', store_id=1, customer_revision='1')]
contracts = [dict(id=77, contract_number='HD-QA-77', status='renting', customer_id=12, customer_name='Khách QA', store_id=1,
    total_amount=200000, paid_amount=100000, start_date='2026-10-10T09:00:00+07:00', end_date='2026-10-12T09:00:00+07:00',
    vehicles=[dict(**vehicles[0], rent_at='2026-10-10T09:00:00+07:00', return_at='2026-10-12T09:00:00+07:00', completed_at=None)])]
transactions = [dict(id=90+i, type='in' if i < 7 else 'out', created_at='2026-10-10T09:00:00+07:00', amount=100000+i,
    user_name='Nhân sự QA', store_id=1, store_name='Cơ sở QA 1', order_id=77, contract_code='HD-QA-77', payment_method='Tiền mặt',
    account='Két tiền mặt QA', reason=f'Phiếu QA {i+1}', content='Nội dung dài để kiểm tra chi tiết mobile. ' * 3) for i in range(9)]
accounts = [dict(id=1, kind='cash', name='Két tiền mặt QA', label='Két tiền mặt QA', store_id=1, store_name='Cơ sở QA 1', owner_type='', status='active',
    opening_balance=1000000, income=700000, expense=200000, balance=1500000, voucher_count=9)]
event_rows = [dict(key=str(i), action=action, label=label, vehicle_name='Honda Vision QA 1', license='QA-101', location='Cơ sở QA 1',
    responsible_store='Cơ sở QA 1', beneficiary_store='Cơ sở QA 2', note='Ghi chú lịch sử QA ' * 5,
    at='2026-10-10T09:00:00+07:00', actor='Nhân sự QA', order_id=77) for i, action, label in [(1, 'rent', 'Thuê'), (2, 'return', 'Trả xe')]]
cashflow = [dict(id=90, at='2026-10-10T09:00:00+07:00', type='income', reason='Tiền thuê QA', note='Ghi chú QA', amount=100000,
    method='Tiền mặt', account='Két tiền mặt QA', actor='QA', status='Đã duyệt', order_id=77, contract_code='HD-QA-77')]
return_items = [dict(item_id=201, order_id=77, contract_code='HD-QA-77', order_status='renting', customer_name='Khách QA', customer_id_card='001234567812',
    vehicle_id=101, vehicle_name='Honda Vision QA 1', license='QA-101', store_id=1, store_name='Cơ sở QA 1', scheduled_start_at='2026-10-10T09:00:00+07:00',
    scheduled_return_at='2026-10-12T09:00:00+07:00', completed_at=None, item_revision='1', order_revision='1', total_amount=200000, paid_amount=100000,
    overdue=False, daily_price=200000, deposit_paid=2000000, deposit_held=2000000)]
endpoints = {'/api/auth/stores': stores, '/api/auth/hr/staff': staff, '/api/auth/customers': customers, '/api/auth/vehicle/vehicles': vehicles,
    '/api/auth/order/car-rental': contracts, '/api/auth/transactions': transactions, '/api/auth/cashbook/accounts': accounts,
    '/api/auth/stores/managers': [dict(id=8, name='Nhân sự QA')], '/api/auth/vehicles/101/history': event_rows,
    '/api/auth/customers/12/payments': cashflow, '/api/auth/returns': return_items,
    '/api/auth/order/car-rental/77/history': dict(changes=[dict(id='created-77', kind='created', at='2026-10-10T09:00:00+07:00', actor='QA', title='Tạo hợp đồng QA', detail='Ghi chú QA', amount=None)], cashflow=cashflow),
    '/api/auth/cashbook/accounts/cash/1/transactions': transactions}

def mock_api(route):
    request = route.request
    path = urlparse(request.url).path
    if request.method == 'POST' and path in ['/api/auth/customers/import', '/api/auth/vehicles/import', '/api/auth/customers/match-stores']:
        payload = request.post_data_json
        assert payload['commit'] is False, 'Never commit an Excel preview'
        previews.append(path)
        rows = payload['rows']
        if path.endswith('match-stores'):
            data = dict(total=len(rows), ready=len(rows), unchanged=0, invalid=0, updated=0, committed=False, revision='a' * 64,
                rows=[dict(row, state='ready', customer_id=12, customer_name='Khách QA', previous_store_id=2, previous_store_name='Cơ sở QA 2', store_id=1, store_name='Cơ sở QA 1', errors=[]) for row in rows])
        elif path.endswith('vehicles/import'):
            data = dict(total=len(rows), valid=len(rows), invalid=0, skipped=0, inserted=len(rows), updated=0, blankColors=0, retained=2, existing=2,
                revision='1', committed=False, blocking=[], references=[], rows=[dict(row, state='valid', action='insert', targetId=None, storeId=1, errors=[], warnings=[]) for row in rows])
        else:
            data = dict(total=len(rows), valid=len(rows), invalid=0, duplicate=0, incomplete=0, imported=0, committed=False,
                rows=[dict(row, state='valid', store_id=1, errors=[], warnings=[]) for row in rows])
        route.fulfill(json=dict(status='success', data=data))
    elif request.method != 'GET':
        blocked.append(f'{request.method} {path}')
        route.abort('blockedbyclient')
    elif path in ['/api/session', '/api/auth/me']:
        route.fulfill(json=dict(user=dict(id=144, name='QA')))
    elif path in endpoints:
        route.fulfill(json=dict(status='success', data=endpoints[path]))
    else:
        blocked.append(f'GET {path}')
        route.abort('blockedbyclient')

def excel(name, headers, row):
    target = fixtures / f'{name}.xlsx'
    code = "const ExcelJS=require('exceljs'); const [path,headers,row]=JSON.parse(process.argv[1]); const w=new ExcelJS.Workbook(); const s=w.addWorksheet('QA'); s.addRow(headers); s.addRow(row); w.xlsx.writeFile(path).catch(e=>{process.exitCode=1;});"
    subprocess.run(['node', '-e', code, json.dumps([str(target), headers, row], ensure_ascii=False)], check=True)
    return target

excel_files = {
    'customer': excel('customer', ['Họ và tên', 'Số điện thoại', 'CCCD / CMND', 'Nơi ở hiện tại', 'Cơ sở'], ['Khách QA Excel', '0900000001', '001234567801', 'Địa chỉ QA', 'Cơ sở QA 1']),
    'store': excel('store', ['Căn cước', 'Cơ sở'], ['001234567812', 'Cơ sở QA 1']),
    'vehicle': excel('vehicle', ['Tên xe', 'Hãng xe', 'Loại xe', 'Năm sản xuất', 'Biển số', 'Màu sắc', 'Cơ sở', 'Trạng thái'], ['Xe QA Excel', 'Honda', 'Xe ga', '2024', 'QA-999', 'Đen', 'Cơ sở QA 1', 'Lưu kho']),
}

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport=dict(width=375, height=812), is_mobile=True, has_touch=True, timezone_id='Asia/Ho_Chi_Minh')
    context.add_cookies(json.loads(Path(args.session_cookie_file).read_text(encoding='utf-8-sig')))
    context.route('**/api/**', mock_api)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_default_timeout(15000)

    def visit(path):
        page.goto(args.url + '/' + path, wait_until='networkidle', timeout=120000)
        expect(page.locator('.mg-app h1')).to_be_visible()
        page.add_style_tag(content='.mg-user-menu strong {visibility:hidden !important;}')
        page.locator('.mg-user-avatar').evaluate_all("els => els.forEach(el => el.textContent='QA')")

    def verify(label, container=None):
        target = container or page.locator('.mg-app')
        assert target.evaluate('el => el.scrollWidth <= el.clientWidth + 1'), f'Overflow: {label}'
        assert not target.locator('table:visible').count(), f'Mobile table remains: {label}'
        if container is not None:
            rect = target.bounding_box()
            assert rect['width'] <= width + 1 and rect['height'] <= height + 1, label
        checks.append(f'{label} at {width}x{height}')

    def dismiss(dialog):
        dialog.get_by_role('button', name='Đóng hộp thoại', exact=True).click()
        expect(dialog).to_have_count(0)

    def action(label):
        trigger = page.locator('.mg-mobile-card-actions .mg-row-menu-trigger').first
        trigger.scroll_into_view_if_needed()
        page.wait_for_timeout(100)
        trigger.click()
        page.get_by_role('menuitem', name=label, exact=True).click()

    def expand_card(container):
        card = container.locator('.mg-mobile-card-detail').first
        card.locator('summary').click()
        expect(card).to_have_attribute('open', '')
        expect(card.locator('dd').first).to_be_visible()
        card.locator('summary').click()
        card.locator('..').locator('.mg-row-menu-trigger').click()
        menu = page.get_by_role('menu')
        expect(menu).to_be_visible()
        menu.get_by_role('menuitem', name='Xem chi tiết', exact=True).click()
        expect(card).to_have_attribute('open', '')

    for width, height in ([] if args.only_excel else [(320, 812), (375, 812), (812, 375)]):
        page.set_viewport_size(dict(width=width, height=height))
        visit('cashbook')
        expect(page.locator('#cashbook-income .mg-mobile-record-card')).to_have_count(5)
        verify('Cashbook accounts and income/expense cards')
        income = page.locator('#cashbook-income')
        expand_card(income)
        expect(income.locator('.mg-mobile-detail-fields').first.get_by_text('HD-QA-77', exact=True)).to_be_visible()
        income.get_by_label('Chọn tất cả thẻ phiếu thu trên trang này', exact=True).check()
        expect(page.get_by_role('button', name='Xóa phiếu đã chọn (5)', exact=True)).to_be_enabled()
        income.get_by_role('button', name='Trang sau phiếu thu', exact=True).click()
        expect(income.locator('.mg-mobile-record-card')).to_have_count(2)
        income.get_by_label('Sắp xếp phiếu thu', exact=True).select_option('amount')
        expect(income.locator('.mg-mobile-record-card')).to_have_count(5)
        verify('Voucher details, selection, sorting and pagination')
        if width == 375:
            page.evaluate('window.scrollTo(0, 0)')
            page.locator('.mg-topbar').click(position=dict(x=2, y=2))
            page.screenshot(path=str(out / 'cashbook-375.png'), full_page=True)
        page.locator('#cashbook-accounts .mg-mobile-card-main').click()
        account_dialog = page.locator('.mg-account-dialog')
        expect(account_dialog).to_be_visible()
        account_dialog.get_by_role('tab', name='Danh sách thu chi', exact=False).click()
        expect(account_dialog.locator('.mg-mobile-record-card')).to_have_count(9)
        expand_card(account_dialog)
        verify('Account vouchers and menu inside a modal', account_dialog)
        if width == 375:
            account_dialog.locator('.mg-mobile-card-detail summary').first.click()
            account_dialog.evaluate('el => { el.scrollTop = 0; }')
            page.screenshot(path=str(out / 'account-vouchers-375.png'))
        dismiss(account_dialog)

        visit('stores')
        page.locator('.mg-mobile-card-main').first.click()
        dialog = page.locator('.mg-store-detail')
        for tab_name, panel in [('Nhân sự', 'staff'), ('Xe', 'vehicles'), ('Khách hàng', 'customers'), ('Hợp đồng', 'contracts')]:
            dialog.get_by_role('tab', name=tab_name, exact=False).click()
            active = dialog.locator(f'#store-detail-panel-{panel}')
            expect(active.locator('.mg-mobile-record-card').first).to_be_visible()
            expand_card(active)
            verify(f'Store {panel} cards and detail menu', dialog)
        dialog.get_by_role('tab', name='Sổ két', exact=False).click()
        expect(dialog.locator('#store-cashbook-panel-accounts .mg-mobile-record-card')).to_have_count(1)
        dialog.get_by_role('tab', name='Thu chi', exact=False).click()
        expect(dialog.locator('#store-cashbook-panel-vouchers .mg-mobile-record-card').first).to_be_visible()
        verify('Store cashbook cards', dialog)
        dismiss(dialog)

        visit('vehicles')
        page.locator('.mg-mobile-card-main').first.click()
        dialog = page.locator('.mg-vehicle-detail')
        dialog.get_by_role('tab', name='Lịch sử', exact=False).click()
        expect(dialog.locator('.mg-mobile-record-card')).to_have_count(2)
        expand_card(dialog)
        dialog.get_by_label('Lọc hành động').select_option('rent')
        expect(dialog.locator('.mg-mobile-record-card')).to_have_count(1)
        verify('Vehicle history cards, details and filter', dialog)
        if width == 375:
            page.screenshot(path=str(out / 'vehicle-history-375.png'))
        dismiss(dialog)
        for label in ['Chuyển xe', 'Đổi trạng thái', 'Chỉnh sửa']:
            action(label)
            dialog = page.locator('dialog.mg-dialog')
            expect(dialog).to_be_visible()
            verify(f'Vehicle form: {label}', dialog)
            dismiss(dialog)

        visit('customers')
        page.locator('.mg-mobile-card-main').first.click()
        dialog = page.locator('.mg-customer-detail')
        for tab_name in ['Hợp đồng', 'Thanh toán']:
            dialog.get_by_role('tab', name=tab_name, exact=False).click()
            panel = dialog.locator('#customer-detail-panel-contracts' if tab_name == 'Hợp đồng' else '#customer-detail-panel-payments')
            expect(panel.get_by_text('HD-QA-77', exact=False).first).to_be_visible()
            verify(f'Customer {tab_name}', dialog)
        dismiss(dialog)

        visit('contracts')
        page.locator('.mg-mobile-card-main').first.click()
        dialog = page.locator('.mg-contract-detail')
        expect(dialog).to_be_visible()
        expect(dialog.get_by_role('tab')).to_have_count(7)
        for tab in dialog.get_by_role('tab').all():
            tab.click()
            if tab.get_attribute('id') == 'contract-detail-tab-payment':
                active = dialog.locator('#contract-detail-panel-payment')
                expect(active.locator('.mg-mobile-record-card')).to_have_count(1)
                expand_card(active)
            elif tab.get_attribute('id') == 'contract-detail-tab-changes':
                expect(dialog.locator('.mg-contract-changes')).to_be_visible()
            elif tab.get_attribute('id') == 'contract-detail-tab-cashflow':
                expect(dialog.locator('.mg-contract-cashflow-columns')).to_be_visible()
            verify(f'Contract tab: {tab.inner_text()}', dialog)
        dismiss(dialog)
        for label in ['Trả xe', 'Gia hạn', 'Đổi xe']:
            action(label)
            dialog = page.locator('dialog.mg-dialog')
            expect(dialog).to_be_visible()
            expect(dialog.locator('[role="status"]')).to_have_count(0)
            verify(f'Contract form: {label}', dialog)
            for field in dialog.locator('input:not([type="checkbox"]),select,textarea').all():
                if field.is_visible():
                    assert field.evaluate('el => parseFloat(getComputedStyle(el).fontSize)') >= 16
            dismiss(dialog)

    width, height = 375, 812
    page.set_viewport_size(dict(width=width, height=height))
    for path, label, file_id, file_key in [('customers', 'Nhập Excel', 'customer-excel-file', 'customer'),
        ('customers', 'Khớp cơ sở theo căn cước', 'customer-store-excel-file', 'store'),
        ('vehicles', 'Nhập / Đồng bộ Excel', 'vehicle-excel-file', 'vehicle')]:
        visit(path)
        page.get_by_role('button', name=label, exact=True).click()
        dialog = page.locator('dialog.mg-dialog')
        dialog.locator('#' + file_id).set_input_files(excel_files[file_key])
        try:
            expect(dialog.locator('.mg-mobile-record-card')).to_have_count(1, timeout=20000)
        except Exception:
            print(json.dumps(dict(excel=file_key, dialog=dialog.inner_text(), blocked=blocked), ensure_ascii=True))
            raise
        expand_card(dialog)
        for width, height in [(320, 812), (375, 812), (812, 375)]:
            page.set_viewport_size(dict(width=width, height=height))
            verify(f'Excel preview {file_key} with all fields', dialog)
        width, height = 375, 812
        page.set_viewport_size(dict(width=width, height=height))
        page.screenshot(path=str(out / f'excel-{file_key}-375.png'))
        dismiss(dialog)
    assert not errors and not blocked, dict(errors=errors, blocked=blocked)
    browser.close()

result = dict(passed=len(checks), checks=checks, javascriptErrors=errors, unexpectedRequestsBlocked=blocked, mockedExcelPreviews=len(previews), realBusinessWrites=0)
(out / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=True, indent=2))
