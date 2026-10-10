"""Request-scope QA with intercepted APIs. Never writes business records."""
import argparse
import asyncio
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.async_api import async_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3100')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='.backups/management-loading/ui')
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
checks, errors, unexpected, requests = [], [], [], []
hold = {'path': None, 'gate': None, 'fail': False}
stores = [dict(id=1, code='CS-QA-1', store_name='Cơ sở QA', status='opening')]
vehicles = [dict(id=101, name='Xe QA', license='QA-101', color='Đen', brand='Honda', type='electric', status='ready', store_id=1)]
vehicles.append({**vehicles[0], 'id': 102, 'license': 'QA-102'})
customers = [dict(id=12, code='KH-QA-12', name='Khách QA', phone='0900000012', id_card='001234567812', address='Địa chỉ QA', status='bad_debt', store_id=1, customer_revision='1')]
contracts = [dict(id=77, contract_number='HD-QA-77', customer_id=12, customer_status=2, customer_name='Khách QA', status='renting', store_id=1,
    staff_name='Nhân sự QA', total_amount=1000, paid_amount=100, start_date='2026-10-10T09:00:00+07:00', vehicles=vehicles[:1])]
staff = [dict(id=8, full_name='Nhân sự QA', status='1', store_id=1)]
transactions = [dict(id=90, type='in', created_at='2026-10-10T09:00:00+07:00', amount=100, user_name='QA', store_id=1)]
endpoints = {'/api/auth/stores': stores, '/api/auth/vehicle/vehicles': vehicles, '/api/auth/customers': customers,
    '/api/auth/order/car-rental': contracts, '/api/auth/hr/staff': staff, '/api/auth/transactions': transactions}

async def mock_api(route):
    parsed = urlparse(route.request.url)
    endpoint = parsed.path
    requests.append((endpoint, parsed.query, route.request.method))
    if route.request.method == 'POST' and endpoint in ['/api/auth/returns', '/api/auth/returns/vehicle']:
        data = {'contract_code': 'HD-QA-77', 'fee': 0} if endpoint == '/api/auth/returns' else {'item_id': 701, 'old_license': 'QA-101', 'new_license': 'QA-102'}
        await route.fulfill(json={'status': 'success', 'data': data})
        return
    if route.request.method != 'GET':
        unexpected.append(endpoint)
        await route.abort()
        return
    if hold['path'] == endpoint:
        gate, fail = hold['gate'], hold['fail']
        await gate.wait()
        if fail:
            await route.fulfill(status=503, json={'status': 'error', 'message': 'QA unavailable'})
            return
    if endpoint == '/api/session':
        await route.fulfill(json={'user': {'id': 1, 'name': 'QA'}})
    elif endpoint in endpoints:
        data = endpoints[endpoint]
        if endpoint == '/api/auth/order/car-rental' and 'customer_id' in parse_qs(parsed.query):
            data = [row for row in contracts if row['customer_id'] == int(parse_qs(parsed.query)['customer_id'][0])]
        await route.fulfill(json={'status': 'success', 'data': data})
    elif endpoint == '/api/auth/order/car-rental/77/history':
        await route.fulfill(json={'status': 'success', 'data': {'changes': [], 'cashflow': []}})
    elif endpoint == '/api/auth/customers/12/payments':
        await route.fulfill(json={'status': 'success', 'data': []})
    elif endpoint == '/api/auth/returns':
        await route.fulfill(json={'status': 'success', 'data': [dict(item_id=701, order_id=77, contract_code='HD-QA-77', order_status='renting',
            customer_name='Khách QA', vehicle_id=101, vehicle_name='Xe QA', license='QA-101', store_id=1, store_name='Cơ sở QA',
            scheduled_start_at='2026-10-10T09:00:00+07:00', scheduled_return_at='2026-10-11T09:00:00+07:00', completed_at=None,
            item_revision='1', order_revision='1', total_amount=1000, paid_amount=100, overdue=False)]})
    else:
        unexpected.append(endpoint)
        await route.abort()

async def wait_requests(count):
    for _ in range(100):
        if len(requests) >= count:
            return
        await asyncio.sleep(0.02)
    raise AssertionError(f'Missing request: expected {count}, received {requests}')

async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        context = await browser.new_context(viewport={'width': 1440, 'height': 1000}, timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
        await context.add_cookies(json.loads(Path(args.session_cookie_file).read_text(encoding='utf-8')))
        await context.route('**/api/**', mock_api)
        page = await context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        async def navigate(label):
            paths = {'Danh sách xe': '/vehicles', 'Khách hàng': '/customers', 'Danh sách hợp đồng': '/contracts'}
            await page.get_by_role('navigation', name='Điều hướng quản lý').get_by_role('link', name=label, exact=True).click()
            await expect(page).to_have_url(args.url + paths[label])
            await expect(page.locator('.mg-table tbody .mg-code').first).to_be_visible()
        async def view(code):
            await page.get_by_role('button', name=f'Thao tác {code}', exact=True).click()
            await page.get_by_role('menuitem', name='Xem chi tiết', exact=True).click()
            await expect(page.get_by_role('dialog')).to_be_visible()
        async def close():
            await page.get_by_role('dialog').get_by_role('button', name='Đóng', exact=True).click()
            await expect(page.get_by_role('dialog')).to_have_count(0)

        await page.goto(args.url + '/vehicles', wait_until='domcontentloaded')
        await expect(page.locator('.mg-table tbody .mg-code').first).to_be_visible()
        assert sorted(path for path, _, _ in requests) == ['/api/auth/stores', '/api/auth/vehicle/vehicles'], requests
        checks.append('cold vehicle page performs 2 collection requests instead of all 5')
        start = len(requests)
        hold.update(path='/api/auth/vehicle/vehicles', gate=asyncio.Event(), fail=False)
        await page.get_by_role('button', name='Làm mới', exact=True).click()
        await wait_requests(start + 1)
        await expect(page.locator('.mg-table tbody .mg-code').first).to_be_visible()
        await expect(page.get_by_role('button', name='Đang tải…', exact=True)).to_be_disabled()
        assert [path for path, _, _ in requests[start:]] == ['/api/auth/vehicle/vehicles']
        hold['gate'].set()
        await expect(page.get_by_role('button', name='Làm mới', exact=True)).to_be_enabled()
        hold['path'] = None
        checks.append('refresh keeps rows visible, disables repeated clicks and requests only vehicles')

        start = len(requests)
        await navigate('Khách hàng')
        assert [path for path, _, _ in requests[start:]] == ['/api/auth/customers'], requests[start:]
        await view('KH-QA-12')
        assert len(requests) == start + 1
        await page.get_by_role('tab', name='Hợp đồng', exact=True).click()
        await expect(page.get_by_role('dialog').get_by_text('HD-QA-77', exact=True)).to_be_visible()
        assert requests[-1][:2] == ('/api/auth/order/car-rental', 'customer_id=12')
        count = len(requests)
        await page.get_by_role('tab', name='Chi tiết', exact=True).click()
        await page.get_by_role('tab', name='Hợp đồng', exact=True).click()
        assert len(requests) == count
        await page.get_by_role('tab', name='Thanh toán', exact=True).click()
        await expect(page.get_by_text('Chưa có phiếu thu / chi nào.', exact=True)).to_be_visible()
        assert requests[-1][0] == '/api/auth/customers/12/payments'
        await close()
        checks.append('customer details load no extra data; contract/payment tabs fetch only that customer and reuse loaded results')

        start = len(requests)
        await navigate('Danh sách hợp đồng')
        assert [path for path, _, _ in requests[start:]] == ['/api/auth/order/car-rental']
        await expect(page.locator('.mg-contract-metrics > div').nth(1).locator('dd')).to_have_text('1')
        await view('HD-QA-77')
        await expect(page.get_by_role('dialog').get_by_text('Đen', exact=True)).to_be_visible()
        await expect(page.get_by_role('dialog').get_by_text('Xe điện', exact=True)).to_be_visible()
        assert len(requests) == start + 1
        await page.get_by_role('tab', name='Lịch sử chỉnh sửa', exact=True).click()
        await expect(page.get_by_text('Chưa có lần chỉnh sửa nào.', exact=True)).to_be_visible()
        count = len(requests)
        await page.get_by_role('tab', name='Lịch sử thu chi', exact=True).click()
        await expect(page.get_by_text('Chưa có phiếu thu / chi nào cho hợp đồng này.', exact=True)).to_be_visible()
        assert len(requests) == count
        await close()
        await navigate('Danh sách xe')
        assert len(requests) == count
        checks.append('contract details and blacklist totals require no extra collections; history is shared between tabs and cached navigation fetches nothing')

        await page.goto(args.url + '/contracts', wait_until='domcontentloaded')
        await expect(page.locator('.mg-table tbody .mg-code').first).to_be_visible()
        start = len(requests)
        await page.get_by_role('button', name='Nhập hợp đồng', exact=True).click()
        await page.get_by_role('dialog').get_by_role('tab', name='Khách hàng', exact=False).click()
        await expect(page.locator('#contract-store')).to_be_visible()
        assert sorted(path for path, _, _ in requests[start:]) == ['/api/auth/customers', '/api/auth/vehicle/vehicles']
        await page.locator('#contract-store').select_option('1')
        await wait_requests(start + 3)
        assert requests[-1][0] == '/api/auth/hr/staff' and 'store_id=1' in requests[-1][1]
        await expect(page.locator('#contract-staff-options option[value="Nhân sự QA"]')).to_have_count(1)
        await page.screenshot(path=str(output / 'composer-desktop.png'))
        await close()
        checks.append('composer loads supporting data only when opened and requests staff for the selected store')

        await page.get_by_role('navigation', name='Điều hướng quản lý').get_by_role('link', name='Sổ quỹ / Sổ két', exact=True).click()
        await expect(page.locator('#cashbook-income tbody tr').first).to_contain_text('QA')
        start = len(requests)
        hold.update(path='/api/auth/transactions', gate=asyncio.Event(), fail=False)
        await page.get_by_role('button', name='Tải lại', exact=True).click()
        await wait_requests(start + 1)
        await expect(page.locator('#cashbook-income tbody tr').first).to_contain_text('QA')
        assert [path for path, _, _ in requests[start:]] == ['/api/auth/transactions']
        hold['gate'].set()
        await expect(page.get_by_role('button', name='Tải lại', exact=True)).to_be_enabled()
        hold['path'] = None
        checks.append('cashbook refresh keeps both tables visible and reloads only transactions')

        await page.goto(args.url + '/vehicles', wait_until='domcontentloaded')
        await expect(page.locator('.mg-table tbody .mg-code').first).to_be_visible()
        start = len(requests)
        hold.update(path='/api/auth/order/car-rental', gate=asyncio.Event(), fail=True)
        await page.get_by_role('navigation', name='Điều hướng quản lý').get_by_role('link', name='Danh sách hợp đồng', exact=True).click()
        await wait_requests(start + 1)
        await navigate('Danh sách xe')
        hold['gate'].set()
        await page.wait_for_timeout(100)
        hold['path'] = None
        await expect(page.locator('.mg-table tbody .mg-code').first).to_be_visible()
        await expect(page.get_by_text('Không tải được dữ liệu', exact=True)).to_have_count(0)
        await page.set_viewport_size({'width': 375, 'height': 900})
        assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        await page.screenshot(path=str(output / 'vehicles-mobile.png'))
        checks.append('late errors from another page do not affect the active page; mobile view has no horizontal overflow')
        await page.set_viewport_size({'width': 1440, 'height': 1000})
        await navigate('Danh sách hợp đồng')
        await page.get_by_role('button', name='Thao tác HD-QA-77', exact=True).click()
        await page.get_by_role('menuitem', name='Trả xe', exact=True).click()
        await expect(page.get_by_role('button', name='Xác nhận trả xe', exact=True)).to_be_enabled()
        start = len(requests)
        await page.get_by_role('button', name='Xác nhận trả xe', exact=True).click()
        await expect(page.get_by_role('dialog')).to_have_count(0)
        assert [(path, method) for path, _, method in requests[start:]] == [('/api/auth/returns', 'POST'), ('/api/auth/order/car-rental', 'GET')]
        checks.append('a simulated return refreshes only contracts after confirmation')
        await page.get_by_role('button', name='Thao tác HD-QA-77', exact=True).click()
        await page.get_by_role('menuitem', name='Đổi xe', exact=True).click()
        await page.locator('#contract-swap-replacement').select_option('102')
        start = len(requests)
        await page.get_by_role('button', name='Đổi xe trong hợp đồng', exact=True).click()
        await expect(page.get_by_role('dialog')).to_have_count(0)
        assert [(path, method) for path, _, method in requests[start:]] == [('/api/auth/returns/vehicle', 'POST'), ('/api/auth/order/car-rental', 'GET')]
        start = len(requests)
        await navigate('Danh sách xe')
        assert [path for path, _, _ in requests[start:]] == ['/api/auth/vehicle/vehicles']
        checks.append('a simulated vehicle swap refreshes only contracts and invalidated vehicles are fetched on the next vehicle-page visit')
        assert not errors, errors
        assert not unexpected, unexpected
        assert [(path, method) for path, _, method in requests if method != 'GET'] == [('/api/auth/returns', 'POST'), ('/api/auth/returns/vehicle', 'POST')]
        result = {'passed': len(checks), 'checks': checks, 'requests': requests, 'pageErrors': errors, 'unexpectedRequests': unexpected, 'businessWrites': 0}
        (output / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'passed': len(checks), 'checks': checks, 'businessWrites': 0}, ensure_ascii=True, indent=2))
        await browser.close()

asyncio.run(main())
