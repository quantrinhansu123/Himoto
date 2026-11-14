"""Exported phone UI with SQL-produced status/draft shapes; all API I/O intercepted."""
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


def run(build, fixture, output):
    assert (build / 'index.html').is_file() and (build / 'metadata.json').is_file() and not output.exists()
    data = json.loads(fixture.read_text(encoding='utf-8'))['inventory']
    assert data['fixtureOnly']
    output.mkdir(parents=True)
    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(build)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    user = {'id': 7, 'name': 'Nhân viên QA', 'email': 'qa@example.invalid', 'role': 'staff', 'storeId': 23, 'allStores': False, 'permissions': ['vehicles.read', 'vehicles.write']}
    expiry = (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()
    vehicle = data['preparation']['vehicle']
    record = dict(id=vehicle['id'], code=str(vehicle['id']), name=vehicle['name'], status='ready', storeId=23, storeName=vehicle['storeName'], license=vehicle['license'], vehicleName=vehicle['name'], phone='', startsAt='', endsAt='', totalAmount=None, paidAmount=None, brand='', color='', odometer=None)
    profile = {'id': vehicle['id'], 'revision': vehicle['revision'], 'values': dict(name=vehicle['name'], license=vehicle['license'], brand='', type='xe_dien', year=None, store_id=23, status='ready', color='', chassis='', engine='', odometer=None, note=''), 'storeName': vehicle['storeName'], 'ownerStoreId': vehicle['ownerStoreId'], 'ownerStoreName': vehicle['ownerStoreName'], 'typeLabel': 'Xe điện', 'hasOpenContract': False, 'inTransit': False, 'canEdit': True}
    profile['values']['revision'] = profile['revision']
    errors, unexpected, flows = [], [], []
    try:
        with sync_playwright() as play:
            browser = play.chromium.launch()
            for width, scheme in [(375, 'light'), (430, 'dark')]:
                context = browser.new_context(viewport={'width': width, 'height': 900}, color_scheme=scheme, reduced_motion='reduce')
                state = {'writes': [], 'proof': None, 'resolves': 0, 'previews': 0}
                def intercept(route):
                    request, url = route.request, urlparse(route.request.url)
                    if url.netloc == urlparse(base).netloc:
                        return route.continue_()
                    headers = {'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Headers': 'authorization,content-type,idempotency-key', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'}
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
                        return respond({'user': user, 'stores': [{'id': 23, 'name': vehicle['storeName']}]})
                    if url.path.endswith('/catalogue/vehicles'):
                        return respond({'rows': [record], 'total': 1, 'page': 1, 'pages': 1, 'statusCounts': [['ready', 1]], 'updatedAt': expiry})
                    if url.path.endswith(f"/catalogue/vehicles/{vehicle['id']}"):
                        return respond(record)
                    if url.path.endswith(f"/vehicles/{vehicle['id']}"):
                        return respond(profile)
                    if '/record-media/' in url.path:
                        return respond({'message': 'Không có ảnh fixture', 'code': 'NOT_FOUND'}, 404)
                    if url.path.endswith('/status') and request.method == 'GET':
                        return respond(data['preparation'])
                    if url.path.endswith('/status/preview'):
                        state['previews'] += 1
                        assert request.post_data_json == data['input']
                        assert 'idempotency-key' not in request.headers
                        return respond(data['review'])
                    if url.path.endswith('/status') and request.method == 'POST':
                        assert request.post_data_json == {**data['input'], 'review_snapshot': data['review']['snapshot']}
                        key = request.headers['idempotency-key']
                        assert re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}', key)
                        state['writes'].append(key)
                        state['proof'] = {**deepcopy(data['receipt']), 'requestId': key}
                        return respond({'message': 'QA mất phản hồi sau commit', 'code': 'SERVICE_UNAVAILABLE'}, 503)
                    if '/write-requests/' in url.path and url.path.endswith('/resolve'):
                        assert request.post_data_json == {'operation': f"vehicle.status:{vehicle['id']}"}
                        assert state['writes'][0] in url.path
                        state['resolves'] += 1
                        p = state['proof']
                        return respond({'key': p['requestId'], 'operation': f"vehicle.status:{vehicle['id']}", 'status': 'committed', 'receipt': {'id': p['id'], 'revision': p['revision'], 'replayed': True}})
                    if '/vehicle-status/requests/' in url.path:
                        assert state['proof']['requestId'] in url.path
                        return respond({'receipt': state['proof']})
                    unexpected.append(f'{request.method} {url.path}')
                    return route.abort()
                context.route('**/*', intercept)
                page = context.new_page()
                page.set_default_timeout(20000)
                page.on('pageerror', lambda e: errors.append(str(e)))
                button = lambda label: page.get_by_role('button', name=label, exact=True).last
                field = lambda label: page.get_by_role('textbox', name=label, exact=True).last
                try:
                    page.goto(base, wait_until='networkidle')
                    field('Tài khoản').fill('qa')
                    page.get_by_label('Mật khẩu', exact=True).fill('fixture-password')
                    button('Đăng nhập').click()
                    page.get_by_role('tab', name='Danh sách xe').click()
                    button(f"Xem {vehicle['license']}, {vehicle['name']}").click()
                    button('Đổi trạng thái xe').click()
                    button('Nhập thông tin đổi trạng thái').click()
                    expect(button('Trạng thái')).to_contain_text('Đang thuê')
                    expect(field('Tên khách')).to_have_count(0)
                    button('Rà soát đổi trạng thái').click()
                    expect(page.get_by_text('Xe đang ở trạng thái đã chọn. Chọn thao tác khác.', exact=True)).to_be_visible()
                    assert state['previews'] == 0 and not state['writes']
                    button('Trạng thái').click()
                    button('Nợ xấu').click()
                    field('Ghi chú').fill(data['input']['note'])
                    button('Rà soát đổi trạng thái').click()
                    expect(page.get_by_text('Rà soát trước khi ghi', exact=True)).to_be_visible()
                    page.screenshot(path=str(output / f'review-{width}.png'), full_page=True)
                    button('Lưu đổi trạng thái').click()
                    button('Tiếp tục chỉnh sửa').click()
                    assert not state['writes']
                    button('Sửa thông tin').click()
                    expect(field('Ghi chú')).to_have_value(data['input']['note'])
                    button('Rà soát đổi trạng thái').click()
                    button('Lưu đổi trạng thái').click()
                    button('Lưu đổi trạng thái').click()
                    expect(page.get_by_text('Thao tác xe đang chờ đối chiếu', exact=True)).to_be_visible()
                    button('Vào Tài khoản để đối chiếu').click()
                    label = f"đổi trạng thái / tạo nháp từ kho #{vehicle['id']}"
                    button('Đối chiếu ' + label).click()
                    button('Đối chiếu với máy chủ').click()
                    button('Mở kết quả ' + label).click()
                    expect(page.get_by_text('Đã đổi trạng thái: Nợ xấu', exact=True)).to_be_visible()
                    assert data['receipt']['draft'] is None and data['receipt']['customer'] is None
                    assert len(state['writes']) == 1 and state['resolves'] == 1
                    page.screenshot(path=str(output / f'recovered-{width}.png'), full_page=True)
                    button('Đã kiểm tra · mở hồ sơ xe').click()
                    expect(page).to_have_url(re.compile(f"/record/vehicles/{vehicle['id']}$"))
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                    flows.append({'width': width, 'scheme': scheme, 'defaults': True, 'noImplicitStatusChange': True, 'reviewCancel': True, 'formPreserved': True, 'lostCommitAccountRecovery': True, 'independentStatus': True, 'noDraft': True, 'writes': len(state['writes']), 'acknowledged': True})
                except Exception:
                    page.screenshot(path=str(output / f'failure-{width}.png'), full_page=True)
                    (output / 'failure-observed.json').write_text(json.dumps({'errors': errors, 'unexpected': unexpected, 'state': state}, ensure_ascii=False, indent=2), encoding='utf-8')
                    raise
                finally:
                    context.close()
            browser.close()
        assert not errors and not unexpected, {'errors': errors, 'unexpected': unexpected}
        result = {'ok': True, 'fixtureOnly': True, 'flows': flows, 'screenshots': 4, 'errors': errors, 'unexpected': unexpected, 'productionWrites': 0, 'nativeAcceptance': False, 'completedAt': datetime.now(timezone.utc).isoformat()}
        (output / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'ok': True, 'flows': len(flows), 'screenshots': 4}))
    finally:
        server.shutdown()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--build', type=Path, required=True)
    parser.add_argument('--fixture', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(args.build.resolve(), args.fixture.resolve(), args.output.resolve())
