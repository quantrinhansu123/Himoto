"""Phone UI downloads actual web-builder XLSX; isolated browser context and network."""
import argparse
import base64
import json
import threading
from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import expect, sync_playwright


def run(build, fixture, output):
    assert (build/'metadata.json').is_file() and (build/'index.html').is_file() and not output.exists()
    data=json.loads(fixture.read_text(encoding='utf-8'));assert data['fixtureOnly']
    output.mkdir(parents=True)
    class Handler(SimpleHTTPRequestHandler):
        def log_message(self,*_args):pass
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(build)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    origin=f'http://127.0.0.1:{server.server_port}'
    user={'id':7,'name':'QA Excel','email':'qa@example.invalid','role':'staff','storeId':23,'allStores':False,'permissions':['customers.read']}
    expiry=(datetime.now(timezone.utc)+timedelta(hours=8)).isoformat()
    record=dict(id=1,code='QA-1',name='QA Excel',status='active',storeId=23,storeName='QA Store',license='',vehicleName='',phone='0900000002',startsAt='',endsAt='',totalAmount=None,paidAmount=None,brand='',color='',odometer=None)
    errors,unexpected,flows=[],[],[]
    try:
        with sync_playwright() as play:
            browser=play.chromium.launch()
            for width,scheme in [(375,'light'),(430,'dark')]:
                context=browser.new_context(viewport={'width':width,'height':900},color_scheme=scheme,reduced_motion='reduce',accept_downloads=True)
                state={'exports':0}
                def intercept(route):
                    request,url=route.request,urlparse(route.request.url)
                    if url.netloc==urlparse(origin).netloc:return route.continue_()
                    headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}
                    if request.method=='OPTIONS':return route.fulfill(status=204,headers=headers)
                    def respond(body,status=200):return route.fulfill(json=body,status=status,headers=headers)
                    if url.hostname!='mobile-api.example.invalid':unexpected.append(url.hostname);return route.abort()
                    if url.path.endswith('/session'):return respond({'user':user,'expiresAt':expiry,**({'token':'hm1_'+'a'*43}if request.method=='POST'else{})},201 if request.method=='POST'else 200)
                    if url.path.endswith('/workspace'):return respond({'user':user,'stores':[{'id':23,'name':'QA Store'}]})
                    if url.path.endswith('/catalogue/customers'):return respond({'rows':[record],'total':1,'page':1,'pages':1,'statusCounts':[],'updatedAt':expiry})
                    if url.path.endswith('/exports/customers/columns'):return respond(data['columns'])
                    if url.path.endswith('/exports/customers'):
                        params=parse_qs(url.query);assert params['format']==['xlsx']and set(params['columns'][0].split(','))=={'name','phone','id_card'}
                        assert request.method=='GET'and'idempotency-key'not in request.headers
                        state['exports']+=1;return respond(data['file'])
                    unexpected.append(url.path);return route.abort()
                context.route('**/*',intercept);page=context.new_page();page.set_default_timeout(20000);page.on('pageerror',lambda error:errors.append(str(error)))
                try:
                    page.goto(origin,wait_until='networkidle')
                    page.get_by_role('textbox',name='Tài khoản',exact=True).fill('qa')
                    page.get_by_label('Mật khẩu',exact=True).fill('fixture-password')
                    page.get_by_role('button',name='Đăng nhập',exact=True).click()
                    page.get_by_role('button',name='Mở Khách hàng',exact=True).click()
                    page.get_by_role('button',name='Tải Excel theo bộ lọc',exact=True).click()
                    button=page.get_by_role('button',name='Tải Excel với 3 cột',exact=True);expect(button).to_be_enabled()
                    page.screenshot(path=str(output/f'columns-{width}.png'),full_page=True)
                    with page.expect_download()as download:button.click()
                    target=output/f'customers-{width}.xlsx';download.value.save_as(target)
                    assert target.read_bytes()==base64.b64decode(data['file']['contentBase64'])
                    expect(page.get_by_text(f"Đã lưu 53 dòng vào {data['file']['filename']}.",exact=True)).to_be_visible()
                    assert state['exports']==1 and page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                    page.screenshot(path=str(output/f'downloaded-{width}.png'),full_page=True)
                    flows.append({'width':width,'scheme':scheme,'rows':53,'downloadBytesExact':True,'oneReadOnlyExport':True})
                except Exception:
                    page.screenshot(path=str(output/f'failure-{width}.png'),full_page=True)
                    (output/'failure-observed.json').write_text(json.dumps({'errors':errors,'unexpected':unexpected},indent=2),encoding='utf-8');raise
                finally:context.close()
            browser.close()
        assert not errors and not unexpected
        result={'ok':True,'fixtureOnly':True,'flows':flows,'screenshots':4,'pageErrors':errors,'unexpected':unexpected,'productionWrites':0,'nativeAcceptance':False}
        (output/'results.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps({'ok':True,'flows':len(flows)}))
    finally:server.shutdown()


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--build',type=Path,required=True);parser.add_argument('--fixture',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();run(args.build.resolve(),args.fixture.resolve(),args.output.resolve())
