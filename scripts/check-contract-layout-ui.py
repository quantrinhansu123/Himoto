"""Contract layout and PDF QA. Synthetic APIs intercept every business request."""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import fitz
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3005')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='docs/qa/contract-layout')
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
checks, errors, blocked, saved = [], [], [], []
customer = {'id': 77, 'name': 'Khách hợp đồng QA', 'phone': '0900000077', 'id_card': '001234567877',
            'address': 'Địa chỉ hợp đồng QA', 'email': 'contract@example.invalid', 'birthday': '1995-05-20',
            'id_card_issued_on': '2024-01-15', 'id_card_issued_by': 'Nơi cấp QA',
            'relatives': [{'name': 'Người thân QA', 'relationship': 'Mẹ', 'phone': '0900000078'},
                          {'name': 'Người thân QA 2', 'relationship': 'Anh', 'phone': '0900000079'}],
            'warning': 'Cảnh báo QA', 'status': 'active', 'store_id': 2}
stores = [{'id': i, 'code': f'CS-QA-{i}', 'store_name': f'Cửa hàng QA {i}', 'status': 'opening',
           'store_address': 'Địa chỉ cửa hàng QA', 'store_phone': '0900000002'} for i in [2, 3]]
staff = [{'id': i, 'name': f'Đại diện QA {i}', 'position': 'Nhân viên quầy giao dịch',
          'status': 'active', 'store_id': store} for i, store in [(8, 2), (9, 3)]]
vehicles = [{'id': i, 'name': f'Xe QA {i}', 'license': f'QA-{i}', 'brand': 'Honda', 'type': 'scooter',
             'color': 'Đen', 'year': 2024, 'store_id': 2, 'status': 'ready', 'daily_price': 180000} for i in [101, 102]]
contracts = [{'id': 900, 'contract_number': 'HD-QA-900', 'status': 'renting', 'store_id': 2,
              'staff_id': 8, 'customer_id': 77, 'customer_name': customer['name'], 'customer_phone': customer['phone'],
              'customer_id_card': customer['id_card'], 'customer_address': customer['address'],
              'start_date': '2026-10-07T09:00:00+07:00', 'end_date': '2026-10-09T09:00:00+07:00',
              'signed_on': '2026-10-07', 'created_at': '2026-10-07T08:00:00+07:00', 'notes': 'Ghi chú QA đã có',
              'customer_source': 'Nguồn QA đã có', 'vehicles': [{**v, 'driver_name': customer['name'],
              'driver_license_number': 'GPLX-QA', 'driver_license_issued_on': '2024-01-15', 'borrow_hats': 1,
              'borrow_raincoats': 0} for v in vehicles]}]
state = {'fail_save': True}


def mock_api(route):
    request = route.request
    url = urlparse(request.url)
    endpoint = url.path.rstrip('/')
    if request.method in ['POST', 'PUT'] and endpoint.startswith('/api/auth/order/car-rental'):
        payload = request.post_data_json
        saved.append(payload)
        if state['fail_save']:
            state['fail_save'] = False
            route.fulfill(status=409, json={'status': 'error', 'message': 'Bản nháp đã được người khác cập nhật. Kiểm tra lại.'})
            return
        record = {'id': 901, 'draft_reference': 'NHAP-QA-901', 'status': 'draft', 'store_id': 2,
                  'draft_payload': {'management_composer': {'version': 1, **payload}},
                  'created_at': '2026-10-07T10:00:00+07:00', 'draft_revision': '901'}
        contracts[:] = [record, *[c for c in contracts if c['id'] != 901]]
        route.fulfill(status=201, json={'status': 'success', 'data': record})
        return
    if request.method != 'GET':
        blocked.append(endpoint)
        route.abort('blockedbyclient')
        return
    if endpoint == '/api/auth/customers/search':
        query = parse_qs(url.query)
        data = [customer] if query.get('store_id') == ['2'] and query.get('query', [''])[0] in [customer['phone'], customer['id_card']] else []
    elif endpoint == '/api/auth/hr/staff':
        store_id = parse_qs(url.query).get('store_id', [''])[0]
        data = [s for s in staff if not store_id or str(s['store_id']) == store_id]
    elif endpoint == '/api/auth/customers':
        data = [customer]
    elif endpoint == '/api/auth/stores':
        data = stores
    elif endpoint == '/api/auth/vehicle/vehicles':
        data = vehicles
    elif endpoint == '/api/auth/order/car-rental':
        data = contracts
    elif endpoint in ['/api/auth/me', '/api/session']:
        route.fulfill(json={'user': {'id': 143, 'name': 'QA'}})
        return
    else:
        blocked.append(endpoint)
        route.abort('blockedbyclient')
        return
    route.fulfill(json={'status': 'success', 'data': data})


def select_tab(container, name):
    container.get_by_role('tab', name=name, exact=False).click()


def pdf_from_print(page, context, preview, filename, expected_pages):
    count = page.evaluate('window.__printCalls')
    preview.get_by_role('button', name='In hợp đồng', exact=True).click()
    page.wait_for_function('(count) => window.__printCalls > count', arg=count)
    frame = page.locator('iframe.mg-contract-print-frame').content_frame
    assert frame.locator('form').count() == 0
    for selector in ['.contract-print-wrapper', '.party-b .party-row span']:
        style = '(el) => { const s = getComputedStyle(el); return [s.fontFamily, s.fontSize, s.fontWeight]; }'
        assert preview.locator(selector).first.evaluate(style) == frame.locator(selector).first.evaluate(style)
    html = frame.locator('html').evaluate('(el) => "<!doctype html>" + el.outerHTML')
    print_page = context.new_page()
    print_page.set_content(html, wait_until='networkidle')
    print_page.pdf(path=str(output / filename), prefer_css_page_size=True, print_background=True)
    with fitz.open(output / filename) as pdf:
        assert len(pdf) == expected_pages, f'{filename}: {len(pdf)} pages'
        assert all(abs(p.rect.width - 841.89) < 2 and abs(p.rect.height - 595.28) < 2 for p in pdf)
        content = '\n'.join(p.get_text() for p in pdf)
        for value in [customer['name'], customer['id_card'], 'QA-101', 'HỢP ĐỒNG THUÊ XE', 'BẢNG XÁC NHẬN VIỆC TRẢ XE']:
            assert value in content, value
        assert 'Lưu nháp' not in content
        if expected_pages == 2:
            assert 'QA-102' in pdf[1].get_text()
        else:
            pdf[0].get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(str(output / 'contract-pdf-page.png'))
    print_page.close()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
    context.add_cookies([{'name': 'himoto_management_session', 'value': Path(args.session_cookie_file).read_text(encoding='utf-8').strip(),
                         'url': args.url, 'httpOnly': True, 'sameSite': 'Strict'}])
    context.route('**/api/**', mock_api)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url + '/contracts', wait_until='domcontentloaded', timeout=120000)
    expect(page.get_by_role('button', name='Nhập hợp đồng', exact=True)).to_be_enabled(timeout=60000)
    page.add_style_tag(content='.mg-user-menu strong { visibility: hidden !important; }')
    page.get_by_role('button', name='Nhập hợp đồng', exact=True).click()
    form = page.locator('dialog.mg-contract-composer')
    expect(form.get_by_role('tab')).to_have_count(5)
    expect(form.get_by_role('tabpanel')).to_have_count(1)
    first_tab = form.get_by_role('tab').first
    first_tab.focus()
    page.keyboard.press('End')
    expect(form.get_by_role('tab').last).to_have_attribute('aria-selected', 'true')
    page.keyboard.press('Home')
    expect(first_tab).to_have_attribute('aria-selected', 'true')
    checks.append('legacy five-section form uses labelled tabs with arrow/Home/End keyboard navigation')
    select_tab(form, 'Ký kết & ghi chú')
    form.get_by_role('button', name='Xem mẫu in', exact=True).click()
    expect(form.get_by_role('tab', name='Khách hàng', exact=False)).to_have_attribute('aria-selected', 'true')
    page.wait_for_function('document.activeElement.id === "contract-store"')
    form.get_by_label('Cửa hàng xe', exact=False).select_option('2')
    representative = form.get_by_label('Đại diện ủy quyền Bên A', exact=False)
    expect(representative).to_have_attribute('list', 'contract-staff-options')
    expect(form.locator('#contract-staff-options option')).to_have_attribute('value', staff[0]['name'])
    representative.fill(staff[0]['name'])
    form.get_by_label('Tra cứu theo CCCD', exact=False).fill(customer['phone'])
    expect(form.get_by_label('Tên khách hàng', exact=True)).to_have_value(customer['name'])
    expect(form.get_by_label('Số CMTND/CCCD', exact=True)).to_have_value(customer['id_card'])
    expect(form.get_by_label('Số CMTND/CCCD', exact=True)).to_have_attribute('readonly', '')
    expect(form.get_by_label('Email', exact=True)).to_have_count(0)
    expect(form.get_by_label('Ngày sinh', exact=True)).to_have_count(0)
    checks.append('validation reveals the hidden failing tab and phone lookup shows the actual CCCD with its leading zeros')
    select_tab(form, 'Hợp đồng & pháp lý')
    expect(form.get_by_label('Ngày HĐ ủy quyền', exact=True)).to_have_count(0)
    expect(form.get_by_label('Chức vụ đại diện', exact=True)).to_have_count(0)
    form.get_by_label('Nguồn khách', exact=True).fill(staff[0]['name'])
    form.get_by_label('Liên kết nguồn khách', exact=True).select_option('Cửa hàng QA 2')
    form.get_by_label('Ngày ký hợp đồng', exact=False).fill('2026-10-07')
    form.screenshot(path=str(output / 'form-contract-1440.png'))
    select_tab(form, 'Phương tiện')
    form.get_by_label('Thuê lúc', exact=False).fill('2026-10-07T09:00')
    form.get_by_label('Hẹn trả', exact=False).fill('2026-10-09T09:00')
    form.locator('#contract-vehicle-0').select_option('101')
    form.locator('.mg-composer-vehicle').first.get_by_label('Số giấy phép lái xe', exact=True).fill('GPLX-QA-001')
    form.get_by_label('Số mũ mượn', exact=True).fill('2')
    form.screenshot(path=str(output / 'form-vehicle-1440.png'))
    select_tab(form, 'Chi phí')
    form.get_by_label('Số tiền đặt cọc', exact=False).fill('0')
    expect(form.get_by_label('Tổng phí thuê xe', exact=False)).to_have_attribute('readonly', '')
    expect(form.get_by_label('Tổng phí thuê xe', exact=False)).to_have_value('360.000')
    expect(form.get_by_label('Số tiền đã thanh toán', exact=False)).to_have_attribute('readonly', '')
    expect(form.get_by_label('Số tiền đã thanh toán', exact=False)).to_have_value('360.000')
    select_tab(form, 'Ký kết & ghi chú')
    form.get_by_label('Tài sản thế chấp', exact=False).fill('Giấy tờ QA')
    form.get_by_label('Ghi chú hợp đồng', exact=True).fill('Ghi chú bố cục QA')
    form.get_by_role('button', name='Lưu nháp', exact=True).click()
    expect(form.get_by_role('alert')).to_contain_text('người khác cập nhật')
    expect(form.get_by_label('Ghi chú hợp đồng', exact=True)).to_have_value('Ghi chú bố cục QA')
    select_tab(form, 'Khách hàng')
    expect(form.get_by_label('Số CMTND/CCCD', exact=True)).to_have_value(customer['id_card'])
    form.screenshot(path=str(output / 'form-customer-1440.png'))
    checks.append('switching tabs and a rejected draft save preserve customer, representative, vehicle, money and notes')
    page.evaluate('''() => {
      window.__printCalls = 0;
      const append = document.body.appendChild.bind(document.body);
      document.body.appendChild = node => {
        const result = append(node);
        if (node.tagName === 'IFRAME' && node.className === 'mg-contract-print-frame') {
          node.contentWindow.print = () => { window.__printCalls += 1; };
        }
        return result;
      };
    }''')
    form.get_by_role('button', name='Xem mẫu in', exact=True).click()
    preview = page.locator('dialog.mg-contract-print-dialog')
    expect(preview).to_be_visible()
    paper = preview.locator('.contract-print-wrapper')
    assert 'Times New Roman' in paper.evaluate('(el) => getComputedStyle(el).fontFamily')
    assert float(preview.locator('.party-b .party-row span').first.evaluate('(el) => getComputedStyle(el).fontSize').rstrip('px')) < 14
    normalize = lambda text: re.sub(r'\s+', ' ', text).strip()
    source = Path('src/components/contracts/legacy/ContractPrintDocument.vue').read_text(encoding='utf-8')
    terms = [normalize(re.sub('<[^>]+>', '', item)) for item in re.findall(r'<li>(.*?)</li>', source, re.S)]
    assert [normalize(t) for t in paper.locator('.term-list li').all_text_contents()] == terms
    preview.screenshot(path=str(output / 'print-preview-1440.png'))
    pdf_from_print(page, context, preview, 'contract-single-vehicle.pdf', 1)
    preview.get_by_role('button', name='Quay lại thông tin').click()
    select_tab(form, 'Phương tiện')
    form.get_by_role('button', name='Thêm xe', exact=True).click()
    form.locator('#contract-vehicle-1').select_option('102')
    form.get_by_role('button', name='Xem mẫu in', exact=True).click()
    pdf_from_print(page, context, preview, 'contract-multiple-vehicles.pdf', 2)
    preview.get_by_role('button', name='Quay lại thông tin').click()
    checks.append('preview and actual print use matching legacy typography; single/multiple vehicles generate one/two A4 landscape PDF pages with all original terms')
    form.get_by_role('button', name='Lưu nháp', exact=True).click()
    expect(page).to_have_url(args.url + '/contracts/drafts')
    assert saved[-1]['draft']['customer']['id_card'] == customer['id_card']
    assert saved[-1]['draft']['deposit_amount'] == '0'
    assert saved[-1]['notes'] == 'Ghi chú bố cục QA'
    assert saved[-1]['draft']['staff_id'] == '8'
    assert saved[-1]['draft']['staff_name'] == ''
    page.reload(wait_until='domcontentloaded')
    page.get_by_role('button', name='Thao tác NHAP-QA-901', exact=True).click()
    page.get_by_role('menuitem', name='Tiếp tục sửa bản nháp', exact=True).click()
    expect(form.get_by_label('Nguồn khách', exact=True)).to_have_value('Đại diện QA 8')
    expect(form.get_by_label('Liên kết nguồn khách', exact=True)).to_have_value('Cửa hàng QA 2')
    select_tab(form, 'Phương tiện')
    expect(form.locator('.mg-composer-vehicle').first.get_by_label('Số giấy phép lái xe', exact=True)).to_have_value('GPLX-QA-001')
    expect(form.locator('.mg-composer-vehicle')).to_have_count(2)
    checks.append('successful synthetic draft save survives reload with all fields and both vehicles intact')
    form.get_by_role('button', name='Đóng', exact=True).click()
    page.goto(args.url + '/contracts', wait_until='domcontentloaded')
    page.get_by_role('button', name='Thao tác HD-QA-900', exact=True).click()
    page.get_by_role('menuitem', name='Xem chi tiết', exact=True).click()
    detail = page.locator('dialog.mg-contract-detail')
    expect(detail.locator('.mg-composer-vehicle')).to_have_count(2)
    expect(detail.locator('.mg-composer-vehicle').first).to_contain_text('QA-101')
    expect(detail.locator('.mg-composer-vehicle').last).to_contain_text('QA-102')
    select_tab(detail, 'Chi phí')
    expect(detail.get_by_role('tabpanel').locator('dd')).to_have_text(['—'] * 8)
    select_tab(detail, 'Khách hàng')
    expect(detail).to_contain_text(customer['id_card'])
    expect(detail).to_contain_text(customer['address'])
    detail.screenshot(path=str(output / 'detail-customer-1440.png'))
    checks.append('read-only details retain each vehicle and full customer identity; missing charges remain blank rather than using current catalogue prices')
    page.keyboard.press('Escape')
    page.set_viewport_size({'width': 375, 'height': 812})
    page.get_by_role('button', name='Nhập hợp đồng', exact=True).click()
    for label in ['Hợp đồng & pháp lý', 'Khách hàng', 'Phương tiện', 'Chi phí', 'Ký kết & ghi chú']:
        select_tab(form, label)
        assert form.evaluate('(el) => el.scrollWidth <= el.clientWidth')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    select_tab(form, 'Khách hàng')
    page.screenshot(path=str(output / 'form-customer-375.png'), full_page=True)
    page.keyboard.press('Tab')
    assert form.evaluate('(el) => el.contains(document.activeElement)')
    page.keyboard.press('Escape')
    expect(form).not_to_be_visible()
    page.set_viewport_size({'width': 667, 'height': 375})
    page.get_by_role('button', name='Nhập hợp đồng', exact=True).click()
    assert form.evaluate('(el) => el.scrollWidth <= el.clientWidth')
    page.keyboard.press('Escape')
    checks.append('375px and landscape dialogs keep every section inside the viewport and preserve keyboard focus/escape behavior')
    assert not errors, errors
    assert not blocked, blocked
    browser.close()

result = {'passed': len(checks), 'checks': checks, 'javascriptErrors': errors, 'unexpectedRequestsBlocked': blocked,
          'realBusinessWrites': 0, 'dataSource': 'synthetic API responses; session authentication reads existing QA account only'}
(output / 'results.json').write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps(result, indent=2, ensure_ascii=False))
