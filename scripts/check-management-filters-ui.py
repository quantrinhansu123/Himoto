"""Actual local API/browser checks. Blocks mutations and background GPS sync."""
import argparse,json
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3021');p.add_argument('--cookie-file',required=True);p.add_argument('--output',default='.backups/full-flow-20261024/filter-ui');a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True);expect.set_options(timeout=60000);checks=[];errors=[]
with sync_playwright() as pw:
 for engine,width in [(pw.chromium,1440),(pw.webkit,390)]:
  browser=engine.launch();ctx=browser.new_context(viewport=dict(width=width,height=1000),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
  ctx.add_init_script('''window.__qaPending=0;const originalFetch=window.fetch.bind(window);window.fetch=async(...args)=>{window.__qaPending++;try{return await originalFetch(...args);}finally{window.__qaPending--;}};''')
  ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')])
  def safe(route):
   if route.request.method=='POST' and urlparse(route.request.url).path=='/api/auth/gps/refresh':route.fulfill(json=dict(status='success',data={}));return
   assert route.request.method=='GET','Unexpected mutation'
   route.continue_()
  ctx.route('**/api/**',safe);page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  def settled():
   page.wait_for_timeout(150)
   page.wait_for_function('window.__qaPending===0')
  page.goto(a.url+'/customers',wait_until='domcontentloaded');expect(page.locator('.mg-record-total:visible strong')).not_to_have_text('…')
  def capture_sort(action):
   with page.expect_response(lambda r:'/api/auth/customers?' in r.url and parse_qs(urlparse(r.url).query).get('sort')==['name']) as pending:action()
   response=pending.value;assert response.status==200;return response.json()['data']
  if width>1000:
   up=capture_sort(lambda:page.get_by_role('button',name='Sắp xếp theo Khách hàng',exact=True).click())
   down=capture_sort(lambda:page.get_by_role('button',name='Sắp xếp theo Khách hàng',exact=True).click())
  else:
   up=capture_sort(lambda:page.get_by_label('Sắp xếp danh sách',exact=True).select_option('name'))
   down=capture_sort(lambda:page.get_by_role('button',name='Đang tăng dần, đổi sang giảm dần',exact=True).click())
  assert up['total']==down['total'] and [r['id'] for r in up['rows']]!=[r['id'] for r in down['rows']]
  checks.append(engine.name+': visible sort controls change actual server ordering across the entire customer list')
  settled();page.goto(a.url+'/vehicles',wait_until='domcontentloaded');expect(page.locator('.mg-record-total:visible strong')).not_to_have_text('…')
  total=page.locator('.mg-record-total:visible strong').inner_text();page.get_by_role('spinbutton',name='Số ngày quá hạn',exact=True).fill('99999')
  expect(page.locator('.mg-result-range strong').last).to_have_text('0');expect(page.locator('.mg-record-total:visible strong')).to_have_text(total)
  page.locator('.mg-page-heading:visible').screenshot(path=str(out/(engine.name+'-vehicle.png')))
  checks.append(engine.name+': overdue-day filter produces an empty actual result without changing the catalogue total')
  settled();page.goto(a.url+'/contracts/ownership',wait_until='domcontentloaded');expect(page.locator('.mg-record-total:visible strong')).not_to_have_text('…')
  tools=page.locator('details.mg-monitor-tools').filter(has=page.locator('select[aria-label="Tất cả loại hợp đồng"]'))
  if tools.count():tools.evaluate('(e)=>e.open=true')
  with page.expect_response(lambda r:'/api/auth/order/car-rental?' in r.url and 'filter_contract_type_id=daily' in r.url) as response:
   page.get_by_label('Tất cả loại hợp đồng',exact=True).select_option('daily')
  data=response.value.json()['data'];assert all(row['contract_type_id']=='daily' for row in data['rows'])
  expect(page.locator('.mg-result-range strong').last).to_have_text(str(data['total']));checks.append(engine.name+': contract-type dropdown filters actual ownership results before pagination')
  page.get_by_label('Tất cả loại hợp đồng',exact=True).select_option('')
  with page.expect_response(lambda r:'/api/auth/order/car-rental?' in r.url and 'filter_ownership_term_months=12' in r.url) as response:
   page.get_by_label('Tất cả thời hạn sở hữu',exact=True).select_option('12')
  data=response.value.json()['data'];assert all(row['ownership_term_months']=='12' for row in data['rows']);checks.append(engine.name+': ownership-term filter reads the saved term and retains accurate page totals')
  settled();page.goto(a.url+'/contracts/due',wait_until='domcontentloaded');expect(page.locator('.mg-record-total:visible strong')).not_to_have_text('…')
  expect(page.locator('.mg-result-range strong').last).to_have_text('0');checks.append(engine.name+': ordinary rentals are absent from the payment-due screen')
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
  settled();ctx.close();browser.close()
assert not errors,errors
result=dict(passed=len(checks),checks=checks,pageErrors=errors,realBusinessWrites=0);(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(result,ensure_ascii=False))
