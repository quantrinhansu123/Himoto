"""Telegram recovery UI; every API/provider request is intercepted."""
import argparse
import copy
import json
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
    resume = case in ('legacy-400', 'partial-400', 'summary-only', 'api-error')
    count = 17 if case == 'summary-only' else 0 if case == 'timeout-empty' else 10
    status = 'failed' if case in ('partial-400', 'summary-only', 'api-error') else 'unknown'
    if state.get('resumed'):
        status, resume = 'sent', False
    return dict(key=key, kind='return', label='Trả xe QA', phases=['return-1001'],
                destination_label='Nhóm cơ sở CS QA', text='Khách trả xe: QA\nHĐ: QA-RECOVERY',
                hash='a' * 64, photo_count=17, video_count=0, status=status, sent_at=None,
                can_send=False, unchanged=status == 'sent', attachments=[], notice_id=notice_id,
                delivery_contract_code='QA-RECOVERY', can_resume=resume,
                delivery_message_count=count, delivery_attachment_count=17,
                delivery_error='TELEGRAM_400' if resume else 'TELEGRAM_TIMEOUT',
                delivery_error_description='Bad Request: failed to get HTTP URL content' if resume else None,
                can_retry_confirmed_absent=case == 'timeout-empty', deliveries=[dict(
                    id=notice_id, sent_at=None, message_count=count, text='NỘI DUNG GỐC ĐÃ LƯU\nHĐ: QA-RECOVERY',
                    can_retract=False, blocked_reason='Lượt gửi chưa hoàn tất.', expires_at=None, retraction_state=None)])


def mock(route):
    if mock_contract_type_read(route):
        return
    req = route.request
    path = urlparse(req.url).path
    if path == '/api/auth/order/car-rental/901/telegram':
        if req.method == 'POST':
            body = req.post_data_json
            posts.append(copy.deepcopy(body))
            assert body['action'] == 'resume', body
            assert body['notice_id'] == notice_id and body['event_key'] == key
            assert set(body) == {'action', 'event_key', 'hash', 'notice_id', 'request_id'}
            if state['case'] == 'api-error':
                route.fulfill(status=409, json=dict(status='error', message='Lần gửi đã thay đổi; tải lại để kiểm tra.'))
                return
            assert not state.get('resumed'), 'Duplicate resume attempted'
            state['resumed'] = True
        route.fulfill(json=dict(status='success', data=dict(auto_enabled=False, next_renewal_version=2, events=[event()])))
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
        for case in ('legacy-400', 'partial-400', 'summary-only', 'timeout-partial', 'timeout-empty', 'readonly', 'api-error'):
            state.clear()
            state['case'] = case
            before = len(posts)
            page.goto(args.url + '/contracts', wait_until='networkidle', timeout=120000)
            page.locator('button.mg-row-menu-trigger').filter(visible=True).first.click()
            page.get_by_role('menuitem', name='Gửi Telegram', exact=True).click()
            dialog = page.get_by_role('dialog', name='Gửi Telegram · QA-RECOVERY', exact=True)
            expect(dialog).to_be_visible()
            expect(dialog.get_by_text('Lần gửi trước dùng mã hợp đồng', exact=False)).to_have_count(0)
            can_resume = case in ('legacy-400', 'partial-400', 'summary-only', 'api-error')
            resume = dialog.get_by_role('button', name='Gửi tiếp nội dung' if case == 'summary-only' else 'Gửi tiếp phần còn thiếu', exact=True)
            if can_resume:
                expect(resume).to_be_enabled()
                expect(dialog).to_contain_text('Telegram đã nhận ' + ('17/17' if case == 'summary-only' else '10/17') + ' tệp.')
                expect(dialog.get_by_role('button', name='Gửi chưa hoàn tất', exact=False)).to_be_disabled()
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
                if case == 'timeout-empty':
                    expect(dialog.get_by_role('button', name='Gửi lại sau khi đối chiếu', exact=True)).to_be_disabled()
                else:
                    expect(dialog.get_by_role('button', name='Gửi lại sau khi đối chiếu', exact=True)).to_have_count(0)
                assert len(posts) == before
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
            dialog.get_by_role('button', name='Đóng', exact=True).click()
            checks.append(dict(browser=engine, case=case, passed=True))
        ctx.unroute_all(behavior='ignoreErrors')
        ctx.close()
        browser.close()
assert not errors, errors
assert not unexpected, unexpected
report = dict(passed=len(checks), checks=checks, javascriptErrors=errors, interceptedMutations=len(posts), realTelegramRequests=0, realBusinessWrites=0)
(out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
