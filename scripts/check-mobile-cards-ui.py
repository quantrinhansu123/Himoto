"""Mobile record cards QA. Business APIs are synthetic; all writes are blocked."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3101')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='docs/qa/mobile-cards')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
checks, errors, blocked = [], [], []
stores = [dict(id=1, code='CS-QA', store_name='Cơ sở QA', store_address='Địa chỉ cơ sở QA', status='opening', store_revision='1')]
staff = [dict(id=8, full_name='Nhân sự QA', phone='0900000008', position='Nhân viên', status='1', store_id=1)]
vehicles = [dict(id=101+i, name=f'Xe QA {i+1:02}', license=f'QA-{101+i}', brand='Honda', type='electric', daily_price=180000,
    status='ready', store_id=1, vehicle_revision='1') for i in range(12)]
customers = [dict(id=12, code='KH-QA', name='Khách hàng QA với tên dài để kiểm tra thẻ', phone='0900000012',
    id_card='001234567812', address='Địa chỉ QA', status='active', store_id=1, customer_revision='1')]
contracts = [dict(id=77, contract_number='HD-QA-77', status='renting', customer_id=12, customer_name=customers[0]['name'],
    customer_phone=customers[0]['phone'], store_id=1, total_amount=1000, paid_amount=100,
    start_date='2026-10-10T09:00:00+07:00', end_date='2026-10-12T09:00:00+07:00', staff_name='Nhân sự QA', vehicles=vehicles[:1])]
endpoints = {'/api/auth/stores': stores, '/api/auth/hr/staff': staff, '/api/auth/vehicle/vehicles': vehicles,
    '/api/auth/customers': customers, '/api/auth/order/car-rental': contracts, '/api/auth/transactions': [], '/api/auth/cashbook/accounts': []}
state = {'fail_vehicles': False}


def mock_api(route):
    path = urlparse(route.request.url).path
    if route.request.method != 'GET':
        blocked.append(path)
        route.abort()
    elif path == '/api/auth/vehicle/vehicles' and state['fail_vehicles']:
        route.fulfill(status=503, json={'status': 'error', 'message': 'QA lỗi tải danh sách'})
    elif path in endpoints:
        route.fulfill(json={'status': 'success', 'data': endpoints[path]})
    elif path in ['/api/session', '/api/auth/me']:
        route.fulfill(json={'user': {'id': 144, 'name': 'QA'}})
    elif path == '/api/auth/order/car-rental/77/history':
        route.fulfill(json={'status': 'success', 'data': {'changes': [], 'cashflow': []}})
    elif path.endswith('/payments') or path.endswith('/history'):
        route.fulfill(json={'status': 'success', 'data': []})
    elif path == '/api/auth/stores/managers':
        route.fulfill(json={'status': 'success', 'data': [dict(id=8, name='Nhân sự QA')]})
    else:
        blocked.append(path)
        route.abort()


def no_overflow(page, width):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width


with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 375, 'height': 812}, timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
    context.add_cookies([dict(name='himoto_management_session', value=Path(args.session_cookie_file).read_text(encoding='utf-8').strip(),
        url=args.url, httpOnly=True, sameSite='Strict')])
    context.route('**/api/**', mock_api)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    for width, height in [(320, 740), (375, 812), (768, 1024), (844, 390), (1440, 1000)]:
        page.set_viewport_size({'width': width, 'height': height})
        for path in ['vehicles', 'customers', 'contracts', 'staff', 'stores']:
            page.goto(args.url+'/'+path, wait_until='networkidle')
            cards = page.locator('.mg-mobile-card-list')
            desktop = page.locator('.mg-desktop-records')
            if width > 900:
                expect(desktop).to_be_visible()
                expect(cards).not_to_be_visible()
                expect(desktop.locator('tbody tr').first).to_be_visible()
                continue
            expect(cards).to_be_visible()
            expect(desktop).not_to_be_visible()
            expect(page.locator('table:visible')).to_have_count(0)
            first = cards.locator('li').first
            rect = first.bounding_box()
            assert rect['width'] <= width and rect['height'] < 155, (path, width, rect)
            expect(first.locator('.mg-mobile-card-title')).not_to_be_empty()
            expect(first.locator('.mg-mobile-card-summary')).not_to_be_empty()
            trigger = first.locator('.mg-row-menu-trigger')
            trigger.scroll_into_view_if_needed()
            page.wait_for_timeout(100)
            trigger.click()
            menu = page.get_by_role('menu')
            expect(menu).to_be_visible()
            menu_rect = menu.bounding_box()
            assert menu_rect['x'] >= 0 and menu_rect['x']+menu_rect['width'] <= width+1, menu_rect
            assert menu_rect['y'] >= 0 and menu_rect['y']+menu_rect['height'] <= height+1, menu_rect
            expect(page.locator('dialog:visible')).to_have_count(0)
            if path == 'vehicles':
                for label in ['Xem chi tiết', 'Chuyển xe', 'Đổi trạng thái', 'Chỉnh sửa', 'Xóa xe']:
                    expect(menu.get_by_role('menuitem', name=label, exact=True)).to_be_visible()
            elif path == 'contracts':
                for label in ['Điền và in hợp đồng', 'Thanh toán', 'Trả xe', 'Gia hạn', 'Đổi xe']:
                    expect(menu.get_by_role('menuitem', name=label, exact=True)).to_be_visible()
            page.keyboard.press('Escape')
            expect(menu).to_have_count(0)
            expect(first.locator('.mg-row-menu-trigger')).to_be_focused()
            first.locator('.mg-mobile-card-main').click()
            expect(page.locator('dialog:visible')).to_have_count(1)
            no_overflow(page, width)
            page.keyboard.press('Escape')
            expect(page.locator('dialog:visible')).to_have_count(0)
            expect(first.locator('.mg-mobile-card-main')).to_be_focused()
            no_overflow(page, width)
            if width == 375:
                page.evaluate('document.activeElement.blur(); window.scrollTo(0, 0)')
                page.wait_for_function('window.scrollY === 0')
                page.add_style_tag(content='.mg-user-menu strong {visibility:hidden !important;}')
                page.locator('.mg-user-avatar').evaluate_all("els => els.forEach(el => el.textContent='QA')")
                page.screenshot(path=str(out/f'{path}-375.png'), full_page=True)
        checks.append(f'five lists use compact cards at {width}x{height}' if width <= 900 else 'desktop retains five full tables at 1440px')

    page.set_viewport_size({'width': 375, 'height': 812})
    page.goto(args.url+'/vehicles', wait_until='networkidle')
    cards = page.locator('.mg-mobile-card-list')
    expect(cards.locator('li')).to_have_count(10)
    first = cards.locator('li').first
    first.locator('input[type=checkbox]').check()
    expect(first).to_have_class('mg-mobile-record-card is-selected')
    expect(page.locator('dialog:visible')).to_have_count(0)
    page.get_by_label('Chọn tất cả thẻ trên trang này', exact=True).check()
    expect(cards.locator('li.is-selected')).to_have_count(10)
    page.get_by_label('Chọn tất cả thẻ trên trang này', exact=True).uncheck()
    expect(cards.locator('li.is-selected')).to_have_count(0)
    page.get_by_role('button', name='Trang sau', exact=True).click()
    expect(cards.locator('li')).to_have_count(2)
    page.get_by_label('Sắp xếp danh sách', exact=True).select_option('name')
    expect(cards.locator('li')).to_have_count(10)
    expect(cards.locator('.mg-mobile-card-title').first).to_have_text('Xe QA 01')
    page.get_by_role('button', name='Đang tăng dần, đổi sang giảm dần', exact=True).click()
    expect(cards.locator('.mg-mobile-card-title').first).to_have_text('Xe QA 12')
    page.get_by_role('searchbox').fill('QA-112')
    expect(cards.locator('li')).to_have_count(1)
    page.get_by_role('searchbox').fill('no-match-qa')
    expect(page.locator('.mg-mobile-records').get_by_text('Không tìm thấy kết quả', exact=True)).to_be_visible()
    page.locator('.mg-mobile-records').get_by_role('button', name='Xóa bộ lọc', exact=True).click()
    expect(cards.locator('li')).to_have_count(10)
    checks.append('selection, select all, pagination, sorting, filtering and empty state work without opening details')

    trigger = cards.locator('li').first.locator('.mg-row-menu-trigger')
    trigger.scroll_into_view_if_needed()
    page.wait_for_timeout(100)
    trigger.click()
    expect(page.get_by_role('menu')).to_be_visible()
    page.evaluate("window.dispatchEvent(new Event('scroll'))")
    expect(page.get_by_role('menu')).to_be_visible()
    page.keyboard.press('Escape')
    checks.append('a queued scroll event with an unchanged anchor does not close a newly opened menu')

    state['fail_vehicles'] = True
    page.reload(wait_until='networkidle')
    expect(page.locator('.mg-mobile-records').get_by_role('alert')).to_be_visible()
    state['fail_vehicles'] = False
    page.locator('.mg-mobile-records').get_by_role('button', name='Thử lại', exact=True).click()
    expect(cards.locator('li')).to_have_count(10)
    checks.append('mobile error state retries successfully')
    assert not errors, errors
    assert not blocked, blocked
    browser.close()

result = {'passed': len(checks), 'checks': checks, 'javascriptErrors': errors, 'unexpectedRequestsBlocked': blocked, 'realBusinessWrites': 0}
(out/'results.json').write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps(result, indent=2, ensure_ascii=False))
