"""Phone-width UI from actual SQL snapshots; every request mocked, zero Telegram I/O."""
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
from lib.mobile_print_import_fixture import video_response
from lib.mobile_record_media_fixture import image_blob


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
    user = {'id': 7, 'name': 'Nhân viên QA', 'email': 'qa@example.invalid', 'role': 'staff', 'storeId': 23, 'allStores': False, 'permissions': ['contracts.read', 'contracts.draft', 'contracts.renew', 'contracts.return', 'contracts.finalize', 'vehicles.read', 'vehicles.transfer', 'vehicles.receive']}
    expiry = (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()
    short = Path('.backups/browser-video-20261025/fixtures/silent.mp4').read_bytes()
    jpeg = image_blob()
    errors, unexpected, checks = [], [], []
    try:
        with sync_playwright() as play:
            browser = play.chromium.launch()
            for width, scheme in [(375, 'light'), (430, 'dark')]:
                context = browser.new_context(viewport={'width': width, 'height': 900}, color_scheme=scheme, reduced_motion='reduce')
                state = {'contract': deepcopy(data['initial']), 'transfer': deepcopy(data['transfer']), 'proofs': {}, 'actions': [], 'reads': 0}
                if width == 430:
                    state['contract']['events'] = [deepcopy(data['unknown'])]
                def intercept(route):
                    request, url = route.request, urlparse(route.request.url)
                    if url.netloc == urlparse(base).netloc:
                        return route.continue_()
                    headers = {'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Headers': 'authorization,content-type,idempotency-key', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'}
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
                    if url.path.endswith('/telegram/pending'):
                        return respond(data['pending'])
                    if url.path.endswith('/vehicles/transfers'):
                        params = parse_qs(url.query)
                        return respond({'rows': [{'id': 501, 'vehicle_id': 19303, 'vehicle_name': 'Xe QA', 'license': 'EDIT19303', 'from_store_id': 23, 'to_store_id': 24, 'from_store': 'Cơ sở QA', 'to_store': 'Kho QA khác', 'action': 'transfer', 'label': 'Chuyển xe', 'at': datetime.now(timezone.utc).isoformat(), 'actor': 'QA', 'note': '', 'changes': []}], 'total': 1, 'scopeCount': 1, 'page': 1, 'pages': 1, 'size': 25, 'from': params['from'][0], 'to': params['to'][0]})
                    contract = url.path.endswith('/contracts/9301/telegram')
                    transfer = url.path.endswith('/vehicles/19303/transfers/501/telegram')
                    if contract or transfer:
                        if request.method == 'GET':
                            state['reads'] += 1
                            return respond(state['contract'] if contract else state['transfer'])
                        body, key = request.post_data_json, request.headers['idempotency-key']
                        action = body['action']
                        if contract:
                            event = state['contract']['events'][0]
                            assert body['event_key'] == event['key']
                            if action == 'retry_confirmed_absent':
                                assert body['confirmed_absent'] is True
                            if action == 'retract':
                                assert body['confirmed'] is True and body['notice_id'] == event['deliveries'][0]['id']
                                event['status'] = 'retracting'
                            else:
                                assert body['hash'] == event['hash']
                                event['status'] = 'pending'
                            event['can_send'] = False
                        else:
                            assert body['review'] == state['transfer']['review'] and body['action'] == 'send'
                            state['transfer']['status'] = 'pending'
                            state['transfer']['can_send'] = False
                        state['actions'].append(action if contract else 'transfer')
                        proof = {'key': key, 'operation': 'telegram.contract:9301' if contract else 'telegram.transfer:501', 'receipt': {'id': 9301 if contract else 501, 'revision': str(['send', 'resume', 'retry_confirmed_absent', 'retract'].index(action) + 1), 'replayed': False}, 'action': action, 'id': 9301 if contract else 19303, 'eventId': None if contract else 501, 'contract': deepcopy(state['contract']) if contract else None, 'transfer': None if contract else deepcopy(state['transfer'])}
                        state['proofs'][key] = proof
                        return route.abort() if width == 375 and contract else respond(proof)
                    if '/telegram/requests/' in url.path:
                        return respond({'result': state['proofs'].get(url.path.split('/')[-1])})
                    if url.path.endswith('/resolve'):
                        key = url.path.split('/')[-2]
                        proof = state['proofs'][key]
                        return respond({'key': key, 'operation': proof['operation'], 'status': 'committed', 'receipt': {**proof['receipt'], 'replayed': True}})
                    if '/record-media/contracts/9301/rental/9301/rental-video-1/video' in url.path:
                        return route.fulfill(status=200, headers={**headers, 'Content-Type': 'video/mp4', 'Content-Length': str(len(short))}, body=short)
                    if url.path.endswith('/record-media/contracts/9301/rental/9301/rental-1'):
                        if parse_qs(url.query):
                            return route.fulfill(status=200, headers={**headers, 'Content-Type': 'image/jpeg'}, body=jpeg)
                        _, info, _ = video_response('/api/mobile/v1/record-media/contracts/9301/rental/9301/rental-video-1', 'GET')
                        info = deepcopy(info)
                        info.update({'slot': 'rental-1', 'label': 'Ảnh hợp đồng', 'photo': {**info['photo'], 'slot': 'rental-1', 'label': 'Ảnh hợp đồng', 'mimeType': 'image/jpeg', 'kind': 'image', 'bytes': len(jpeg)}})
                        return respond(info)
                    if '/record-media/contracts/9301' in url.path:
                        status, info, _ = video_response(request.url, request.method)
                        return respond(info, status)
                    unexpected.append(url.path)
                    route.abort()
                context.route('**/*', intercept)
                page = context.new_page()
                page.set_default_timeout(25000)
                page.on('pageerror', lambda error: errors.append(str(error)))
                button = lambda name: page.get_by_role('button', name=name, exact=True).last
                def acknowledge():
                    expect(button('Đã kiểm tra xác nhận Telegram')).to_be_enabled()
                    page.screenshot(path=str(output / f'proof-{width}-{len(state["actions"])}.png'), full_page=True)
                    button('Đã kiểm tra xác nhận Telegram').click()
                    expect(button('Làm mới nội dung và ảnh Telegram')).to_be_enabled()
                try:
                    page.goto(base, wait_until='networkidle')
                    page.get_by_role('textbox', name='Tài khoản', exact=True).fill('qa')
                    page.get_by_label('Mật khẩu', exact=True).fill('fixture-password')
                    button('Đăng nhập').click()
                    button('Mở Giao dịch chưa gửi Telegram').click()
                    button('Kiểm tra Telegram EDIT9301').click()
                    expect(button('Giao dịch cần gửi Telegram')).to_be_enabled()
                    assert not state['actions']
                    if width == 375:
                        button('Xem toàn bộ ảnh và video sẽ gửi').click()
                        expect(button('Phát video để kiểm tra')).to_be_enabled()
                        button('Phát video để kiểm tra').click()
                        page.screenshot(path=str(output / 'media-375.png'), full_page=True)
                        send = 'Gửi toàn bộ Telegram · 1 ảnh · 1 video'
                        button(send).click()
                        button('Tiếp tục chỉnh sửa').click()
                        assert not state['actions']
                        button(send).click()
                        button('Xác nhận xếp gửi Telegram').click()
                        expect(button('Đối chiếu thao tác Telegram')).to_be_enabled()
                        button('Đối chiếu thao tác Telegram').click()
                        button('Đối chiếu với máy chủ').click()
                        acknowledge()
                    else:
                        expect(button('Gửi lại Telegram sau đối chiếu')).to_be_disabled()
                        button('Đối chiếu tin trong nhóm Telegram').click()
                        button('Đã kiểm tra nhóm: chưa có tin này').click()
                        button('Gửi lại Telegram sau đối chiếu').click()
                        button('Xác nhận xếp gửi Telegram').click()
                        acknowledge()
                        state['contract']['events'] = [deepcopy(data['partial'])]
                        button('Làm mới nội dung và ảnh Telegram').click()
                        expect(button('Gửi tiếp phần Telegram còn thiếu')).to_be_enabled()
                        button('Gửi tiếp phần Telegram còn thiếu').click()
                        button('Xác nhận xếp gửi Telegram').click()
                        acknowledge()
                        state['contract']['events'] = [deepcopy(data['sent'])]
                        button('Làm mới nội dung và ảnh Telegram').click()
                        button('Lịch sử gửi và thu hồi Telegram').click()
                        page.get_by_role('textbox', name='Lý do thu hồi Telegram', exact=True).last.fill('QA đối chiếu giao dịch')
                        delivery = data['sent']['deliveries'][0]
                        button('Thu hồi lần gửi ' + delivery['id'][:8]).click()
                        button('Xác nhận thu hồi Telegram').click()
                        acknowledge()
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                    page.go_back(wait_until='networkidle')
                    page.go_back(wait_until='networkidle')
                    page.get_by_role('tab', name='Tổng quan', exact=True).click()
                    button('Mở Điều chuyển xe').click()
                    button('Telegram lượt chuyển xe #501').click()
                    expect(button('Gửi Telegram chuyển / nhận xe')).to_be_enabled()
                    page.screenshot(path=str(output / f'transfer-review-{width}.png'), full_page=True)
                    button('Gửi Telegram chuyển / nhận xe').click()
                    button('Xác nhận xếp gửi Telegram').click()
                    expect(button('Đã kiểm tra xác nhận Telegram')).to_be_enabled()
                    button('Đã kiểm tra xác nhận Telegram').click()
                    expect(button('Đang gửi Telegram điều chuyển')).to_be_disabled()
                    checks.append({'width': width, 'scheme': scheme, 'actions': state['actions'], 'readDoesNotSend': True, 'lostCommitResolved': width == 375, 'confirmedAbsentResumeRetraction': width == 430})
                except Exception:
                    page.screenshot(path=str(output / f'failure-{width}.png'), full_page=True)
                    (output / f'failure-{width}.txt').write_text(page.locator('body').inner_text(), encoding='utf-8')
                    raise
                finally:
                    context.close()
            browser.close()
        assert not errors and not unexpected, {'errors': errors, 'unexpected': unexpected}
        (output / 'results.json').write_text(json.dumps({'ok': True, 'flows': checks, 'screenshots': len(list(output.glob('*.png'))), 'errors': errors, 'unexpected': unexpected, 'fixtureOnly': True, 'realTelegramRequests': 0}, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'ok': True, 'flows': len(checks), 'screenshots': len(list(output.glob('*.png')))}))
    finally:
        server.shutdown()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--build', type=Path, required=True)
    parser.add_argument('--fixture', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(args.build, args.fixture, args.output)
