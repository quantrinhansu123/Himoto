"""Phone-width org/store/bulk flows from actual SQL snapshots; no external writes."""
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


def run(build, fixture, bulk_fixture, output):
    assert (build / 'index.html').is_file() and (build / 'metadata.json').is_file() and not output.exists(), 'Use a completed export artifact'
    data = json.loads(fixture.read_text(encoding='utf-8'))
    bulk = json.loads(bulk_fixture.read_text(encoding='utf-8'))
    assert data['fixtureOnly'] and bulk['fixtureOnly']
    output.mkdir(parents=True)
    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(build)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    user = {'id': 7, 'name': 'QA Quản lý', 'email': 'qa@example.invalid', 'role': 'admin', 'storeId': None, 'allStores': True, 'permissions': ['contracts.read', 'hr.read', 'hr.write', 'settings.write', 'customers.read', 'vehicles.read']}
    expiry = (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()
    directory = lambda r: {'id': r['id'], 'name': r['name'], 'code': r['code'], 'status': r['status'], 'storeId': 23, 'storeName': 'Cơ sở QA', 'phone': '', 'email': '', 'address': '', 'position': '', 'managerName': '', 'joinedAt': '', 'notes': '', 'vehicleCount': None, 'staffCount': None}
    people = [directory(r) for r in bulk['staffReview']['rows']]
    store_profile = {'id': 23, 'revision': '', 'rowRevision': '1', 'code': 'CS23', 'kind': 'physical', 'name': 'Cơ sở QA', 'phone': '', 'address': '', 'status': 'active', 'managerId': None, 'managerName': '', 'vehicleCount': 0, 'staffCount': 2}
    errors, unexpected, checks = [], [], []
    try:
        with sync_playwright() as play:
            browser = play.chromium.launch()
            for width, scheme in [(375, 'light'), (430, 'dark')]:
                state = {'deletes': [], 'proofs': {}, 'resolve': 0, 'dropped': False, 'show_departed': []}
                context = browser.new_context(viewport={'width': width, 'height': 900}, color_scheme=scheme, reduced_motion='reduce')
                def intercept(route):
                    request, url = route.request, urlparse(route.request.url)
                    if url.netloc == urlparse(base).netloc:
                        return route.continue_()
                    headers = {'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Headers': 'authorization,content-type,idempotency-key', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS'}
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
                        return respond({'user': user, 'stores': [{'id': 23, 'name': 'Cơ sở QA'}, {'id': 24, 'name': 'Kho QA khác'}]})
                    if '/catalogue/' in url.path:
                        return respond({'rows': [], 'total': 0, 'page': 1, 'pages': 1, 'statusCounts': [], 'updatedAt': datetime.now(timezone.utc).isoformat()})
                    if '/directory/' in url.path:
                        rows = people if url.path.endswith('/staff') else [directory({'id': 23, 'name': 'Cơ sở QA', 'code': 'CS23', 'status': 'active'})]
                        return respond({'rows': rows, 'total': len(rows), 'page': 1, 'pages': 1})
                    if url.path.endswith('/staff/organization'):
                        params = parse_qs(url.query)
                        state['show_departed'].append(params['departed'][0])
                        return respond(data['organizationSearch'] if params.get('search', [''])[0] else data['organization'])
                    if url.path.endswith('/stores/23/contracts'):
                        return respond(data['storeSearch'] if parse_qs(url.query).get('search') else data['storeContracts'])
                    if url.path.endswith('/stores/23'):
                        return respond(store_profile)
                    if url.path.endswith('/bulk-delete/staff/review'):
                        body = request.post_data_json
                        assert sorted(body['ids']) == [101, 102]
                        return respond(bulk['staffReview'])
                    if url.path.endswith('/bulk-delete/staff'):
                        body, key = request.post_data_json, request.headers['idempotency-key']
                        assert body['review'] == bulk['staffReview']['review'] and body['ids'] == [101, 102]
                        assert key not in state['deletes'], 'The UI cannot repeat destructive requests'
                        state['deletes'].append(key)
                        proof = {**bulk['staffProof'], 'key': key}
                        state['proofs'][key] = proof
                        if width == 430:
                            state['dropped'] = True
                            return route.abort()
                        return respond(proof)
                    if '/bulk-delete/requests/' in url.path:
                        key = url.path.split('/')[-1]
                        if state['dropped']:
                            return respond({'message': 'QA chưa đọc được phiếu gốc'}, 503)
                        return respond(state['proofs'][key])
                    if url.path.endswith('/resolve'):
                        state['resolve'] += 1
                        state['dropped'] = False
                        key = url.path.split('/')[-2]
                        return respond({'key': key, 'operation': 'bulk.staff.delete', 'status': 'committed', 'receipt': {'id': 2, 'revision': '1', 'replayed': True}})
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
                    button('Mở Nhân sự').click()
                    button('Sơ đồ nhân sự').click()
                    expect(page.get_by_text('5 nhân sự · 2 cơ sở', exact=True)).to_be_visible()
                    page.get_by_role('switch', name='Hiện nhân sự đã nghỉ việc', exact=True).click()
                    expect(page.get_by_role('switch', name='Hiện nhân sự đã nghỉ việc', exact=True)).to_be_checked()
                    page.get_by_role('textbox', name='Tìm nhân sự trên sơ đồ', exact=True).fill('da nghi')
                    expect(page.get_by_text('1 nhân sự · 1 cơ sở', exact=True)).to_be_visible()
                    page.screenshot(path=str(output / f'organization-{width}.png'), full_page=True)
                    page.go_back()
                    button('Chọn nhiều hồ sơ để xóa').click()
                    button('Chọn các hồ sơ trang này').click()
                    button('Rà soát xóa 2 hồ sơ').click()
                    expect(button('Xác nhận xóa 2 nhân sự')).to_be_disabled()
                    page.get_by_role('textbox', name='Nhập XOA để xác nhận', exact=True).fill('XOA')
                    page.screenshot(path=str(output / f'bulk-review-{width}.png'), full_page=True)
                    button('Xác nhận xóa 2 nhân sự').click()
                    if width == 430:
                        button('Mở Tài khoản để đối chiếu xóa').click()
                        button('Đối chiếu xóa nhiều nhân sự').click()
                        button('Đối chiếu với máy chủ').click()
                        button('Mở kết quả xóa nhiều nhân sự').click()
                    expect(page.get_by_text('Đã xóa 2 nhân sự', exact=True)).to_be_visible()
                    button('Đã kiểm tra kết quả xóa').click()
                    assert len(state['deletes']) == 1
                    for _ in range(5):
                        if button('Mở Cơ sở').count():
                            break
                        page.go_back()
                        page.wait_for_timeout(150)
                    button('Mở Cơ sở').click()
                    button('Xem Cơ sở QA').click()
                    button('Hợp đồng của cơ sở').click()
                    expect(page.get_by_text('4 hợp đồng', exact=True)).to_be_visible()
                    page.get_by_role('textbox', name='Tìm hợp đồng của cơ sở', exact=True).fill('EDIT9301')
                    expect(page.get_by_text('1 kết quả · Trang 1/1', exact=True)).to_be_visible()
                    expect(page.get_by_text('4 hợp đồng', exact=True)).to_be_visible()
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                    page.screenshot(path=str(output / f'store-contracts-{width}.png'), full_page=True)
                    checks.append({'width': width, 'scheme': scheme, 'organizationSearchDeparted': True, 'typedReview': True, 'deletes': len(state['deletes']), 'lostCommitResolved': width == 430, 'storeSummaryUnaffectedBySearch': True})
                except Exception:
                    page.screenshot(path=str(output / f'failure-{width}.png'), full_page=True)
                    (output / f'failure-{width}.txt').write_text(page.locator('body').inner_text(), encoding='utf-8')
                    raise
                finally:
                    context.close()
            browser.close()
        assert not errors and not unexpected, {'errors': errors, 'unexpected': unexpected}
        (output / 'results.json').write_text(json.dumps({'ok': True, 'flows': checks, 'screenshots': 6, 'errors': errors, 'unexpected': unexpected, 'fixtureOnly': True, 'operationalWrites': 0}, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'ok': True, 'flows': len(checks), 'screenshots': 6}))
    finally:
        server.shutdown()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--build', type=Path, required=True)
    parser.add_argument('--fixture', type=Path, required=True)
    parser.add_argument('--bulk-fixture', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(args.build, args.fixture, args.bulk_fixture, args.output)
