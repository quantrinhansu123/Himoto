"""Focused Expo Web import/export flows with isolated in-memory responses only.

Uses a new browser context, fresh batch/request UUIDs and a loopback static server.
Never attaches to or changes the Samsung fixture, app data or durable ledger.
"""
import argparse
import base64
import json
import subprocess
import threading
import zipfile
import xml.etree.ElementTree as ET
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

from playwright.sync_api import expect, sync_playwright


def run(build, output):
    assert build.is_dir() and not output.exists()
    output.mkdir(parents=True)
    # Generate a real .xlsx with the same production template used by the API.
    subprocess.run(['node', '-e', "const fs=require('node:fs'),p=require('node:path'),{load,root}=require('./scripts/lib/load-typescript.cjs');(async()=>{const b=await load(p.join(root,'lib/management/customer-excel')).createCustomerTemplate([{id:23,name:'QA Store',code:'QA23'}]);const E=require('exceljs'),w=new E.Workbook();await w.xlsx.load(b);w.worksheets[0].getRow(2).values=['QA import','0900000002','001234000002','','QA address','QA23','active',''];fs.writeFileSync(process.argv[1],Buffer.from(await w.xlsx.writeBuffer()));})().catch(e=>{console.error(e);process.exitCode=1})", str(output / 'input.xlsx')], check=True)
    subprocess.run(['node','-e',"const fs=require('node:fs'),E=require('exceljs');(async()=>{const w=new E.Workbook(),s=w.addWorksheet('Customers',{views:[{state:'frozen',ySplit:1}]});s.addRow(['Mã','Khách hàng','Số điện thoại']);for(let i=0;i<53;i++)s.addRow(['QA-'+i,'QA '+i,'0900000002']);s.autoFilter='A1:C54';fs.writeFileSync(process.argv[1],Buffer.from(await w.xlsx.writeBuffer()));})().catch(e=>{console.error(e);process.exitCode=1})",str(output/'synthetic-export.xlsx')],check=True)
    export_bytes=(output/'synthetic-export.xlsx').read_bytes()
    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(build)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f'http://127.0.0.1:{server.server_port}'
    errors, unexpected, checks, calls = [], [], [], []
    user = {'id': 7, 'name': 'QA Import Export', 'email': 'qa@example.invalid', 'role': 'branch_manager', 'storeId': 23, 'allStores': False, 'permissions': ['contracts.read', 'customers.read', 'vehicles.read', 'settings.write']}
    expiry = (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()
    columns = [{'key': k, 'label': label, 'selected': True} for k, label in [('code', 'Mã'), ('name', 'Khách hàng'), ('phone', 'Số điện thoại'), ('id_card', 'Giấy tờ định danh')]]
    values = lambda n: {'name': f'QA nhập {n}', 'phone': f'090000000{n}', 'id_card': f'00123400000{n}', 'email': '', 'address': 'QA address', 'store': 'QA23', 'status': 'active', 'warning_note': ''}
    source = [{'rowNumber': n, 'values': values(n), 'errors': []} for n in [2, 3, 4]]
    source[2]['values']['phone'] = ''
    source[2]['errors'] = ['Thiếu điện thoại.']
    record = {'id': 2, 'code': 'KH-QA-2', 'name': 'QA customer', 'status': 'active', 'storeId': 23, 'storeName': 'QA Store', 'license': '', 'vehicleName': '', 'phone': '0900000002', 'startsAt': '', 'endsAt': '', 'totalAmount': None, 'paidAmount': None, 'brand': '', 'color': '', 'odometer': None}
    try:
        with sync_playwright() as play:
            browser = play.chromium.launch()
            for width, scheme in [(375, 'light'), (430, 'dark')]:
                context = browser.new_context(viewport={'width': width, 'height': 900}, color_scheme=scheme, reduced_motion='reduce', accept_downloads=True)
                state = {'batch': str(uuid4()), 'receipt': None, 'submitted': 0, 'resolved': 0, 'exported': [], 'storeSubmitted': 0, 'storeSaved': False}
                store_inputs = [{'rowNumber': n + 2, 'values': {'id_card': str(n + 2).zfill(12), 'store': 'QA23'}, 'errors': []} for n in range(1002)]
                def intercept(route):
                    request, url = route.request, urlparse(route.request.url)
                    if url.netloc == urlparse(base).netloc:
                        route.continue_()
                        return
                    if url.hostname != 'mobile-api.example.invalid':
                        unexpected.append(url.hostname)
                        route.abort()
                        return
                    headers = {'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Headers': 'authorization,content-type,idempotency-key,x-file-name,x-allow-incomplete', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'}
                    if request.method == 'OPTIONS':
                        route.fulfill(status=204, headers=headers)
                        return
                    calls.append({'method': request.method, 'path': url.path, 'width': width})
                    def respond(data, status=200):
                        route.fulfill(json=data, status=status, headers=headers)
                    if url.path.endswith('/session'):
                        respond({'token': 'hm1_' + 'a' * 43, 'user': user, 'expiresAt': expiry} if request.method == 'POST' else {'user': user, 'expiresAt': expiry}, 201 if request.method == 'POST' else 200)
                    elif url.path.endswith('/workspace'):
                        respond({'user': user, 'stores': [{'id': 23, 'name': 'QA Store'}]})
                    elif '/catalogue/' in url.path:
                        kind = url.path.rsplit('/', 1)[-1]
                        row = {**record, 'license': 'QA-2' if kind == 'vehicles' else '', 'status': 'ready' if kind == 'vehicles' else 'renting' if kind == 'contracts' else 'active'}
                        respond({'rows': [row], 'total': 1, 'page': 1, 'pages': 1, 'statusCounts': [], 'updatedAt': datetime.now(timezone.utc).isoformat()})
                    elif url.path.endswith('/exports/customers/columns'):
                        respond({'kind': 'customers', 'title': 'Khách hàng', 'columns': columns})
                    elif url.path.endswith('/exports/customers'):
                        params = parse_qs(url.query)
                        state['exported'].append(params)
                        assert params['columns'] == ['code,name,phone']
                        assert params['format']==['xlsx']
                        respond({'filename':'himoto-customers-qa.xlsx','mimeType':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','contentBase64':base64.b64encode(export_bytes).decode(),'rowCount':53})
                    elif url.path.endswith('/imports/customers/preview'):
                        assert request.post_data_buffer[:2] == b'PK'
                        rows = [{**deepcopy(r), 'store_id': 23, 'state': 'invalid' if r['errors'] else 'valid', 'warnings': []} for r in source]
                        respond({'batchId': state['batch'], 'filename': 'input.xlsx', 'sha256': 'a' * 64, 'allowIncomplete': False, 'sourceRows': source, 'result': {'rows': rows, 'total': 3, 'valid': 2, 'invalid': 1, 'duplicate': 0, 'incomplete': 0, 'imported': 0, 'committed': False}})
                    elif url.path.endswith('/imports/customers/' + state['batch']):
                        body = request.post_data_json
                        assert len(body['rows']) == 1 and body['rows'][0]['rowNumber'] == 3
                        assert body['rows'][0]['values']['phone'] == '0900000003'
                        assert request.headers.get('idempotency-key') and not body['allowIncomplete']
                        state['submitted'] += 1
                        assert state['submitted'] == 1
                        key = request.headers['idempotency-key']
                        state['receipt'] = {'key': key, 'operation': 'import.customers:' + state['batch'], 'batchId': state['batch'], 'kind': 'customers', 'actorId': 7, 'count': 1, 'recordedAt': datetime.now(timezone.utc).isoformat(), 'replayed': True}
                        # Simulate server commit followed by a lost response.
                        route.abort('failed')
                    elif url.path.endswith('/imports/customer-stores/file'):
                        assert request.post_data_buffer[:2] == b'PK' and request.headers['accept'] == 'application/x-ndjson'
                        parts = [{'filename': 'input.xlsx', 'sha256': 'a' * 64, 'total': 1002, 'offset': offset, 'nextOffset': 1000 if offset == 0 else None, 'inputs': store_inputs[offset:offset + 1000]} for offset in [0, 1000]]
                        route.fulfill(status=200, headers={**headers, 'Content-Type': 'application/x-ndjson; charset=utf-8'}, body=''.join(json.dumps(part, ensure_ascii=False) + '\n' for part in parts))
                    elif url.path.endswith('/imports/customer-stores/preview'):
                        inputs = request.post_data_json['rows']
                        ready = 0 if state['storeSaved'] else 1
                        rows = [{**r, 'customer_id': 2 if i == 0 else None, 'customer_name': 'QA matched' if i == 0 else '', 'previous_store_id': 24 if i == 0 else None, 'previous_store_name': 'QA Previous' if i == 0 else '', 'store_id': 23, 'store_name': 'QA Store', 'state': ('unchanged' if state['storeSaved'] else 'ready') if i == 0 else 'invalid', 'errors': [] if i == 0 else ['Không tìm thấy khách.']} for i, r in enumerate(inputs)]
                        respond({'rows': rows, 'total': len(rows), 'ready': ready, 'unchanged': 1 if state['storeSaved'] else 0, 'invalid': len(rows) - 1, 'updated': 0, 'committed': False, 'revision': ('b' if len(rows) == 1000 else 'c') * 64})
                    elif '/imports/customer-stores/' in url.path:
                        body = request.post_data_json
                        state['storeSubmitted'] += 1
                        assert len(body['rows']) == (1000 if state['storeSubmitted'] == 1 else 2)
                        assert body['revision'] == ('b' if state['storeSubmitted'] == 1 else 'c') * 64
                        key = request.headers['idempotency-key']
                        r = {'key': key, 'operation': 'import.cstores:' + url.path.rsplit('/', 1)[-1], 'batchId': url.path.rsplit('/', 1)[-1], 'kind': 'customer_stores', 'actorId': 7, 'count': 1, 'recordedAt': datetime.now(timezone.utc).isoformat(), 'replayed': False}
                        state['receipt'] = r
                        if state['storeSubmitted'] == 2:
                            state['storeSaved'] = True
                            if width == 375:
                                route.abort('failed')
                                return
                        respond(r)
                    elif '/write-requests/' in url.path:
                        state['resolved'] += 1
                        r = state['receipt']
                        assert request.post_data_json['operation'] == r['operation']
                        respond({'key': r['key'], 'operation': r['operation'], 'status': 'committed', 'receipt': {'id': 7, 'revision': '2', 'replayed': True}})
                    elif '/imports/requests/' in url.path:
                        respond({'receipt': state['receipt']})
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
                page.get_by_role('button', name='Mở Khách hàng', exact=True).click()
                page.get_by_role('button', name='Tải Excel theo bộ lọc', exact=True).click()
                page.get_by_role('checkbox', name='Xuất cột Giấy tờ định danh', exact=True).click()
                expect(page.get_by_role('button', name='Tải Excel với 3 cột', exact=True)).to_be_enabled()
                page.screenshot(path=str(output / f'export-{width}-{scheme}.png'), full_page=True)
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                with page.expect_download() as capture:
                    page.get_by_role('button', name='Tải Excel với 3 cột', exact=True).click()
                download = capture.value
                target = output / f'customers-{width}.xlsx'
                download.save_as(target)
                assert target.read_bytes()==export_bytes
                with zipfile.ZipFile(target)as archive:
                    assert archive.testzip()is None
                    sheet=ET.fromstring(archive.read('xl/worksheets/sheet1.xml'));ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
                    assert len(sheet.findall('s:sheetData/s:row',ns))==54
                    assert sheet.find('s:autoFilter',ns).get('ref')=='A1:C54'
                    assert sheet.find('s:sheetViews/s:sheetView/s:pane',ns).get('ySplit')=='1'
                expect(page.get_by_text('Đã lưu 53 dòng vào himoto-customers-qa.xlsx.', exact=True)).to_be_visible()
                checks.append(f'{width}/{scheme}: column selection and 53-row download from isolated export response, original catalogue only has one mounted row')
                # Expo Router's standard back action preserves the in-memory session.
                page.go_back()
                page.get_by_role('button', name='Nhập khách hàng từ Excel', exact=True).click()
                with page.expect_file_chooser() as capture:
                    page.get_by_role('button', name='Chọn file Excel khách hàng', exact=True).click()
                capture.value.set_files(output / 'input.xlsx')
                expect(page.get_by_text('3 dòng · Hợp lệ 2 · Lỗi 1 · Trùng 0', exact=True)).to_be_visible()
                page.get_by_role('checkbox', name='Chọn dòng 2', exact=True).click()
                page.screenshot(path=str(output / f'import-preview-{width}-{scheme}.png'), full_page=True)
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                page.get_by_role('button', name='Kiểm tra và nhập 1 khách đã chọn', exact=True).click()
                expect(page.get_by_text('Nhập những khách hàng đã chọn?', exact=True)).to_be_visible()
                page.get_by_role('button', name='Xác nhận nhập 1 khách', exact=True).click()
                expect(page.get_by_role('button', name='Đối chiếu kết quả nhập Excel', exact=True)).to_be_enabled()
                page.get_by_role('button', name='Đối chiếu kết quả nhập Excel', exact=True).click()
                expect(page.get_by_text('Đã nhập 1 khách hàng', exact=True)).to_be_visible()
                page.screenshot(path=str(output / f'import-recovered-{width}-{scheme}.png'), full_page=True)
                page.get_by_role('button', name='Đã xem kết quả, về danh sách khách', exact=True).click()
                expect(page.get_by_role('button', name='Nhập khách hàng từ Excel', exact=True)).to_be_visible()
                assert state['submitted'] == 1 and state['resolved'] == 1 and len(state['exported']) == 1
                checks.append(f'{width}/{scheme}: actual picker sends xlsx bytes, exact selected row only, lost commit response resolves original UUID and acknowledgement navigates without a duplicate import')
                page.get_by_role('button', name='Khớp cơ sở khách từ Excel', exact=True).click()
                with page.expect_file_chooser() as capture:
                    page.get_by_role('button', name='Chọn file Căn cước / Cơ sở', exact=True).click()
                capture.value.set_files(output / 'input.xlsx')
                expect(page.get_by_text('1002 dòng · Cần cập nhật 2 · Đã đúng 0 · Lỗi 1000', exact=True)).to_be_visible(timeout=60000)
                page.screenshot(path=str(output / f'store-preview-{width}-{scheme}.png'), full_page=True)
                page.get_by_role('button', name='Kiểm tra và cập nhật cơ sở cho 2 khách', exact=True).click()
                page.get_by_role('button', name='Xác nhận cập nhật 2 khách', exact=True).click()
                if width == 375:
                    expect(page.get_by_role('button', name='Đối chiếu phần cập nhật cơ sở', exact=True)).to_be_enabled()
                    page.get_by_role('button', name='Đối chiếu phần cập nhật cơ sở', exact=True).click()
                    expect(page.get_by_text('Phần đã gửi cập nhật 1 khách', exact=True)).to_be_visible()
                    expect(page.get_by_text('Đã xác nhận cập nhật 2 khách trong lượt thao tác này. Các phần đã ghi được giữ lại khi phần sau bị gián đoạn.', exact=True)).to_be_visible()
                    page.screenshot(path=str(output / f'store-recovered-{width}-{scheme}.png'), full_page=True)
                    page.get_by_role('button', name='Đã xem phần này, kiểm tra lại file', exact=True).click()
                    page.get_by_role('button', name='Kiểm tra lại file và phần còn lại', exact=True).click()
                    expect(page.get_by_text('1002 dòng · Cần cập nhật 0 · Đã đúng 2 · Lỗi 1000', exact=True)).to_be_visible()
                    expect(page.get_by_role('button', name='Kiểm tra và cập nhật cơ sở cho 0 khách', exact=True)).to_be_disabled()
                else:
                    expect(page.get_by_text('Đã cập nhật các phần hợp lệ', exact=True)).to_be_visible()
                    page.screenshot(path=str(output / f'store-complete-{width}-{scheme}.png'), full_page=True)
                    page.get_by_role('button', name='Đã xem kết quả, về danh sách khách', exact=True).click()
                    expect(page.get_by_role('button', name='Khớp cơ sở khách từ Excel', exact=True)).to_be_visible()
                assert state['storeSubmitted'] == 2
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                checks.append(f'{width}/{scheme}: 1002-row stream previews two parts and updates each once; ' + ('second response loss keeps confirmed first part, resolves exact second UUID, acknowledgement/recheck marks both unchanged with no resend' if width == 375 else 'whole-file confirmation closes proven intermediate ledger and final acknowledgement returns to customers'))
                context.close()
            browser.close()
        assert not errors and not unexpected, {'errors': errors, 'unexpected': unexpected}
        result = {'ok': True, 'groups': len(checks), 'checks': checks, 'pageErrors': errors, 'unexpected': unexpected, 'calls': calls, 'browserFixtureOnly': True, 'nativeAcceptance': False, 'completedAt': datetime.now(timezone.utc).isoformat()}
        (output / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'ok': True, 'groups': len(checks)}, ensure_ascii=False))
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--build', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(args.build.resolve(), args.output.resolve())
