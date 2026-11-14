"""Telegram recovery UI; every API/provider request is intercepted."""
import argparse
import base64
import copy
import json
import re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3016')
parser.add_argument('--cookie-file', required=True)
parser.add_argument('--output', default='.backups/telegram-recovery-20261024/ui')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
expect.set_options(timeout=30000)
state, checks, errors, posts, unexpected = {}, [], [], [], []
notice_id = '00000000-0000-4000-8000-000000000001'
key = 'return:901:1001'


def event():
    case = state['case']
    if case.startswith('preparation-'):
        return dict(key=key, kind='rental', label='Thuê xe · Cần kiểm tra hồ sơ', phases=['rental'],
                    text='', hash='0' * 64, photo_count=0, video_count=0, status='manual', sent_at=None,
                    can_send=False, unchanged=False, can_resume=False, can_retry_confirmed_absent=False,
                    preparation_error='Ngày thuê trong hồ sơ hợp đồng chưa hợp lệ.', attachments=[], deliveries=[])
    resume = case in ('legacy-400', 'partial-400', 'summary-only', 'api-error', 'timeout-partial')
    count = 17 if case == 'summary-only' else 0 if case in ('timeout-empty', 'long-gallery') else 10
    status = 'failed' if case in ('partial-400', 'summary-only', 'api-error') else 'unknown'
    if state.get('resumed'):
        status, resume = 'sent', False
    definite = case in ('legacy-400', 'partial-400', 'summary-only', 'api-error')
    return dict(key=key, kind='return', label='Trả xe QA', phases=['return-1001'],
                destination_label='Nhóm cơ sở CS QA', text='Khách trả xe: QA\nHĐ: QA-RECOVERY',
                hash='a' * 64, photo_count=20 if case == 'long-gallery' else 17, video_count=0, status=status, sent_at=None,
                can_send=False, unchanged=status == 'sent', attachments=[dict(slot=f'rental-{i+1}', mime_type='image/jpeg', label=f'Ảnh hồ sơ {i+1}') for i in range(20)] if case == 'long-gallery' else [], notice_id=notice_id,
                delivery_contract_code='QA-RECOVERY', can_resume=resume,
                delivery_message_count=count, delivery_attachment_count=20 if case == 'long-gallery' else 17,
                delivery_started_at='2026-11-13T13:31:01Z', delivery_updated_at='2026-11-13T13:33:11Z',
                delivery_error='TELEGRAM_400' if definite else 'TELEGRAM_TIMEOUT',
                delivery_error_description='Bad Request: failed to get HTTP URL content' if definite else None,
                can_retry_confirmed_absent=case in ('timeout-empty', 'long-gallery'), deliveries=[dict(
                    id=notice_id, sent_at=None, message_count=count, text='NỘI DUNG GỐC ĐÃ LƯU\nHĐ: QA-RECOVERY',
                    can_retract=False, blocked_reason='Lượt gửi chưa hoàn tất.', expires_at=None, retraction_state=None)])


def events():
    items = [event()]
    if state['case'] == 'preparation-isolated':
        sent = state.get('resumed', False)
        items.append(dict(key='renewal:901:12', kind='renewal', label='Gia hạn v12 · 7–9/11', phases=['renewal-12'],
                          text='Khách gia hạn: QA\nGia hạn: 07/11/2026 18:45 - 09/11/2026 18:45\nPhí gia hạn: 400.000 đ',
                          hash='a' * 64, photo_count=0, video_count=0, status='sent' if sent else 'manual',
                          sent_at=None, can_send=not sent, unchanged=sent, attachments=[], deliveries=[], renewal_receipt_ids=[]))
    return items


def mock(route):
    if mock_contract_type_read(route):
        return
    req = route.request
    path = urlparse(req.url).path
    if path == '/api/auth/order/car-rental/901/telegram':
        if req.method == 'POST':
            body = req.post_data_json
            posts.append(copy.deepcopy(body))
            if state['case'].startswith('preparation-'):
                assert state['case'] == 'preparation-isolated'
                assert body['action'] == 'send' and body['event_key'] == 'renewal:901:12', body
                assert set(body) == {'action', 'event_key', 'hash', 'request_id'}
                assert not state.get('resumed'), 'Duplicate send attempted'
                state['resumed'] = True
                route.fulfill(json=dict(status='success', data=dict(auto_enabled=False, next_renewal_version=13, events=events())))
                return
            assert body['action'] == ('retry_confirmed_absent' if state['case'] in ('timeout-empty', 'long-gallery') else 'resume'), body
            assert body['notice_id'] == notice_id and body['event_key'] == key
            assert set(body) == {'action', 'event_key', 'hash', 'notice_id', 'request_id'} | ({'confirmed_absent'} if body['action'] == 'retry_confirmed_absent' else set())
            if body['action'] == 'retry_confirmed_absent':
                assert body['confirmed_absent'] is True
            if state['case'] == 'api-error':
                route.fulfill(status=409, json=dict(status='error', message='Lần gửi đã thay đổi; tải lại để kiểm tra.'))
                return
            assert not state.get('resumed'), 'Duplicate resume attempted'
            state['resumed'] = True
        route.fulfill(json=dict(status='success', data=dict(auto_enabled=False, next_renewal_version=13, events=events())))
        return
    if path.startswith('/api/auth/record-photos/'):
        assert req.method == 'GET'
        route.fulfill(content_type='image/png', body=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='))
        return
    if req.method != 'GET':
        unexpected.append(req.method + ' ' + path)
        route.abort()
        return
    if path == '/api/auth/order/car-rental':
        data = [dict(id=901, contract_number='QA-RECOVERY', order_status='renting', order_type='daily',
                     store_id=32, store_name='CS QA', customer_name='Khách QA', total_amount=200000, paid_amount=200000)]
    elif path in ('/api/auth/stores', '/api/auth/store-directory'):
        data = [dict(id=32, store_name='CS QA', status='opening')]
    else:
        data = []
    route.fulfill(json=dict(status='success', data=data))


with sync_playwright() as pw:
    for engine, width, height in [('chromium', 1440, 1000), ('webkit', 390, 844)]:
        browser = getattr(pw, engine).launch()
        ctx = browser.new_context(viewport=dict(width=width, height=height), timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
        ctx.add_init_script("""const qaFetch=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/auth/payment-events')return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return qaFetch.call(this,input,options);};""")
        ctx.add_cookies([dict(name='himoto_management_session', value=Path(args.cookie_file).read_text().strip(), url=args.url, httpOnly=True, sameSite='Strict')])
        ctx.route('**/api/**', mock)
        ctx.route('https://api.telegram.org/**', lambda route: (unexpected.append('REAL TELEGRAM'), route.abort()))
        page = ctx.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        for case in ('legacy-400', 'partial-400', 'summary-only', 'timeout-partial', 'timeout-empty', 'long-gallery', 'readonly', 'api-error', 'preparation-error', 'preparation-isolated'):
            state.clear()
            state['case'] = case
            before = len(posts)
            page.goto(args.url + '/contracts', wait_until='networkidle', timeout=120000)
            page.locator('.mg-status-tabs button').filter(has_text=re.compile('^Tất cả')).first.click()
            page.locator('button.mg-row-menu-trigger').filter(visible=True).first.click()
            page.get_by_role('menuitem', name='Gửi Telegram', exact=True).click()
            dialog = page.get_by_role('dialog', name='Gửi Telegram · QA-RECOVERY', exact=True)
            expect(dialog).to_be_visible()
            expect(dialog.get_by_text('Lần gửi trước dùng mã hợp đồng', exact=False)).to_have_count(0)
            if case.startswith('preparation-'):
                expect(dialog.get_by_role('alert').filter(has_text='Chưa chuẩn bị được thông báo')).to_be_visible()
                expect(dialog).to_contain_text('Ngày thuê trong hồ sơ hợp đồng chưa hợp lệ.')
                expect(dialog.get_by_role('button', name=re.compile('^Gửi (toàn bộ|lại|tiếp)'))).to_have_count(0)
                expect(dialog).not_to_contain_text('Tài khoản chưa có quyền gửi giao dịch này.')
                dialog.get_by_role('button', name='Kiểm tra trạng thái Telegram', exact=True).click()
                expect(dialog.get_by_role('alert').filter(has_text='Chưa chuẩn bị được thông báo')).to_be_visible()
                expect(dialog.get_by_role('button', name='Kiểm tra trạng thái Telegram', exact=True)).to_be_enabled()
                assert len(posts) == before
                if case == 'preparation-isolated':
                    dialog.get_by_label('Giao dịch cần gửi Telegram', exact=True).select_option('renewal:901:12')
                    expect(dialog).to_contain_text('07/11/2026 18:45 - 09/11/2026 18:45')
                    expect(dialog.get_by_role('alert').filter(has_text='Chưa chuẩn bị được thông báo')).to_have_count(0)
                    send = dialog.get_by_role('button', name=re.compile('^Gửi toàn bộ Telegram'))
                    expect(send).to_be_enabled()
                    send.click()
                    expect(dialog.get_by_role('button', name=re.compile('^Đã gửi Telegram'))).to_be_disabled()
                    assert len(posts) == before + 1
                assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
                page.screenshot(path=str(out / f'{engine}-{case}.png'))
                dialog.get_by_role('button', name='Đóng', exact=True).click()
                checks.append(dict(browser=engine, case=case, passed=True))
                print(json.dumps(checks[-1], ensure_ascii=False), flush=True)
                continue
            can_resume = case in ('legacy-400', 'partial-400', 'summary-only', 'api-error', 'timeout-partial')
            resume = dialog.get_by_role('button', name='Gửi tiếp nội dung' if case == 'summary-only' else 'Gửi tiếp phần còn thiếu', exact=True)
            if can_resume:
                if case == 'timeout-partial':
                    expect(resume).to_be_disabled()
                    dialog.get_by_role('checkbox', name='Đã kiểm tra nhóm; phần chưa được xác nhận chưa có trong nhóm', exact=True).check()
                expect(resume).to_be_enabled()
                expect(dialog).to_contain_text('Telegram đã nhận ' + ('17/17' if case == 'summary-only' else '10/17') + ' tệp.')
                expect(dialog.get_by_role('button', name='Gửi chưa hoàn tất', exact=False)).to_have_count(0)
                dialog.get_by_text('Nội dung sẽ gửi tiếp', exact=True).click()
                expect(dialog).to_contain_text('NỘI DUNG GỐC ĐÃ LƯU')
                resume.scroll_into_view_if_needed()
                page.screenshot(path=str(out / f'{engine}-{case}.png'))
                resume.click()
                if case == 'api-error':
                    expect(dialog.get_by_role('alert').filter(has_text='Lần gửi đã thay đổi')).to_be_visible()
                    expect(resume).to_be_enabled()
                else:
                    expect(dialog.get_by_role('button', name='Đã gửi Telegram', exact=False)).to_be_disabled()
                    expect(resume).to_have_count(0)
                assert len(posts) == before + 1
            else:
                expect(resume).to_have_count(0)
                expect(dialog).to_contain_text('Lần gửi bị mất phản hồi')
                if case in ('timeout-empty', 'long-gallery'):
                    retry = dialog.get_by_role('button', name='Gửi lại sau khi đối chiếu', exact=True)
                    expect(retry).to_be_disabled()
                    expect(dialog).to_contain_text('Đã dừng · Cần đối chiếu Telegram · 20:33:11')
                    expect(dialog).to_contain_text('Chờ thêm sẽ không tự gửi lại')
                    if case == 'long-gallery':
                        gallery = dialog.get_by_label('Toàn bộ ảnh và video sẽ gửi')
                        expect(gallery.locator('.mg-contract-photo-card')).to_have_count(20)
                        assert gallery.evaluate('(el) => el.compareDocumentPosition(document.querySelector(".mg-telegram-progress")) & Node.DOCUMENT_POSITION_FOLLOWING')
                    dialog.get_by_role('checkbox', name='Đã kiểm tra nhóm, chưa có tin và ảnh của giao dịch này', exact=True).check()
                    expect(retry).to_be_enabled()
                    retry.scroll_into_view_if_needed()
                    page.screenshot(path=str(out / f'{engine}-{case}.png'))
                    retry.click()
                    expect(dialog.get_by_role('button', name='Đã gửi Telegram', exact=False)).to_be_disabled()
                    assert len(posts) == before + 1
                else:
                    expect(dialog.get_by_role('button', name='Gửi lại sau khi đối chiếu', exact=True)).to_have_count(0)
                    assert len(posts) == before
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
            dialog.get_by_role('button', name='Đóng', exact=True).click()
            checks.append(dict(browser=engine, case=case, passed=True))
            print(json.dumps(checks[-1], ensure_ascii=False), flush=True)
        browser.close()
assert not errors, errors
assert not unexpected, unexpected
report = dict(passed=len(checks), checks=checks, javascriptErrors=errors, interceptedMutations=len(posts), realTelegramRequests=0, realBusinessWrites=0)
(out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
