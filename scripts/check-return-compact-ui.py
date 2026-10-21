"""Compact return/media and plain-plate transfer regressions. All writes are intercepted."""
import argparse,json,re
from datetime import datetime,timedelta,timezone
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from PIL import Image
import qrcode
from playwright.sync_api import sync_playwright,expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3022');p.add_argument('--cookie-file',required=True);p.add_argument('--browser',choices=['chromium','webkit'],default='chromium');p.add_argument('--output',default='.backups/return-ux-20261021/ui');p.add_argument('--video-fixture');a=p.parse_args()
out=Path(a.output)/a.browser;out.mkdir(parents=True,exist_ok=True);expect.set_options(timeout=30000)
now=datetime.now(timezone(timedelta(hours=7)));state={};posts=[];errors=[];unexpected=[];checks=[]
images=[]
for i,color in enumerate(['#ebf1f7','#c6d5ab','#dcc9ed']):
    file=out/f'qa-photo-{i}.png';Image.new('RGB',(160,120),color).save(file);images.append(file)
def tlv(key,value):return key+str(len(value)).zfill(2)+value
value='000201010211'+tlv('38',tlv('00','A000000727')+tlv('01',tlv('00','970422')+tlv('01','000123456789'))+tlv('02','QRIBFTTA'))+'53037045802VN6304'
crc=0xffff
for byte in value.encode():
    crc^=byte<<8
    for _ in range(8):crc=((crc<<1)^0x1021 if crc&0x8000 else crc<<1)&0xffff
qr=out/'qa-refund-qr.png';qrcode.make(value+f'{crc:04X}').save(qr)
accounts=[dict(id=15,kind='bank',store_id=32,owner_type='personal',label='TK cá nhân QA'),dict(id=5,kind='cash',store_id=32,owner_type='',label='Két QA')]
stores=[dict(id=32,store_name='CS Nguyễn Hoàng',name='CS Nguyễn Hoàng',kind='physical',status='opening'),dict(id=33,store_name='CS Hà Đông',name='CS Hà Đông',kind='physical',status='opening')]
vehicle=dict(id=729,name='AIR BLADE',license='69D1-328.80',status='ready',available=True,rental_blockers=[],store_id=32,current_store_id=32,store_name='CS Nguyễn Hoàng',type='xega',vehicle_revision='1',rentals=[])

def mock(route):
    if mock_contract_type_read(route):return
    req=route.request;path=urlparse(req.url).path;query=parse_qs(urlparse(req.url).query)
    if path=='/api/session':route.fulfill(json=dict(user=dict(name='QA')));return
    if path.startswith('/api/auth/record-photos/contracts/901/'):
        slot=path.rsplit('/',1)[-1]
        if req.method=='PUT':
            if state.get('failSave'):
                state['failSave']=False;route.fulfill(status=503,json=dict(status='error',message='QA chưa lưu được ảnh'));return
            state['photos'][slot]='image/jpeg';state['photoWrites']+=1;route.fulfill(json=dict(status='success'));return
        route.fulfill(body=images[0].read_bytes(),content_type='image/png');return
    if path=='/api/auth/photo-uploads/sign':
        state['uploads']+=1;body=req.post_data_json
        route.fulfill(json=dict(status='success',data=dict(cloud_name='qa',api_key='qa',signature='qa',params=dict(public_id='qa/'+body['upload_id'],timestamp=1))));return
    if path=='/api/auth/returns' and req.method=='POST':
        assert not state.get('completed');body=req.post_data_json;posts.append(body)
        route.fulfill(json=dict(status='success',data=[dict(item_id=101,contract_code='QA-RETURN',status='completed',fee=int(body['items'][0].get('fee_override','0')))]));return
    if path=='/api/auth/vehicles/729/actions' and req.method=='POST':
        assert req.post_data_json['action']=='transfer';state['transfers']+=1
        route.fulfill(json=dict(status='success',data=dict(id=729,event_id=700)));return
    if path=='/api/auth/gps/refresh':route.fulfill(json=dict(status='success',data=[]));return
    if req.method!='GET':unexpected.append(req.method+' '+path);route.abort();return
    if path=='/api/auth/order/car-rental' and query.get('table')==['1']:
        data=dict(rows=[],total=0,scopeCount=0,tabCount=0,page=1,pages=1,statusCounts=[],statuses=[],dueCount=0,summary=dict(contractCount=0,blacklistCount=0,totalAmount=0,receivableAmount=0,badDebtAmount=0))
    elif path=='/api/auth/returns':
        data=[dict(item_id=101,order_id=901,contract_code='QA-RETURN',order_status='completed' if state.get('completed') else 'renting',customer_name='Khách QA',customer_id_card='',vehicle_id=729,vehicle_name='Xe QA',license='QA-328.80',store_id=32,store_name='CS QA',scheduled_start_at=(now-timedelta(days=5)).isoformat(),scheduled_return_at=(now-timedelta(days=3)).isoformat(),completed_at=(now-timedelta(hours=1)).isoformat() if state.get('completed') else None,item_revision='1',order_revision='1',total_amount=420000,paid_amount=420000,overdue=True,daily_price=None if state.get('missingPrice') else 140000,deposit_paid=1000000,deposit_held=1000000)]
    elif path.endswith('/payments'):data=dict(id=901,code='QA-RETURN',status='renting',store_id=32,revision='1',total_amount=420000,paid_amount=420000,remaining=0,deposit_paid=1000000,deposit_refunded=0,deposit_held=1000000,company_paid_amount=0,company_payment_count=0,accounts=accounts,history=[],items=[])
    elif path.endswith('/telegram'):data=dict(auto_enabled=False,events=[])
    elif path=='/api/auth/record-photos/contracts/901':data=[dict(slot=slot,mime_type=mime,updated_at=now.isoformat()) for slot,mime in state['photos'].items()]
    elif path in ['/api/auth/stores','/api/auth/store-directory']:data=stores
    elif path=='/api/auth/vehicle/vehicles':data=[vehicle]
    elif path=='/api/auth/vehicles/inventory':data=[vehicle,dict(id=999,license='29B1-111.11',name='Xe khác cơ sở QA',store_id=23,store_name='CS Giáp Bát',status='ready')]
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))

def cloud(route):
    body=route.request.post_data_buffer or b''
    match=re.search(rb'name="public_id"\r\n\r\n([^\r]+)',body)
    assert match,'Signed upload must preserve its public ID'
    route.fulfill(json=dict(public_id=match[1].decode(),version=1,signature='qa'))

with sync_playwright() as pw:
    browser=getattr(pw,a.browser).launch();ctx=browser.new_context(viewport=dict(width=390 if a.browser=='webkit' else 1440,height=900),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
    ctx.add_init_script("""const qaFetch=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/auth/payment-events')return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return qaFetch.call(this,input,options);};""")
    ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock);ctx.route('https://api.cloudinary.com/**',cloud)
    def collect_error(error):errors.append(str(error))
    page=ctx.new_page();page.on('pageerror',collect_error)
    def reset_page():
        global page
        # Separate scenarios avoid WebKit reporting cancelled Playwright-routed
        # fetches as CORS errors during full-page navigation. Keep every live-page error.
        page.wait_for_load_state('networkidle');page.remove_listener('pageerror',collect_error);page.close()
        page=ctx.new_page();page.on('pageerror',collect_error)
    def open_return(**kwargs):
        reset_page()
        state.clear();state.update(photos={},uploads=0,photoWrites=0,transfers=0);state.update(kwargs)
        page.goto(a.url+'/contracts?action=return&query=QA-328.80',wait_until='networkidle',timeout=120000)
        dialog=page.get_by_role('dialog',name='Trả xe',exact=True)
        expect(dialog.get_by_role('button',name='Xác nhận trả 1 xe',exact=True) if not state.get('completed') else dialog.get_by_role('button',name='Đóng',exact=True)).to_be_visible()
        expect(dialog.locator('.mg-transaction-photos').first.get_by_role('button',name='Chọn nhiều ảnh',exact=True)).to_be_enabled()
        return dialog
    def fee(dialog):return dialog.get_by_role('textbox',name='Phí quá hạn thực tế QA-328.80',exact=True)
    def defer(dialog):dialog.get_by_label('Chưa hoàn cọc',exact=False).check()
    def confirm(dialog):dialog.get_by_role('button',name='Xác nhận trả 1 xe',exact=True).click()

    dialog=open_return();before=len(posts)
    assert not dialog.locator('.mg-media-individual').get_attribute('open')
    expect(dialog.get_by_role('group',name='Toàn cảnh xe',exact=True)).not_to_be_visible()
    assert dialog.locator('.mg-media-upload-toolbar:visible').count()==1
    assert not dialog.locator('.mg-contract-documents').is_visible()
    quick=dialog.get_by_role('tab',name='Tải nhanh / Hàng loạt',exact=True)
    detail=dialog.get_by_role('tab',name='Tải ảnh chi tiết',exact=True)
    expect(quick).to_have_attribute('aria-selected','true')
    quick.focus();quick.press('ArrowRight');expect(detail).to_be_focused()
    expect(detail).to_have_attribute('aria-selected','true')
    expect(dialog.locator('.mg-media-upload-toolbar').first).not_to_be_visible()
    dialog.locator('.mg-media-individual > summary').click()
    expect(dialog.get_by_role('group',name='Toàn cảnh xe',exact=True)).to_be_visible()
    detail.press('Home');expect(quick).to_be_focused()
    expect(dialog.get_by_role('group',name='Toàn cảnh xe',exact=True)).not_to_be_visible()
    checks.append('Two keyboard-accessible tabs combine the batch uploader with expandable optional detail fields')
    confirm(dialog)
    expect(dialog.get_by_role('alert').filter(has_text='Hoàn tất mục')).to_be_visible();assert len(posts)==before
    expect(dialog.get_by_label('Chưa hoàn cọc',exact=False)).to_be_focused()
    checks.append('Short form has one visible bulk uploader and collapsed optional fields; a missing refund decision focuses the real blocking section')

    fee(dialog).fill('50000');dialog.get_by_label('Đã thu phí quá hạn',exact=True).check()
    fee(dialog).fill('0');defer(dialog);confirm(dialog)
    expect(dialog).to_contain_text('Đã trả xe hợp đồng QA-RETURN')
    assert posts[-1]['items'][0]['fee_override']=='0' and posts[-1]['settlements'][0]['receipts']==[]
    assert posts[-1]['settlements'][0]['refund_deferred']
    checks.append('Changing a previously selected late collection to 0 removes the hidden receipt, preserves the deposit decision and allows explicit confirmation')

    dialog=open_return(missingPrice=True);fee(dialog).fill('0');defer(dialog)
    dialog.get_by_text('Giờ trả và cách tính phí gợi ý',exact=True).click()
    dialog.locator('#contract-return-hourly-rate').fill('20001');dialog.locator('#contract-return-hourly-rate').press('Enter')
    assert len(posts)==before+1;confirm(dialog);expect(dialog).to_contain_text('Đã trả xe hợp đồng QA-RETURN')
    assert posts[-1]['items'][0]['fee_override']=='0' and posts[-1]['items'][0]['hourly_rate']=='20001'
    checks.append('A multi-day return with no daily price accepts actual 0; an integer hourly rate has no artificial step error and Enter never confirms')

    dialog=open_return();fee(dialog).fill('50000');dialog.get_by_label('Đã thu phí quá hạn',exact=True).check();defer(dialog);confirm(dialog)
    expect(dialog).to_contain_text('Đã trả xe hợp đồng QA-RETURN')
    assert posts[-1]['items'][0]['fee_override']=='50000' and posts[-1]['settlements'][0]['receipts'][0]['amount']=='50000'
    checks.append('A nonzero actual fee is preserved in the adjustment and selected receipt')

    dialog=open_return();fee(dialog).fill('50000');dialog.get_by_text('Giờ trả và cách tính phí gợi ý',exact=True).click()
    dialog.get_by_role('combobox',name='Giờ ngày giờ trả thực tế (24h)',exact=True).select_option(str((now.hour+1)%24).zfill(2))
    expect(fee(dialog)).to_have_value('50000')
    dialog.locator('#contract-returned-at').fill((now-timedelta(days=4)).date().isoformat())
    expect(dialog.get_by_role('textbox',name='Giảm doanh thu QA-328.80',exact=True)).to_have_value('0')
    checks.append('Editing the return time preserves actual money within the same timing category; a late fee never silently becomes an early-return discount')

    dialog=open_return();fee(dialog).fill('0');defer(dialog);before=len(posts)
    uploader=dialog.locator('.mg-transaction-photos').first
    uploader.get_by_label('Chọn nhiều ảnh hồ sơ',exact=True).set_input_files([str(images[0]),str(qr),str(images[1])])
    save=uploader.get_by_role('button',name='Lưu ảnh / video',exact=True);expect(save).to_be_enabled()
    uploader.get_by_role('tab',name='Tải ảnh chi tiết',exact=True).click()
    expect(save).to_be_enabled()
    expect(uploader.get_by_text('Còn 3 tệp mới chưa lưu',exact=False)).to_be_visible()
    uploader.get_by_role('tab',name='Tải nhanh / Hàng loạt',exact=True).click()
    assert save.bounding_box()['y']-uploader.get_by_role('button',name='Chọn nhiều ảnh',exact=True).bounding_box()['y']<250
    confirm(dialog);expect(dialog.get_by_role('alert').filter(has_text='Ảnh/video vừa chọn chưa lưu')).to_be_visible();assert len(posts)==before
    state['failSave']=True;save.click();expect(dialog.get_by_role('alert').filter(has_text='QA chưa lưu được ảnh')).to_be_visible();assert len(posts)==before
    save.click();expect(uploader.get_by_text('Đã lưu ảnh.',exact=True)).to_be_visible()
    assert 'return-101-document-2' in state['photos'] and len(state['photos'])==3
    assert uploader.locator('.mg-media-gallery').get_attribute('open') is None
    assert len(posts)==before
    checks.append('Switching between upload tabs preserves all pending files, including the QR, before a partial batch is saved')
    checks.append('One batch accepts vehicle and QR images, saves the QR to refund evidence, shows Save beside the picker, and retains files after a failed save without returning the vehicle')
    dialog.get_by_label('Đã hoàn cọc cho khách',exact=True).check()
    expect(dialog).to_contain_text('Đã nhận ảnh hồ sơ hoàn cọc')
    confirm(dialog);expect(dialog).to_contain_text('Đã trả xe hợp đồng QA-RETURN')
    assert posts[-1]['settlements'][0]['refund']['amount']=='1000000'
    checks.append('The QR from the combined batch is usable for a refund without uploading it again')

    dialog=open_return(completed=True);before=len(posts)
    expect(dialog.get_by_role('button',name='Xác nhận trả 1 xe',exact=True)).to_have_count(0)
    expect(dialog.get_by_text('Hoàn tất mục Thu phí và hoàn cọc',exact=False)).to_have_count(0)
    dialog.screenshot(path=str(out/'completed-return-before-upload.png'))
    height=dialog.locator('form').evaluate('element=>element.scrollHeight');assert height<1100,dict(completedFormHeight=height)
    uploader=dialog.locator('.mg-transaction-photos').first
    uploader.get_by_label('Chọn nhiều ảnh hồ sơ',exact=True).set_input_files([str(images[0]),str(images[1])])
    uploader.get_by_role('button',name='Lưu ảnh / video',exact=True).click();expect(uploader.get_by_text('Đã lưu ảnh.',exact=True)).to_be_visible()
    assert len(posts)==before
    uploader.locator('.mg-media-gallery > summary').click();expect(uploader.locator('.mg-media-thumbnails img')).to_have_count(2)
    uploader.locator('.mg-media-gallery > summary').click()
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
    dialog.screenshot(path=str(out/'completed-return-compact.png'))
    checks.append('A completed return accepts supplemental batches in a short dialog, hides the confirmation/settlement warning and retains an expandable gallery')

    original={'return-101-1':'image/jpeg','return-101-document-18':'image/jpeg','rental-1':'image/jpeg'}
    dialog=open_return(completed=True,photos=dict(original));before=len(posts);uploader=dialog.locator('.mg-transaction-photos').first
    uploader.get_by_label('Chọn nhiều ảnh hồ sơ',exact=True).set_input_files([str(images[i%len(images)]) for i in range(17)])
    save=uploader.get_by_role('button',name='Lưu ảnh / video',exact=True);expect(save).to_be_enabled();save.click();expect(uploader.get_by_text('Đã lưu ảnh.',exact=True)).to_be_visible()
    assert len(state['photos'])==20 and all(state['photos'].get(slot)==mime for slot,mime in original.items())
    assert 'return-101-document-2' not in state['photos'],'Ordinary bulk images cannot become the QR evidence slot'
    uploader.locator('.mg-media-gallery > summary').click();expect(uploader.locator('.mg-media-thumbnails img')).to_have_count(19)
    uploader.locator('.mg-media-gallery > summary').click();assert len(posts)==before
    checks.append('A later 17-photo batch expands beyond 15, preserves existing vehicle/document/other-phase evidence and never fills the QR slot with an ordinary image')
    if a.video_fixture:
        uploader.get_by_label('Chọn nhiều video tình trạng xe',exact=True).set_input_files(a.video_fixture)
        save=uploader.get_by_role('button',name='Lưu ảnh / video',exact=True);expect(save).to_be_enabled();save.click();expect(uploader.get_by_text('Đã lưu ảnh.',exact=True)).to_be_visible()
        assert 'return-101-video-1' in state['photos'] and len(posts)==before
        checks.append('The same compact uploader saves a synthetic video without returning the vehicle or touching the image batch')

    dialog=open_return();fee(dialog).fill('0');defer(dialog)
    dialog.screenshot(path=str(out/'active-return-compact.png'))
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
    checks.append('Active return fits the desktop or mobile width with reduced motion')

    reset_page();page.goto(a.url+'/vehicles',wait_until='networkidle',timeout=120000)
    page.get_by_role('button',name='Chuyển xe',exact=True).first.click()
    dialog=page.get_by_role('dialog',name='Chuyển xe',exact=True)
    for plate in ['69D1-328.80','69d132880','69D1 32880']:
        dialog.locator('#vehicle-action-vehicle').fill(plate)
        expect(dialog.locator('#vehicle-action-from')).to_have_value('CS Nguyễn Hoàng')
    dialog.locator('#vehicle-action-to').select_option('33')
    expect(dialog.get_by_role('button',name='Chuyển xe',exact=True)).to_be_enabled()
    dialog.locator('#vehicle-action-vehicle').fill('29B1-111.11')
    expect(dialog).to_contain_text('Chỉ tài khoản cơ sở đang giữ xe được chuyển')
    expect(dialog.locator('#vehicle-action-from')).to_have_value('CS Giáp Bát')
    expect(dialog.get_by_role('button',name='Chuyển xe',exact=True)).to_be_disabled();assert state['transfers']==0
    dialog.locator('#vehicle-action-vehicle').fill('69D1-328.80')
    dialog.screenshot(path=str(out/'transfer-plain-plate.png'))
    checks.append('Plain, lowercase and unpunctuated plates resolve a unique local vehicle; other-store lookup explains the location while keeping transfer disabled')
    assert not errors and not unexpected,(errors,unexpected)
    ctx.unroute_all(behavior='wait');ctx.close();browser.close()
result=dict(passed=len(checks),browser=a.browser,checks=checks,javascriptErrors=errors,unexpectedRequests=unexpected,simulatedReturns=len(posts),realBusinessWrites=0,realTelegramRequests=0)
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
