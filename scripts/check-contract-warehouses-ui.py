"""Warehouse-filtered contracts with a separate customer source. API fixtures only."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

p = argparse.ArgumentParser()
p.add_argument('--url', default='http://127.0.0.1:3027')
p.add_argument('--cookie-file', required=True)
p.add_argument('--output', default='.backups/contract-warehouses/ui')
a = p.parse_args()
out = Path(a.output)
out.mkdir(parents=True, exist_ok=True)
expect.set_options(timeout=30000)
stores = [dict(id=31, store_name='CS Láng'), dict(id=32, store_name='CS Nguyễn Hoàng'), dict(id=23, store_name='CS Giáp Bát')]
rows = [dict(id=i, code=code, name=code, status='renting', customer_name=f'Khách QA {i}', store_id=source,
             store_name=next(s['store_name'] for s in stores if s['id'] == source), warehouse_store_ids_json=json.dumps([stock]),
             warehouse_store_name=next(s['store_name'] for s in stores if s['id'] == stock), start_date='2026-07-07T15:30', end_date='2026-10-30T15:30',
             license=plate, vehicles_json='[]', total_amount=3000000, deposit_amount=2000000)
        for i, code, plate, source, stock in [(1, 'VPS-28521', '98E1-438.66', 31, 32), (2, 'VPS-28404', '29B2-153.34', 31, 32),
                                              (3, 'QA-OTHER-STOCK', 'QA-GB', 31, 23), (4, 'QA-NH-SOURCE', 'QA-NH', 32, 32)]]
checks, errors, writes = [], [], []


def mock(route):
    if mock_contract_type_read(route):
        return
    req = route.request
    u = urlparse(req.url)
    q = {k: v[0] for k, v in parse_qs(u.query).items()}
    if u.path == '/api/auth/gps/refresh':
        route.fulfill(json=dict(status='success', data=dict(cached=True)))
        return
    if req.method != 'GET':
        writes.append(req.method + ' ' + u.path)
        route.abort()
        return
    if u.path == '/api/auth/order/car-rental':
        assert q.get('store_basis') == 'warehouse', 'Contract list must request warehouse filtering'
        stock = q.get('store', 'all')
        scoped = [r for r in rows if stock == 'all' or int(stock) in json.loads(r['warehouse_store_ids_json'])]
        filtered = [r for r in scoped if not q.get('filter_store_id') or str(r['store_id']) == q['filter_store_id']]
        data = dict(rows=filtered, total=len(filtered), scopeCount=len(scoped), tabCount=len(filtered), page=1, pages=1, statuses=['renting'],
                    statusCounts=[['renting', len(filtered)]], dueCount=0,
                    summary=dict(contractCount=len(filtered), blacklistCount=0, totalAmount=len(filtered)*3000000, receivableAmount=0, badDebtAmount=0))
    elif u.path == '/api/auth/order/car-rental/followups':
        data = [dict(id=int(i), followup=dict(contact_status='uncontacted', handling_status='branch', customer_condition='', notes='', revision=0)) for i in q.get('ids', '').split(',') if i]
    elif u.path in ['/api/auth/stores', '/api/auth/store-directory']:
        data = stores
    else:
        data = []
    route.fulfill(json=dict(status='success', data=data))


with sync_playwright() as pw:
    for engine, width in [('chromium', 1440), ('webkit', 390), ('webkit', 320)]:
        browser = getattr(pw, engine).launch()
        ctx = browser.new_context(viewport=dict(width=width, height=950), reduced_motion='reduce', timezone_id='Asia/Ho_Chi_Minh')
        ctx.add_init_script("const f=fetch;window.fetch=function(i,o){const u=new URL(typeof i==='string'?i:i.url,location.href);return u.pathname==='/api/auth/payment-events'?Promise.resolve(Response.json({status:'success',data:[]})):f.call(this,i,o);};")
        ctx.add_cookies([dict(name='himoto_management_session', value=Path(a.cookie_file).read_text().strip(), url=a.url, httpOnly=True, sameSite='Strict')])
        ctx.route('**/api/**', mock)
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(a.url + '/contracts', wait_until='networkidle', timeout=120000)
        branch = page.get_by_role('combobox', name='Cơ sở đang xem', exact=True)
        branch.select_option('32')
        records = page.locator('tbody tr') if width > 600 else page.locator('.mg-mobile-record-card')
        expect(records).to_have_count(3)
        expect(page.get_by_text('3 kết quả phù hợp', exact=True)).to_be_visible()
        for code in ['VPS-28521', 'VPS-28404']:
            record = records.filter(has_text=code)
            expect(record.get_by_text('Nguồn khách: CS Láng', exact=True)).to_be_visible()
            expect(record.get_by_text('Kho xe: CS Nguyễn Hoàng', exact=True)).to_be_visible()
            if width > 600:
                assert record.locator('td[data-column="customer_name"]').evaluate('e => e.getBoundingClientRect().width >= 200'), 'Customer/branch column is squeezed'
                assert record.evaluate('e => e.getBoundingClientRect().height < 180'), 'Branch labels wrap into an unreadable column'
        page.screenshot(path=str(out / f'{engine}-{width}-nh.png'), full_page=True)
        checks.append(f'{engine} {width}px: selecting Nguyễn Hoàng includes both Láng-source rentals and labels both branches')
        page.get_by_text('Bộ lọc nâng cao', exact=True).click()
        source = page.get_by_role('combobox', name='Tất cả nguồn khách', exact=True)
        source.select_option('31')
        expect(records).to_have_count(2)
        expect(page.get_by_text('2 kết quả phù hợp', exact=True)).to_be_visible()
        source.select_option('')
        branch.select_option('31')
        expect(page.get_by_text('Không tìm thấy kết quả', exact=True).filter(visible=True)).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Page overflows viewport'
        checks.append(f'{engine} {width}px: source filter is independent; selecting Láng warehouse does not include Nguyễn Hoàng vehicles')
        ctx.close()
        browser.close()
assert not errors, errors
assert not writes, writes
report = dict(passed=len(checks), checks=checks, businessWrites=0)
(out / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
