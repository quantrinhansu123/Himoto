"""Contract dates shown after opening a paged list. All business APIs mocked."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

p = argparse.ArgumentParser()
p.add_argument('--url', default='http://127.0.0.1:3027')
p.add_argument('--cookie-file', required=True)
p.add_argument('--output', default='.backups/contract-dates/ui')
a = p.parse_args()
out = Path(a.output)
out.mkdir(parents=True, exist_ok=True)
expect.set_options(timeout=30000)
checks, errors, writes = [], [], []
missing_dates = False


def mock(route):
    if mock_contract_type_read(route):
        return
    req = route.request
    u = urlparse(req.url)
    if req.method != 'GET':
        writes.append(req.method + ' ' + u.path)
        route.abort()
        return
    if u.path == '/api/auth/order/car-rental':
        row = dict(id=901, code='QA-DATES', name='QA-DATES', status='overdue', customer_name='Khách QA', store_id=23, store_name='CS QA',
                   start_date='2026-10-18T17:19', end_date='2026-10-19T17:19', created_at='' if missing_dates else '2026-10-18T10:28:22.074Z',
                   signed_on='' if missing_dates else '2026-10-18', rental_type='daily', vehicles_json='[]', total_amount=300000, paid_amount=300000, deposit_amount=8000000)
        data = dict(rows=[row], total=1, scopeCount=1, tabCount=1, page=1, pages=1, statuses=['overdue'], statusCounts=[['overdue', 1], ['renting', 1]], dueCount=0,
                    summary=dict(contractCount=1, blacklistCount=0, totalAmount=300000, receivableAmount=0, badDebtAmount=0)) if parse_qs(u.query).get('table') else [row]
    elif u.path in ['/api/auth/stores', '/api/auth/store-directory']:
        data = [dict(id=23, store_name='CS QA')]
    else:
        data = []
    route.fulfill(json=dict(status='success', data=data))


with sync_playwright() as pw:
    for engine, width in [('chromium', 1440), ('webkit', 390)]:
        browser = getattr(pw, engine).launch()
        ctx = browser.new_context(viewport=dict(width=width, height=950), timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
        ctx.add_init_script("const f=fetch;window.fetch=function(i,o){const u=new URL(typeof i==='string'?i:i.url,location.href);return u.pathname==='/api/auth/payment-events'?Promise.resolve(Response.json({status:'success',data:[]})):f.call(this,i,o);};")
        ctx.add_cookies([dict(name='himoto_management_session', value=Path(a.cookie_file).read_text().strip(), url=a.url, httpOnly=True, sameSite='Strict')])
        ctx.route('**/api/**', mock)
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        for missing_dates in [False, True]:
            page.goto(a.url + '/contracts', wait_until='networkidle', timeout=120000)
            expect(page.locator('.mg-status-tabs').get_by_role('button', name='Quá hạn', exact=False)).to_contain_text('1')
            page.locator('button.mg-row-menu-trigger').filter(visible=True).first.click()
            page.get_by_role('menuitem', name='Xem chi tiết', exact=True).click()
            dialog = page.get_by_role('dialog', name='Chi tiết hợp đồng: QA-DATES', exact=True)
            vehicle_panel = dialog.get_by_role('tabpanel', name='Thông tin phương tiện', exact=False)
            expect(vehicle_panel.get_by_text('18/10/2026 17:19', exact=True)).to_be_visible()
            expect(vehicle_panel.get_by_text('19/10/2026 17:19', exact=True)).to_be_visible()
            dialog.get_by_role('tab', name='Hợp đồng', exact=False).click()
            panel = dialog.get_by_role('tabpanel', name='Hợp đồng', exact=False)
            for label in ['Ngày tạo / nhập hợp đồng', 'Ngày ký hợp đồng']:
                expect(panel.get_by_text(label, exact=True).locator('..').locator('dd')).to_have_text('—' if missing_dates else '18/10/2026')
            dialog.screenshot(path=str(out / f'{engine}-{width}-{"missing" if missing_dates else "saved"}.png'))
            checks.append(f'{engine} {width}px: ' + ('missing existing dates stay blank' if missing_dates else 'saved creation/signing dates stay 18 October; rental dates remain unchanged'))
        ctx.close()
        browser.close()
assert not errors, errors
assert not writes, writes
report = dict(passed=len(checks), checks=checks, businessWrites=0)
(out / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
