"""Check readable cashbook columns with long synthetic data; intercept every API."""
import argparse
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3101')
parser.add_argument('--session-cookie-file', required=True, help='Ignored local QA cookie JSON')
parser.add_argument('--output', default='.backups/cashbook-layout/ui')
parser.add_argument('--browser', choices=['chromium', 'webkit'], default='chromium')
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
viewport_sizes = [(1440, 1000), (1270, 900), (1024, 900), (768, 1024), (320, 740), (375, 812), (430, 932), (812, 375)]

def check_mobile_filters(page):
    filters = page.locator('.mg-cashbook-filters .mg-date-filters')
    bounds = filters.bounding_box()
    for field in filters.locator('input[type="date"]').all():
        label = field.locator('..').bounding_box()
        box = field.bounding_box()
        assert box['y'] >= label['y'] + 16, 'Each date label must sit above its input on phones'
        assert box['x'] >= bounds['x'] and box['x'] + box['width'] <= bounds['x'] + bounds['width'], 'Date input must stay inside its filter panel'
        assert box['width'] >= 110, 'Date input is too narrow to read a full date'

def check_pagination(panel):
    current = panel.locator('.mg-current-page').bounding_box()
    total = panel.locator('.mg-page-total').bounding_box()
    gap = total['x'] - current['x'] - current['width']
    assert 0 <= gap <= 12, f'Current/total page numbers must stay together: {gap}px'

def mock_api(route):
    endpoint = urlparse(route.request.url).path
    if route.request.method != 'GET':
        writes.append(endpoint)
        route.abort()
    elif endpoint == '/api/auth/cashbook/vouchers':
        query = {key: values[0] for key, values in parse_qs(urlparse(route.request.url).query).items()}
        selected = [row for row in records if (not query.get('from') or row['created_at'][:10] >= query['from']) and
            (not query.get('to') or row['created_at'][:10] <= query['to'])]
        data = {'total': len(records), 'actors': [['id:8', 'Nhân sự QA · #8']]}
        for kind in ['income', 'expense']:
            rows = [row for row in selected if (row['type'] == 'out') == (kind == 'expense')]
            data[kind] = dict(rows=rows, total=len(rows), amount=sum(row['amount'] for row in rows), page=1, pageSize=int(query.get(kind+'_limit', 5)))
        route.fulfill(json={'status': 'success', 'data': data})
    elif endpoint == '/api/auth/stores':
        route.fulfill(json={'status': 'success', 'data': [dict(id=1, store_name='Cơ sở QA', status='opening')]})
    elif endpoint == '/api/auth/cashbook/accounts':
        route.fulfill(json={'status': 'success', 'data': []})
    elif endpoint in ['/api/session', '/api/auth/me']:
        route.fulfill(json={'user': {'id': 144, 'name': 'QA'}})
    else:
        unexpected.append(endpoint)
        route.abort()

with sync_playwright() as p:
    browser = getattr(p, args.browser).launch()
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
    context.add_cookies(json.loads(Path(args.session_cookie_file).read_text(encoding='utf-8-sig')))
    context.route('**/api/**', mock_api)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url + '/cashbook', wait_until='networkidle')
    page.add_style_tag(content='.mg-user-menu strong {visibility:hidden !important;}')
    page.locator('.mg-user-avatar').evaluate_all("els => els.forEach(el => el.textContent='QA')")
    for width, height in viewport_sizes:
        page.set_viewport_size({'width': width, 'height': height})
        panels = [page.locator('#cashbook-income'), page.locator('#cashbook-expense')]
        if width <= 900:
            if width <= 600:
                check_mobile_filters(page)
            for panel, record in zip(panels, records):
                if width <= 600:
                    check_pagination(panel)
                expect(panel.locator('.mg-desktop-records')).not_to_be_visible()
                card = panel.locator('.mg-mobile-card-detail')
                expect(card).to_have_count(1)
                card.locator('summary').click()
                expect(card.locator('dt')).to_have_count(12)
                for key in ['payment_method', 'account', 'store_name', 'reason', 'content']:
                    expect(card.get_by_text(record[key], exact=True)).to_have_count(1)
                screens.append(dict(width=width, panel=panel.get_attribute('id'), mobileCards=True,
                    pageOverflow=page.evaluate('document.documentElement.scrollWidth > innerWidth')))
                card.locator('summary').click()
            page.evaluate('window.scrollTo(0, 0)')
            page.screenshot(path=str(output / f'cashbook-{width}.png'), full_page=True)
            if width <= 600:
                page.locator('#cashbook-start').fill('2026-10-10')
                page.locator('#cashbook-end').fill('2026-10-10')
                expect(panels[0].locator('.mg-mobile-card-detail')).to_have_count(1)
                check_mobile_filters(page)
                page.locator('#cashbook-start').fill('2026-10-11')
                expect(page.locator('#cashbook-date-error')).to_contain_text('Đến ngày phải bằng hoặc sau Từ ngày.')
                page.locator('#cashbook-end').fill('2026-10-11')
                expect(page.locator('#cashbook-date-error')).to_have_count(0)
                for panel in panels:
                    expect(panel.locator('.mg-mobile-card-detail')).to_have_count(0)
                    expect(panel.locator('.mg-page-total')).to_have_text('/ 1')
                    check_pagination(panel)
                if width == 375:
                    panels[1].screenshot(path=str(output / 'cashbook-empty-pagination-375.png'))
                page.locator('.mg-cashbook-filters').get_by_role('button', name='Xóa bộ lọc', exact=True).click()
                expect(panels[0].locator('.mg-mobile-card-detail')).to_have_count(1)
            continue
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

result = {'browser': args.browser, 'screens': screens, 'javascriptErrors': errors, 'unexpectedRequests': unexpected, 'businessWrites': writes}
(output / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
assert not errors and not unexpected and not writes, 'QA must have no browser errors or unexpected/business writes'
for screen in screens:
    assert not screen['pageOverflow'], f"Page overflow at {screen['width']}px"
    if screen.get('mobileCards'):
        continue
    assert screen['canScroll'], f"Wide table needs its own scroll region at {screen['width']}px"
    assert len(screen['columnWidths']) == len(columns) + 1, 'Selection must keep all twelve data columns'
    assert min(screen['columnWidths'][-5:]) >= 140, f"Last five columns are squeezed: {screen}"
    assert screen['rowHeight'] < 180, f"Long text causes excessive row height: {screen}"
print(json.dumps({'passed': len(screens), 'browser': args.browser, 'viewportWidths': [width for width, height in viewport_sizes],
    'checks': ['desktop 12-column tables retain long content and keyboard access without page overflow',
               'mobile cards expand to expose all twelve fields, including long account/content values',
               'phone date labels sit above readable inputs; filled dates filter/reset correctly and reject invalid ranges',
               'current/total page numbers stay together, including empty 1/1 lists'],
    'businessWrites': 0, 'javascriptErrors': errors}, indent=2))
