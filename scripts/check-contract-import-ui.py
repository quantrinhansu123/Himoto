"""Resume an imported draft using synthetic APIs; no business request reaches DB."""
import argparse
import copy
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3009')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='docs/qa/contract-import')
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
checks, errors, unexpected, saves = [], [], [], []
customer = dict(id=77, name='Khách nhập nháp QA', phone='0900000077', id_card='', address='', status='draft', store_id=2)
vehicle = dict(id=101, name='Xe nhập nháp QA', license='QA-101', status='ready', store_id=2, daily_price=180000)
draft = {key: '' for key in ['contract_number', 'signed_on', 'store_id', 'staff_id', 'start_date', 'end_date', 'unit_price',
    'total_amount', 'paid_amount', 'deposit_amount', 'package_name', 'payment_method', 'deposit_payment_method',
    'collateral_description', 'customer_source', 'customer_source_url', 'authorization_date']}
draft.update(contract_number='EXCEL-QA-901', store_id='2', customer_id=77, start_date='2026-10-07T09:00',
    end_date='2026-10-09T09:00', total_amount='750000', paid_amount='200000')
draft['customer'] = {key: '' for key in ['name', 'phone', 'email', 'address', 'id_card', 'id_card_issued_on',
    'id_card_issued_by', 'birthday', 'relatives_text', 'warning_note']}
draft['customer'].update(name=customer['name'], phone=customer['phone'])
draft['vehicles'] = [{key: '' for key in ['id', 'name', 'license', 'brand', 'type_text', 'color', 'year',
    'driver_name', 'driver_license_number', 'driver_license_issued_on', 'rent_at', 'return_at']}]
draft['vehicles'][0].update(id='101', name=vehicle['name'], license=vehicle['license'], borrow_hats='0', borrow_raincoats='0')
record = dict(id=901, draft_reference='EXCEL-QA-901', status='draft', store_id=2, store_name='Cơ sở nhập QA',
    created_at='2026-10-07T10:00:00+07:00', total_amount=0, paid_amount=0, deposit_amount=None,
    draft_revision='901', draft_payload={'management_composer': {'version': 1, 'draft': draft,
    'status': 'draft', 'rental_type': 'rental', 'notes': 'Ghi chú nguồn QA'}})


def mock_api(route):
    request = route.request
    endpoint = urlparse(request.url).path.rstrip('/')
    if request.method == 'PUT' and endpoint == '/api/auth/order/car-rental/901':
        payload = request.post_data_json
        saves.append(copy.deepcopy(payload))
        assert payload['status'] == 'draft' and payload['revision'] == record['draft_revision']
        record['draft_payload']['management_composer'] = {'version': 1, **payload}
        record['draft_revision'] = '902'
        route.fulfill(json={'status': 'success', 'data': record})
        return
    if request.method != 'GET':
        unexpected.append(endpoint)
        route.abort('blockedbyclient')
        return
    if endpoint in ['/api/session', '/api/auth/me']:
        route.fulfill(json={'user': {'id': 143, 'name': 'QA'}})
        return
    endpoints = {'/api/auth/order/car-rental': [record], '/api/auth/customers': [customer],
        '/api/auth/stores': [dict(id=2, store_name='Cơ sở nhập QA', status='opening')],
        '/api/auth/vehicle/vehicles': [vehicle], '/api/auth/hr/staff': []}
    if endpoint not in endpoints:
        unexpected.append(endpoint)
        route.abort('blockedbyclient')
        return
    route.fulfill(json={'status': 'success', 'data': endpoints[endpoint]})


with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, timezone_id='Asia/Ho_Chi_Minh')
    context.add_cookies([dict(name='himoto_management_session', value=Path(args.session_cookie_file).read_text(encoding='utf-8').strip(),
        url=args.url, httpOnly=True, sameSite='Strict')])
    context.route('**/api/**', mock_api)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url + '/contracts/drafts', wait_until='domcontentloaded', timeout=120000)
    expect(page.locator('.mg-title-count')).to_have_text('1', timeout=30000)
    page.add_style_tag(content='.mg-user-menu strong { visibility: hidden !important; }')
    page.get_by_role('button', name='Sửa EXCEL-QA-901', exact=True).click()
    form = page.locator('dialog.mg-contract-composer')

    def tab(name):
        form.get_by_role('tab', name=name, exact=False).click()

    tab('Khách hàng')
    expect(form.get_by_label('Cửa hàng xe', exact=False)).to_have_value('2')
    expect(form.get_by_label('Tên khách hàng', exact=True)).to_have_value(customer['name'])
    expect(form.get_by_label('SĐT', exact=True)).to_have_value(customer['phone'])
    expect(form.get_by_label('Số CMTND/CCCD', exact=True)).to_have_value('')
    tab('Phương tiện')
    expect(form.get_by_label('Chọn xe', exact=False)).to_have_value('101')
    checks.append('Log opens the saved customer, vehicle and branch; incomplete identity remains blank')
    tab('Chi phí')
    expect(form.get_by_label('Tổng phí thuê xe (VNĐ)', exact=True)).to_have_value('750000')
    expect(form.get_by_label('Số tiền đã thanh toán (VNĐ)', exact=True)).to_have_value('200000')
    expect(form.get_by_label('Số tiền đặt cọc (VNĐ)', exact=True)).to_have_value('')
    expect(form.get_by_label('Đơn giá áp dụng (VNĐ)', exact=True)).to_have_value('')
    page.screenshot(path=str(output / 'draft-costs-1440.png'), full_page=True)
    checks.append('source total and paid survive reload; deposit and unit price remain unknown despite a master daily price')
    tab('Hợp đồng & pháp lý')
    expect(form.get_by_label('Ngày ký hợp đồng', exact=False)).to_have_value('')
    form.get_by_role('button', name='Xem mẫu in', exact=True).click()
    expect(form.locator('[aria-invalid="true"]')).not_to_have_count(0)
    expect(page.locator('dialog.mg-contract-print-preview')).to_have_count(0)
    checks.append('missing identity, representative and signed date prevent producing an issued contract')
    tab('Ký kết & ghi chú')
    form.get_by_label('Ghi chú hợp đồng', exact=True).fill('Bổ sung tiếp QA')
    form.get_by_role('button', name='Lưu nháp', exact=True).click()
    expect(form).not_to_be_visible()
    assert len(saves) == 1
    assert saves[0]['draft']['deposit_amount'] == '' and saves[0]['draft']['paid_amount'] == '200000'
    page.reload()
    page.get_by_role('button', name='Sửa EXCEL-QA-901', exact=True).click()
    page.add_style_tag(content='.mg-user-menu strong { visibility: hidden !important; }')
    tab('Ký kết & ghi chú')
    expect(form.get_by_label('Ghi chú hợp đồng', exact=True)).to_have_value('Bổ sung tiếp QA')
    checks.append('incomplete imported draft can be resumed and saved to the same ID with a revision')
    page.set_viewport_size({'width': 375, 'height': 812})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert form.evaluate('(element) => element.scrollWidth <= element.clientWidth')
    page.screenshot(path=str(output / 'draft-resume-375.png'), full_page=True)
    checks.append('375px imported draft has no horizontal overflow')
    assert not errors and not unexpected, (errors, unexpected)
    browser.close()

result = dict(passed=len(checks), checks=checks, intercepted_saves=len(saves), business_writes=0, browser_errors=errors)
(output / 'results.json').write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps(result, indent=2, ensure_ascii=True))
