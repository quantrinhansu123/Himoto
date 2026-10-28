"""Ownership drafts require manager approval. Business APIs are intercepted."""
import argparse,copy,json
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3048');p.add_argument('--sessions',required=True);p.add_argument('--output',default='.backups/ownership-approval-20261028/ui');p.add_argument('--browser',choices=['all','chromium','webkit'],default='all');p.add_argument('--role',choices=['all','ownership_manager','ownership_staff','headquarters_sales'],default='all');a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True);fixture=json.loads((Path(a.sessions)/'fixtures.json').read_text(encoding='utf-8'));checks=[];errors=[];writes=[];expect.set_options(timeout=25000)
with sync_playwright() as pw:
 for engine,width in [('chromium',1440),('webkit',390)]:
  if a.browser not in ['all',engine]:continue
  browser=getattr(pw,engine).launch()
  for role in ['ownership_manager','ownership_staff','headquarters_sales']:
   if a.role not in ['all',role]:continue
   state={'draft':copy.deepcopy(fixture['draft']),'status':'draft','revision':'1','saved':0,'issued':0}
   def record():return dict(id=901,contract_number='QA-OWN-901',draft_reference='QA-OWN-901',order_status=state['status'],order_type='ownership',rental_type='ownership',store_id=35,store_kind='lease_to_own',store_name=fixture['store']['name'],customer_id=7,customer_name=fixture['customer']['name'],customer_phone=fixture['customer']['phone'],customer_id_card=fixture['customer']['id_card'],customer_address=fixture['customer']['address'],contract_type_id='ownership',total_amount=1350000,paid_amount=0,deposit_amount=0,deposit_paid=0,draft_revision=state['revision'],vehicles=[fixture['vehicle']],rent_at='2026-10-28T04:15:00Z',return_at='2026-11-07T04:15:00Z',draft_payload={'management_composer':{'version':1,'rental_type':'ownership','status':'draft','draft':state['draft']}})
   def mock(route):
    req=route.request;u=urlparse(req.url);path=u.path
    if mock_contract_type_read(route):return
    if req.method not in ['GET','HEAD']:
     b=req.post_data_json;writes.append({'path':path,'role':role,'body':copy.deepcopy(b)})
     if path in ['/api/auth/order/car-rental','/api/auth/order/car-rental/901']:
      assert b['status']=='draft' and b['rental_type']=='ownership';assert state['status']=='draft';state['draft']=b['draft'];state['revision']=str(int(state['revision'])+1);state['saved']+=1;data=record()
     elif path.endswith('/finalize'):
      assert role=='ownership_manager','Staff must never submit a finalize request';assert state['status']=='draft';state['issued']+=1;state['status']='renting';data={'order_id':901,'code':'QA-OWN-901','status':'renting','total_amount':1350000,'deposit_amount':0,'paid_amount':1350000,'transaction_ids':[501]}
     elif path=='/api/auth/record-photos/contracts/901' and req.method=='POST':data={'copied':0}
     else:raise AssertionError(f'Unexpected write {req.method} {path}')
     route.fulfill(json={'status':'success','data':data});return
    if path=='/api/auth/order/car-rental/followups':data=[{'id':901,'followup':{'contact_status':'uncontacted','handling_status':'branch','customer_condition':'','notes':'','revision':0}}]
    elif path=='/api/auth/order/car-rental/901/payments':data={'id':901,'code':'QA-OWN-901','status':'draft','store_id':35,'revision':state['revision'],'total_amount':1350000,'paid_amount':0,'remaining':1350000,'deposit_paid':0,'deposit_refunded':0,'deposit_held':0,'deposit_remaining':0,'items':[],'history':[],'accounts':[{'id':5,'kind':'cash','label':'Két QA','store_id':35,'owner_type':''}]}
    elif path=='/api/auth/order/car-rental/901/telegram':data={'auto_enabled':False,'events':[]}
    elif path=='/api/auth/order/car-rental':data=[record()]
    elif path in ['/api/auth/stores','/api/auth/store-directory']:data=[fixture['store']]
    elif path in ['/api/auth/customers','/api/auth/customers/search']:data=[fixture['customer']]
    elif path in ['/api/auth/vehicle/vehicles','/api/auth/vehicles/inventory']:data=[fixture['vehicle']]
    elif path=='/api/auth/gps':data={'devices':[],'events':[]}
    elif path=='/api/session':route.fulfill(json={'user':{'name':'QA'}});return
    else:data=[]
    route.fulfill(json={'status':'success','data':data})
   ctx=browser.new_context(viewport={'width':width,'height':950},timezone_id='Asia/Ho_Chi_Minh');ctx.add_cookies([{'name':'himoto_management_session','value':(Path(a.sessions)/f'session-{role}.txt').read_text().strip(),'url':a.url,'httpOnly':True,'sameSite':'Strict'}]);ctx.route('**/api/**',mock)
   ctx.add_init_script("const originalFetch=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);return url.pathname==='/api/auth/payment-events'?Promise.resolve(Response.json({status:'success',data:[]})):originalFetch.call(this,input,options);};")
   page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(a.url+'/contracts/ownership',wait_until='networkidle',timeout=90000)
   region=page.locator('.mg-desktop-records' if width>900 else '.mg-mobile-records');expect(region).to_contain_text('QA-OWN-901');approve=region.get_by_role('button',name='Duyệt hợp đồng',exact=True)
   page.screenshot(path=str(out/f'{engine}-{role}-list.png'))
   if role=='ownership_manager':expect(approve).to_be_visible();approve.click()
   else:
    expect(approve).to_have_count(0);region.locator('button.mg-row-menu-trigger').first.click();page.get_by_role('menuitem',name='Tiếp tục sửa bản nháp',exact=True).click()
   form=page.locator('dialog.mg-contract-composer');expect(form).to_be_visible()
   if role!='ownership_manager':
    expect(form.get_by_role('button',name='Duyệt hợp đồng',exact=True)).to_have_count(0);expect(form.get_by_role('button',name='Hoàn tất & thanh toán',exact=True)).to_have_count(0)
    expect(form.get_by_role('button',name='Lưu nháp chờ duyệt',exact=True)).to_be_enabled();form.screenshot(path=str(out/f'{engine}-{role}-draft.png'));form.get_by_role('button',name='Lưu nháp chờ duyệt',exact=True).click();expect(form).not_to_be_visible();assert state['saved']==1 and state['issued']==0 and state['status']=='draft'
    checks.append(f'{engine}/{role}: ownership stays draft and only offers Save draft awaiting approval, including staff with legacy finalize grants')
   else:
    button=form.get_by_role('button',name='Duyệt hợp đồng',exact=True);expect(button).to_be_visible();form.screenshot(path=str(out/f'{engine}-{role}-approve.png'));button.click()
    dialog=page.get_by_role('dialog',name='Duyệt hợp đồng thuê sở hữu · QA-OWN-901',exact=True);expect(dialog).to_be_visible();assert state['saved']==1 and state['issued']==0 and state['status']=='draft'
    confirm=dialog.get_by_role('button',name='Xác nhận duyệt hợp đồng',exact=True);expect(confirm).to_be_enabled();dialog.screenshot(path=str(out/f'{engine}-{role}-confirm.png'));confirm.click();expect(page.get_by_role('dialog',name='Kiểm tra & gửi Telegram · QA-OWN-901',exact=True)).to_be_visible();assert state['issued']==1 and state['status']=='renting'
    checks.append(f'{engine}/{role}: visible Approve button opens review, saves a draft first, and enters renting only after explicit approval confirmation')
   ctx.unroute_all(behavior='ignoreErrors');ctx.close()
  browser.close()
assert not errors,errors
result={'passed':len(checks),'checks':checks,'javascript_errors':errors,'simulated_writes':len(writes),'real_business_writes':0,'real_telegram_requests':0};(out/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2))
