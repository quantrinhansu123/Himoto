"""Actual exported UI + SQL-generated synthetic preview, with all API I/O mocked."""
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


def run(build, fixture_dir, output):
    assert build.is_dir() and not output.exists()
    data = json.loads((fixture_dir / 'catalogue.json').read_text(encoding='utf-8'))
    assert data['fixtureOnly']
    output.mkdir(parents=True)
    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(build)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    user = {'id': 145, 'name': 'Admin QA', 'email': 'qa@example.invalid', 'role': 'admin', 'storeId': 23, 'allStores': True, 'permissions': ['contracts.read', 'contracts.draft', 'settings.write', 'vehicles.read']}
    expiry = (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()
    errors, unexpected, checks = [], [], []
    try:
        with sync_playwright() as play:
            browser = play.chromium.launch()
            for width, scheme in [(375, 'light'), (430, 'dark')]:
                context = browser.new_context(viewport={'width': width, 'height': 900}, color_scheme=scheme, reduced_motion='reduce')
                if width == 430:
                    context.add_init_script("""const originalOpen = IDBFactory.prototype.open; let failed = false;
                      IDBFactory.prototype.open = function(name, ...args) {
                        if(name === 'himoto-contract-import-backups-v1' && !failed) { failed = true; throw Error('QA bộ nhớ sao lưu chưa sẵn sàng'); }
                        return originalOpen.call(this, name, ...args);
                      };""")
                state = {'writes': 0, 'receipt': None}
                def intercept(route):
                    request, url = route.request, urlparse(route.request.url)
                    if url.netloc == urlparse(base).netloc:
                        return route.continue_()
                    headers = {'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Headers': 'authorization,content-type,idempotency-key,x-file-name,x-source-store', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'}
                    if request.method == 'OPTIONS':
                        return route.fulfill(status=204, headers=headers)
                    def respond(value, status=200):
                        route.fulfill(status=status, headers=headers, json=value)
                    if url.hostname != 'mobile-api.example.invalid':
                        unexpected.append(url.hostname)
                        return route.abort()
                    if url.path.endswith('/session'):
                        return respond({'user': user, 'expiresAt': expiry, **({'token': 'hm1_' + 'a' * 43} if request.method == 'POST' else {})}, 201 if request.method == 'POST' else 200)
                    assert request.headers.get('authorization', '').startswith('Bearer hm1_')
                    if url.path.endswith('/workspace'):
                        return respond({'user': user, 'stores': [{'id': 23, 'name': 'Cơ sở QA'}]})
                    if '/catalogue/' in url.path:
                        return respond({'rows': [], 'total': 0, 'page': 1, 'pages': 1, 'statusCounts': [], 'updatedAt': datetime.now(timezone.utc).isoformat()})
                    if url.path.endswith('/contract-import/options'):
                        return respond(data['options'])
                    if url.path.endswith('/contract-import/template'):
                        return respond(data['template'])
                    if url.path.endswith('/contract-import/workbook'):
                        assert request.headers['x-source-store'] == '23'
                        assert request.post_data_buffer == (fixture_dir / 'KH QA.xlsx').read_bytes()
                        return respond(data['file'])
                    if url.path.endswith('/contract-import/preview'):
                        assert request.post_data_json == {'files': [data['file']]}
                        return respond(data['preview'])
                    if url.path.endswith('/contract-import/' + data['preview']['batchId']):
                        value, p = request.post_data_json, data['preview']
                        assert value['verifiedBackupSha'] == value['backupSha'] == p['backupSha']
                        assert value['expectedAdded'] == 2 and value['files'] == [data['file']]
                        state['writes'] += 1
                        key = request.headers['idempotency-key']
                        state['receipt'] = {**data['receipt'], 'key': key, 'batchId': p['batchId'], 'operation': 'import.contracts:' + p['batchId']}
                        return route.abort() if width == 375 else respond(state['receipt'])
                    if '/imports/requests/' in url.path:
                        return respond({'receipt': state['receipt']})
                    if url.path.endswith('/resolve'):
                        r = state['receipt']
                        return respond({'key': r['key'], 'operation': r['operation'], 'status': 'committed', 'receipt': {'id': 145, 'revision': '3', 'replayed': True}})
                    unexpected.append(url.path)
                    route.abort()
                context.route('**/*', intercept)
                page = context.new_page()
                page.set_default_timeout(25000)
                page.on('pageerror', lambda error: errors.append(str(error)))
                button = lambda name: page.get_by_role('button', name=name, exact=True)
                try:
                    page.goto(base, wait_until='networkidle')
                    page.get_by_role('textbox', name='Tài khoản', exact=True).fill('qa')
                    page.get_by_label('Mật khẩu', exact=True).fill('fixture-password')
                    button('Đăng nhập').click()
                    button('Mở Nhập nháp hợp đồng Excel').click()
                    with page.expect_download() as event:
                        button('Tải mẫu Excel hợp đồng 12 cột').click()
                    assert event.value.suggested_filename == data['template']['filename']
                    button('Cơ sở nguồn của file sẽ thêm').click()
                    button('Cơ sở QA').click()
                    with page.expect_file_chooser() as event:
                        button('Thêm file hợp đồng Excel').click()
                    event.value.set_files(str((fixture_dir / 'KH QA.xlsx').resolve()))
                    button('Xem trước nháp sẽ nhập').click()
                    expect(button('Rà soát nhập 2 nháp hợp đồng')).to_be_disabled()
                    assert state['writes'] == 0
                    page.screenshot(path=str(output / f'preview-{width}.png'), full_page=True)
                    button('Lưu và xác minh bản sao lưu').click()
                    if width == 430:
                        expect(page.get_by_text('QA bộ nhớ sao lưu chưa sẵn sàng', exact=True)).to_be_visible()
                        expect(button('Rà soát nhập 2 nháp hợp đồng')).to_be_disabled()
                        assert state['writes'] == 0
                        button('Lưu và xác minh bản sao lưu').click()
                    expect(button('Rà soát nhập 2 nháp hợp đồng')).to_be_enabled()
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                    page.screenshot(path=str(output / f'backup-verified-{width}.png'), full_page=True)
                    button('Rà soát nhập 2 nháp hợp đồng').click()
                    button('Xác nhận nhập nháp hợp đồng').click()
                    if width == 375:
                        expect(button('Đối chiếu nhập nháp hợp đồng')).to_be_enabled()
                        button('Đối chiếu nhập nháp hợp đồng').click()
                        button('Đối chiếu với máy chủ').click()
                    expect(button('Đã xem kết quả, về hợp đồng')).to_be_enabled()
                    expect(page.get_by_text('Đã nhập 2 nháp hợp đồng', exact=True)).to_be_visible()
                    with page.expect_download() as event:
                        button('Xuất bản sao lưu trước nhập').click()
                    download = event.value
                    assert download.suggested_filename == data['preview']['backup']['filename']
                    assert Path(download.path()).read_text(encoding='utf-8') == data['preview']['backup']['content']
                    page.screenshot(path=str(output / f'proof-{width}.png'), full_page=True)
                    assert state['writes'] == 1
                    button('Đã xem kết quả, về hợp đồng').click()
                    checks.append({'width': width, 'scheme': scheme, 'writes': 1, 'backupGatesWrite': True, 'backupReadbackAndDownloadExact': True, 'lostCommitResolved': width == 375, 'backupStorageFailureRetry': width == 430})
                except Exception:
                    page.screenshot(path=str(output / f'failure-{width}.png'), full_page=True)
                    (output / f'failure-{width}.txt').write_text(page.locator('body').inner_text(), encoding='utf-8')
                    raise
                finally:
                    context.close()
            browser.close()
        assert not errors and not unexpected, {'errors': errors, 'unexpected': unexpected}
        (output / 'results.json').write_text(json.dumps({'ok': True, 'flows': checks, 'screenshots': 6, 'errors': errors, 'unexpected': unexpected, 'fixtureOnly': True}, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'ok': True, 'flows': len(checks), 'screenshots': 6}))
    finally:
        server.shutdown()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--build', type=Path, required=True)
    parser.add_argument('--fixture-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(args.build, args.fixture_dir, args.output)
