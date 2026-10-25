"""Image selection across swap/contract/customer/vehicle forms. All writes and providers mocked."""
import argparse,json,re,struct,zlib
from datetime import datetime,timedelta,timezone
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3037');p.add_argument('--cookie-file',required=True);p.add_argument('--browser',choices=['all','chromium','webkit'],default='all');p.add_argument('--output',default='.backups/multiple-images-20261025/ui');a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True);expect.set_options(timeout=30000)
now=datetime.now(timezone.utc);stamp=lambda days:(now+timedelta(days=days)).isoformat()
def chunk(kind,data):return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
pixel=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',160,120,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\x00'+bytes([212,227,238])*160)*120))+chunk(b'IEND',b'')
state={};checks=[];errors=[];unexpected=[];writes=[]
def files(n):return [dict(name=f'qa-{i}.png',mimeType='image/png',buffer=pixel) for i in range(n)]
def reset():state.clear();state.update(swapped=False,photos={'contracts/901':{'rental-document-1':'original-contract','rental-document-2':'original-bill','vehicle-swap-12-1':'original-swap'},'customers/77':{},'vehicles/101':{}},version=0,fail_save=False)
def mock(route):
    if mock_contract_type_read(route):return
    req=route.request;path=urlparse(req.url).path
    if path=='/api/auth/photo-uploads/sign':
        body=req.post_data_json;route.fulfill(json=dict(status='success',data=dict(cloud_name='qa',api_key='qa',signature='qa',params=dict(public_id='qa/'+body['upload_id'],timestamp=1))));return
    if path.startswith('/api/auth/record-photos/'):
        parts=path.split('/');key='/'.join(parts[4:6]);photo=state['photos'].setdefault(key,{})
        if len(parts)==7:
            slot=parts[-1]
            if req.method=='PUT':
                writes.append(dict(method='PUT',entity=key,slot=slot))
                if state['fail_save']:state['fail_save']=False;route.fulfill(status=503,json=dict(status='error',message='QA save failed; retry'));return
                photo[slot]='new';state['version']+=1;route.fulfill(json=dict(status='success',data={}));return
            if req.method=='DELETE':photo.pop(slot,None);writes.append(dict(method='DELETE',entity=key,slot=slot));route.fulfill(json=dict(status='success',data={}));return
            route.fulfill(body=pixel,content_type='image/png');return
        if req.method=='POST':route.fulfill(json=dict(status='success',data=dict(copied=0)));return
        route.fulfill(json=dict(status='success',data=[dict(slot=slot,mime_type='image/jpeg',updated_at=f'2026-10-25T01:{state["version"]//60:02d}:{state["version"]%60:02d}Z') for slot in photo]));return
    if path=='/api/auth/returns/vehicle' and req.method=='POST':state['swapped']=True;writes.append(dict(method='POST',action='swap'));route.fulfill(json=dict(status='success',data=dict(item_id=1001,order_id=901,swap_id=12,old_license='QA-101',new_license='QA-102')));return
    if path=='/api/auth/photo-ocr':route.fulfill(json=dict(status='success',data=dict(fields={},warnings=[])));return
    if req.method not in ('GET','HEAD'):unexpected.append(req.method+' '+path);route.abort();return
    vehicle=lambda id:dict(id=id,name=f'Xe QA {id}',license=f'QA-{id}',type='xeso',brand='Honda',year=2026,color='Đỏ',store_id=32,current_store_id=32,status='using' if id==(102 if state['swapped'] else 101) else 'ready',rentals=[],vehicle_revision='1')
    contract=dict(id=901,contract_number='QA-MULTI',order_status='renting',rental_type='daily',store_id=32,customer_id=77,customer_name='Khách QA',total_amount=1000000,paid_amount=1000000,start_date=stamp(-1),end_date=stamp(10),vehicles=[vehicle(102 if state['swapped'] else 101)])
    if path in ('/api/auth/stores','/api/auth/store-directory'):data=[dict(id=32,store_name='CS QA',kind='physical',status='opening')]
    elif path in ('/api/auth/vehicle/vehicles','/api/auth/vehicles/inventory'):data=[vehicle(101),vehicle(102)]
    elif path=='/api/auth/order/car-rental':data=[contract]
    elif path=='/api/auth/order/car-rental/901':data=contract
    elif path=='/api/auth/order/car-rental/901/history':data=dict(changes=[dict(id='swap-12',kind='swap',at=stamp(0),actor='QA',title='Đổi xe',detail='QA-101 → QA-102',amount=None)] if state['swapped'] else [],cashflow=[])
    elif path=='/api/auth/returns':data=[dict(item_id=1001,order_id=901,contract_code='QA-MULTI',order_status='renting',customer_name='Khách QA',vehicle_id=101,vehicle_name='Xe QA 101',license='QA-101',store_id=32,store_name='CS QA',scheduled_start_at=stamp(-1),scheduled_return_at=stamp(10),completed_at=None,item_revision='1',order_revision='1',total_amount=1000000,paid_amount=1000000,overdue=False,daily_price=100000,deposit_paid=0,deposit_held=0)]
    elif path=='/api/auth/customers':data=[dict(id=77,name='Khách QA',phone='0900000077',id_card='001234567890',store_id=32,status=1)]
    elif path=='/api/auth/gps':data=dict(devices=[],events=[],selected_vehicles=[])
    elif path=='/api/session':route.fulfill(json=dict(user=dict(name='QA')));return
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))
def cloud(route):
    body=route.request.post_data_buffer or b'';match=re.search(rb'name="public_id"\r\n\r\n([^\r]+)',body);assert match
    route.fulfill(json=dict(public_id=match[1].decode(),version=1,signature='qa'))

with sync_playwright() as pw:
    for engine in (['chromium','webkit'] if a.browser=='all' else [a.browser]):
        reset();browser=getattr(pw,engine).launch();ctx=browser.new_context(viewport=dict(width=390 if engine=='webkit' else 1440,height=900),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
        ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock);ctx.route('https://api.cloudinary.com/**',cloud)
        ctx.add_init_script("""const original=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(['/api/auth/payment-events','/api/auth/gps/refresh'].includes(url.pathname))return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return original.call(this,input,options);};""")
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        def fresh(path):
            global page
            page.wait_for_load_state('networkidle');page.close();page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(a.url+path,wait_until='networkidle',timeout=120000)
        def detail():
            if engine=='webkit':page.locator('.mg-mobile-card-main:visible').first.click()
            else:page.get_by_role('button',name=re.compile('^Thao tác QA-10')).filter(visible=True).first.click();page.get_by_role('menuitem',name='Xem chi tiết',exact=True).click()
            return page.locator('dialog[open]').last
        def all_multiple(dialog):
            pickers=dialog.locator('input[type=file][accept="image/*"]:not([capture])');assert pickers.count()>0
            for picker in pickers.all():assert picker.get_attribute('multiple') is not None,picker.get_attribute('aria-label')
        page.goto(a.url+'/contracts?contract_id=901',wait_until='networkidle',timeout=120000)
        dialog=detail();dialog.get_by_role('button',name='Đổi xe',exact=True).click();swap=page.get_by_role('dialog',name='Đổi xe · QA-MULTI',exact=True)
        picker=swap.get_by_role('combobox');picker.fill('QA-102');swap.get_by_role('option',name=re.compile('QA-102')).click()
        swap.get_by_role('button',name='Đổi xe trong hợp đồng',exact=True).click()
        upload=swap.get_by_label('Chọn nhiều ảnh đổi xe',exact=True);expect(upload).to_be_enabled();upload.set_input_files(files(18))
        expect(swap.locator('.mg-media-thumbnails img')).to_have_count(19);state['fail_save']=True
        swap.get_by_role('button',name='Lưu ảnh',exact=True).click();expect(swap.get_by_role('alert')).to_contain_text('QA save failed')
        expect(swap.locator('.mg-media-thumbnails img')).to_have_count(19)
        swap.get_by_role('button',name='Lưu ảnh',exact=True).click();expect(swap.get_by_text('Đã lưu ảnh.',exact=True)).to_be_visible();assert state['photos']['contracts/901']['vehicle-swap-12-1']=='original-swap'
        checks.append(dict(browser=engine,case='swap-selects-18-images-preserves-original-and-keeps-files-on-save-failure'))
        swap.get_by_role('button',name='Đóng',exact=True).click();fresh('/contracts?contract_id=901');dialog=detail()
        dialog.get_by_role('tab',name='Ký kết & ghi chú',exact=True).click();photos=dialog.locator('#contract-detail-panel-signing .mg-saved-photos')
        bill=photos.get_by_label('Chọn ảnh Bill chuyển khoản / tổng tiền mặt',exact=True);bill.set_input_files(files(3));expect(photos.locator('img')).to_have_count(5)
        photos.get_by_role('button',name='Lưu ảnh',exact=True).click();expect(photos.get_by_text('Đã lưu ảnh.',exact=True)).to_be_visible();assert state['photos']['contracts/901']['rental-document-2']=='original-bill'
        all_multiple(photos);checks.append(dict(browser=engine,case='payment-bill-accepts-three-extra-images-without-overwriting-original-or-signed-contract'))
        dialog.get_by_role('tab',name='Ảnh thuê / trả xe',exact=True).click();supplement=dialog.locator('details').filter(has=page.locator('summary',has_text='Bổ sung ảnh đổi xe')).first;supplement.locator('summary').click()
        more=supplement.get_by_label('Chọn nhiều ảnh đổi xe',exact=True);expect(more).to_be_enabled();more.set_input_files(files(2));supplement.get_by_role('button',name='Lưu ảnh',exact=True).click();expect(supplement.get_by_text('Đã lưu ảnh.',exact=True)).to_be_visible()
        assert len([key for key in state['photos']['contracts/901'] if key.startswith('vehicle-swap-12-')])==21
        assert sum(1 for write in writes if write.get('action')=='swap')==(1 if engine=='chromium' else 2)
        supplement.screenshot(path=str(out/f'{engine}-swap-supplement.png'));checks.append(dict(browser=engine,case='reopens-completed-swap-and-appends-images-without-another-vehicle-change'))
        fresh('/customers');page.get_by_role('button',name='Thêm khách hàng',exact=True).click();customer=page.get_by_role('dialog',name='Thêm khách hàng tại chỗ',exact=True)
        all_multiple(customer);customer.get_by_label('Chọn ảnh CCCD mặt trước',exact=True).set_input_files(files(3));expect(customer.locator('img')).to_have_count(3)
        customer.get_by_label('Chọn ảnh Giấy phép lái xe',exact=True).set_input_files(files(2));expect(customer.locator('img')).to_have_count(5)
        checks.append(dict(browser=engine,case='customer-identity-and-driver-license-both-accept-multiple-images-and-retain-the-other-group'))
        fresh('/vehicles');page.get_by_role('button',name='Thêm xe',exact=True).click();vehicle=page.get_by_role('dialog',name='Thêm xe',exact=True)
        all_multiple(vehicle);vehicle.get_by_label('Chọn ảnh Đăng ký xe mặt trước',exact=True).set_input_files(files(3));expect(vehicle.locator('img')).to_have_count(3)
        vehicle.get_by_label('Chọn ảnh Giấy mua bán trang 1',exact=True).set_input_files(files(2));expect(vehicle.locator('img')).to_have_count(5)
        vehicle.screenshot(path=str(out/f'{engine}-vehicle-documents.png'));assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        checks.append(dict(browser=engine,case='vehicle-registration-and-purchase-documents-accept-multiple-images-on-desktop-and-phone'))
        ctx.close();browser.close()
assert not errors,errors
assert not unexpected,unexpected
result=dict(passed=len(checks),checks=checks,browserErrors=errors,unexpectedRequests=unexpected,realBusinessWrites=0,realProviderRequests=0)
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2))
