"""Early-return payouts: every API write is intercepted, never real money/returns."""
import argparse,json
from datetime import datetime,timedelta,timezone
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser()
p.add_argument('--url',default='http://127.0.0.1:3021')
p.add_argument('--cookie-file',required=True)
p.add_argument('--output',default='.backups/return-early-refund-20261024/ui')
p.add_argument('--browser',choices=['chromium','webkit','both'],default='both')
a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
expect.set_options(timeout=20000)
now=datetime.now(timezone(timedelta(hours=7)));checks=[];posts=[];errors=[];state={}
accounts=[dict(id=3,kind='bank',store_id=31,owner_type='personal',label='TK chi hoàn QA'),dict(id=3,kind='cash',store_id=31,owner_type='',label='Két QA')]

def mock(route):
 if mock_contract_type_read(route):return
 req=route.request;path=urlparse(req.url).path;query=parse_qs(urlparse(req.url).query)
 if req.method!='GET':
  assert req.method=='POST' and path=='/api/auth/returns','Unexpected mutation '+path
  body=req.post_data_json;settlement=body['settlements'][0];case=state['case']
  assert not settlement['receipts']
  assert all(i.get('early_discount')=='200000' for i in body['items'])
  if case=='combined':
   assert len(body['items'])==2
   assert settlement['refund']['amount']=='2000000'
   assert settlement['rental_refund']['amount']=='400000'
   assert settlement['refund']['request_id']!=settlement['rental_refund']['request_id']
   assert 'refund_deferred' not in settlement
   assert settlement['refund']['recipient_account']==settlement['rental_refund']['recipient_account']=='000123456'
  elif case=='partial':
   assert len(body['items'])==1 and settlement['refund_deferred'] and 'refund' not in settlement
   assert settlement['rental_refund']['amount']=='200000'
  elif case=='pending':
   assert len(body['items'])==2 and settlement['refund']['amount']=='2000000' and 'rental_refund' not in settlement
  elif case=='no_deposit':
   assert len(body['items'])==2 and 'refund' not in settlement and 'refund_deferred' not in settlement
   assert settlement['rental_refund']['amount']=='400000'
  else:raise AssertionError('Unexpected return in '+case)
  posts.append(body)
  route.fulfill(json=dict(status='success',data=[dict(item_id=i['item_id'],contract_code='QA-EARLY',status='completed',fee=-200000) for i in body['items']]))
  return
 if path=='/api/auth/order/car-rental' and query.get('table')==['1']:
  data=dict(rows=[],total=0,scopeCount=0,tabCount=0,page=1,pages=1,statusCounts=[],statuses=[],dueCount=0,summary=None)
 elif path=='/api/auth/stores':data=[dict(id=31,store_name='CS QA',status='opening')]
 elif path=='/api/auth/returns':
  data=[dict(item_id=i,order_id=901,contract_code='QA-EARLY',order_status='renting',customer_name='Khách QA',vehicle_id=700+i,vehicle_name='Xe QA',license='QA-'+str(i),store_id=31,store_name='CS QA',scheduled_start_at=(now-timedelta(days=1)).isoformat(),scheduled_return_at=(now+timedelta(days=1,hours=2)).isoformat(),completed_at=None,item_revision='1',order_revision='1',total_amount=800000,paid_amount=300000 if state['case']=='unpaid' else 800000,overdue=False,daily_price=200000,deposit_paid=0 if state['case']=='no_deposit' else 2000000,deposit_held=0 if state['case']=='no_deposit' else 2000000) for i in [101,102]]
 elif path.endswith('/payments'):
  unpaid=state['case']=='unpaid'
  held=0 if state['case']=='no_deposit' else 2000000
  data=dict(id=901,code='QA-EARLY',status='renting',store_id=31,revision='1',total_amount=800000,paid_amount=300000 if unpaid else 800000,remaining=500000 if unpaid else 0,deposit_paid=held,deposit_refunded=0,deposit_held=held,rental_refundable=0,company_paid_amount=0,company_payment_count=0,accounts=[] if state['case']=='no_accounts' else accounts,history=[],items=[])
 elif path.endswith('/telegram'):data=dict(auto_enabled=False,events=[])
 else:data=[]
 route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as pw:
 for name in (['chromium','webkit'] if a.browser=='both' else [a.browser]):
  browser=getattr(pw,name).launch()
  ctx=browser.new_context(viewport=dict(width=390 if name=='webkit' else 1440,height=900),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
  ctx.add_init_script("""const qaFetch=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/auth/payment-events')return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return qaFetch.call(this,input,options);};""")
  ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
  for case in ['combined','pending','partial','unpaid','caps','dynamic','no_accounts','no_deposit']:
   state.clear();state['case']=case;before=len(posts)
   page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(a.url+'/contracts?action=return&query=QA-EARLY',wait_until='networkidle',timeout=90000)
   dialog=page.get_by_role('dialog',name='Trả xe',exact=True);section=dialog.locator('.mg-return-settlement');footer=dialog.locator('.mg-dialog-footer')
   submit=footer.get_by_role('button',name='Xác nhận trả 2 xe',exact=True)
   rent=section.get_by_label('Đã hoàn tiền thuê do trả sớm',exact=True)
   deposit=section.get_by_label('Đã hoàn cọc cho khách',exact=True)
   expect(submit).to_be_enabled();expect(rent).not_to_be_checked()
   if case!='no_deposit':expect(section.get_by_label('Chưa hoàn cọc',exact=False)).to_be_checked()
   if case=='unpaid':
    expect(rent).to_be_disabled();expect(deposit).to_be_disabled()
    expect(section).to_contain_text('chưa có tiền thuê thu dư để hoàn')
    expect(submit).to_be_enabled()
    checks.append(name+': early discount on unpaid rent reduces debt without creating cash to refund or blocking a deferred-deposit return')
   elif case=='no_deposit':
    expect(deposit).to_have_count(0);rent.check()
    expect(section.locator('#return-901-recipient_account')).to_be_visible()
    expect(submit).to_be_enabled();submit.click()
    expect(dialog).to_contain_text('Đã ghi nhận hoàn 400.000');assert len(posts)==before+1
    checks.append(name+': rental-only early refund works without a deposit and still exposes optional recipient details')
   elif case=='partial':
    dialog.get_by_role('group',name='Xe cần trả',exact=True).get_by_role('checkbox').nth(1).uncheck()
    submit=footer.get_by_role('button',name='Xác nhận trả 1 xe',exact=True)
    expect(deposit).to_be_disabled();rent.check()
    expect(section.locator('#return-901-rental_refund-amount')).to_have_value('200000')
    expect(submit).to_be_enabled();submit.click()
    expect(dialog).to_contain_text('Đã trả xe hợp đồng QA-EARLY');assert len(posts)==before+1
    checks.append(name+': one returned vehicle refunds 200k rental credit while keeping 2m deposit and the other rental open')
   elif case=='no_accounts':
    rent.check();expect(submit).to_be_disabled();expect(footer).to_contain_text('Chọn tài khoản / két thực tế đã chi hoàn tiền thuê.')
    rent.uncheck();expect(submit).to_be_enabled()
    checks.append(name+': missing early-refund payout account has a specific error; deselecting the unpaid refund permits return')
   elif case=='dynamic':
    rent.check();expect(submit).to_be_enabled()
    dialog.get_by_role('textbox',name='Giảm doanh thu QA-101',exact=True).fill('0')
    expect(submit).to_be_disabled();expect(footer).to_contain_text('được hoàn 200.000')
    dialog.get_by_role('textbox',name='Giảm doanh thu QA-102',exact=True).fill('0')
    expect(submit).to_be_disabled();expect(rent).to_be_checked()
    expect(footer).to_contain_text('được hoàn 0')
    rent.uncheck();expect(submit).to_be_enabled()
    checks.append(name+': editing discounts revalidates the selected refund even when its cap becomes zero; no stale hidden payout is submitted')
   else:
    deposit.check();expect(submit).to_be_enabled()
    if case=='pending':
     expect(rent).not_to_be_checked();submit.click()
     expect(dialog).to_contain_text('Tiền thuê còn thu dư 400.000')
     expect(dialog.get_by_role('button',name='Điền chi hoàn tiền thuê trả sớm vào sổ quỹ',exact=True)).to_be_visible()
     assert len(posts)==before+1
     checks.append(name+': returning without an actual rental refund keeps the 400k credit visible and offers the separate cashbook follow-up')
    else:
     rent.check();expect(submit).to_be_enabled()
     amount=section.locator('#return-901-rental_refund-amount')
     if case=='caps':
      section.locator('#return-901-refund-amount').fill('2400000');expect(submit).to_be_disabled();expect(footer).to_contain_text('vượt 400.000')
      section.locator('#return-901-refund-amount').fill('2000000')
      amount.fill('400001');expect(submit).to_be_disabled();expect(amount).to_have_attribute('aria-invalid','true');expect(footer).to_contain_text('được hoàn 400.000')
      amount.fill('0');expect(submit).to_be_disabled();expect(footer).to_contain_text('lớn hơn 0')
      amount.fill('000400000');expect(amount).to_have_value('400000');expect(submit).to_be_enabled()
      section.locator('#return-901-recipient_account').fill('bad/#');expect(submit).to_be_disabled()
      section.locator('#return-901-recipient_account').fill('');expect(submit).to_be_enabled()
      checks.append(name+': deposit and early-rent caps are independent; exact field/footer errors clear after correcting amount and optional recipient')
     else:
      section.locator('#return-901-recipient_account').fill('000.123 456')
      expect(section.get_by_text('Tổng tiền đã chọn hoàn:',exact=False)).to_contain_text('2.400.000')
      expect(amount).to_have_value('400000');expect(section.locator('#return-901-refund-amount')).to_have_value('2000000')
      amount.press('Enter');assert len(posts)==before
      assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
      amount.scroll_into_view_if_needed();page.screenshot(path=str(out/(name+'-combined.png')))
      submit.evaluate('button=>{button.click();button.click();}')
      expect(dialog).to_contain_text('Đã ghi nhận hoàn 2.400.000')
      expect(dialog).not_to_contain_text('Tiền thuê còn thu dư')
      assert len(posts)==before+1
      checks.append(name+': 2m deposit plus 400k early rent confirms once as two payouts with a shared normalized recipient, correct total and no remaining credit')
   if case not in ['combined','pending','partial','no_deposit']:assert len(posts)==before
   page.wait_for_load_state('networkidle');page.close()
  ctx.unroute_all(behavior='wait');ctx.close();browser.close()
assert not errors,errors
result=dict(passed=len(checks),checks=checks,jsErrors=errors,mockedReturnPosts=len(posts),realBusinessWrites=0,realTelegramSends=0)
(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(result,ensure_ascii=False))
