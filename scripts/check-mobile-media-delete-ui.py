"""Delete/review/recovery UI against a durable synthetic model."""
import argparse,base64,json,re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from lib.mobile_fixture_journal import FixtureJournal
from lib import mobile_contract_flow_fixture as model
from lib.mobile_media_delete_fixture import seed_delete_sources,replace_photo

def run(base,output):
    output.mkdir(parents=True,exist_ok=False);journal=FixtureJournal(output/'state.json',model=model);journal.control(seed_delete_sources);checks=[];errors=[];unexpected=[];transport={'hold':False,'held':[]}
    with sync_playwright() as p:
        browser=p.chromium.launch();context=browser.new_context(viewport={'width':375,'height':812},reduced_motion='reduce')
        def intercept(route):
            request=route.request;url=urlparse(request.url)
            if url.netloc==urlparse(base).netloc:return route.continue_()
            if url.hostname!='mobile-api.example.invalid':unexpected.append(url.hostname);return route.abort()
            headers={'Access-Control-Allow-Origin':base,'Access-Control-Allow-Headers':'authorization,content-type,idempotency-key,x-record-revision,x-reference-revision,x-media-snapshot,x-photo-revision','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'}
            if request.method=='OPTIONS':return route.fulfill(status=204,headers=headers)
            if transport['hold'] and request.method=='GET' and url.path.endswith('/rental-1') and 'revision=' in url.query:
                transport['held'].append((route,headers));return
            body=request.post_data_json if request.post_data else {};status,data,lost=journal.transact(url.path+('?' +url.query if url.query else ''),request.method,body,dict(request.headers))
            if lost:status,data=503,{'code':'SERVICE_UNAVAILABLE','message':'QA mất phản hồi sau xóa tệp.'}
            if '_bytesBase64' in data:return route.fulfill(status=status,headers={**headers,'Content-Type':data['mimeType']},body=base64.b64decode(data['_bytesBase64']))
            route.fulfill(status=status,headers=headers,json=data)
        context.route('**/*',intercept);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));button=lambda name:page.get_by_role('button',name=name,exact=True)
        def mode(value):journal.control(lambda state:state.update(mode=value))
        def target():button('Ảnh lập hợp đồng / giao xe · #2001').click()
        def open_photo(label):button('Mở mục '+label).click();button('Xóa tệp khỏi hồ sơ').click();expect(button('Xóa tệp đã rà soát')).to_be_enabled()
        def remove():button('Xóa tệp đã rà soát').click();button('Xác nhận xóa tệp').click()
        def acknowledge():button('Đã kiểm tra phiếu xóa ảnh').click();expect(button('Ảnh lập hợp đồng / giao xe · #2001')).to_be_visible()
        try:
            page.goto(base);page.get_by_role('textbox',name='Tài khoản',exact=True).fill('qa');page.get_by_label('Mật khẩu',exact=True).fill('fixture-password');button('Đăng nhập').click();page.get_by_role('tab',name='Hợp đồng',exact=True).click();page.get_by_text('NHAP-2001',exact=True).click();button('Ảnh và hồ sơ nghiệp vụ').click();target();open_photo('Khi thuê · Hợp đồng đã ký')
            button('Xóa tệp đã rà soát').click();expect(page.get_by_text('Xóa tệp khỏi hồ sơ?',exact=True)).to_be_visible();button('Tiếp tục chỉnh sửa').click();assert journal.state.get('media_deletes',0)==0
            checks.append('Reviewed image must load before deletion; cancelling confirmation leaves all saved files untouched')
            mode('delete-lost');remove();expect(button('Đối chiếu xóa ảnh với máy chủ')).to_be_visible();assert journal.state['media_deletes']==1
            journal.control(lambda state:replace_photo(state,'rental-document-1'));button('Đối chiếu xóa ảnh với máy chủ').click();expect(page.get_by_role('heading',name='Phiếu xóa ảnh đã ghi',exact=True)).to_be_visible();expect(page.get_by_text('Mục này đã có tệp khác sau lần xóa. Phiếu gốc được giữ; tệp mới không bị xóa lại.',exact=True)).to_be_visible()
            saved=next(iter(journal.state['media_delete_receipts'].values()));replay=journal.transact(saved['path'],'DELETE',{},saved['headers'])[1];assert not replay['slotEmpty'] and journal.state['media_deletes']==1
            page.screenshot(path=str(output/'01-original-delete-replacement-kept.png'),full_page=True);acknowledge();assert '2001:rental-document-1' in journal.state['contract_photos']
            checks.append('Lost delete response recovers the original proof after another image appears; replay never removes the replacement')
            target();open_photo('Khi thuê · Bill chuyển khoản / tổng tiền mặt');journal.control(lambda state:replace_photo(state,'rental-document-2'));remove();expect(page.get_by_text('QA tệp đã thay đổi trước khi xóa',exact=True)).to_be_visible();button('Đối chiếu xóa ảnh với máy chủ').click();expect(button('Tải lại kết quả xóa ảnh')).to_be_enabled();assert journal.state['media_deletes']==1
            button('Tải lại kết quả xóa ảnh').click();expect(button('Xóa tệp đã rà soát')).to_be_enabled();mode('delete-drop');remove();expect(button('Đối chiếu xóa ảnh với máy chủ')).to_be_visible();button('Đối chiếu xóa ảnh với máy chủ').click();expect(button('Tải lại kết quả xóa ảnh')).to_be_enabled();assert journal.transact(**journal.state['delayed_media_delete'])[0]==409
            button('Tải lại kết quả xóa ảnh').click();expect(button('Xóa tệp đã rà soát')).to_be_enabled();remove();expect(button('Đã kiểm tra phiếu xóa ảnh')).to_be_visible();acknowledge();assert journal.state['media_deletes']==2
            checks.append('A replaced image rejects the old review; stale/drop keys are tombstoned before late409, then an explicitly reloaded review deletes the intended current image')
            target();button('Mở mục Khi thuê · Video 1').click();button('Xóa tệp khỏi hồ sơ').click();expect(button('Xóa tệp đã rà soát')).to_be_disabled();page.get_by_role('checkbox').click();expect(button('Xóa tệp đã rà soát')).to_be_enabled();remove();expect(button('Đã kiểm tra phiếu xóa ảnh')).to_be_visible();page.screenshot(path=str(output/'02-video-delete-proof.png'),full_page=True);acknowledge();assert journal.state['media_deletes']==3
            checks.append('Existing video deletion requires explicit metadata acknowledgement without enabling video upload')
            target();button('Mở mục Khi thuê · Ảnh tổng thể xe').click();transport['hold']=True;button('Xóa tệp khỏi hồ sơ').click();expect(page.get_by_role('heading',name='Rà soát tệp trước khi xóa',exact=True)).to_be_visible();expect(button('Xóa tệp đã rà soát')).to_be_disabled();expect(page.get_by_role('checkbox')).not_to_be_visible();assert transport['held']
            journal.control(lambda state:state.update(media_delete_image_failure=True));transport['hold']=False
            for held,headers in transport['held']:held.fulfill(status=503,headers=headers,json={'message':'QA held image failed'})
            transport['held'].clear();expect(page.get_by_text(re.compile('^Không tải được ảnh. Có thể tải lại'))).to_be_visible();expect(button('Xóa tệp đã rà soát')).to_be_disabled();expect(page.get_by_role('checkbox')).not_to_be_checked()
            page.get_by_role('checkbox').click();expect(button('Xóa tệp đã rà soát')).to_be_enabled()
            journal.control(lambda state:state.update(media_delete_image_failure=False));button('Tải lại ảnh cần xóa').click();expect(page.get_by_role('checkbox')).not_to_be_visible();expect(button('Xóa tệp đã rà soát')).to_be_enabled();button('Xóa tệp đã rà soát').click();button('Tiếp tục chỉnh sửa').click();assert journal.state['media_deletes']==3
            journal.control(lambda state:state.update(media_delete_image_failure=True));button('Tải lại ảnh cần xóa').click();expect(page.get_by_text(re.compile('^Không tải được ảnh. Có thể tải lại'))).to_be_visible();expect(page.get_by_role('checkbox')).not_to_be_checked();expect(button('Xóa tệp đã rà soát')).to_be_disabled();page.get_by_role('checkbox').click();page.screenshot(path=str(output/'03-image-error-explicit-metadata.png'),full_page=True);remove();expect(button('Đã kiểm tra phiếu xóa ảnh')).to_be_visible();acknowledge();assert journal.state['media_deletes']==4 and '2001:rental-document-1' in journal.state['contract_photos'] and '2001:rental-1' not in journal.state['contract_photos']
            for _ in range(10):
                if page.get_by_role('tab',name='Tài khoản',exact=True).is_visible():break
                page.go_back()
            page.get_by_role('tab',name='Tài khoản',exact=True).click();button('Tải lại danh sách đối chiếu').click();expect(page.get_by_text('Không có thao tác chờ đối chiếu trong phạm vi này.',exact=True)).to_be_visible();assert not errors and not unexpected
            checks.append('Readable image loading never auto-confirms metadata; real download failure enables explicit metadata review, retry clears old consent, successful retry/cancel allocates no write, and failed-image deletion retains exact revision with empty final ledger')
        except Exception as error:
            page.screenshot(path=str(output/'failure.png'),full_page=True);(output/'failure.txt').write_text(str(error)+'\n'+page.locator('body').inner_text(),encoding='utf-8');(output/'results.json').write_text(json.dumps({'status':'failed','passed':len(checks),'checks':checks,'error':str(error),'pageErrors':errors},ensure_ascii=False,indent=2),encoding='utf-8');raise
        finally:
            for token in list(journal.state['sessions']):journal.transact('/api/mobile/v1/session','DELETE',{}, {'Authorization':'Bearer '+token})
            browser.close();journal.close()
    result={'status':'passed','passed':len(checks),'checks':checks,'pageErrors':errors,'unexpectedHosts':unexpected,'fixtureOnly':True,'operationalWrites':0};(output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:8099');parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();run(args.url.rstrip('/'),args.output)
