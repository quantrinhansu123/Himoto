"""Browser acceptance with synthetic API responses and a loopback QA session only."""
import argparse, base64, hashlib, hmac, json, re, time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser()
p.add_argument('--url',default='http://127.0.0.1:3020')
p.add_argument('--fixture',default='.backups/peak-20261112/staging/staging.json')
p.add_argument('--output',default='.backups/bad-debt-close-20261112/ui')
a=p.parse_args()
assert a.url=='http://127.0.0.1:3020'
fixture=json.loads(Path(a.fixture).read_text(encoding='utf-8'))
assert fixture['fixtureOnly'] and fixture['host']=='127.0.0.1' and fixture['port']==55439
out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
expect.set_options(timeout=20000)
checks=[];errors=[];writes=[]

def token(user):
    encode=lambda value:base64.urlsafe_b64encode(value).decode().rstrip('=')
    body=encode(json.dumps(dict(id=user,expires=int(time.time()*1000)+3600000),separators=(',',':')).encode())
    return body+'.'+encode(hmac.new(fixture['secret'].encode(),body.encode(),hashlib.sha256).digest())

def run(browser,role,width,height):
    admin=role=='admin';uid=1 if admin else 2
    state=dict(status='bad_debt',returned=False,events=[],fail=False,closed_at='')
    permissions=['contracts.read','contracts.return','contracts.renew','contracts.draft','customers.read','vehicles.read']
    user=dict(id=uid,name='QA '+role,email='qa@example.invalid',access_role='admin' if admin else 'branch_staff',permissions=permissions,store_id=None if admin else 32,scope_all=admin)
    item=dict(id=9010,vehicle_id=101,name='Xe QA',license='QA-DEBT-101',rent_at='2026-10-01T03:00:00Z',return_at='2026-10-20T03:00:00Z')
    def context():
        return dict(id=901,code='QA-DEBT-901',status=state['status'],revision=str(10+len(state['events'])),ownership=False,overdue=False,
            items=[dict(**item,completed_at='2026-10-25T03:00:00Z' if state['returned'] else None)],all_returned=state['returned'],returned_count=int(state['returned']),
            total_amount=1000000,paid_amount=250000,remaining=750000,deposit_held=200000,overpayment=0,settled=False,can_settle=False,
            settlement_note='Còn tiền thuê chưa thanh toán.',events=state['events'],held_at=None,resume_vehicle_count=0,plan=None,base_total=1000000,
            start_at=item['rent_at'],end_at=item['return_at'],bad_debt_closed_at=state['closed_at'])
    def record():
        return dict(id=901,contract_number='QA-DEBT-901',status=state['status'],rental_type='daily',store_id=32,store_name='QA Branch',store_kind='physical',
            customer_name='Khách QA',customer_phone='0900000000',total_amount=1000000,paid_amount=250000,unit_price=100000,
            start_date=item['rent_at'],end_date=item['return_at'],bad_debt_at='2026-10-24T03:00:00Z',bad_debt_closed_at=state['closed_at'],
            draft_revision=str(10+len(state['events'])),vehicles=[dict(**item,completed_at='2026-10-25T03:00:00Z' if state['returned'] else None)])
    def mock(route):
        req=route.request;url=urlparse(req.url);path=url.path
        if url.netloc!='127.0.0.1:3020':route.abort();return
        if not path.startswith('/api/'):route.continue_();return
        if mock_contract_type_read(route):return
        data=[]
        if path=='/api/session':data=dict(user=user);route.fulfill(json=data);return
        if req.method!='GET':
            body=req.post_data_json;writes.append(dict(role=role,path=path,body=body))
            if path.endswith('/lifecycle'):
                assert admin and body['action']=='close_bad_debt' and body['confirmed'] and state['returned']
                if state['fail']:state['fail']=False;route.fulfill(status=409,json=dict(status='error',message='QA: hợp đồng đã thay đổi. Kiểm tra lại.'));return
                state['status']='completed';state['closed_at']=body['at']+':00+07:00'
                state['events'].append(dict(action='close_bad_debt',at=state['closed_at'],actor_name='QA admin',note=body['note']))
                data=context()
            elif path=='/api/auth/returns/recover':
                assert body['item_id']==9010;state['returned']=True
                data=dict(item_id=9010,order_id=901,vehicle_id=101,recovered_at=body['recovered_at']+':00+07:00',replayed=False)
            else:raise AssertionError('Unexpected mutation: '+path)
        elif path.endswith('/lifecycle'):data=context()
        elif path=='/api/auth/order/car-rental/followups':data=[dict(id=901,followup=dict(contact_status='uncontacted',handling_status='branch',customer_condition='',notes='',revision=0))]
        elif path=='/api/auth/order/car-rental':data=[record()]
        elif path=='/api/auth/returns':
            data=[dict(item_id=9010,order_id=901,contract_code='QA-DEBT-901',order_status=state['status'],customer_name='Khách QA',customer_id_card='',
                vehicle_id=101,vehicle_name='Xe QA',license='QA-DEBT-101',store_id=32,store_name='QA Branch',scheduled_start_at=item['rent_at'],scheduled_return_at=item['return_at'],
                completed_at='2026-10-25T03:00:00Z' if state['returned'] else None,item_revision='1',order_revision='10',total_amount=1000000,paid_amount=250000,
                overdue=True,daily_price=100000,deposit_paid=200000,deposit_held=200000)]
        elif path.endswith('/renewals'):data=dict(next_renewal_version=2)
        elif path.endswith('/payments'):data=dict(id=901,code='QA-DEBT-901',revision='10',status=state['status'],store_id=32,total_amount=1000000,paid_amount=250000,remaining=750000,deposit_paid=200000,deposit_refunded=0,deposit_held=200000,items=[],accounts=[],history=[],company_paid_amount=0,company_payment_count=0)
        elif path in ['/api/auth/stores','/api/auth/store-directory']:data=[dict(id=32,store_name='QA Branch',kind='physical',status='opening')]
        route.fulfill(json=dict(status='success',data=data))
    ctx=browser.new_context(viewport=dict(width=width,height=height),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
    ctx.add_cookies([dict(name='himoto_management_session',value=token(uid),url=a.url,httpOnly=True,sameSite='Strict')])
    # Ancillary notes are outside this acceptance scope. Resolve them in-page
    # so WebKit route cancellation during navigation cannot create a CORS error.
    ctx.add_init_script("""const originalFetch=window.fetch;
      window.fetch=function(input,options){
        const url=new URL(typeof input==='string'?input:input.url,location.href);
        if(url.pathname==='/api/auth/order/car-rental/followups')return Promise.resolve(Response.json({status:'success',data:[{id:901,followup:{contact_status:'uncontacted',handling_status:'branch',customer_condition:'',notes:'',revision:0}}]}));
        return originalFetch.call(this,input,options);
      };""")
    ctx.route('**/*',mock)
    page=ctx.new_page();page.on('pageerror',lambda error:errors.append(dict(role=role,width=width,message=str(error),stack=error.stack)))
    def visit():
        page.wait_for_load_state('networkidle')
        page.goto(a.url+'/contracts?contract_id=901',wait_until='networkidle',timeout=90000)
        expect(page.locator('button.mg-row-menu-trigger').filter(visible=True).first).to_be_visible()
    def menu():page.locator('button.mg-row-menu-trigger').filter(visible=True).first.click()
    visit();menu()
    close=page.get_by_role('menuitem',name='Đóng hợp đồng nợ xấu',exact=True)
    if admin:
        close.click();dialog=page.get_by_role('dialog',name='Đóng hợp đồng nợ xấu',exact=True)
        expect(dialog.get_by_role('button',name='Đóng hợp đồng, giữ công nợ')).to_be_disabled()
        expect(dialog).to_contain_text('Cần ghi nhận trả hoặc thu hồi tất cả xe')
        dialog.get_by_role('button',name='Quay lại',exact=True).click()
        state['returned']=True;visit();menu();page.get_by_role('menuitem',name='Đóng hợp đồng nợ xấu',exact=True).click()
        dialog=page.get_by_role('dialog',name='Đóng hợp đồng nợ xấu',exact=True)
        expect(dialog).to_contain_text('750.000');expect(dialog).to_contain_text('200.000')
        button=dialog.get_by_role('button',name='Đóng hợp đồng, giữ công nợ');expect(button).to_be_disabled()
        dialog.get_by_role('checkbox').check();expect(button).to_be_enabled()
        assert dialog.evaluate('(d)=>d.contains(document.activeElement)')
        dialog.screenshot(path=str(out/f'{role}-{width}-confirm.png'))
        state['fail']=True;button.click();expect(dialog.get_by_role('alert')).to_contain_text('QA: hợp đồng đã thay đổi')
        button.click();expect(dialog).not_to_be_visible();assert state['status']=='completed'
        attempts=[w['body'] for w in writes if w['role']==role and w['path'].endswith('/lifecycle')]
        assert attempts[-1]['request_id']==attempts[-2]['request_id']
        visit();menu();expect(page.get_by_role('menuitem',name=re.compile(r'^Ẩn hợp đồng'))).to_be_disabled();page.keyboard.press('Escape')
        checks.append(f'{role}/{width}: returned-vehicle gate, debt/deposit preview, explicit confirmation, retry, successful close and hiding blocked while debt remains')
    else:
        expect(close).to_have_count(0)
        page.get_by_role('menuitem',name='Xem chi tiết',exact=True).click()
        detail=page.get_by_role('dialog',name='Chi tiết hợp đồng: QA-DEBT-901',exact=True)
        expect(detail.get_by_role('button',name='Đóng hợp đồng nợ xấu',exact=True)).to_have_count(0)
        detail.get_by_role('button',name='Thu hồi xe nợ xấu',exact=True).click()
        dialog=page.get_by_role('dialog',name='Thu hồi xe nợ xấu · QA-DEBT-901',exact=True)
        dialog.locator('#bad-debt-recovered-at').fill('2026-10-25')
        dialog.get_by_label('Giờ ngày giờ thực tế thu hồi (24h)',exact=True).select_option('10')
        dialog.get_by_label('Phút ngày giờ thực tế thu hồi',exact=True).select_option('00')
        dialog.get_by_role('checkbox').check();dialog.get_by_role('button',name='Xác nhận đã thu hồi',exact=True).click()
        expect(dialog).to_contain_text('Đã ghi nhận thu hồi.');assert state['status']=='bad_debt' and state['returned']
        dialog.screenshot(path=str(out/f'{role}-{width}-returned.png'))
        checks.append(f'{role}/{width}: closure hidden in list/detail, existing physical recovery leaves debt open')
    page.wait_for_load_state('networkidle')
    ctx.close()

with sync_playwright() as pw:
    for engine,width,height in [('chromium',1440,960),('webkit',390,844)]:
        browser=getattr(pw,engine).launch()
        try:
            for role in ['admin','branch_staff']:run(browser,role,width,height)
        finally:browser.close()
assert not errors,errors
result=dict(passed=len(checks),checks=checks,browserErrors=errors,realBusinessWrites=0,realTelegramRequests=0)
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
