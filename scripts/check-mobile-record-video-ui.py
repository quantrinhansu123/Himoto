"""Phone-width browser playback/picker/recovery, all API/storage writes mocked."""
import argparse
import base64
import json
import re
import threading
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright
from lib.mobile_print_import_fixture import video_response


def run(build, output):
    assert build.is_dir() and not output.exists()
    output.mkdir(parents=True)
    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(build)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    portfolio = {'id': 9301, 'code': 'EDIT9301', 'name': 'Khách sửa ngày QA', 'status': 'renting', 'reminderEligible': True, 'storeId': 23, 'storeName': 'Cơ sở QA', 'license': '', 'vehicleName': '', 'phone': '', 'startsAt': '', 'endsAt': '', 'totalAmount': 310000, 'paidAmount': 50000, 'brand': '', 'color': '', 'odometer': None, 'monitoring': {'rentalType': 'daily', 'contractTypeName': '', 'nextDueAt': '', 'overdueAt': '', 'dueAmount': None, 'rentalDebt': None, 'lateFeeEstimate': None, 'overdueMinutes': None, 'companyPaidAmount': None, 'collectionOverdue': False, 'basis': 'return'}}
    user = {'id': 7, 'name': 'QA video', 'email': 'qa@example.invalid', 'role': 'branch_manager', 'storeId': 23, 'allStores': False, 'permissions': ['contracts.read', 'vehicles.read']}
    expiry = (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()
    source = Path('.backups/browser-video-20261025/fixtures/silent.mp4')
    short = source.read_bytes()
    checks, errors, unexpected, calls = [], [], [], []
    try:
        with sync_playwright() as play:
            browser = play.chromium.launch()
            for width, scheme in [(375, 'light'), (430, 'dark')]:
                context = browser.new_context(viewport={'width': width, 'height': 900}, color_scheme=scheme, reduced_motion='reduce')
                state = {'proof': None, 'writes': [], 'uploads': 0, 'directUploads': 0}
                def intercept(route):
                    request, url = route.request, urlparse(route.request.url)
                    if url.netloc == urlparse(base).netloc:
                        return route.continue_()
                    headers = {'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Headers': 'authorization,content-type,idempotency-key,x-record-revision,x-reference-revision,x-photo-revision,x-media-snapshot,if-none-match,x-amz-acl,x-amz-meta-sha256', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS'}
                    if request.method == 'OPTIONS':
                        return route.fulfill(status=204, headers=headers)
                    def respond(data, status=200):
                        route.fulfill(status=status, headers=headers, json=data)
                    if url.hostname == 'api.cloudinary.com':
                        assert url.path == '/v1_1/qa-cloud/video/upload' and request.method == 'POST'
                        assert 'authorization' not in request.headers
                        assert b'qa-only-secret' not in request.post_data_buffer
                        state['uploads'] += 1
                        return respond({'public_id': state['publicId'], 'version': 1, 'resource_type': 'video', 'signature': 'c' * 40})
                    if url.hostname == 's3.cloudfly.vn':
                        assert request.method == 'PUT' and 'authorization' not in request.headers
                        assert request.headers['if-none-match'] == '*' and request.headers['x-amz-acl'] == 'private'
                        assert request.post_data_buffer == short
                        state['directUploads'] += 1
                        return route.fulfill(status=200, headers=headers, body='')
                    if url.hostname != 'mobile-api.example.invalid':
                        unexpected.append(url.hostname)
                        return route.abort()
                    assert request.headers.get('authorization', '').startswith('Bearer hm1_') or url.path.endswith('/session')
                    calls.append({'path': url.path, 'method': request.method, 'width': width})
                    if url.path.endswith('/session'):
                        return respond({'user': user, 'expiresAt': expiry, **({'token': 'hm1_' + 'a' * 43} if request.method == 'POST' else {})}, 201 if request.method == 'POST' else 200)
                    if url.path.endswith('/workspace'):
                        return respond({'user': user, 'stores': [{'id': 23, 'name': 'QA23'}]})
                    if url.path.endswith('/contracts/9301/approval'):
                        return respond({'message': 'Portfolio này chỉ kiểm video; quyền duyệt được kiểm riêng.', 'code': 'NOT_FOUND'}, 404)
                    if url.path.endswith('/record-media/contracts/9301/history'):
                        _, info, _ = video_response('/api/mobile/v1/record-media/contracts/9301/rental/9301/rental-video-1', 'GET')
                        rows = [{**info['target'], 'kind': kind, 'referenceId': ref, 'label': label} for kind, ref, label in [('renewal', 2, 'Gia hạn · kỳ #2'), ('renewal_receipt', 501, 'Phiếu gia hạn · #501'), ('battery_swap', 601, 'Đổi pin · #601')]]
                        return respond({'entity': 'contracts', 'id': 9301, 'page': 1, 'hasMore': False, 'rows': rows, 'observedAt': datetime.now(timezone.utc).isoformat()})
                    if '/catalogue/contracts/' in url.path:
                        return respond(portfolio)
                    if '/catalogue/' in url.path:
                        return respond({'rows': [portfolio] if '/contracts' in url.path else [], 'total': 1 if '/contracts' in url.path else 0, 'page': 1, 'pages': 1, 'statusCounts': [], 'updatedAt': datetime.now(timezone.utc).isoformat()})
                    if url.path.endswith('/video/sign'):
                        key = request.headers['idempotency-key']
                        assert request.post_data_json == {'uploadId': key}
                        state['publicId'] = f'himoto/management-video/7/{key}'
                        return respond({'cloud_name': 'qa-cloud', 'api_key': '123456789', 'signature': 'a' * 40, 'video_storage_provider': 'cloudinary', 'params': {'public_id': state['publicId'], 'timestamp': 1793760000, 'type': 'authenticated', 'overwrite': False, 'format': 'mp4', 'allowed_formats': 'mp4', 'transformation': 'c_limit,w_1280,h_1280,vc_h264,ac_aac'}})
                    if url.path.endswith('/video/direct'):
                        body, key = request.post_data_json, request.headers['idempotency-key']
                        assert body['uploadId'] == key
                        if body['action'] == 'config':
                            return respond({'direct': True})
                        if body['action'] == 'sign':
                            assert body['bytes'] == len(short) and len(body['sha256']) == 64
                            state['directReceipt'] = {'provider': 'cloudfly-browser', 'resource_type': 'video', 'upload_id': key, 'signature': 'b' * 64}
                            return respond({'url': f'https://s3.cloudfly.vn/qa-mobile-videos/himoto/videos/browser/7/{key}/v1.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=900&X-Amz-Signature=' + 'a' * 64, 'headers': {'Content-Type': 'video/mp4', 'If-None-Match': '*', 'x-amz-acl': 'private', 'x-amz-meta-sha256': body['sha256']}, 'ticket': 'cXVpY2t0aWNrZXQ.' + 'c' * 64})
                        assert body['action'] == 'verify'
                        if width == 430:
                            return respond({'message': 'QA video cần chuẩn hóa codec.', 'code': 'VIDEO_CONVERSION_REQUIRED'}, 400)
                        return respond({'receipt': state['directReceipt']})
                    if url.path.endswith('/video') and request.method == 'PUT':
                        body, key = request.post_data_json, request.headers['idempotency-key']
                        assert body == (state['directReceipt'] if width == 375 else {'public_id': state['publicId'], 'version': 1, 'signature': 'c' * 40, 'resource_type': 'video'})
                        status, info, _ = video_response('/api/mobile/v1/record-media/contracts/9301/rental/9301/rental-video-1', 'GET')
                        assert status == 200 and request.headers['x-photo-revision'] == '101'
                        assert request.headers['x-record-revision'] == info['target']['revision'] and request.headers['x-media-snapshot'] == info['target']['snapshot']
                        state['proof'] = {'kind': 'video', 'id': 9301, 'revision': '100', 'requestId': key, 'replayed': False, 'target': info['target'], 'slot': info['slot'], 'label': info['label'], 'photoRevision': '102', 'assetHash': 'd' * 64, 'bytes': len(short), 'duration': 1, 'actorId': 7, 'actorName': user['name'], 'recordedAt': datetime.now(timezone.utc).isoformat(), 'parentCurrent': True, 'referenceCurrent': True, 'photoCurrent': True, 'current': True}
                        state['writes'].append(key)
                        return route.abort() if width == 375 else respond(state['proof'])
                    if '/record-videos/requests/' in url.path:
                        return respond({'receipt': {**state['proof'], 'replayed': True} if state['proof'] else None})
                    if url.path.endswith('/resolve'):
                        assert request.post_data_json == {'operation': 'video.record:9301'}
                        return respond({'key': state['proof']['requestId'], 'operation': 'video.record:9301', 'status': 'committed', 'receipt': {'id': 9301, 'revision': '100', 'replayed': True}})
                    if url.path.endswith('/video') and request.method == 'GET':
                        return route.fulfill(status=200, headers={**headers, 'Content-Type': 'video/mp4', 'Content-Length': str(len(short))}, body=short)
                    if url.path.startswith('/api/mobile/v1/record-media/contracts/9301'):
                        status, data, _ = video_response(request.url, request.method)
                        if state['proof'] and 'photo' in data and data['photo']:
                            data['photo']['revision'] = '102'
                        return respond(data, status)
                    unexpected.append(request.method + ' ' + url.path)
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
                    page.get_by_role('tab', name='Hợp đồng', exact=True).click()
                    button('Xem EDIT9301, Khách sửa ngày QA').click()
                    button('Ảnh và hồ sơ nghiệp vụ').click()
                    button('Ảnh/video gia hạn, phiếu và đổi pin').click()
                    expect(button('Gia hạn · kỳ #2')).to_be_visible()
                    expect(button('Phiếu gia hạn · #501')).to_be_visible()
                    page.screenshot(path=str(output / f'video-history-targets-{width}-{scheme}.png'), full_page=True)
                    button('Ảnh lập, giao, trả và đổi xe').click()
                    button('Ảnh lập hợp đồng / giao xe · #9301').click()
                    button('Mở mục Video tình trạng xe 1').click()
                    expect(button('Phát video để kiểm tra')).to_be_enabled()
                    button('Phát video để kiểm tra').click()
                    page.screenshot(path=str(output / f'video-current-{width}-{scheme}.png'), full_page=True)
                    with page.expect_file_chooser() as event:
                        button('Chọn video').click()
                    event.value.set_files(str(Path('.backups/browser-video-20261025/fixtures/long61.mp4').resolve()))
                    expect(page.get_by_text(re.compile(r'^Video hợp đồng (tối đa 60 giây|cần có thời lượng từ trên 0 đến 60 giây)\.'))).to_be_visible()
                    with page.expect_file_chooser() as event:
                        button('Chọn video').click()
                    event.value.set_files(str(source.resolve()))
                    expect(button('Rà soát và thay video')).to_be_enabled()
                    button('Phát video để kiểm tra').click()
                    page.wait_for_function('Array.from(document.querySelectorAll("video")).at(-1)?.ended === true')
                    expect(button('Phát lại video').last).to_be_enabled()
                    expect(button('Rà soát và thay video')).to_be_enabled()
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                    page.screenshot(path=str(output / f'video-review-{width}-{scheme}.png'), full_page=True)
                    button('Rà soát và thay video').click()
                    button('Xác nhận lưu video').click()
                    if width == 375:
                        expect(button('Đối chiếu lưu video')).to_be_enabled()
                        button('Đối chiếu lưu video').click()
                        button('Đối chiếu với máy chủ').click()
                    expect(button('Đã kiểm tra phiếu lưu video')).to_be_enabled()
                    expect(button('Phát video để kiểm tra')).to_be_enabled()
                    page.screenshot(path=str(output / f'video-receipt-{width}-{scheme}.png'), full_page=True)
                    assert state['directUploads'] == 1 and state['uploads'] == (0 if width == 375 else 1) and len(state['writes']) == 1
                    button('Đã kiểm tra phiếu lưu video').click()
                    expect(button('Chọn mục ảnh hoặc video')).to_be_visible()
                    checks.append({'width': width, 'scheme': scheme, 'protectedPlayback': True, 'longVideoRejected': True, 'writes': 1, 'directUploads': 1, 'conversionUploads': state['uploads'], 'lostResponseRecovered': width == 375, 'historyTargets': 3})
                except Exception:
                    page.screenshot(path=str(output / f'failure-{width}.png'), full_page=True)
                    (output / f'failure-{width}.txt').write_text(page.locator('body').inner_text(), encoding='utf-8')
                    raise
                finally:
                    context.close()
            browser.close()
        assert not errors and not unexpected, {'errors': errors, 'unexpected': unexpected}
        (output / 'results.json').write_text(json.dumps({'ok': True, 'flows': checks, 'screenshots': 8, 'errors': errors, 'unexpected': unexpected, 'fixtureOnly': True, 'externalNetworkAllowed': False, 'calls': calls}, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'ok': True, 'flows': len(checks), 'screenshots': 8}))
    finally:
        server.shutdown()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--build', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(args.build, args.output)
