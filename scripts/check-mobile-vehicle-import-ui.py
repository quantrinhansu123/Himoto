"""Excel vehicle browser workflows: isolated fixtures, no operational writes."""
import argparse
import json
import threading
from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4
from playwright.sync_api import expect, sync_playwright


def run(build, output, workbook):
    assert build.is_dir() and workbook.is_file() and not output.exists()
    output.mkdir(parents=True)
    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(build)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    user = {'id': 7, 'name': 'QA Excel xe', 'email': 'qa@example.invalid', 'role': 'branch_manager', 'storeId': 23, 'allStores': False, 'permissions': ['vehicles.read', 'contracts.read', 'customers.read', 'settings.write']}
    expiry = (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()
    values = {'id': '6001', 'name': 'Xe QA', 'brand': 'Honda', 'type': 'xega', 'year': '2025', 'license': 'QA-OLD', 'color': '', 'chassis': '001234', 'engine': '005678', 'store': 'Cơ sở cũ #99', 'status': 'ready', 'odometer': '250', 'daily_price': '120000', 'monthly_price': ''}
    inputs = [{'rowNumber': 2, 'values': values, 'errors': [], 'warnings': []}, {'rowNumber': 3, 'values': {**values, 'id': '', 'license': 'QA-NEW', 'color': 'Đỏ'}, 'errors': [], 'warnings': []}]
    checks, errors, unexpected, calls = [], [], [], []
    try:
        with sync_playwright() as play:
            browser = play.chromium.launch()
            for width, scheme in [(375, 'light'), (430, 'dark')]:
                context = browser.new_context(viewport={'width': width, 'height': 900}, color_scheme=scheme, reduced_motion='reduce', accept_downloads=True)
                state = {'receipt': None, 'writes': [], 'reset': False, 'backup': str(uuid4()), 'resetBackup': str(uuid4())}
                def intercept(route):
                    request, url = route.request, urlparse(route.request.url)
                    if url.netloc == urlparse(base).netloc:
                        route.continue_()
                        return
                    if url.hostname != 'mobile-api.example.invalid':
                        unexpected.append(url.hostname)
                        route.abort()
                        return
                    headers = {'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Headers': 'authorization,content-type,idempotency-key,x-file-name', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS'}
                    if request.method == 'OPTIONS':
                        route.fulfill(status=204, headers=headers)
                        return
                    calls.append({'method': request.method, 'path': url.path, 'width': width})
                    def respond(value, status=200):
                        route.fulfill(status=status, json=value, headers=headers)
                    if url.path.endswith('/session'):
                        respond({'user': user, 'expiresAt': expiry, **({'token': 'hm1_' + 'a' * 43} if request.method == 'POST' else {})}, 201 if request.method == 'POST' else 200)
                    elif url.path.endswith('/workspace'):
                        respond({'user': user, 'stores': [{'id': 23, 'name': 'QA Store'}]})
                    elif '/catalogue/' in url.path:
                        respond({'rows': [], 'total': 0 if state['reset'] else 3, 'page': 1, 'pages': 1, 'statusCounts': [], 'updatedAt': datetime.now(timezone.utc).isoformat()})
                    elif url.path.endswith('/imports/vehicles/options'):
                        respond({'stores': [{'id': 23, 'name': 'QA Store', 'code': 'QA23'}], 'types': [{'value': 'xega', 'label': 'Xe ga'}], 'statuses': [{'value': 'ready', 'label': 'Lưu kho'}]})
                    elif url.path.endswith('/imports/vehicles/file'):
                        assert request.post_data_buffer[:2] == b'PK'
                        respond({'filename': 'QA.xlsx', 'sha256': 'a' * 64, 'rows': inputs, 'legacy': True, 'ignoredColumns': ['Giá mua', 'Giá bán']})
                    elif url.path.endswith('/imports/vehicles/preview'):
                        body = request.post_data_json
                        assert body['mode'] in ['sync', 'replace'] and not body['acceptWarnings']
                        matched = all(r['values']['store'] == '23' for r in body['rows'])
                        rows = [{**r, 'state': 'valid' if matched else 'invalid', 'action': 'update' if body['mode'] == 'sync' and i == 0 else 'insert', 'targetId': 6001 if i == 0 else None, 'storeId': 23 if matched else None, 'errors': [] if matched else ['Chưa khớp cơ sở.'], 'warnings': ['Giữ ID; cập nhật giá và số km có dữ liệu.'] if i == 0 and body['mode'] == 'sync' else []} for i, r in enumerate(body['rows'])]
                        respond({'rows': rows, 'total': 2, 'valid': 2 if matched else 0, 'invalid': 0 if matched else 2, 'skipped': 0, 'inserted': 1 if body['mode'] == 'sync' else 2, 'updated': 1 if body['mode'] == 'sync' else 0, 'blankColors': 1, 'retained': 2 if body['mode'] == 'sync' else 0, 'existing': 3, 'revision': ('b' if body['mode'] == 'sync' else 'c') * 64, 'committed': False, 'blocking': ['Còn hợp đồng liên quan, chọn Đồng bộ giữ lịch sử.'] if body['mode'] == 'replace' else [], 'references': [{'table': 'order_vehicle_details', 'column': 'vehicle_id', 'count': 1}] if body['mode'] == 'replace' else []})
                    elif url.path.endswith('/imports/vehicles/reset') and request.method == 'GET':
                        respond({'total': 0 if state['reset'] else 4, 'revision': 'd' * 64, 'references': [], 'blocking': []})
                    elif '/imports/vehicles/backups/' in url.path:
                        backup = url.path.rsplit('/', 1)[-1]
                        payload = {'id': backup, 'created_at': datetime.now(timezone.utc).isoformat(), 'created_by': 7, 'action': 'reset' if state['reset'] else 'sync', 'row_count': 4 if state['reset'] else 3, 'sha256': 'a' * 64, 'payload': [{'id': 6001, 'license': 'QA-OLD', 'color': 'Blue'}]}
                        respond({'filename': f'HIMOTO-xe-backup-{backup}.json', 'mimeType': 'application/json', 'content': json.dumps(payload), 'rowCount': payload['row_count']})
                    elif '/imports/vehicles/requests/' in url.path:
                        r = state['receipt']
                        if url.path.endswith('/resolve'):
                            assert request.post_data_json['operation'] == r['operation']
                            respond({'key': r['key'], 'operation': r['operation'], 'resourceKind': 'vehicle-import', 'status': 'committed', 'receipt': {**r, 'replayed': True}})
                        else:
                            respond({'receipt': {**r, 'replayed': True} if r else None})
                    elif '/imports/vehicles/' in url.path and request.method in ['POST', 'DELETE']:
                        body = request.post_data_json
                        is_reset = request.method == 'DELETE'
                        if is_reset:
                            assert body == {'revision': 'd' * 64, 'confirmation': 'XÓA HẾT XE'}
                            state['reset'] = True
                        else:
                            assert body['mode'] == 'sync' and body['revision'] == 'b' * 64 and body['acceptWarnings']
                            assert all(r['values']['store'] == '23' for r in body['rows']) and len(body['rows']) == 2
                        batch, key = url.path.rsplit('/', 1)[-1], request.headers['idempotency-key']
                        assert key not in [r['key'] for r in state['writes']]
                        receipt = {'key': key, 'operation': f"vimport.{'reset' if is_reset else 'sync'}:{batch}", 'batchId': batch, 'mode': 'reset' if is_reset else 'sync', 'actorId': 7, 'backupId': state['resetBackup'] if is_reset else state['backup'], 'inserted': 0 if is_reset else 1, 'updated': 0 if is_reset else 1, 'skipped': 0, 'retained': 0 if is_reset else 2, 'existing': 4 if is_reset else 3, 'removed': 4 if is_reset else 0, 'total': 0 if is_reset else 2, 'recordedAt': datetime.now(timezone.utc).isoformat(), 'replayed': False}
                        state['receipt'] = receipt
                        state['writes'].append(receipt)
                        if width == 375 and not is_reset:
                            route.abort('failed')
                        else:
                            respond(receipt)
                    else:
                        unexpected.append(url.path)
                        route.abort()
                context.route('**/*', intercept)
                page = context.new_page()
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(base, wait_until='networkidle')
                page.get_by_role('textbox', name='Tài khoản', exact=True).fill('qa')
                page.get_by_label('Mật khẩu', exact=True).fill('fixture-password')
                page.get_by_role('button', name='Đăng nhập', exact=True).click()
                page.get_by_role('button', name='Mở Đội xe', exact=True).click()
                page.get_by_role('button', name='Nhập và đồng bộ Excel xe', exact=True).click()
                with page.expect_file_chooser() as capture:
                    page.get_by_role('button', name='Chọn file Excel xe', exact=True).click()
                capture.value.set_files({'name': 'QA.xlsx', 'mimeType': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'buffer': workbook.read_bytes()})
                expect(page.get_by_text('Hợp lệ 0 · Lỗi 2 · Bỏ qua 0', exact=True)).to_be_visible()
                page.get_by_role('button', name='Cơ sở trong file: Cơ sở cũ #99', exact=True).click()
                page.get_by_role('button', name='QA Store · 23', exact=True).click()
                page.get_by_role('button', name='Kiểm tra lại xe và cơ sở đã khớp', exact=True).click()
                expect(page.get_by_text('Hợp lệ 2 · Lỗi 0 · Bỏ qua 0', exact=True)).to_be_visible()
                page.get_by_role('button', name='Cách nhập xe', exact=True).click()
                page.get_by_role('button', name='Xóa xe cũ và thay toàn bộ từ file', exact=True).click()
                page.get_by_role('button', name='Kiểm tra lại xe và cơ sở đã khớp', exact=True).click()
                expect(page.get_by_text('Còn hợp đồng liên quan, chọn Đồng bộ giữ lịch sử.', exact=True)).to_be_visible()
                expect(page.get_by_role('button', name='Kiểm tra và thay bằng 2 xe', exact=True)).to_be_disabled()
                page.screenshot(path=str(output / f'replace-blocked-{width}-{scheme}.png'), full_page=True)
                page.get_by_role('button', name='Cách nhập xe', exact=True).click()
                page.get_by_role('button', name='Đồng bộ giữ ID và lịch sử', exact=True).click()
                page.get_by_role('button', name='Kiểm tra lại xe và cơ sở đã khớp', exact=True).click()
                expect(page.get_by_role('button', name='Kiểm tra và đồng bộ 2 xe', exact=True)).to_be_disabled()
                page.get_by_role('button', name='Xác nhận đối chiếu cảnh báo xe', exact=True).click()
                page.get_by_role('button', name='Đã đối chiếu; màu chưa rõ để trống, giữ liên kết', exact=True).click()
                page.screenshot(path=str(output / f'sync-preview-{width}-{scheme}.png'), full_page=True)
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                page.get_by_role('button', name='Kiểm tra và đồng bộ 2 xe', exact=True).click()
                page.get_by_role('button', name='Xác nhận đồng bộ xe', exact=True).click()
                if width == 375:
                    page.get_by_role('button', name='Đối chiếu thao tác Excel xe', exact=True).click()
                expect(page.get_by_text('Đã cập nhật 1, thêm 1 xe', exact=True)).to_be_visible()
                with page.expect_download() as capture:
                    page.get_by_role('button', name='Tải bản sao lưu JSON trước thay đổi', exact=True).click()
                target = output / f'backup-sync-{width}.json'
                capture.value.save_as(target)
                assert json.loads(target.read_text(encoding='utf-8'))['id'] == state['backup']
                page.screenshot(path=str(output / f'sync-result-{width}-{scheme}.png'), full_page=True)
                page.get_by_role('button', name='Đã xem kết quả, về đội xe', exact=True).click()
                checks.append(f'{width}/{scheme}: legacy file mapping, replace blocker, warning confirmation, exact sync, immutable result/backup download, ' + ('lost-response UUID recovery and ack' if width == 375 else 'happy path and ack'))
                page.get_by_role('button', name='Nhập và đồng bộ Excel xe', exact=True).click()
                page.get_by_role('button', name='Kiểm tra xóa danh sách xe có sao lưu', exact=True).click()
                expect(page.get_by_role('button', name='Kiểm tra và xóa 4 xe', exact=True)).to_be_disabled()
                page.get_by_role('textbox', name='Nhập XÓA HẾT XE để xác nhận', exact=True).fill('XÓA HẾT XE')
                page.get_by_role('button', name='Kiểm tra và xóa 4 xe', exact=True).click()
                page.get_by_role('button', name='Xác nhận xóa 4 xe', exact=True).click()
                expect(page.get_by_text('Đã xóa 4 xe', exact=True)).to_be_visible()
                page.screenshot(path=str(output / f'reset-result-{width}-{scheme}.png'), full_page=True)
                page.get_by_role('button', name='Đã xem kết quả, về đội xe', exact=True).click()
                expect(page.get_by_role('button', name='Nhập và đồng bộ Excel xe', exact=True)).to_be_visible()
                assert len(state['writes']) == 2 and [r['mode'] for r in state['writes']] == ['sync', 'reset']
                checks.append(f'{width}/{scheme}: isolated-fixture reset requires exact phrase and second confirmation, returns deletion count and backup, ack returns to vehicles without repeating')
                context.close()
            browser.close()
        assert not errors and not unexpected, {'pageErrors': errors, 'unexpected': unexpected}
        result = {'ok': True, 'groups': len(checks), 'checks': checks, 'pageErrors': errors, 'unexpected': unexpected, 'calls': calls, 'browserFixtureOnly': True, 'nativeAcceptance': False, 'completedAt': datetime.now(timezone.utc).isoformat()}
        (output / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'ok': True, 'groups': len(checks)}))
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--build', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--workbook', type=Path, required=True)
    args = parser.parse_args()
    run(args.build.resolve(), args.output.resolve(), args.workbook.resolve())
