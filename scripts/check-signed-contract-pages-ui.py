"""Multi-page contract evidence and consistent lifecycle presentation; all business writes mocked."""
import argparse,json,re,struct,zlib
from datetime import datetime,timedelta,timezone
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3031');p.add_argument('--cookie-file',required=True);p.add_argument('--browser',choices=['all','chromium','webkit'],default='all');p.add_argument('--output',default='.backups/contract-evidence-20261025/ui');a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True);expect.set_options(timeout=30000)
now=datetime.now(timezone.utc);stamp=lambda days:(now+timedelta(days=days)).isoformat()
def chunk(kind,data):return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
pixel=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',160,120,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\x00'+bytes([212,227,238])*160)*120))+chunk(b'IEND',b'')
state={};checks=[];errors=[];unexpected=[];writes=[]
def reset(kind='ownership',expired=False):
    state.clear();state.update(kind=kind,expired=expired,photos={'rental-document-2':'original-bill'},fail_save=False,failed=False,fail_read=False,version=0)
def mock(route):
    if mock_contract_type_read(route):return
    req=route.request;path=urlparse(req.url).path
    if path=='/api/session':route.fulfill(json=dict(user=dict(name='QA')));return
    if path=='/api/auth/gps/refresh':route.fulfill(json=dict(status='success',data={}));return
    if path=='/api/auth/photo-uploads/sign':
        body=req.post_data_json;route.fulfill(json=dict(status='success',data=dict(cloud_name='qa',api_key='qa',signature='qa',params=dict(public_id='qa/'+body['upload_id'],timestamp=1))));return
    if path.startswith('/api/auth/record-photos/contracts/901/'):
        slot=path.rsplit('/',1)[-1]
        if req.method=='PUT':
            writes.append(dict(method='PUT',slot=slot))
            if state['fail_save'] and slot=='rental-signed-2' and not state['failed']:
                state['failed']=True;route.fulfill(status=503,json=dict(status='error',message='QA save failed; retry'));return
            state['photos'][slot]='saved-page';state['version']+=1;route.fulfill(json=dict(status='success',data={}));return
        if req.method=='DELETE':
            writes.append(dict(method='DELETE',slot=slot));del state['photos'][slot];route.fulfill(json=dict(status='success',data={}));return
        route.fulfill(body=pixel,content_type='image/png');return
    if path=='/api/auth/record-photos/contracts/901':
        if req.method=='POST':route.fulfill(json=dict(status='success',data=dict(copied=0)));return
        if state['fail_read']:route.fulfill(status=503,json=dict(status='error',message='QA cannot load saved photos'));return
        route.fulfill(json=dict(status='success',data=[dict(slot=slot,mime_type='image/jpeg',updated_at=f'2026-10-25T01:00:{state["version"]:02d}Z') for slot in state['photos']]));return
    if req.method not in ('GET','HEAD'):unexpected.append(req.method+' '+path);route.abort();return
    vehicle=dict(id=101,name='Xe QA',license='QA-00101',type='xeso',store_id=1,current_store_id=1,status='using')
    contract=dict(id=901,contract_number='QA-SIGNED-PAGES',status='overdue',order_status='renting',rental_type=state['kind'],customer_id=77,customer_name='Khách QA',store_id=1,total_amount=1000000,paid_amount=0,start_date=stamp(-30),end_date=stamp(-1 if state['expired'] else 30),vehicles=[vehicle])
    if path.endswith('/901/lifecycle'):
        data=dict(id=901,code=contract['contract_number'],status='renting',revision='1',ownership=state['kind']=='ownership',rental_type=state['kind'],contract_type_name='',overdue=True,items=[dict(id=1001,vehicle_id=101,license=vehicle['license'],name=vehicle['name'],rent_at=stamp(-30),return_at=contract['end_date'],completed_at=None)],all_returned=False,returned_count=0,total_amount=1000000,paid_amount=0,remaining=1000000,deposit_held=0,overpayment=0,settled=False,can_settle=False,settlement_note='Còn tiền thuê',events=[],held_at=None,resume_vehicle_count=0,plan=None,base_total=1000000,start_at=stamp(-30),end_at=contract['end_date'])
    elif path in ('/api/auth/stores','/api/auth/store-directory'):data=[dict(id=1,store_name='Cơ sở thuê sở hữu QA',kind='lease_to_own',status='opening')]
    elif path=='/api/auth/order/car-rental':data=[contract]
    elif path=='/api/auth/order/car-rental/901':data=contract
    elif path in ('/api/auth/vehicle/vehicles','/api/auth/vehicles/inventory'):data=[vehicle]
    elif path=='/api/auth/customers':data=[dict(id=77,name='Khách QA',phone='0900000077',store_id=1)]
    elif path=='/api/auth/gps':data=dict(devices=[],events=[],selected_vehicles=[])
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))
def cloud(route):
    body=route.request.post_data_buffer or b'';match=re.search(rb'name="public_id"\r\n\r\n([^\r]+)',body);assert match
    route.fulfill(json=dict(public_id=match[1].decode(),version=1,signature='qa'))
def files(count):return [dict(name=f'qa-page-{i}.png',mimeType='image/png',buffer=pixel) for i in range(count)]

with sync_playwright() as pw:
    for engine in (['chromium','webkit'] if a.browser=='all' else [a.browser]):
        browser=getattr(pw,engine).launch()
        def context():
            ctx=browser.new_context(viewport=dict(width=390 if engine=='webkit' else 1440,height=900),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
            ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock);ctx.route('https://api.cloudinary.com/**',cloud)
            ctx.add_init_script("""const qaFetch=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(['/api/auth/payment-events','/api/auth/gps/refresh'].includes(url.pathname))return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return qaFetch.call(this,input,options);};""")
            page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));return ctx,page
        def detail(page):
            page.goto(a.url+'/contracts?contract_id=901',wait_until='networkidle',timeout=120000)
            if engine=='webkit':page.locator('.mg-mobile-card-main:visible').first.click()
            else:
                page.get_by_role('button',name='Thao tác QA-00101',exact=True).filter(visible=True).click();page.get_by_role('menuitem',name='Xem chi tiết',exact=True).click()
            dialog=page.locator('dialog[open]').last;expect(dialog).to_be_visible();return dialog
        reset();ctx,page=context();dialog=detail(page);dialog.get_by_role('tab',name='Ký kết & ghi chú',exact=True).click()
        photos=dialog.locator('#contract-detail-panel-signing .mg-saved-photos');picker=photos.get_by_label('Chọn ảnh Hợp đồng đã ký',exact=True)
        expect(picker).to_be_enabled();assert picker.get_attribute('multiple') is not None
        picker.set_input_files(files(4));expect(photos.locator('img')).to_have_count(5)
        expect(photos.get_by_role('button',name='Lưu ảnh',exact=True)).to_be_enabled();state['fail_save']=True
        photos.get_by_role('button',name='Lưu ảnh',exact=True).click();expect(photos.get_by_role('alert')).to_contain_text('QA save failed')
        expect(photos.locator('img')).to_have_count(5);checks.append(dict(browser=engine,case='four-pages-selected-and-kept-on-save-failure'))
        photos.get_by_role('button',name='Lưu ảnh',exact=True).click();expect(photos.get_by_text('Đã lưu ảnh.',exact=True)).to_be_visible();expect(picker).to_be_enabled()
        assert set(state['photos'])=={'rental-document-1','rental-document-2','rental-signed-2','rental-signed-3','rental-signed-4'}
        picker.set_input_files(files(2));expect(photos.locator('img')).to_have_count(7);expect(photos.get_by_role('button',name='Lưu ảnh',exact=True)).to_be_enabled();photos.get_by_role('button',name='Lưu ảnh',exact=True).click();expect(photos.get_by_text('Đã lưu ảnh.',exact=True)).to_be_visible();expect(picker).to_be_enabled()
        photos.get_by_label('Chụp Hợp đồng đã ký',exact=True).set_input_files(files(1));expect(photos.locator('img')).to_have_count(8);expect(photos.get_by_role('button',name='Lưu ảnh',exact=True)).to_be_enabled();photos.get_by_role('button',name='Lưu ảnh',exact=True).click();expect(photos.get_by_text('Đã lưu ảnh.',exact=True)).to_be_visible();expect(picker).to_be_enabled()
        assert state['photos']['rental-document-2']=='original-bill';checks.append(dict(browser=engine,case='append-two-library-pages-and-one-camera-page-without-overwriting-bill'))
        photos.get_by_role('button',name='Xóa ảnh Hợp đồng đã ký · Trang 3',exact=True).click();expect(photos.locator('img')).to_have_count(7);assert 'rental-signed-3' not in state['photos']
        dialog.get_by_role('tab',name='Ảnh thuê / trả xe',exact=True).click();gallery=dialog.locator('.mg-transaction-photo-gallery');expect(gallery.locator('img')).to_have_count(7)
        page.wait_for_function("[...document.querySelectorAll('.mg-transaction-photo-gallery img')].every(img=>img.complete&&img.naturalWidth>0)")
        dialog.locator('.mg-transaction-photos').get_by_role('tab',name='Tải ảnh chi tiết',exact=True).click()
        documents=dialog.locator('.mg-media-documents');expect(documents.locator('img')).to_have_count(7);expect(documents.get_by_label('Chọn ảnh Hợp đồng đã ký',exact=True)).to_have_attribute('multiple','')
        documents.locator('strong').first.scroll_into_view_if_needed();page.screenshot(path=str(out/f'{engine}-saved-contract-pages.png'))
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        checks.append(dict(browser=engine,case='saved-pages-reload-in-gallery-and-compact-detail-and-delete-individually'))
        ctx.unroute_all(behavior='ignoreErrors');ctx.close()
        for kind,expired in [('rental',False),('ownership',False),('ownership',True)]:
            reset(kind,expired);ctx,page=context();dialog=detail(page);dialog.get_by_role('tab',name='Nợ xấu / bảo lưu',exact=True).click();panel=dialog.locator('#contract-detail-panel-lifecycle')
            expect(panel.get_by_role('button',name='Chuyển sang Nợ xấu',exact=True)).to_be_visible()
            expect(panel.locator('p').filter(has_text=re.compile('^Quá hạn · ')).first).to_contain_text('Thuê xe' if kind=='rental' else 'Thuê sở hữu')
            expect(panel.get_by_role('button',name='Bảo lưu hợp đồng',exact=True)).to_have_count(1 if kind=='ownership' and not expired else 0)
            dialog.get_by_role('tab',name='Hợp đồng',exact=True).click();contract_panel=dialog.locator('#contract-detail-panel-contract')
            expect(contract_panel.locator('div').filter(has=page.locator('dt',has_text='Trạng thái hợp đồng')).last).to_contain_text('Quá hạn')
            expect(contract_panel.locator('div').filter(has=page.locator('dt',has_text='Loại hợp đồng')).last).to_contain_text('Thuê xe' if kind=='rental' else 'Thuê sở hữu')
            dialog.get_by_role('tab',name='Nợ xấu / bảo lưu',exact=True).click();panel.screenshot(path=str(out/f'{engine}-lifecycle-{kind}-{expired}.png'))
            checks.append(dict(browser=engine,case=f'consistent-type-and-overdue-with-hold-rule-{kind}-expired-{expired}'));ctx.unroute_all(behavior='ignoreErrors');ctx.close()
        reset();state['fail_read']=True;ctx,page=context();dialog=detail(page);dialog.get_by_role('tab',name='Ký kết & ghi chú',exact=True).click();photos=dialog.locator('#contract-detail-panel-signing .mg-saved-photos');picker=photos.get_by_label('Chọn ảnh Hợp đồng đã ký',exact=True)
        expect(photos.get_by_role('alert')).to_contain_text('QA cannot load');expect(picker).to_be_disabled();state['fail_read']=False;photos.get_by_role('button',name='Thử lại',exact=True).click();expect(picker).to_be_enabled();expect(photos.locator('img')).to_have_count(1)
        checks.append(dict(browser=engine,case='saved-photo-read-failure-blocks-append-until-retry'));ctx.unroute_all(behavior='ignoreErrors');ctx.close()
        reset();ctx,page=context();page.goto(a.url+'/contracts/ownership',wait_until='networkidle',timeout=120000)
        tabs=page.locator('.mg-status-tabs');expect(tabs.get_by_role('button',name=re.compile('^Bảo lưu'))).to_contain_text('0');expect(tabs.get_by_role('button',name=re.compile('^Nợ xấu'))).to_contain_text('0')
        tabs.get_by_role('button',name=re.compile('^Bảo lưu')).click();expect(tabs.get_by_role('button',name=re.compile('^Bảo lưu'))).to_have_attribute('aria-pressed','true');expect(page.get_by_text('Không tìm thấy kết quả',exact=True).filter(visible=True)).to_be_visible()
        checks.append(dict(browser=engine,case='ownership-list-keeps-bad-debt-and-hold-filters-with-counts'));ctx.unroute_all(behavior='ignoreErrors');ctx.close();browser.close()
assert not errors,errors
assert not unexpected,unexpected
assert not any(write['slot']=='rental-document-2' for write in writes),writes
result=dict(passed=len(checks),checks=checks,javascriptErrors=errors,unexpectedWrites=unexpected,realBusinessWrites=0)
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2))
