"""Synthetic payment UI QA. Every /api/** request is intercepted; zero business writes."""
import argparse
import copy
import json
import re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3009')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='.backups/contract-payments/ui')
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
checks, errors, unexpected, submissions = [], [], [], []
mode = {'lost': False, 'conflict': False, 'company': True}
receipts = {}
records = [dict(id=i, contract_number=f'QA-{i}', status='renting', customer_id=1,
    customer_name='Khách QA', store_id=23 if i == 1 else 31, total_amount='1000', paid_amount='0',
    company_paid_amount=0, company_payment_count=0, start_date='2026-01-01', draft_revision='1', vehicles=[])
    for i in [1, 2]]
history = {1: [], 2: []}
items = {number: [dict(id=number*100+1,vehicle_id=100,name='Xe QA A',license='QA-A',revision='1',return_at='2026-01-10T10:01:00+07:00',renewal_amount=500),
    dict(id=number*100+2,vehicle_id=101,name='Xe QA B',license='QA-B',revision='1',return_at='2026-02-10T10:01:00+07:00',renewal_amount=0)] for number in [1,2]}

def context_for(number):
    row = records[number - 1]
    accounts = [dict(id=1, label='Két tiền mặt QA', kind='cash', store_id=row['store_id'], owner_type=''),
        dict(id=2, label='Ngân hàng QA cá nhân', kind='bank', store_id=row['store_id'], owner_type='unknown',bank_name='MSB',account_number='000000000001',owner_name='QA PERSONAL')]
    if mode['company']:
        accounts.append(dict(id=3, label='Ngân hàng QA · QA company · 000000000000', kind='bank', store_id=0, owner_type='company',bank_name='VietinBank',account_number='000000000000',owner_name='QA COMPANY'))
    return dict(id=number, code=row['contract_number'], status=row['status'], store_id=row['store_id'], revision=row['draft_revision'],
        total_amount=int(row['total_amount']), paid_amount=int(row['paid_amount']), remaining=max(int(row['total_amount'])-int(row['paid_amount']),0),
        company_paid_amount=row['company_paid_amount'], company_payment_count=row['company_payment_count'], accounts=accounts, history=history[number],
        items=items[number],end_date=max(item['return_at'] for item in items[number]))

def mock_api(route):
    request = route.request
    endpoint = urlparse(request.url).path
    match = re.fullmatch(r'/api/auth/order/car-rental/(\d+)/payments', endpoint)
    if match:
        number = int(match[1])
        if request.method == 'GET':
            route.fulfill(json={'status': 'success', 'data': context_for(number)})
            return
        if request.method == 'POST':
            payload = request.post_data_json
            submissions.append(copy.deepcopy(payload))
            if mode['conflict']:
                mode['conflict'] = False
                records[number-1]['draft_revision'] = str(int(records[number-1]['draft_revision'])+1)
                route.fulfill(status=409, json={'message': 'Hợp đồng đã thay đổi. Tải lại thông tin.'})
                return
            replayed = payload['request_id'] in receipts
            if replayed:
                old, transaction_id = receipts[payload['request_id']]
                assert payload == old, 'Lost response must reuse exact payment request'
            else:
                assert payload['revision'] == records[number-1]['draft_revision']
                is_renewal = payload.get('purpose') == 'renewal'
                assert set(payload) == {'request_id','revision','amount','method','account_id','paid_at','note'} | ({'purpose','item_id','item_revision','return_at'} if is_renewal else set())
                assert int(payload['amount']) > 0
                if not is_renewal:
                    assert int(payload['amount']) <= context_for(number)['remaining']
                transaction_id = 900+len(receipts)
                receipts[payload['request_id']] = (copy.deepcopy(payload), transaction_id)
                row = records[number-1]
                renewal = None
                if is_renewal:
                    selected = next(item for item in items[number] if item['id']==payload['item_id'])
                    assert selected['revision'] == payload['item_revision']
                    renewal = dict(license=selected['license'],vehicle_name=selected['name'],before_return_at=selected['return_at'],return_at=payload['return_at']+':00+07:00')
                    selected['return_at'] = renewal['return_at']
                    selected['renewal_amount'] += int(payload['amount'])
                    selected['revision'] = str(int(selected['revision'])+1)
                    row['total_amount'] = str(int(row['total_amount'])+int(payload['amount']))
                    row['end_date'] = max(item['return_at'] for item in items[number])
                row['paid_amount'] = str(int(row['paid_amount'])+int(payload['amount']))
                row['draft_revision'] = str(int(row['draft_revision'])+1)
                if payload['method'] == 'company_transfer':
                    assert payload['account_id'] == 3
                    row['company_paid_amount'] += int(payload['amount'])
                    row['company_payment_count'] += 1
                history[number].insert(0, dict(id=transaction_id, amount=int(payload['amount']), paid_at='2026-01-01T03:01:00Z',
                    method={'cash':'Tiền mặt','transfer':'Chuyển khoản','company_transfer':'CK tài khoản công ty'}[payload['method']], account='Tài khoản QA', note=payload['note'], actor='QA',renewal=renewal))
            if mode['lost']:
                mode['lost'] = False
                route.abort('failed')
            else:
                route.fulfill(json={'status': 'success', 'data': dict(context=context_for(number), transaction_id=transaction_id, replayed=replayed, company_transfer=payload['method']=='company_transfer')})
            return
    if request.method != 'GET':
        unexpected.append(endpoint)
        route.abort('blockedbyclient')
        return
    if endpoint in ['/api/session', '/api/auth/me']:
        route.fulfill(json={'user': {'id':143,'name':'QA'}})
        return
    transactions = [dict(id=item['id'], type='in', created_at=item['paid_at'], user_id=143, user_name='QA', store_id=records[number-1]['store_id'],
        store_name='Cơ sở QA', amount=item['amount'], order_id=number, contract_code=f'QA-{number}', payment_method=item['method'], account=item['account'], reason='Thanh toán hợp đồng', content=item['note'])
        for number, items in history.items() for item in items]
    endpoints = {'/api/auth/order/car-rental': records, '/api/auth/customers':[dict(id=1,name='Khách QA',status='active')],
        '/api/auth/stores':[dict(id=23,store_name='Cơ sở QA A',status='opening'),dict(id=31,store_name='Cơ sở QA B',status='opening')],
        '/api/auth/vehicle/vehicles':[], '/api/auth/hr/staff':[], '/api/auth/transactions':transactions}
    if endpoint not in endpoints:
        unexpected.append(endpoint)
        route.abort('blockedbyclient')
        return
    route.fulfill(json={'status':'success','data':copy.deepcopy(endpoints[endpoint])})

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    ctx = browser.new_context(viewport={'width':1440,'height':1000}, timezone_id='Asia/Ho_Chi_Minh')
    ctx.add_cookies([dict(name='himoto_management_session',value=Path(args.session_cookie_file).read_text(encoding='utf-8').strip(),url=args.url,httpOnly=True,sameSite='Strict')])
    ctx.route('**/api/**', mock_api)
    ctx.route('https://img.vietqr.io/**',lambda route:route.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="white"/><path d="M20 20h60v60H20zM160 20h60v60h-60zM20 160h60v60H20zM110 110h50v50h-50z" fill="black"/><text x="95" y="210" font-size="12">QA ONLY</text></svg>'))
    page = ctx.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url+'/contracts',wait_until='domcontentloaded',timeout=120000)

    def open_payment(number):
        page.get_by_role('button',name=f'Thanh toán QA-{number}',exact=True).click()
        dialog = page.get_by_role('dialog')
        expect(dialog.get_by_label('Nội dung thu / chuyển khoản')).to_have_value(f'Gia hạn hợp đồng_QA-{number}')
        return dialog

    def confirm_transfer(dialog):
        before = len(submissions)
        original = copy.deepcopy(records)
        dialog.get_by_role('button',name='Hiện mã QR chuyển khoản',exact=True).click()
        expect(dialog.get_by_role('heading',name='Quét QR để chuyển khoản',exact=True)).to_be_visible()
        assert len(submissions)==before and records==original, 'Opening QR must not save income, renew a vehicle or navigate VAT'
        expect(dialog.get_by_role('button',name='Xác nhận đã nhận tiền',exact=True)).to_be_disabled()
        qr_url=dialog.get_by_role('img').get_attribute('src')
        assert 'amount=' in qr_url and 'addInfo=Gia+han+hop+dong+QA' in qr_url
        if page.viewport_size['width']==1440:
            dialog.get_by_role('button',name='Quay lại',exact=True).click()
            assert len(submissions)==before
            dialog.get_by_role('button',name='Hiện mã QR chuyển khoản',exact=True).click()
        dialog.evaluate('(el)=>el.scrollTop=0')
        assert dialog.evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
        if page.viewport_size['width']==375:
            qr_box=dialog.get_by_role('img').bounding_box()
            footer_box=dialog.locator('.mg-dialog-footer').bounding_box()
            assert qr_box['y']>=0 and qr_box['y']+qr_box['height']<=footer_box['y'], 'QR must fit above mobile footer'
        page.screenshot(path=str(output/('mobile-transfer-qr.png' if page.viewport_size['width']==375 else 'desktop-transfer-qr.png')),full_page=True)
        dialog.get_by_role('checkbox',name=re.compile('Tôi đã kiểm tra tài khoản')).check()
        dialog.get_by_role('button',name='Xác nhận đã nhận tiền',exact=True).click()

    dialog = open_payment(1)
    expect(dialog.get_by_label('Tài khoản nhận')).to_have_value('1')
    amount_input = dialog.get_by_label('Số tiền thu (VNĐ)')
    amount_input.press_sequentially('1000000')
    expect(amount_input).to_have_value('1.000.000')
    amount_input.evaluate('(el)=>el.setSelectionRange(3,3)')
    amount_input.press('Backspace')
    expect(amount_input).to_have_value('100.000')
    amount_input.evaluate('(el)=>el.setSelectionRange(1,1)')
    amount_input.press('Delete')
    expect(amount_input).to_have_value('10.000')
    amount_input.fill('1.000')
    expect(amount_input).to_have_value('1.000')
    dialog.get_by_label('Số tiền thu (VNĐ)').fill('1001')
    expect(amount_input).to_have_value('1.001')
    dialog.get_by_role('button',name='Ghi nhận thanh toán',exact=True).click()
    expect(dialog.get_by_role('alert')).to_contain_text('số tiền còn thiếu')
    assert len(submissions) == 0
    for amount in ['200','300']:
        dialog.get_by_label('Số tiền thu (VNĐ)').fill(amount)
        dialog.get_by_role('button',name='Ghi nhận thanh toán',exact=True).click()
        expect(dialog.get_by_label('Số tiền thu (VNĐ)')).to_have_value('')
    expect(dialog.locator('.mg-payment-totals')).to_contain_text('500 đ')
    expect(dialog.get_by_role('heading',name='Lịch sử phiếu Thu (2)')).to_be_visible()
    assert len(receipts) == 2 and submissions[0]['request_id'] != submissions[1]['request_id']
    assert all(item['note']=='Gia hạn hợp đồng_QA-1' for item in submissions)
    page.screenshot(path=str(output/'desktop-payment.png'),full_page=True)
    checks.append('multiple partial cash payments, automatic contract content, totals/history updated, overpayment blocked without request')

    mode['lost'] = True
    dialog.get_by_label('Số tiền thu (VNĐ)').fill('100')
    dialog.get_by_role('button',name='Ghi nhận thanh toán',exact=True).click()
    expect(dialog.get_by_role('button',name='Thử lại lần thu này')).to_be_enabled()
    expect(dialog.get_by_label('Số tiền thu (VNĐ)')).to_be_disabled()
    lost_id = submissions[-1]['request_id']
    dialog.get_by_role('button',name='Đóng',exact=True).click()
    page.reload(wait_until='domcontentloaded')
    dialog = open_payment(1)
    expect(dialog.get_by_label('Số tiền thu (VNĐ)')).to_have_value('100')
    dialog.get_by_role('button',name='Thử lại lần thu này').click()
    expect(dialog.get_by_label('Số tiền thu (VNĐ)')).to_have_value('')
    assert submissions[-1]['request_id'] == lost_id and len(receipts)==3
    checks.append('lost response survives close/reload; frozen input and identical UUID replay confirm one income only')

    mode['conflict'] = True
    dialog.get_by_label('Hình thức thanh toán',exact=True).select_option('transfer')
    expect(dialog.get_by_label('Tài khoản nhận')).to_have_value('2')
    dialog.get_by_label('Số tiền thu (VNĐ)').fill('100')
    confirm_transfer(dialog)
    expect(dialog.get_by_role('alert')).to_contain_text('đã thay đổi')
    expect(dialog.get_by_label('Số tiền thu (VNĐ)')).to_be_enabled()
    assert len(receipts)==3
    confirm_transfer(dialog)
    expect(dialog.get_by_label('Số tiền thu (VNĐ)')).to_have_value('')
    assert len(receipts)==4
    checks.append('stale revision rejects without credit; fresh reload permits ordinary bank payment to correct account')

    dialog.get_by_role('button',name='Đóng',exact=True).click()
    dialog = open_payment(2)
    page.set_viewport_size({'width':375,'height':812})
    dialog.get_by_label('Hình thức thanh toán',exact=True).select_option('company_transfer')
    expect(dialog.get_by_label('Tài khoản nhận')).to_have_value('3')
    dialog.get_by_label('Số tiền thu (VNĐ)').fill('400')
    page.screenshot(path=str(output/'mobile-company-payment.png'),full_page=True)
    assert dialog.evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
    box = dialog.bounding_box()
    assert box['x'] >= 0 and box['x']+box['width'] <= 375, box
    confirm_transfer(dialog)
    expect(page).to_have_url(re.compile(r'/contracts/vat\?contract_id=2$'))
    expect(page.get_by_role('heading',name='Hợp đồng VAT',exact=False)).to_be_visible()
    expect(page.get_by_role('button',name='Thanh toán QA-2',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Thanh toán QA-1',exact=True)).to_have_count(0)
    page.screenshot(path=str(output/'mobile-vat.png'),full_page=True)
    page.goto(args.url+'/contracts',wait_until='domcontentloaded')
    expect(page.get_by_role('button',name='Thanh toán QA-1',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Thanh toán QA-2',exact=True)).to_be_visible()
    checks.append('shared company account works from other branch; success navigates VAT with matching row; common list retains both contracts; mobile no overflow')

    mode['company'] = False
    dialog = open_payment(1)
    dialog.get_by_label('Hình thức thanh toán',exact=True).select_option('company_transfer')
    expect(dialog.get_by_text('Chưa có tài khoản công ty được cấu hình.',exact=False)).to_be_visible()
    expect(dialog.get_by_role('button',name='Hiện mã QR chuyển khoản',exact=True)).to_be_disabled()
    dialog.get_by_role('button',name='Đóng',exact=True).click()
    mode['company'] = True
    checks.append('missing company bank configuration blocks submission with visible explanation')

    page.set_viewport_size({'width':1440,'height':1000})
    page.goto(args.url+'/cashbook',wait_until='domcontentloaded')
    table = page.locator('#cashbook-income table')
    expect(table.locator('thead th')).to_have_count(12)
    expect(table.locator('tbody tr')).to_have_count(5)
    expect(table).to_contain_text('Gia hạn hợp đồng_QA-2')
    expect(table).to_contain_text('CK tài khoản công ty')
    page.screenshot(path=str(output/'cashbook-income.png'),full_page=True)
    table.get_by_role('link',name='QA-2',exact=True).click()
    expect(page).to_have_url(re.compile(r'/contracts\?contract_id=2$'))
    expect(page.get_by_role('button',name='Thanh toán QA-2',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Thanh toán QA-1',exact=True)).to_have_count(0)
    checks.append('cashbook has twelve columns with income amount, contract, method, account and content; contract link applies exact ID filter')
    records[0]['total_amount']='1050000'
    records[0]['paid_amount']='20900000'
    page.goto(args.url+'/contracts',wait_until='domcontentloaded')
    dialog = open_payment(1)
    expect(dialog.get_by_label('Nghiệp vụ',exact=True)).to_have_value('renewal')
    expect(dialog.get_by_role('button',name='Thu tiền và gia hạn',exact=True)).to_be_visible()
    dialog.get_by_label('Xe cần gia hạn',exact=True).select_option('102')
    dialog.get_by_label('Số tiền thu (VNĐ)').fill('1.000.000')
    expect(dialog.get_by_label('Số tiền thu (VNĐ)')).to_have_value('1.000.000')
    dialog.get_by_label('Ngày hẹn trả mới',exact=True).fill('2026-02-10T10:01')
    before_requests = len(submissions)
    dialog.get_by_role('button',name='Thu tiền và gia hạn',exact=True).click()
    expect(dialog.get_by_role('alert')).to_contain_text('sau ngày hẹn trả hiện tại')
    assert len(submissions)==before_requests
    original_other = copy.deepcopy(items[1][0])
    dialog.get_by_label('Ngày hẹn trả mới',exact=True).fill('2026-03-10T10:01')
    dialog.evaluate('(el)=>{document.activeElement.blur();el.scrollTop=0}')
    page.screenshot(path=str(output/'desktop-renewal.png'),full_page=True)
    mode['lost']=True
    dialog.get_by_role('button',name='Thu tiền và gia hạn',exact=True).click()
    expect(dialog.get_by_role('button',name='Thử lại lần thu này')).to_be_enabled()
    renewal_id = submissions[-1]['request_id']
    dialog.get_by_role('button',name='Đóng',exact=True).click()
    page.reload(wait_until='domcontentloaded')
    dialog = open_payment(1)
    expect(dialog.get_by_label('Nghiệp vụ',exact=True)).to_have_value('renewal')
    expect(dialog.get_by_label('Xe cần gia hạn',exact=True)).to_have_value('102')
    expect(dialog.get_by_label('Ngày hẹn trả mới',exact=True)).to_have_value('2026-03-10T10:01')
    expect(dialog.get_by_label('Ngày hẹn trả mới',exact=True)).to_be_disabled()
    expect(dialog.get_by_label('Số tiền thu (VNĐ)')).to_have_value('1.000.000')
    dialog.get_by_role('button',name='Thử lại lần thu này').click()
    expect(dialog.get_by_label('Số tiền thu (VNĐ)')).to_have_value('')
    assert submissions[-1]['request_id']==renewal_id and len(receipts)==6
    assert submissions[-1]['amount']=='1000000'
    assert records[0]['total_amount']=='2050000' and records[0]['paid_amount']=='21900000'
    assert items[1][0]==original_other and items[1][1]['return_at']=='2026-03-10T10:01:00+07:00'
    expect(dialog.locator('.mg-payment-history')).to_contain_text('Gia hạn QA-B đến')
    checks.append('grouped money supports typing, paste and middle edits; raw integer payload and formatted amount survive lost response/reload; renewal charges once and other vehicle unchanged')
    dialog.get_by_label('Xe cần gia hạn',exact=True).select_option('101')
    dialog.get_by_label('Ngày hẹn trả mới',exact=True).fill('2026-04-10T10:01')
    dialog.get_by_label('Số tiền thu (VNĐ)').fill('500')
    dialog.get_by_label('Hình thức thanh toán',exact=True).select_option('company_transfer')
    page.set_viewport_size({'width':375,'height':812})
    box=dialog.bounding_box()
    assert box['x']>=0 and box['x']+box['width']<=375 and dialog.evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
    page.screenshot(path=str(output/'mobile-renewal.png'),full_page=True)
    confirm_transfer(dialog)
    expect(page).to_have_url(re.compile(r'/contracts/vat\?contract_id=1$'))
    assert records[0]['company_payment_count']==1 and records[0]['company_paid_amount']==500
    assert len(receipts)==7 and submissions[-1]['note']=='Gia hạn hợp đồng_QA-1'
    checks.append('multiple renewed vehicles accept independent fees/new dates; company renewal navigates VAT, keeps automatic content; mobile form fits viewport')
    checks.append('ordinary/company transfers show QR with account/amount/content; open/back creates no income, renewal or VAT; received-money confirmation required before POST')
    assert not unexpected, unexpected
    assert not errors, errors
    report = dict(passed=len(checks),checks=checks,syntheticReceipts=len(receipts),unexpected=unexpected,jsErrors=errors,operationalWrites=0)
    (output/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    browser.close()
