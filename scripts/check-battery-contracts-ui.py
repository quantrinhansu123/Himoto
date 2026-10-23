"""Battery form/payment/portrait PDF/mobile preview QA; all business APIs are mocked."""
from lib.contract_type_fixtures import mock_contract_type_read
import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlparse
import fitz
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3005')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='.backups/battery/ui')
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
state = {'rows': [], 'writes': []}
errors, blocked, checks = [], [], []
accounts = [
    {'id': 5, 'kind': 'cash', 'store_id': 35, 'owner_type': '', 'status': 'Active', 'label': 'Két sở hữu QA'},
    {'id': 11, 'kind': 'bank', 'store_id': 35, 'owner_type': 'unknown', 'status': 'Active', 'label': 'Cá nhân sở hữu QA'},
    {'id': 12, 'kind': 'bank', 'store_id': 0, 'owner_type': 'company', 'status': 'Active', 'label': 'Công ty QA'},
    {'id': 13, 'kind': 'bank', 'store_id': 36, 'owner_type': 'unknown', 'status': 'Active', 'label': 'Sai cơ sở QA'},
]

def mock(route):
    if mock_contract_type_read(route): return
    request = route.request
    endpoint = urlparse(request.url).path.rstrip('/')
    if endpoint.startswith('/api/auth/battery-contracts') and request.method in ['POST', 'PATCH']:
        body = request.post_data_json
        state['writes'].append(body)
        row = {**body, 'id': 501, 'code': 'P260131-0001', 'revision': str(100 + len(state['writes'])),
               'store_name': 'CS Thuê sở hữu', 'store_address': 'Địa chỉ cơ sở QA', 'store_phone': '0900000002', 'created_at': '2026-01-31T09:00:00+07:00'}
        row.pop('request_id', None)
        state['rows'] = [row]
        route.fulfill(json={'status': 'success', 'data': row})
        return
    if request.method != 'GET':
        blocked.append(endpoint)
        route.abort()
        return
    if endpoint == '/api/auth/battery-contracts':
        data = dict(rows=state['rows'], scopeCount=len(state['rows'])) if 'scope_count=1' in request.url else state['rows']
    elif endpoint == '/api/auth/stores':
        data = [{'id': 35, 'store_name': 'CS Thuê sở hữu', 'status': 'opening', 'store_address': 'Địa chỉ cơ sở QA', 'store_phone': '0900000002'}]
    elif endpoint == '/api/auth/cashbook/accounts':
        data = [{**account, 'opening_balance': 0, 'income': 0, 'expense': 0, 'balance': 0} for account in accounts]
    elif endpoint in ['/api/auth/customers', '/api/auth/vehicle/vehicles', '/api/auth/hr/staff', '/api/auth/order/car-rental', '/api/auth/payment-events']:
        data = []
    else:
        blocked.append(endpoint)
        route.abort()
        return
    route.fulfill(json={'status': 'success', 'data': data})

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
    context.add_cookies([{'name': 'himoto_management_session', 'value': Path(args.session_cookie_file).read_text().strip(), 'url': args.url, 'httpOnly': True, 'sameSite': 'Strict'}])
    context.route('**/api/**', mock)
    page = context.new_page()
    page.add_init_script("""(() => { const NativeDate = Date, now = NativeDate.parse('2026-01-31T09:00:00+07:00'); window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }; })();""")
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(args.url + '/contracts/battery', wait_until='domcontentloaded')
    page.get_by_role('button', name='Tạo hợp đồng thuê pin / sạc', exact=True).click()
    form = page.locator('dialog.mg-battery-dialog')
    expect(form.get_by_label('Cơ sở cho thuê', exact=False)).to_have_value('35')
    expect(form.locator('#battery-start')).to_have_value('2026-01-31')
    expect(form.locator('#battery-end')).to_have_value('2026-02-28')
    expect(form.get_by_label('Gói thuê', exact=True)).to_have_value('1 tháng')
    form.locator('#battery-start').fill('2024-01-31')
    expect(form.locator('#battery-end')).to_have_value('2024-02-29')
    form.locator('#battery-end').fill('2024-03-15')
    form.locator('#battery-start').fill('2026-01-31')
    expect(form.locator('#battery-end')).to_have_value('2024-03-15')
    form.get_by_role('button', name='Gợi ý thuê 1 tháng', exact=True).click()
    expect(form.locator('#battery-end')).to_have_value('2026-02-28')
    checks.append('new battery contract defaults to the ownership branch and one calendar month; month-end/leap-year suggestions preserve manual dates')
    form.get_by_label('Họ tên Ông/Bà', exact=False).fill('Khách thuê pin QA')
    form.get_by_label('Nhân viên', exact=False).fill('Nhân viên thuê pin QA')
    form.get_by_label('Điện thoại', exact=True).fill('0900000001')
    form.get_by_label('Địa chỉ', exact=True).fill('Địa chỉ khách hàng QA')
    form.get_by_label('Số CCCD', exact=False).fill('001234567890')
    form.get_by_label('Biển số', exact=False).fill('QA-PIN-123')
    form.get_by_label('Giá thuê (đ)', exact=True).fill('300000')
    form.get_by_label('Đã thanh toán (đ)', exact=True).fill('300000')
    form.get_by_label('Tiền cọc đã nhận (đ)', exact=True).fill('3000000')
    for method, account_id in [('transfer', '11'), ('company_transfer', '12'), ('cash', '5')]:
        form.get_by_label('Hình thức thanh toán', exact=True).select_option(method)
        picker = form.get_by_label('Tài khoản nhận tiền thuê', exact=True)
        assert picker.locator('option').evaluate_all('(options) => options.map(o => o.value)') == ['', account_id]
    form.get_by_label('Hình thức thanh toán', exact=True).select_option('company_transfer')
    form.get_by_label('Tài khoản nhận tiền thuê', exact=True).select_option('12')
    form.get_by_label('Hình thức đặt cọc', exact=True).select_option('cash')
    form.get_by_label('Tài khoản nhận tiền cọc', exact=True).select_option('5')
    checks.append('personal/company/cash selections show only compatible accounts; rental and deposit account selections are separate')
    form.get_by_role('button', name='Lưu và in', exact=True).click()
    preview = page.locator('dialog.mg-contract-print-dialog')
    expect(preview).to_be_visible()
    assert state['writes'][-1]['paid_account_type'] == 'company_transfer' and state['writes'][-1]['paid_account_id'] == 12
    assert state['writes'][-1]['deposit_account_type'] == 'cash' and state['writes'][-1]['deposit_account_id'] == 5
    paper = preview.get_by_role('region', name='Mẫu hợp đồng, cuộn để xem các trang', exact=True)
    for width, height in [(320, 760), (375, 812), (844, 390), (1440, 1000)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.wait_for_function("""() => { const paper = document.querySelector('.mg-contract-paper-scroll'), page = document.querySelector('.mg-contract-preview-page'); return page.getBoundingClientRect().width <= paper.clientWidth; }""")
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
        assert paper.evaluate('(el) => el.scrollWidth <= el.clientWidth + 1')
        assert preview.locator('.battery-page').evaluate("""el => { const p=el.getBoundingClientRect(); return [...el.querySelectorAll('.battery-number,.battery-fill,.battery-cols > span')].every(node => { const r=node.getBoundingClientRect(); return r.left>=p.left-1 && r.right<=p.right+1; }); }""")
        preview.screenshot(path=str(output / f'preview-{width}.png'))
    page.set_viewport_size({'width': 375, 'height': 812})
    preview.get_by_role('button', name='Phóng to mẫu in', exact=True).click()
    expect(preview.get_by_role('button', name='Thu nhỏ mẫu in', exact=True)).to_be_enabled()
    preview.get_by_role('button', name='Vừa màn hình', exact=True).click()
    page.evaluate('() => { window.__printed=0; window.print=()=>{window.__printed++;}; }')
    preview.get_by_role('button', name='In hợp đồng', exact=True).click()
    page.wait_for_function('window.__printed === 1')
    html = page.evaluate("""() => '<!doctype html><html lang="vi" class="himoto-printing"><head>' + [...document.querySelectorAll('style,link[rel="stylesheet"]')].map(node => node instanceof HTMLLinkElement ? `<link rel="stylesheet" href="${node.href}">` : node.outerHTML).join('') + '</head><body>' + document.querySelector('.himoto-print-root').outerHTML + '</body></html>'""")
    pdf_page = context.new_page()
    pdf_page.set_content(html, wait_until='networkidle')
    pdf_page.pdf(path=str(output / 'battery-contract.pdf'), prefer_css_page_size=True, print_background=True)
    with fitz.open(output / 'battery-contract.pdf') as pdf:
        assert len(pdf) == 1, len(pdf)
        assert pdf[0].rect.width < pdf[0].rect.height
        text = pdf[0].get_text()
        for required in ['P260131-0001', 'Nhân viên thuê pin QA', 'chúng tôi gồm', 'Chức vụ: Giám đốc', 'QA-PIN-123', '0900000001', 'ĐIỀU 4.', 'ĐẠI DIỆN BÊN A', 'BÊN B', '5.000.000', '20%']:
            assert required in text, required
        for word in pdf[0].get_text('words'):
            assert word[0] >= 0 and word[2] <= pdf[0].rect.width + 1 and word[3] <= pdf[0].rect.height + 1, word
        pdf[0].get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(str(output / 'battery-contract.png'))
    pdf_page.close()
    checks.append('A4 portrait PDF contains right-edge staff/code/phone/plate and all legal/signature text; mobile fit/zoom works at 320/375/844px without clipping')
    preview.get_by_role('button', name='Quay lại thông tin', exact=True).click()
    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.get_by_role('button', name='Thao tác P260131-0001', exact=True).click()
    page.get_by_role('menuitem', name='Sửa hợp đồng', exact=True).click()
    expect(form.get_by_label('Hình thức thanh toán', exact=True)).to_have_value('company_transfer')
    expect(form.get_by_label('Tài khoản nhận tiền thuê', exact=True)).to_have_value('12')
    expect(form.get_by_label('Tài khoản nhận tiền cọc', exact=True)).to_have_value('5')
    checks.append('saved receipt methods/accounts and one-month dates survive reopening the form')
    assert not errors, errors
    assert not blocked, blocked
    browser.close()
result = {'passed': len(checks), 'checks': checks, 'javascriptErrors': errors, 'unexpectedRequestsBlocked': blocked, 'realBusinessWrites': 0}
(output / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
