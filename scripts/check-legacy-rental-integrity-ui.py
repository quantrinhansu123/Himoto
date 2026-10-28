"""Test the real legacy Vue bundle with intercepted APIs. Never sends business writes."""
import argparse, copy, json
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

p=argparse.ArgumentParser();p.add_argument('--url',default='https://app.himoto.vn');p.add_argument('--inject',action='store_true');p.add_argument('--output',default='.backups/legacy-rental-alerts-20261029/ui');a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True);root=Path(__file__).resolve().parents[1];checks=[];errors=[];writes=[];expect.set_options(timeout=30000)
sample=[dict(id=575,license='19G1-423.19',name='SH125I',store_name='264 Đường Láng',store_status='opening',local_active_count=0,local_issue='App cũ chưa có hợp đồng đang giữ xe',level='info',message='Đã có hợp đồng và tên khách trên app mới. Cần đối chiếu dữ liệu giữa hai app.',new_checked_at='2026-10-29T02:00:00Z'),dict(id=1232,license='89AB-591.49',name='FELIZ',store_name='264 Đường Láng',store_status='opening',local_active_count=0,local_issue='App cũ chưa có hợp đồng đang giữ xe',level='warning',message='Chưa thấy hợp đồng giữ xe trên cả hai app. Cần xác nhận xe đang ở kho hay ở khách.',new_checked_at='2026-10-29T02:00:00Z')]
with sync_playwright() as pw:
 for engine,width in [('chromium',1440),('webkit',390)]:
  state={'reads':0,'fail':False,'offline':False,'empty':False,'queries':[]}
  def mock(route):
   request=route.request;url=urlparse(request.url);path=url.path
   if request.method not in ['GET','HEAD']:
    writes.append(request.method+' '+path);route.abort();return
   if path=='/api/verify-token':route.fulfill(json={'user':{'id':1,'role_id':1,'store_id':28,'name':'QA','email':'qa@example.invalid','status':'active','permissions':[]},'access_token':'qa-intercepted'});return
   if path=='/api/auth/vehicle/rental-integrity':
    state['reads']+=1;state['queries'].append(parse_qs(url.query))
    if state['fail']:state['fail']=False;route.fulfill(status=503,json={'status':'error'});return
    rows=[] if state['empty'] else copy.deepcopy(sample)
    if state['offline']:
     for row in rows:row.update(level='unknown',message='Chưa đối chiếu được app mới. Cần kiểm tra lại trước khi xử lý xe.',new_checked_at=None)
    if parse_qs(url.query).get('include_closed')==['1']:
     rows.append(dict(sample[1],id=800,license='QA-12345',store_name='Cơ sở đã đóng',store_status='closing',level='review',message='Cần rà hồ sơ cơ sở cũ.'))
    data=dict(checked_at='2026-10-29T02:00:00Z',new_checked_at=None if state['offline'] else '2026-10-29T02:00:00Z',checked_count=226,rows=rows,comparison_available=not state['offline'])
   elif path=='/api/auth/vehicle/vehicles':data={'data':[dict(sample[0],status='using',images=[],type='xesh',year=2024,cost_price=0,sale_price=0,store={'id':28,'store_name':'264 Đường Láng'})],'last_page':1,'current_page':1,'total':1}
   elif path.endswith('/vehicles/report'):data={'total_vehicle':226,'total_vehicle_using':226,'total_vehicle_ready':0,'total_vehicle_ga':0,'total_vehicle_so':0,'total_vehicle_con':0,'total_price':0}
   elif 'stores' in path:data=[{'id':28,'store_name':'264 Đường Láng','status':'opening'}]
   else:data=[]
   route.fulfill(json={'status':'success','data':data})
  browser=getattr(pw,engine).launch();ctx=browser.new_context(viewport={'width':width,'height':1000},accept_downloads=True,timezone_id='Asia/Ho_Chi_Minh')
  ctx.route('**/api/**',mock);ctx.add_init_script("localStorage.setItem('id_token','qa-intercepted');")
  page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(a.url+'/vehicles',wait_until='networkidle',timeout=120000)
  if a.inject:
   page.add_style_tag(path=str(root/'legacy/rental-integrity/rental-integrity.css'));page.add_script_tag(path=str(root/'legacy/rental-integrity/rental-integrity.js'))
  panel=page.get_by_role('region',name='Cảnh báo xe Đang thuê thiếu hợp đồng',exact=True);expect(panel).to_be_visible();expect(panel).to_contain_text('226 xe')
  info=panel.locator('article').filter(has_text='19G1-423.19');warning=panel.locator('article').filter(has_text='89AB-591.49');expect(info).to_contain_text('Đã có hợp đồng và tên khách trên app mới');expect(info).not_to_contain_text('Chưa thấy hợp đồng giữ xe trên cả hai app');expect(warning).to_contain_text('Cần xác nhận xe đang ở kho hay ở khách')
  expect(page.locator('.el-loading-mask:visible')).to_have_count(0)
  panel.screenshot(path=str(out/f'{engine}-two-apps.png'));checks.append(f'{engine}: actual legacy bundle mounts one report; existing new-app contract is informative and unlinked vehicle asks for physical verification')
  with page.expect_download() as pending:panel.get_by_role('button',name='Xuất cảnh báo CSV',exact=True).click()
  download=pending.value;target=out/f'{engine}-export.csv';download.save_as(target);text=target.read_text(encoding='utf-8-sig');assert '19G1-423.19' in text and '89AB-591.49' in text
  closed=panel.get_by_label('Bao gồm cơ sở đã đóng',exact=False);closed.check();expect(panel).to_contain_text('QA-12345');closed.uncheck();expect(panel.locator('article')).to_have_count(2)
  state['fail']=True;panel.get_by_role('button',name='Làm mới cảnh báo',exact=True).click();expect(panel.get_by_role('alert')).to_contain_text('Không tải được cảnh báo');expect(panel.get_by_role('button',name='Xuất cảnh báo CSV',exact=True)).to_be_disabled()
  state['offline']=True;panel.get_by_role('button',name='Làm mới cảnh báo',exact=True).click();expect(panel).to_contain_text('2 chưa đối chiếu được');expect(panel.locator('.himoto-integrity-warning')).to_have_count(0);expect(panel.get_by_role('alert')).to_contain_text('Chưa thể kết luận')
  state['offline']=False;state['empty']=True;panel.get_by_role('button',name='Làm mới cảnh báo',exact=True).click();expect(panel).to_contain_text('đều có hợp đồng và tên khách trên app cũ')
  state['empty']=False;panel.get_by_role('button',name='Làm mới cảnh báo',exact=True).click();expect(panel.locator('article')).to_have_count(2)
  page.set_viewport_size({'width':320,'height':900});panel.screenshot(path=str(out/f'{engine}-320.png'));assert panel.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
  checks.append(f'{engine}: CSV, closed-store toggle, API failure/retry, unavailable comparison, empty state and 320px panel work without business writes')
  # Navigate with Vue Router to test add-on lifecycle on the original runtime.
  page.evaluate("()=>{const el=[...document.querySelectorAll('body > *')].find(e=>e.__vue__);el.__vue__.$root.$router.push('/customers');}");expect(panel).to_have_count(0)
  page.evaluate("()=>{const el=[...document.querySelectorAll('body > *')].find(e=>e.__vue__);el.__vue__.$root.$router.push('/vehicles');}");expect(panel).to_be_visible();expect(panel).to_have_count(1);expect(panel.locator('article')).to_have_count(2)
  checks.append(f'{engine}: navigation destroys and remounts the panel once without duplicate reports')
  ctx.unroute_all(behavior='ignoreErrors');browser.close()
assert not writes,writes
assert not errors,errors
result={'passed':len(checks),'checks':checks,'javascriptErrors':errors,'realBusinessWrites':0,'realTelegramRequests':0};(out/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2))
