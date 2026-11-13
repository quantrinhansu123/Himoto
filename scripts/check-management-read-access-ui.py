"""Read access regression for a global non-admin; all business APIs are mocked."""
import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3036')
parser.add_argument('--cookie-file', required=True)
parser.add_argument('--output', default='.backups/management-read-access/ui')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
checks, errors, writes = [], [], []
expect.set_options(timeout=30000)
now = datetime.now(timezone.utc)
stores = [dict(id=32, store_name='CS Rental QA', kind='physical', status='opening'),
          dict(id=35, store_name='CS Ownership QA', kind='lease_to_own', status='opening')]
contracts = [dict(id=store['id'], contract_number=f'QA-ACCESS-{store["id"]}', status='overdue',
                  store_id=store['id'], store_kind=store['kind'], store_name=store['store_name'],
                  customer_name='Read access QA', rental_type='ownership' if store['id'] == 35 else 'daily',
                  start_date=(now-timedelta(days=10)).isoformat(), end_date=(now-timedelta(days=2)).isoformat(),
                  total_amount=500000, paid_amount=0, deposit_amount=0,
                  vehicles=[dict(id=store['id'], name='QA vehicle', license=f'QA-{store["id"]}',
                                 return_at=(now-timedelta(days=2)).isoformat())]) for store in stores]

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    for width in [1440, 390]:
        context = browser.new_context(viewport=dict(width=width, height=1000), reduced_motion='reduce')
        context.add_cookies([dict(name='himoto_management_session', value=Path(args.cookie_file).read_text().strip(),
                                 url=args.url, httpOnly=True, sameSite='Strict')])
        session = context.request.get(args.url+'/api/session')
        assert session.status == 200, 'A valid session is required'
        user = session.json()['user']
        assert user['scope_all'] and 'contracts.read' in user['permissions']
        assert user['access_role'] != 'admin' and 'settings.write' not in user['permissions'], 'Use a non-admin with global contract read access'
        state = dict(changed=False)

        def mock(route):
            if mock_contract_type_read(route):
                return
            path = urlparse(route.request.url).path
            if route.request.method != 'GET':
                writes.append(dict(path=path, method=route.request.method))
                route.fulfill(status=403, json=dict(status='error', message='Read-only regression'))
                return
            if path == '/api/session':
                value = {**user, 'permissions': [*user['permissions'], 'settings.write']} if state['changed'] else user
                route.fulfill(json=dict(user=value))
                return
            data = stores if path in ['/api/auth/stores', '/api/auth/store-directory'] else contracts if path == '/api/auth/order/car-rental' else dict(selected_vehicles=[]) if path == '/api/auth/gps' else []
            route.fulfill(json=dict(status='success', data=data))

        context.route('**/api/**', mock)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(args.url+'/contracts/overdue', wait_until='networkidle', timeout=120000)
        total = page.locator('.mg-result-range strong').last
        expect(total).to_have_text('2')
        expect(page.get_by_role('button', name='Tất cả quá hạn', exact=False)).to_have_attribute('aria-pressed', 'true')
        selector = page.get_by_role('combobox', name='Cơ sở đang xem', exact=True)
        selector.select_option('35')
        expect(total).to_have_text('1')
        expect(page.locator('.mg-result-range')).to_contain_text('1–1')
        page.screenshot(path=str(out/f'ownership-overdue-{width}.png'))
        page.get_by_role('button', name='Xóa bộ lọc', exact=True).first.click()
        expect(selector).to_have_value('all')
        expect(total).to_have_text('2')
        page.get_by_role('button', name='Quá hạn truyền thống', exact=False).click()
        expect(total).to_have_text('1')
        page.get_by_role('button', name='Tất cả quá hạn', exact=False).click()
        expect(total).to_have_text('2')
        checks.append(f'{width}px: default overdue includes rental and ownership; every store, clear filters and traditional shortcuts remain usable')

        page.goto(args.url+'/stores', wait_until='networkidle', timeout=120000)
        expect(page.get_by_role('heading', name='Không có quyền truy cập', exact=True)).to_have_count(0)
        expect(page.locator('.mg-result-range strong').last).to_have_text('2')
        expect(page.locator('.mg-page-add')).to_have_count(0)
        expect(page.locator('.mg-source-badge')).to_have_text('Chỉ đọc')
        page.screenshot(path=str(out/f'stores-read-only-{width}.png'))
        checks.append(f'{width}px: global non-admin reads stores while store mutation controls remain unavailable')

        state['changed'] = True
        page.clock.install()
        page.clock.fast_forward(16000)
        with page.expect_request(lambda request: request.headers.get('rsc') == '1' and urlparse(request.url).path == '/stores'):
            page.evaluate("window.dispatchEvent(new Event('focus'))")
        state['changed'] = False
        page.wait_for_load_state('networkidle')
        checks.append(f'{width}px: a changed permission returned by the session API refreshes the server layout on focus')
        context.close()
    browser.close()

assert not errors, errors
assert not writes, writes
result = dict(passed=len(checks), checks=checks, pageErrors=errors, businessWrites=writes)
(out/'results.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
