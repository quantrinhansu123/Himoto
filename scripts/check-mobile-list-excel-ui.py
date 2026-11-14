"""Phone browser list export: real workbook bytes, failure/retry, isolated API."""
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
    assert (build/'index.html').is_file() and not output.exists()
    data=json.loads(fixture.read_text(encoding='utf-8')); assert data['fixtureOnly']
    file=data['files']['transfers']; assert file['rowCount']==53
    output.mkdir(parents=True)
    class Handler(SimpleHTTPRequestHandler):
        def log_message(self,*_args): pass
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(build)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    origin=f'http://127.0.0.1:{server.server_port}'
    user=dict(id=7,name='QA Excel',email='qa@example.invalid',role='staff',storeId=23,allStores=False,permissions=['vehicles.read'])
    expiry=(datetime.now(timezone.utc)+timedelta(hours=8)).isoformat()
    row=dict(id=1,vehicle_id=1,vehicle_name='QA xe',license='000123',from_store_id=23,to_store_id=24,from_store='QA A',to_store='QA B',action='receive',label='Nhận xe',at=expiry,actor='QA',note='QA',changes=[])
    errors,unexpected,flows=[],[],[]
    try:
        with sync_playwright() as play:
            browser=play.chromium.launch()
            for width,scheme in [(375,'light'),(430,'dark')]:
                context=browser.new_context(viewport={'width':width,'height':900},color_scheme=scheme,reduced_motion='reduce',accept_downloads=True)
                state={'exports':0}
                def intercept(route):
                    request,url=route.request,urlparse(route.request.url)
                    if url.netloc==urlparse(origin).netloc: return route.continue_()
                    headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}
                    if request.method=='OPTIONS': return route.fulfill(status=204,headers=headers)
                    def respond(body,status=200): return route.fulfill(json=body,status=status,headers=headers)
                    if url.hostname!='mobile-api.example.invalid': unexpected.append(url.hostname); return route.abort()
                    if url.path.endswith('/session'): return respond({'user':user,'expiresAt':expiry,**({'token':'hm1_'+'a'*43}if request.method=='POST'else{})},201 if request.method=='POST'else 200)
                    if url.path.endswith('/workspace'): return respond({'user':user,'stores':[{'id':23,'name':'QA A'},{'id':24,'name':'QA B'}]})
                    if url.path.endswith('/catalogue/vehicles'): return respond({'rows':[],'total':0,'page':1,'pages':1,'statusCounts':[],'updatedAt':expiry})
                    if url.path.endswith('/vehicles/transfers'):
                        params=parse_qs(url.query);return respond(dict(rows=[row],total=53,scopeCount=53,page=1,pages=3,size=25,**{k:params[k][0]for k in ['from','to']}))
                    if url.path.endswith('/list-exports/transfers'):
                        params=parse_qs(url.query); assert params['search']==['QA'] and 'page'not in params
                        assert request.method=='GET' and 'idempotency-key'not in request.headers
                        state['exports']+=1
                        if state['exports']==1:return respond({'code':'EXPORT_INCOMPLETE','message':'Danh sách xuất chưa ổn định. Tải lại.'},503)
                        return respond(file)
                    unexpected.append(url.path); return route.abort()
                context.route('**/*',intercept)
                page=context.new_page();page.set_default_timeout(20000);page.on('pageerror',lambda e:errors.append(str(e)))
                button=lambda label:page.get_by_role('button',name=label,exact=True).last
                try:
                    page.goto(origin,wait_until='networkidle')
                    page.get_by_role('textbox',name='Tài khoản',exact=True).fill('qa')
                    page.get_by_label('Mật khẩu',exact=True).fill('fixture-password')
                    button('Đăng nhập').click()
                    button('Mở Danh sách xe').click()
                    button('Thao tác khác').click()
                    button('Lịch sử điều chuyển').click()
                    page.get_by_role('textbox',name='Tìm biển số, xe, cơ sở, người thực hiện',exact=True).fill('QA')
                    expect(button('Tải Excel theo bộ lọc')).to_be_enabled()
                    button('Tải Excel theo bộ lọc').click()
                    expect(page.get_by_text('Danh sách xuất chưa ổn định. Tải lại.',exact=True)).to_be_visible()
                    page.screenshot(path=str(output/f'failed-retry-{width}.png'),full_page=True)
                    with page.expect_download() as download: button('Tải Excel theo bộ lọc').click()
                    target=output/f'transfers-{width}.xlsx';download.value.save_as(target)
                    assert target.read_bytes()==base64.b64decode(file['contentBase64'])
                    expect(page.get_by_text(f"Đã lưu 53 dòng vào {file['filename']}.",exact=True)).to_be_visible()
                    assert state['exports']==2 and page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                    page.screenshot(path=str(output/f'downloaded-{width}.png'),full_page=True)
                    flows.append(dict(width=width,scheme=scheme,exportRows=53,mountedRows=1,downloadBytesExact=True,errorRetry=True,writeRequests=0))
                except Exception:
                    page.screenshot(path=str(output/f'failure-{width}.png'),full_page=True)
                    (output/'failure-observed.json').write_text(json.dumps(dict(errors=errors,unexpected=unexpected),indent=2),encoding='utf-8');raise
                finally:context.close()
            browser.close()
        assert not errors and not unexpected
        (output/'results.json').write_text(json.dumps(dict(ok=True,fixtureOnly=True,flows=flows,screenshots=4,errors=errors,unexpected=unexpected,productionWrites=0,nativeAcceptance=False),indent=2),encoding='utf-8')
        print(json.dumps(dict(ok=True,flows=len(flows))))
    finally:server.shutdown()


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--build',type=Path,required=True);parser.add_argument('--fixture',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();run(args.build.resolve(),args.fixture.resolve(),args.output.resolve())
