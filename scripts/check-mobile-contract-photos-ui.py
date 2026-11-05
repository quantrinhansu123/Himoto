"""Contract plate/queued-photo browser acceptance against a durable synthetic model."""
import argparse
import base64
import json
import re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from lib.mobile_fixture_journal import FixtureJournal
from lib import mobile_contract_flow_fixture as model
from lib.mobile_record_media_fixture import image_blob

def run(base,output):
    output.mkdir(parents=True,exist_ok=False);journal=FixtureJournal(output/'state.json',model=model);journal.control(lambda state:state.update(contract_photo_inventory=True))
    checks=[];errors=[];unexpected=[];file=output/'synthetic-contract-photo.jpg';file.write_bytes(image_blob())
    with sync_playwright() as p:
        browser=p.chromium.launch();context=browser.new_context(viewport={'width':375,'height':812},reduced_motion='reduce')
        def intercept(route):
            request=route.request;url=urlparse(request.url)
            if url.netloc==urlparse(base).netloc:return route.continue_()
            if url.hostname!='mobile-api.example.invalid':unexpected.append(url.hostname);return route.abort()
            headers={'Access-Control-Allow-Origin':base,'Access-Control-Allow-Headers':'authorization,content-type,idempotency-key,x-photo-kind,x-ocr-request,x-record-revision,x-reference-revision,x-media-snapshot,x-photo-revision','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'}
            if request.method=='OPTIONS':return route.fulfill(status=204,headers=headers)
            binary=request.method=='PUT' or url.path.endswith('/plate-ocr');body={'jpeg':base64.b64encode(request.post_data_buffer).decode()} if binary else request.post_data_json if request.post_data else {}
            status,data,lost=journal.transact(url.path+('?' +url.query if url.query else ''),request.method,body,dict(request.headers))
            if lost:status,data=503,{'code':'SERVICE_UNAVAILABLE','message':'QA mất phản hồi sau commit ảnh hợp đồng.'}
            if '_bytesBase64' in data:return route.fulfill(status=status,headers={**headers,'Content-Type':'image/jpeg'},body=base64.b64decode(data['_bytesBase64']))
            route.fulfill(status=status,headers=headers,json=data)
        context.route('**/*',intercept);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        button=lambda name:page.get_by_role('button',name=name,exact=True)
        field=lambda name:page.get_by_role('textbox',name=name,exact=True)
        def choose(label,value):button(label).click();button(value).click()
        def pick(label):
            with page.expect_file_chooser() as chooser:button(label).click()
            chooser.value.set_files(file)
        def mode(value):journal.control(lambda state:state.update(mode=value))
        def upload():button('Lưu ảnh vào đúng hồ sơ').click();button('Xác nhận lưu ảnh').click()
        try:
            page.goto(base);field('Tài khoản').fill('qa');page.get_by_label('Mật khẩu',exact=True).fill('fixture-password');button('Đăng nhập').click();page.get_by_role('tab',name='Hợp đồng',exact=True).click();button('Thêm bản nháp').click();field('Số hợp đồng giấy').fill('96001');button('Bước 3: Phương tiện').click()
            pick('Chọn ảnh biển số');expect(page.get_by_text(re.compile('Đã đọc biển số 50A-123.45'))).to_be_visible();expect(button('Bỏ xe 50A-123.45')).to_be_visible();assert journal.state['plate_ocr_calls']==1
            button('Lái xe và đồ mượn 1').click();field('Lái xe 1').fill('ManualDriverQA');field('Mũ bảo hiểm xe 1').fill('2')
            button('Thêm xe vào bản nháp').click();button('Chọn xe 51B-678.90').click();choose('Mục ảnh biển số','Biển số 51B-678.90');mode('plate-mismatch');pick('Chọn ảnh biển số');expect(page.get_by_text(re.compile('Đã đọc biển số 51B-678.90'))).to_be_visible()
            button('Bước 4: Chi phí').click();field('Tổng giá trị hợp đồng (VND)').fill('1250000');button('Bước 5: Ký kết & ghi chú').click()
            pick('Chọn ảnh hợp đồng');expect(button('Bỏ ảnh đang chọn · Khi thuê · Hợp đồng đã ký')).to_be_visible();pick('Chọn ảnh hợp đồng');expect(button('Bỏ ảnh đang chọn · Khi thuê · Hợp đồng đã ký · Trang 2')).to_be_visible()
            page.screenshot(path=str(output/'01-pending-contract-images.png'),full_page=True)
            choose('Mục ảnh hợp đồng','Giấy phép lái xe');pick('Chọn ảnh hợp đồng');pick('Chọn ảnh hợp đồng')
            expect(button('Bỏ ảnh đang chọn · Giấy phép lái xe · Ảnh 2')).to_be_visible()
            mode('contract-photo-license-lost');button('Lưu nháp').click();expect(page.get_by_role('heading',name='Hoàn tất ảnh hợp đồng',exact=True)).to_be_visible();assert journal.state['draft_creates']==1
            upload();expect(page.get_by_text('QA mất phản hồi sau commit ảnh hợp đồng.',exact=True)).to_be_visible();expect(button('Đối chiếu ảnh với máy chủ')).to_be_enabled();assert journal.state['contract_photo_writes']==3
            assert [row['receipt']['slot'] for row in sorted(journal.state['contract_photo_receipts'].values(),key=lambda row:int(row['receipt']['photoRevision']))]==['plate-303','plate-304','driver-license']
            checks.append('Plate OCR selects the unique empty-line vehicle, preserves manual driver/accessories, binds a second vehicle and queues separate signed pages before one draft save')
            button('Đối chiếu ảnh với máy chủ').click();expect(button('Đã kiểm tra phiếu ảnh')).to_be_enabled();button('Đã kiểm tra phiếu ảnh').click();button('Tải lại ô ảnh, giữ ảnh đang chọn').click();expect(button('Lưu ảnh vào đúng hồ sơ')).to_be_enabled()
            mode('contract-photo-transaction-drop');upload();expect(page.get_by_text('QA chưa nhận được ảnh hợp đồng.',exact=True)).to_be_visible();expect(button('Đối chiếu ảnh với máy chủ')).to_be_enabled()
            assert journal.state['contract_photo_writes']==4 and journal.state['delayed_contract_photo']['path'].endswith('/rental-document-1')
            button('Đối chiếu ảnh với máy chủ').click();expect(button('Tải lại ô ảnh, giữ ảnh đang chọn')).to_be_visible()
            assert journal.transact(**journal.state['delayed_contract_photo'])[0]==409
            button('Tải lại ô ảnh, giữ ảnh đang chọn').click();expect(button('Lưu ảnh vào đúng hồ sơ')).to_be_enabled()
            upload();expect(button('Tiếp tục soạn hợp đồng')).to_be_visible();assert journal.state['draft_creates']==1 and journal.state['contract_photo_writes']==6
            saved=journal.state['draft_profiles'][2001]['input']['draft'];assert saved['vehicles'][0]['driver_name']=='ManualDriverQA' and saved['vehicles'][0]['borrow_hats']=='2' and saved['total_amount']=='1250000'
            assert {row['receipt']['slot'] for row in journal.state['contract_photo_receipts'].values()}=={'plate-303','plate-304','driver-license','driver-license-extra-2','rental-document-1','rental-signed-2'}
            assert [row['receipt']['slot'] for row in sorted(journal.state['contract_photo_receipts'].values(),key=lambda row:int(row['receipt']['photoRevision']))]==['plate-303','plate-304','driver-license','driver-license-extra-2','rental-document-1','rental-signed-2']
            checks.append('Signed pages selected before GPLX still upload after plates and both GPLX images; GPLX lost commit resolves first, dropped transaction is tombstoned/late409, only remainder uploads on one original draft with exact driver/money')
            button('Ảnh và hồ sơ nghiệp vụ').click();expect(button('Ảnh lập hợp đồng / giao xe · #2001')).to_be_visible();button('Ảnh lập hợp đồng / giao xe · #2001').click();expect(button('Mở mục Khi thuê · Hợp đồng đã ký')).to_be_visible();page.screenshot(path=str(output/'02-rental-gallery.png'),full_page=True)
            checks.append('Saved contract exposes rental and exact per-vehicle media targets, including every signed page retained independently')
            # Return to the list without reusing a written dataset for a new run.
            for _ in range(6):
                if page.get_by_role('tab',name='Hợp đồng',exact=True).is_visible():break
                page.go_back()
            page.get_by_role('tab',name='Hợp đồng',exact=True).click();button('Thêm bản nháp').click();field('Số hợp đồng giấy').fill('96002');button('Bước 3: Phương tiện').click();mode('plate-ocr-failure');pick('Chọn ảnh biển số');expect(page.get_by_text('QA chưa đọc được biển số. Ảnh được giữ.',exact=True)).to_be_visible()
            button('Thêm xe vào bản nháp').click();button('Chọn xe 50A-123.45').click();binding=page.get_by_role('button',name=re.compile('^Gắn xe cho ảnh '));binding.click();button('50A-123.45').click();expect(page.get_by_text('QA chưa đọc được biển số. Ảnh được giữ.',exact=True)).not_to_be_visible();expect(button('Bỏ ảnh đang chọn · Ảnh biển số 50A-123.45')).to_be_visible()
            journal.control(lambda state:state.update(draft_lost_response=True));button('Lưu nháp').click();expect(button('Kiểm tra lần lưu trước')).to_be_visible();assert journal.state['draft_creates']==2
            button('Kiểm tra lần lưu trước').click();button('Hoàn tất ảnh bản nháp đã lưu').click();expect(page.get_by_role('heading',name='Hoàn tất ảnh hợp đồng',exact=True)).to_be_visible()
            mode('contract-photo-drop');upload();expect(button('Đối chiếu ảnh với máy chủ')).to_be_visible();button('Đối chiếu ảnh với máy chủ').click();expect(button('Tải lại ô ảnh, giữ ảnh đang chọn')).to_be_visible();assert journal.transact(**journal.state['delayed_contract_photo'])[0]==409
            button('Tải lại ô ảnh, giữ ảnh đang chọn').click();expect(button('Lưu ảnh vào đúng hồ sơ')).to_be_enabled();upload();expect(button('Tiếp tục soạn hợp đồng')).to_be_visible()
            assert journal.state['draft_creates']==2 and journal.state['contract_photo_writes']==7
            checks.append('OCR failure retains an unbound image for explicit manual binding; lost draft response recovers one original ID, and a dropped photo is tombstoned before retry so late delivery returns 409')
            assert not errors and not unexpected
        except Exception as error:
            page.screenshot(path=str(output/'failure.png'),full_page=True);(output/'failure.txt').write_text(str(error)+'\n'+page.locator('body').inner_text(),encoding='utf-8');(output/'results.json').write_text(json.dumps({'status':'failed','passed':len(checks),'checks':checks,'error':str(error),'pageErrors':errors,'unexpectedHosts':unexpected},ensure_ascii=False,indent=2),encoding='utf-8');raise
        finally:
            for token in list(journal.state['sessions']):journal.transact('/api/mobile/v1/session','DELETE',{}, {'Authorization':'Bearer '+token})
            browser.close();journal.close()
    result={'status':'passed','passed':len(checks),'checks':checks,'pageErrors':errors,'unexpectedHosts':unexpected,'fixtureOnly':True,'operationalWrites':0};(output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:8097');parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();run(args.url.rstrip('/'),args.output)
