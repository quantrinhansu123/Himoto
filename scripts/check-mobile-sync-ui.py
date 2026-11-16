"""Synthetic exported app checks: attendance history, exact workbook and uncertain admin edits."""
import argparse,base64,importlib.util,json,threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from functools import partial
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect

def run(build,fixture,output):
 assert (build/'index.html').is_file() and not output.exists()
 data=json.loads(fixture.read_text(encoding='utf8'));assert data['fixtureOnly'];output.mkdir(parents=True)
 spec=importlib.util.spec_from_file_location('parity',Path(__file__).with_name('check-mobile-web-parity-ui.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 workflow=json.loads(Path('.backups/mobile-parity-workflow-fixtures-20261114/fixture.json').read_text(encoding='utf8'));catalogue=json.loads(Path('.backups/mobile-parity-catalogue-fixtures-20261114/catalogue.json').read_text(encoding='utf8'))
 class Handler(SimpleHTTPRequestHandler):
  def log_message(self,*_):pass
 server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(build)));threading.Thread(target=server.serve_forever,daemon=True).start();origin=f'http://127.0.0.1:{server.server_port}'
 errors=[];flows=[]
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch()
   for width,scheme in [(390,'light'),(430,'dark')]:
    state={'writes':0};mock=module.Fixture(workflow,catalogue);mock.user['role']='admin'
    context=browser.new_context(viewport={'width':width,'height':900},color_scheme=scheme,accept_downloads=True)
    def intercept(route):
     r=route.request;url=urlparse(r.url)
     if url.netloc==urlparse(origin).netloc:return route.continue_()
     headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS'}
     if r.method=='OPTIONS':return route.fulfill(status=204,headers=headers)
     assert url.hostname=='mobile-api.example.invalid'
     path=url.path.removeprefix('/api/mobile/v1')
     if path=='/attendance':
      if r.method in ['PATCH','DELETE']:
       state['writes']+=1;return route.fulfill(status=503,json={'code':'SERVICE_UNAVAILABLE','message':'QA mất phản hồi sau ghi'},headers=headers)
      value=data['summary'];return route.fulfill(status=200,json=value,headers=headers)
     if path=='/list-exports/attendance':return route.fulfill(status=200,json=data['file'],headers=headers)
     status,value=mock.respond(r.method,r.url,r.post_data_json if r.post_data else None);return route.fulfill(status=status,json=value,headers=headers)
    context.route('**/*',intercept);page=context.new_page();page.set_default_timeout(25000);page.on('pageerror',lambda e:errors.append(str(e)))
    button=lambda name:page.get_by_role('button',name=name,exact=True).last
    page.goto(origin);page.get_by_label('Tài khoản',exact=True).fill('qa');page.get_by_label('Mật khẩu',exact=True).fill('fixture-password');button('Đăng nhập').click()
    button('Mở danh mục quản lý').click();button('Lịch sử chấm công').click()
    expect(page.get_by_text('Công thực tế: 0,9375',exact=True)).to_be_visible();expect(page.get_by_text('Về sớm 15 phút',exact=True)).to_be_visible()
    with page.expect_download() as download:button('Tải Excel theo bộ lọc').click()
    download.value.save_as(output/f'attendance-{width}.xlsx');assert (output/f'attendance-{width}.xlsx').read_bytes()==base64.b64decode(data['file']['contentBase64'])
    button('Sửa chấm công').click();button('Lưu thay đổi').click();button('Lưu thay đổi').click()
    expect(page.get_by_text('QA mất phản hồi sau ghi',exact=False)).to_be_visible();expect(button('Lưu thay đổi')).to_be_disabled();assert state['writes']==1
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(output/f'uncertain-edit-{width}.png'),full_page=True)
    button('Tải lại để đối chiếu').click();expect(page.get_by_text('Công thực tế: 0,9375',exact=True)).to_be_visible()
    page.screenshot(path=str(output/f'history-{width}.png'),full_page=True);flows.append({'width':width,'scheme':scheme,'creditsAndEarlyLeave':True,'exactWorkbook':True,'uncertainWriteBlocked':True,'writes':state['writes']});context.close()
   browser.close()
  assert not errors,errors
  result={'ok':True,'flows':flows,'fixtureOnly':True,'productionWrites':0,'physicalDeviceAcceptance':False};(output/'results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
 finally:server.shutdown()
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--build',type=Path,required=True);p.add_argument('--fixture',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();run(a.build.resolve(),a.fixture.resolve(),a.output.resolve())
