"""Shared stock, strict picker and return photos; every API write is intercepted."""
import argparse
import json
import re
import struct
import zlib
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

parser=argparse.ArgumentParser()
parser.add_argument('--url',default='http://127.0.0.1:3101')
parser.add_argument('--session-cookie-file',required=True)
parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium')
parser.add_argument('--output',default='docs/qa/shared-inventory-return')
args=parser.parse_args()
out=Path(args.output)/args.browser
out.mkdir(parents=True,exist_ok=True)
expect.set_options(timeout=30000)
errors,unexpected,checks,saved=[],[],[],{}
def chunk(kind,data):return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
pixel=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',160,100,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\x00'+bytes([216,234,242])*160)*100))+chunk(b'IEND',b'')
stores=[dict(id=1,store_name='CS Giáp Bát QA',status='opening'),dict(id=2,store_name='CS khác QA',status='opening')]
local=[dict(id=101,name='Xe lưu kho QA',license='QA-101',store_id=1,current_store_id=1,store_name=stores[0]['store_name'],status='ready',type='xega',daily_price=200000),
       dict(id=105,name='Xe đã đánh dấu thuê QA',license='QA-105',store_id=1,current_store_id=1,status='using',type='xega',daily_price=200000)]
inventory=[dict(id=101,name='Xe lưu kho QA',license='QA-101',store_id=1,store_name=stores[0]['store_name'],status='ready',type='xega',available=True),
           dict(id=102,name='Xe cơ sở khác QA',license='QA-102',store_id=2,store_name=stores[1]['store_name'],status='using',type='xega',available=False),
           dict(id=103,name='Xe đang chuyển QA',license='QA-103',store_id=2,store_name=stores[1]['store_name'],status='in_transit',type='xega',from_store_name=stores[0]['store_name'],to_store_name=stores[1]['store_name'],available=False),
           dict(id=104,name='Xe chờ đóng hợp đồng QA',license='QA-104',store_id=2,store_name=stores[1]['store_name'],status='ready',type='xega',available=False)]
customer=dict(id=77,name='Khách QA',phone='0900000077',id_card='001234567877',store_id=1,status='active')
returnable=dict(item_id=201,order_id=900,contract_code='HD-RETURN-QA',order_status='renting',customer_name='Khách QA',vehicle_id=101,vehicle_name='Xe QA',license='QA-101',store_id=1,store_name=stores[0]['store_name'],scheduled_start_at='2026-10-01T09:00:00+07:00',scheduled_return_at='2026-12-01T09:00:00+07:00',completed_at=None,item_revision='1',order_revision='1',total_amount=400000,paid_amount=400000,daily_price=200000,overdue=False,deposit_paid=0,deposit_held=0)

def mock(route):
    if mock_contract_type_read(route):return
    req=route.request
    path=urlparse(req.url).path.rstrip('/')
    if path.startswith('/api/auth/record-photos/'):
        if req.method=='GET' and len(path.split('/'))>6:
            route.fulfill(body=pixel,content_type='image/png');return
        if req.method=='PUT':saved[path.split('/')[-1]]='image/jpeg';data={}
        elif req.method=='GET':data=[dict(slot=slot,mime_type=mime,updated_at='2026-10-18T12:00:00Z') for slot,mime in saved.items()]
        else:raise AssertionError('Unexpected photo mutation')
    elif path=='/api/auth/photo-uploads/sign':
        data=dict(cloud_name='qa',api_key='qa',signature='qa',params=dict(public_id='qa/'+req.post_data_json['upload_id'],timestamp=1))
    elif path=='/api/auth/gps/refresh':data=[]
    elif req.method!='GET':
        unexpected.append(req.method+' '+path);route.abort();return
    elif path=='/api/auth/vehicles/inventory':data=inventory
    elif path=='/api/auth/returns':data=[returnable]
    elif path=='/api/auth/order/car-rental/900/payments':
        data=dict(id=900,code='HD-RETURN-QA',status='renting',store_id=1,revision='1',total_amount=400000,paid_amount=400000,remaining=0,deposit_paid=0,deposit_refunded=0,deposit_held=0,history=[],accounts=[],items=[],end_date=None)
    elif path=='/api/auth/customers/search':data=[customer]
    elif path in ['/api/auth/gps','/api/auth/gps/selected','/api/auth/payment-events']:data=[]
    elif path in ['/api/session','/api/auth/me']:
        route.fulfill(json=dict(user=dict(id=143,name='QA')));return
    else:
        data={'/api/auth/stores':stores,'/api/auth/customers':[customer],'/api/auth/vehicle/vehicles':local,'/api/auth/hr/staff':[], '/api/auth/order/car-rental':[]}.get(path)
    if data is None:unexpected.append(req.method+' '+path);route.abort()
    else:route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as p:
    browser=getattr(p,args.browser).launch()
    context=browser.new_context(viewport=dict(width=390,height=844),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
    context.add_cookies([dict(name='himoto_management_session',value=Path(args.session_cookie_file).read_text().strip(),url=args.url,httpOnly=True,sameSite='Strict')])
    context.route('**/api/**',mock)
    def cloud(route):
        public_id=re.search(r'name="public_id"\r\n\r\n([^\r]+)',route.request.post_data_buffer.decode('latin1')).group(1)
        route.fulfill(json=dict(public_id=public_id,version=1,signature='qa'))
    context.route('https://api.cloudinary.com/**',cloud)
    context.route('https://api.telegram.org/**',lambda route:(_ for _ in ()).throw(AssertionError('Real Telegram request blocked')))
    page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(args.url+'/vehicles',wait_until='networkidle')
    expect(page.get_by_text('QA-102',exact=False)).to_have_count(0)
    page.get_by_role('button',name='Kho xe toàn hệ thống',exact=True).click()
    dialog=page.get_by_role('dialog',name='Kho xe toàn hệ thống')
    expect(dialog.get_by_role('article')).to_have_count(4)
    dialog.locator('#shared-inventory-search').fill('QA-102')
    expect(dialog.get_by_role('article')).to_have_count(1)
    expect(dialog.get_by_role('article')).to_contain_text('CS khác QA')
    expect(dialog.get_by_role('button',name='Chuyển xe',exact=True)).to_have_count(0)
    expect(dialog.get_by_role('button',name='Nhận xe',exact=True)).to_have_count(0)
    expect(dialog.get_by_role('button',name='Chỉnh sửa',exact=False)).to_have_count(0)
    dialog.locator('#shared-inventory-search').fill('')
    dialog.locator('#shared-inventory-availability').select_option('ready')
    expect(dialog.get_by_role('article')).to_have_count(1)
    expect(dialog.get_by_role('article')).to_contain_text('QA-101')
    dialog.locator('#shared-inventory-availability').select_option('')
    dialog.locator('#shared-inventory-store').select_option('2')
    expect(dialog.get_by_role('article')).to_have_count(3)
    expect(dialog.get_by_role('article',name='Xe QA-104')).to_contain_text('còn hợp đồng chưa đóng')
    for width in [390,1440]:
        page.set_viewport_size(dict(width=width,height=900));assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        dialog.screenshot(path=str(out/f'shared-stock-{width}.png'))
    checks.append('Own stock stays scoped; shared stock finds vehicles in other branches, filters availability/transfers and exposes no edit/send/receive controls at 390/1440px')
    page.close()
    page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_viewport_size(dict(width=390,height=844))
    page.goto(args.url+'/contracts',wait_until='networkidle')
    page.get_by_role('button',name='Nhập hợp đồng',exact=True).click()
    composer=page.locator('dialog.mg-contract-composer')
    composer.get_by_role('tab',name='Phương tiện',exact=False).click()
    composer.locator('#contract-vehicle-store-filter').select_option('1')
    composer.locator('#contract-vehicle-0').click()
    expect(composer.locator('#contract-vehicle-0-options-101')).to_be_visible()
    expect(composer.locator('#contract-vehicle-0-options-105')).to_have_count(0)
    checks.append('New-contract picker excludes a using vehicle even when it has no linked open rental; stock vehicle remains selectable')
    page.close()
    page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(args.url+'/contracts?action=return&query=QA-101',wait_until='networkidle')
    dialog=page.get_by_role('dialog',name='Trả xe',exact=True)
    media=dialog.get_by_role('group',name='Ảnh nhận lại QA-101',exact=True)
    for label in ['Toàn cảnh xe','Đầu xe','Đuôi xe','Bên trái','Bên phải','Đồng hồ / phụ kiện','Video tình trạng xe 1']:
        expect(media.get_by_text(label,exact=True)).to_be_visible()
    expect(dialog.locator('details.mg-transaction-photos')).to_have_count(0)
    media.locator('legend').scroll_into_view_if_needed();dialog.screenshot(path=str(out/'return-photo-fields-390.png'))
    media.get_by_label('Chọn nhiều ảnh hồ sơ',exact=True).set_input_files([dict(name=f'qa-{i}.png',mimeType='image/png',buffer=pixel) for i in range(18)])
    expect(media.locator('.mg-photo-slot img')).to_have_count(18)
    dialog.get_by_role('button',name='Lưu ảnh / video',exact=True).click()
    expect(dialog.get_by_text('Đã lưu ảnh.',exact=True)).to_be_visible()
    expect(media.get_by_text('18 ảnh',exact=False)).to_be_visible()
    assert len(saved)==18 and 'return-201-18' in saved
    expect(dialog.get_by_role('button',name='Xác nhận trả 1 xe',exact=True)).to_be_enabled()
    checks.append('Return shows every vehicle angle and video without a collapsed section; 18 photos save without Telegram or a real return/financial transaction')
    assert not errors and not unexpected,(errors,unexpected)
    browser.close()
result=dict(passed=len(checks),browser=args.browser,checks=checks,javascriptErrors=errors,unexpectedRequests=unexpected,realBusinessWrites=0,realTelegramRequests=0)
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
