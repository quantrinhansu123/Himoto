"""Vehicle warehouse/source distinction. API fixtures only; no business writes."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

p = argparse.ArgumentParser()
p.add_argument('--url', default='http://127.0.0.1:3027')
p.add_argument('--cookie-file', required=True)
p.add_argument('--output', default='.backups/vehicle-rental-sources/ui')
a = p.parse_args()
out = Path(a.output)
out.mkdir(parents=True, exist_ok=True)
expect.set_options(timeout=30000)
stores = [dict(id=23, store_name='CS Giáp Bát'), dict(id=34, store_name='CS Hàng Bút')]
rows = [dict(id=i, code=f'#{i}', name=f'Wave QA {i}', license=f'QA-{i}', status='using' if i < 4 else 'ready',
             store_id=23, store_name='CS Giáp Bát', holder_name=f'Khách QA {i}' if i < 4 else 'Lưu kho',
             beneficiary_store_id=34 if i == 1 else 23 if i == 2 else None,
             beneficiary_store_name='CS Hàng Bút' if i == 1 else 'CS Giáp Bát' if i == 2 else '',
             location_status='none', overdue_days=0) for i in range(1, 5)]
checks, errors, writes = [], [], []


def mock(route):
    req = route.request
    u = urlparse(req.url)
    q = parse_qs(u.query)
    if u.path == '/api/auth/gps/refresh':
        route.fulfill(json=dict(status='success', data=dict(cached=True)))
        return
    if req.method != 'GET':
        writes.append(req.method + ' ' + u.path)
        route.abort()
        return
    if u.path in ['/api/auth/stores', '/api/auth/store-directory']:
        data = stores
    elif u.path == '/api/auth/vehicle/vehicles':
        filtered = rows
        source = q.get('filter_beneficiary_store_id', [''])[0]
        status = q.get('status', [''])[0]
        if source:
            filtered = [r for r in filtered if str(r['beneficiary_store_id']) == source]
        tabs = filtered
        if status:
            filtered = [r for r in filtered if r['status'] == status]
        data = dict(rows=filtered, total=len(filtered), scopeCount=4, tabCount=len(tabs), page=1, pages=1,
                    statusCounts=[['using', sum(r['status'] == 'using' for r in tabs)], ['ready', sum(r['status'] == 'ready' for r in tabs)]],
                    statuses=['using', 'ready'], dueCount=0, summary=None) if q.get('table') else rows
    else:
        data = []
    route.fulfill(json=dict(status='success', data=data))


with sync_playwright() as pw:
    for engine, width in [('chromium', 1440), ('webkit', 390), ('webkit', 320)]:
        browser = getattr(pw, engine).launch()
        ctx = browser.new_context(viewport=dict(width=width, height=950), reduced_motion='reduce')
        ctx.add_cookies([dict(name='himoto_management_session', value=Path(a.cookie_file).read_text().strip(), url=a.url, httpOnly=True, sameSite='Strict')])
        ctx.add_init_script("const f=fetch;window.fetch=function(i,o){const u=new URL(typeof i==='string'?i:i.url,location.href);return u.pathname==='/api/auth/payment-events'?Promise.resolve(Response.json({status:'success',data:[]})):f.call(this,i,o);};")
        ctx.route('**/api/**', mock)
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(a.url + '/vehicles', wait_until='networkidle', timeout=120000)
        if width > 600:
            expect(page.locator('th[data-column="beneficiary_store_name"]')).to_have_text('Cơ sở nguồn khách')
            expect(page.locator('th[data-column="store_name"]')).to_have_text('Kho quản lý')
            first = page.locator('tbody tr').filter(has_text='QA-1')
            expect(first.locator('td[data-column="beneficiary_store_name"]')).to_have_text('CS Hàng Bút')
            expect(first.locator('td[data-column="store_name"]')).to_have_text('CS Giáp Bát')
            expect(page.locator('tbody tr').filter(has_text='QA-3').locator('td[data-column="beneficiary_store_name"]')).to_have_text('Chưa xác định')
            expect(page.locator('tbody tr').filter(has_text='QA-4').locator('td[data-column="beneficiary_store_name"]')).to_have_text('—')
        else:
            first = page.locator('.mg-mobile-record-card').filter(has_text='QA-1')
            expect(first.get_by_text('Kho quản lý: CS Giáp Bát', exact=True)).to_be_visible()
            expect(first.get_by_text('Cơ sở nguồn khách: CS Hàng Bút', exact=True)).to_be_visible()
            expect(page.locator('.mg-mobile-record-card').filter(has_text='QA-3').get_by_text('Cơ sở nguồn khách: Chưa xác định', exact=True)).to_be_visible()
            assert first.get_by_text('Cơ sở nguồn khách: CS Hàng Bút', exact=True).evaluate("e => getComputedStyle(e).whiteSpace === 'normal'"), 'Branch name must wrap on narrow phones'
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Page overflows viewport'
        page.screenshot(path=str(out / f'{engine}-{width}.png'), full_page=True)
        checks.append(f'{engine} {width}px: source/warehouse labelled separately; unknown source never falls back to stock')
        source_filter = page.get_by_role('combobox', name='Tất cả cơ sở nguồn khách', exact=True)
        source_filter.select_option('34')
        if width > 600:
            expect(page.locator('tbody tr')).to_have_count(1)
        else:
            expect(page.locator('.mg-mobile-record-card')).to_have_count(1)
        expect(page.get_by_text('1 kết quả phù hợp', exact=True)).to_be_visible()
        checks.append(f'{engine} {width}px: source filter narrows to the Hàng Bút customer and displays count')
        ctx.close()
        browser.close()
assert not errors, errors
assert not writes, writes
(out / 'results.json').write_text(json.dumps(dict(passed=len(checks), checks=checks, business_writes=0), ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(passed=len(checks), checks=checks, business_writes=0), ensure_ascii=False))
