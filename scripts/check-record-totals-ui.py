"""Read-only browser QA against a local server; no business writes."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3021')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='.backups/record-totals-20261024/ui')
args = parser.parse_args()
expect.set_options(timeout=60000)
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
specs = [
    ('contracts', '/contracts', '/api/auth/order/car-rental?table=1&scope_count=1', 'scopeCount'),
    ('battery', '/contracts/battery', '/api/auth/battery-contracts?scope_count=1', 'scopeCount'),
    ('stores', '/stores', '/api/auth/stores?table=1', 'scopeCount'),
    ('vehicles', '/vehicles', '/api/auth/vehicle/vehicles?table=1', 'scopeCount'),
    ('transfers', '/vehicles/transfers', '/api/auth/vehicles/transfers', 'scopeCount'),
    ('cashbook', '/cashbook', '/api/auth/cashbook/vouchers', 'total'),
    ('customers', '/customers', '/api/auth/customers?table=1', 'scopeCount'),
    ('staff', '/staff', '/api/auth/hr/staff?table=1', 'scopeCount'),
]
checks, errors = [], []
with sync_playwright() as pw:
    for engine, width in [('chromium', 1440), ('webkit', 375)]:
        browser = getattr(pw, engine).launch()
        context = browser.new_context(viewport=dict(width=width, height=1000), timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
        context.add_cookies([dict(name='himoto_management_session', value=Path(args.session_cookie_file).read_text().strip(), url=args.url, httpOnly=True, sameSite='Strict')])
        def read_only(route):
            if route.request.method == 'POST' and '/api/auth/gps/refresh' in route.request.url:
                route.fulfill(json=dict(status='success', data={}))
                return
            if route.request.method != 'GET':
                route.abort()
                errors.append('Unexpected business write: ' + route.request.method)
                return
            route.continue_()
        context.route('**/api/**', read_only)
        page = context.new_page()
        page.set_default_timeout(60000)
        page.on('pageerror', lambda error: errors.append(str(error)))
        for name, path, endpoint, key in specs:
            response = context.request.get(args.url + endpoint, timeout=60000)
            assert response.ok, f'{name}: HTTP {response.status}'
            envelope = response.json()
            assert envelope['status'] == 'success', f'{name}: API error'
            total = envelope['data'][key]
            assert isinstance(total, int) and total >= 0
            formatted = f'{total:,}'.replace(',', '.')
            page.goto(args.url + path, wait_until='domcontentloaded')
            tile = page.locator('.mg-page-heading .mg-record-total:visible')
            expect(tile).to_have_count(1)
            expect(tile.locator('strong')).to_have_text(formatted)
            expect(tile.locator('small')).to_have_text('Trong phạm vi cơ sở và quyền truy cập')
            expect(page.locator('.mg-page-heading h1 .mg-title-count')).to_have_count(0)
            box = tile.bounding_box()
            assert box and box['x'] >= 0 and box['x'] + box['width'] <= width + 1, f'{name}: tile overflows'
            style = tile.evaluate('(e)=>({border:getComputedStyle(e).borderRadius,color:getComputedStyle(e.querySelector("strong")).color})')
            assert style['border'] == '10px'
            page.locator('.mg-page-heading:visible').screenshot(path=str(out / f'{engine}-{name}.png'))
            if name in ('customers', 'vehicles', 'staff'):
                last = page.get_by_role('button', name='Trang cuối', exact=True)
                if total > 10:
                    last.click()
                    expect(page.locator('.mg-current-page')).to_have_text(str((total + 9)//10))
                    expect(tile.locator('strong')).to_have_text(formatted)
                search = page.locator('.mg-toolbar .mg-search input[type=search]')
                search.fill('QA-RECORD-TOTAL-NO-SUCH-RECORD-20261024')
                expect(page.locator('.mg-result-range strong').last).to_have_text('0')
                expect(tile.locator('strong')).to_have_text(formatted)
            elif name == 'battery':
                page.locator('input[type=search]').fill('QA-RECORD-TOTAL-NO-SUCH-RECORD-20261024')
                expect(tile.locator('strong')).to_have_text(formatted)
            checks.append(dict(browser=engine, page=name, total=total, style=style))
        context.close()
        browser.close()
assert not errors, errors
(out / 'result.json').write_text(json.dumps(dict(passed=len(checks), checks=checks, businessWrites=0), ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(passed=len(checks), checks=checks, businessWrites=0), ensure_ascii=False))
