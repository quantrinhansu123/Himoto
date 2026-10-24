"""Two-vehicle refund validation. All business writes/reads use synthetic fixtures."""
import argparse,json
from datetime import datetime,timedelta,timezone
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3021');p.add_argument('--cookie-file',required=True);p.add_argument('--output',default='.backups/return-validation-20261024');p.add_argument('--browser',choices=['chromium','webkit','both'],default='both');a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True);expect.set_options(timeout=20000)
checks=[];posts=[];errors=[];state={}
now=datetime.now(timezone(timedelta(hours=7)))
accounts=[dict(id=3,kind='bank',store_id=31,owner_type='personal',label='TK chi hoàn QA'),dict(id=3,kind='cash',store_id=31,owner_type='',label='Két QA')]

def mock(route):
 if mock_contract_type_read(route):return
 req=route.request;path=urlparse(req.url).path;query=parse_qs(urlparse(req.url).query)
 if req.method!='GET':
  assert req.method=='POST' and path=='/api/auth/returns','Unexpected mutation '+path
  body=req.post_data_json;assert len(body['items'])==2;settlement=body['settlements'][0]
  assert settlement['refund']['amount']=='2000000' and settlement['refund']['method']=='transfer' and settlement['refund']['account_id']==3
  assert 'refund_deferred' not in settlement and not settlement['receipts'];posts.append(body)
  route.fulfill(json=dict(status='success',data=[dict(item_id=i,contract_code='QA-RETURN-2',status='completed',fee=0) for i in [101,102]]));return
 if path=='/api/auth/order/car-rental' and query.get('table')==['1']:
  data=dict(rows=[],total=0,scopeCount=0,tabCount=0,page=1,pages=1,statusCounts=[],statuses=[],dueCount=0,summary=None)
 elif path=='/api/auth/stores':data=[dict(id=31,store_name='CS QA',status='opening')]
 elif path=='/api/auth/returns':
  data=[dict(item_id=i,order_id=901,contract_code='QA-RETURN-2',order_status='renting',customer_name='Khách QA',vehicle_id=700+i,vehicle_name='Xe QA',license='QA-'+str(i),store_id=31,store_name='CS QA',scheduled_start_at=(now-timedelta(days=1)).isoformat(),scheduled_return_at=(now+timedelta(hours=1)).isoformat(),completed_at=None,item_revision='1',order_revision='1',total_amount=800000,paid_amount=800000,overdue=False,daily_price=400000,deposit_paid=2000000,deposit_held=2000000) for i in [101,102]]
 elif path.endswith('/payments'):
  if state.get('load_error'):
   route.fulfill(status=503,json=dict(status='error',message='QA chưa tải được khoản hoàn'));return
  data=dict(id=901,code='QA-RETURN-2',status='renting',store_id=31,revision='1',total_amount=800000,paid_amount=800000,remaining=0,deposit_paid=2000000,deposit_refunded=0,deposit_held=2000000,company_paid_amount=0,company_payment_count=0,accounts=[] if state.get('no_accounts') else accounts,history=[],items=[])
 elif path.endswith('/telegram'):data=dict(auto_enabled=False,events=[])
 else:data=[]
 route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as pw:
 for name in (['chromium','webkit'] if a.browser=='both' else [a.browser]):
  browser=getattr(pw,name).launch();ctx=browser.new_context(viewport=dict(width=390 if name=='webkit' else 1440,height=900),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
  ctx.add_init_script("""const qaFetch=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/auth/payment-events')return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return qaFetch.call(this,input,options);};""")
  ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
  for case in ['amount','no_accounts','load_error']:
   state.clear();state[case]=True;page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(a.url+'/contracts?action=return&query=QA-RETURN-2',wait_until='networkidle',timeout=90000)
   dialog=page.get_by_role('dialog',name='Trả xe',exact=True);section=dialog.locator('.mg-return-settlement')
   footer=dialog.locator('.mg-dialog-footer');submit=footer.get_by_role('button',name='Xác nhận trả 2 xe',exact=True)
   before=len(posts)
   if case=='load_error':
    expect(submit).to_be_disabled();expect(footer).to_contain_text('QA chưa tải được khoản hoàn')
    state['load_error']=False;section.get_by_role('button',name='Tải lại khoản thu / hoàn',exact=True).click();expect(submit).to_be_enabled()
    checks.append(name+': loading failure shows the actual failure beside confirmation and retry restores return')
   else:
    expect(submit).to_be_enabled();section.get_by_label('Đã hoàn cọc cho khách',exact=True).check()
    if case=='no_accounts':
     expect(submit).to_be_disabled();expect(footer).to_contain_text('Chọn tài khoản / két thực tế đã chi hoàn cọc.')
     expect(section.get_by_label('Tài khoản / két chi hoàn',exact=True)).to_have_value('')
     section.get_by_label('Chưa hoàn cọc',exact=False).check();expect(submit).to_be_enabled();assert len(posts)==before
     checks.append(name+': missing payout account is identified; deferring the refund keeps returning vehicles available')
    else:
     amount=section.locator('#return-901-refund-amount');expect(submit).to_be_enabled();amount.fill('2400000')
     expect(submit).to_be_disabled();expect(amount).to_have_attribute('aria-invalid','true')
     expect(footer).to_contain_text('cọc còn giữ 2.000.000');expect(footer).to_contain_text('vượt 400.000');expect(footer).not_to_contain_text('Đang tải /')
     page.screenshot(path=str(out/(name+'-over-limit.png')),full_page=False);assert len(posts)==before
     checks.append(name+': 2.4m refund against 2m deposit is blocked with an exact amount/limit/excess message for two vehicles')
     amount.fill('0');expect(footer).to_contain_text('lớn hơn 0');expect(submit).to_be_disabled()
     amount.fill('2000000');expect(amount).not_to_have_attribute('aria-invalid','true');expect(submit).to_be_enabled()
     recipient=section.locator('#return-901-recipient_account');recipient.fill('bad/#');expect(submit).to_be_disabled();expect(footer).to_contain_text('Số tài khoản khách nhận chưa hợp lệ')
     recipient.fill('');expect(submit).to_be_enabled();expect(footer).not_to_contain_text('vượt cọc')
     assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
     submit.click();expect(dialog).to_contain_text('Đã trả xe hợp đồng QA-RETURN-2');assert len(posts)==before+1
     checks.append(name+': correcting amount/optional recipient clears the specific errors and explicitly returns both vehicles with exactly one 2m refund')
   page.wait_for_load_state('networkidle');page.close()
  ctx.unroute_all(behavior='wait');ctx.close();browser.close()
assert not errors,errors
result=dict(passed=len(checks),checks=checks,jsErrors=errors,mockedReturnPosts=len(posts),realBusinessWrites=0,realTelegramSends=0)
(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(result,ensure_ascii=False))
