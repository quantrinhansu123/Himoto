"""Synthetic API QA: vehicle staff branch, payment choices and return lookup. No real business writes."""
from lib.contract_type_fixtures import mock_contract_type_read
import argparse
import copy
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3101')
parser.add_argument('--browser', choices=['chromium', 'webkit'], default='chromium')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='.backups/contract-flow-qa/ui')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
checks, errors, unexpected, saves, staff_requests, return_queries = [], [], [], [], [], []
stores = [dict(id=i, store_name=name, status='opening') for i, name in [(1, 'CS nguồn khách QA'), (2, 'CS xe QA')]]
staff = [dict(id=i, store_id=store, full_name=name, status='active') for i, store, name in [(8, 2, 'Nhân viên xe QA'), (9, 1, 'Nhân viên nguồn QA')]]
customer = dict(id=77, store_id=1, store_name='CS nguồn khách QA', name='Khách QA', phone='0900000077', id_card='001234567877', address='Địa chỉ QA', status='active',
    relatives=[dict(name='Người thân QA 1', relationship='Mẹ', phone='0900000081'), dict(name='Người thân QA 2', relationship='Anh', phone='0900000082')])
vehicles = [dict(id=101, store_id=2, store_name='CS xe QA', name='Xe QA', license='29B1-123.45', brand='Honda', type='xega', status='ready', daily_price=200000)]
legacy = dict(id=900, contract_number='OLD-QA-900', status='renting', store_id=1, customer_id=77, customer_name='Khách QA', customer_phone=customer['phone'],
    customer_id_card=customer['id_card'], payment_method='Tiền mặt', deposit_payment_method='Tiền mặt', vehicles=vehicles)
contracts = [legacy]

def mock_api(route):
    if mock_contract_type_read(route): return
    request = route.request
    parsed = urlparse(request.url)
    if parsed.path.startswith('/api/auth/record-photos/') and request.method == 'GET':
        route.fulfill(json=dict(status='success', data=[]))
        return
    path = parsed.path.rstrip('/')
    query = parse_qs(parsed.query)
    if request.method in ['POST', 'PUT'] and path.startswith('/api/auth/order/car-rental') and not path.endswith('/finalize'):
        edits = request.post_data_json
        saves.append(copy.deepcopy(edits))
        record = dict(id=901, draft_reference='NHAP-QA-901', status='draft', store_id=edits['draft']['store_id'], draft_revision=str(len(saves)),
            draft_payload=dict(management_composer=dict(version=1, **edits)))
        contracts[:] = [legacy, record]
        route.fulfill(json=dict(status='success', data=record))
    elif request.method != 'GET':
        unexpected.append(request.method + ' ' + path)
        route.abort()
    elif path == '/api/auth/hr/staff':
        store_id = query.get('store_id', [''])[0]
        staff_requests.append(store_id)
        route.fulfill(json=dict(status='success', data=[row for row in staff if not store_id or str(row['store_id']) == store_id]))
    elif path == '/api/auth/customers/search':
        route.fulfill(json=dict(status='success', data=[customer]))
    elif path == '/api/auth/returns':
        term = query.get('query', [''])[0]
        return_queries.append(term)
        rows = [dict(item_id=201, order_id=900, contract_code='OLD-QA-900', order_status='renting', customer_name='Khách QA', customer_id_card=customer['id_card'],
            vehicle_id=101, vehicle_name='Xe QA', license=vehicles[0]['license'], store_id=1, store_name='CS nguồn khách QA',
            scheduled_start_at='2026-10-12T09:00:00+07:00', scheduled_return_at='2026-10-14T09:00:00+07:00', completed_at=None,
            item_revision='1', order_revision='1', total_amount=400000, paid_amount=0, overdue=False, daily_price=200000, deposit_paid=0, deposit_held=0)]
        route.fulfill(json=dict(status='success', data=rows if term in ['29B1-123.45', '0900000077', customer['id_card'], 'OLD-QA-900'] else []))
    elif path.endswith('/901/payments'):
        route.fulfill(json=dict(status='success', data=dict(id=901, code='NHAP-QA-901', status='draft', store_id=1, revision=str(len(saves)),
            total_amount=200000, paid_amount=0, remaining=200000, deposit_paid=0, deposit_refunded=0, deposit_held=0, company_paid_amount=0, company_payment_count=0,
            accounts=[dict(id=1, kind='cash', store_id=1, label='Két nguồn QA', owner_type=''), dict(id=2, kind='bank', store_id=1, label='Ngân hàng công ty QA', owner_type='company')],
            history=[], items=[], end_date=None)))
    elif path in ['/api/session', '/api/auth/me']:
        route.fulfill(json=dict(user=dict(id=144, name='QA')))
    else:
        data = {'/api/auth/stores': stores, '/api/auth/customers': [customer], '/api/auth/vehicle/vehicles': vehicles,
            '/api/auth/order/car-rental': contracts}.get(path)
        if data is None:
            unexpected.append(path)
            route.abort()
        else:
            route.fulfill(json=dict(status='success', data=data))

with sync_playwright() as p:
    browser = getattr(p, args.browser).launch()
    context = browser.new_context(viewport=dict(width=375, height=812), timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
    context.add_cookies(json.loads(Path(args.session_cookie_file).read_text(encoding='utf-8-sig')))
    context.route('**/api/**', mock_api)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_default_timeout(15000)
    page.set_default_navigation_timeout(45000)
    for width, height in [(320, 740), (375, 812), (1440, 1000)]:
        page.set_viewport_size(dict(width=width, height=height))
        page.goto(args.url + '/contracts', wait_until='networkidle')
        page.add_style_tag(content='.mg-user-menu strong {visibility:hidden !important;}')
        page.locator('.mg-user-avatar').evaluate_all("els => els.forEach(el => el.textContent='QA')")
        page.get_by_role('button', name='Nhập hợp đồng', exact=True).click()
        form = page.locator('dialog.mg-contract-composer')
        tab = lambda name: form.get_by_role('tab', name=name, exact=False).click()
        tab('Khách hàng')
        form.locator('#contract-store').select_option('2')
        expect(form.locator('#contract-staff-options option')).to_have_attribute('value', 'Nhân viên xe QA')
        form.locator('#contract-staff').fill('Nhân viên xe QA')
        form.locator('#contract-id-card').fill(customer['phone'])
        expect(form.locator('#contract-customer-name')).to_have_value('Khách QA')
        expect(form.locator('#contract-store')).to_have_value('2')
        expect(form.locator('#contract-staff')).to_have_value('Nhân viên xe QA')
        expect(form.locator('#contract-staff-options option')).to_have_attribute('value', 'Nhân viên xe QA')
        if width in [375, 1440]:
            form.screenshot(path=str(out / f'customer-branch-{width}.png'))
        tab('Hợp đồng & pháp lý')
        expect(form.locator('#contract-customer-source-store')).to_have_value('CS nguồn khách QA')
        tab('Phương tiện')
        expect(form.locator('#contract-vehicle-store-filter')).to_have_value('2')
        form.locator('#contract-vehicle-0').click()
        form.locator('#contract-vehicle-0-options-101').click()
        tab('Chi phí')
        form.locator('#contract-deposit_amount').fill('2000000')
        def picker(label):
            return form.get_by_label(label, exact=True).locator('..')
        deposit = picker('Hình thức dự kiến nhận cọc')
        rental = picker('Hình thức dự kiến thu thuê/phí')
        deposit.locator('summary').click()
        deposit.get_by_label('Tiền mặt', exact=True).check()
        expect(deposit.locator('summary')).to_have_text('Tiền mặt')
        deposit.get_by_label('Tiền mặt', exact=True).uncheck()
        deposit.locator('label').filter(has_text='Tiền mặt').click()
        expect(deposit.get_by_label('Tiền mặt', exact=True)).to_be_checked()
        deposit.get_by_label('Tiền mặt', exact=True).press('Escape')
        expect(deposit).not_to_have_attribute('open', '')
        deposit.locator('summary').click()
        rental.locator('summary').click()
        expect(deposit).not_to_have_attribute('open', '')
        rental.get_by_label('Tiền mặt', exact=True).check()
        rental.get_by_label('CK tk công ty', exact=True).check()
        expect(rental.locator('summary')).to_have_text('Tiền mặt, CK tk công ty')
        rental.locator('summary').click()
        tab('Khách hàng')
        tab('Chi phí')
        expect(deposit.locator('summary')).to_have_text('Tiền mặt')
        if width in [375, 1440]:
            form.screenshot(path=str(out / f'payment-methods-{width}.png'))
        form.get_by_role('button', name='Lưu nháp', exact=True).click()
        expect(page).to_have_url(args.url + '/contracts/drafts')
        assert saves[-1]['draft']['vehicle_store_id'] == '2'
        assert saves[-1]['draft']['store_id'] == '1'
        assert saves[-1]['draft']['staff_id'] == '8'
        assert saves[-1]['draft']['deposit_payment_method'] == 'Tiền mặt'
        assert saves[-1]['draft']['payment_method'] == 'Tiền mặt, CK tk công ty'
        page.reload(wait_until='networkidle')
        page.get_by_role('button', name='Thao tác NHAP-QA-901', exact=True).click()
        page.get_by_role('menuitem', name='Tiếp tục sửa bản nháp', exact=True).click()
        tab('Khách hàng')
        expect(form.locator('#contract-store')).to_have_value('2')
        expect(form.locator('#contract-staff')).to_have_value('Nhân viên xe QA')
        tab('Chi phí')
        deposit = picker('Hình thức dự kiến nhận cọc')
        expect(deposit.locator('summary')).to_have_text('Tiền mặt')
        deposit.locator('summary').click()
        expect(deposit.get_by_label('Tiền mặt', exact=True)).to_be_checked()
        deposit.locator('summary').click()
        form.get_by_role('button', name='Hoàn tất & thanh toán', exact=True).click()
        confirm = page.get_by_role('dialog').filter(has=page.get_by_role('heading', name='Xác nhận thanh toán', exact=False))
        expect(confirm.locator('#deposit-collection-0-method')).to_have_value('cash')
        expect(confirm.locator('#rental-collection-0-method')).to_have_value('cash')
        expect(confirm.locator('#rental-collection-1-method')).to_have_value('company_transfer')
        expect(confirm).to_contain_text('Két nguồn QA')
        confirm.get_by_role('button', name='Quay lại', exact=True).click()
        form.get_by_role('button', name='Đóng', exact=True).click()
        checks.append(f'{width}px: vehicle branch/staff survive a different customer source; cash/multiple methods survive tabs, save/reload and initialize official receipts')
        page.goto(args.url + '/contracts', wait_until='networkidle')
        page.get_by_role('button', name='Thao tác OLD-QA-900', exact=True).click()
        page.get_by_role('menuitem', name='Điền và in hợp đồng', exact=True).click()
        tab('Chi phí')
        expect(picker('Hình thức dự kiến nhận cọc').locator('summary')).to_have_text('Tiền mặt')
        expect(picker('Hình thức dự kiến thu thuê/phí').locator('summary')).to_have_text('Tiền mặt')
        form.get_by_role('button', name='Đóng', exact=True).click()
        expect(page.get_by_role('button', name='Trả xe', exact=True)).to_have_count(0)
        checks.append(f'{width}px: old order payment choices remain visible; the contract list has no page-level return button')
    assert not errors and not unexpected, (errors, unexpected)
    browser.close()
result = dict(passed=len(checks), browser=args.browser, checks=checks, javascriptErrors=errors, unexpectedRequests=unexpected,
    mockedDraftWrites=len(saves), mockedReturnSearches=return_queries, realBusinessWrites=0)
(out / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
