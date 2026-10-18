"""Ownership settings and explicit-send preview; all API writes are intercepted."""
import argparse
import copy
import json
import re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

parser=argparse.ArgumentParser()
parser.add_argument('--url',default='http://127.0.0.1:3101')
parser.add_argument('--session-cookie-file',required=True)
parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium')
parser.add_argument('--output',default='docs/qa/ownership-telegram')
args=parser.parse_args()
out=Path(args.output)/args.browser;out.mkdir(parents=True,exist_ok=True)
expect.set_options(timeout=20000)
checks,errors,unexpected,writes=[],[],[],[]
stores=[dict(id=1,store_name='CS sở hữu QA',kind='lease_to_own',status='opening'),dict(id=2,store_name='Cơ sở nhận QA',kind='physical',status='opening')]
vehicle=dict(id=101,name='Xe sở hữu QA',license='QA-101',store_id=1,current_store_id=1,status='ready',store_name='CS sở hữu QA',type='xega')
transfer=dict(eligible=True,event_id=700,vehicle_id=101,destination_label='Thuê sở hữu · Ký mới, trả xe & điều chuyển',text='ĐIỀU CHUYỂN XE SỞ HỮU\nBsx: QA-101\nCơ sở chuyển đi: CS sở hữu QA\nCơ sở nhận: Cơ sở nhận QA\nTrạng thái: Chờ cơ sở đích xác nhận nhận xe',status=None,can_send=True,message_count=0)
groups=[dict(store_id=1,store_name=stores[0]['store_name'],chat_id='-100000000001',thread_id=None,enabled=True)]
ownership=[dict(route='ownership_new',label='Thuê sở hữu · Ký mới, trả xe & điều chuyển',chat_id='-100000000101',thread_id=17,enabled=True),dict(route='ownership_renewal',label='Thuê sở hữu · Gia hạn',chat_id='-100000000102',thread_id=18,enabled=True)]
settings=dict(accounts=[],telegram_configured=True,groups=groups,ownership_groups=ownership,notifications=[],scheduler=None)
order=dict(id=901,contract_number='QA-OWN-UI',order_status='renting',order_type='ownership',store_id=1,store_name=stores[0]['store_name'],store_kind='lease_to_own',customer_name='Khách sở hữu QA',customer_phone='0900000001',total_amount=200000,paid_amount=200000)
events=[dict(key=f'{kind}:901',kind=kind,label=label,phases=['rental'] if kind=='rental' else ['renewal-2'],destination_label=destination,text='Hợp đồng: QA-OWN-UI\nKhách hàng QA',hash=char*64,photo_count=0,video_count=0,status=None,sent_at=None,can_send=True,unchanged=False,attachments=[]) for kind,label,destination,char in [('rental','Hợp đồng mới','Thuê sở hữu · Ký mới, trả xe & điều chuyển','a'),('renewal','Gia hạn kỳ 2','Thuê sở hữu · Gia hạn','b')]]
def mock(route):
    if mock_contract_type_read(route):return
    req=route.request;path=urlparse(req.url).path.rstrip('/')
    if path=='/api/session':route.fulfill(json=dict(user=dict(name='Nhân viên QA')));return
    if path=='/api/auth/vehicles/101/actions':
        assert req.method=='POST' and req.post_data_json['action']=='transfer'
        assert req.post_data_json['to_store_id']=='2'
        writes.append('stock-transfer');vehicle.update(current_store_id=2,store_id=2,status='in_transit',store_name='Cơ sở nhận QA')
        data=dict(id=101,event_id=700,telegram_event_id=700)
    elif path=='/api/auth/vehicles/101/transfers/700/telegram':
        if req.method=='POST':
            assert req.post_data_json==dict(action='send');writes.append('transfer-send');transfer.update(status='sent',can_send=False,message_count=1)
        data=copy.deepcopy(transfer)
    elif path=='/api/auth/gps/refresh':data=[]
    elif path=='/api/auth/vehicles/transfers':data=dict(rows=[dict(id=700,vehicle_id=101,telegram_event_id=700,license='QA-101',vehicle_name='Xe sở hữu QA',from_store_id=1,to_store_id=2,from_store='CS sở hữu QA',to_store='Cơ sở nhận QA',action='transfer',label='Chuyển xe',at='2026-10-18T15:00:00Z',actor='Nhân viên QA',note='QA',changes=[])],total=1,page=1,size=25)
    elif path=='/api/auth/integrations':
        if req.method=='POST':
            body=req.post_data_json;assert body['action']=='telegram' and body['token']==''
            assert body['groups']==groups
            assert body['ownership_groups'][0]['chat_id']=='-100000000103'
            assert body['ownership_groups'][1]['chat_id']=='-100000000102'
            assert body['ownership_groups'][1]['thread_id']==18
            writes.append('settings');settings['ownership_groups']=copy.deepcopy(body['ownership_groups'])
        data=copy.deepcopy(settings) if req.method=='GET' else {}
    elif path=='/api/auth/order/car-rental/901/telegram':
        if req.method=='POST':
            body=req.post_data_json;assert body['action']=='send'
            event=next(item for item in events if item['key']==body['event_key']);assert event['can_send']
            event.update(status='sent',can_send=False,unchanged=True);writes.append(body['event_key'])
        data=dict(auto_enabled=False,next_renewal_version=3,events=copy.deepcopy(events))
    elif req.method!='GET':unexpected.append(req.method+' '+path);route.abort();return
    else:data={'/api/auth/stores':stores,'/api/auth/store-directory':stores,'/api/auth/order/car-rental':[order],'/api/auth/customers':[],'/api/auth/hr/staff':[],'/api/auth/vehicle/vehicles':[vehicle],'/api/auth/gps':[],'/api/auth/payment-events':[],'/api/auth/record-photos/contracts/901':[]}.get(path)
    if data is None:unexpected.append(req.method+' '+path);route.abort()
    else:route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as p:
    browser=getattr(p,args.browser).launch()
    context=browser.new_context(viewport=dict(width=390,height=844),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
    context.add_cookies([dict(name='himoto_management_session',value=Path(args.session_cookie_file).read_text().strip(),url=args.url,httpOnly=True,sameSite='Strict')])
    context.route('**/api/**',mock)
    context.route('https://api.telegram.org/**',lambda route:(_ for _ in ()).throw(AssertionError('Real Telegram request blocked')))
    page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(args.url+'/integrations',wait_until='networkidle')
    new=page.get_by_role('group',name='Thuê sở hữu · Ký mới, trả xe & điều chuyển',exact=True)
    renewal=page.get_by_role('group',name='Thuê sở hữu · Gia hạn',exact=True)
    expect(new.get_by_label('Chat ID nhóm',exact=True)).to_have_value('-100000000101')
    expect(renewal.get_by_label('Chat ID nhóm',exact=True)).to_have_value('-100000000102')
    new.get_by_label('Chat ID nhóm',exact=True).fill('-100000000103')
    page.get_by_role('button',name='Lưu cấu hình Telegram',exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('Đã lưu nhóm theo cơ sở')
    expect(new.get_by_label('Chat ID nhóm',exact=True)).to_have_value('-100000000103')
    for width in [390,1440]:
        page.set_viewport_size(dict(width=width,height=900));new.scroll_into_view_if_needed()
        page.wait_for_function('document.documentElement.scrollWidth<=innerWidth')
        page.locator('.mg-integration-section').filter(has=page.get_by_role('heading',name='Thông báo hợp đồng qua Telegram',exact=True)).screenshot(path=str(out/f'settings-{width}.png'))
    checks.append('Admin sees separate ownership-new/renewal destinations, saves both without changing branch routing or the stored bot, and fits 390/1440px')
    page.goto(args.url+'/contracts',wait_until='networkidle')
    page.locator('.mg-table tbody tr').first.get_by_role('button',name=re.compile('^Thao tác ')).click()
    page.get_by_role('menuitem',name='Xem chi tiết',exact=True).click()
    dialog=page.get_by_role('dialog',name='Chi tiết hợp đồng: QA-OWN-UI',exact=True)
    dialog.get_by_role('tab',name='Telegram',exact=True).click()
    expect(dialog.get_by_text('Nơi nhận: Thuê sở hữu · Ký mới, trả xe & điều chuyển',exact=True)).to_be_visible()
    assert writes==['settings']
    dialog.get_by_label('Giao dịch cần gửi Telegram',exact=True).select_option('renewal:901')
    expect(dialog.get_by_text('Nơi nhận: Thuê sở hữu · Gia hạn',exact=True)).to_be_visible()
    for width in [390,1440]:
        page.set_viewport_size(dict(width=width,height=900));page.wait_for_function('document.documentElement.scrollWidth<=innerWidth')
        dialog.screenshot(path=str(out/f'renewal-preview-{width}.png'))
    dialog.get_by_role('button',name='Gửi toàn bộ Telegram',exact=False).click()
    expect(dialog.get_by_role('button',name='Đã gửi Telegram',exact=False)).to_be_disabled()
    assert writes==['settings','renewal:901']
    checks.append('Final preview changes the destination with the selected event; opening/refreshing sends nothing, and one explicit renewal submit locks duplicate sends')
    page.goto(args.url+'/vehicles',wait_until='networkidle')
    page.get_by_role('button',name='Chuyển xe',exact=True).click()
    move=page.get_by_role('dialog',name='Chuyển xe',exact=True)
    move.locator('#vehicle-action-vehicle').fill('QA-101 — Xe sở hữu QA')
    move.locator('#vehicle-action-to').select_option('2')
    move.get_by_role('button',name='Chuyển xe',exact=True).click()
    final=page.get_by_role('dialog',name='Kiểm tra & gửi Telegram · Điều chuyển xe',exact=True)
    expect(final.get_by_text('Nơi nhận: Thuê sở hữu · Ký mới, trả xe & điều chuyển',exact=True)).to_be_visible()
    assert writes==['settings','renewal:901','stock-transfer']
    assert vehicle['status']=='in_transit'
    for width in [390,1440]:
        page.set_viewport_size(dict(width=width,height=900));page.wait_for_function('document.documentElement.scrollWidth<=innerWidth')
        final.screenshot(path=str(out/f'transfer-preview-{width}.png'))
    final.get_by_role('button',name='Gửi thông tin Telegram',exact=True).click()
    expect(final.get_by_role('button',name='Đã gửi Telegram',exact=True)).to_be_disabled()
    assert writes==['settings','renewal:901','stock-transfer','transfer-send']
    final.get_by_role('button',name='Đóng',exact=True).click()
    page.goto(args.url+'/vehicles/transfers',wait_until='networkidle')
    page.get_by_role('button',name='Telegram lượt chuyển/nhận',exact=True).click()
    reopened=page.get_by_role('dialog',name='Telegram · Điều chuyển xe',exact=True)
    expect(reopened.get_by_role('button',name='Đã gửi Telegram',exact=True)).to_be_disabled()
    assert writes==['settings','renewal:901','stock-transfer','transfer-send']
    checks.append('Ownership stock transfer retains the required receipt step, opens a main-group preview after saving, and only sends once after explicit Telegram submit')
    assert not errors and not unexpected,(errors,unexpected)
    browser.close()
result=dict(passed=len(checks),browser=args.browser,checks=checks,javascriptErrors=errors,unexpectedRequests=unexpected,realBusinessWrites=0,realTelegramRequests=0)
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
