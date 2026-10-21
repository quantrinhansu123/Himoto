"""Paged API envelope regression checks. Business APIs are fully intercepted."""
import argparse
import csv
import io
import json
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3102')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--browser', choices=['chromium', 'webkit'], default='chromium')
parser.add_argument('--output', default='.backups/product-performance/table-ui')
args = parser.parse_args()
out = Path(args.output) / args.browser
out.mkdir(parents=True, exist_ok=True)
checks, requests, errors = [], [], []
fail_next_page = False
customers = [dict(id=i, code=f'KH-{i:03}', name=f'Khách QA {i:02}', status='active',
    phone=f'09000000{i:02}', id_card=f'{i:012}', address='Địa chỉ QA', store_id=31,
    store_name='Cơ sở QA', contract_count=i, customer_revision='1') for i in range(1, 32)]
contracts = [dict(id=i, code=f'HD-{i:03}', name=f'HD-{i:03}', status='renting', store_id=31,
    customer_id=i, customer_name=f'Khách QA {i:02}', customer_phone=f'09000000{i:02}',
    customer_status='active', store_name='Cơ sở QA', total_amount=100000, paid_amount=20000,
    deposit_amount=0, rental_type='daily', contract_type_id='daily', contract_type_name='Thuê theo ngày',
    vehicle_name='Xe QA', license=f'QA-{i:03}', vehicles_json='[]', billing_plan_json='',
    start_date='2026-10-01T09:00:00Z', end_date='2026-10-30T09:00:00Z') for i in range(1, 32)]


def mock(route):
    global fail_next_page
    if mock_contract_type_read(route):
        return
    req = route.request
    parsed = urlparse(req.url)
    params = {k: v[0] for k, v in parse_qs(parsed.query).items()}
    assert req.method == 'GET', f'Unexpected write: {req.method} {parsed.path}'
    requests.append(dict(path=parsed.path, params=params))
    if parsed.path in ['/api/auth/customers', '/api/auth/order/car-rental']:
        assert params.get('table') == '1', 'A full collection should not load for this page/form'
        if fail_next_page and params.get('page') == '2':
            fail_next_page = False
            route.fulfill(status=503, json=dict(status='error', message='Lỗi thử nghiệm QA'))
            return
        source = customers if parsed.path.endswith('customers') else contracts
        search = params.get('search', '').lower()
        rows = [r for r in source if not search or search in r.get('customer_name', r['name']).lower()]
        rows = sorted(rows, key=lambda r: r.get(params.get('sort', 'code'), ''), reverse=params.get('direction') == 'desc')
        size = int(params.get('size', 10))
        pages = max(1, (len(rows) + size - 1) // size)
        number = min(int(params.get('page', 1)), pages)
        summary = None if parsed.path.endswith('customers') else dict(contractCount=len(rows), blacklistCount=0,
            totalAmount=len(rows) * 100000, receivableAmount=len(rows) * 80000, badDebtAmount=0)
        data = dict(rows=rows if params.get('all') == '1' else rows[(number - 1) * size:number * size], total=len(rows),
            scopeCount=len(source), tabCount=len(rows), page=number, pages=pages,
            statusCounts=[['active' if parsed.path.endswith('customers') else 'renting', len(rows)]],
            statuses=['active' if parsed.path.endswith('customers') else 'renting'], dueCount=0, summary=summary)
    else:
        data = {'/api/auth/stores': [dict(id=31, store_name='Cơ sở QA', status='opening')],
                '/api/auth/vehicle/vehicles': [], '/api/auth/hr/staff': [], '/api/auth/payment-events': [],
                '/api/auth/contract-staff': [], '/api/auth/vehicles/inventory': [],
                '/api/auth/store-directory': [dict(id=31,store_name='Cơ sở QA',status='opening')]}.get(parsed.path)
        if parsed.path.startswith('/api/auth/record-photos/'):
            data = []
        assert data is not None, parsed.path
    route.fulfill(json=dict(status='success', data=data))


with sync_playwright() as p:
    browser = getattr(p, args.browser).launch()
    context = browser.new_context(viewport=dict(width=1440, height=1000), timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
    context.add_cookies([dict(name='himoto_management_session', value=Path(args.session_cookie_file).read_text().strip(), url=args.url,
                             httpOnly=True, sameSite='Strict')])
    context.route('**/api/auth/**', mock)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url + '/contracts', wait_until='networkidle')
    expect(page.locator('.mg-result-range')).to_contain_text('31')
    expect(page.locator('tbody tr')).to_have_count(10)
    summary = page.get_by_role('region', name='Thống kê hợp đồng theo bộ lọc')
    expect(summary.locator('dd').nth(0)).to_have_text('31')
    expect(summary.locator('dd').nth(2)).to_contain_text('3.100.000')
    page.get_by_role('button', name='Trang sau', exact=True).click()
    expect(page.locator('.mg-current-page')).to_have_text('2')
    expect(page.locator('tbody')).to_contain_text('HD-011')
    expect(summary.locator('dd').nth(2)).to_contain_text('3.100.000')
    page.get_by_role('button', name='Trang đầu', exact=True).click()
    expect(page.locator('tbody')).to_contain_text('HD-001')
    assert sum(r['params'].get('page') == '1' for r in requests if r['path'].endswith('car-rental')) == 1
    checks.append('Server pagination renders 10/31 rows, keeps whole-result financial totals and reuses the previous page cache')

    page.get_by_role('button', name='Nhập hợp đồng', exact=True).click()
    form = page.locator('dialog.mg-contract-composer')
    expect(form).to_be_visible()
    form.get_by_role('button', name='Đóng', exact=True).click()
    assert not any(r['path'].endswith('/customers') for r in requests)
    checks.append('Opening contract entry loads vehicle/store dependencies without downloading the customer collection')

    page.goto(args.url + '/customers', wait_until='networkidle')
    expect(page.locator('tbody tr')).to_have_count(10)
    page.get_by_role('checkbox', name='Chọn KH-001', exact=True).check()
    fail_next_page = True
    page.get_by_role('button', name='Trang sau', exact=True).click()
    expect(page.locator('table').get_by_text('Lỗi thử nghiệm QA', exact=True)).to_be_visible()
    page.locator('table').get_by_role('button', name='Thử lại', exact=True).click()
    expect(page.locator('.mg-current-page')).to_have_text('2')
    expect(page.locator('tbody')).to_contain_text('KH-011')
    expect(page.get_by_role('button', name='Xóa đã chọn (1)', exact=True)).to_be_visible()
    checks.append('A failed next-page request can be retried; selecting a customer survives pagination')

    with page.expect_download() as downloaded:
        page.get_by_role('button', name='Xuất CSV', exact=True).click()
    downloaded.value.save_as(out / 'synthetic-customers.csv')
    exported = list(csv.reader(io.StringIO((out / 'synthetic-customers.csv').read_text(encoding='utf-8-sig'))))
    assert len(exported) == 32
    assert any('KH-031' in cell for row in exported for cell in row)
    assert requests[-1]['params'].get('all') == '1'
    checks.append('CSV exports all 31 matching rows while viewing page 2, rather than only its ten rows')

    search = page.get_by_role('searchbox')
    before = len(requests)
    search.fill('Khách QA 3')
    search.fill('Khách QA 31')
    expect(page.locator('tbody tr')).to_have_count(1)
    expect(page.locator('tbody')).to_contain_text('KH-031')
    assert not any(r['params'].get('search') == 'Khách QA 3' for r in requests[before:])
    expect(page.locator('.mg-current-page')).to_have_text('1')
    checks.append('Debounced server search sends the final keyword, resets pagination and renders the matching customer')
    assert not errors, errors
    browser.close()

result = dict(passed=len(checks), checks=checks, consoleErrors=errors, realBusinessWrites=0)
(out / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
