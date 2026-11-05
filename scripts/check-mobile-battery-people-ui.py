"""Phone-width battery pickers; synthetic tenant lookup and zero server business writes."""
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
    assert (build / 'metadata.json').is_file() and (build / 'index.html').is_file() and not output.exists()
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
    user = {'id': 7, 'name': 'QA Pin', 'email': 'qa@example.invalid', 'role': 'staff', 'storeId': 23, 'allStores': False, 'permissions': ['contracts.read', 'contracts.draft', 'customers.read']}
    details = {key: '' for key in ['name', 'phone', 'email', 'address', 'id_card', 'id_card_issued_on', 'id_card_issued_by', 'driver_license_number', 'driver_license_issued_on', 'birthday', 'relatives_text', 'warning_note', 'customer_type', 'nationality', 'contact_channel', 'contact_detail']}
    details.update({'name': 'Khách tra cứu QA', 'phone': '0900000001', 'id_card': '012345678901', 'customer_type': 'domestic', 'address': 'Địa chỉ QA'})
    person = {'id': 201, 'storeId': 24, 'storeName': 'Cơ sở khác QA', 'status': 'active', 'details': details, 'relatives': [{'name': '', 'relationship': '', 'phone': ''}, {'name': '', 'relationship': '', 'phone': ''}]}
    errors, unexpected, checks = [], [], []
    try:
        with sync_playwright() as play:
            browser = play.chromium.launch()
            for width, scheme in [(375, 'light'), (430, 'dark')]:
                context = browser.new_context(viewport={'width': width, 'height': 900}, color_scheme=scheme, reduced_motion='reduce')
                lookup = {'calls': 0, 'pending': None, 'queries': []}
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
                    if url.path.endswith('/drafts/customer-lookup'):
                        lookup['calls'] += 1
                        query = request.post_data_json['query']
                        lookup['queries'].append(query)
                        if query == '0900000001':
                            return respond({'rows': [person], 'hasMore': False})
                        if query == '0900000002':
                            lookup['pending'] = (route, headers)
                            return
                        if query == '0900000003':
                            return respond({'rows': [person, {**person, 'id': 202}], 'hasMore': False})
                        return respond({'rows': [], 'hasMore': False})
                    assert request.method == 'GET', 'No battery business writes are authorized by this smoke'
                    if url.path.endswith('/workspace'):
                        return respond({'user': user, 'stores': [{'id': 23, 'name': 'Cơ sở pin QA'}]})
                    if '/catalogue/' in url.path:
                        return respond({'rows': [], 'total': 0, 'page': 1, 'pages': 1, 'statusCounts': [], 'updatedAt': datetime.now(timezone.utc).isoformat()})
                    if url.path.endswith('/battery-contracts/options'):
                        return respond(data['options'])
                    if url.path.endswith('/battery-contracts/staff'):
                        return respond({'rows': [{'id': 501, 'name': 'Nhân viên pin QA'}]})
                    if url.path.endswith('/battery-contracts'):
                        return respond({'rows': [], 'total': 0, 'scopeCount': 0, 'page': 1, 'pages': 1, 'statusCounts': []})
                    unexpected.append(url.path)
                    route.abort()
                context.route('**/*', intercept)
                page = context.new_page()
                page.set_default_timeout(25000)
                page.on('pageerror', lambda error: errors.append(str(error)))
                button = lambda name: page.get_by_role('button', name=name, exact=True).last
                def part(name):
                    button('Phần hợp đồng pin / sạc').click()
                    button(name).click()
                field = lambda name: page.get_by_role('textbox', name=name, exact=True).last
                try:
                    page.goto(base, wait_until='networkidle')
                    field('Tài khoản').fill('qa')
                    page.get_by_label('Mật khẩu', exact=True).fill('fixture-password')
                    button('Đăng nhập').click()
                    button('Mở Hợp đồng pin / sạc').click()
                    button('Lập hợp đồng pin / sạc').click()
                    button('Gợi ý nhân viên ký hợp đồng pin').click()
                    button('Nhân viên pin QA').click()
                    expect(field('Nhân viên ký hợp đồng pin')).to_have_value('Nhân viên pin QA')
                    field('Nhân viên ký hợp đồng pin').fill('Tên nhân viên sửa tay QA')
                    part('Bên thuê')
                    search = field('Tra cứu CCCD hoặc SĐT khách thuê pin')
                    search.fill('0900000001')
                    expect(field('Tên khách thuê pin')).to_have_value('Khách tra cứu QA')
                    expect(field('CCCD khách thuê pin')).to_have_value('012345678901')
                    search.fill('0900000002')
                    expect(page.get_by_text('Đang tra cứu khách hàng…', exact=True)).to_be_visible()
                    page.wait_for_timeout(100)
                    assert lookup['pending']
                    field('Tên khách thuê pin').fill('Khách vừa sửa tay QA')
                    pending, headers = lookup['pending']
                    pending.fulfill(status=200, headers=headers, json={'rows': [person], 'hasMore': False})
                    expect(button('Chọn khách thuê pin #201')).to_be_visible()
                    expect(field('Tên khách thuê pin')).to_have_value('Khách vừa sửa tay QA')
                    page.screenshot(path=str(output / f'keeps-typed-{width}.png'), full_page=True)
                    button('Chọn khách thuê pin #201').click()
                    expect(field('Tên khách thuê pin')).to_have_value('Khách tra cứu QA')
                    search.fill('0900000003')
                    expect(button('Chọn khách thuê pin #202')).to_be_visible()
                    button('Chọn khách thuê pin #202').click()
                    expect(page.get_by_text('Đã chọn khách hàng #202 · Thông tin đã tự điền', exact=True)).to_be_visible()
                    search.fill('0912345678')
                    expect(page.get_by_text('Chưa có khách hàng này trong hệ thống. Nhập thông tin bên thuê bên dưới.', exact=True)).to_be_visible()
                    expect(field('Số điện thoại khách thuê pin')).to_have_value('0900000001')
                    part('Thông tin chung')
                    expect(field('Nhân viên ký hợp đồng pin')).to_have_value('Tên nhân viên sửa tay QA')
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                    page.screenshot(path=str(output / f'staff-{width}.png'), full_page=True)
                    assert lookup['calls'] == 4
                    checks.append({'width': width, 'scheme': scheme, 'staffSuggestionAndManualName': True, 'exactCustomer': True, 'lateResultKeepsTyping': True, 'duplicatesExplicitSelection': True, 'missingKeepsPhone': True, 'serverBusinessWrites': 0})
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
