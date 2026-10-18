"""Synthetic final-submit QA. All business and file endpoints are intercepted."""
import argparse
import copy
import json
import struct
import zlib
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

parser=argparse.ArgumentParser()
parser.add_argument('--url',default='http://127.0.0.1:3101')
parser.add_argument('--session-cookie-file',required=True)
parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium')
parser.add_argument('--output',default='docs/qa/contract-final-submit')
args=parser.parse_args()
out=Path(args.output)/args.browser
out.mkdir(parents=True,exist_ok=True)
checks,errors,unexpected,writes=[],[],[],[]
def chunk(kind,data):
    return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
# A synthetic thumbnail keeps visual QA legible without customer photographs.
rgb=bytes([216,234,242])
pixel=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',160,100,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\x00'+rgb*160)*100))+chunk(b'IEND',b'')
stores=[dict(id=1,store_name='CS QA',status='opening')]
staff=[dict(id=8,store_id=1,full_name='Nhân viên làm hợp đồng QA',status='active')]
customer=dict(id=77,store_id=1,name='Khách QA',phone='0900000077',id_card='001234567877',address='Địa chỉ QA',status='active')
vehicle=dict(id=101,store_id=1,name='Xe QA',license='QA-101',status='ready',daily_price=200000,type='xega')
state={}

def photos():
    return [dict(slot=key,mime_type=mime,updated_at='2026-10-18T12:00:00Z') for key,mime in state.get('photos',{}).items()]

def telegram():
    attachments=[dict(slot=p['slot'],mime_type=p['mime_type'],label=p['slot']) for p in photos()]
    count=sum(p['mime_type']!='video/mp4' for p in photos())
    event=dict(key='finalize:901:000888',kind='rental',label='Thuê xe · QA-101',phases=['rental'],text='Khách thuê xe: Khách QA\nHợp đồng: 000888\nNhân viên làm hợp đồng: Nhân viên làm hợp đồng QA',hash='a'*64,photo_count=count,video_count=len(attachments)-count,status='sent' if state.get('sent') else 'manual',sent_at=None,can_send=not state.get('sent'),unchanged=bool(state.get('sent')),attachments=attachments)
    return dict(auto_enabled=False,next_renewal_version=2,events=[event] if state.get('finalized') else [])

def mock(route):
    if mock_contract_type_read(route):return
    req=route.request
    path=urlparse(req.url).path.rstrip('/')
    query=parse_qs(urlparse(req.url).query)
    data=None
    if path=='/api/auth/photo-uploads/sign':
        writes.append('cloud-sign')
        route.fulfill(json=dict(status='success',data=dict(cloud_name='qa',api_key='qa',signature='qa',params=dict(public_id='qa/'+req.post_data_json['upload_id'],timestamp=1))))
        return
    if path.startswith('/api/auth/record-photos/'):
        parts=path.split('/')
        if req.method=='GET' and len(parts)>6:
            route.fulfill(body=pixel,content_type='image/png');return
        if req.method=='PUT':
            state.setdefault('photos',{})[parts[-1]]='video/mp4' if '-video-' in parts[-1] else 'image/jpeg'
            writes.append('photo-save')
            data={}
        elif req.method=='POST':
            state.setdefault('photos',{}).update({'customer-id-front':'image/jpeg','customer-id-back':'image/jpeg','customer-driver-license':'image/jpeg'})
            data=dict(copied=3)
        elif req.method=='GET':data=photos() if '/contracts/' in path else []
    elif path.endswith('/901/telegram'):
        if req.method=='POST':
            assert req.post_data_json['action']=='send'
            assert state.get('finalized')
            writes.append('telegram-send');state['sent']=True
        data=telegram()
    elif path in ['/api/auth/order/car-rental','/api/auth/order/car-rental/901'] and req.method in ['POST','PUT']:
        edits=req.post_data_json
        writes.append('draft-save')
        state['record']=dict(id=901,draft_reference='NHAP-QA-901',status='draft',store_id=1,draft_revision='1',draft_payload=dict(management_composer=dict(version=1,**copy.deepcopy(edits))))
        data=state['record']
    elif path.endswith('/901/finalize') and req.method=='POST':
        writes.append('finalize');state['finalized']=True
        state['record'].update(status='renting',contract_number='000888')
        data=dict(order_id=901,code='000888',status='renting',total_amount=200000,deposit_amount=0,paid_amount=0,transaction_ids=[])
    elif req.method!='GET':
        unexpected.append(req.method+' '+path);route.abort();return
    elif path=='/api/auth/hr/staff':data=staff
    elif path=='/api/auth/customers/search':data=[customer]
    elif path.endswith('/901/payments'):
        data=dict(id=901,code='NHAP-QA-901',status='draft',store_id=1,revision='1',total_amount=200000,paid_amount=0,remaining=200000,deposit_paid=0,deposit_held=0,deposit_refunded=0,accounts=[dict(id=1,kind='cash',label='Két QA',owner_type='',store_id=1)],history=[],items=[],end_date=None)
    elif path in ['/api/auth/gps/selected','/api/auth/gps','/api/auth/payment-events']:data=[]
    elif path in ['/api/session','/api/auth/me']:
        route.fulfill(json=dict(user=dict(id=143,name='QA')));return
    else:
        data={'/api/auth/stores':stores,'/api/auth/customers':[customer],'/api/auth/vehicle/vehicles':[vehicle],'/api/auth/order/car-rental':[state['record']] if state.get('record') else []}.get(path)
    if data is None:
        unexpected.append(req.method+' '+path);route.abort()
    else:route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as p:
    browser=getattr(p,args.browser).launch()
    context=browser.new_context(viewport=dict(width=390,height=844),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
    token=Path(args.session_cookie_file).read_text().strip()
    context.add_cookies([dict(name='himoto_management_session',value=token,url=args.url,httpOnly=True,sameSite='Strict')])
    context.route('**/api/**',mock)
    def cloud(route):
        import re
        body=route.request.post_data_buffer.decode('latin1')
        public_id=re.search(r'name="public_id"\r\n\r\n([^\r]+)',body).group(1)
        route.fulfill(json=dict(public_id=public_id,version=1,signature='qa'))
    context.route('https://api.cloudinary.com/**',cloud)
    context.route('https://api.telegram.org/**',lambda route: (_ for _ in ()).throw(AssertionError('Real Telegram request blocked')))
    page=context.new_page()
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_default_timeout(20000)
    page.goto(args.url+'/contracts',wait_until='networkidle')
    page.get_by_role('button',name='Nhập hợp đồng',exact=True).click()
    form=page.locator('dialog.mg-contract-composer')
    form.get_by_role('tab',name='Khách hàng',exact=False).click()
    form.locator('#contract-store').select_option('1')
    form.locator('#contract-id-card').fill(customer['phone'])
    expect(form.locator('#contract-customer-name')).to_have_value('Khách QA')
    form.locator('#contract-staff').fill(staff[0]['full_name'])
    form.get_by_role('tab',name='Phương tiện',exact=False).click()
    form.locator('#contract-vehicle-0').click()
    form.locator('#contract-vehicle-0-options-101').click()
    media=form.get_by_role('group',name='Ảnh xe 4 góc, toàn cảnh & video',exact=True)
    for label in ['Toàn cảnh xe','Đầu xe','Đuôi xe','Bên trái','Bên phải','Đồng hồ / phụ kiện','Video tình trạng xe 1']:
        expect(media.get_by_text(label,exact=True)).to_be_visible()
    checks.append('Vehicle step visibly restores all six photo categories and panoramic video')
    files=[dict(name=f'qa-{i}.png',mimeType='image/png',buffer=pixel) for i in range(22)]
    media.get_by_label('Chọn nhiều ảnh hồ sơ',exact=True).set_input_files(files)
    expect(media.locator('.mg-photo-slot img')).to_have_count(22)
    expect(media).to_contain_text('22 ảnh')
    media.locator('legend').scroll_into_view_if_needed()
    form.screenshot(path=str(out/'vehicle-22-photos-390.png'))
    assert 'telegram-send' not in writes
    checks.append('22 photos can be selected in one batch and survive without any Telegram send')
    form.get_by_role('tab',name='Chi phí',exact=False).click()
    form.locator('#contract-deposit_amount').fill('0')
    form.get_by_role('button',name='Hoàn tất & thanh toán',exact=True).click()
    confirm=page.get_by_role('dialog').filter(has=page.get_by_role('heading',name='Xác nhận thanh toán',exact=False))
    expect(confirm.get_by_text('Ảnh xe lúc thuê / lập hợp đồng',exact=True).first).to_be_visible()
    expect(confirm.locator('.mg-photo-slot img')).to_have_count(25)
    assert len(state['photos'])==25
    assert 'telegram-send' not in writes
    checks.append('Final confirmation reuses 22 saved vehicle photos and 3 customer documents; uploading and draft save send nothing')
    confirm.get_by_role('button',name='Xác nhận lưu chính thức',exact=True).click()
    final=page.get_by_role('dialog',name='Kiểm tra & gửi Telegram · 000888')
    expect(final.get_by_text('Nhân viên làm hợp đồng: Nhân viên làm hợp đồng QA',exact=False)).to_be_visible()
    expect(final.get_by_label('Toàn bộ ảnh và video sẽ gửi').locator('img')).to_have_count(25)
    assert 'telegram-send' not in writes
    expect(final.locator('input[type=file]')).to_have_count(0)
    final.screenshot(path=str(out/'final-review-390.png'))
    for width in [390,1440]:
        page.set_viewport_size(dict(width=width,height=900))
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    checks.append('Saving the official contract opens one final read-only preview of every file and the selected employee; no send before explicit click')
    final.get_by_role('button',name='Gửi toàn bộ Telegram',exact=False).click()
    expect(final.get_by_role('button',name='Đã gửi Telegram',exact=False)).to_be_disabled()
    assert writes.count('telegram-send')==1
    checks.append('One explicit final click sends the whole set once; confirmed content is locked against duplicate sends')
    assert not errors and not unexpected,(errors,unexpected)
    browser.close()
result=dict(passed=len(checks),browser=args.browser,checks=checks,javascriptErrors=errors,unexpectedRequests=unexpected,realBusinessWrites=0,realTelegramRequests=0)
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
