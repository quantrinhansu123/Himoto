"""Reservation -> handover -> remaining rent, synthetic API only."""
from lib.contract_type_fixtures import mock_contract_type_read
import argparse
import copy
import json
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3101')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--browser', choices=['chromium', 'webkit'], default='chromium')
parser.add_argument('--output', default='.backups/reservation-qa/ui')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
checks, errors, unexpected, writes = [], [], [], []
stores = [dict(id=i, store_name=name, status='opening') for i, name in [(1, 'CS nguồn khách QA'), (2, 'CS giữ xe QA')]]
staff = [dict(id=8, store_id=1, full_name='Nhân viên giữ xe QA', status='active')]
customer = dict(id=77, store_id=1, name='Khách đặt xe QA', phone='0900000077', id_card='001234567877', address='', relatives=[], status='active')
vehicle = dict(id=101, name='Xe giữ chỗ QA', license='QA-101', store_id=1, current_store_id=1, store_name='CS nguồn khách QA', status='ready', daily_price=300000)
state = {}

def payment_context():
    return dict(id=901, code=state.get('code', 'NHAP-QA-901'), status=state.get('status', 'draft'), store_id=1, revision=str(state.get('revision', 1)),
        total_amount=300000, paid_amount=state.get('paid', 0), remaining=300000-state.get('paid', 0), deposit_paid=0, deposit_refunded=0, deposit_held=0,
        company_paid_amount=0, company_payment_count=0, accounts=[dict(id=1, kind='cash', store_id=1, owner_type='', label='Két QA')], history=state.get('history', []),
        items=[dict(id=201, vehicle_id=101, name=vehicle['name'], license='QA-101', daily_price=300000, return_at='2026-12-01T09:00:00+07:00', renewal_amount=0, revision='1')], end_date=None)

def mock_api(route):
    if mock_contract_type_read(route): return
    req = route.request
    path = urlparse(req.url).path.rstrip('/')
    query = parse_qs(urlparse(req.url).query)
    if path == '/api/auth/order/car-rental/followups' and req.method == 'GET':
        route.fulfill(json={'data': []})
        return
    if path.startswith('/api/auth/record-photos/'):
        if req.method=='POST':data=dict(copied=0)
        elif req.method=='GET':data=[]
        else:raise AssertionError('Unexpected photo write')
        route.fulfill(json=dict(status='success',data=data))
        return
    if path.endswith('/telegram'):
        assert req.method=='GET', 'No Telegram send is authorized in this regression'
        route.fulfill(json=dict(status='success',data=dict(auto_enabled=False,next_renewal_version=2,events=[])))
        return
    if path in ['/api/auth/gps','/api/auth/payment-events']:
        route.fulfill(json=dict(status='success',data=[]))
        return
    if path=='/api/auth/order/car-rental' and query.get('table')==['1']:
        raw=state.get('record')
        rows=[]
        if raw:
            draft=raw['draft_payload']['management_composer']['draft']
            code=raw.get('contract_number') or raw['draft_reference']
            rows=[dict(raw,code=code,name=code,customer_id=77,store_name='CS nguồn khách QA',vehicle_id=101,
                vehicle_name=vehicle['name'],license='QA-101',vehicles_json=json.dumps([vehicle]),draft_json=json.dumps(draft),
                start_date=draft['start_date'],end_date=draft['end_date'],rental_type='daily')]
        statuses=[state.get('status','draft')] if rows else []
        data=dict(rows=rows,total=len(rows),scopeCount=len(rows),tabCount=len(rows),page=1,pages=1,
            statusCounts=[[s,len(rows)] for s in statuses],statuses=statuses,dueCount=0,
            summary=dict(contractCount=len(rows),blacklistCount=0,totalAmount=300000,receivableAmount=300000-state.get('paid',0),badDebtAmount=0))
        route.fulfill(json=dict(status='success',data=data))
        return
    if req.method in ['POST', 'PUT']:
        body = req.post_data_json
        writes.append(dict(path=path, body=copy.deepcopy(body)))
        if path in ['/api/auth/order/car-rental', '/api/auth/order/car-rental/901']:
            assert body['draft']['reservation'] is True
            assert body['draft']['store_id'] == '1' and body['draft']['vehicle_store_id'] == '1' and body['draft']['staff_id'] == '8', {key:body['draft'].get(key) for key in ['store_id','vehicle_store_id','staff_id','staff_name']}
            state['revision'] = state.get('revision', 0)+1
            state['record'] = dict(id=901, draft_reference='NHAP-QA-901', status='draft', store_id=1, draft_revision=str(state['revision']),
                draft_payload=dict(management_composer=dict(version=1, **body)))
            data = state['record']
        elif path.endswith('/901/finalize'):
            assert body['reservation'] is True
            assert len(body['receipts']) == 1 and body['receipts'][0]['purpose'] == 'rental'
            amount = int(body['receipts'][0]['amount'])
            assert amount == 100000
            state.update(paid=amount, status='deposit_contract', code='HD-QA-901', revision=2,
                history=[dict(id=301, type='in', deposit=False, amount=amount, paid_at='2026-10-12T08:00:00+07:00', method='Tiền mặt', account='Két QA', note='Thu giữ xe (trừ tiền thuê)', actor='QA')])
            state['record'].update(status='deposit_contract', contract_number='HD-QA-901', total_amount=300000, paid_amount=amount, customer_name=customer['name'],
                customer_phone=customer['phone'], customer_id_card=customer['id_card'], vehicles=[vehicle], draft_revision='2')
            data = dict(order_id=901, code='HD-QA-901', total_amount=300000, deposit_amount=0, paid_amount=amount, transaction_ids=[301], status='deposit_contract')
        elif path.endswith('/901/handover'):
            assert body == dict(revision=str(state['revision']))
            state.update(status='renting', revision=state['revision']+1)
            state['record'].update(status='renting', draft_revision=str(state['revision']))
            data = payment_context()
        elif path.endswith('/901/payments'):
            assert body['amount'] == '200000' and body['method'] == 'cash' and body['account_id'] == 1 and body.get('purpose') is None
            state.update(paid=300000, revision=4)
            state['record'].update(paid_amount=300000, draft_revision='4')
            state['history'].append(dict(id=302, type='in', deposit=False, amount=200000, paid_at='2026-10-12T09:00:00+07:00', method='Tiền mặt', account='Két QA', note=body['note'], actor='QA'))
            data = dict(context=payment_context(), transaction_id=302, replayed=False, company_transfer=False)
        else:
            unexpected.append(req.method+' '+path)
            route.abort()
            return
        route.fulfill(json=dict(status='success', data=data))
        return
    if req.method != 'GET':
        unexpected.append(req.method+' '+path)
        route.abort()
        return
    if path == '/api/auth/contract-staff':
        data = staff
    elif path == '/api/auth/store-directory':
        data = stores
    elif path == '/api/auth/vehicles/inventory':
        data = [dict(vehicle, available=True)]
    elif path == '/api/auth/hr/staff':
        data = staff if query.get('store_id', [''])[0] == '1' else []
    elif path == '/api/auth/customers/search':
        data = [customer]
    elif path.endswith('/901/payments'):
        data = payment_context()
    elif path == '/api/auth/cashbook/accounts':
        data = [dict(kind='cash', id=1, store_id=1, store_name='CS nguồn khách QA', label='Két QA', name='Két QA', status='Active', owner_type='',
            opening_balance=1000000, income=state.get('paid', 0), expense=0, balance=1000000+state.get('paid', 0), voucher_count=len(state.get('history', [])))]
    elif path == '/api/auth/transactions':
        data = [dict(id=h['id'], type='in', status='approved', created_at=h['paid_at'], amount=h['amount'], user_name='QA', order_id=901,
            contract_code='HD-QA-901', payment_method='Tiền mặt', account='Két QA', store_id=1, store_name='CS nguồn khách QA', note=h['note']) for h in state.get('history', [])]
    elif path=='/api/auth/cashbook/vouchers':
        rows=[dict(id=h['id'],type='in',created_at=h['paid_at'],amount=h['amount'],user_name='QA',order_id=901,contract_code='HD-QA-901',payment_method='Tiền mặt',account='Két QA',store_id=1,store_name='CS nguồn khách QA',content=h['note'],reason='Thanh toán hợp đồng') for h in state.get('history',[])]
        data=dict(total=len(rows),income=dict(total=len(rows),amount=sum(row['amount'] for row in rows),page=1,pageSize=5,rows=rows),expense=dict(total=0,amount=0,page=1,pageSize=5,rows=[]),actors=[['id:80','QA']])
    elif path in ['/api/session', '/api/auth/me']:
        route.fulfill(json=dict(user=dict(id=80, name='QA')))
        return
    else:
        data = {'/api/auth/stores': stores, '/api/auth/customers': [customer], '/api/auth/vehicle/vehicles': [vehicle],
            '/api/auth/order/car-rental': [state['record']] if 'record' in state else []}.get(path)
        if data is None:
            unexpected.append(path)
            route.abort()
            return
    route.fulfill(json=dict(status='success', data=data))

with sync_playwright() as p:
    browser = getattr(p, args.browser).launch()
    context = browser.new_context(timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
    context.add_cookies(json.loads(Path(args.session_cookie_file).read_text(encoding='utf-8-sig')))
    context.route('**/api/**', mock_api)
    def open_contracts(previous, width, height):
        # WebKit can classify reads started during document replacement as access-control
        # pageerrors (microsoft/playwright#43120). Reopen for reload checks; keep the error guard strict.
        if previous:
            previous.close()
        opened = context.new_page()
        opened.on('pageerror', lambda error: errors.append(str(error)))
        opened.set_default_timeout(15000)
        opened.set_default_navigation_timeout(45000)
        opened.set_viewport_size(dict(width=width, height=height))
        opened.goto(args.url+'/contracts', wait_until='networkidle')
        return opened
    page = None
    for width, height in [(320, 740), (375, 812), (1440, 1000)]:
        state.clear()
        page = open_contracts(page, width, height)
        page.get_by_role('button', name='Nhận cọc giữ xe', exact=True).click()
        form = page.locator('dialog.mg-contract-composer')
        expect(form.get_by_role('heading', name='Nhận cọc giữ xe', exact=True)).to_be_visible()
        form.get_by_role('tab', name='Khách hàng', exact=False).click()
        form.locator('#contract-store').select_option('1')
        expect(form.locator('#contract-staff-options option')).to_have_attribute('value', staff[0]['full_name'])
        form.locator('#contract-staff').fill(staff[0]['full_name'])
        form.locator('#contract-id-card').fill(customer['phone'])
        expect(form.locator('#contract-customer-name')).to_have_value(customer['name'])
        expect(form.locator('#contract-store')).to_have_value('1')
        # The source is an explicit choice; selecting a customer preserves an existing source.
        form.get_by_role('tab',name='Hợp đồng & pháp lý',exact=False).click()
        form.locator('#contract-customer-source-store').select_option('CS nguồn khách QA')
        form.get_by_role('tab', name='Phương tiện', exact=False).click()
        if width == 320:
            form.locator('#contract-vehicle-store-filter').select_option('')
        form.locator('#contract-vehicle-0').click()
        form.locator('#contract-vehicle-0-options-101').click()
        expect(form.locator('#contract-vehicle-store-filter')).to_have_value('1')
        if width == 320:
            form.get_by_role('tab', name='Khách hàng', exact=False).click()
            expect(form.locator('#contract-staff-options option')).to_have_attribute('value', staff[0]['full_name'])
            expect(form.locator('#contract-staff')).to_be_enabled()
            form.locator('#contract-staff').fill(staff[0]['full_name'])
        form.get_by_role('tab', name='Chi phí', exact=False).click()
        expect(form.locator('#contract-total_amount')).to_have_value('300.000')
        expect(form.locator('#contract-deposit_amount')).to_be_visible()
        if width != 320:
            form.locator('#contract-deposit_amount').fill('100000')
        expect(form.locator('#contract-amount-due')).to_have_value('300.000')
        form.get_by_role('button', name='Ghi nhận cọc giữ xe', exact=True).click()
        confirm = page.get_by_role('dialog').filter(has=page.get_by_role('heading', name='Xác nhận cọc giữ xe', exact=False))
        assert confirm.evaluate('(el)=>el.scrollWidth<=el.clientWidth')
        if width == 320:
            expect(confirm.locator('#rental-collection-0-amount')).to_have_value('')
            writes_before_empty_amount = len(writes)
            confirm.get_by_role('button', name='Xác nhận đã nhận cọc giữ xe', exact=True).click()
            expect(confirm.get_by_role('alert')).to_contain_text('Nhập số tiền lớn hơn 0')
            assert len(writes) == writes_before_empty_amount
            confirm.locator('#rental-collection-0-amount').fill('100000')
        else:
            expect(confirm.locator('#rental-collection-0-amount')).to_have_value('100.000')
        expect(confirm.locator('#rental-collection-0-account')).to_have_value('cash:1')
        if width in [375, 1440]:
            confirm.screenshot(path=str(out/f'advance-{width}.png'))
        confirm.get_by_role('button', name='Xác nhận đã nhận cọc giữ xe', exact=True).click()
        final=page.get_by_role('dialog',name='Kiểm tra & gửi Telegram · HD-QA-901')
        expect(final).to_be_visible()
        final.get_by_role('button',name='Đóng',exact=True).click()
        expect(form).to_have_count(0)
        expect(page).to_have_url(args.url+'/contracts?contract_id=901')
        page.wait_for_load_state('networkidle')
        page = open_contracts(page, width, height)
        page.locator('button.mg-row-menu-trigger:visible').first.click()
        expect(page.get_by_role('menuitem', name='Trả xe', exact=True)).to_have_count(0)
        page.get_by_role('menuitem', name='Giao xe', exact=True).click()
        delivery = page.get_by_role('dialog').filter(has=page.get_by_role('heading', name='Giao xe đã đặt cọc', exact=True))
        expect(delivery).to_contain_text('100.000 đ')
        expect(delivery).to_contain_text('200.000 đ')
        assert delivery.evaluate('(el)=>el.scrollWidth<=el.clientWidth')
        if width == 375:
            delivery.screenshot(path=str(out/'handover-375.png'))
        delivery.get_by_role('button', name='Xác nhận giao xe', exact=True).click()
        final=page.get_by_role('dialog',name='Kiểm tra & gửi Telegram · Giao xe')
        expect(final).to_be_visible()
        final.get_by_role('button',name='Đóng',exact=True).click()
        expect(page).to_have_url(args.url+'/cashbook?contract_id=901&purpose=debt')
        pay = page.get_by_role('dialog').filter(has=page.get_by_role('heading', name='Thanh toán hợp đồng HD-QA-901', exact=True))
        expect(pay).to_contain_text('200.000')
        pay.get_by_label('Số tiền thu (VNĐ)', exact=True).fill('200000')
        expect(pay.get_by_label('Tài khoản nhận', exact=True)).to_have_value('cash:1')
        pay.get_by_role('button', name='Ghi nhận thanh toán', exact=True).click()
        expect(pay).to_contain_text('Phiếu Thu')
        assert state['paid'] == 300000 and len(state['history']) == 2
        pay.get_by_role('button', name='Đóng', exact=True).click()
        expect(page.locator('body')).to_contain_text('1.300.000')
        checks.append(f'{width}px: holding advance is separate from the 300k rental total, entered 100k carries to confirmation, blank advance requires an amount, booking/handover/200k remaining receipt reconcile without duplicate collection')
    state.update(status='deposit_contract', revision=5)
    state['record'].update(status='deposit_contract', draft_revision='5')
    page = open_contracts(page, 375, 812)
    page.locator('button.mg-row-menu-trigger:visible').first.click()
    page.get_by_role('menuitem', name='Giao xe', exact=True).click()
    delivery = page.get_by_role('dialog').filter(has=page.get_by_role('heading', name='Giao xe đã đặt cọc', exact=True))
    expect(delivery).to_contain_text('300.000 đ')
    writes_before_prepaid_delivery = len(writes)
    delivery.get_by_role('button', name='Xác nhận giao xe', exact=True).click()
    final=page.get_by_role('dialog',name='Kiểm tra & gửi Telegram · Giao xe')
    expect(final).to_be_visible()
    final.get_by_role('button',name='Đóng',exact=True).click()
    expect(delivery).to_have_count(0)
    page.wait_for_load_state('networkidle')
    expect(page).to_have_url(args.url+'/contracts')
    expect(page.get_by_role('dialog')).to_have_count(0)
    assert len(writes) == writes_before_prepaid_delivery+1 and writes[-1]['path'].endswith('/handover')
    assert state['paid'] == 300000 and len(state['history']) == 2
    checks.append('375px: a fully prepaid waiting booking hands over without opening an extra collection form or creating a receipt')
    assert not errors and not unexpected, (errors, unexpected)
    browser.close()
result = dict(passed=len(checks), browser=args.browser, checks=checks, javascriptErrors=errors, unexpectedRequests=unexpected, mockedWrites=len(writes), realBusinessWrites=0)
(out/'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
