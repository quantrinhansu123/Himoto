"""Inline collection notes: all business APIs are fixtures, including every write."""
import argparse
import copy
import json
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3026')
parser.add_argument('--sessions', default='.backups/collection-notes-20261027')
parser.add_argument('--output', default='.backups/collection-notes-20261027/ui')
parser.add_argument('--browser', choices=['all', 'chromium', 'webkit'], default='all')
parser.add_argument('--role', choices=['all', 'admin', 'ownership_staff', 'accounting'], default='all')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
if args.browser == 'all' or args.role == 'all':
    # A separate driver per case keeps WebKit shutdown reliable on Windows.
    reports = []
    for engine in ['chromium', 'webkit']:
        for role in ['admin', 'ownership_staff', 'accounting']:
            if args.browser not in ['all', engine] or args.role not in ['all', role]:
                continue
            target = out / f'{engine}-{role}'
            command = [sys.executable, __file__, '--url', args.url, '--sessions', args.sessions, '--output', str(target), '--browser', engine, '--role', role]
            result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', timeout=90, env={**os.environ, 'PYTHONIOENCODING':'utf-8'})
            if result.returncode:
                print(result.stdout + result.stderr, flush=True)
                raise SystemExit(result.returncode)
            report = json.loads((target / 'results.json').read_text(encoding='utf-8'))
            reports.append(report)
            print(f'{engine}/{role}: {report["passed"]} passed', flush=True)
    report = dict(passed=sum(r['passed'] for r in reports), checks=[c for r in reports for c in r['checks']], javascript_errors=[e for r in reports for e in r['javascript_errors']], real_business_writes=0, real_telegram_sends=0)
    (out / 'results.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps(report, indent=2, ensure_ascii=False))
    raise SystemExit(0)
checks, errors = [], []
expect.set_options(timeout=30000)

def fixture(number):
    return dict(id=number, code=f'QA-DEBT-{number}', customer=f'Khách QA {number}', phone='', store_id=35, store_name='PGD QA', vehicle=f'QA-{number}', started_at='2026-10-01T08:00', due_at='2026-10-15T08:00', days=12, amount=500000, late_fee=0, gps=[], customer_status='Bình thường', followup=dict(contact_status='contacted', handling_status='branch', customer_condition='Đã liên hệ', notes='Ghi chú cũ' if number == 1 else '', revision=1))

with sync_playwright() as p:
    for engine, width in [(p.chromium, 1440), (p.webkit, 390)]:
        if args.browser not in ['all', engine.name]:
            continue
        for role in ['admin', 'ownership_staff', 'accounting']:
            if args.role not in ['all', role]:
                continue
            browser = engine.launch()
            print(f'Checking {engine.name}/{role}', flush=True)
            state = dict(rows=[fixture(1), fixture(2)], fail=False, conflict=False, lost=False, patches=[], sends=0, phase='load')
            def mock(route):
                req, path = route.request, urlparse(route.request.url).path
                if path == '/api/auth/gps/debts':
                    if req.method == 'GET':
                        route.fulfill(json=dict(data=dict(rows=state['rows'], read_at='2026-10-27T08:00:00Z', messages=['Báo cáo QA\n' + '\n'.join(r['followup']['notes'] for r in state['rows'])], hash='a'*64, deliveries=[])))
                        return
                    if req.method == 'PATCH':
                        body = req.post_data_json
                        state['patches'].append(copy.deepcopy(body))
                        assert role != 'accounting', 'Read-only role must not write'
                        assert set(body) == {'order_id', 'revision', 'contact_status', 'handling_status', 'customer_condition', 'notes'}
                        row = next(r for r in state['rows'] if r['id'] == body['order_id'])
                        if state['fail']:
                            state['fail'] = False
                            route.fulfill(status=503, json=dict(message='QA chưa lưu được ghi chú'))
                            return
                        if state['conflict']:
                            state['conflict'] = False
                            row['followup'].update(notes='Ghi chú của nhân viên khác', contact_status='promised', handling_status='escalated', customer_condition='Hẹn thanh toán', revision=row['followup']['revision']+1)
                        if body['revision'] != row['followup']['revision']:
                            route.fulfill(status=409, json=dict(message='Ghi chú đã thay đổi. Tải lại trước khi lưu.'))
                            return
                        row['followup'] = {k:v for k,v in body.items() if k != 'order_id'}
                        row['followup']['revision'] += 1
                        if state['lost']:
                            state['lost'] = False
                            route.abort('failed')
                            return
                        route.fulfill(json=dict(data=dict(revision=row['followup']['revision'])))
                        return
                    state['sends'] += 1
                    raise AssertionError('Notes must never send Telegram')
                if path == '/api/auth/gps/refresh':
                    route.fulfill(json=dict(status='success', data=dict(cached=True, refreshed=False)))
                    return
                if req.method != 'GET':
                    raise AssertionError('Unexpected write: '+path)
                if path == '/api/auth/gps':
                    data = dict(devices=[], events=[])
                elif path in ['/api/auth/stores', '/api/auth/store-directory']:
                    data = [dict(id=35, store_name='PGD QA', status='opening')]
                elif path == '/api/session':
                    route.fulfill(json=dict(user=dict(name='Nhân viên QA')))
                    return
                else:
                    data = []
                route.fulfill(json=dict(status='success', data=data))
            ctx = browser.new_context(viewport=dict(width=width, height=950 if width > 500 else 844), timezone_id='Asia/Ho_Chi_Minh', **(dict(is_mobile=True, has_touch=True) if width < 500 else {}))
            token = (Path(args.sessions) / f'session-{role}.txt').read_text().strip()
            ctx.add_cookies([dict(name='himoto_management_session', value=token, url=args.url, httpOnly=True, sameSite='Strict')])
            ctx.route('**/api/**', mock)
            page = ctx.new_page()
            page.on('pageerror', lambda e, browser=engine.name, role=role, state=state: errors.append(dict(browser=browser, role=role, phase=state['phase'], message=str(e), stack='\n'.join(e.stack.splitlines()[:3]))))
            page.goto(args.url + '/gps', wait_until='domcontentloaded', timeout=60000)
            page.wait_for_load_state('networkidle')
            store = page.get_by_label('Cơ sở đang xem', exact=True)
            if store.count() and store.input_value() != '35':
                store.select_option('35')
                page.wait_for_load_state('networkidle')
            page.locator('.mg-debt-report > summary').click()
            table = page.locator('.mg-collection-table')
            expect(table.get_by_role('columnheader', name='Ghi chú tình trạng khách', exact=True)).to_be_visible()
            first = table.locator('tbody tr').filter(has_text='QA-DEBT-1')
            second = table.locator('tbody tr').filter(has_text='QA-DEBT-2')
            if role == 'accounting':
                expect(table.get_by_role('textbox')).to_have_count(0)
                expect(first).to_contain_text('Ghi chú cũ')
                assert not state['patches']
                checks.append(engine.name+'/'+role+': dedicated notes column is readable without write controls')
                page.wait_for_load_state('networkidle')
                print(f'Passed {engine.name}/{role}', flush=True)
                page.close()
                ctx.close()
                browser.close()
                continue
            note = first.get_by_role('textbox', name='Ghi chú tình trạng khách QA-DEBT-1', exact=True)
            other = second.get_by_role('textbox', name='Ghi chú tình trạng khách QA-DEBT-2', exact=True)
            expect(note).to_have_value('Ghi chú cũ')
            assert note.get_attribute('maxlength') == '3000'
            text = '27/10 gọi khách\nKhách hẹn đóng tiền ngày 30/10'
            note.fill(text)
            other.fill('Bản nhập dòng thứ hai')
            expect(page.get_by_role('button', name='Xem trước & gửi Telegram PGD', exact=True)).to_be_disabled()
            state['fail'] = True
            state['phase'] = 'server failure'
            first.get_by_role('button', name='Lưu ghi chú', exact=True).click()
            expect(first.get_by_role('alert')).to_contain_text('QA chưa lưu được')
            expect(note).to_have_value(text)
            expect(other).to_have_value('Bản nhập dòng thứ hai')
            first.get_by_role('button', name='Lưu ghi chú', exact=True).click()
            expect(first.get_by_role('button', name='Lưu ghi chú', exact=True)).to_have_count(0)
            expect(note).to_have_value(text)
            expect(other).to_have_value('Bản nhập dòng thứ hai')
            assert state['rows'][0]['followup']['contact_status'] == 'contacted'
            assert state['rows'][0]['followup']['handling_status'] == 'branch'
            second.get_by_role('button', name='Huỷ', exact=True).click()
            expect(other).to_have_value('')
            checks.append(engine.name+'/'+role+': multiline save persists, server failure retains both row drafts, and cancelling another row never writes')
            note.fill('Nội dung tôi đang nhập')
            state['conflict'] = True
            state['phase'] = 'revision conflict'
            first.get_by_role('button', name='Lưu ghi chú', exact=True).click()
            expect(first).to_contain_text('Ghi chú của nhân viên khác')
            expect(note).to_have_value('Nội dung tôi đang nhập')
            expect(first.get_by_role('button', name='Lưu ghi chú', exact=True)).to_be_disabled()
            first.get_by_role('button', name='Giữ nội dung đang nhập', exact=True).click()
            first.get_by_role('button', name='Lưu ghi chú', exact=True).click()
            expect(first.get_by_role('button', name='Lưu ghi chú', exact=True)).to_have_count(0)
            assert state['rows'][0]['followup']['notes'] == 'Nội dung tôi đang nhập'
            assert state['rows'][0]['followup']['contact_status'] == 'promised'
            assert state['rows'][0]['followup']['customer_condition'] == 'Hẹn thanh toán'
            checks.append(engine.name+'/'+role+': concurrent notes require review and explicit choice; retry preserves the other employee contact/handling fields')
            note.fill('Đã nhận ghi chú nhưng mất phản hồi')
            state['lost'] = True
            state['phase'] = 'lost response'
            first.get_by_role('button', name='Lưu ghi chú', exact=True).click()
            expect(first.get_by_role('alert')).to_contain_text('Mất kết nối')
            expect(page.get_by_role('button', name='Làm mới báo cáo', exact=True)).to_be_enabled()
            count = len(state['patches'])
            first.get_by_role('button', name='Lưu ghi chú', exact=True).click()
            expect(first.get_by_role('button', name='Lưu ghi chú', exact=True)).to_have_count(0)
            assert len(state['patches']) == count
            note.fill('')
            state['phase'] = 'clear note'
            first.get_by_role('button', name='Lưu ghi chú', exact=True).click()
            expect(first.get_by_role('button', name='Lưu ghi chú', exact=True)).to_have_count(0)
            assert state['rows'][0]['followup']['notes'] == ''
            note.fill(text)
            first.get_by_role('button', name='Lưu ghi chú', exact=True).click()
            expect(first.get_by_role('button', name='Lưu ghi chú', exact=True)).to_have_count(0)
            expect(page.get_by_role('button', name='Làm mới báo cáo', exact=True)).to_be_enabled()
            page.wait_for_load_state('networkidle')
            state['phase'] = 'reopen'
            page.close()
            page = ctx.new_page()
            page.on('pageerror', lambda e, browser=engine.name, role=role, state=state: errors.append(dict(browser=browser, role=role, phase=state['phase'], message=str(e), stack='\n'.join(e.stack.splitlines()[:3]))))
            page.goto(args.url + '/gps', wait_until='domcontentloaded', timeout=60000)
            page.wait_for_load_state('networkidle')
            store = page.get_by_label('Cơ sở đang xem', exact=True)
            if store.count() and store.input_value() != '35':
                store.select_option('35')
                page.wait_for_load_state('networkidle')
            page.locator('.mg-debt-report > summary').click()
            table = page.locator('.mg-collection-table')
            first = table.locator('tbody tr').filter(has_text='QA-DEBT-1')
            note = first.get_by_role('textbox', name='Ghi chú tình trạng khách QA-DEBT-1', exact=True)
            expect(note).to_have_value(text)
            checks.append(engine.name+'/'+role+': lost-response retry writes once, clearing works, and saved notes survive reopening the report')
            preview = page.get_by_role('button', name='Xem trước & gửi Telegram PGD', exact=True)
            expect(preview).to_be_enabled()
            preview.click()
            state['phase'] = 'preview'
            dialog = page.get_by_role('dialog', name='Báo cáo gửi nhóm Telegram PGD', exact=True)
            expect(dialog).to_contain_text(text)
            dialog.get_by_role('button', name='Đóng hộp thoại', exact=True).click()
            note.fill(text+'\nĐang nhập ghi chú tiếp theo')
            note.evaluate('(el)=>el.scrollIntoView({block:"center",inline:"nearest"})')
            note.locator('xpath=ancestor::td').screenshot(path=str(out / f'{engine.name}-{role}-notes.png'))
            first.get_by_role('button', name='Huỷ', exact=True).click()
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
            assert state['sends'] == 0
            checks.append(engine.name+'/'+role+': preview reads the saved note without sending; the notes column scrolls within the table on desktop/mobile')
            page.wait_for_load_state('networkidle')
            state['phase'] = 'close'
            print(f'Passed {engine.name}/{role}', flush=True)
            page.close()
            ctx.close()
            browser.close()
assert not errors, errors
report = dict(passed=len(checks), checks=checks, javascript_errors=errors, real_business_writes=0, real_telegram_sends=0)
(out / 'results.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps(report, indent=2, ensure_ascii=False))
