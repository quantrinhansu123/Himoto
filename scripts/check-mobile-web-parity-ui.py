"""Phone layout, web copy, nested navigation, exports and CAS recovery on synthetic data."""
import argparse
import base64
import json
import threading
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import expect, sync_playwright


class Fixture:
    def __init__(self, workflow, catalogue):
        self.workflow = deepcopy(workflow)
        self.catalogue = catalogue
        self.requests = []
        self.self_rows = {}
        self.fail_self_once = False
        self.user = dict(id=7, name='QA parity', email='qa@example.invalid', role='staff', storeId=23, allStores=True,
                         permissions=['contracts.read', 'contracts.draft', 'contracts.renew', 'contracts.return', 'finance.read', 'finance.write', 'hr.read', 'hr.write', 'vehicles.read', 'customers.read'])
        self.expiry = (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()

    def respond(self, method, raw, body=None):
        url = urlparse(raw)
        path = url.path.removeprefix('/api/mobile/v1')
        params = {k: values[0] for k, values in parse_qs(url.query, keep_blank_values=True).items()}
        self.requests.append(dict(method=method, path=path, params=params))
        if path == '/session':
            return 201 if method == 'POST' else 200, dict(user=self.user, expiresAt=self.expiry, **({'token': 'hm1_' + 'a' * 43} if method == 'POST' else {}))
        if path == '/workspace':
            return 200, dict(user=self.user, stores=[dict(id=23, name='QA A'), dict(id=24, name='QA B')])
        if path == '/operations':
            return 200, dict(active=1, overdue=0, stores=[dict(storeId=23, storeName='QA A', active=1, overdue=0)])
        if path == '/attendance':
            return 200, dict(staff=dict(name='QA ca trực'), open=None, latest=None, shift=None, late_minutes=None, server_now=self.expiry, rows=[], total=0, page=1)
        if path == '/attendance/locations':
            assert method == 'GET'
            return 200, [dict(id=23, store_name='QA A', latitude=0, longitude=0)]
        if path == '/duty-roster':
            return 200, dict(week=params.get('week', self.workflow['self']['week']), schedules=[])
        if path.startswith('/catalogue/'):
            kind = path.split('/')[-1]
            row = dict(id=1, code='QA-0001', name='QA khách', status='draft' if params.get('scope') == 'drafts' else 'renting', storeId=23, storeName='QA A', license='000123', vehicleName='', phone='', startsAt='', endsAt='', totalAmount=123456, paidAmount=0, brand='', color='', odometer=None)
            return 200, dict(rows=[] if params.get('statistics') or kind != 'contracts' else [row], total=1 if kind == 'contracts' else 0, page=1, pages=1, statusCounts=[['draft', 1], ['renting', 0]], tabCount=1, updatedAt=self.expiry)
        if path.startswith('/exports/') and path.endswith('/columns'):
            kind = path.split('/')[2]
            return 200, dict(kind=kind, title='Hợp đồng', columns=[dict(key='code', label='Mã HĐ', selected=True), dict(key='name', label='Khách hàng', selected=True), dict(key='license', label='Biển số', selected=True)])
        if path.startswith('/exports/'):
            assert method == 'GET' and params.get('format') == 'xlsx'
            return 200, self.catalogue['file']
        if path == '/shift-reports/options':
            return 200, dict(canWrite=True, canReview=True, stores=[dict(id=23, name='QA A', kind='rental'), dict(id=24, name='QA B', kind='rental')])
        if path == '/shift-reports/autofill':
            return 200, dict(store_id=int(params['store_id']), date=params['date'], section=params['section'], values={}, sources=[], notices=[])
        if path == '/shift-reports':
            return 200, dict(rows=self.workflow['shifts'])
        if path.startswith('/shift-reports/') and path.split('/')[-1].isdigit():
            return 200, next(row for row in self.workflow['shifts'] if str(row['id']) == path.split('/')[-1])
        if path == '/list-exports/shifts':
            assert method == 'GET' and params.get('status') in ['all', 'draft', 'pending', 'confirmed', 'explained']
            return 200, self.workflow['shiftFile']
        if path == '/attendance/shift-registration':
            data = deepcopy(self.workflow['self'])
            week = params.get('week') or body['week']
            data['week'] = week
            data['dates'] = [(datetime.fromisoformat(week) + timedelta(days=i)).date().isoformat() for i in range(7)]
            if method == 'PUT':
                assert set(body) == {'week', 'days'}
                for day in body['days']:
                    self.self_rows[day['work_date']] = dict(staff_id=data['staff']['id'], store_id=data['staff']['store_id'], **{**day, 'revision': '2'})
                if self.fail_self_once:
                    self.fail_self_once = False
                    return 503, dict(message='Mất phản hồi sau khi đã lưu. Tải lại để đối chiếu.', code='SERVICE_UNAVAILABLE')
            data['registrations'] = [row for date, row in self.self_rows.items() if date in data['dates']]
            return 200, data
        if path == '/duty-roster/registrations':
            data = deepcopy(self.workflow['month'])
            if 'from' in params:
                data.pop('month', None); data.update(dict(from_=params['from'], to=params['to'])); data['from'] = data.pop('from_')
                data['registrations'] = [row for row in data['registrations'] if params['from'] <= row['work_date'] <= params['to']]
                return 200, data
            data['month'] = params.get('month', data['month'])
            return 200, data
        if path == '/list-exports/shift-registrations':
            assert method == 'GET' and all(key in params for key in ['from','to','store','search'])
            return 200, self.workflow['shiftFile']
        if path.startswith('/directory/'):
            return 200, dict(rows=[], total=0, page=1, pages=1)
        raise AssertionError(f'Unexpected fixture API: {method} {path}')


def run(build, workflow, catalogue, output):
    assert (build / 'index.html').is_file() and not output.exists()
    w = json.loads(workflow.read_text(encoding='utf-8'))
    c = json.loads(catalogue.read_text(encoding='utf-8'))
    assert w['fixtureOnly'] and c['fixtureOnly']
    output.mkdir(parents=True)
    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *_args): pass
        def do_GET(self):
            if not Path(self.translate_path(self.path)).is_file(): self.path = '/index.html'
            super().do_GET()
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(build)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    errors, unexpected, flows = [], [], []
    try:
        with sync_playwright() as play:
            browser = play.chromium.launch()
            for width, height, scheme in [(375, 812, 'light'), (430, 932, 'dark'), (812, 375, 'light')]:
                fixture = Fixture(w, c)
                context = browser.new_context(viewport=dict(width=width, height=height), color_scheme=scheme, reduced_motion='reduce', accept_downloads=True)
                def intercept(route):
                    request, url = route.request, urlparse(route.request.url)
                    if url.netloc == urlparse(origin).netloc: return route.continue_()
                    headers = {'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS'}
                    if request.method == 'OPTIONS': return route.fulfill(status=204, headers=headers)
                    try:
                        assert url.hostname == 'mobile-api.example.invalid', url.hostname
                        status, data = fixture.respond(request.method, request.url, request.post_data_json if request.post_data else None)
                        return route.fulfill(status=status, json=data, headers=headers)
                    except Exception as error:
                        unexpected.append(str(error)); return route.abort()
                context.route('**/*', intercept)
                page = context.new_page(); page.set_default_timeout(20000)
                page.on('pageerror', lambda error: errors.append(str(error)))
                button = lambda label: page.get_by_role('button', name=label, exact=True).last
                def navigate(path):
                    if path == '/':
                        page.goto(origin, wait_until='networkidle'); return
                    for _ in range(8):
                        if urlparse(page.url).path == '/': break
                        page.go_back(wait_until='domcontentloaded')
                        if page.get_by_role('button', name='Rời báo cáo ca', exact=True).count():
                            button('Rời báo cáo ca').click()
                    expect(button('Mở danh mục quản lý')).to_be_visible()
                    button('Mở danh mục quản lý').click()
                    if path == '/contracts-workspace/drafts': button('Hợp đồng nháp').click()
                    elif path == '/shift-reports': button('Báo cáo cuối ca').click()
                    elif path == '/shift-registrations':
                        button('Lịch trực cơ sở').click(); button('Đăng ký ca làm việc').click()
                    elif path == '/self-shift-registration':
                        button('Chấm công').click(); button('Đăng ký ca làm việc tuần tới').click()
                    else: raise AssertionError(path)
                try:
                    navigate('/')
                    page.get_by_role('textbox', name='Tài khoản', exact=True).fill('qa')
                    page.get_by_label('Mật khẩu', exact=True).fill('fixture-password')
                    button('Đăng nhập').click()
                    expect(button('Mở Danh sách hợp đồng')).to_be_visible()
                    navigate('/contracts-workspace/drafts')
                    expect(button('+ Nhập bổ sung giao dịch')).to_be_visible()
                    expect(button('Tải Excel theo bộ lọc')).to_be_enabled()
                    assert page.get_by_role('button', name='Mở danh mục quản lý', exact=True).count() == 0
                    page.screenshot(path=str(output / f'drafts-{width}.png'), full_page=True)
                    button('Tải Excel theo bộ lọc').click()
                    with page.expect_download() as download: button('Tải Excel với 3 cột').click()
                    download.value.save_as(output / f'contracts-{width}.xlsx')
                    assert (output / f'contracts-{width}.xlsx').read_bytes() == base64.b64decode(c['file']['contentBase64'])
                    exported = next(r for r in reversed(fixture.requests) if r['path'] == '/exports/contracts')
                    assert exported['params']['scope'] == 'drafts'
                    navigate('/shift-reports')
                    button('Tiến độ báo cáo').click()
                    for item in ['PGD đang lập', 'Chờ KTNB xác nhận', 'Đã xác nhận KTNB', 'Đã xác nhận có giải trình']:
                        expect(button(item)).to_be_visible()
                    button('Đã xác nhận có giải trình').click()
                    expect(page.get_by_text('1 báo cáo phù hợp', exact=True)).to_be_visible()
                    with page.expect_download() as download: button('Tải Excel theo bộ lọc').click()
                    download.value.save_as(output / f'shifts-{width}.xlsx')
                    exported = next(r for r in reversed(fixture.requests) if r['path'] == '/list-exports/shifts')
                    assert exported['params']['status'] == 'explained'
                    page.screenshot(path=str(output / f'shifts-{width}.png'), full_page=True)
                    button('+ Tạo báo cáo').click()
                    expect(page.get_by_text('Thông tin chung', exact=True)).to_be_visible()
                    for tab in ['Thông tin', 'Kiểm kê xe / pin', 'Hợp đồng & thu chi', 'Tiền các tài khoản', 'An toàn cuối ca', 'Thuê sở hữu & Telegram']:
                        assert page.get_by_role('tab', name=tab, exact=True).count() == 1
                    page.get_by_label('Nhân sự trực ca', exact=True).fill('QA nhập ca trực')
                    expect(page.get_by_label('Nhân sự trực ca', exact=True)).to_have_value('QA nhập ca trực')
                    expect(button('Lưu nháp')).to_be_visible(); expect(button('Chốt báo cáo')).to_be_visible()
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                    page.screenshot(path=str(output / f'editor-{width}.png'), full_page=True)
                    # Reload discards only this synthetic unsaved form; no business API is called.
                    navigate('/shift-registrations')
                    expect(page.get_by_text('QA ca trực', exact=True)).to_be_visible()
                    expect(button('Ngày đăng ký')).to_be_visible()
                    page.get_by_label('Từ ngày', exact=True).fill('2026-11-13')
                    page.get_by_label('Đến ngày', exact=True).fill('2026-11-16')
                    button('Áp dụng bộ lọc').click()
                    expect(page.get_by_label('Từ ngày', exact=True)).to_have_value('2026-11-13')
                    with page.expect_download(): button('Tải Excel theo bộ lọc').click()
                    registration_export=next(r for r in reversed(fixture.requests) if r['path']=='/list-exports/shift-registrations')
                    assert registration_export['params']['from']=='2026-11-13' and registration_export['params']['to']=='2026-11-16'
                    page.screenshot(path=str(output / f'registration-range-{width}.png'), full_page=True)
                    navigate('/self-shift-registration')
                    expected_day = next(date for date in fixture.respond('GET', '/api/mobile/v1/attendance/shift-registration?week=' + (datetime.fromisoformat(w['self']['week']) + timedelta(days=7)).date().isoformat())[1]['dates'] if date >= w['self']['today'])
                    date_label = datetime.fromisoformat(expected_day).strftime('%d/%m/%Y')
                    choice = page.get_by_role('button', name='Ca làm ngày ' + date_label, exact=True)
                    choice.click()
                    page.get_by_role('button', name='G1+G3 · Ca sáng + tối (08:00–21:00, nghỉ 12:00–17:00) · 1 công', exact=True).click()
                    fixture.fail_self_once = True
                    button('Lưu đăng ký ca').click(); button('Lưu đăng ký ca').click()
                    expect(page.get_by_text('Mất phản hồi sau khi đã lưu. Tải lại để đối chiếu.', exact=False)).to_be_visible()
                    expect(button('Lưu đăng ký ca')).to_be_disabled()
                    button('Tải lại để đối chiếu').click()
                    expect(page.get_by_text('Đã tải lại đăng ký ca.', exact=True)).to_be_visible()
                    assert sum(r['method'] == 'PUT' for r in fixture.requests) == 1
                    assert not any(r['method'] in ['POST', 'PUT', 'PATCH', 'DELETE'] and r['path'] not in ['/session', '/attendance/shift-registration'] for r in fixture.requests)
                    page.screenshot(path=str(output / f'registration-recovery-{width}.png'), full_page=True)
                    flows.append(dict(width=width, height=height, scheme=scheme, nestedMenuHidden=True, webShiftCopy=True, exactDownloadBytes=True, lostResponseNoDuplicate=True))
                except Exception:
                    page.screenshot(path=str(output / f'failure-{width}.png'), full_page=True)
                    (output / 'failure.json').write_text(json.dumps(dict(errors=errors, unexpected=unexpected, requests=fixture.requests), ensure_ascii=False, indent=2), encoding='utf-8')
                    raise
                finally: context.close()
            browser.close()
        assert not errors and not unexpected, (errors, unexpected)
        (output / 'results.json').write_text(json.dumps(dict(ok=True, flows=flows, pageErrors=errors, unexpected=unexpected, fixtureOnly=True, productionWrites=0), indent=2), encoding='utf-8')
        print(json.dumps(dict(ok=True, flows=len(flows))))
    finally: server.shutdown()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for flag in ['build', 'workflow', 'catalogue', 'output']: parser.add_argument('--' + flag, type=Path, required=True)
    args = parser.parse_args(); run(*(getattr(args, flag).resolve() for flag in ['build', 'workflow', 'catalogue', 'output']))
