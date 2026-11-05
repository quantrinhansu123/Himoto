"""Record media editor acceptance with browser picker, synthetic JPEGs and API."""
import argparse,base64,hashlib,json,re
from copy import deepcopy
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from lib import mobile_record_media_fixture as model
def run(base_url,output):
    output.mkdir(parents=True,exist_ok=True);s=model.seed_state();checks=[];calls=[];errors=[];unexpected=[]
    jpeg=model.image_blob();fixture=output/'synthetic-media.jpg';fixture.write_bytes(jpeg)
    sources={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ('mobile/src','shared') for p in Path(folder).rglob('*') if p.suffix in ('.ts','.tsx')}
    with sync_playwright() as pw:
        browser=pw.chromium.launch();context=browser.new_context(viewport={'width':375,'height':812},color_scheme='light',reduced_motion='reduce')
        def intercept(route):
            request=route.request;u=urlparse(request.url)
            if u.netloc==urlparse(base_url).netloc:return route.continue_()
            if u.hostname!='mobile-api.example.invalid':unexpected.append(u.hostname);return route.abort()
            headers={'Access-Control-Allow-Origin':base_url.rstrip('/'),'Access-Control-Allow-Headers':'authorization,content-type,idempotency-key,x-record-revision,x-reference-revision,x-photo-revision,x-media-snapshot','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'}
            if request.method=='OPTIONS':return route.fulfill(status=204,headers=headers)
            body={'jpeg':base64.b64encode(request.post_data_buffer).decode()} if request.method=='PUT' else request.post_data_json if request.post_data else {}
            calls.append({'path':u.path,'method':request.method,'key':request.headers.get('idempotency-key')})
            status,data,_=model.response(request.url,request.method,body,request.headers,s)
            if status==404:unexpected.append(u.path)
            if '_bytesBase64' in data:return route.fulfill(status=status,headers={**headers,'Content-Type':data['mimeType']},body=base64.b64decode(data['_bytesBase64']))
            return route.fulfill(status=status,headers=headers,json=data)
        context.route('**/*',intercept);page=context.new_page();page.set_default_timeout(20000);page.on('pageerror',lambda error:errors.append(str(error)))
        def button(name):return page.get_by_role('button',name=name,exact=True)
        def heading(name):return page.get_by_role('heading',name=name,exact=True)
        def tab(name):return page.get_by_role('tab',name=name,exact=True)
        def tabs():
            for _ in range(4):
                try:expect(tab('Tài khoản')).to_be_visible(timeout=2500);return
                except AssertionError:pass
                page.get_by_role('link',name=re.compile(r', back$')).click()
            raise AssertionError('Could not reach tabs')
        def login(name='qa'):
            page.get_by_role('textbox',name='Tài khoản',exact=True).fill(name);page.get_by_label('Mật khẩu',exact=True).fill('fixture-password');button('Đăng nhập').click();expect(tab('Hợp đồng')).to_be_visible()
        def logout():tabs();tab('Tài khoản').click();button('Đăng xuất').click();expect(button('Đăng nhập')).to_be_visible()
        def record(entity='contracts'):
            tabs();tab('Hợp đồng' if entity=='contracts' else 'Đội xe').click()
            button('Xem HD-MEDIA-9101, Khách media QA' if entity=='contracts' else 'Xem QA-MEDIA-9102, Xe media QA').click();button('Ảnh và hồ sơ nghiệp vụ').click()
        def target(kind='return',n=1):
            if kind=='return':button('Trang hồ sơ ảnh tiếp').click();button(f'Trả xe · QA-MEDIA-{n} · #{91000+n}').click()
            else:button({'swap':'Đổi xe · QA-CŨ → QA-MỚI · #9130','transfer':'Chuyển xe · QA-MEDIA · #9140','receive':'Nhận xe · QA-MEDIA · #9141'}[kind]).click()
        def choose(label):button('Chọn mục ảnh hoặc video').click();button('Chọn mục '+label).click()
        def pick():
            with page.expect_file_chooser() as event:button('Chọn ảnh hồ sơ').click()
            event.value.set_files(str(fixture));expect(button('Rà soát ảnh hồ sơ')).to_be_enabled()
        def review():button('Rà soát ảnh hồ sơ').click();expect(heading('Rà soát ảnh trước khi lưu')).to_be_visible()
        def commit():button('Lưu ảnh hồ sơ').click();button('Xác nhận lưu ảnh hồ sơ').click()
        def ack():
            expect(heading('Ảnh đã được lưu vào hồ sơ')).to_be_visible();expect(button('Xác nhận đã kiểm tra phiếu lưu ảnh')).to_be_enabled();button('Xác nhận đã kiểm tra phiếu lưu ảnh').click();page.wait_for_url(re.compile(r'/record/(contracts|vehicles)/[0-9]+$'));tabs()
        def leave():page.get_by_role('link',name=re.compile(r', back$')).click();button('Rời ảnh hồ sơ').click();page.wait_for_url(re.compile(r'/record/(contracts|vehicles)/[0-9]+$'));tabs()
        def saved():return list(s['requests'].values())[-1]['receipt']
        try:
            page.goto(base_url);login();record();target();expect(button('Trang ảnh tiếp')).to_be_enabled()
            s['pageError']=True;button('Trang ảnh tiếp').click();expect(page.get_by_text('Lỗi tải trang ảnh QA.',exact=True)).to_be_visible();expect(button('Chọn mục ảnh hoặc video')).to_be_disabled()
            s['pageError']=False;button('Tải lại danh sách ảnh').click();expect(page.get_by_text('Video chưa hỗ trợ xem trong ứng dụng.',exact=True)).to_be_visible();button('Trang ảnh trước').click()
            button('Mở mục Toàn cảnh xe').click();expect(button('Thêm ảnh cùng mục, giữ ảnh hiện tại')).to_be_enabled();button('Thêm ảnh cùng mục, giữ ảnh hiện tại').click()
            expect(page.get_by_text('Toàn cảnh xe · Ảnh 13',exact=True)).to_be_visible();expect(page.get_by_text('Ô này chưa có ảnh.',exact=True)).to_be_visible()
            checks.append('Discovery paginates scoped lines and saved swaps; photo page failure disables selection until retry; supplemental slot13 is chosen from complete group metadata while the original image remains intact')
            original=deepcopy(s['photos']['contracts:9101:return:91001/return-91001-1']);pick();button('Xem lớn Ảnh hồ sơ đang chọn').click();button('Phóng to').click();button('Phóng to').click();expect(page.get_by_text('Mức 3× · Kéo để xem chi tiết.',exact=True)).to_be_visible();button('Đóng ảnh hồ sơ').click();review()
            assert s['writes']==0 and not s['requests'] and not any(c['key'] for c in calls)
            button('Lưu ảnh hồ sơ').click();button('Tiếp tục chỉnh sửa').click()
            for width,height,scheme in [(375,812,'light'),(430,932,'dark'),(812,375,'light'),(1024,768,'dark')]:
                page.set_viewport_size({'width':width,'height':height});page.emulate_media(color_scheme=scheme);button('Lưu ảnh hồ sơ').scroll_into_view_if_needed()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1');assert button('Lưu ảnh hồ sơ').bounding_box()['height']>=48
                page.screenshot(path=str(output/f'review-{width}-{scheme}.png'),full_page=True)
            page.set_viewport_size({'width':375,'height':812});page.emulate_media(color_scheme='light');commit();expect(heading('Ảnh đã được lưu vào hồ sơ')).to_be_visible()
            first=deepcopy(saved());assert first['slot']=='return-91001-1-extra-13';assert s['photos']['contracts:9101:return:91001/return-91001-1']==original
            page.screenshot(path=str(output/'original-supplemental-receipt.png'),full_page=True);ack()
            checks.append('Browser picker prepares actual bounded JPEG bytes, image preview/3x zoom and cancelled confirmation allocate no UUID; four responsive light/dark viewports and one confirmed supplemental receipt preserve the original slot')
            record();target();button('Mở mục Toàn cảnh xe').click();pick();review();commit();expect(heading('Ảnh đã được lưu vào hồ sơ')).to_be_visible();assert saved()['slot']=='return-91001-1';ack()
            checks.append('Explicit replacement requires the current image to load and reviews its exact slot/revision before one shared photo write; committed image loads again before acknowledgement')
            record();target();choose('Biên nhận thu phí / hoàn tiền');pick();review();s['mode']='lost';before=s['writes']
            with page.expect_response(lambda response: response.request.method=='PUT' and '/record-media/' in response.url): commit()
            expect(heading('Ảnh đang chờ đối chiếu')).to_be_visible();lost=deepcopy(saved());assert s['writes']==before+1
            leave();record();expect(heading('Ảnh đang chờ đối chiếu')).to_be_visible();expect(button('Chọn mục ảnh hoặc video')).to_have_count(0)
            leave();logout();login('qa8');tab('Tài khoản').click();expect(page.get_by_text('Không có thao tác chờ đối chiếu trong phạm vi này.',exact=True)).to_be_visible();logout();s['scopes']['7']=True;login();record();expect(heading('Ảnh đang chờ đối chiếu')).to_be_visible();leave()
            p=s['photos'][model.key(lost['target'])+'/'+lost['slot']];p['revision']=str(int(p['revision'])+1)
            tab('Tài khoản').click();button('Đối chiếu lưu ảnh hợp đồng #9101').click();button('Đối chiếu với máy chủ').click();button('Mở kết quả lưu ảnh hợp đồng #9101').click()
            expect(page.get_by_text('Ảnh trong ô này đã được thay hoặc gỡ. Phiếu vẫn giữ thông tin ảnh lúc lưu.',exact=True)).to_be_visible();expect(page.get_by_text('Mã '+lost['requestId'],exact=True)).to_be_visible();assert saved()==lost and s['writes']==before+1;ack()
            checks.append('Lost response locks all target editors for the parent; actor isolation, scope migration and Account recovery retain the exact UUID/proof, including independent later-photo warning without another upload')
            record();target();choose('Ảnh hồ sơ bổ sung 4');pick();review();s['mode']='drop';before=s['writes'];commit();expect(heading('Ảnh đang chờ đối chiếu')).to_be_visible();assert s['writes']==before
            button('Đối chiếu lưu ảnh với máy chủ').click();button('Đối chiếu với máy chủ').click();expect(button('Rà soát ảnh hồ sơ')).to_be_enabled()
            delayed=s['delayed'][-1];assert model.response(**delayed,s=s)[0]==409
            review();commit();ack();assert s['writes']==before+1
            checks.append('Dropped image stays selected after durable cancellation; late delivery returns409 and explicit fresh review under a new UUID creates exactly one photo')
            record();target();choose('Ảnh hồ sơ bổ sung 5');pick();review();s['mode']='conflict';before=s['writes'];commit();expect(heading('Ảnh đang chờ đối chiếu')).to_be_visible();assert s['writes']==before
            button('Đối chiếu lưu ảnh với máy chủ').click();button('Đối chiếu với máy chủ').click();button('Tải lại ô ảnh, giữ ảnh đang chọn').click();expect(button('Rà soát ảnh hồ sơ')).to_be_enabled();review();commit();ack()
            checks.append('Post-review conflict preserves the prepared photo, locks writing until reconciliation and requires updated exact target/slot metadata before another explicit confirmation')
            for kind,entity,slot_label in [('swap','contracts','Ảnh đổi xe 1'),('transfer','vehicles','Ảnh chuyển xe'),('receive','vehicles','Ảnh nhận xe')]:
                record(entity);target(kind);choose(slot_label);pick();review();commit();expect(heading('Ảnh đã được lưu vào hồ sơ')).to_be_visible();assert saved()['target']['kind']==kind;ack()
            checks.append('Saved swap and both transfer/receive events expose their own exact media targets and create only their respective slot receipts through the same picker/review/acknowledgement flow')
            tab('Tài khoản').click();expect(page.get_by_text('Không có thao tác chờ đối chiếu trong phạm vi này.',exact=True)).to_be_visible();logout()
            assert not errors and not unexpected,{'errors':errors,'unexpected':unexpected};assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest()==sha for p,sha in sources.items())
            checks.append('Final actor ledger is empty and logout clears protected UI; no browser errors/unexpected hosts and product source remains unchanged')
        except Exception:
            page.screenshot(path=str(output/'failure.png'),full_page=True);(output/'failure.txt').write_text(page.locator('body').inner_text(),encoding='utf-8');raise
        finally:
            result={'passed':len(checks),'checks':checks,'writes':s['writes'],'fixtureOnly':True,'errors':errors,'unexpected':unexpected,'source':sources}
            (output/'fixture-final.json').write_text(json.dumps(s,ensure_ascii=False,indent=2),encoding='utf-8')
            (output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');context.close();browser.close()
    print(json.dumps({k:v for k,v in result.items() if k!='source'},ensure_ascii=False,indent=2))
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:8083');parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();run(args.base_url,args.output)
