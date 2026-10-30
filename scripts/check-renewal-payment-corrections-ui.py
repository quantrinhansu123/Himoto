"""Renewal payment correction UI; all API mutations are fixtures, never business writes."""
import argparse
import copy
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3027')
parser.add_argument('--cookie-file', required=True)
parser.add_argument('--output', default='.backups/renewal-payment-corrections/ui')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
expect.set_options(timeout=30000)
state, checks, errors, writes, unexpected = {}, [], [], [], []
accounts = [dict(id=1, kind='cash', store_id=32, owner_type='', label='Két QA'),
            dict(id=1, kind='bank', store_id=32, owner_type='personal', label='CK cá nhân QA'),
            dict(id=2, kind='bank', store_id=0, owner_type='company', label='CK công ty QA')]
labels = {'cash': 'Tiền mặt', 'transfer': 'CK tài khoản cá nhân', 'company_transfer': 'CK tài khoản công ty'}


def context():
    result = dict(id=901, code='QA-RENEWAL', status='renting', store_id=32, revision='10',
                total_amount=state['fee'], paid_amount=1500000, remaining=max(0,state['fee']-1500000), deposit_paid=1000000,
                deposit_refunded=0, deposit_held=1000000, company_paid_amount=1500000 if state['method'] == 'company_transfer' else 0,
                company_payment_count=1 if state['method'] == 'company_transfer' else 0, end_date='2026-11-22T12:00:00Z',
                accounts=accounts, items=[], history=[dict(id=51, type='in', deposit=False, amount=1500000,
                paid_at='2026-10-28T13:00:00Z', method=labels[state['method']], payment_method=state['method'],
                account_id=2 if state['method'] == 'company_transfer' else 1, account='Tài khoản QA',
                note='Gia hạn QA', actor='Nhân viên QA', revision=str(state['revision']),
                status='approved',renewal_fee_editable=True,
                renewal=dict(version=2, amount=state['fee'], license='QA-1', vehicle_name='Xe QA', before_return_at=state['start'], return_at=state['end']))])
    if state.get('collision'):
        old=copy.deepcopy(result['history'][0])
        old.update(id=52,amount=900000,status='cancelled',renewal_fee_editable=False)
        old['renewal']['amount']=900000
        result['history'].append(old)
    return result


def mock(route):
    if mock_contract_type_read(route):
        return
    req = route.request
    endpoint = urlparse(req.url).path
    if req.method == 'PATCH' and endpoint == '/api/auth/order/car-rental/901/renewal-payments':
        body = req.post_data_json
        writes.append(copy.deepcopy(body))
        assert set(body) <= {'request_id', 'transaction_id', 'revision', 'method', 'account_id', 'reason','amount','before_return_at','return_at'}
        assert body['transaction_id'] == 51 and body['reason']
        if state.get('fail_once'):
            state['fail_once'] = False
            route.fulfill(status=409, json=dict(status='error', message='QA phiếu vừa thay đổi. Tải lại để kiểm tra.'))
            return
        if body['request_id'] not in state['applied']:
            assert body['revision'] == str(state['revision'])
            state['applied'].append(body['request_id'])
            state['method'] = body['method']
            state['fee'] = int(body.get('amount',state['fee']))
            state['start'] = body.get('before_return_at',state['start'])
            state['end'] = body.get('return_at',state['end'])
            state['revision'] += 1
            if state.get('lose_response'):
                state['lose_response'] = False
                route.abort('failed')
                return
        route.fulfill(json=dict(status='success', data=context()))
        return
    if req.method != 'GET':
        unexpected.append(req.method + ' ' + endpoint)
        route.abort()
        return
    if endpoint == '/api/auth/order/car-rental/901/payments':
        data = context()
    elif endpoint == '/api/auth/order/car-rental/901/telegram':
        data = dict(auto_enabled=False, next_renewal_version=3, events=[dict(key='renewal:901:2', kind='renewal',
                    label='Gia hạn v2 QA', phases=['renewal-2'], destination_label='Nhóm QA',
                    text=f"Gia hạn QA\nTừ {state['start']} đến {state['end']}\nPhí {state['fee']}\nHình thức thanh toán: " + labels[state['method']], hash='a' * 64,renewal_receipt_ids=[51],
                    photo_count=0, status='manual', can_send=True, unchanged=False, attachments=[], deliveries=[])])
        if state.get('collision'):
            data['events'].append(dict(key='renewal-receipt:901:52',kind='renewal',label='Gia hạn cũ · Phiếu thu đã hủy',phases=['renewal-receipt-52'],
                text='Gia hạn cũ · 900.000 đ',hash='b'*64,photo_count=0,status='manual',can_send=False,unchanged=False,
                renewal_receipt_ids=[52],renewal_receipts_cancelled=True,attachments=[],deliveries=[]))
    elif endpoint == '/api/auth/order/car-rental':
        data = [dict(id=901, contract_number='QA-RENEWAL', order_status='renting', order_type='daily',
                     store_id=32, store_name='CS QA', customer_name='Khách QA', total_amount=1500000, paid_amount=1500000)]
    elif endpoint in ('/api/auth/stores', '/api/auth/store-directory'):
        data = [dict(id=32, store_name='CS QA', status='opening')]
    else:
        data = []
    route.fulfill(json=dict(status='success', data=data))


with sync_playwright() as pw:
    for engine, width in [('chromium', 1440), ('webkit', 390)]:
        state.clear()
        state.update(method='cash', revision=1, applied=[], fail_once=True,fee=1500000,start='2026-10-23T08:04:00Z',end='2026-10-27T08:04:00Z')
        browser = getattr(pw, engine).launch()
        ctx = browser.new_context(viewport=dict(width=width, height=950), timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
        ctx.add_init_script("const f=fetch;window.fetch=async function(i,o){const u=new URL(typeof i==='string'?i:i.url,location.href);if(u.pathname==='/api/auth/payment-events')return Response.json({status:'success',data:[]});const r=await f.call(this,i,o);if(u.pathname.endsWith('/payments')&&(!o?.method||o.method==='GET'))await new Promise(done=>setTimeout(done,250));return r;};")
        ctx.add_cookies([dict(name='himoto_management_session', value=Path(args.cookie_file).read_text().strip(), url=args.url, httpOnly=True, sameSite='Strict')])
        ctx.route('**/api/**', mock)
        ctx.route('https://api.telegram.org/**', lambda route: (unexpected.append('REAL TELEGRAM'), route.abort()))
        page = ctx.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(args.url + '/contracts', wait_until='networkidle', timeout=120000)
        page.locator('button.mg-row-menu-trigger').filter(visible=True).first.click()
        page.get_by_role('menuitem', name='Gửi Telegram', exact=True).click()
        dialog = page.get_by_role('dialog', name='Gửi Telegram · QA-RENEWAL', exact=True)
        expect(dialog).to_be_visible()
        dialog.get_by_role('button', name='Sửa thời gian, phí / thanh toán', exact=True).click()
        editor = dialog.get_by_role('group', name='Sửa kỳ gia hạn & thanh toán', exact=True)
        expect(editor).to_contain_text('1.500.000')
        editor.get_by_label('Hình thức thanh toán mới', exact=True).select_option('transfer')
        expect(editor.get_by_label('Tài khoản nhận mới', exact=True)).to_have_value('bank:1')
        editor.get_by_label('Lý do sửa thanh toán', exact=True).fill('Chọn nhầm két QA')
        editor.get_by_role('button', name='Lưu sửa thông tin', exact=True).click()
        expect(editor.get_by_role('alert')).to_contain_text('QA phiếu vừa thay đổi')
        expect(editor.get_by_label('Hình thức thanh toán mới', exact=True)).to_have_value('transfer')
        editor.get_by_role('button', name='Lưu sửa thông tin', exact=True).click()
        expect(dialog.locator('.mg-telegram-preview')).to_contain_text('CK tài khoản cá nhân')
        assert len(state['applied']) == 1
        checks.append(f'{engine}: corrects cash to a same-ID personal bank, keeps inputs after 409 and refreshes Telegram preview without sending')
        dialog.get_by_role('button', name='Sửa thời gian, phí / thanh toán', exact=True).click()
        expect(editor.get_by_label('Hình thức thanh toán mới', exact=True)).to_have_value('transfer')
        editor.get_by_label('Hình thức thanh toán mới', exact=True).select_option('company_transfer')
        editor.get_by_label('Lý do sửa thanh toán', exact=True).fill('Đối chiếu tài khoản QA')
        state['lose_response'] = True
        editor.get_by_role('button', name='Lưu sửa thông tin', exact=True).click()
        expect(editor.get_by_role('button', name='Thử lại lần sửa này', exact=True)).to_be_visible()
        expect(editor.get_by_label('Hình thức thanh toán mới', exact=True)).to_be_disabled()
        prior = writes[-1]
        editor.get_by_role('button', name='Thử lại lần sửa này', exact=True).click()
        expect(dialog.locator('.mg-telegram-preview')).to_contain_text('CK tài khoản công ty')
        assert writes[-1] == prior and len(state['applied']) == 2
        checks.append(f'{engine}: lost response retries the identical correction UUID and payload without duplicate edits')
        dialog.get_by_role('button', name='Sửa thời gian, phí / thanh toán', exact=True).click()
        expect(editor).to_contain_text('Thời gian gia hạn mới: 4 ngày')
        editor.get_by_label('Từ ngày giờ gia hạn', exact=True).fill('2026-10-22')
        editor.get_by_label('Phí gia hạn (VNĐ)', exact=True).fill('1800000')
        editor.get_by_label('Lý do sửa thanh toán', exact=True).fill('QA sửa kỳ và phí; giữ nguyên bill')
        editor.get_by_role('button', name='Lưu sửa thông tin', exact=True).click()
        expect(dialog.locator('.mg-telegram-preview')).to_contain_text('1800000')
        assert writes[-1]['amount']=='1800000' and writes[-1]['before_return_at']=='2026-10-22T08:04:00.000Z'
        assert context()['history'][0]['amount']==1500000
        checks.append(f'{engine}: edits period and fee together, refreshes preview and preserves the actual receipt amount')
        page.set_viewport_size(dict(width=320, height=812))
        dialog.get_by_role('button', name='Sửa thời gian, phí / thanh toán', exact=True).click()
        expect(editor.get_by_label('Hình thức thanh toán mới', exact=True)).to_have_value('company_transfer')
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
        for width in [320,375,390]:
            page.set_viewport_size(dict(width=width,height=812))
            box=editor.bounding_box()
            title=editor.locator('legend').first.bounding_box()
            assert title['height']<50 and title['width']>200
            for field in editor.locator('input,select').all():
                bounds=field.bounding_box()
                if bounds:
                    assert bounds['x']>=box['x']-1 and bounds['x']+bounds['width']<=box['x']+box['width']+1
        page.set_viewport_size(dict(width=320,height=812))
        editor.screenshot(path=str(out / f'{engine}-editor-320.png'))
        editor.get_by_role('button', name='Đóng sửa thông tin', exact=True).click()
        state['collision']=True
        dialog.get_by_role('button',name='Làm mới nội dung và ảnh',exact=True).click()
        dialog.get_by_label('Giao dịch cần gửi Telegram',exact=True).select_option('renewal-receipt:901:52')
        expect(dialog).to_contain_text('Phiếu thu của kỳ này đã hủy.')
        expect(dialog.get_by_role('button',name='Gửi toàn bộ Telegram',exact=False)).to_be_disabled()
        dialog.get_by_role('button', name='Sửa thời gian, phí / thanh toán', exact=True).click()
        expect(editor).to_contain_text('Phiếu #52')
        expect(editor.get_by_label('Phí gia hạn (VNĐ)',exact=True)).to_be_disabled()
        expect(editor.get_by_label('Phí gia hạn (VNĐ)',exact=True)).to_have_value('900000')
        expect(editor.get_by_label('Phiếu thu cần sửa',exact=True)).to_have_count(0)
        editor.get_by_role('button', name='Đóng sửa thông tin', exact=True).click()
        state['collision']=False
        checks.append(f'{engine}: reused versions select the exact historical receipt; cancelled voucher is labelled, fee locked, sending disabled')
        dialog.get_by_role('button', name='Đóng', exact=True).click()
        page.locator('button.mg-row-menu-trigger').filter(visible=True).first.click()
        page.get_by_role('menuitem', name='Thanh toán', exact=True).click()
        payment = page.get_by_role('dialog', name='Thanh toán hợp đồng QA-RENEWAL', exact=True)
        payment.get_by_role('button', name='Sửa thời gian, phí / thanh toán', exact=True).click()
        editor = payment.get_by_role('group', name='Sửa kỳ gia hạn & thanh toán', exact=True)
        expect(editor).to_contain_text('1.500.000')
        editor.get_by_label('Hình thức thanh toán mới', exact=True).select_option('cash')
        editor.get_by_label('Lý do sửa thanh toán', exact=True).fill('Đối chiếu lại két QA')
        editor.get_by_role('button', name='Lưu sửa thông tin', exact=True).click()
        expect(payment.get_by_role('button', name='Sửa thời gian, phí / thanh toán', exact=True)).to_be_visible()
        assert state['method'] == 'cash' and len(state['applied']) == 4
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
        checks.append(f'{engine}: correction works inside payment history at 320px without submitting the surrounding payment form or changing fee/dates')
        ctx.unroute_all(behavior='ignoreErrors')
        browser.close()

assert not errors, errors
assert not unexpected, unexpected
report = dict(passed=len(checks), checks=checks, javascriptErrors=errors, simulatedPatches=len(writes), realBusinessWrites=0, realTelegramRequests=0)
(out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
