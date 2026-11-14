"""Album UI/recovery against synthetic API only; never send customer/provider traffic."""
import argparse,base64,json,re,threading
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from lib import mobile_record_media_fixture as model

def run(web,output):
    output.mkdir(parents=True,exist_ok=False)
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self,*a,**k):super().__init__(*a,directory=str(web.resolve()),**k)
        def do_GET(self):
            if not Path(self.translate_path(self.path.split('?')[0])).is_file():self.path='/index.html'
            super().do_GET()
        def log_message(self,*a):pass
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}';state=model.seed_state();errors=[];calls=[];checks=[];put_count=0;battery_photos={};battery_sent=[];battery_event='00000000-0000-4000-8000-000000009201'
    photo=output/'synthetic.jpg';photo.write_bytes(model.image_blob())
    files=[{'name':f'QA-{i:02}.jpg','mimeType':'image/jpeg','buffer':photo.read_bytes()} for i in range(25)]
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch();context=browser.new_context(viewport={'width':375,'height':812},reduced_motion='reduce')
            def intercept(route):
                nonlocal put_count
                request=route.request;url=urlparse(request.url)
                if url.netloc==urlparse(base).netloc:return route.continue_()
                assert url.hostname=='mobile-api.example.invalid',url.hostname
                headers={'Access-Control-Allow-Origin':base,'Access-Control-Allow-Headers':'authorization,content-type,idempotency-key,x-record-revision,x-reference-revision,x-photo-revision,x-media-snapshot','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'}
                if request.method=='OPTIONS':return route.fulfill(status=204,headers=headers)
                media=re.fullmatch(r'/api/mobile/v1/battery-contracts/9201/media/([^/]+)(?:/([^/]+))?',url.path)
                if media:
                    assert media[1]==battery_event
                    if request.method=='PUT':
                        key=request.headers['idempotency-key'];old=battery_photos.get(media[2]);assert not old or old['key']==key
                        battery_photos[media[2]]={'key':key,'bytes':request.post_data_buffer}
                        return route.fulfill(status=200,headers=headers,json={'id':9201,'revision':'100','replayed':bool(old)})
                    if media[2]:return route.fulfill(status=200,headers={**headers,'Content-Type':'image/jpeg'},body=battery_photos[media[2]]['bytes'])
                    return route.fulfill(status=200,headers=headers,json={'id':9201,'eventKey':battery_event,'action':'return','canWrite':True,'rows':[{'id':id,'mimeType':'image/jpeg','bytes':len(photo['bytes']),'createdAt':model.now()}for id,photo in battery_photos.items()]})
                if url.path=='/api/mobile/v1/battery-contracts/9201/telegram':
                    if request.method=='POST':battery_sent.append(list(battery_photos))
                    return route.fulfill(status=200,headers=headers,json={'eligible':True,'battery_contract_id':9201,'request_id':battery_event,'destination_label':'Nhóm pin QA','text':'Synthetic battery return with photos','status':'sent'if battery_sent else None,'can_send':not battery_sent,'message_count':len(battery_photos)if battery_sent else 0,'photo_count':len(battery_photos)})
                if request.method=='PUT':
                    put_count+=1
                    if put_count==10:state['mode']='lost'
                body={'jpeg':base64.b64encode(request.post_data_buffer).decode()} if request.method=='PUT' else request.post_data_json if request.post_data else {}
                calls.append({'path':url.path,'method':request.method,'key':request.headers.get('idempotency-key')})
                status,data,_=model.response(request.url,request.method,body,request.headers,state)
                if '_bytesBase64'in data:return route.fulfill(status=status,headers={**headers,'Content-Type':data['mimeType']},body=base64.b64decode(data['_bytesBase64']))
                return route.fulfill(status=status,headers=headers,json=data)
            context.route('**/*',intercept);page=context.new_page();page.set_default_timeout(45000);page.on('pageerror',lambda e:errors.append(str(e)))
            button=lambda label:page.get_by_role('button',name=label,exact=True)
            def login():
                page.get_by_role('textbox',name='Tài khoản',exact=True).fill('qa');page.get_by_label('Mật khẩu',exact=True).fill('fixture-password');button('Đăng nhập').click();expect(page.get_by_role('tab',name='Hợp đồng',exact=True)).to_be_visible()
            def album():
                page.evaluate("history.pushState({},'', '/record-media/contracts/9101?kind=return&referenceId=91001'); dispatchEvent(new PopStateEvent('popstate'))")
                try:
                    button('Chọn mục ảnh hoặc video').click(timeout=15000);button('Chọn mục Toàn cảnh xe').click()
                except Exception:
                    page.screenshot(path=str(output/'failed-navigation.png'));print(json.dumps({'url':page.url,'text':page.locator('body').inner_text(),'errors':errors,'calls':calls[-12:]},ensure_ascii=False),flush=True);raise
            page.goto(base);login();album();print('Album opened',flush=True)
            with page.expect_file_chooser()as event:button('Chọn nhiều ảnh').click()
            assert event.value.is_multiple();event.value.set_files(files)
            expect(page.get_by_text('Đã lưu 0/25 ảnh · Còn 25. Ảnh đã lưu sẽ không tải lại khi thử tiếp.',exact=True)).to_be_visible()
            assert state['writes']==0
            page.reload();login();album();print('Album reopened after full reload and login',flush=True)
            expect(page.get_by_text('Đã lưu 0/25 ảnh · Còn 25. Ảnh đã lưu sẽ không tải lại khi thử tiếp.',exact=True)).to_be_visible()
            button('Xem ảnh 25').click();expect(button('Xem lớn Ảnh plate-1')).to_have_count(0)
            checks.append('System file chooser accepts 25 files at once; every selected file survives full browser reload in the original record/group before any upload')
            button('Lưu bộ ảnh vào hồ sơ').click();expect(page.get_by_text('Đã lưu 9/25 ảnh · Còn 16. Ảnh đã lưu sẽ không tải lại khi thử tiếp.',exact=True)).to_be_visible()
            expect(button('Thử lưu tiếp phần ảnh lỗi')).to_be_enabled()
            assert state['writes']==10
            button('Thử lưu tiếp phần ảnh lỗi').click();expect(page.get_by_text('Đã lưu 25/25 ảnh · Còn 0. Ảnh đã lưu sẽ không tải lại khi thử tiếp.',exact=True)).to_be_visible()
            assert state['writes']==25 and put_count==26
            keys=[c['key']for c in calls if c['method']=='PUT'];assert keys[9]==keys[10]and len(set(keys))==25
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
            page.screenshot(path=str(output/'album-saved-375.png'))
            checks.append('Lost response after tenth commit retains the exact request/body; retry skips nine acknowledged photos and creates exactly 25 server photos from 26 calls')
            button('Hoàn tất bộ ảnh đã lưu').click();expect(page.get_by_text('Đã lưu 0/0 ảnh · Còn 0. Ảnh đã lưu sẽ không tải lại khi thử tiếp.',exact=True)).to_be_visible()
            page.evaluate("history.pushState({},'', '/battery-media/9201/"+battery_event+"'); dispatchEvent(new PopStateEvent('popstate'))")
            with page.expect_file_chooser()as event:button('Chọn nhiều ảnh').click()
            assert event.value.is_multiple();event.value.set_files(files)
            expect(page.get_by_text('Đã lưu 0/25 ảnh · Còn 25. Ảnh đã lưu sẽ không tải lại khi thử tiếp.',exact=True)).to_be_visible()
            expect(button('Rà soát gửi Telegram trả pin')).to_be_disabled()
            button('Lưu bộ ảnh vào hồ sơ').click();expect(page.get_by_text('Đã lưu 25/25 ảnh · Còn 0. Ảnh đã lưu sẽ không tải lại khi thử tiếp.',exact=True)).to_be_visible()
            expect(page.get_by_text(re.compile('25 ảnh sẽ gửi.'))).to_be_visible();button('Rà soát gửi Telegram trả pin').click();button('Xác nhận gửi Telegram trả pin').click()
            expect(button('Rà soát gửi Telegram trả pin')).to_have_count(0);assert len(battery_photos)==25 and len(battery_sent)==1 and len(battery_sent[0])==25
            page.screenshot(path=str(output/'battery-return-telegram.png'))
            checks.append('Battery return accepts 25 photos in one selection, blocks Telegram until all are saved and sends exactly that event album through its own confirmation without repeating the battery transaction')
            context.close();browser.close()
        assert not errors,errors
        result={'passed':len(checks),'checks':checks,'fixtureOnly':True,'photosSaved':state['writes'],'batteryPhotosSaved':len(battery_photos),'uploadCalls':put_count,'pageErrors':errors,'realDatabaseWrites':0,'realMessagesSent':0}
        (output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False),flush=True)
    finally:server.shutdown()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--web',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();run(args.web,args.output)
