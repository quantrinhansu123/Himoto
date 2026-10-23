"""Aggregate history UX with synthetic GET APIs only; never writes business data."""
import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3102')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--browser', choices=['chromium', 'webkit'], default='chromium')
parser.add_argument('--output', default='docs/qa/vehicle-transfer-history')
args = parser.parse_args()
out = Path(args.output) / args.browser
out.mkdir(parents=True, exist_ok=True)
today = datetime.now(timezone(timedelta(hours=7))).date().isoformat()
checks, errors, requests = [], [], []
fail_next = False
stores = [dict(id=31, store_name='Cơ sở đi QA', status='opening'), dict(id=32, store_name='Cơ sở nhận QA', status='opening')]
rows = [dict(id=i, vehicle_id=700+i, vehicle_name=f'Xe QA {i}', license=f'QA-{i:03}', from_store_id=31,
    to_store_id=32, from_store='Cơ sở đi QA', to_store='Cơ sở nhận QA', action='receive' if i % 2 else 'transfer',
    label='Nhận xe' if i % 2 else 'Chuyển xe', at=f'{today}T10:30:00Z', actor='Người nhận QA' if i % 2 else 'Người chuyển QA',
    note='Ghi chú luân chuyển QA', changes=[dict(field='status', label='Trạng thái', **{'from': 'Chờ luân chuyển' if i % 2 else 'Lưu kho', 'to': 'Lưu kho' if i % 2 else 'Chờ luân chuyển'})]) for i in range(1, 29)]


def mock(route):
    global fail_next
    req = route.request
    assert req.method == 'GET', f'Unexpected business write: {req.method}'
    parsed = urlparse(req.url)
    if parsed.path == '/api/session':
        route.fulfill(json=dict(user=dict(name='Người thao tác QA')))
    elif parsed.path == '/api/auth/stores':
        route.fulfill(json=dict(status='success', data=stores))
    elif parsed.path == '/api/auth/vehicles/transfers':
        query = {k: v[0] for k, v in parse_qs(parsed.query, keep_blank_values=True).items()}
        requests.append(query)
        if fail_next:
            fail_next = False
            route.fulfill(status=500, json=dict(status='error', message='Lỗi tải lịch sử QA'))
            return
        filtered = list(rows) if query['from'] == today and query['to'] == today else []
        if query['action']:
            filtered = [r for r in filtered if r['action'] == query['action']]
        if query['from_store']:
            filtered = [r for r in filtered if str(r['from_store_id']) == query['from_store']]
        if query['to_store']:
            filtered = [r for r in filtered if str(r['to_store_id']) == query['to_store']]
        if query['store'] != 'all':
            filtered = [r for r in filtered if query['store'] in [str(r['from_store_id']), str(r['to_store_id'])]]
        if query['search']:
            filtered = [r for r in filtered if query['search'] in r['license']]
        page = int(query['page'])
        scope_count = len([r for r in rows if query['store'] == 'all' or query['store'] in [str(r['from_store_id']), str(r['to_store_id'])]])
        route.fulfill(json=dict(status='success', data=dict(rows=filtered[(page-1)*25:page*25], total=len(filtered), scopeCount=scope_count, page=page, size=25)))
    else:
        raise AssertionError(f'Unexpected API (history must not fetch fleet/details): {parsed.path}')


with sync_playwright() as p:
    browser = getattr(p, args.browser).launch()
    context = browser.new_context(viewport=dict(width=375 if args.browser == 'webkit' else 1440, height=1000), timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
    context.add_cookies([dict(name='himoto_management_session', value=Path(args.session_cookie_file).read_text().strip(), url=args.url, httpOnly=True, sameSite='Strict')])
    context.route('**/api/**', mock)
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(args.url + '/vehicles/transfers', wait_until='networkidle')
    form = page.get_by_role('form', name='Lọc lịch sử luân chuyển')
    expect(form.get_by_label('Từ ngày', exact=True)).to_have_value(today)
    expect(form.get_by_label('Đến ngày', exact=True)).to_have_value(today)
    expect(page.locator('.mg-transfer-pagination')).to_contain_text('28 thao tác')
    expect(page.locator('.mg-transfer-pagination')).to_contain_text('Trang 1/2')
    assert requests[0]['from'] == today and requests[0]['to'] == today
    if args.browser == 'webkit':
        expect(page.locator('.mg-mobile-records .mg-transfer-direction').first).to_have_text('Cơ sở đi QA → Cơ sở nhận QA')
        assert page.locator('.mg-mobile-card-detail').first.get_attribute('open') is None
        expect(page.locator('.mg-mobile-card-summary').first).to_contain_text('Người nhận QA')
    else:
        expect(page.locator('tbody tr')).to_have_count(25)
        expect(page.locator('tbody tr').first).to_contain_text('Cơ sở đi QA')
        expect(page.locator('tbody tr').first).to_contain_text('Cơ sở nhận QA')
        expect(page.locator('tbody tr').first).to_contain_text('Chờ luân chuyển')
    page.screenshot(path=str(out / 'history-today.png'), full_page=False)
    checks.append('Today opens all vehicle transfers and receipts with time, actor and visible branch direction, without per-vehicle/fleet API calls')
    page.get_by_role('button', name='Trang sau', exact=True).click()
    expect(page.locator('.mg-transfer-pagination')).to_contain_text('Trang 2/2')
    form.get_by_label('Thao tác', exact=True).select_option('receive')
    form.get_by_label('Cơ sở chuyển đi', exact=True).select_option('31')
    form.get_by_label('Cơ sở nhận', exact=True).select_option('32')
    form.get_by_role('button', name='Xem lịch sử', exact=True).click()
    expect(page.locator('.mg-transfer-pagination')).to_contain_text('14 thao tác')
    expect(page.locator('.mg-transfer-pagination')).to_contain_text('Trang 1/1')
    assert requests[-1]['action'] == 'receive' and requests[-1]['from_store'] == '31' and requests[-1]['to_store'] == '32'
    checks.append('Pagination fetches the next server slice; applying origin/destination/action filters resets to the first page')
    form.get_by_label('Tìm kiếm', exact=True).fill('QA-003')
    form.get_by_role('button', name='Xem lịch sử', exact=True).click()
    expect(page.locator('.mg-transfer-pagination')).to_contain_text('1 thao tác')
    page.get_by_label('Cơ sở đang xem', exact=True).select_option('31')
    page.wait_for_timeout(150)
    assert requests[-1]['store'] == '31'
    checks.append('Search and global branch selection reach the history API, preserving active date/action filters')
    before = len(requests)
    form.get_by_label('Đến ngày', exact=True).fill('2020-01-01')
    expect(form.get_by_role('button', name='Xem lịch sử', exact=True)).to_be_disabled()
    expect(form.get_by_role('alert')).to_contain_text('Chọn khoảng ngày hợp lệ')
    assert len(requests) == before
    form.get_by_label('Từ ngày', exact=True).fill('2020-01-01')
    form.get_by_role('button', name='Xem lịch sử', exact=True).click()
    expect(page.get_by_text('Không có thao tác luân chuyển trong khoảng ngày và bộ lọc đã chọn.', exact=True)).to_be_visible()
    fail_next = True
    form.get_by_role('button', name='Hôm nay', exact=True).click()
    expect(page.locator('.mg-page-vehicle-transfers').get_by_role('alert')).to_have_text('Lỗi tải lịch sử QA')
    expect(form.get_by_label('Tìm kiếm', exact=True)).to_have_value('QA-003')
    page.get_by_role('button', name='Thử lại', exact=True).click()
    expect(page.locator('.mg-transfer-pagination')).to_contain_text('1 thao tác')
    checks.append('Invalid ranges are blocked, empty results are distinct from load failures, and retry preserves user filters')
    page.set_viewport_size(dict(width=320, height=812))
    page.locator('.mg-mobile-card-detail summary').first.click()
    expect(page.locator('.mg-mobile-detail-fields').first).to_contain_text('Trạng thái:')
    assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1')
    assert not page.locator('table:visible').count()
    page.screenshot(path=str(out / 'history-320.png'))
    checks.append('At 320px cards retain full direction and audit changes without horizontal page overflow')
    assert not errors, errors
    browser.close()

result = dict(passed=len(checks), checks=checks, errors=errors, requests=len(requests), realBusinessWrites=0)
(out / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
