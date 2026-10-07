"""Read-only production checks. Never writes business records or saves personal data."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3002')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='docs/qa/supabase-live/results.json')
args = parser.parse_args()
checks, errors, blocked_writes = [], [], []
counts = {}

with sync_playwright() as p:
    browser = p.chromium.launch()
    anonymous = browser.new_context()
    page = anonymous.new_page()
    page.goto(args.url + '/login')
    expect(page.get_by_role('heading', name='Chào mừng trở lại')).to_be_visible()
    expect(page.get_by_role('button', name='Đăng nhập', exact=True)).to_be_enabled()
    assert page.get_by_role('link', name='Xem bản demo').count() == 0
    for path in ['/vehicles', '/staff', '/customers', '/stores', '/contracts', '/contracts/drafts', '/cashbook']:
        response = anonymous.request.get(args.url + path, max_redirects=0)
        assert response.status == 307 and response.headers['location'] == '/login', path
    assert anonymous.request.get(args.url + '/api/auth/customers').status == 401
    assert anonymous.request.post(args.url + '/api/auth/customers', headers={'Origin': 'https://other.invalid'}, data={}).status == 403
    checks.append('production requires authentication on every management route; demo entry and cross-origin writes are blocked')
    page.set_viewport_size({'width': 375, 'height': 900})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    checks.append('login is available on mobile without horizontal overflow')
    anonymous.close()

    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    context.add_cookies(json.loads(Path(args.session_cookie_file).read_text(encoding='utf-8')))
    assert context.request.get(args.url + '/api/session').ok
    endpoints = {'staff': 'hr/staff', 'customers': 'customers', 'stores': 'stores',
                 'vehicles': 'vehicle/vehicles', 'contracts': 'order/car-rental', 'transactions': 'transactions'}
    for kind, endpoint in endpoints.items():
        response = context.request.get(args.url + '/api/auth/' + endpoint)
        assert response.ok, (kind, response.status)
        assert response.headers.get('cache-control') == 'no-store'
        body = response.json()
        assert body['status'] == 'success' and isinstance(body['data'], list)
        rows = body['data']
        assert len({str(row['id']) for row in rows}) == len(rows), kind
        counts[kind] = len(rows)
        if kind == 'contracts':
            counts['drafts'] = sum(row.get('status', row.get('order_status')) == 'draft' for row in rows)
    checks.append('authenticated production APIs read all six real collections, preserve unique IDs and disable caching')

    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    def prevent_business_write(route):
        if route.request.method != 'GET':
            blocked_writes.append(route.request.method)
            route.abort()
        else:
            route.continue_()
    page.route('**/api/auth/**', prevent_business_write)
    routes = [('/vehicles', 'vehicles'), ('/staff', 'staff'), ('/customers', 'customers'),
              ('/stores', 'stores'), ('/contracts', 'contracts'), ('/contracts/drafts', 'drafts'), ('/cashbook', 'transactions')]
    for route, kind in routes:
        page.goto(args.url + route)
        expect(page.locator('h1 .mg-title-count')).to_have_text(str(counts[kind]), timeout=60000)
        assert page.get_by_text('Dữ liệu mẫu', exact=True).count() == 0
        assert page.get_by_role('button', name='Khôi phục dữ liệu mẫu').count() == 0
        assert page.get_by_role('button', name='Sao chép hợp đồng').count() == 0
        if kind == 'staff':
            assert page.locator('.mg-org-person').count() == counts['staff']
        if kind == 'customers':
            page.get_by_role('button', name='Thêm khách hàng', exact=True).click()
            dialog = page.get_by_role('dialog')
            expect(dialog.locator('#new-customer-store')).to_be_visible()
            assert dialog.locator('#new-customer-store option').count() == counts['stores'] + 1
            expect(dialog.locator('#new-customer-status')).to_be_visible()
            dialog.get_by_role('button', name='Hủy', exact=True).click()
        if kind == 'drafts':
            page.get_by_role('button', name='Nhập hợp đồng', exact=True).click()
            dialog = page.get_by_role('dialog')
            expect(dialog.get_by_role('button', name='Lưu nháp', exact=True)).to_be_enabled()
            assert dialog.locator('#contract-store option').count() == counts['stores'] + 1
            dialog.get_by_role('button', name='Đóng', exact=True).click()
        page.set_viewport_size({'width': 375, 'height': 900})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), route
        page.set_viewport_size({'width': 1440, 'height': 1000})
    checks.append('all seven screens match live API counts; staff chart, customer branch/status and Log use DB data on desktop/mobile')

    page.route('**/api/auth/customers?*', lambda route: route.fulfill(status=503, content_type='application/json', body='{"status":"error"}'))
    page.goto(args.url + '/customers')
    expect(page.get_by_text('Không tải được customers', exact=False)).to_be_visible(timeout=60000)
    expect(page.locator('h1 .mg-title-count')).to_have_text('—')
    assert page.get_by_text('Dữ liệu mẫu', exact=True).count() == 0
    page.unroute('**/api/auth/customers?*')
    page.goto(args.url + '/customers')
    expect(page.locator('h1 .mg-title-count')).to_have_text(str(counts['customers']), timeout=60000)
    checks.append('API outages display an error, never sample data; a reload restores real records')

    response = context.request.delete(args.url + '/api/session', headers={'Origin': args.url})
    assert response.ok
    assert context.request.get(args.url + '/api/auth/customers').status == 401
    checks.append('logout removes access to protected real-data APIs')
    assert not blocked_writes, blocked_writes
    assert not errors, errors
    browser.close()

output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
result = {'passed': len(checks), 'checks': checks, 'counts_at_check': counts,
          'javascript_errors': errors, 'business_writes': len(blocked_writes), 'environment': args.url}
output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'passed': len(checks), 'counts': counts, 'business_writes': 0}))
