"""Customer-paper copy UI on immutable synthetic checkpoint; no real providers."""
import argparse,base64,json,re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from lib.mobile_fixture_journal import FixtureJournal
from lib import mobile_contract_flow_fixture as model
from lib.mobile_customer_photo_copy_fixture import seed_copy_sources
from lib.mobile_record_media_fixture import image_blob

def run(base,output):
    output.mkdir(parents=True,exist_ok=False);journal=FixtureJournal(output/'state.json',model=model);journal.control(seed_copy_sources);checks=[];errors=[];unexpected=[]
    file=output/'synthetic-copy-evidence.jpg';file.write_bytes(image_blob())
    with sync_playwright() as p:
        browser=p.chromium.launch();context=browser.new_context(viewport={'width':375,'height':812},reduced_motion='reduce')
        def intercept(route):
            request=route.request;url=urlparse(request.url)
            if url.netloc==urlparse(base).netloc:return route.continue_()
            if url.hostname!='mobile-api.example.invalid':unexpected.append(url.hostname);return route.abort()
            headers={'Access-Control-Allow-Origin':base,'Access-Control-Allow-Headers':'authorization,content-type,idempotency-key,x-record-revision,x-reference-revision,x-media-snapshot,x-photo-revision,x-customer-photo-snapshot','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'}
            if request.method=='OPTIONS':return route.fulfill(status=204,headers=headers)
            body={'jpeg':base64.b64encode(request.post_data_buffer).decode()} if request.method=='PUT' else request.post_data_json if request.post_data else {}
            status,data,lost=journal.transact(url.path+('?' +url.query if url.query else ''),request.method,body,dict(request.headers))
            if lost:status,data=503,{'code':'SERVICE_UNAVAILABLE','message':'QA mất phản hồi sau lấy giấy tờ.'}
            if '_bytesBase64' in data:return route.fulfill(status=status,headers={**headers,'Content-Type':data['mimeType']},body=base64.b64decode(data['_bytesBase64']))
            route.fulfill(status=status,headers=headers,json=data)
        context.route('**/*',intercept);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));button=lambda name:page.get_by_role('button',name=name,exact=True)
        def mode(value):journal.control(lambda state:state.update(mode=value))
        def acknowledge():expect(button('Đã kiểm tra kết quả lấy giấy tờ')).to_be_enabled();button('Đã kiểm tra kết quả lấy giấy tờ').click()
        try:
            page.goto(base);page.get_by_role('textbox',name='Tài khoản',exact=True).fill('qa');page.get_by_label('Mật khẩu',exact=True).fill('fixture-password');button('Đăng nhập').click()
            page.get_by_role('tab',name='Hợp đồng',exact=True).click();button('Thêm bản nháp').click();page.get_by_role('textbox',name='Số hợp đồng giấy',exact=True).fill('96021');button('Bước 2: Khách hàng').click();button('Chọn hồ sơ khách').click();button('Chọn khách Khách hợp đồng QA, QA-001').click();button('Dùng hồ sơ đã chọn').click()
            button('Bước 5: Ký kết & ghi chú').click()
            with page.expect_file_chooser() as chooser:button('Chọn ảnh hợp đồng').click()
            chooser.value.set_files(file);expect(button('Bỏ ảnh đang chọn · Khi thuê · Hợp đồng đã ký')).to_be_visible();mode('copy-lost');button('Lưu nháp').click()
            expect(page.get_by_role('heading',name='Hoàn tất ảnh hợp đồng',exact=True)).to_be_visible();assert journal.state.get('customer_photo_copy_writes',0)==0
            button('Lưu ảnh vào đúng hồ sơ').click();button('Xác nhận lưu ảnh').click();expect(button('Đối chiếu lấy giấy tờ với máy chủ')).to_be_visible()
            assert journal.state['draft_creates']==journal.state['contract_photo_writes']==journal.state['customer_photo_copy_writes']==1
            event=journal.state['customer_photo_copy_events'][0];assert event['photosBeforeCopy']==event['draftCreates']==1
            proof=next(iter(journal.state['customer_photo_copy_receipts'].values()))['receipt'];assert proof['copied']==4
            page.screenshot(path=str(output/'01-copy-after-images-lost.png'),full_page=True);button('Đối chiếu lấy giấy tờ với máy chủ').click();acknowledge();expect(button('Tiếp tục soạn hợp đồng')).to_be_visible()
            checks.append('One metadata draft then selected image then automatic four-paper copy; lost response recovers original proof without another draft/image/copy')
            button('Ảnh và hồ sơ nghiệp vụ').click();button('Lấy giấy tờ từ hồ sơ khách').click();mode('copy-drop');button('Lấy giấy tờ vào hợp đồng').click();expect(button('Đối chiếu lấy giấy tờ với máy chủ')).to_be_visible();button('Đối chiếu lấy giấy tờ với máy chủ').click();expect(button('Lấy giấy tờ vào hợp đồng')).to_be_enabled()
            assert journal.transact(**journal.state['delayed_customer_photo_copy'])[0]==409;assert journal.state['customer_photo_copy_writes']==1
            button('Tải lại kết quả lấy giấy tờ').click();expect(button('Lấy giấy tờ vào hợp đồng')).to_be_enabled();button('Lấy giấy tờ vào hợp đồng').click();expect(page.get_by_text('Đã bổ sung 0 ảnh · Đã có 4 ảnh',exact=True)).to_be_visible();acknowledge()
            checks.append('Existing papers stay independent and unchanged; dropped no-op is tombstoned before late409 and retry records one zero-copy receipt')
            button('Lấy giấy tờ từ hồ sơ khách').click();expect(button('Lấy giấy tờ vào hợp đồng')).to_be_enabled()
            def changed(state):state['document_photos']['1:id_front']['photo']['revision']='9999'
            journal.control(changed);button('Lấy giấy tờ vào hợp đồng').click();expect(button('Đối chiếu lấy giấy tờ với máy chủ')).to_be_visible();expect(page.get_by_text('QA bản rà soát đã cũ',exact=True)).to_be_visible();button('Đối chiếu lấy giấy tờ với máy chủ').click();expect(button('Lấy giấy tờ vào hợp đồng')).to_be_enabled();button('Tải lại kết quả lấy giấy tờ').click();button('Lấy giấy tờ vào hợp đồng').click();acknowledge()
            assert journal.state['draft_creates']==journal.state['contract_photo_writes']==1 and journal.state['customer_photo_copy_writes']==3
            assert not errors and not unexpected;checks.append('Changed source after displayed review rejects without copying; reconciliation and explicit reload keep original contract images and metadata')
            for _ in range(6):
                if page.get_by_role('tab',name='Tài khoản',exact=True).is_visible():break
                page.go_back()
            page.get_by_role('tab',name='Tài khoản',exact=True).click();button('Tải lại danh sách đối chiếu').click();expect(page.get_by_text('Không có thao tác chờ đối chiếu trong phạm vi này.',exact=True)).to_be_visible();page.screenshot(path=str(output/'02-copy-ledger-empty.png'),full_page=True)
            checks.append('Every original metadata/image/copy key is acknowledged; actor-scoped ledger returns empty')
        except Exception as error:
            page.screenshot(path=str(output/'failure.png'),full_page=True);(output/'failure.txt').write_text(str(error)+'\n'+page.locator('body').inner_text(),encoding='utf-8');(output/'results.json').write_text(json.dumps({'status':'failed','passed':len(checks),'checks':checks,'error':str(error),'pageErrors':errors},ensure_ascii=False,indent=2),encoding='utf-8');raise
        finally:
            for token in list(journal.state['sessions']):journal.transact('/api/mobile/v1/session','DELETE',{}, {'Authorization':'Bearer '+token})
            browser.close();journal.close()
    result={'status':'passed','passed':len(checks),'checks':checks,'pageErrors':errors,'unexpectedHosts':unexpected,'fixtureOnly':True,'operationalWrites':0};(output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:8098');parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();run(args.url.rstrip('/'),args.output)
