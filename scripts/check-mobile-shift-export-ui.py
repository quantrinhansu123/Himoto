"""Saved KTNB formatter/copy/download on phone-width web; no report mutations."""
import argparse
import json
import threading
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright


def run(build, fixture, output):
    assert build.is_dir() and not output.exists()
    data = json.loads(fixture.read_text(encoding='utf-8'))
    assert data['fixtureOnly']
    output.mkdir(parents=True)
    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(build)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    user = {'id': 7, 'name': 'QA KTNB', 'email': 'qa@example.invalid', 'role': 'staff', 'storeId': 23, 'allStores': False, 'permissions': ['contracts.read']}
    expiry = (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()
    errors, unexpected, checks = [], [], []
    report = deepcopy(data['auditReport'])
    report['media'] = []
    try:
        with sync_playwright() as play:
            browser = play.chromium.launch()
            for width, scheme in [(375, 'light'), (430, 'dark')]:
                context = browser.new_context(viewport={'width': width, 'height': 900}, color_scheme=scheme, reduced_motion='reduce')
                context.grant_permissions(['clipboard-read', 'clipboard-write'], origin=base)
                if width == 430:
                    context.add_init_script("Object.defineProperty(navigator.clipboard, 'writeText', {value: () => Promise.reject(Error('QA clipboard chưa được phép'))});")
                def intercept(route):
                    request, url = route.request, urlparse(route.request.url)
                    if url.netloc == urlparse(base).netloc:
                        return route.continue_()
                    headers = {'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'}
                    if request.method == 'OPTIONS':
                        return route.fulfill(status=204, headers=headers)
                    def respond(value, status=200):
                        route.fulfill(status=status, headers=headers, json=value)
                    if url.hostname != 'mobile-api.example.invalid':
                        unexpected.append(url.hostname)
                        return route.abort()
                    if url.path.endswith('/session'):
                        return respond({'user': user, 'expiresAt': expiry, **({'token': 'hm1_' + 'a' * 43} if request.method == 'POST' else {})}, 201 if request.method == 'POST' else 200)
                    assert request.method == 'GET', 'The report export UI cannot write to server'
                    if url.path.endswith('/workspace'):
                        return respond({'user': user, 'stores': [{'id': 23, 'name': 'Cơ sở QA'}]})
                    if '/catalogue/' in url.path:
                        return respond({'rows': [], 'total': 0, 'page': 1, 'pages': 1, 'statusCounts': [], 'updatedAt': datetime.now(timezone.utc).isoformat()})
                    if url.path.endswith('/shift-reports/options'):
                        return respond(data['options'])
                    if url.path.endswith('/shift-reports'):
                        return respond({'rows': [report]})
                    if url.path.endswith('/shift-reports/' + str(report['id'])):
                        return respond(report)
                    unexpected.append(url.path)
                    route.abort()
                context.route('**/*', intercept)
                page = context.new_page()
                page.set_default_timeout(25000)
                page.on('pageerror', lambda error: errors.append(str(error)))
                button = lambda name: page.get_by_role('button', name=name, exact=True).last
                try:
                    page.goto(base, wait_until='networkidle')
                    page.get_by_role('textbox', name='Tài khoản', exact=True).fill('qa')
                    page.get_by_label('Mật khẩu', exact=True).fill('fixture-password')
                    button('Đăng nhập').click()
                    button('Mở Báo cáo cuối ca').click()
                    button('Mở báo cáo ca #' + str(report['id'])).click()
                    button('Xem nội dung báo cáo KTNB').click()
                    expect(page.get_by_text(data['exported']['content'], exact=True)).to_be_visible()
                    button('Chép báo cáo KTNB').click()
                    if width == 375:
                        expect(page.get_by_text('Đã chép đúng bản đối soát KTNB đã lưu.', exact=True)).to_be_visible()
                        clipboard = page.evaluate('navigator.clipboard.readText()')
                        # Windows clipboard uses CRLF; the browser normalizes line endings at the OS boundary.
                        assert clipboard.replace('\r\n', '\n') == data['exported']['content'].replace('\r\n', '\n'), {'clipboard': repr(clipboard), 'saved': repr(data['exported']['content'])}
                    else:
                        expect(page.get_by_text('QA clipboard chưa được phép', exact=True)).to_be_visible()
                    with page.expect_download() as event:
                        button('Xuất báo cáo KTNB dạng văn bản').click()
                    download = event.value
                    assert download.suggested_filename == data['exported']['filename']
                    assert Path(download.path()).read_text(encoding='utf-8') == data['exported']['content']
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                    page.screenshot(path=str(output / f'ktnb-{width}.png'), full_page=True)
                    checks.append({'width': width, 'scheme': scheme, 'savedFormatterExact': True, 'clipboardExact': width == 375, 'clipboardFailureKeepsDownload': width == 430, 'downloadExact': True, 'serverWrites': 0})
                except Exception:
                    page.screenshot(path=str(output / f'failure-{width}.png'), full_page=True)
                    (output / f'failure-{width}.txt').write_text(page.locator('body').inner_text(), encoding='utf-8')
                    raise
                finally:
                    context.close()
            browser.close()
        assert not errors and not unexpected, {'errors': errors, 'unexpected': unexpected}
        (output / 'results.json').write_text(json.dumps({'ok': True, 'flows': checks, 'screenshots': 2, 'errors': errors, 'unexpected': unexpected, 'fixtureOnly': True}, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'ok': True, 'flows': len(checks), 'screenshots': 2}))
    finally:
        server.shutdown()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--build', type=Path, required=True)
    parser.add_argument('--fixture', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(args.build, args.fixture, args.output)
