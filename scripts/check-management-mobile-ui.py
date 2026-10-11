"""Mobile product QA with synthetic APIs; account authentication reads only."""
import argparse
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3102')
parser.add_argument('--session-cookie-file', required=True, help='Ignored local QA cookie JSON')
parser.add_argument('--output', default='.backups/mobile/functional')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
checks, errors, blocked = [], [], []
stores = [dict(id=1, code='CS-QA', store_name='Cơ sở QA', status='opening', store_revision='1')]
staff = [dict(id=8, full_name='Nhân sự QA', phone='0900000008', status='1', store_id=1)]
vehicles = [dict(id=101, name='Xe QA', license='QA-101', brand='Honda', type='electric', status='ready', store_id=1)]
customers = [dict(id=12, code='KH-QA', name='Khách QA', phone='0900000012', id_card='001234567812', address='Địa chỉ QA', status='active', store_id=1, customer_revision='1')]
contracts = [dict(id=77, contract_number='HD-QA-77', status='renting', customer_id=12, customer_name='Khách QA', store_id=1,
    total_amount=1000, paid_amount=100, company_paid_amount=100, company_payment_count=1,
    start_date='2026-10-10T09:00:00+07:00', end_date='2026-10-12T09:00:00+07:00', staff_name='Nhân sự QA', vehicles=vehicles)]
transactions = [dict(id=90+i, type='in' if i == 0 else 'out', created_at='2026-10-10T09:00:00+07:00', amount=100,
    user_name='Nhân sự QA', store_id=1, store_name='Cơ sở QA', payment_method='Chuyển khoản',
    account='Ngân hàng QA · CHỦ TÀI KHOẢN QA · 000000000000', reason='Phiếu thu chi QA', content='Nội dung kiểm tra bố cục mobile với dữ liệu dài.') for i in range(2)]
endpoints = {'/api/auth/stores': stores, '/api/auth/hr/staff': staff, '/api/auth/vehicle/vehicles': vehicles,
    '/api/auth/customers': customers, '/api/auth/order/car-rental': contracts, '/api/auth/transactions': transactions,
    '/api/auth/stores/managers': [dict(id=8,name='Người phụ trách QA')], '/api/auth/cashbook/accounts': []}

def mock_api(route):
    parsed = urlparse(route.request.url)
    path = parsed.path
    if route.request.method != 'GET':
        blocked.append(path)
        route.abort()
    elif path in endpoints:
        route.fulfill(json={'status': 'success', 'data': endpoints[path]})
    elif path in ['/api/session', '/api/auth/me']:
        route.fulfill(json={'user': {'id': 144, 'name': 'QA'}})
    elif path == '/api/auth/duty-roster':
        week = parse_qs(parsed.query)['week'][0]
        route.fulfill(json={'status': 'success', 'data': {'week': week, 'schedules': [dict(id=99, store_id=1, store_name='Cơ sở QA',
            staff_id=8, staff_name='Nhân sự QA', staff_phone='0900000008', duty_date=week, shift_name='Ca QA', role_in_shift='QA',
            notes='', starts_at=week+'T08:00:00+07:00', ends_at=week+'T17:00:00+07:00', revision='1')]}})
    else:
        blocked.append(path)
        route.abort()

def mask_account(page):
    page.add_style_tag(content='.mg-user-menu strong {visibility:hidden !important;}')
    page.locator('.mg-user-avatar').evaluate_all("els => els.forEach(el => el.textContent='QA')")

def bounds(locator, width, height=None):
    rect = locator.bounding_box()
    assert rect and rect['x'] >= -1 and rect['x'] + rect['width'] <= width + 1, 'Control exceeds viewport width'
    if height is not None:
        assert rect['y'] >= -1 and rect['y'] + rect['height'] <= height + 1, 'Overlay exceeds viewport height'

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 375, 'height': 812}, is_mobile=True, has_touch=True,
        timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
    context.add_cookies(json.loads(Path(args.session_cookie_file).read_text(encoding='utf-8-sig')))
    context.route('**/api/**', mock_api)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    for width, height in [(320,812), (375,812), (390,844), (430,932), (768,1024), (812,375)]:
        page.set_viewport_size({'width':width,'height':height})
        for path in ['vehicles','customers','contracts','contracts/vat','contracts/drafts','stores','staff','cashbook','duty-roster']:
            page.goto(args.url+'/'+path, wait_until='networkidle')
            expect(page.locator('.mg-app h1')).to_be_visible()
            mask_account(page)
            assert page.evaluate('width => document.documentElement.scrollWidth <= width', width), f'Page overflow: {path} {width}'
            assert not page.locator('.mg-app table:visible').count(), f'Visible mobile table: {path} {width}'
            for selector in ['.mg-mobile-toggle','.mg-user-menu summary','.mg-heading-actions .mg-button']:
                for control in page.locator(selector).all():
                    if control.is_visible():
                        rect = control.bounding_box()
                        assert rect['width'] >= 43 and rect['height'] >= 43, f'Touch control too small: {selector} {path} {width}'
            for field in page.locator('.mg-app input:not([type=checkbox]):not([type=radio]),.mg-app select').all():
                if field.is_visible():
                    assert field.evaluate('el => parseFloat(getComputedStyle(el).fontSize)') >= 16, f'Small input text: {path} {width}'
            for region in page.locator('.mg-table-scroll').all():
                if not region.is_visible():
                    continue
                bounds(region, width)
                if region.evaluate('el => el.scrollWidth > el.clientWidth'):
                    region.evaluate('el => {el.scrollLeft = el.scrollWidth;}')
                    assert region.evaluate('el => el.scrollLeft > 0')
                    region.evaluate('el => {el.scrollLeft = 0;}')
            if width in [375,768]:
                page.screenshot(path=str(out/f'{path.replace("/","-")}-{width}.png'), full_page=True)
        checks.append(f'nine routes retain usable touch controls, readable inputs and cards without visible tables at {width}x{height}')

        page.goto(args.url+'/contracts', wait_until='networkidle')
        mask_account(page)
        expect(page.locator('.mg-column-menu')).not_to_be_visible()
        sort_control=page.get_by_label('Sắp xếp danh sách',exact=True)
        sort_control.scroll_into_view_if_needed()
        bounds(sort_control,width,height)
        if width == 375:
            page.screenshot(path=str(out/'cards-sort-375.png'))
        trigger = page.locator('.mg-mobile-card-actions .mg-row-menu-trigger').first
        trigger.scroll_into_view_if_needed()
        page.wait_for_timeout(100)
        trigger.click()
        menu = page.get_by_role('menu')
        expect(menu).to_be_visible()
        bounds(menu, width, height)
        menu.get_by_role('menuitem').first.focus()
        page.keyboard.press('End')
        focused = page.locator('[role=menuitem]:focus')
        bounds(focused, width, height)
        page.keyboard.press('Escape')
        expect(trigger).to_be_focused()
        page.get_by_role('button', name='Nhập hợp đồng', exact=True).click()
        form = page.locator('dialog.mg-contract-composer')
        expect(form).to_be_visible()
        bounds(form, width, height)
        tabs = form.get_by_role('tab')
        assert tabs.count() == 5
        first = tabs.first
        first.focus()
        page.keyboard.press('End')
        expect(tabs.last).to_be_focused()
        expect(tabs.last).to_have_attribute('aria-selected','true')
        form.get_by_role('tab',name='Khách hàng',exact=False).click()
        expect(form.locator('#contract-store')).to_be_visible()
        for field in form.locator('.mg-field input:not([type=checkbox]):not([type=radio]),.mg-field select,.mg-field textarea').all():
            if field.is_visible():
                assert field.evaluate('el => parseFloat(getComputedStyle(el).fontSize)') >= 16
        bounds(form.locator('.mg-dialog-footer'), width, height)
        if width == 375:
            page.screenshot(path=str(out/'composer-customer-375.png'))
        page.keyboard.press('Escape')
        expect(form).to_have_count(0)
        page.get_by_role('button', name='Mở menu', exact=True).click()
        drawer = page.locator('.mg-mobile-nav')
        bounds(drawer, width, height)
        last_link = drawer.get_by_role('link',name='Sổ quỹ / Sổ két',exact=True)
        last_link.scroll_into_view_if_needed()
        bounds(last_link,width,height)
        if width == 375:
            page.screenshot(path=str(out/'navigation-375.png'))
        page.keyboard.press('Escape')
        expect(drawer).not_to_be_visible()
        checks.append(f'card sorting, action menu, five contract tabs, dialog footer and full navigation remain accessible at {width}x{height}')

    page.set_viewport_size({'width':375,'height':812})
    page.goto(args.url+'/vehicles',wait_until='networkidle')
    expect(page.locator('.mg-mobile-card-title').first).to_have_text('Xe QA')
    expect(page.locator('.mg-desktop-records')).not_to_be_visible()
    bounds(page.get_by_label('Sắp xếp danh sách',exact=True),375,812)
    assert page.evaluate('document.documentElement.scrollWidth <= 375')
    page.locator('.mg-user-menu summary').click()
    bounds(page.locator('.mg-user-menu .mg-popover'),375,812)
    page.locator('.mg-user-menu summary').click()
    expect(page.locator('.mg-user-menu .mg-popover')).not_to_be_visible()
    checks.append('compact cards, sorting and account menu fit a phone without a visible record table')

    for path in ['vehicles','customers','stores','staff']:
        page.goto(args.url+'/'+path,wait_until='networkidle')
        mask_account(page)
        detail_trigger=page.locator('.mg-mobile-card-actions .mg-row-menu-trigger').first
        detail_trigger.scroll_into_view_if_needed()
        page.wait_for_timeout(100)
        detail_trigger.click()
        page.get_by_role('menuitem',name='Xem chi tiết',exact=True).click()
        dialog = page.locator('dialog.mg-dialog')
        expect(dialog).to_be_visible()
        bounds(dialog,375,812)
        assert dialog.evaluate('el => el.scrollWidth <= el.clientWidth'), f'Detail dialog overflows: {path}'
        page.screenshot(path=str(out/f'{path}-detail-375.png'))
        page.keyboard.press('Escape')
        expect(dialog).to_have_count(0)
        if path in ['customers','stores']:
            page.locator('.mg-heading-actions .mg-button-primary').click()
            expect(dialog).to_be_visible()
            bounds(dialog,375,812)
            for field in dialog.locator('.mg-field input:not([type=checkbox]):not([type=radio]),.mg-field select,.mg-field textarea').all():
                if field.is_visible():
                    assert field.evaluate('el => parseFloat(getComputedStyle(el).fontSize)') >= 16
            page.screenshot(path=str(out/f'{path}-create-375.png'))
            page.keyboard.press('Escape')
            expect(dialog).to_have_count(0)
    page.goto(args.url+'/duty-roster',wait_until='networkidle')
    mask_account(page)
    page.get_by_role('button',name='Thêm ca trực',exact=True).click()
    duty_form=page.locator('dialog.mg-dialog')
    expect(duty_form).to_be_visible()
    bounds(duty_form,375,812)
    assert duty_form.evaluate('el => el.scrollWidth <= el.clientWidth'), 'Duty form exceeds phone width'
    for field in duty_form.locator('input,select,textarea').all():
        if field.is_visible():
            assert field.evaluate('el => parseFloat(getComputedStyle(el).fontSize)') >= 16
    bounds(duty_form.locator('.mg-dialog-footer'),375,812)
    page.screenshot(path=str(out/'duty-create-375.png'))
    page.keyboard.press('Escape')
    expect(duty_form).to_have_count(0)
    checks.append('vehicle/customer/store/staff details and customer/store/duty forms fit a phone without saving data')

    context.clear_cookies()
    for width, height in [(320,812),(375,812),(430,932),(812,375)]:
        page.set_viewport_size({'width':width,'height':height})
        page.goto(args.url+'/login',wait_until='networkidle')
        assert page.evaluate('width => document.documentElement.scrollWidth <= width',width)
        for field in page.locator('.hm-login input').all():
            assert field.evaluate('el => parseFloat(getComputedStyle(el).fontSize)') >= 16
        if width == 375:
            page.screenshot(path=str(out/'login-375.png'),full_page=True)
    checks.append('login retains 16px inputs and fits narrow phones and landscape')
    browser.close()

assert not errors and not blocked, {'javascriptErrors': errors, 'unexpectedRequests': blocked}
result = {'passed': len(checks), 'checks': checks, 'routeViewports':54, 'javascriptErrors': errors, 'businessWrites':0}
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=True,indent=2))
