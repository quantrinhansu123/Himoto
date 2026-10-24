"""Saved/new photo previews on phone screens. All business/provider APIs are intercepted."""
import argparse, json, re, struct, zlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3029');p.add_argument('--session-cookie-file',required=True);p.add_argument('--audit',action='store_true');p.add_argument('--browser',choices=['all','chromium','webkit'],default='all');p.add_argument('--output',default='.backups/mobile-photos-20261025/ui');a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True);expect.set_options(timeout=20000)
now=datetime.now(timezone.utc);stamp=lambda days:(now-timedelta(days=days)).isoformat()
def chunk(kind,data):return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
pixel=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',64,48,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\x00'+bytes([212,227,238])*64)*48))+chunk(b'IEND',b'')
vehicle=dict(id=101,name='Xe kiểm tra ảnh',license='QA-00101',brand='Honda',type='xeso',year=2025,store_id=1,current_store_id=1,status='ready',vehicle_revision='1')
customer=dict(id=77,name='Khách kiểm tra ảnh',phone='0900000077',id_card='001234567877',store_id=1,status='active',customer_revision='1')
contract=dict(id=901,contract_number='QA-MOBILE-PHOTOS',order_status='renting',order_type='daily',customer_id=77,customer_name=customer['name'],customer_phone=customer['phone'],store_id=1,total_amount=1000000,paid_amount=0,start_date=stamp(1),end_date=stamp(-3),vehicles=[vehicle])
slots={'contracts':['rental-1','rental-document-1','renewal-2-1','return-1001-1','plate-101','customer-id-front'],'customers':['id_front','id_back','driver_license'],'vehicles':['registration-front','registration-back','purchase-document-1','purchase-document-2']}
checks,errors,writes,requests=[],[],[],[]
state={'fail_slot':None,'image_failures':0,'version':0}

def mock(route):
    if mock_contract_type_read(route):return
    req=route.request;path=urlparse(req.url).path;requests.append(dict(method=req.method,path=path))
    if req.method not in ('GET','HEAD'):
        if path=='/api/auth/gps/refresh':route.fulfill(json=dict(status='success',data={}));return
        if path=='/api/auth/photo-uploads/sign':
            route.fulfill(json=dict(status='success',data=dict(cloud_name='qa-only',api_key='qa-key',signature='qa-signature',params=dict(public_id='qa-preview-only'))));return
        # The document viewer copies customer documents on opening; keep it in fixtures.
        if req.method=='POST' and path=='/api/auth/record-photos/contracts/901':route.fulfill(json=dict(status='success',data=dict(copied=0)));return
        writes.append(req.method+' '+path);route.abort();return
    if path=='/api/session':route.fulfill(json=dict(user=dict(name='QA')));return
    if path.startswith('/api/auth/record-photos/'):
        parts=path.split('/');entity=parts[4]
        if len(parts)==7:
            if state['fail_slot']==parts[6]:state['image_failures']+=1;route.fulfill(status=503,json=dict(status='error',message='QA image unavailable'));return
            route.fulfill(body=pixel,content_type='image/png');return
        route.fulfill(json=dict(status='success',data=[dict(slot=slot,mime_type='image/png',updated_at=(now+timedelta(seconds=state['version'])).isoformat()) for slot in slots[entity]]));return
    data={'/api/auth/stores':[dict(id=1,store_name='CS QA',status='opening')],'/api/auth/store-directory':[dict(id=1,store_name='CS QA',status='opening')],'/api/auth/order/car-rental':[contract],'/api/auth/vehicle/vehicles':[vehicle],'/api/auth/vehicles/inventory':[vehicle],'/api/auth/customers':[customer]}.get(path,[])
    if path=='/api/auth/gps':data=dict(devices=[],events=[],selected_vehicles=[])
    route.fulfill(json=dict(status='success',data=data))

def open_detail(page,path):
    page.goto(a.url+path,wait_until='networkidle',timeout=90000)
    card=page.locator('.mg-mobile-card-main:visible').first;expect(card).to_be_visible();card.click()
    dialog=page.locator('dialog[open]').last;expect(dialog).to_be_visible();return dialog

def loaded(page,img):
    img.scroll_into_view_if_needed();expect(img).to_be_visible()
    page.wait_for_function('img=>img.complete&&img.naturalWidth>0',arg=img.element_handle())
    box=img.bounding_box();assert box and box['width']>30 and box['height']>20,box
    assert box['x']>=-1 and box['x']+box['width']<=page.viewport_size['width']+1,dict(photo=img.get_attribute('alt'),box=box)

with sync_playwright() as pw:
    for engine in (['chromium','webkit'] if a.browser=='all' else [a.browser]):
        browser=getattr(pw,engine).launch();ctx=browser.new_context(viewport=dict(width=390,height=844),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
        ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.session_cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
        ctx.route('https://api.cloudinary.com/**',lambda route:route.fulfill(json=dict(public_id='qa-preview-only',version=1,signature='qa-signature')))
        ctx.add_init_script("""const qaFetch=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(['/api/auth/payment-events','/api/auth/gps/refresh'].includes(url.pathname))return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return qaFetch.call(this,input,options);};""")
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        dialog=open_detail(page,'/contracts?contract_id=901');dialog.get_by_role('tab',name='Ảnh thuê / trả xe',exact=True).click()
        gallery=dialog.locator('.mg-transaction-photo-gallery').first;expect(gallery.locator('img')).to_have_count(6)
        for img in gallery.locator('img').all():loaded(page,img)
        checks.append(dict(browser=engine,case='contract-gallery-decoded',photos=6))
        uploader=dialog.locator('.mg-media-gallery').first
        expect(uploader.locator('img')).to_have_count(2)
        if a.audit:
            checks.append(dict(browser=engine,case='saved-upload-previews',open=uploader.evaluate('el=>el.open'),visible=uploader.locator('img:visible').count(),total=uploader.locator('img').count()))
            uploader.locator('summary').click()
        else:expect(uploader).to_have_attribute('open','')
        for img in uploader.locator('img').all():loaded(page,img)
        uploader.screenshot(path=str(out/f'{engine}-contract-saved-photos.png'))
        checks.append(dict(browser=engine,case='saved-upload-previews-decoded',photos=2))
        for path,entity,count in [('/customers','customers',3),('/vehicles','vehicles',4)]:
            dialog=open_detail(page,path);photos=dialog.locator('.mg-record-photos');expect(photos.locator('img')).to_have_count(count)
            for img in photos.locator('img').all():loaded(page,img)
            photos.screenshot(path=str(out/f'{engine}-{entity}-photos.png'))
            page.screenshot(path=str(out/f'{engine}-{entity}-phone-viewport.png'))
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
            checks.append(dict(browser=engine,case=entity+'-photos-decoded',photos=count))
            if entity=='customers' and not a.audit:
                field=photos.get_by_role('group',name='CCCD mặt trước',exact=True)
                field.get_by_label('Chọn ảnh CCCD mặt trước',exact=True).set_input_files(dict(name='qa-new.png',mimeType='image/png',buffer=pixel))
                expect(field.get_by_role('img',name='CCCD mặt trước',exact=True)).to_have_attribute('src',re.compile('^blob:'))
                loaded(page,field.get_by_role('img',name='CCCD mặt trước',exact=True))
                assert field.locator('img').get_attribute('src').startswith('blob:')
                expect(dialog.get_by_role('button',name='Lưu ảnh',exact=True)).to_be_enabled()
                field.screenshot(path=str(out/f'{engine}-new-photo-preview.png'))
                checks.append(dict(browser=engine,case='new-phone-library-photo-preview-without-record-write'))
        if not a.audit:
            # A failed individual image needs a visible retry, without changing the record.
            state['fail_slot']='registration-front';state['image_failures']=0;state['version']+=1
            dialog=open_detail(page,'/vehicles');photos=dialog.locator('.mg-record-photos')
            retry=photos.get_by_role('button',name='Tải lại ảnh Đăng ký xe mặt trước',exact=True)
            expect(retry).to_be_visible();assert state['image_failures']>0
            state['fail_slot']=None;retry.click();loaded(page,photos.get_by_role('img',name='Đăng ký xe mặt trước',exact=True))
            checks.append(dict(browser=engine,case='individual-image-retry'))
            state['fail_slot']='rental-1';state['image_failures']=0;state['version']+=1
            dialog=open_detail(page,'/contracts?contract_id=901');dialog.get_by_role('tab',name='Ảnh thuê / trả xe',exact=True).click()
            gallery=dialog.locator('.mg-transaction-photo-gallery').first
            gallery.locator('.mg-record-photo-preview').first.scroll_into_view_if_needed()
            retry=gallery.get_by_role('button',name='Tải lại ảnh Khi thuê · Toàn cảnh xe',exact=True)
            expect(retry).to_be_visible();assert state['image_failures']>0
            state['fail_slot']=None;retry.click();loaded(page,gallery.get_by_role('img',name='Khi thuê · Toàn cảnh xe',exact=True))
            checks.append(dict(browser=engine,case='contract-gallery-image-retry'))
        print(json.dumps(dict(browser=engine,checks=len(checks))),flush=True)
        ctx.unroute_all(behavior='ignoreErrors');ctx.close();browser.close()
assert not errors,errors
assert not writes,writes
result=dict(passed=len(checks),checks=checks,javascriptErrors=errors,realBusinessWrites=0,unexpectedWrites=writes)
(out/('audit.json' if a.audit else 'results.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2))
