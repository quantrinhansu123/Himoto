"""Custom contract catalog and linked battery/charger QA. Business APIs are mocked."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3102')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--browser', choices=['chromium', 'webkit'], default='chromium')
parser.add_argument('--output', default='docs/qa/contract-types')
args = parser.parse_args()
out = Path(args.output) / args.browser
out.mkdir(parents=True, exist_ok=True)
checks, writes, errors, unexpected = [], [], [], []
catalog = [dict(id=key, label=label, rental_type=key, term_months=None, active=True, revision='1')
           for key, label in [('daily', 'Thuê theo ngày'), ('monthly', 'Thuê theo tháng'), ('ownership', 'Thuê sở hữu')]]
stores = [dict(id=35, store_name='CS Thuê sở hữu QA', kind='lease_to_own', status='opening', store_address='Địa chỉ QA', store_phone='0900000090')]
customer = dict(id=7, name='Khách danh mục QA', phone='0900000011', id_card='001234567890', status='active', store_id=35,
                store_name=stores[0]['store_name'], address='Địa chỉ khách QA', relatives=[])
vehicles = [dict(id=100, name='Xe điện QA', license='QA-100', brand='Vinfast', type='xe_dien', year=2026, color='Đen',
                 store_id=35, current_store_id=35, store_name=stores[0]['store_name'], status='ready', daily_price=200000, monthly_price=3000000, rentals=[])]
source = dict(id=901, contract_number='QA-XE-901', status='renting', rental_type='ownership', store_id=35, store_kind='lease_to_own',
              customer_id=7, customer_name=customer['name'], customer_phone=customer['phone'], customer_id_card=customer['id_card'],
              customer_address=customer['address'], vehicles=vehicles, start_date='2026-10-01T13:46', end_date='2028-10-01T13:46',
              total_amount=3000000, paid_amount=0, deposit_amount=0, deposit_paid=0, draft_revision='1')
contracts, batteries = [source], []
accounts = [dict(id=5, label='Két QA', kind='cash', store_id=35, owner_type='', status='Active', opening_balance=0, income=0, expense=0, balance=0)]


def mock(route):
    req = route.request
    parsed = urlparse(req.url)
    endpoint = parsed.path
    params = parse_qs(parsed.query)
    if req.method not in ['GET', 'HEAD']:
        body = req.post_data_json
        writes.append(dict(path=endpoint, method=req.method, body=body))
        if endpoint == '/api/auth/contract-types':
            if req.method == 'POST':
                catalog.append(dict(id='custom_qa24', **body, revision='2'))
            else:
                found = next(t for t in catalog if t['id'] == body['id'])
                found.update(label=body['label'], active=body['active'], revision=str(int(found['revision']) + 1))
            data = catalog
        elif endpoint == '/api/auth/order/car-rental' and req.method == 'POST':
            data = dict(id=902, draft_reference='NHAP-QA-902', status='draft', rental_type=body['rental_type'],
                        store_id=35, store_kind='lease_to_own', draft_revision='902', total=0, paid_amount=0, deposit_paid=0,
                        draft_payload=dict(management_composer=dict(version=1, **body)))
            contracts.append(data)
        elif endpoint.startswith('/api/auth/battery-contracts'):
            assert body['vehicle_contract_id'] == 901
            assert 'vehicle_contract_code' not in body
            data = dict(**{k: v for k, v in body.items() if k not in ['request_id', 'revision']}, id=501, code='P-QA-501', revision='2',
                        vehicle_contract_code='QA-XE-901', store_name=stores[0]['store_name'], store_address='Địa chỉ QA', store_phone='0900000090')
            batteries[:] = [data]
        else:
            unexpected.append(endpoint)
            route.abort()
            return
        route.fulfill(json=dict(status='success', data=data))
        return
    if endpoint == '/api/auth/contract-types': data = catalog
    elif endpoint == '/api/auth/stores': data = stores
    elif endpoint in ['/api/auth/customers', '/api/auth/customers/search']: data = [customer]
    elif endpoint == '/api/auth/vehicle/vehicles': data = vehicles
    elif endpoint == '/api/auth/hr/staff': data = []
    elif endpoint == '/api/auth/order/car-rental':
        data = [r for r in contracts if r['status'] == 'draft'] if params.get('scope') == ['drafts'] else contracts
    elif endpoint.startswith('/api/auth/record-photos/'): data = []
    elif endpoint == '/api/auth/cashbook/accounts': data = accounts
    elif endpoint == '/api/auth/battery-contracts':
        data = [r for r in batteries if str(r['vehicle_contract_id']) == params.get('vehicle_contract_id', ['901'])[0]]
    else:
        unexpected.append(endpoint)
        route.abort()
        return
    route.fulfill(json=dict(status='success', data=data))


with sync_playwright() as p:
    browser = getattr(p, args.browser).launch()
    context = browser.new_context(viewport=dict(width=1440, height=1000), timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
    context.add_cookies([dict(name='himoto_management_session', value=Path(args.session_cookie_file).read_text().strip(), url=args.url, httpOnly=True, sameSite='Strict')])
    context.route('**/api/auth/**', mock)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    def navigate(path):
        page.wait_for_load_state('networkidle')
        page.goto(args.url + path, wait_until='networkidle')
    navigate('/contracts')
    page.get_by_role('button', name='Nhập hợp đồng', exact=True).click()
    form = page.locator('dialog.mg-contract-composer')
    picker = form.locator('#contract-record-type')
    expect(picker.locator('option')).to_have_count(3)
    form.screenshot(path=str(out / 'contract-types-1440.png'))
    form.get_by_role('button', name='Thêm / quản lý loại hợp đồng', exact=True).click()
    manager = page.get_by_role('dialog', name='Loại hợp đồng', exact=True)
    manager.locator('#contract-type-label').fill('Thuê 24 tháng')
    manager.locator('#contract-type-billing').select_option('monthly')
    manager.locator('#contract-type-months').fill('24')
    page.set_viewport_size(dict(width=375, height=812))
    manager.screenshot(path=str(out / 'add-type-375.png'))
    assert manager.evaluate('el=>el.scrollWidth<=el.clientWidth+1')
    manager.get_by_role('button', name='Thêm loại hợp đồng', exact=True).click()
    expect(manager).not_to_be_visible()
    expect(picker).to_have_value('custom_qa24')
    form.get_by_role('tab', name='Phương tiện', exact=False).click()
    form.locator('#contract-start_date').fill('2024-02-29')
    expect(form.locator('#contract-end_date')).to_have_value('2026-02-28')
    form.get_by_role('tab', name='Chi phí', exact=False).click()
    expect(form.locator('#contract-package_name')).to_have_value('Theo tháng')
    expect(form.locator('#contract-package_name option')).to_have_count(1)
    page.set_viewport_size(dict(width=1440, height=1000))
    form.get_by_role('button', name='Lưu nháp', exact=True).click()
    expect(form).not_to_be_visible()
    expect(page).to_have_url(args.url + '/contracts/drafts')
    saved = next(w['body'] for w in writes if w['path'] == '/api/auth/order/car-rental')
    assert saved['rental_type'] == 'monthly'
    assert saved['draft']['contract_type_id'] == 'custom_qa24'
    assert saved['draft']['contract_type_name'] == 'Thuê 24 tháng'
    assert saved['draft']['contract_type_months'] == '24'
    checks.append('Inline add selects custom type; 24-month leap-day end date, monthly package and saved snapshot are correct')

    navigate('/contracts/types')
    page.get_by_role('button', name='Đổi tên Thuê 24 tháng', exact=True).click()
    page.locator('#contract-type-label').fill('Thuê dài hạn QA')
    expect(page.locator('#contract-type-billing')).to_be_disabled()
    page.get_by_role('button', name='Lưu tên mới', exact=True).click()
    page.get_by_role('button', name='Ẩn Thuê dài hạn QA', exact=True).click()
    page.wait_for_load_state('networkidle')
    page.reload(wait_until='networkidle')
    expect(page.get_by_role('button', name='Hiện Thuê dài hạn QA', exact=True)).to_be_visible()
    navigate('/contracts')
    page.get_by_role('button', name='Nhập hợp đồng', exact=True).click()
    expect(picker.locator('option')).to_have_count(3)
    form.get_by_role('button', name='Đóng', exact=True).click()
    navigate('/contracts/drafts')
    page.get_by_role('button', name='Thao tác NHAP-QA-902', exact=True).click()
    page.get_by_role('menuitem', name='Duyệt & hoàn tất hợp đồng', exact=True).click()
    expect(picker).to_have_value('custom_qa24')
    expect(picker.locator('option:checked')).to_have_text('Thuê 24 tháng (đã ẩn)')
    expect(form.get_by_role('button', name='Hoàn tất & thanh toán', exact=True)).to_be_visible()
    form.screenshot(path=str(out / 'historical-type-1440.png'))
    form.get_by_role('button', name='Đóng', exact=True).click()
    checks.append('Rename/hide persists after reload; new forms exclude hidden types; existing draft keeps original label and opens current finalization flow')

    navigate('/contracts')
    source_row = page.locator('tr').filter(has_text='QA-XE-901')
    source_row.get_by_role('button', name='Thao tác QA-100', exact=True).click()
    page.get_by_role('menuitem', name='Thuê pin / sạc', exact=True).click()
    battery = page.locator('dialog.mg-battery-dialog')
    expect(battery.get_by_label('Họ tên Ông/Bà', exact=False)).to_have_value(customer['name'])
    expect(battery.get_by_label('Biển số xe của khách', exact=True)).to_have_value('QA-100')
    battery.get_by_role('button', name='Pin + Sạc', exact=True).click()
    battery.get_by_label('Giá thuê (đ)', exact=True).fill('300000')
    battery.get_by_role('button', name='Lưu', exact=True).click()
    expect(battery).not_to_be_visible()
    assert batteries[0]['vehicle_contract_id'] == 901
    assert 'Sạc' in batteries[0]['battery_name']
    source_row.get_by_role('button', name='Thao tác QA-100', exact=True).click()
    page.get_by_role('menuitem', name='Xem chi tiết', exact=True).click()
    detail = page.locator('dialog.mg-contract-detail')
    detail.get_by_role('tab', name='Pin / sạc', exact=False).click()
    expect(detail.get_by_text('P-QA-501', exact=False)).to_be_visible()
    page.set_viewport_size(dict(width=375, height=812))
    detail.screenshot(path=str(out / 'battery-link-375.png'))
    detail.get_by_role('link', name='Mở danh sách pin / sạc liên kết', exact=True).click()
    expect(page).to_have_url(args.url + '/contracts/battery?vehicle_contract_id=901')
    expect(page.get_by_role('link', name='HĐ xe QA-XE-901', exact=True)).to_be_visible()
    page.set_viewport_size(dict(width=1440, height=1000))
    page.get_by_role('button', name='Thao tác P-QA-501', exact=True).click()
    page.get_by_role('menuitem', name='Sửa hợp đồng', exact=True).click()
    expect(battery.get_by_role('button', name='Pin + Sạc', exact=True)).to_have_attribute('aria-pressed', 'true')
    battery.get_by_role('button', name='Lưu', exact=True).click()
    expect(battery).not_to_be_visible()
    checks.append('Pin + charger inherits customer/vehicle, saves source ID, appears under source detail, filters and links back, and survives editing')
    page.wait_for_load_state('networkidle')
    assert not errors, errors
    assert not unexpected, unexpected
    (out / 'results.json').write_text(json.dumps(dict(browser=args.browser, checks=checks, mockedWrites=len(writes), pageErrors=errors, permanentBusinessWrites=0), ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(dict(browser=args.browser, passed=len(checks), permanentBusinessWrites=0), ensure_ascii=False))
    browser.close()
