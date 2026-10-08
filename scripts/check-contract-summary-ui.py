"""Synthetic API QA for filter summaries and quick Blacklist; no operational writes."""
import argparse
import copy
import json
import re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3009')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='.backups/contract-summary-ui')
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
checks, errors, unexpected, writes = [], [], [], []
mode = {'next': '', 'missing': False, 'large': False, 'hold_reads': False, 'read_error': False}
held = []
customers = [dict(id=1, name='Khách Blacklist QA', status='bad_debt', customer_revision='1', warning='', store_id=23),
    dict(id=2, name='Khách cảnh báo QA', status='warning', customer_revision='1', warning='Giữ cảnh báo', store_id=23),
    dict(id=3, name='Khách chưa hoàn tất QA', status='draft', customer_revision='1', warning='', store_id=31)]

def contract(number, **patch):
    return dict(id=number, contract_number=f'QA-{number:03d}', status='renting', customer_id=1,
        customer_name='Đặng QA', customer_phone='0900000001', store_id=23, rental_type='monthly',
        start_date='2026-10-08' if number % 2 else '2026-10-09', total_amount='1000', paid_amount='300',
        vehicles=[dict(id=1, name='Xe QA', license='QA-A'), dict(id=2, name='Xe QA', license='QA-B')]) | patch

records = [contract(number) for number in range(1, 15)] + [
    contract(15, status='bad_debt', customer_id=2, total_amount='2000', paid_amount='500'),
    contract(16, store_id=31, status='overdue', rental_type='daily', total_amount='500', paid_amount='700'),
    contract(17, status='draft', total_amount='9999', paid_amount='0'),
    contract(18, status='cancelled', total_amount='8000', paid_amount='0'),
    contract(19, status='completed', total_amount='3000', paid_amount='0'),
    contract(20, store_id=31, status='wait_payment', total_amount='1200', paid_amount='200')]

def mock_api(route):
    request = route.request
    endpoint = urlparse(request.url).path
    if mode['read_error'] and endpoint == '/api/auth/order/car-rental':
        route.fulfill(status=503, json={'status': 'error'})
        return
    if mode['hold_reads'] and endpoint.startswith('/api/auth/') and request.method == 'GET':
        held.append(route)
        return
    if request.method == 'PATCH' and re.fullmatch(r'/api/auth/customers/\d+/blacklist', endpoint):
        payload = request.post_data_json
        writes.append(payload)
        if mode['next'] == 'offline':
            mode['next'] = ''
            route.abort('failed')
            return
        if mode['next'] == 'conflict':
            mode['next'] = ''
            route.fulfill(status=409, json={'status': 'error', 'message': 'Hồ sơ đã được người khác thay đổi. Nhấn Làm mới trước khi đổi Blacklist.'})
            return
        customer = next(row for row in customers if row['id'] == int(endpoint.split('/')[-2]))
        assert payload['revision'] == customer['customer_revision']
        assert set(payload) == {'blacklisted', 'revision'}
        customer['status'] = 'bad_debt' if payload['blacklisted'] else 'draft' if customer['id'] == 3 else 'warning' if customer['warning'] else 'active'
        customer['customer_revision'] = str(int(customer['customer_revision']) + 1)
        route.fulfill(json={'status': 'success', 'data': dict(id=customer['id'], status='blacklist' if payload['blacklisted'] else customer['status'], customer_revision=customer['customer_revision'])})
        return
    if request.method != 'GET':
        unexpected.append(endpoint)
        route.abort('blockedbyclient')
        return
    if endpoint in ['/api/session', '/api/auth/me']:
        route.fulfill(json={'user': {'id': 143, 'name': 'QA'}})
        return
    data = copy.deepcopy(records)
    if mode['missing']:
        data[0]['paid_amount'] = None
    if mode['large']:
        data[0]['total_amount'] = '9999999999999'
    endpoints = {'/api/auth/order/car-rental': data, '/api/auth/customers': customers,
        '/api/auth/stores': [dict(id=23, store_name='Cơ sở QA A', status='opening'), dict(id=31, store_name='Cơ sở QA B', status='opening')],
        '/api/auth/vehicle/vehicles': [], '/api/auth/hr/staff': []}
    if endpoint not in endpoints:
        unexpected.append(endpoint)
        route.abort('blockedbyclient')
        return
    route.fulfill(json={'status': 'success', 'data': endpoints[endpoint]})

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, timezone_id='Asia/Ho_Chi_Minh')
    context.add_cookies([dict(name='himoto_management_session', value=Path(args.session_cookie_file).read_text(encoding='utf-8').strip(), url=args.url, httpOnly=True, sameSite='Strict')])
    context.route('**/api/**', mock_api)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url + '/contracts', wait_until='domcontentloaded', timeout=120000)
    summary = page.get_by_role('region', name='Thống kê hợp đồng theo bộ lọc')

    def metric(label):
        return summary.locator('.mg-contract-metrics > div').filter(has=page.locator('dt', has_text=re.compile('^' + re.escape(label) + '$'))).locator('dd')

    def check_values(count, blacklist, total, debt, bad):
        for label, value in zip(['Số hợp đồng', 'Số Blacklist', 'Tổng tiền', 'Công nợ', 'Nợ xấu'], [str(count), str(blacklist), total, debt, bad]):
            expect(metric(label)).to_have_text(re.compile('^' + re.escape(value).replace(r'\ ', r'\s*') + '$'))

    check_values(20, 1, '20.700 ₫', '12.300 ₫', '1.500 ₫')
    assert page.locator('.mg-table tbody tr').count() == 10
    page.get_by_role('button', name='Trang sau', exact=True).click()
    check_values(20, 1, '20.700 ₫', '12.300 ₫', '1.500 ₫')
    page.get_by_label('Số dòng mỗi trang').select_option('20')
    page.get_by_role('button', name='Sắp xếp theo Tiền thuê', exact=True).click()
    check_values(20, 1, '20.700 ₫', '12.300 ₫', '1.500 ₫')
    page.screenshot(path=str(output / 'summary-1440.png'), full_page=True)
    checks.append('all filtered contracts aggregate before pagination; page, size and sort preserve all five values')

    page.get_by_label('Cơ sở đang xem').select_option('23')
    check_values(18, 1, '19.000 ₫', '11.300 ₫', '1.500 ₫')
    page.get_by_label('Lọc trạng thái', exact=True).select_option('renting')
    page.get_by_label('Tất cả loại hợp đồng', exact=True).select_option('monthly')
    page.get_by_role('searchbox').fill('dang qa')
    page.get_by_label('Từ ngày', exact=True).fill('2026-10-08')
    page.get_by_label('Đến ngày', exact=True).fill('2026-10-08')
    check_values(7, 1, '7.000 ₫', '4.900 ₫', '0 ₫')
    page.get_by_role('searchbox').fill('khong co ket qua')
    check_values(0, 0, '0 ₫', '0 ₫', '0 ₫')
    page.locator('.mg-filter-summary').get_by_role('button', name='Xóa bộ lọc').click()
    check_values(20, 1, '20.700 ₫', '12.300 ₫', '1.500 ₫')
    checks.append('branch, status, type, accent-free search and inclusive dates combine; empty/reset values are accurate')

    mode['missing'] = True
    page.get_by_role('button', name='Làm mới', exact=True).click()
    expect(metric('Công nợ')).to_have_text('—')
    expect(metric('Tổng tiền')).to_have_text(re.compile(r'20\.700\s*₫'))
    expect(summary.get_by_text('Chưa đủ số liệu', exact=False)).to_be_visible()
    mode['missing'] = False
    mode['hold_reads'] = True
    page.get_by_role('button', name='Làm mới', exact=True).click()
    expect(metric('Số hợp đồng')).to_have_text('—')
    expect(summary).to_have_attribute('aria-busy', 'true')
    page.wait_for_timeout(300)
    mode['hold_reads'] = False
    for route in held[:]:
        mock_api(route)
    held.clear()
    check_values(20, 1, '20.700 ₫', '12.300 ₫', '1.500 ₫')
    mode['read_error'] = True
    page.get_by_role('button', name='Làm mới', exact=True).click()
    expect(page.get_by_text('Không tải được dữ liệu', exact=True)).to_be_visible()
    expect(metric('Số hợp đồng')).to_have_text('—')
    expect(metric('Tổng tiền')).to_have_text('—')
    mode['read_error'] = False
    page.get_by_role('button', name='Thử lại', exact=True).click()
    check_values(20, 1, '20.700 ₫', '12.300 ₫', '1.500 ₫')
    checks.append('missing paid data remains unknown; reload displays unavailable/loading placeholders, then recovers')

    page.goto(args.url + '/contracts?customer_id=2', wait_until='domcontentloaded')
    check_values(1, 0, '2.000 ₫', '1.500 ₫', '1.500 ₫')
    page.goto(args.url + '/contracts/drafts', wait_until='domcontentloaded')
    check_values(1, 1, '0 ₫', '0 ₫', '0 ₫')
    checks.append('customer URL filter narrows counts; Log counts drafts but excludes their money from financial metrics')

    page.goto(args.url + '/customers', wait_until='domcontentloaded')
    mark = page.get_by_role('button', name='Đưa vào Blacklist: Khách cảnh báo QA', exact=True)
    mark.click()
    expect(page.get_by_role('button', name='Bỏ Blacklist cho Khách cảnh báo QA', exact=True)).to_be_enabled()
    page.locator('a[href="/contracts"]').first.click()
    check_values(20, 2, '20.700 ₫', '12.300 ₫', '1.500 ₫')
    page.locator('a[href="/customers"]').first.click()
    page.get_by_role('button', name='Bỏ Blacklist cho Khách cảnh báo QA', exact=True).click()
    expect(mark).to_be_enabled()
    row = page.locator('.mg-table tbody tr').filter(has_text='Khách cảnh báo QA')
    expect(row.locator('.mg-status')).to_have_text('Cần lưu ý')
    page.get_by_role('button', name='Đưa vào Blacklist: Khách chưa hoàn tất QA', exact=True).click()
    page.get_by_role('button', name='Bỏ Blacklist cho Khách chưa hoàn tất QA', exact=True).click()
    expect(page.locator('.mg-table tbody tr').filter(has_text='Khách chưa hoàn tất QA').locator('.mg-status')).to_have_text('Chưa hoàn tất')
    checks.append('quick mark/remove updates row and contract count immediately; warning and incomplete profiles restore correctly')

    before = len(writes)
    mode['next'] = 'conflict'
    mark.click()
    expect(page.locator('.mg-blacklist-error')).to_contain_text('người khác thay đổi')
    expect(mark).to_be_enabled()
    assert customers[1]['status'] == 'warning'
    mode['next'] = 'offline'
    mark.click()
    expect(page.locator('.mg-blacklist-error')).to_be_visible()
    expect(mark).to_be_enabled()
    assert len(writes) == before + 2
    page.get_by_role('button', name='Làm mới', exact=True).click()
    expect(page.locator('.mg-blacklist-error')).to_have_count(0)
    expect(mark).to_be_enabled()
    checks.append('conflict/offline never show false success or automatic retries; refresh recovers current customer state')

    page.set_viewport_size({'width': 375, 'height': 812})
    mark.scroll_into_view_if_needed()
    assert mark.bounding_box()['height'] >= 44
    page.screenshot(path=str(output / 'blacklist-375.png'), full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.goto(args.url + '/contracts', wait_until='domcontentloaded')
    mode['large'] = True
    page.get_by_role('button', name='Làm mới', exact=True).click()
    expect(metric('Tổng tiền')).to_contain_text('10.000.000.019.699')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    summary.scroll_into_view_if_needed()
    page.screenshot(path=str(output / 'summary-375.png'), full_page=True)
    assert summary.locator('.mg-contract-metrics > div').count() == 5
    checks.append('375px: five metrics and large money wrap without page overflow; quick action has 44px touch height')
    assert not errors, errors
    assert not unexpected, unexpected
    browser.close()

(output / 'results.json').write_text(json.dumps(dict(passed=len(checks), checks=checks, js_errors=errors, unexpected_api=unexpected, mocked_status_changes=len(writes), operational_writes=0), ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(passed=len(checks), checks=checks, js_errors=errors, operational_writes=0), ensure_ascii=False, indent=2))
