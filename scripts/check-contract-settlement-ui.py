"""Browser acceptance with synthetic API responses and a loopback QA session."""
import base64,hashlib,hmac,json,time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect

origin='http://127.0.0.1:3020'
fixture=json.loads(Path('.backups/peak-20261112/staging/staging.json').read_text(encoding='utf-8'))
assert fixture['fixtureOnly'] and fixture['host']=='127.0.0.1' and fixture['port']==55439
out=Path('.backups/contract-settlement-20261112/ui');out.mkdir(parents=True,exist_ok=True)
checks=[];errors=[];writes=[]
def token(uid):
    encode=lambda v:base64.urlsafe_b64encode(v).decode().rstrip('=')
    body=encode(json.dumps(dict(id=uid,expires=int(time.time()*1000)+3600000),separators=(',',':')).encode())
    return body+'.'+encode(hmac.new(fixture['secret'].encode(),body.encode(),hashlib.sha256).digest())

def run(browser,width,height,authorized=True):
    uid=202 if authorized else 1
    state=dict(paid=0,status='renting',closed=False)
    def context():
        return dict(id=901,code='QA-PAY-901',revision=str(10+len(writes)),status=state['status'],store_id=32,total_amount=1000000,settlement_total=1000000,paid_amount=state['paid'],remaining=1000000-state['paid'],settlement_remaining=1000000-state['paid'],all_returned=False,
            deposit_paid=200000,deposit_refunded=0,deposit_held=200000,company_paid_amount=0,company_payment_count=0,history=[],end_date='2026-11-20T03:00:00Z',items=[dict(id=9010,vehicle_id=101,name='Xe QA',license='QA-PAY-101',revision='1',return_at='2026-11-20T03:00:00Z',daily_price=100000,renewal_amount=0)],accounts=[dict(id=1,kind='cash',store_id=32,owner_type='',label='Két tiền QA')],**({'payment_closed_at':'2026-11-12T03:00:00Z'} if state['closed'] else {}))
    def mock(route):
        req=route.request;u=urlparse(req.url);p=u.path
        if u.netloc!='127.0.0.1:3020':route.abort();return
        if not p.startswith('/api/'):route.continue_();return
        if req.method!='GET':
            assert authorized and p.endswith('/payments/settlement'),p
            body=req.post_data_json;assert body['confirmed'];writes.append(body)
            state['paid']+=int(body['amount'])
            if body['mode']!='partial':
                assert body['vehicles_confirmed'] and len(body['vehicles'])==1 and body['vehicles'][0]['status']=='with_customer'
                state['status']='completed';state['closed']=True
            route.fulfill(json=dict(status='success',data=dict(context=context(),transaction_id=len(writes) if int(body['amount']) else None,replayed=False)));return
        if p.endswith('/payments'):data=context()
        elif p in ['/api/auth/stores','/api/auth/store-directory']:data=[dict(id=32,store_name='QA Branch',kind='physical',status='opening')]
        elif p=='/api/session':route.fulfill(json=dict(user=dict(id=uid,name='QA admin',email='qa@example.invalid',access_role='admin',scope_all=True)));return
        else:data=[]
        route.fulfill(json=dict(status='success',data=data))
    ctx=browser.new_context(viewport=dict(width=width,height=height),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
    ctx.add_cookies([dict(name='himoto_management_session',value=token(uid),url=origin,httpOnly=True,sameSite='Strict')]);ctx.route('**/*',mock)
    page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(origin+'/cashbook?contract_id=901&purpose=debt',wait_until='networkidle',timeout=90000)
    if not authorized:
        expect(page.get_by_label('Cách thanh toán và đóng hợp đồng',exact=True)).to_have_count(0)
        checks.append(f'admin/{width}: another administrator does not receive settlement controls')
        ctx.close();return
    dialog=page.get_by_role('dialog',name='Thanh toán & đóng hợp đồng · QA-PAY-901',exact=True)
    expect(dialog).to_be_visible();choices=dialog.get_by_label('Cách thanh toán và đóng hợp đồng',exact=True)
    expect(choices.locator('option')).to_have_count(3)
    dialog.get_by_label('Số tiền thanh toán (VNĐ)',exact=True).fill('100000')
    dialog.get_by_role('checkbox').check();dialog.get_by_role('button',name='Ghi nhận thanh toán một phần',exact=True).click()
    expect(dialog).to_contain_text('tiếp tục mở');assert state['paid']==100000 and state['status']=='renting'
    choices.select_option('full');expect(dialog).to_contain_text('900.000')
    expect(dialog.get_by_role('button',name='Thu đủ và đóng hợp đồng',exact=True)).to_be_disabled()
    dialog.get_by_label('Trạng thái xe QA-PAY-101',exact=True).select_option('with_customer')
    dialog.get_by_role('checkbox').check();expect(dialog.get_by_role('button',name='Thu đủ và đóng hợp đồng',exact=True)).to_be_enabled()
    dialog.screenshot(path=str(out/f'full-{width}.png'))
    choices.select_option('close_unpaid');expect(dialog.get_by_label('Tài khoản nhận',exact=True)).to_have_count(0)
    expect(dialog).to_contain_text('không miễn nợ')
    dialog.get_by_role('checkbox').check();button=dialog.get_by_role('button',name='Đóng hợp đồng không thu tiền',exact=True)
    expect(button).to_be_enabled();assert dialog.evaluate('(d)=>d.scrollWidth<=d.clientWidth+2')
    dialog.screenshot(path=str(out/f'zero-{width}.png'));button.click()
    expect(dialog).to_contain_text('không tạo phiếu thu');assert state['status']=='completed' and state['paid']==100000
    expect(dialog.get_by_role('button',name='Ghi nhận xe đã thu hồi',exact=True)).to_be_visible()
    assert writes[-1]['amount']=='0' and 'account_id' not in writes[-1]
    checks.append(f'primary/{width}: three modes, partial receipt, exact remaining amount, mandatory vehicle choice, zero-payment close with no account and continued vehicle recovery')
    ctx.close()

with sync_playwright() as pw:
    for engine,width,height in [('chromium',1440,960),('webkit',390,844)]:
        b=getattr(pw,engine).launch()
        try:run(b,width,height);run(b,width,height,False)
        finally:b.close()
assert not errors,errors
result=dict(passed=len(checks),checks=checks,browserErrors=errors,realBusinessWrites=0,realTelegramRequests=0)
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
