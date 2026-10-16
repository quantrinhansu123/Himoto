"""Phone operations, employee attribution and incomplete paperwork; synthetic APIs only."""
import argparse
import copy
import json
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3005')
parser.add_argument('--browser', choices=['chromium', 'webkit'], default='chromium')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='.backups/operations/ui')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
checks, errors, unexpected, saves, profiles, collections, new_customers = [], [], [], [], [], [], []
stores = [dict(id=35, store_name='CS QA', status='opening')]
staff = [dict(id=i, full_name=name, staff_code=f'QA-{i}', position=role, status='active', store_id=35)
         for i, name, role in [(10, 'NVKD QA', 'NVKD'), (20, 'TLS QA', 'TLS')]]
customer = dict(id=77, name='Khách tạm QA', phone='0900000077', id_card='', address='', status='draft', store_id=35)
vehicle = dict(id=101, name='Xe QA', license='QA-101', type='xega', brand='Honda', store_id=35, status='ready', daily_price=200000)
issued = dict(id=900, contract_number='HD-QA-900', status='renting', store_id=35, customer_id=77, customer_name=customer['name'],
              customer_phone=customer['phone'], start_date='2026-10-13T09:00:00+07:00', end_date='2026-10-15T09:00:00+07:00',
              total_amount=400000, deposit_amount=3000000, paid_amount=0, draft_revision='1', vehicles=[vehicle])
contracts = [issued]
returnable = dict(item_id=201, order_id=900, contract_code='HD-QA-900', order_status='renting', customer_name=customer['name'],
                 vehicle_id=101, vehicle_name='Xe QA', license='QA-101', store_id=35, store_name='CS QA',
                 scheduled_start_at=issued['start_date'], scheduled_return_at=issued['end_date'], completed_at=None,
                 item_revision='1', order_revision='1', total_amount=400000, paid_amount=0, overdue=False, daily_price=200000,
                 deposit_paid=0, deposit_held=0)


def mock_api(route):
    request = route.request
    url = urlparse(request.url)
    path = url.path.rstrip('/')
    query = parse_qs(url.query)
    if path.startswith('/api/auth/record-photos/') and request.method == 'GET':
        route.fulfill(json=dict(status='success', data=[]))
        return
    if request.method == 'POST' and path == '/api/auth/customers':
        payload = request.post_data_json
        new_customers.append(payload)
        route.fulfill(json=dict(status='success', data=dict(id=78, **payload)))
    elif request.method in ['POST', 'PUT'] and path in ['/api/auth/order/car-rental', '/api/auth/order/car-rental/901']:
        edits = request.post_data_json
        saves.append(copy.deepcopy(edits))
        record = dict(id=901, draft_reference='NHAP-QA-901', status='draft', store_id=35, draft_revision='2',
                      draft_payload=dict(management_composer=dict(version=1, **edits)))
        contracts[:] = [issued, record]
        route.fulfill(json=dict(status='success', data=record))
    elif request.method == 'PATCH' and path in ['/api/auth/order/car-rental/900/profile', '/api/auth/order/car-rental/901/profile']:
        payload = request.post_data_json
        profiles.append(payload)
        target = next(c for c in contracts if c['id'] == int(path.split('/')[-2]))
        composer = target.setdefault('draft_payload', {}).setdefault('management_composer', {})
        composer['profile'] = payload['profile']
        target['draft_revision'] = '3'
        route.fulfill(json=dict(status='success', data=dict(revision='3')))
    elif request.method == 'POST' and path == '/api/auth/order/car-rental/901/finalize':
        collections.append(request.post_data_json)
        route.fulfill(json=dict(status='success', data=dict(order_id=901, code='HD-QA-901', total_amount=200000,
                      deposit_amount=3000000, paid_amount=3200000, transaction_ids=[1, 2], status='renting')))
    elif request.method != 'GET':
        unexpected.append(request.method + ' ' + path)
        route.abort()
    elif path == '/api/auth/hr/staff':
        route.fulfill(json=dict(status='success', data=staff))
    elif path == '/api/auth/customers/search':
        route.fulfill(json=dict(status='success', data=[customer] if query.get('query', [''])[0] == customer['phone'] else []))
    elif path == '/api/auth/returns':
        route.fulfill(json=dict(status='success', data=[returnable] if query else []))
    elif path == '/api/auth/staff-sales':
        route.fulfill(json=dict(status='success', data=dict(rows=[
            dict(staff_id=10, name='NVKD QA', department='NVKD', contracts=2, customers=1, new_customers=1, revenue=3500000),
            dict(staff_id=20, name='TLS QA', department='TLS', contracts=1, customers=1, new_customers=1, revenue=6000000)],
            unassigned_revenue=200000, unassigned_contracts=1)))
    elif path == '/api/auth/order/car-rental/901/payments':
        route.fulfill(json=dict(status='success', data=dict(id=901, code='NHAP-QA-901', status='draft', store_id=35, revision='2',
            total_amount=200000, paid_amount=0, remaining=200000, deposit_paid=0, deposit_refunded=0, deposit_held=0,
            company_paid_amount=0, company_payment_count=0, accounts=[dict(id=5, kind='cash', store_id=35, label='Két QA', owner_type='')],
            history=[], items=[], end_date=None)))
    elif path in ['/api/session', '/api/auth/me']:
        route.fulfill(json=dict(user=dict(id=143, name='QA')))
    else:
        data = {'/api/auth/stores': stores, '/api/auth/customers': [customer], '/api/auth/vehicle/vehicles': [vehicle],
                '/api/auth/order/car-rental': contracts}.get(path)
        if data is None:
            unexpected.append(path)
            route.abort()
        else:
            route.fulfill(json=dict(status='success', data=data))


with sync_playwright() as p:
    browser = getattr(p, args.browser).launch()
    context = browser.new_context(viewport=dict(width=375, height=812), timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
    context.add_cookies([dict(name='himoto_management_session', value=Path(args.session_cookie_file).read_text().strip(),
                             url=args.url, httpOnly=True, sameSite='Strict')])
    context.route('**/api/**', mock_api)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_default_timeout(20000)
    page.set_default_navigation_timeout(60000)
    def go(path):
        # Let in-flight mocked reads settle before destroying a WebKit document.
        page.wait_for_load_state('networkidle')
        page.goto(args.url + path, wait_until='networkidle')
    for width in [320, 375]:
        page.set_viewport_size(dict(width=width, height=812))
        go('/login')
        expect(page).to_have_url(args.url + '/operations')
        expect(page.locator('.mg-operation-action')).to_have_count(4)
        expect(page.locator('.mg-mobile-bottom-nav a')).to_have_count(4)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(out / f'operations-{width}.png'))
        for label, dialog_class in [('Trả xe', '.mg-dialog'), ('Gia hạn', '.mg-dialog'), ('Đổi trạng thái xe', '.mg-dialog')]:
            page.locator('.mg-operation-action').filter(has_text=label).click()
            if label == 'Gia hạn':
                picker = page.get_by_role('dialog', name='Chọn hợp đồng gia hạn')
                expect(picker.get_by_role('button', name=re.compile('HD-QA-900'))).to_be_visible()
                picker.get_by_role('button', name=re.compile('HD-QA-900')).click()
                expect(page.get_by_role('dialog', name=re.compile('Gia hạn'))).to_be_visible()
            else:
                expect(page.get_by_role('dialog')).to_be_visible()
            expect(page).to_have_url(args.url + ('/vehicles' if label == 'Đổi trạng thái xe' else '/contracts'))
            assert page.get_by_role('dialog').evaluate('(el) => el.scrollWidth <= el.clientWidth')
            page.keyboard.press('Escape')
            go('/operations')
        go('/vehicles')
        expect(page.locator('.mg-page-vehicles')).to_have_count(1)
        expect(page.locator('.mg-data-actions')).not_to_have_attribute('open', '')
        expect(page.get_by_role('button', name='Xuất CSV', exact=True)).not_to_be_visible()
        expect(page.get_by_role('button', name='Đổi trạng thái xe', exact=True)).to_be_visible()
        page.locator('.mg-data-actions summary').click()
        expect(page.get_by_role('button', name='Xuất CSV', exact=True)).to_be_visible()
        page.locator('.mg-data-actions summary').click()
        page.screenshot(path=str(out / f'vehicles-{width}.png'))
    checks.append('320/375px: returning login opens four quick actions; return/renew/status dialogs fit; CSV/Excel/delete actions collapse and expand')

    go('/operations')
    page.locator('.mg-operation-action').filter(has_text='Làm hợp đồng').click()
    form = page.locator('dialog.mg-contract-composer')
    tab = lambda name: form.get_by_role('tab', name=name, exact=False).click()
    tab('Hợp đồng & pháp lý')
    form.locator('#contract-sales_staff_id').select_option('10')
    expect(form.locator('#contract-tls_staff_id')).to_have_count(0)
    assert form.locator('#contract-sales_staff_id option[value="20"]').count() == 0
    tab('Khách hàng')
    form.locator('#contract-store').select_option('35')
    form.locator('#contract-id-card').fill('0900000077')
    expect(form.locator('#contract-customer-name')).to_have_value(customer['name'])
    tab('Phương tiện')
    form.locator('#contract-vehicle-0').click()
    form.locator('#contract-vehicle-0-options-101').click()
    tab('Chi phí')
    form.locator('#contract-unit_price').fill('200000')
    form.locator('#contract-deposit_amount').fill('3000000')
    form.get_by_role('button', name='Xem mẫu in', exact=True).click()
    expect(form).to_contain_text('Chưa thể tạo bản in')
    form.get_by_role('button', name='Hoàn tất & thanh toán', exact=True).click()
    finalize = page.get_by_role('dialog', name=re.compile('Xác nhận thanh toán'))
    expect(finalize.locator('.mg-collection-total strong')).to_have_text('3.200.000 đ')
    assert saves[-1]['draft']['customer']['id_card'] == '' and saves[-1]['draft']['relatives'][0]['name'] == ''
    assert saves[-1]['draft']['sales_staff_id'] == '10' and not saves[-1]['draft'].get('tls_staff_id')
    finalize.get_by_role('button', name='Xác nhận lưu chính thức', exact=True).click()
    expect(finalize).not_to_be_visible()
    expect(page).to_have_url(args.url + '/contracts?contract_id=901')
    assert sorted((r['purpose'], r['amount']) for r in collections[-1]['receipts']) == [('deposit', '3000000'), ('rental', '200000')]
    checks.append('Incomplete legal profile can issue operational contract; default print still blocks; official receipt request separates rental/deposit and saves the NVKD employee ID')

    go('/contracts')
    page.locator('.mg-mobile-record-card').filter(has_text='HD-QA-900').locator('.mg-row-menu-trigger').click()
    page.get_by_role('menuitem', name='Điền và in hợp đồng', exact=True).click()
    form = page.locator('dialog.mg-contract-composer')
    tab('Hợp đồng & pháp lý')
    form.locator('.mg-document-requirements summary').click()
    for label in ['CCCD/CMND', 'Địa chỉ khách', 'Đại diện Bên A']:
        form.get_by_label(label, exact=True).uncheck()
    form.locator('#contract-required-relatives').select_option('0')
    form.locator('#contract-sales_staff_id').select_option('10')
    tab('Khách hàng')
    form.locator('#contract-customer-id_card').fill('001234567877')
    form.get_by_role('button', name='Lưu hồ sơ hợp đồng', exact=True).click()
    expect(form).to_contain_text('Đã lưu hồ sơ')
    assert len(profiles) == 1
    assert 'total_amount' not in profiles[0]['profile'] and 'vehicles' not in profiles[0]['profile']
    page.keyboard.press('Escape')
    page.reload()
    page.locator('.mg-mobile-record-card').filter(has_text='HD-QA-900').locator('.mg-row-menu-trigger').click()
    page.get_by_role('menuitem', name='Điền và in hợp đồng', exact=True).click()
    form = page.locator('dialog.mg-contract-composer')
    tab('Khách hàng')
    expect(form.locator('#contract-customer-id_card')).to_have_value('001234567877')
    form.get_by_role('button', name='Xem mẫu in', exact=True).click()
    expect(page.locator('dialog.mg-contract-print-dialog')).to_be_visible()
    checks.append('Print requirements and supplemented CCCD persist across reload; profile PATCH cannot carry amounts/vehicles; relaxed print opens')

    go('/staff-sales')
    expect(page.locator('.mg-sales-cards li')).to_have_count(2)
    expect(page.locator('.mg-sales-cards')).to_contain_text('6.000.000 đ')
    page.get_by_label('Bộ phận doanh số', exact=True).select_option('TLS')
    expect(page.locator('.mg-sales-cards li')).to_have_count(1)
    expect(page.locator('.mg-sales-cards')).to_contain_text('Tiền thuê HĐ mở mới đầu tiên')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(out / 'staff-sales-375.png'))
    checks.append('Employee report shows independent revenue bases and department filters without phone overflow')
    go('/contracts?action=new')
    expect(form).to_be_visible()
    tab('Khách hàng')
    form.locator('#contract-store').select_option('35')
    form.get_by_role('button', name='Thêm mới', exact=True).click()
    create = page.get_by_role('dialog', name='Thêm khách hàng tại chỗ')
    create.locator('#new-customer-name').fill('Khách nhập tạm mới QA')
    create.locator('#new-customer-phone').fill('0900000078')
    expect(create.get_by_label('Trạng thái hồ sơ', exact=False)).to_have_value('active')
    create.get_by_label('Trạng thái hồ sơ', exact=False).select_option('draft')
    create.get_by_role('button', name='Lưu khách hàng', exact=True).click()
    expect(create).not_to_be_visible()
    expect(form.locator('#contract-customer-name')).to_have_value('Khách nhập tạm mới QA')
    assert new_customers[-1]['allow_incomplete'] and new_customers[-1]['status'] == 'draft'
    assert new_customers[-1]['id_card'] == '' and new_customers[-1]['address'] == ''
    checks.append('Quick contract can create a temporary customer with name/phone only and retain their linked ID')
    page.keyboard.press('Escape')
    go('/contracts?action=new')
    tab('Hợp đồng & pháp lý')
    form.locator('#contract-record-type').select_option('ownership')
    expect(form.locator('#contract-tls_staff_id')).to_have_count(0)
    tab('Chi phí')
    expect(form.locator('#contract-package_name')).to_have_value('Theo ngày')
    form.locator('#contract-package_name').select_option('Theo tháng')
    tab('Khách hàng')
    form.locator('#contract-store').select_option('35')
    form.locator('#contract-id-card').fill(customer['phone'])
    expect(form.locator('#contract-customer-name')).to_have_value(customer['name'])
    tab('Phương tiện')
    form.locator('#contract-start_date').fill('2026-10-13')
    form.get_by_label('Giờ thuê lúc (24h)', exact=True).select_option('09')
    form.get_by_label('Phút thuê lúc', exact=True).select_option('00')
    form.locator('#contract-end_date').fill('2026-11-13')
    form.get_by_label('Giờ hẹn trả (24h)', exact=True).select_option('09')
    form.get_by_label('Phút hẹn trả', exact=True).select_option('00')
    form.locator('#contract-vehicle-0').click()
    form.locator('#contract-vehicle-0-options-101').click()
    tab('Chi phí')
    form.locator('#contract-unit_price').fill('3000000')
    form.locator('#contract-deposit_amount').fill('3000000')
    expect(form.locator('#contract-package_name')).to_have_value('Theo tháng')
    expect(form.locator('#contract-package_name option[value="Tùy chọn"]')).to_have_count(0)
    expect(form.locator('#contract-total_amount')).to_have_value('3.000.000')
    expect(form.locator('#contract-amount-due')).to_have_value('6.000.000')
    for term in ['6', '12', '24']:
        tab('Hợp đồng & pháp lý')
        form.get_by_label('Phân loại thuê sở hữu', exact=True).select_option(term)
        tab('Phương tiện')
        expect(form.locator('#contract-end_date')).to_have_value('2026-11-13')
        tab('Chi phí')
        expect(form.locator('#contract-total_amount')).to_have_value('3.000.000')
    assert form.get_by_text('Lịch đóng tiền sau khoản đầu tiên', exact=True).count() == 0
    form.get_by_role('button', name='Lưu nháp', exact=True).click()
    expect(form).not_to_be_visible()
    expect(page).to_have_url(args.url + '/contracts/drafts')
    assert saves[-1]['draft']['ownership_term_months'] == '24' and saves[-1]['draft']['tls_staff_id'] == ''
    record = next(c for c in contracts if c['id'] == 901)
    record.update(status='renting', rental_type='ownership', contract_number='OWN-QA-901', total_amount=3000000,
                  paid_amount=3000000, start_date='2026-10-13T09:00:00+07:00', end_date='2026-11-13T09:00:00+07:00')
    go('/contracts')
    page.locator('.mg-mobile-record-card').filter(has_text='OWN-QA-901').locator('.mg-row-menu-trigger').click()
    expect(page.get_by_role('menuitem', name='Gia hạn', exact=True)).to_be_visible()
    page.get_by_role('menuitem', name='Điền và in hợp đồng', exact=True).click()
    tab('Hợp đồng & pháp lý')
    expect(form.get_by_label('Phân loại thuê sở hữu', exact=True)).to_have_value('24')
    form.get_by_label('Phân loại thuê sở hữu', exact=True).select_option('6')
    form.get_by_role('button', name='Lưu hồ sơ hợp đồng', exact=True).click()
    expect(form).to_contain_text('Đã lưu hồ sơ')
    assert profiles[-1]['profile']['ownership_term_months'] == '6'
    assert 'end_date' not in profiles[-1]['profile'] and 'total_amount' not in profiles[-1]['profile']
    page.keyboard.press('Escape')
    go('/contracts')
    page.locator('.mg-mobile-record-card').filter(has_text='OWN-QA-901').locator('.mg-row-menu-trigger').click()
    page.get_by_role('menuitem', name='Điền và in hợp đồng', exact=True).click()
    tab('Hợp đồng & pháp lý')
    expect(form.get_by_label('Phân loại thuê sở hữu', exact=True)).to_have_value('6')
    page.keyboard.press('Escape')
    checks.append('Ownership 6/12/24 labels are manual and persist for issued contracts, without changing dates/money, offering schedules, or blocking ordinary renewal')
    page.set_viewport_size(dict(width=1440, height=1000))
    go('/login')
    expect(page).to_have_url(args.url + '/vehicles')
    expect(page.get_by_role('button', name='Xuất CSV', exact=True)).to_be_visible()
    expect(page.locator('.mg-mobile-bottom-nav')).not_to_be_visible()
    checks.append('Desktop login preserves vehicle dashboard and visible data actions')
    assert not errors, errors
    assert not unexpected, unexpected
    browser.close()

result = dict(passed=len(checks), checks=checks, javascriptErrors=errors, unexpectedRequestsBlocked=unexpected, realBusinessWrites=0)
(out / 'results.json').write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps(result, indent=2, ensure_ascii=False))
