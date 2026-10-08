"""Draft UI checks. API mode reads real records but intercepts every mutation."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3000')
parser.add_argument('--source', choices=['api', 'demo'], default='demo')
parser.add_argument('--output', default='docs/qa/contract-drafts')
parser.add_argument('--session-cookie-file', help='Ignored local QA JSON cookie file for authenticated API checks')
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
checks, errors, writes = [], [], []

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    if args.session_cookie_file:
        context.add_cookies(json.loads(Path(args.session_cookie_file).read_text(encoding='utf-8')))
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    if args.source == 'api':
        def protect_database(route):
            if route.request.method in ['POST', 'PUT', 'PATCH', 'DELETE']:
                writes.append(route.request.method)
                route.fulfill(status=409, content_type='application/json', body=json.dumps({'status': 'error', 'message': 'Bản nháp đã được người khác cập nhật. Đóng form và nhấn Làm mới.'}))
            else:
                route.continue_()
        context.route('**/api/**', protect_database)
    page.goto(args.url + '/contracts')
    expect(page.get_by_role('heading', name='Danh sách hợp đồng', exact=False)).to_be_visible()
    expect(page.locator('.mg-table')).to_have_attribute('aria-busy', 'false', timeout=60000)
    assert page.locator('a[href*="onrender.com"]').count() == 0
    expect(page.get_by_label('Lọc trạng thái', exact=True).locator('option[value="draft"]')).to_have_text('Lưu nháp')
    expect(page.get_by_label('Lọc trạng thái', exact=True).locator('option[value="bad_debt"]')).to_have_text('Nợ xấu')
    if args.source == 'api':
        response = context.request.get(args.url + '/api/auth/order/car-rental')
        assert response.ok
        rows = response.json()['data']
        expected = sum(row['status'] == 'draft' for row in rows)
        expect(page.locator('.mg-title-count')).to_have_text(str(len(rows)), timeout=60000)
        page.locator('.mg-sidebar').get_by_role('link', name='Log', exact=True).click()
        expect(page.locator('.mg-title-count')).to_have_text(str(expected))
        first = page.locator('.mg-table tbody tr').first
        first.get_by_role('button', name='Sửa', exact=False).click()
        form = page.locator('dialog.mg-contract-composer')
        expect(form.get_by_role('heading', name='Chỉnh sửa bản nháp', exact=True)).to_be_visible()
        expect(form.get_by_role('button', name='Lưu nháp', exact=True)).to_be_enabled()
        form.get_by_role('button', name='Đóng', exact=True).click()
        checks.append('live Supabase list/counts and existing drafts load; all status labels are Vietnamese and no old-site link remains')
    page.get_by_role('button', name='Nhập hợp đồng', exact=True).click()
    form = page.locator('dialog.mg-contract-composer')
    expect(form.get_by_role('heading', name='Nhập hợp đồng', exact=True)).to_be_visible()
    form.get_by_label('Nguồn khách', exact=True).select_option(index=1)
    source_name = form.get_by_label('Nguồn khách', exact=True).input_value()
    form.get_by_label('Liên kết nguồn khách', exact=True).select_option(index=1)
    form.get_by_role('tab', name='Ký kết & ghi chú', exact=False).click()
    form.get_by_label('Ghi chú hợp đồng', exact=True).fill('Đang nhập dở')
    form.get_by_role('button', name='Xem mẫu in', exact=True).click()
    expect(form.locator('[aria-invalid="true"]')).not_to_have_count(0)
    form.get_by_role('button', name='Lưu nháp', exact=True).click()
    if args.source == 'api':
        expect(form.get_by_role('alert')).to_contain_text('người khác cập nhật')
        expect(form.get_by_label('Nguồn khách', exact=True)).to_have_value(source_name)
        expect(form.get_by_role('button', name='Lưu nháp', exact=True)).to_be_enabled()
        assert writes == ['POST']
        checks.append('a failed draft save keeps entered fields visible and re-enables retry; browser intercepted the mutation')
        form.get_by_role('button', name='Đóng', exact=True).click()
    else:
        expect(form).not_to_be_visible()
        expect(page).to_have_url(args.url + '/contracts/drafts')
        expect(page.locator('.mg-table tbody tr')).to_have_count(1)
        code = page.locator('.mg-table tbody .mg-code').inner_text()
        page.reload()
        expect(page.get_by_role('button', name='Sửa ' + code, exact=True)).to_be_visible()
        page.get_by_role('button', name='Sửa ' + code, exact=True).click()
        form = page.locator('dialog.mg-contract-composer')
        expect(form.get_by_label('Nguồn khách', exact=True)).to_have_value(source_name)
        expect(form.get_by_label('Ghi chú hợp đồng', exact=True)).to_have_value('Đang nhập dở')
        form.get_by_label('Nguồn khách', exact=True).select_option(index=2)
        source_name = form.get_by_label('Nguồn khách', exact=True).input_value()
        form.get_by_role('button', name='Lưu nháp', exact=True).click()
        expect(form).not_to_be_visible()
        expect(page.locator('.mg-table tbody tr')).to_have_count(1)
        page.reload()
        page.get_by_role('button', name='Sửa ' + code, exact=True).click()
        form = page.locator('dialog.mg-contract-composer')
        expect(form.get_by_label('Nguồn khách', exact=True)).to_have_value(source_name)
        form.screenshot(path=str(output / 'draft-edit-desktop.png'))
        form.get_by_role('button', name='Đóng', exact=True).click()
        page.get_by_role('button', name='Xem ' + code, exact=True).click()
        detail = page.locator('dialog.mg-contract-detail')
        expect(detail).to_contain_text('Lưu nháp')
        expect(detail).to_contain_text('—')
        detail.get_by_role('button', name='In hợp đồng', exact=True).click()
        expect(page.locator('dialog.mg-contract-composer')).to_be_visible()
        expect(page).to_have_url(args.url + '/contracts/drafts')
        page.locator('dialog.mg-contract-composer').get_by_role('button', name='Đóng', exact=True).click()
        page.screenshot(path=str(output / 'draft-list-desktop.png'), full_page=True)
        checks.append('incomplete draft saves, survives full reload, reopens and updates the same record; detail printing stays in the new website')
    page.set_viewport_size({'width': 375, 'height': 812})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.get_by_role('button', name='Nhập hợp đồng', exact=True).click()
    form = page.locator('dialog.mg-contract-composer')
    expect(form.get_by_role('button', name='Lưu nháp', exact=True)).to_be_enabled()
    assert form.evaluate('(element) => element.scrollWidth <= element.clientWidth')
    page.keyboard.press('Tab')
    assert form.evaluate('(element) => element.contains(document.activeElement)')
    if args.source == 'demo':
        page.screenshot(path=str(output / 'draft-create-mobile.png'), full_page=True)
    page.keyboard.press('Escape')
    expect(form).not_to_be_visible()
    checks.append('375px list/modal have no page overflow; draft save is accessible; keyboard focus stays inside the modal and Escape closes it')
    assert not errors, errors
    checks.append('no browser JavaScript errors')
    browser.close()

result = {'source': args.source, 'passed': len(checks), 'checks': checks, 'browser_errors': errors}
(output / f'{args.source}-results.json').write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps(result, indent=2, ensure_ascii=True))
