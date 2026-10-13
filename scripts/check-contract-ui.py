"""Exercise contract autofill, inline customer creation and the actual print document."""
import argparse
import json
import re
from pathlib import Path
import fitz
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://localhost:3001')
parser.add_argument('--output', default='docs/qa/contracts-autofill')
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
checks, errors, writes = [], [], []

def normalize(text):
    return re.sub(r'\s+', ' ', text).strip()

PRINT_HTML = '''() => '<!doctype html><html lang="vi" class="himoto-printing"><head>'
  + Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'), node => node instanceof HTMLLinkElement ? `<link rel="stylesheet" href="${node.href}">` : node.outerHTML).join('')
  + '</head><body>' + document.querySelector('.himoto-print-root').outerHTML + '</body></html>' '''

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: writes.append(request.url) if '/api/' in request.url and request.method not in ['GET', 'HEAD'] else None)
    page.goto(args.url + '/contracts', wait_until='networkidle')
    page.locator('.mg-table tbody .mg-code').first.wait_for()
    page.get_by_role('button', name='Nhập hợp đồng', exact=True).click()
    form = page.locator('dialog.mg-contract-composer')
    expect(form).to_be_visible()
    expect(form.get_by_label('Nhân sự phụ trách', exact=False)).to_be_disabled()
    form.get_by_label('Cơ sở cho thuê', exact=False).select_option('1')
    expect(form.get_by_label('Nhân sự phụ trách', exact=False)).to_be_enabled()
    expect(form.get_by_label('Nhân sự phụ trách', exact=False).locator('option')).to_have_count(8)
    staff_ids = form.get_by_label('Nhân sự phụ trách', exact=False).locator('option').evaluate_all('(options) => options.map(option => option.value).filter(Boolean)')
    assert all((int(value) - 1) % 4 == 0 for value in staff_ids)
    form.get_by_label('Nhân sự phụ trách', exact=False).select_option('1')
    form.get_by_label('Cơ sở cho thuê', exact=False).select_option('2')
    expect(form.get_by_label('Nhân sự phụ trách', exact=False)).to_have_value('')
    expect(form.get_by_label('Nhân sự phụ trách', exact=False)).to_be_enabled()
    staff_ids = form.get_by_label('Nhân sự phụ trách', exact=False).locator('option').evaluate_all('(options) => options.map(option => option.value).filter(Boolean)')
    assert all((int(value) - 2) % 4 == 0 for value in staff_ids)
    form.get_by_label('Nhân sự phụ trách', exact=False).select_option('2')
    checks.append('branch dropdown scopes staff by ID and clears old staff and vehicle choices')

    identity = form.get_by_label('CCCD / CMND', exact=False)
    identity.fill('DEMO-000002')
    expect(form.locator('.mg-lookup-status')).to_contain_text('Đã tìm thấy khách hàng #2')
    for label, value in [('Họ và tên', 'Vũ Đức Minh'), ('Số điện thoại', '0900000102'), ('Email', 'khachhang2@example.test'), ('Địa chỉ', 'Địa chỉ mẫu 2, Hà Nội'), ('Ngày sinh', '1995-05-20'), ('Ngày cấp giấy tờ', '2024-01-15'), ('Nơi cấp giấy tờ', 'Nơi cấp mẫu'), ('Thông tin người thân', 'Người thân mẫu · 0900000099')]:
        expect(form.get_by_label(label, exact=True)).to_have_value(value)
    identity.fill('001')
    expect(form.get_by_label('Họ và tên', exact=True)).to_have_value('')
    expect(form.get_by_label('Họ và tên', exact=True)).to_be_disabled()
    assert form.get_by_role('button', name='Thêm khách hàng tại đây').count() == 0
    checks.append('automatic exact identity lookup fills the full profile and clears stale identity immediately')

    # Delay the first response while a second identity resolves, without touching server data.
    page.evaluate('''() => {
      const original = window.structuredClone.bind(window); let count = 0;
      window.__originalClone = original;
      window.structuredClone = value => {
        const copy = original(value); count++;
        return new Promise(resolve => setTimeout(() => resolve(copy), count === 1 ? 1300 : 30));
      };
    }''')
    identity.fill('DEMO-000006')
    page.wait_for_timeout(450)
    identity.fill('DEMO-000002')
    expect(form.locator('.mg-lookup-status')).to_contain_text('Đã tìm thấy khách hàng #2')
    page.wait_for_timeout(1000)
    expect(form.get_by_label('Họ và tên', exact=True)).to_have_value('Vũ Đức Minh')
    page.evaluate('() => { window.structuredClone = window.__originalClone; }')
    checks.append('late lookup results cannot overwrite a newer identity')

    # A transport failure must remain an error, rather than offering a duplicate customer.
    page.evaluate('() => { window.structuredClone = () => { throw new Error("Mất kết nối kiểm thử"); }; }')
    identity.fill('DEMO-000010')
    expect(form.locator('.mg-lookup-status')).to_contain_text('Mất kết nối kiểm thử')
    assert form.get_by_role('button', name='Thêm khách hàng tại đây').count() == 0
    page.evaluate('() => { window.structuredClone = window.__originalClone; }')
    form.get_by_role('button', name='Tra cứu', exact=True).click()
    expect(form.locator('.mg-lookup-status')).to_contain_text('Đã tìm thấy khách hàng #10')
    checks.append('lookup failures expose retry and never become a missing customer')

    original_url = page.url
    identity.fill('001234567890')
    expect(form.locator('.mg-lookup-status')).to_contain_text('Chưa có khách hàng')
    form.get_by_role('button', name='Thêm mới', exact=True).click()
    customer_modal = page.get_by_role('dialog', name='Thêm khách hàng tại chỗ', exact=True)
    expect(customer_modal).to_be_visible()
    expect(customer_modal.get_by_label('CCCD / CMND', exact=False)).to_have_value('001234567890')
    assert page.url == original_url
    customer_modal.get_by_role('button', name='Lưu khách hàng mẫu', exact=True).click()
    expect(customer_modal.locator('[aria-invalid="true"]')).to_have_count(3)
    page.wait_for_function('document.activeElement.id === "new-customer-name"')
    customer_modal.get_by_label('Họ và tên', exact=False).fill('Khách mới trong modal')
    customer_modal.get_by_label('Số điện thoại', exact=False).fill('0900001234')
    customer_modal.get_by_label('Địa chỉ', exact=False).fill('Địa chỉ khách mới mẫu')
    customer_modal.get_by_label('Email', exact=True).fill('modal@example.test')
    customer_modal.get_by_label('Ngày cấp giấy tờ', exact=True).fill('2025-02-20')
    customer_modal.get_by_label('Nơi cấp giấy tờ', exact=True).fill('Nơi cấp mới mẫu')
    # Duplicate identity is blocked in the popup, without closing or redirecting.
    customer_modal.get_by_label('CCCD / CMND', exact=False).fill('DEMO-000001')
    customer_modal.get_by_role('button', name='Lưu khách hàng mẫu', exact=True).click()
    expect(customer_modal.get_by_role('alert')).to_contain_text('đã có')
    customer_modal.get_by_label('CCCD / CMND', exact=False).fill('001234567890')
    customer_modal.get_by_role('button', name='Lưu khách hàng mẫu', exact=True).click()
    expect(customer_modal).to_have_count(0)
    expect(form.locator('.mg-lookup-status')).to_contain_text('Đã tìm thấy khách hàng #33')
    expect(form.get_by_label('Họ và tên', exact=True)).to_have_value('Khách mới trong modal')
    expect(form.get_by_label('Ngày cấp giấy tờ', exact=True)).to_have_value('2025-02-20')
    assert page.url == original_url
    checks.append('unknown CCCD opens a validated customer popup, blocks duplicates, and autofills without navigation')

    form.get_by_label('Xe tại cơ sở', exact=False).select_option('2')
    form.get_by_label('Thời gian bắt đầu', exact=False).fill('2026-10-06T09:15')
    form.get_by_label('Thời gian hẹn trả', exact=False).fill('2026-10-07T10:45')
    form.get_by_label('Tổng tiền thuê (VNĐ)', exact=True).fill('300000')
    form.get_by_label('Số tiền cọc ghi trên mẫu (VNĐ)', exact=True).fill('1000000')
    form.get_by_role('button', name='Xem mẫu in', exact=True).click()
    preview = page.get_by_role('dialog', name='Xem trước mẫu in hợp đồng', exact=True)
    expect(preview).to_be_visible()
    paper = preview.locator('.contract-print-wrapper')
    for text in ['Khách mới trong modal', '001234567890', 'Trần Hoài Linh', 'DEMO-002', '20/02/2025', 'Nơi cấp mới mẫu', 'HỢP ĐỒNG THUÊ XE', 'PHỤ LỤC HỢP ĐỒNG:', 'BẢN NHÁP - CHƯA PHÁT HÀNH']:
        assert text in paper.inner_text(), text
    original_template = Path('src/components/contracts/legacy/ContractPrintDocument.vue').read_text(encoding='utf-8')
    expected_terms = [normalize(re.sub('<[^>]+>', '', item)) for item in re.findall(r'<li>(.*?)</li>', original_template, re.S)]
    assert [normalize(item) for item in paper.locator('.term-list li').all_text_contents()] == expected_terms
    assert paper.locator('.return-receipt-box').inner_text().find('Giờ trả xe:') >= 0
    preview.screenshot(path=str(output / 'print-preview-1440.png'))
    checks.append('legacy template retains every appendix term, receipt, signature, mapped identity and vehicle data')

    # Invoke the real print handler while suppressing the OS print dialog in automation.
    page.evaluate('''() => {
      window.__printCalls = 0;
      window.print = () => { window.__printCalls += 1; };
    }''')
    preview.get_by_role('button', name='In hợp đồng', exact=True).click()
    expect(page.locator('.himoto-print-root')).to_have_count(1)
    page.wait_for_function('window.__printCalls === 1')
    frame = page.locator('.himoto-print-root')
    assert frame.locator('form').count() == 0
    expect(frame.locator('.contract-main-title')).to_have_text('HỢP ĐỒNG THUÊ XE')
    assert 'Khách mới trong modal' in frame.inner_text()
    html = page.evaluate(PRINT_HTML)
    print_page = context.new_page()
    print_page.set_content(html, wait_until='networkidle')
    pdf_path = output / 'contract-single-vehicle.pdf'
    print_page.pdf(path=str(pdf_path), prefer_css_page_size=True, print_background=True)
    pdf = fitz.open(pdf_path)
    assert len(pdf) == 1, f'Single vehicle printed {len(pdf)} pages'
    assert pdf[0].rect.width > pdf[0].rect.height
    pdf_text = ''.join(pdf_page.get_text() for pdf_page in pdf)
    for text in ['001234567890', 'Khách mới trong modal', 'DEMO-002', 'HỢP ĐỒNG THUÊ XE']:
        assert text in pdf_text, text
    assert 'CCCD / CMND *' not in pdf_text
    pdf[0].get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(str(output / 'contract-pdf-page.png'))
    pdf.close(); print_page.close()
    checks.append('actual print handler isolates the document and produces one A4 landscape PDF with no form chrome')

    preview.get_by_role('button', name='Quay lại thông tin').click()
    expect(page.locator('.himoto-print-root')).to_have_count(0)
    form.get_by_role('button', name='Thêm xe vào mẫu').click()
    form.locator('#contract-vehicle-1').click()
    form.locator('#contract-vehicle-1-options-6').click()
    form.get_by_role('button', name='Xem mẫu in', exact=True).click()
    expect(preview.locator('.appendix-multi-vehicles')).to_be_visible()
    expect(preview.locator('.appendix-multi-vehicles tbody tr')).to_have_count(2)
    assert 'DEMO-006' in preview.locator('.appendix-multi-vehicles').inner_text()
    preview.get_by_role('button', name='In hợp đồng', exact=True).click()
    page.wait_for_function('window.__printCalls === 2')
    html = page.evaluate(PRINT_HTML)
    print_page = context.new_page(); print_page.set_content(html, wait_until='networkidle')
    multi_path = output / 'contract-multiple-vehicles.pdf'
    print_page.pdf(path=str(multi_path), prefer_css_page_size=True, print_background=True)
    pdf = fitz.open(multi_path)
    assert len(pdf) == 2, f'Multiple vehicles printed {len(pdf)} pages'
    assert all(pdf_page.rect.width > pdf_page.rect.height for pdf_page in pdf)
    assert 'DEMO-006' in pdf[1].get_text()
    pdf.close(); print_page.close()
    checks.append('multiple vehicles create the legacy appendix on a second A4 landscape page')

    preview.get_by_role('button', name='Quay lại thông tin').click()
    form.get_by_role('button', name='Đóng', exact=True).click()
    page.get_by_role('navigation', name='Điều hướng quản lý').get_by_role('link', name='Khách hàng', exact=True).click()
    expect(page.locator('.mg-page-heading h1')).to_contain_text('Khách hàng')
    page.get_by_role('searchbox').fill('001234567890')
    expect(page.locator('.mg-table tbody tr')).to_have_count(1)
    expect(page.locator('.mg-table tbody')).to_contain_text('Khách mới trong modal')
    page.get_by_role('navigation', name='Điều hướng quản lý').get_by_role('link', name='Danh sách hợp đồng', exact=True).click()
    expect(page.locator('.mg-page-heading h1')).to_contain_text('Danh sách hợp đồng')
    page.locator('.mg-table tbody .mg-code').first.wait_for()
    page.get_by_role('button', name='Điền và in HD-2610-001', exact=True).click()
    expect(form.get_by_label('Số hợp đồng (nếu đã cấp)', exact=True)).to_have_value('HD-2610-001')
    expect(form.get_by_label('Tổng tiền thuê (VNĐ)', exact=True)).not_to_have_value('')
    checks.append('inline customer appears in the shared customer table and row printing prefills existing contract data')

    page.set_viewport_size({'width': 375, 'height': 812})
    form.screenshot(path=str(output / 'composer-375.png'))
    assert not page.evaluate('document.documentElement.scrollWidth > window.innerWidth')
    identity.fill('009876543210')
    expect(form.locator('.mg-lookup-status')).to_contain_text('Chưa có khách hàng')
    form.get_by_role('button', name='Thêm mới', exact=True).click()
    expect(customer_modal).to_be_visible()
    customer_modal.screenshot(path=str(output / 'customer-popup-375.png'))
    for _ in range(18):
        page.keyboard.press('Tab')
        assert page.evaluate('document.activeElement.closest("dialog")?.querySelector("h2")?.textContent') == 'Thêm khách hàng tại chỗ'
        page.wait_for_function('''() => {
          const active = document.activeElement;
          if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(active.tagName)) return true;
          const dialog = active.closest('dialog'), rect = active.getBoundingClientRect();
          return rect.bottom > dialog.querySelector('.mg-dialog-header').getBoundingClientRect().bottom && rect.top < dialog.querySelector('.mg-dialog-footer').getBoundingClientRect().top;
        }''', timeout=3000)
    page.keyboard.press('Escape')
    expect(customer_modal).to_have_count(0)
    expect(form).to_be_visible()
    identity.fill('DEMO-000001')
    expect(form.locator('.mg-lookup-status')).to_contain_text('Đã tìm thấy khách hàng #1')
    form.get_by_label('Nhân sự phụ trách', exact=False).select_option('1')
    form.get_by_label('Thời gian bắt đầu', exact=False).fill('2026-10-06T09:15')
    form.get_by_label('Thời gian hẹn trả', exact=False).fill('2026-10-07T10:45')
    form.get_by_role('button', name='Xem mẫu in', exact=True).click()
    expect(preview).to_be_visible()
    assert preview.locator('.mg-dialog-header button').evaluate('(button) => button.getBoundingClientRect().right <= window.innerWidth && button.getBoundingClientRect().width >= 28')
    viewport = preview.locator('.mg-contract-paper-scroll')
    page.wait_for_function('document.querySelector(".mg-contract-paper-scroll").scrollWidth <= document.querySelector(".mg-contract-paper-scroll").clientWidth + 1')
    preview.get_by_role('button', name='Phóng to mẫu in', exact=True).click()
    page.wait_for_function('document.querySelector(".mg-contract-paper-scroll").scrollWidth > document.querySelector(".mg-contract-paper-scroll").clientWidth')
    preview.get_by_role('button', name='Vừa màn hình', exact=True).click()
    assert not page.evaluate('document.documentElement.scrollWidth > window.innerWidth')
    preview.screenshot(path=str(output / 'print-preview-375.png'))
    page.keyboard.press('Escape'); expect(preview).to_have_count(0)
    page.keyboard.press('Escape'); expect(form).to_have_count(0)
    checks.append('375px form and nested popup contain keyboard focus; paper fits the phone and supports zoom without page overflow')

    assert not writes, writes
    assert not errors, errors
    checks.append('demo flow has no backend writes, rental mutations or uncaught browser errors')
    browser.close()

(output / 'functional-results.json').write_text(json.dumps({'passed': len(checks), 'checks': checks, 'browser_errors': errors, 'api_writes': writes, 'url': args.url}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'passed': len(checks), 'browser_errors': errors, 'api_writes': writes}, ensure_ascii=False))
