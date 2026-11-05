"""Dashboard at phone widths: exact SQL snapshots, filters, CSV, and empty period."""
import argparse
import json
import threading
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import expect, sync_playwright


def run(build, fixture, output):
    assert (build / 'index.html').is_file() and (build / 'metadata.json').is_file() and not output.exists(), 'Use a completed export artifact'
    data = json.loads(fixture.read_text(encoding='utf-8'))
    assert data['fixtureOnly']
    output.mkdir(parents=True)
    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(build)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    user = {'id': 7, 'name': 'QA Quản lý', 'email': 'qa@example.invalid', 'role': 'staff', 'storeId': 23, 'allStores': False, 'permissions': ['contracts.read']}
    expiry = (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()
    errors, unexpected, checks = [], [], []
    try:
        with sync_playwright() as play:
            browser = play.chromium.launch()
            for width, scheme in [(375, 'light'), (430, 'dark')]:
                context = browser.new_context(viewport={'width': width, 'height': 900}, color_scheme=scheme, reduced_motion='reduce')
                calls = []
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
                    assert request.method == 'GET'
                    if url.path.endswith('/workspace'):
                        return respond({'user': user, 'stores': [{'id': 23, 'name': 'Cơ sở QA'}]})
                    if '/catalogue/' in url.path:
                        return respond({'rows': [], 'total': 0, 'page': 1, 'pages': 1, 'statusCounts': [], 'updatedAt': datetime.now(timezone.utc).isoformat()})
                    if url.path.endswith('/dashboard/export'):
                        return respond(data['exported'])
                    if url.path.endswith('/dashboard'):
                        params = parse_qs(url.query)
                        calls.append(params)
                        assert params['store_id'] == ['23']
                        report = deepcopy(data['empty'] if params['from'] == params['to'] else data['report'])
                        report['from'], report['to'] = params['from'][0], params['to'][0]
                        return respond(report)
                    unexpected.append(url.path)
                    route.abort()
                context.route('**/*', intercept)
                page = context.new_page()
                page.clock.install(time=datetime(2026, 11, 4, 5, tzinfo=timezone.utc))
                page.set_default_timeout(25000)
                page.on('pageerror', lambda error: errors.append(str(error)))
                button = lambda name: page.get_by_role('button', name=name, exact=True).last
                try:
                    page.goto(base, wait_until='networkidle')
                    page.get_by_role('textbox', name='Tài khoản', exact=True).fill('qa')
                    page.get_by_label('Mật khẩu', exact=True).fill('fixture-password')
                    button('Đăng nhập').click()
                    button('Mở Tổng quan giao dịch').click()
                    expect(page.get_by_text('4.820 ₫', exact=True).first).to_be_visible()
                    expect(page.get_by_text('1.700 ₫', exact=True).first).to_be_visible()
                    page.screenshot(path=str(output / f'dashboard-{width}.png'), full_page=True)
                    with page.expect_download() as event:
                        button('Xuất CSV Tổng quan giao dịch').click()
                    download = event.value
                    assert download.suggested_filename == data['exported']['filename']
                    assert Path(download.path()).read_text(encoding='utf-8') == data['exported']['content'].replace('\r\n', '\n')
                    button('Kỳ Tổng quan giao dịch').click()
                    button('Hôm nay').click()
                    expect(page.get_by_text('Không có giao dịch trong kỳ.', exact=True)).to_be_visible()
                    expect(button('Xuất CSV Tổng quan giao dịch')).to_be_disabled()
                    button('Kỳ Tổng quan giao dịch').click()
                    button('Tháng này').click()
                    expect(page.get_by_text('4.820 ₫', exact=True).first).to_be_visible()
                    # Custom dates retain the web's auto-adjust behavior.
                    page.get_by_label('Tổng quan từ ngày', exact=True).fill('2026-11-20')
                    expect(page.get_by_label('Tổng quan đến ngày', exact=True)).to_have_value('2026-11-20')
                    assert calls[-1]['from'] == calls[-1]['to']
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                    page.screenshot(path=str(output / f'dashboard-empty-{width}.png'), full_page=True)
                    checks.append({'width': width, 'scheme': scheme, 'sqlMetrics': True, 'csvExact': True, 'presetEmpty': True, 'webDateAutoAdjust': True, 'serverWrites': 0})
                except Exception:
                    page.screenshot(path=str(output / f'failure-{width}.png'), full_page=True)
                    (output / f'failure-{width}.txt').write_text(page.locator('body').inner_text(), encoding='utf-8')
                    raise
                finally:
                    context.close()
            browser.close()
        assert not errors and not unexpected, {'errors': errors, 'unexpected': unexpected}
        (output / 'results.json').write_text(json.dumps({'ok': True, 'flows': checks, 'screenshots': 4, 'errors': errors, 'unexpected': unexpected, 'fixtureOnly': True}, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'ok': True, 'flows': len(checks), 'screenshots': 4}))
    finally:
        server.shutdown()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--build', type=Path, required=True)
    parser.add_argument('--fixture', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(args.build, args.fixture, args.output)
