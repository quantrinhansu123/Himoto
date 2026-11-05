"""Small-screen list acceptance with synthetic admin data and no operational writes."""
import argparse,json,math,runpy
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import parse_qs,urlparse
from playwright.sync_api import sync_playwright,expect

fixtures=runpy.run_path('scripts/check-mobile-ui.py',run_name='fixture_definitions')
record=fixtures['record']
user={**fixtures['USER'],'role':'admin','allStores':True,'permissions':[
    'vehicles.read','vehicles.write','contracts.read','contracts.draft','customers.read','customers.write',
    'finance.read','hr.read','settings.write']}
parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:8098');parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=False)
checks=[];errors=[];unexpected=[];calls=[]
with sync_playwright() as p:
 browser=p.chromium.launch()
 for width,height in [(360,740),(390,844),(740,360)]:
  context=browser.new_context(viewport={'width':width,'height':height},reduced_motion='reduce')
  def intercept(route):
   request=route.request;url=urlparse(request.url)
   if url.netloc==urlparse(args.url).netloc:return route.continue_()
   if url.hostname!='mobile-api.example.invalid':unexpected.append(url.hostname);return route.abort()
   headers={'Access-Control-Allow-Origin':args.url,'Access-Control-Allow-Headers':'authorization,content-type,idempotency-key','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'}
   if request.method=='OPTIONS':return route.fulfill(status=204,headers=headers)
   calls.append({'path':url.path,'method':request.method,'query':parse_qs(url.query)})
   def respond(data,status=200):return route.fulfill(status=status,headers=headers,json=data)
   if url.path.endswith('/session'):
    if request.method=='POST':return respond({'token':fixtures['TOKEN'],'expiresAt':fixtures['EXPIRY'],'user':user},201)
    if request.method=='DELETE':return respond({'success':True})
    return respond({'user':user,'expiresAt':fixtures['EXPIRY']})
   if url.path.endswith('/workspace'):return respond({'user':user,'stores':fixtures['STORES']})
   thumbnail=fixtures['thumbnail_response'](request.url,request.method)
   if thumbnail is not None:return respond(thumbnail)
   if '/catalogue/' in url.path:
    kind=url.path.split('/catalogue/')[1];params=parse_qs(url.query)
    rows=[record(kind,n) for n in range(1,61)]
    search=params.get('search',[''])[0].lower()
    if search:rows=[r for r in rows if search in (r['name']+r['code']+r['license']).lower()]
    size=int(params.get('size',['20'])[0]);pages=max(1,math.ceil(len(rows)/size));page=min(int(params.get('page',['1'])[0]),pages)
    return respond({'rows':rows[(page-1)*size:page*size],'total':len(rows),'page':page,'pages':pages,'statusCounts':[],'updatedAt':datetime.now(timezone.utc).isoformat()})
   raise AssertionError(f'Unexpected fixture endpoint: {request.method} {url.path}')
  context.route('**/*',intercept)
  page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
  try:
   page.goto(args.url,wait_until='networkidle')
   page.get_by_role('textbox',name='Tài khoản',exact=True).fill('qa-scroll')
   page.get_by_label('Mật khẩu',exact=True).fill('fixture-password')
   page.get_by_role('button',name='Đăng nhập',exact=True).click()
   expect(page.get_by_role('button',name='Mở Đội xe',exact=True)).to_be_visible()
   # Order is evaluated in the actual rendered navigation, with admin-only links present.
   links=page.get_by_role('button').all_text_contents()
   daily=['Thao tác nhanh','Báo cáo cuối ca','Sổ quỹ / Sổ két','Điều chuyển xe']
   settings=['Nhập nháp hợp đồng Excel','Loại hợp đồng','Tài khoản và phân quyền','Tích hợp GPS và Telegram']
   positions={label:next(i for i,text in enumerate(links) if label in text) for label in daily+settings}
   assert max(positions[label] for label in daily)<min(positions[label] for label in settings),positions
   for kind,tab,search_label,first in [
       ('vehicles','Đội xe','Tìm đội xe','Xem QA-001, Xe QA 1'),
       ('customers','Khách hàng','Tìm khách hàng','Xem QA-001, Khách QA 1'),
       ('contracts','Hợp đồng','Tìm hợp đồng','Xem HD-QA-001, Khách QA 1')]:
    page.get_by_role('tab',name=tab,exact=True).click()
    search=page.get_by_role('textbox',name=search_label,exact=True)
    expect(search).to_be_attached()
    first_card=page.get_by_role('button',name=first,exact=True)
    expect(first_card).to_be_attached()
    first_card.evaluate('''el=>{
      document.querySelectorAll('[data-qa-active-scroll]').forEach(node=>node.removeAttribute('data-qa-active-scroll'));
      for(let node=el.parentElement;node;node=node.parentElement){
        if(/auto|scroll/.test(getComputedStyle(node).overflowY)&&node.scrollHeight>node.clientHeight){window.__listScroll=node;node.setAttribute('data-qa-active-scroll','true');return;}
      }
      throw new Error('No vertical list scroller');
    }''')
    assert search.evaluate('el=>window.__listScroll.contains(el)'),f'{kind}: toolbar must share the list scroller'
    first_card.scroll_into_view_if_needed()
    before=search.bounding_box()['y']
    viewport=page.evaluate('({top:window.__listScroll.getBoundingClientRect().top,height:window.__listScroll.clientHeight})')
    page.mouse.move(width//2,int(viewport['top']+viewport['height']*.65));page.mouse.wheel(0,650)
    page.wait_for_function('window.__listScroll.scrollTop > 100')
    page.wait_for_timeout(350)
    after=search.bounding_box()['y']
    assert after<before-100,(kind,before,after)
    visible=page.get_by_role('button',name='Xem ',exact=False).evaluate_all('''els=>els.filter(el=>{
      const r=el.getBoundingClientRect(),s=window.__listScroll.getBoundingClientRect();
      return r.top>=s.top-1&&r.bottom<=s.bottom+1;
    }).length''')
    if height>=500:assert visible>=2,(kind,visible,width,height)
    else:
     assert page.get_by_role('button',name='Xem ',exact=False).evaluate_all('''els=>els.some(el=>{
       const r=el.getBoundingClientRect(),s=window.__listScroll.getBoundingClientRect();
       return Math.min(r.bottom,s.bottom)-Math.max(r.top,s.top)>=96;
     })'''),f'{kind}: records remain readable in the landscape viewport'
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    page.screenshot(path=str(args.output/f'{kind}-scrolled-{width}.png'))
    search.scroll_into_view_if_needed();search.fill('QA-023')
    expect(search).to_have_value('QA-023');expect(search).to_be_focused()
    expect(page.get_by_role('button',name='Xem QA-023, Xe QA 23' if kind=='vehicles' else 'Xem HD-QA-023, Khách QA 23' if kind=='contracts' else 'Xem QA-023, Khách QA 23',exact=True)).to_be_attached()
    expect(search).to_be_focused();search.fill('')
    expect(first_card).to_be_attached()
    page.locator('[data-qa-active-scroll]').get_by_text('Cuộn để xem thêm',exact=True).scroll_into_view_if_needed()
    expect(page.get_by_role('button',name='Xem QA-021, Xe QA 21' if kind=='vehicles' else 'Xem HD-QA-021, Khách QA 21' if kind=='contracts' else 'Xem QA-021, Khách QA 21',exact=True)).to_be_attached(timeout=15000)
    checks.append(f'{tab} {width}x{height}: toolbar scrolls away, cards fill the screen, search keeps focus and pagination appends')
   page.get_by_role('tab',name='Tài khoản',exact=True).click();page.get_by_role('button',name='Đăng xuất',exact=True).click()
   expect(page.get_by_role('button',name='Đăng nhập',exact=True)).to_be_visible()
  except Exception as error:
   page.screenshot(path=str(args.output/f'failure-{width}.png'))
   (args.output/'failure-debug.json').write_text(json.dumps({'calls':calls,'scroll':page.evaluate('({top:window.__listScroll?.scrollTop,height:window.__listScroll?.clientHeight,total:window.__listScroll?.scrollHeight})')},ensure_ascii=False,indent=2),encoding='utf8')
   (args.output/'failure.txt').write_text(str(error)+'\n'+page.locator('body').inner_text(),encoding='utf8');raise
  finally:context.close()
 browser.close()
assert not errors and not unexpected,(errors,unexpected)
assert not [c for c in calls if c['method']!='GET' and not c['path'].endswith('/session')],calls
result={'ok':True,'checks':checks,'menu':'Daily operations before all configuration links','pageErrors':errors,'externalHosts':unexpected,'syntheticOnly':True,'operationalWrites':0}
(args.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(result,ensure_ascii=False))
