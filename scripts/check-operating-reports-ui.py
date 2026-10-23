"""Desktop/mobile UI checks. Every browser API is mocked; no business/Telegram writes."""
import argparse,json
from pathlib import Path
from datetime import datetime,timezone
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3021');p.add_argument('--cookies',default='.backups/shift-gps-20261024');p.add_argument('--output',default='.backups/shift-gps-20261024/ui');a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True);checks=[];errors=[]
keys='running stock term_24 term_18 term_12 term_6 term_other term_unknown reserved bad_debt returned_month bought_month new_day new_month income_day deposit_day refund_day rental_day revenue_month battery_revenue_month battery_income_day battery_rental_day battery_deposit_day battery_refund_day battery_sale_day charger_sale_day thu_actual company_actual cash_actual book_income'.split()
manual='reserved bought_month battery_revenue_month battery_sale_day charger_sale_day thu_actual company_actual cash_actual book_income'.split()
base={key:None if key in manual else 0 for key in keys};base.update(running=10,stock=12,term_24=4,term_12=6,income_day=19438000,rental_day=19438000,revenue_month=345064565)
stamp=datetime.now(timezone.utc).isoformat();date=datetime.now(timezone.utc).astimezone().date().isoformat()
def own():return dict(values=dict(base),app=dict(base),manual=[],thu_balance=211325866,company_balance=8764889,read_at=stamp,sources=['QA approved receipts; unknown fields stay blank'])
def fixture_row():return dict(id=101,code='QA-OVERDUE',customer='Khách QA',phone='0900000000',store_id=35,store_name='CS Thuê sở hữu QA',vehicle='QA-01',started_at='2026-10-01T08:30',due_at='2026-10-20T17:45',days=4,amount=300000,late_fee=80000,gps=['offline'],customer_status='Cảnh báo',followup=dict(contact_status='uncontacted',handling_status='branch',customer_condition='',notes='',revision=0))

with sync_playwright() as pw:
 for label,account,engine,width in [('admin',143,pw.chromium,1440),('staff-mobile',156,pw.webkit,390)]:
  state=dict(debt=fixture_row(),debt_reads=0,autofills=[],writes=[],fail_note=True,fail_ownership=False,report=None,deliveries=[],sent=0)
  def mock(route):
   req=route.request;path=urlparse(req.url).path;query={k:v[0] for k,v in parse_qs(urlparse(req.url).query).items()}
   if mock_contract_type_read(route):return
   if path=='/api/session':route.fulfill(json={'user':{'id':account,'name':'QA'}});return
   if path=='/api/auth/payment-events':route.fulfill(content_type='text/event-stream',body=': QA\n\n');return
   if path=='/api/auth/gps/debts':
    if req.method=='GET':state['debt_reads']+=1;route.fulfill(json={'data':{'rows':[state['debt']],'read_at':stamp,'hash':'a'*64,'messages':['BÁO CÁO NỢ CHẬM · QA\nKhách QA · QA-01\nKhông nghe máy · Chuyển XLN'],'deliveries':state['deliveries']}});return
    state['writes'].append(path)
    if req.method=='PATCH':
     if state['fail_note']:state['fail_note']=False;route.fulfill(status=503,json={'message':'QA DB unavailable; giữ nguyên ghi chú'});return
     value=req.post_data_json;state['debt']['followup']={k:v for k,v in value.items() if k!='order_id'};state['debt']['followup']['revision']+=1;route.fulfill(json={'data':{'revision':state['debt']['followup']['revision']}});return
    state['deliveries']=[{'status':'sent','message_id':77}];route.fulfill(json={'data':{'queued':1}});return
   if path=='/api/auth/shift-reports/autofill':
    section=query['section'];state['autofills'].append(section)
    if section=='ownership' and state['fail_ownership']:route.fulfill(status=503,json={'message':'QA nguồn thống kê gián đoạn'});return
    summary={k:0 for k in 'contracts_total contracts_completed contracts_renting contracts_overdue income_total income_deposit income_renewal income_rental expense_total deposit_refund early_refund late_penalty'.split()};summary['contracts_total']=3;summary['income_total']=19438000
    values={'ownership_report':own()} if section=='ownership' else {'summary':summary} if section=='summary' else {}
    route.fulfill(json={'data':{'store_id':int(query['store_id']),'date':query['date'],'section':section,'values':values,'read_at':stamp,'sources':['QA source'],'notices':[]}});return
   if path=='/api/auth/shift-reports':
    if req.method=='GET':route.fulfill(json={'data':[state['report']] if state['report'] else []});return
    body=req.post_data_json;state['writes'].append(path);state['sent']+=body['status']=='submitted'
    r=state['report'] or dict(id=9001,revision=0,photos=[],media=[],legacy_photos=[],store_name='CS Thuê sở hữu QA',created_by_name='QA',updated_at=stamp)
    r.update(payload=body['payload'],status=body['status'],revision=r['revision']+1);state['report']=r
    route.fulfill(json={'data':{'id':r['id'],'revision':r['revision'],**({'ownership_report':r['payload']['ownership_report']} if body['status']=='submitted' else {})}});return
   if path.endswith('/telegram') and '/shift-reports/' in path:route.fulfill(json={'data':{'status':'sent','message_id':99,'error_code':None}});return
   if path=='/api/auth/gps/refresh':route.fulfill(json={'status':'success','data':{}});return
   if req.method!='GET':state['writes'].append('BLOCKED '+path);route.abort();return
   if path in ['/api/auth/stores','/api/auth/store-directory']:data=[dict(id=35,store_name='CS Thuê sở hữu QA',kind='lease_to_own',status='opening')]
   elif path=='/api/auth/gps':
    devices=[dict(id=1,vehicle_id=1,provider='protrack',external_device_id='QA-IMEI',provider_device_name='QA GPS',license='QA-01',store_id=35,store_name='QA',management_status='stopped',sync_received_at=stamp,heartbeat_at=stamp,last_latitude=None,last_longitude=None,last_speed=0,mapping_status='manual'),dict(id=-2,vehicle_id=2,provider=None,external_device_id='',provider_device_name='',license='QA-02',store_id=35,store_name='QA',management_status='none',sync_received_at=None,heartbeat_at=None,last_latitude=None,last_longitude=None,last_speed=None,mapping_status='unmapped')]
    data={'devices':devices,'events':[]}
   elif path=='/api/auth/order/car-rental':
    rows=[] if query.get('status')=='draft' else [dict(id=101,code='QA-CONTRACT',name='QA-CONTRACT',status='renting',customer_name='Khách QA',store_id=35,store_kind='lease_to_own',start_date='2026-10-01T08:30',end_date='2026-10-31T17:45',license='QA-01')]
    data=dict(rows=rows,total=len(rows),scopeCount=198,tabCount=len(rows),page=1,pages=1,statusCounts=[],statuses=[],dueCount=0,summary=None,recentDays=None)
   else:data=[]
   route.fulfill(json={'status':'success','data':data})
  browser=engine.launch();ctx=browser.new_context(viewport={'width':width,'height':1000},timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce');ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.cookies,f'session-{account}.txt').read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
  page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
  page.goto(a.url+'/contracts/ownership',wait_until='domcontentloaded',timeout=120000);expect(page.locator('.mg-contract-total')).to_contain_text('198');expect(page.locator('.mg-rental-period').filter(visible=True).first).to_contain_text('01/10/2026 08:30');expect(page.locator('.mg-rental-period').filter(visible=True).first).to_contain_text('31/10/2026 17:45')
  page.locator('.mg-status-tabs').get_by_role('button',name='Nháp',exact=True).click();expect(page.locator('.mg-contract-total')).to_contain_text('198');page.screenshot(path=str(out/f'{label}-contracts.png'),full_page=True);checks.append(label+': merged dates and whole-scope counter survives empty selected tab')
  page.goto(a.url+'/gps',wait_until='domcontentloaded',timeout=120000);expect(page.get_by_role('button',name='Toàn bộ xe 2',exact=True)).to_be_visible();assert state['debt_reads']==0
  page.get_by_role('button',name='Chưa gắn GPS 1',exact=True).click();expect(page.locator('.mg-page-content')).to_contain_text('QA-02');assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
  page.locator('.mg-debt-report > summary').click();expect(page.get_by_role('heading',name='Nợ chậm · 1 hợp đồng')).to_be_visible();page.get_by_role('button',name='Cập nhật',exact=True).click();dialog=page.get_by_role('dialog',name='Cập nhật tình trạng khách',exact=True);expect(dialog).to_be_visible();dialog.get_by_label('Liên hệ',exact=True).select_option('unreachable');dialog.get_by_label('Xử lý',exact=True).select_option('escalated');dialog.get_by_label('Tình trạng khách',exact=True).fill('Không liên lạc được');dialog.get_by_label('Ghi chú liên hệ theo ngày',exact=True).fill('24/10 gọi khách 2 lần')
  dialog.get_by_role('button',name='Lưu tình trạng khách',exact=True).click();expect(dialog).to_contain_text('QA DB unavailable');expect(dialog.get_by_label('Ghi chú liên hệ theo ngày',exact=True)).to_have_value('24/10 gọi khách 2 lần');dialog.get_by_role('button',name='Lưu tình trạng khách',exact=True).click();expect(page.locator('.mg-collection-table')).to_contain_text('Chuyển XLN')
  page.get_by_label('Cơ sở đang xem',exact=True).select_option('35');send=page.get_by_role('button',name='Xem trước & gửi Telegram PGD',exact=True);expect(send).to_be_enabled();send.click();page.locator('dialog:visible').get_by_role('button',name='Gửi 1 tin báo cáo',exact=True).click();expect(page.locator('.mg-collection-panel')).to_contain_text('1/1 tin đã gửi');page.screenshot(path=str(out/f'{label}-debt.png'),full_page=True);checks.append(label+': complete GPS fleet, lazy debt read, failed write preserves notes and branch Telegram preview')
  page.goto(a.url+'/shift-reports',wait_until='networkidle',timeout=120000);page.get_by_role('button',name='Tạo báo cáo',exact=True).click();store=page.locator('#shift-store');
  if store.input_value()!='35':store.select_option('35')
  expect(page.locator('#shift-staff')).to_be_enabled(timeout=60000);page.locator('#shift-staff').fill('QA cuối ngày')
  page.get_by_role('tab',name='Thuê sở hữu & Telegram',exact=True).click();expect(page.locator('#ownership-income_day')).to_have_value('19438000');expect(page.locator('#ownership-reserved')).to_have_value('');assert 'summary' in state['autofills'] and 'ownership' in state['autofills']
  page.locator('#ownership-reserved').fill('8');state['fail_ownership']=True;page.locator('#shift-panel-ownership').get_by_role('button',name='Tự điền từ DB',exact=True).click();expect(page.get_by_role('alert').filter(has_text='QA nguồn thống kê')).to_be_visible();expect(page.locator('#ownership-reserved')).to_have_value('8');state['fail_ownership']=False
  page.locator('#shift-panel-ownership').get_by_role('button',name='Tự điền từ DB',exact=True).click();expect(page.locator('#ownership-reserved')).to_be_enabled();expect(page.locator('#ownership-reserved')).to_have_value('8')
  for key in manual:
   page.locator('#ownership-'+key).fill(str({'reserved':8,'thu_actual':211325866,'company_actual':8764889,'book_income':19438000}.get(key,0)))
  expect(page.locator('.mg-ownership-reconciliation')).to_contain_text('APP / Sổ: Khớp');page.screenshot(path=str(out/f'{label}-ownership.png'),full_page=True)
  page.get_by_role('tab',name='An toàn cuối ca',exact=True).click();page.get_by_label('Xác nhận đã tắt các thiết bị điện',exact=True).check();page.get_by_role('button',name='Chốt báo cáo',exact=True).click();expect(page.get_by_text('Telegram: Đã gửi',exact=True)).to_be_visible(timeout=30000);assert state['sent']==1;assert not any(w.startswith('BLOCKED') for w in state['writes']);assert not page.evaluate('document.documentElement.scrollWidth>innerWidth');checks.append(label+': automatic daily summary/ownership, unknown fields blank, failed refresh/manual edits preserved, reviewed submission sends once and displays confirmed status')
  ctx.close();browser.close()
assert not errors,errors
result=dict(passed=len(checks),checks=checks,pageErrors=errors,realBusinessWrites=0,realTelegramSends=0);(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(result,ensure_ascii=False,indent=2))
