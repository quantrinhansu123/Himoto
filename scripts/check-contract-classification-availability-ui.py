"""Read-only live UI regression; all API writes, including Telegram/GPS refresh, are blocked."""
import argparse, json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

p = argparse.ArgumentParser()
p.add_argument('--url', default='http://127.0.0.1:3014')
p.add_argument('--session-cookie-file', required=True)
p.add_argument('--output', default='.backups/contract-classification-20261019/ui-local')
a = p.parse_args()
expect.set_options(timeout=30000)
out = Path(a.output)
out.mkdir(parents=True, exist_ok=True)
checks, errors, blocked = [], [], []
with sync_playwright() as pw:
    for browser_name, width, height in [('chromium', 1440, 1000), ('webkit', 390, 844)]:
        browser = getattr(pw, browser_name).launch()
        ctx = browser.new_context(viewport=dict(width=width, height=height), timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
        ctx.add_cookies([dict(name='himoto_management_session', value=Path(a.session_cookie_file).read_text().strip(), url=a.url, httpOnly=True, sameSite='Strict')])
        def guard(route):
            if route.request.method in ['GET', 'HEAD']:
                route.continue_()
            else:
                blocked.append(dict(method=route.request.method, path=urlparse(route.request.url).path))
                route.abort()
        ctx.route('**/api/**', guard)
        response = ctx.request.get(a.url+'/api/auth/order/car-rental?table=1&scope=ownership&search=L%C3%AA%20V%C4%83n%20Ninh')
        assert response.status == 200, response.status
        rows = response.json()['data']['rows']
        assert [r['code'] for r in rows] == ['VPS-28187'], [r['code'] for r in rows]
        response = ctx.request.get(a.url+'/api/auth/battery-contracts')
        assert response.status == 200
        assert any(b['code'] == 'PIN-VPS-28781' for b in response.json()['data'])
        page = ctx.new_page()
        page.set_default_timeout(60000)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(a.url+'/contracts/ownership', wait_until='domcontentloaded', timeout=90000)
        expect(page.locator('.mg-table-contracts')).to_have_attribute('aria-busy', 'false')
        page.get_by_role('searchbox').fill('Lê Văn Ninh')
        expect(page.get_by_role('searchbox')).to_have_value('Lê Văn Ninh')
        expect(page.locator('.mg-table-contracts tbody tr')).to_have_count(1)
        expect(page.locator('.mg-table-contracts tbody')).to_contain_text('VPS-28187')
        if width < 600:
            expect(page.get_by_role('button', name='Xem chi tiết Lê Văn Ninh', exact=True)).to_contain_text('89AB-727.00')
        else:
            expect(page.get_by_text('89AB-727.00', exact=True).first).to_be_visible()
        page.screenshot(path=str(out/f'ownership-{browser_name}-{width}.png'), full_page=True)
        page.goto(a.url+'/contracts', wait_until='domcontentloaded', timeout=90000)
        page.get_by_role('button', name='Nhận cọc giữ xe', exact=True).click()
        form = page.locator('dialog.mg-contract-composer')
        form.get_by_role('tab', name='Phương tiện', exact=False).click()
        form.locator('#contract-vehicle-store-filter').select_option('32')
        picker = form.locator('#contract-vehicle-0')
        picker.fill('12T121742')
        option = form.get_by_role('option', name='VISON', exact=False)
        expect(option).to_be_visible()
        expect(option).to_have_attribute('aria-disabled', 'true')
        expect(option).to_contain_text('VPS-12427')
        expect(option).to_contain_text('CS Hà Đông')
        expect(option).to_contain_text('VPS-9262')
        expect(option).to_contain_text('CS Nguyễn Hoàng')
        # Pointer and Enter must never select a blocked vehicle.
        option.evaluate('(el)=>el.click()')
        expect(picker).to_have_value('12T121742')
        picker.press('Enter')
        expect(picker).to_have_value('12T121742')
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        page.screenshot(path=str(out/f'blocked-vehicle-{browser_name}-{width}.png'), full_page=True)
        checks.append(dict(browser=browser_name, width=width, batterySeparated=True, allBlockersVisible=True, punctuationFreeSearch=True, pointerAndKeyboardBlocked=True, overflow=False))
        browser.close()
assert not errors, errors
assert all(b['path']=='/api/auth/gps/refresh' for b in blocked), blocked
report = dict(checks=checks, errors=errors, blockedGpsRefresh=len(blocked), realBusinessWrites=0, realTelegramRequests=0)
(out/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
