"""Phone-width fleet inventory against narrow fixtures emitted by the actual reader."""
import argparse
import json
import threading
from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import expect, sync_playwright


def run(build, fixture, output):
    assert (build / 'index.html').is_file() and (build / 'metadata.json').is_file() and not output.exists()
    data = json.loads(fixture.read_text(encoding='utf-8'))
    assert data['fixtureOnly']
    output.mkdir(parents=True)
    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(build)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    expiry = (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()
    user = {'id': 7, 'name': 'QA Kho', 'email': 'qa@example.invalid', 'role': 'staff', 'storeId': 23, 'allStores': False, 'permissions': ['vehicles.read', 'vehicles.transfer']}
    errors, unexpected, flows = [], [], []
    try:
        with sync_playwright() as play:
            browser = play.chromium.launch()
            for width, scheme in [(375, 'light'), (430, 'dark')]:
                context = browser.new_context(viewport={'width': width, 'height': 900}, color_scheme=scheme, reduced_motion='reduce')
                state = {'fail': False, 'reads': 0}
                def intercept(route):
                    request, url = route.request, urlparse(route.request.url)
                    if url.netloc == urlparse(base).netloc:
                        return route.continue_()
                    headers = {'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'}
                    if request.method == 'OPTIONS':
                        return route.fulfill(status=204, headers=headers)
                    def respond(value, status=200):
                        return route.fulfill(status=status, headers=headers, json=value)
                    if url.hostname != 'mobile-api.example.invalid':
                        unexpected.append(url.hostname)
                        return route.abort()
                    if url.path.endswith('/session'):
                        return respond({'user': user, 'expiresAt': expiry, **({'token': 'hm1_' + 'a' * 43} if request.method == 'POST' else {})}, 201 if request.method == 'POST' else 200)
                    if url.path.endswith('/workspace'):
                        return respond({'user': user, 'stores': [{'id': 23, 'name': 'Cơ sở Đỏ'}]})
                    if '/catalogue/' in url.path:
                        return respond({'rows': [], 'total': 0, 'page': 1, 'pages': 1, 'statusCounts': [], 'updatedAt': datetime.now(timezone.utc).isoformat()})
                    if url.path.endswith('/vehicles/inventory') and request.method == 'GET':
                        state['reads'] += 1
                        if state['fail']:
                            state['fail'] = False
                            return respond({'message': 'QA mất kết nối kho.', 'code': 'SERVICE_UNAVAILABLE'}, 503)
                        p = parse_qs(url.query)
                        search = p.get('search', [''])[0]
                        key = 'missing' if search == 'khong-co-qa' else 'plate' if search else 'branch' if p.get('store') == ['24'] else 'blocked' if p.get('availability') == ['blocked'] else 'last' if p.get('page') == ['2'] else 'first'
                        return respond(data[key])
                    unexpected.append(f'{request.method} {url.path}')
                    route.abort()
                context.route('**/*', intercept)
                page = context.new_page()
                page.set_default_timeout(20000)
                page.on('pageerror', lambda error: errors.append(str(error)))
                button = lambda label: page.get_by_role('button', name=label, exact=True).last
                field = lambda label: page.get_by_role('textbox', name=label, exact=True).last
                try:
                    page.goto(base, wait_until='networkidle')
                    field('Tài khoản').fill('qa')
                    page.get_by_label('Mật khẩu', exact=True).fill('fixture-password')
                    button('Đăng nhập').click()
                    button('Mở Kho xe toàn hệ thống').click()
                    expect(page.get_by_text('28 / 28 xe toàn hệ thống · Trang 1/2', exact=True)).to_be_visible()
                    expect(page.get_by_text('29-X1.00001', exact=True)).to_be_visible()
                    page.screenshot(path=str(output / f'inventory-{width}.png'), full_page=True)
                    button('Trang kho xe tiếp').click()
                    expect(page.get_by_text('28 / 28 xe toàn hệ thống · Trang 2/2', exact=True)).to_be_visible()
                    expect(page.get_by_text('QA-28', exact=True)).to_be_visible()
                    field('Tìm trong kho xe chung').fill('29X100001')
                    button('Tìm xe trong kho chung').click()
                    expect(page.get_by_text('1 / 28 xe toàn hệ thống · Trang 1/1', exact=True)).to_be_visible()
                    field('Tìm trong kho xe chung').fill('khong-co-qa')
                    button('Tìm xe trong kho chung').click()
                    expect(page.get_by_text('Không có xe phù hợp', exact=True)).to_be_visible()
                    field('Tìm trong kho xe chung').fill('')
                    button('Tìm xe trong kho chung').click()
                    button('Khả năng điều chuyển').click()
                    button('Chưa thể điều chuyển').click()
                    expect(page.get_by_text('2 / 28 xe toàn hệ thống · Trang 1/1', exact=True)).to_be_visible()
                    expect(page.get_by_text('Chưa thể điều chuyển: còn hợp đồng chưa đóng', exact=True)).to_be_visible()
                    page.screenshot(path=str(output / f'blocked-{width}.png'), full_page=True)
                    state['fail'] = True
                    field('Tìm trong kho xe chung').fill('retry-qa')
                    button('Tìm xe trong kho chung').click()
                    expect(button('Tải lại kho xe chung')).to_be_visible()
                    button('Tải lại kho xe chung').click()
                    expect(page.get_by_text('1 / 28 xe toàn hệ thống · Trang 1/1', exact=True)).to_be_visible()
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                    flows.append({'width': width, 'scheme': scheme, 'pagination': True, 'plateSearch': True, 'availability': True, 'emptyAndRetry': True, 'serverBusinessWrites': 0, 'reads': state['reads']})
                finally:
                    if len(flows) < (1 if width == 375 else 2):
                        page.screenshot(path=str(output / f'failure-{width}.png'), full_page=True)
                    context.close()
            browser.close()
        assert not errors and not unexpected, {'errors': errors, 'unexpected': unexpected}
        (output / 'results.json').write_text(json.dumps({'ok': True, 'fixtureOnly': True, 'flows': flows, 'screenshots': 4, 'errors': errors, 'unexpected': unexpected}, indent=2), encoding='utf-8')
        print(json.dumps({'ok': True, 'flows': len(flows), 'screenshots': 4}))
    finally:
        server.shutdown()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--build', type=Path, required=True)
    parser.add_argument('--fixture', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(args.build, args.fixture, args.output)
