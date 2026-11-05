"""Current Expo web bundle, synthetic API only; no real credentials or writes."""
import argparse, functools, http.server, json, threading
from pathlib import Path
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

p=argparse.ArgumentParser();p.add_argument('--build',type=Path,required=True);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
assert not args.output.exists();args.output.mkdir(parents=True)
class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if not (args.build/self.path.split('?')[0].lstrip('/')).is_file():self.path='/index.html'
        return super().do_GET()
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(args.build)))
threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
actor={'id':7,'name':'QA','email':'qa@example.invalid','role':'branch_manager','storeId':23,'allStores':False,'permissions':['contracts.read','contracts.finalize','vehicles.read','vehicles.receive']}
expiry=(datetime.now(timezone.utc)+timedelta(hours=8)).isoformat();now=datetime.now(timezone.utc).isoformat()
checks=[];errors=[];calls=[]
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch()
  for width,scheme in [(375,'light'),(430,'dark')]:
   context=browser.new_context(viewport={'width':width,'height':900},color_scheme=scheme,reduced_motion='reduce')
   state={'fail':0}
   def route(r):
    u=urlparse(r.request.url)
    if u.hostname=='127.0.0.1':r.continue_();return
    assert u.hostname=='mobile-api.example.invalid',u.hostname
    if r.request.method=='OPTIONS':
     r.fulfill(status=204,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'});return
    path=u.path.removeprefix('/api/mobile/v1');calls.append((path,r.request.method))
    def respond(data,status=200):r.fulfill(status=status,content_type='application/json',body=json.dumps(data),headers={'Access-Control-Allow-Origin':'*'})
    if path=='/session':respond({'token':'hm1_'+'a'*43,'expiresAt':expiry,'user':actor} if r.request.method=='POST' else {'expiresAt':expiry,'user':actor});return
    if path=='/workspace':respond({'user':actor,'stores':[{'id':23,'name':'QA Cơ sở'}]});return
    if path.startswith('/catalogue/'):respond({'rows':[],'total':0,'page':1,'pages':1,'statusCounts':[],'updatedAt':now});return
    if path=='/notifications/device':respond({'configured':False,'enabled':False});return
    if path=='/notifications/activity':
     before=parse_qs(u.query).get('before',[None])[0]
     respond({'rows':[{'id':1 if before else 2,'kind':'payment' if before else 'renewal','action':None,'resourceId':101,'resourceLabel':'QA-HD-101','createdAt':now}],'nextBefore':None if before else 2});return
    if path=='/notifications':
     if state['fail']:
      state['fail']-=1;respond({'message':'QA lỗi mạng tạm thời','code':'SERVICE_UNAVAILABLE'},503);return
     respond({'groups':[{'kind':'transfer','count':2},{'kind':'due','count':3},{'kind':'overdue','count':0},{'kind':'approval','count':21}],'observedAt':now});return
    if path=='/notifications/groups/approval':
     page=int(parse_qs(u.query).get('page',['1'])[0]);respond({'kind':'approval','rows':[{'id':i,'label':f'QA-{i}'} for i in (range(101,121) if page==1 else [121])],'total':21,'page':page,'pages':2,'observedAt':now});return
    respond({'message':'QA hồ sơ không tồn tại trong phạm vi','code':'NOT_FOUND'},404)
   context.route('**/*',route);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(base);expect(page.get_by_role('button',name='Đăng nhập',exact=True)).to_be_visible()
   assert page.get_by_text('Theo dõi đội xe',exact=False).count()==0
   logo=page.get_by_alt_text('Himoto',exact=True).first.bounding_box();assert abs(logo['x']+logo['width']/2-width/2)<4
   page.get_by_role('button',name='Đăng nhập',exact=True).click();expect(page.get_by_text('Nhập tài khoản và mật khẩu để tiếp tục.')).to_be_visible()
   page.screenshot(path=str(args.output/f'{width}-01-login.png'))
   page.get_by_role('textbox',name='Tài khoản',exact=True).fill('qa')
   page.get_by_label('Mật khẩu',exact=True).fill('synthetic-password')
   page.get_by_role('button',name='Đăng nhập',exact=True).click();page.wait_for_url(base+'/')
   state['fail']=2
   page.get_by_role('button',name='Mở Thông báo công việc',exact=True).click()
   expect(page.get_by_role('button',name='Tải lại công việc',exact=True)).to_be_visible(timeout=20000)
   page.screenshot(path=str(args.output/f'{width}-04-error-state.png'),full_page=True)
   page.get_by_role('button',name='Tải lại công việc',exact=True).click()
   expect(page.get_by_text('Công việc cần xử lý',exact=True)).to_be_visible()
   expect(page.get_by_role('button',name='Điều chuyển cần nhận: 2')).to_be_visible()
   expect(page.get_by_text('Hệ thống đang chuẩn bị thông báo đẩy.',exact=False)).to_be_visible()
   page.screenshot(path=str(args.output/f'{width}-02-notifications.png'),full_page=True)
   page.get_by_role('button',name='Mở sự kiện gần đây',exact=True).click()
   expect(page.get_by_text('Gia hạn hợp đồng',exact=True)).to_be_visible()
   expect(page.get_by_text('QA-HD-101',exact=True)).to_be_visible()
   page.get_by_role('button',name='Xem thêm',exact=True).click()
   expect(page.get_by_text('Thu tiền hợp đồng',exact=True)).to_be_visible()
   page.get_by_role('button',name='Mở hồ sơ QA-HD-101: Gia hạn hợp đồng',exact=True).click()
   page.wait_for_url('**/record/contracts/101')
   page.go_back();page.wait_for_url('**/notification-activity')
   page.go_back();page.wait_for_url('**/notifications')
   expect(page.get_by_role('button',name='Hợp đồng chờ duyệt: 21')).to_be_visible()
   page.get_by_role('button',name='Hợp đồng chờ duyệt: 21').click();expect(page.get_by_text('21 công việc · Trang 1/2')).to_be_visible()
   page.get_by_role('button',name='Trang sau',exact=True).click();expect(page.get_by_text('QA-121',exact=True)).to_be_visible()
   expect(page.get_by_role('button',name='Trang sau',exact=True)).to_be_disabled()
   page.screenshot(path=str(args.output/f'{width}-03-paged-approval.png'),full_page=True)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   checks.append({'width':width,'scheme':scheme,'centeredLogin':True,'groups':4,'paging':True,'activityFeed':True,'retry':True,'pushNotFalselyEnabled':True});context.close()
  browser.close()
 assert not errors,errors
 result={'ok':True,'flows':checks,'screenshots':8,'pageErrors':errors,'productionWrites':0,'externalPushMessages':0}
 (args.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(result,ensure_ascii=False))
finally:server.shutdown()
