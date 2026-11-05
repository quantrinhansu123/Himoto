"""Focused browser UI only; isolated API/storage mocks, no device checkpoint."""
import argparse
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


def run(build, output):
    assert build.is_dir() and not output.exists()
    output.mkdir(parents=True)
    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(build)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    fixture = json.loads(Path('.backups/mobile-shifts-qa-20261103-run1/catalogue.json').read_text(encoding='utf-8'))
    assert fixture['fixtureOnly']
    short = Path('.backups/browser-video-20261025/fixtures/silent.mp4').read_bytes()
    user = {'id': 7, 'name': 'QA video ca', 'email': 'qa@example.invalid', 'role': 'branch_manager', 'storeId': 23, 'allStores': False, 'permissions': ['contracts.read', 'contracts.draft', 'vehicles.read', 'shift.review']}
    expiry = (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()
    errors, unexpected, checks = [], [], []
    try:
        with sync_playwright() as play:
            browser = play.chromium.launch()
            for width, scheme in [(375, 'light'), (430, 'dark')]:
                context = browser.new_context(viewport={'width': width, 'height': 900}, color_scheme=scheme, reduced_motion='reduce')
                report = deepcopy(fixture['record'])
                report['media'] = [{'id': '11111111-1111-4111-8111-111111111111', 'stage': 'pgd', 'category': 'vehicles', 'filename': 'Video ca QA.mp4', 'mime_type': 'video/mp4', 'url': '/qa-video'}]
                report['audit'] = None
                report['status'] = 'draft'
                rid = report['id']
                state = {'proof': None, 'writes': 0, 'uploads': 0, 'failConfig': width == 430, 'cancelled': []}
                def intercept(route):
                    request, url = route.request, urlparse(route.request.url)
                    if url.netloc == urlparse(base).netloc:
                        return route.continue_()
                    headers = {'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Headers': 'authorization,content-type,idempotency-key,x-shift-request-id,x-report-revision,x-shift-stage,x-shift-category,x-file-name,if-none-match,x-amz-acl,x-amz-meta-sha256', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS'}
                    if request.method == 'OPTIONS':
                        return route.fulfill(status=204, headers=headers)
                    def respond(data, status=200):
                        route.fulfill(status=status, headers=headers, json=data)
                    if url.hostname in ['s3.cloudfly.vn', 'api.cloudinary.com']:
                        assert 'authorization' not in request.headers
                        state['uploads'] += 1
                        if url.hostname == 's3.cloudfly.vn':
                            assert request.post_data_buffer == short
                            return route.fulfill(status=200, headers=headers, body='')
                        return respond({'public_id': state['publicId'], 'version': 1, 'resource_type': 'video', 'signature': 'c' * 40})
                    if url.hostname != 'mobile-api.example.invalid':
                        unexpected.append(url.hostname)
                        return route.abort()
                    if url.path.endswith('/session'):
                        return respond({'user': user, 'expiresAt': expiry, **({'token': 'hm1_' + 'a' * 43} if request.method == 'POST' else {})}, 201 if request.method == 'POST' else 200)
                    assert request.headers.get('authorization', '').startswith('Bearer hm1_')
                    if url.path.endswith('/workspace'):
                        return respond({'user': user, 'stores': [{'id': 23, 'name': 'QA23'}]})
                    if url.path.endswith('/shift-reports/options'):
                        return respond({**fixture['options'], 'canReview': True})
                    if url.path.endswith('/shift-reports'):
                        return respond({'rows': [report]})
                    if url.path.endswith('/video-upload'):
                        body, key = request.post_data_json, request.headers['idempotency-key']
                        assert body['uploadId'] == key and body['revision'] == report['revision'] and body['stage'] == 'pgd' and body['category'] == 'vehicles'
                        state['key'] = key
                        if body['action'] == 'config':
                            if state['failConfig']:
                                state['failConfig'] = False
                                return respond({'message': 'QA mất kết nối trước tải video.', 'code': 'VIDEO_UNAVAILABLE'}, 503)
                            return respond({'direct': width == 375})
                        if body['action'] == 'sign':
                            state['receipt'] = {'provider': 'cloudfly-browser', 'resource_type': 'video', 'upload_id': key, 'signature': 'b' * 64}
                            return respond({'url': f'https://s3.cloudfly.vn/qa-shift-videos/himoto/videos/browser/7/{key}/v1.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=900&X-Amz-Signature=' + 'a' * 64, 'headers': {'Content-Type': 'video/mp4', 'If-None-Match': '*', 'x-amz-acl': 'private', 'x-amz-meta-sha256': body['sha256']}, 'ticket': 'cXVpY2t0aWNrZXQ.' + 'c' * 64})
                        if body['action'] == 'verify':
                            return respond({'receipt': state['receipt']})
                        assert body['action'] == 'conversion'
                        state['publicId'] = f'himoto/management-video/7/{key}'
                        return respond({'cloud_name': 'qa-cloud', 'api_key': '123456789', 'signature': 'a' * 40, 'video_storage_provider': 'cloudinary', 'params': {'public_id': state['publicId'], 'timestamp': 1793760000, 'type': 'authenticated', 'overwrite': False, 'format': 'mp4', 'allowed_formats': 'mp4', 'transformation': 'c_limit,w_1280,h_1280,vc_h264,ac_aac'}})
                    if '/media/' in url.path:
                        if request.method == 'GET':
                            return route.fulfill(status=200, headers={**headers, 'Content-Type': 'video/mp4', 'Content-Length': str(len(short))}, body=short)
                        key = request.headers['x-shift-request-id']
                        assert key == state['key'] and key not in state['cancelled']
                        state['writes'] += 1
                        report['revision'] += 1
                        report['media'].append({**report['media'][0], 'id': url.path.split('/')[-1]})
                        state['proof'] = {'key': key, 'operation': f'shift.media:{rid}', 'receipt': {'id': rid, 'revision': str(report['revision'])}, 'current': report}
                        return route.abort() if width == 375 else respond({'revision': report['revision']})
                    if '/shift-reports/requests/' in url.path:
                        return respond(state['proof'])
                    if url.path.endswith('/resolve'):
                        key = url.path.split('/')[-2]
                        if state['proof']:
                            return respond({'key': key, 'operation': f'shift.media:{rid}', 'status': 'committed', 'receipt': {'id': rid, 'revision': str(report['revision']), 'replayed': True}})
                        state['cancelled'].append(key)
                        return respond({'key': key, 'operation': f'shift.media:{rid}', 'status': 'cancelled', 'receipt': None})
                    if url.path.endswith(f'/shift-reports/{rid}'):
                        return respond(report)
                    if '/catalogue/' in url.path:
                        return respond({'rows': [], 'total': 0, 'page': 1, 'pages': 1, 'statusCounts': [], 'updatedAt': datetime.now(timezone.utc).isoformat()})
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
                    button('Mở Báo cáo cuối ca').click()
                    button(f'Mở báo cáo ca #{rid}').click()
                    expect(button('Phát video để kiểm tra')).to_be_enabled()
                    button('Thêm video minh chứng ca').click()
                    expect(button('Chọn video ca')).to_be_enabled()
                    with page.expect_file_chooser() as event:
                        button('Chọn video ca').click()
                    event.value.set_files(str(Path('.backups/mobile-shift-video-synthetic-20261104/181.mp4').resolve()))
                    expect(page.get_by_text(re.compile(r'^Video ca (tối đa 3 phút|cần có thời lượng trên 0 đến 180 giây)\.'))).to_be_visible()
                    with page.expect_file_chooser() as event:
                        button('Chọn video ca').click()
                    event.value.set_files(str(Path('.backups/browser-video-20261025/fixtures/silent.mp4').resolve()))
                    expect(button('Rà soát và lưu video ca')).to_be_enabled()
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                    page.screenshot(path=str(output / f'review-{width}.png'), full_page=True)
                    button('Rà soát và lưu video ca').click()
                    button('Xác nhận lưu video ca').click()
                    expect(button('Đối chiếu lưu video ca')).to_be_enabled()
                    button('Đối chiếu lưu video ca').click()
                    button('Đối chiếu với máy chủ').click()
                    if width == 430:
                        expect(button('Rà soát và lưu video ca')).to_be_enabled()
                        assert page.locator('video').last.evaluate('(video) => video.src.startsWith("blob:")')
                        assert state['uploads'] == 0 and state['writes'] == 0
                        page.screenshot(path=str(output / 'retained-after-cancelled.png'), full_page=True)
                        button('Rà soát và lưu video ca').click()
                        button('Xác nhận lưu video ca').click()
                    expect(button('Đã kiểm tra xác nhận báo cáo ca')).to_be_enabled()
                    page.screenshot(path=str(output / f'proof-{width}.png'), full_page=True)
                    assert state['writes'] == 1 and state['uploads'] == 1
                    button('Đã kiểm tra xác nhận báo cáo ca').click()
                    expect(button('Thêm video minh chứng ca')).to_be_enabled()
                    checks.append({'width': width, 'scheme': scheme, 'long181Rejected': True, 'writes': 1, 'uploads': 1, 'lostCommitResolved': width == 375, 'localFileRetainedAfterCancelled': width == 430})
                except Exception:
                    page.screenshot(path=str(output / f'failure-{width}.png'), full_page=True)
                    (output / f'failure-{width}.txt').write_text(page.locator('body').inner_text(), encoding='utf-8')
                    raise
                finally:
                    context.close()
            browser.close()
        assert not errors and not unexpected, {'errors': errors, 'unexpected': unexpected}
        (output / 'results.json').write_text(json.dumps({'ok': True, 'flows': checks, 'screenshots': 5, 'errors': errors, 'unexpected': unexpected, 'fixtureOnly': True}, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'ok': True, 'flows': len(checks), 'screenshots': 5}))
    finally:
        server.shutdown()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--build', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(args.build, args.output)
