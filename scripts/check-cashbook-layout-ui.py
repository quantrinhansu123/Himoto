"""Check readable cashbook columns with long synthetic data; intercept every API."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3101')
parser.add_argument('--session-cookie-file', required=True, help='Ignored local QA cookie JSON')
parser.add_argument('--output', default='.backups/cashbook-layout/ui')
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
columns = ['ID', 'Ngày', 'Giờ', 'Loại phiếu', 'Người thực hiện', 'Số tiền', 'Mã hợp đồng',
           'Hình thức thanh toán', 'Tài khoản nhận / chi', 'Cơ sở', 'Lý do', 'Nội dung']
records = [dict(id=83001 + index, type='in' if index == 0 else 'out',
    created_at='2026-10-10T18:34:00+07:00', user_id=8, user_name='Nhân sự QA',
    amount=200000 if index == 0 else 100000, order_id=12001, contract_code='QA-12001',
    payment_method='Chuyển khoản' if index == 0 else 'CK tài khoản công ty',
    account='Ngân hàng QA · CHỦ TÀI KHOẢN QA · 0000000000000000' if index == 0 else 'QA-' + '0' * 96,
    store_id=1, store_name='Cơ sở QA kiểm tra bảng', reason='Phiếu thu thêm hợp đồng' if index == 0 else 'Chi phí bảo dưỡng và vật tư QA',
    content='Nội dung QA kiểm tra khoản thu chi có mô tả dài, tài khoản ngân hàng và mã hợp đồng QA-12001; giữ đầy đủ thông tin.')
    for index in range(2)]
errors, unexpected, writes, screens = [], [], [], []

def mock_api(route):
    endpoint = urlparse(route.request.url).path
    if route.request.method != 'GET':
        writes.append(endpoint)
        route.abort()
    elif endpoint == '/api/auth/transactions':
        route.fulfill(json={'status': 'success', 'data': records})
    elif endpoint == '/api/auth/stores':
        route.fulfill(json={'status': 'success', 'data': [dict(id=1, store_name='Cơ sở QA', status='opening')]})
    elif endpoint in ['/api/session', '/api/auth/me']:
        route.fulfill(json={'user': {'id': 144, 'name': 'QA'}})
    else:
        unexpected.append(endpoint)
        route.abort()

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
    context.add_cookies(json.loads(Path(args.session_cookie_file).read_text(encoding='utf-8-sig')))
    context.route('**/api/**', mock_api)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url + '/cashbook', wait_until='networkidle')
    page.add_style_tag(content='.mg-user-menu strong {visibility:hidden !important;}')
    page.locator('.mg-user-avatar').evaluate_all("els => els.forEach(el => el.textContent='QA')")
    for width, height in [(1440, 1000), (1270, 900), (1024, 900), (768, 1024), (375, 812)]:
        page.set_viewport_size({'width': width, 'height': height})
        panels = [page.locator('#cashbook-income'), page.locator('#cashbook-expense')]
        for panel, record in zip(panels, records):
            expect(panel.locator('tbody .mg-code')).to_have_text(str(record['id']))
            assert panel.locator('th button span').all_inner_texts() == columns
            for key in ['payment_method', 'account', 'store_name', 'reason', 'content']:
                expect(panel.locator('.mg-cashbook-' + key)).to_have_text(record[key])
            region = panel.get_by_role('region')
            region.evaluate('el => { el.scrollLeft = 0; }')
        page.screenshot(path=str(output / f'cashbook-{width}.png'), full_page=True)
        for panel in panels:
            region = panel.get_by_role('region')
            metrics = panel.evaluate('''el => {
                const region = el.querySelector('.mg-table-scroll');
                const cells = [...el.querySelectorAll('tbody tr:first-child td')];
                return {width: innerWidth, panel: el.id, pageOverflow: document.documentElement.scrollWidth > innerWidth,
                    canScroll: region.scrollWidth > region.clientWidth,
                    columnWidths: cells.map(cell => cell.getBoundingClientRect().width),
                    rowHeight: el.querySelector('tbody tr').getBoundingClientRect().height};
            }''')
            screens.append(metrics)
            region.focus()
            page.keyboard.press('ArrowRight')
            page.wait_for_timeout(150)
            assert region.evaluate('el => el.scrollLeft') > 0, 'Table must support keyboard horizontal scrolling'
            region.evaluate('el => { el.scrollLeft = el.scrollWidth; }')
            assert panel.locator('tbody tr td').last.evaluate('''el => {
                const region = el.closest('.mg-table-scroll'), cell = el.getBoundingClientRect(), box = region.getBoundingClientRect();
                return cell.left >= box.left - 1 && cell.right <= box.left + region.clientWidth + 1;
            }'''), 'Last column must be reachable inside the table scroll region'
            if width in [1440, 768, 375]:
                panel.screenshot(path=str(output / f'{panel.get_attribute("id")}-right-{width}.png'))
            region.evaluate('el => { el.scrollLeft = 0; }')
    browser.close()

result = {'screens': screens, 'javascriptErrors': errors, 'unexpectedRequests': unexpected, 'businessWrites': writes}
(output / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
assert not errors and not unexpected and not writes, 'QA must have no browser errors or unexpected/business writes'
for screen in screens:
    assert not screen['pageOverflow'], f"Page overflow at {screen['width']}px"
    assert screen['canScroll'], f"Wide table needs its own scroll region at {screen['width']}px"
    assert min(screen['columnWidths'][7:]) >= 140, f"Last five columns are squeezed: {screen}"
    assert screen['rowHeight'] < 180, f"Long text causes excessive row height: {screen}"
print(json.dumps({'passed': 10, 'viewportWidths': [1440,1270,1024,768,375],
    'checks': ['both 12-column tables retain long content without narrow text columns or oversized rows',
               'horizontal scrolling and keyboard access reach the last column without page overflow'],
    'businessWrites': 0, 'javascriptErrors': errors}, indent=2))
