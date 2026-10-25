"""Owned fleet report: account-only visibility, whole-fleet totals and view-only controls.
All browser APIs use fixtures; no business/Telegram writes.
"""
import argparse,json
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3021');p.add_argument('--cookies',default='.backups/owned-fleet-20261024');p.add_argument('--output',default='.backups/owned-fleet-20261024/ui');a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True);expect.set_options(timeout=30000)
checks=[];errors=[];requests=[];state={}
fields=['vehicles','local_vehicles','away_vehicles','rentals','direct_revenue','loan_revenue','unassigned_rentals','unassigned_revenue','revenue']
vehicles=[dict(id=i,name=f'Xe QA {i}',license=f'QA-{i:03}',store_id=32,store_name='CS Nguyễn Hoàng',current_store_name='CS Nguyễn Hoàng' if i<=40 else 'CS Láng',vehicles=1,local_vehicles=int(i<=40),away_vehicles=int(i>40),rentals=1,direct_revenue=100000 if i<=40 else 0,loan_revenue=200000 if i>40 else 0,unassigned_rentals=0,unassigned_revenue=0,revenue=100000 if i<=40 else 200000) for i in range(1,81)]
total={key:sum(row[key] for row in vehicles) for key in fields}
branch=dict(total,store_id=32,store_name='CS Nguyễn Hoàng')

def mock(route):
 req=route.request;path=urlparse(req.url).path;q={k:v[0] for k,v in parse_qs(urlparse(req.url).query).items()};requests.append(dict(path=path,query=q,method=req.method))
 if path=='/api/auth/gps/refresh':route.fulfill(json=dict(status='success',data={}));return
 assert req.method=='GET','Unexpected mutation '+path
 if path=='/api/auth/staff-sales/owned-fleet-revenue':
  assert state['role'] in ('viewer','admin'),'Private report requested by another account'
  if state.get('fail'):
   state['fail']=False;route.fulfill(status=503,json=dict(status='error',message='QA nguồn doanh thu gián đoạn'));return
  if q.get('view')=='vehicles':
   rows=sorted(vehicles,key=lambda r:(-r['revenue'],r['id']));size=int(q.get('size',10));page=min(int(q.get('page',1)),(len(rows)+size-1)//size)
   data=dict(view='vehicles',rows=rows[(page-1)*size:page*size],total=total,page=page,size=size)
  else:
   rows=[branch] if q.get('store_id','32')=='32' else []
   data=dict(view='stores',rows=rows,total=total if rows else {key:0 for key in fields})
   if state.get('bad_total'):state['bad_total']=False;data['total']=dict(data['total'],revenue=data['total']['revenue']+1)
 elif path=='/api/auth/stores':data=[dict(id=id,store_name=name,status='opening',kind='physical') for id,name in [(32,'CS Nguyễn Hoàng'),(31,'CS Láng'),(35,'CS Thuê sở hữu')]]
 elif path=='/api/auth/staff-sales':data=dict(rows=[],unassigned_revenue=0,unassigned_contracts=0)
 elif path=='/api/auth/rental-revenue':
  money=dict(rental=0,renewal=0,late=0,early=0,revenue=0);data=dict(total=money,days=[],staff=[],unassigned=money,unclassified_amount=0,unclassified_count=0)
 else:data=[]
 route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as pw:
 for role,engine,width,height in [('viewer',pw.chromium,1440,950),('viewer',pw.chromium,1024,600),('viewer',pw.webkit,390,844),('admin',pw.chromium,1440,950),('manager',pw.chromium,1440,950),('staff',pw.chromium,1440,950),('accounting',pw.chromium,1440,950)]:
  browser=engine.launch();ctx=browser.new_context(viewport=dict(width=width,height=height),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
  ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.cookies,f'session-{role}.txt').read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
  state.clear();state['role']=role;before=len(requests);page=ctx.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto(a.url+'/staff-sales',wait_until='networkidle',timeout=90000)
  tab=page.get_by_role('button',name='Doanh thu xe theo cơ sở',exact=True)
  private=lambda:[r for r in requests[before:] if r['path'].endswith('/owned-fleet-revenue')]
  assert not private()
  if role not in ('viewer','admin'):
   expect(tab).to_have_count(0);checks.append(role+': private report tab hidden and no report request sent, including other administrators');ctx.close();browser.close();continue
  expect(tab).to_be_visible();labels=page.locator('.mg-report-views button').all_text_contents();assert labels.index('Doanh thu xe theo cơ sở')==labels.index('Tổng quan thuê xe')+1
  tab.click();panel=page.locator('section[aria-label="Doanh thu xe theo cơ sở chủ quản"]');expect(panel).to_have_attribute('aria-busy','false')
  expect(panel.locator('.mg-owned-fleet-kpis')).to_contain_text('4.000.000');expect(panel.locator('.mg-owned-fleet-kpis')).to_contain_text('8.000.000');expect(panel.locator('.mg-rental-revenue-heading > strong')).to_contain_text('12.000.000')
  expect(panel).to_contain_text('80 xe chủ quản');expect(panel).to_contain_text('Chỉ xem');assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
  counts=panel.get_by_role('list',name='Số xe theo cơ sở chủ quản',exact=True)
  expect(counts.get_by_role('listitem')).to_have_text(['80 xe chủ quản','40 xe tại cơ sở gốc','40 xe ở cơ sở khác'])
  assert panel.evaluate("""panel=>{const p=panel.getBoundingClientRect(),r=panel.querySelector('.mg-owned-fleet-counts').getBoundingClientRect();return r.left>=p.left+15&&r.right<=p.right-15;}"""),'Fleet counts touch the panel border'
  counts.scroll_into_view_if_needed();page.screenshot(path=str(out/(engine.name+f'-{width}-stores.png')),full_page=False)
  checks.append(engine.name+': designated account sees adjacent lazy-loaded report with 80 owned vehicles and separately labelled 4m direct + 8m loan revenue = 12m')
  panel.get_by_role('button',name='Xem đội xe CS Nguyễn Hoàng',exact=True).click();dialog=page.get_by_role('dialog',name='Đội xe chủ quản · CS Nguyễn Hoàng',exact=True)
  expect(dialog.get_by_role('navigation',name='Phân trang đội xe chủ quản')).to_contain_text('80 xe · Trang 1 / 8')
  dialog.screenshot(path=str(out/(engine.name+f'-{width}-vehicle-summary.png')))
  dialog.get_by_role('button',name='Trang cuối',exact=True).click();expect(dialog.get_by_role('navigation')).to_contain_text('80 xe · Trang 8 / 8');expect(dialog).to_contain_text('QA-040')
  dialog.get_by_label('Số xe mỗi trang',exact=True).select_option('50');expect(dialog.get_by_role('navigation')).to_contain_text('80 xe · Trang 1 / 2')
  dialog.get_by_role('button',name='Trang cuối',exact=True).click();expect(dialog.get_by_role('navigation')).to_contain_text('80 xe · Trang 2 / 2')
  assert len([r for r in private() if r['query'].get('view')=='vehicles'])>=4
  expect(dialog.locator('.mg-owned-fleet-kpis')).to_contain_text('12.000.000');assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
  assert dialog.get_by_role('button',name='Lưu',exact=True).count()==0
  page.screenshot(path=str(out/(engine.name+f'-{width}-vehicles.png')),full_page=False)
  # Real hit testing catches row headings painted on top of the sticky footer.
  assert dialog.evaluate("""dialog=>{const footer=dialog.querySelector('.mg-dialog-footer'),r=footer.getBoundingClientRect();return [24,48,80].every(x=>footer.contains(document.elementFromPoint(r.left+x,r.top+r.height/2)));}"""),'Vehicle cells overlap the Close footer'
  for fraction in [0,.5,1]:
   dialog.locator('.mg-dialog-body').evaluate('(body,fraction)=>body.scrollTop=(body.scrollHeight-body.clientHeight)*fraction',fraction)
   assert dialog.evaluate("""dialog=>{const h=dialog.querySelector('.mg-dialog-header').getBoundingClientRect(),b=dialog.querySelector('.mg-dialog-body').getBoundingClientRect(),f=dialog.querySelector('.mg-dialog-footer').getBoundingClientRect();return b.top>=h.bottom-1&&b.bottom<=f.top+1&&f.bottom<=innerHeight+1;}"""),'Header, scrollable report and Close footer overlap'
  if width>=768:
   expect(dialog.get_by_role('navigation')).to_be_in_viewport()
  page.screenshot(path=str(out/(engine.name+f'-{width}-vehicles-bottom.png')),full_page=False)
  dialog.get_by_role('button',name='Đóng',exact=True).click()
  checks.append(engine.name+': all 80 vehicles reachable through real pagination controls; changing size resets page, whole-fleet money never shrinks to the visible rows; mobile stays within viewport')
  page.get_by_label('Cơ sở đang xem',exact=True).select_option('35');expect(panel).to_contain_text('Không có xe thuộc cơ sở đang chọn.');expect(panel.locator('.mg-rental-revenue-heading > strong')).to_contain_text('0')
  page.get_by_label('Cơ sở đang xem',exact=True).select_option('32');expect(panel).to_contain_text('80 xe chủ quản')
  page.get_by_role('button',name='Hôm nay',exact=True).click();expect(panel).to_have_attribute('aria-busy','false');q=private()[-1]['query'];assert q['from']==q['to'] and q['store_id']=='32'
  state['fail']=True;page.get_by_role('button',name='Tải lại',exact=True).click();expect(panel.get_by_role('alert')).to_contain_text('QA nguồn doanh thu gián đoạn');expect(panel.locator('.mg-rental-revenue-heading > strong')).to_have_text('—')
  panel.get_by_role('button',name='Thử lại báo cáo đội xe',exact=True).click();expect(panel).to_contain_text('80 xe chủ quản');expect(panel).to_have_attribute('aria-busy','false')
  state['bad_total']=True;page.get_by_role('button',name='Tải lại',exact=True).click();expect(panel.get_by_role('alert')).to_contain_text('Số liệu đội xe chưa khớp tổng');expect(panel.locator('.mg-rental-revenue-heading > strong')).to_have_text('—')
  panel.get_by_role('button',name='Thử lại báo cáo đội xe',exact=True).click();expect(panel).to_contain_text('80 xe chủ quản')
  checks.append(engine.name+': owner/date filters reach the API; empty scope shows genuine zero, read errors and invalid totals hide money and retry restores the report')
  ctx.close();browser.close()
assert not errors,errors
result=dict(passed=len(checks),checks=checks,jsErrors=errors,realBusinessWrites=0,privateReportMutations=0)
(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(result,ensure_ascii=False))
