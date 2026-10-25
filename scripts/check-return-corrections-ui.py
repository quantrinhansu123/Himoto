"""Synthetic returned-contract editing. All business/file/Telegram writes are intercepted."""
import argparse,copy,json,struct,zlib
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3030');p.add_argument('--sessions-file',required=True);p.add_argument('--output',default='.backups/return-corrections-20261025/ui')
a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True);tokens=json.loads(Path(a.sessions_file).read_text());checks,errors,unexpected,writes=[],[],[],[];state={}
expect.set_options(timeout=30000)
def chunk(kind,data):return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
pixel=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',160,100,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\x00'+bytes([216,234,242])*160)*100))+chunk(b'IEND',b'')
line=dict(item_id=1001,order_id=900,contract_code='QA-RETURN',order_status='completed',customer_name='Khách trả xe QA',customer_id_card='',vehicle_id=101,vehicle_name='VISION QA',license='QA-101',store_id=33,store_name='CS Hà Đông QA',scheduled_start_at='2026-10-20T09:00:00+07:00',scheduled_return_at='2026-10-24T09:00:00+07:00',completed_at='2026-10-24T10:30:00+07:00',item_revision='7',order_revision='7',total_amount=190000,paid_amount=190000,overdue=False,daily_price=150000,deposit_paid=1000000,deposit_held=0,late_fee=40000,repair_fee=0,repair_note='',early_discount=0,hourly_rate=20000)
accounts=[dict(id=99,kind='cash',store_id=33,owner_type='',label='Két tiền mặt Hà Đông QA'),dict(id=15,kind='bank',store_id=33,owner_type='personal',label='CK cá nhân · Ngân hàng QA'),dict(id=17,kind='bank',store_id=0,owner_type='company',label='CK công ty · Ngân hàng QA')]
def photos():return [dict(slot=slot,mime_type='image/png',updated_at='2026-10-25T09:00:00Z') for slot in state['photos']]
def correction():
    data=copy.deepcopy(state['context']);data['blocked_reason']='Lượt này đang gửi, gửi dở hoặc thu hồi Telegram. Đối chiếu và hoàn tất trước khi sửa.' if state.get('blocked') else '';return data
def telegram():
    selected=state['context'];refund=selected['settlement']['refund'];method='CK TK công ty' if refund['method']=='company_transfer' else 'Tiền mặt'
    event=dict(key='return:900:1001',kind='return',label='Trả xe · QA-101',phases=['return-1001'],text=f"Khách trả xe: Khách trả xe QA\nBiển số: QA-101\nHoàn cọc: {refund['amount']}\nHình thức thanh toán: {method}\nGhi chú: {selected['note']}\nHĐ: QA-RETURN",hash=('b' if state.get('saved') else 'a')*64,photo_count=len(photos()),video_count=0,status='sent' if state.get('sent') else 'manual',sent_at=None,can_send=not state.get('sent'),unchanged=bool(state.get('sent')),attachments=[dict(slot=r['slot'],mime_type=r['mime_type'],label='Ảnh trả xe QA') for r in photos()],destination_label='Nhóm Telegram cơ sở QA')
    rental=dict(event,key='finalize:900:QA-RETURN',kind='rental',label='Thuê xe cũ',phases=['rental'])
    return dict(auto_enabled=False,next_renewal_version=2,events=[rental,event])
def mock(route):
    if mock_contract_type_read(route):return
    req=route.request;path=urlparse(req.url).path
    if path=='/api/auth/photo-uploads/sign':
        state['upload_public_id']='qa/'+req.post_data_json['upload_id'];route.fulfill(json=dict(status='success',data=dict(cloud_name='qa',api_key='qa',signature='qa',params=dict(public_id=state['upload_public_id'],timestamp=1))));return
    if path.startswith('/api/auth/record-photos/contracts/900'):
        slot=path.rsplit('/',1)[-1]
        if req.method=='PUT':state['photos'].add(slot);writes.append(dict(path=path,method='PUT'));data={}
        elif req.method=='DELETE':state['photos'].discard(slot);writes.append(dict(path=path,method='DELETE'));data={}
        elif path.endswith('/900'):data=photos()
        else:route.fulfill(body=pixel,content_type='image/png');return
        route.fulfill(json=dict(status='success',data=data));return
    if req.method not in ('GET','HEAD'):
        body=req.post_data_json;writes.append(dict(path=path,method=req.method,body=body))
        if path=='/api/auth/returns/correction':
            assert req.method=='PATCH' and body['item_id']==1001 and len(body['items'])==1
            assert body['items'][0]['fee_override']=='40000'
            refund=body['settlement']['refund'];assert refund['method']=='company_transfer' and refund['account_id']==17
            assert refund['recipient_account']=='000123456' and refund['recipient_name']=='Khách nhận hoàn QA'
            assert body['reason']=='Nhập nhầm hình thức hoàn cọc QA'
            assert body['note']=='Hoàn cọc theo bill đã đối chiếu QA'
            if state.get('fail_once'):
                state['fail_once']=False;state['failed_request']=body['request_id'];route.fulfill(status=409,json=dict(status='error',message='QA hồ sơ đã thay đổi. Giữ form để đối chiếu.'));return
            if state.get('failed_request'):assert body['request_id']==state['failed_request']
            state['saved']=True;state['context'].update(revision='b'*64,note=body['note'],settlement=body['settlement']);state['context']['settlement']['revision']='8';data=correction()
        elif path=='/api/auth/order/car-rental/900/telegram':
            assert body['action']=='send' and body['event_key']=='return:900:1001';assert state.get('saved') or state.get('direct');state['sent']=True;data=telegram()
        else:unexpected.append(req.method+' '+path);route.abort();return
        route.fulfill(json=dict(status='success',data=data));return
    if path=='/api/auth/returns':data=[line]
    elif path=='/api/auth/returns/correction':data=correction()
    elif path=='/api/auth/order/car-rental/900/telegram':data=telegram()
    elif path in ('/api/auth/vehicles/inventory','/api/auth/vehicle/vehicles'):data=[dict(id=101,store_id=33,current_store_id=33,name='VISION QA',license='QA-101',status='ready',available=True,rental_blockers=[])]
    elif path in ('/api/auth/stores','/api/auth/store-directory'):data=[dict(id=33,store_name='CS Hà Đông QA',status='opening')]
    elif path=='/api/auth/order/car-rental':data=[dict(id=900,contract_number='QA-RETURN',store_id=33,order_status='completed',customer_name='Khách trả xe QA',total_amount=190000,paid_amount=190000)]
    elif path in ('/api/auth/customers','/api/auth/contract-staff','/api/auth/hr/staff','/api/auth/payment-events'):data=[]
    elif path=='/api/auth/gps':data=dict(devices=[],events=[])
    elif path=='/api/session':route.fulfill(json=dict(user=dict(name='QA')));return
    else:unexpected.append(req.method+' '+path);route.abort();return
    route.fulfill(json=dict(status='success',data=data))
def cloud(route):route.fulfill(json=dict(public_id=state['upload_public_id'],version=1,signature='qa'),headers={'Access-Control-Allow-Origin':'*'})

with sync_playwright() as pw:
    for engine,width,height,role in [('chromium',1280,720,'admin'),('webkit',390,844,'staff')]:
        write_start=len(writes)
        state.clear();state.update(photos={'return-1001-1'},fail_once=True,context=dict(order_id=900,code='QA-RETURN',customer='Khách trả xe QA',revision='a'*64,event_key='return:900:1001',lines=[line],previous_adjustment=40000,note='',blocked_reason='',payment=dict(id=900,code='QA-RETURN',status='completed',store_id=33,revision='7',total_amount=190000,paid_amount=150000,remaining=0,deposit_paid=1000000,deposit_refunded=0,deposit_held=1000000,company_paid_amount=0,company_payment_count=0,accounts=accounts,history=[],items=[],end_date=None),settlement=dict(order_id=900,revision='7',receipts=[dict(kind='late_fee',request_id='',amount='40000',method='cash',account_id=99,paid_at='2026-10-24T10:30')],refund=dict(request_id='',amount='1000000',method='cash',account_id=99,paid_at='2026-10-24T10:30'))))
        browser=getattr(pw,engine).launch();ctx=browser.new_context(viewport=dict(width=width,height=height),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
        ctx.add_cookies([dict(name='himoto_management_session',value=tokens[role],url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock);ctx.route('https://api.cloudinary.com/**',cloud)
        ctx.add_init_script("""const fetchOriginal=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/auth/payment-events')return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return fetchOriginal.call(this,input,options);};""")
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(a.url+'/contracts?action=return&query=QA-101',wait_until='domcontentloaded',timeout=120000)
        returned=page.get_by_role('dialog',name='Trả xe',exact=True);expect(returned.get_by_role('button',name='Sửa hồ sơ trả xe',exact=True)).to_be_visible()
        expect(returned.get_by_role('button',name='Gửi Telegram',exact=True)).to_be_visible();expect(returned.get_by_role('button',name='Xác nhận trả',exact=False)).to_have_count(0)
        returned.get_by_role('button',name='Sửa hồ sơ trả xe',exact=True).click();editor=page.get_by_role('dialog',name='Sửa hồ sơ trả xe',exact=True)
        expect(editor.get_by_label('Phí quá hạn (VNĐ)',exact=True)).to_have_value('40000');expect(editor.get_by_label('Phí sửa chữa (VNĐ)',exact=True)).to_have_value('0')
        expect(editor.get_by_label('Giảm tiền thuê trả sớm (VNĐ)',exact=True)).to_be_editable()
        editor.screenshot(path=str(out/f'{engine}-{width}-return-editor.png'))
        checks.append(f'{engine}: a previously returned vehicle has direct edit/send actions; all saved return fields load without a second confirmation')
        refund=editor.locator('section[aria-label="Khoản thu hoàn 2"]')
        refund.get_by_label('Hình thức thanh toán',exact=True).select_option('company_transfer')
        expect(refund.get_by_label('Tài khoản thu / chi',exact=True)).to_have_value('')
        refund.get_by_label('Tài khoản thu / chi',exact=True).select_option('17')
        refund.get_by_label('Ngân hàng nhận hoàn',exact=True).fill('QA Bank')
        refund.get_by_label('Số tài khoản nhận hoàn',exact=True).fill('000123456')
        refund.get_by_label('Tên người nhận hoàn',exact=True).fill('Khách nhận hoàn QA')
        editor.get_by_label('Ghi chú gửi cùng Telegram',exact=True).fill('Hoàn cọc theo bill đã đối chiếu QA')
        editor.get_by_label('Lý do chỉnh sửa (bắt buộc)',exact=True).fill('Nhập nhầm hình thức hoàn cọc QA')
        refund.scroll_into_view_if_needed();editor.screenshot(path=str(out/f'{engine}-{width}-refund-method.png'))
        expect(editor.get_by_role('button',name='2. Kiểm tra & gửi Telegram',exact=True)).to_be_disabled()
        editor.get_by_role('button',name='Lưu thay đổi',exact=True).click()
        expect(editor.get_by_role('alert')).to_contain_text('QA hồ sơ đã thay đổi')
        expect(refund.get_by_label('Số tài khoản nhận hoàn',exact=True)).to_have_value('000123456')
        checks.append(f'{engine}: changing cash to transfer requires a matching account; unsaved edits block send and a conflict preserves every field')
        editor.get_by_role('button',name='Lưu thay đổi',exact=True).click();telegram_dialog=page.get_by_role('dialog',name='Kiểm tra & gửi Telegram · Trả xe',exact=True)
        expect(telegram_dialog.locator('.mg-telegram-preview')).to_contain_text('CK TK công ty')
        expect(telegram_dialog.locator('.mg-telegram-preview')).to_contain_text('Hoàn cọc theo bill đã đối chiếu QA')
        expect(telegram_dialog.get_by_role('combobox',name='Giao dịch cần gửi Telegram')).to_have_value('return:900:1001')
        expect(telegram_dialog.get_by_role('combobox',name='Giao dịch cần gửi Telegram').locator('option')).to_have_count(1)
        assert not [w for w in writes[write_start:] if w['path'].endswith('/telegram')]
        checks.append(f'{engine}: successful save moves to the corrected return preview, filters out rental events and never sends automatically')
        page.once('dialog',lambda d:d.accept());telegram_dialog.get_by_role('button',name='Xóa ảnh Ảnh trả xe QA',exact=True).click()
        expect(telegram_dialog.get_by_role('button',name='Xóa ảnh Ảnh trả xe QA',exact=True)).to_have_count(0)
        telegram_dialog.get_by_role('button',name='1. Sửa hồ sơ',exact=True).click();editor=page.get_by_role('dialog',name='Sửa hồ sơ trả xe',exact=True)
        upload=editor.locator('input[type="file"][multiple][accept="image/*"]').first
        upload.set_input_files(dict(name='qa-return.png',mimeType='image/png',buffer=pixel))
        expect(editor.get_by_role('button',name='Lưu ảnh / video',exact=True)).to_be_enabled(timeout=60000)
        expect(editor.get_by_role('button',name='Kiểm tra & gửi Telegram',exact=True)).to_be_disabled()
        editor.get_by_role('button',name='Lưu ảnh / video',exact=True).click()
        expect(editor.get_by_role('button',name='Kiểm tra & gửi Telegram',exact=True)).to_be_enabled(timeout=60000)
        editor.get_by_role('button',name='Kiểm tra & gửi Telegram',exact=True).click()
        telegram_dialog=page.get_by_role('dialog',name='Kiểm tra & gửi Telegram · Trả xe',exact=True)
        expect(telegram_dialog.get_by_role('button',name='Gửi toàn bộ Telegram',exact=False)).to_contain_text('1 ảnh')
        checks.append(f'{engine}: saved wrong photos can be removed, replacement photos persist and pending uploads block the send step')
        telegram_dialog.get_by_role('button',name='Gửi toàn bộ Telegram',exact=False).click()
        expect(telegram_dialog.get_by_role('button',name='Đã gửi Telegram',exact=False)).to_be_disabled()
        expect(telegram_dialog.get_by_role('combobox',name='Giao dịch cần gửi Telegram').locator('option')).to_have_count(1)
        telegram_dialog.screenshot(path=str(out/f'{engine}-{width}-corrected-telegram.png'))
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        assert telegram_dialog.evaluate('el=>el.scrollWidth<=el.clientWidth+1')
        footer=telegram_dialog.locator('.mg-dialog-footer').bounding_box();assert footer['y']+footer['height']<=height+1
        checks.append(f'{engine}: explicit send occurs once, duplicate send is locked, footer remains visible and the dialog has no horizontal overflow')
        telegram_dialog.get_by_role('button',name='Đóng',exact=True).click()
        returned=page.get_by_role('dialog',name='Trả xe',exact=True);state['direct']=True;returned.get_by_role('button',name='Gửi Telegram',exact=True).click()
        expect(page.get_by_role('dialog',name='Kiểm tra & gửi Telegram · Trả xe',exact=True).get_by_role('button',name='Đã gửi Telegram',exact=False)).to_be_disabled()
        checks.append(f'{engine}: reopening the return reaches its saved Telegram state directly')
        ctx.close();browser.close()
assert not errors,errors
assert not unexpected,unexpected
result=dict(passed=len(checks),checks=checks,errors=errors,unexpected=unexpected,simulatedWrites=len(writes),realBusinessWrites=0,realTelegramMessages=0)
(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2))
