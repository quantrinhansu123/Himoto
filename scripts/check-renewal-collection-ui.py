"""Branch renewal/refund regression. Every API write is synthetic."""
import argparse, json, struct, zlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser()
p.add_argument('--url',default='http://127.0.0.1:3014')
p.add_argument('--branch-cookie-file',required=True)
p.add_argument('--output',default='.backups/iopgps-renewal-return-20261019/ui')
a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
expect.set_options(timeout=30000)
state={};writes=[];unexpected=[];errors=[];checks=[]
now=datetime.now(timezone(timedelta(hours=7)))
start=(now-timedelta(days=2)).isoformat();old_end=(now-timedelta(hours=1)).isoformat()
accounts=[dict(id=15,kind='bank',store_id=32,owner_type='personal',label='CK cá nhân QA'),dict(id=5,kind='cash',store_id=32,owner_type='',label='Két QA')]
def chunk(kind,data):return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
pixel=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',160,100,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\x00'+bytes([216,234,242])*160)*100))+chunk(b'IEND',b'')
def context():
    return dict(id=901,code='QA-32031',status='renting',revision='2' if state.get('renewed') else '1',store_id=32,total_amount=state.get('total',280000),paid_amount=state.get('paid',280000),remaining=state.get('total',280000)-state.get('paid',280000),deposit_paid=1000000,deposit_refunded=0,deposit_held=1000000,company_paid_amount=0,company_payment_count=0,accounts=accounts,history=[],items=[])
def returnable():
    return dict(item_id=101,order_id=901,contract_code='QA-32031',order_status='renting',customer_name='Khách QA',customer_id_card='',vehicle_id=700,vehicle_name='Wave QA',license='QA-333.71',store_id=32,store_name='CS Nguyễn Hoàng QA',scheduled_start_at=start,scheduled_return_at=state.get('end',old_end),completed_at=None,item_revision='2' if state.get('renewed') else '1',order_revision=context()['revision'],total_amount=context()['total_amount'],paid_amount=context()['paid_amount'],overdue=not state.get('renewed'),daily_price=140000,deposit_paid=1000000,deposit_held=1000000)
def mock(route):
    req=route.request;path=urlparse(req.url).path;query=parse_qs(urlparse(req.url).query)
    if mock_contract_type_read(route):return
    if path=='/api/auth/photo-uploads/sign':
        route.fulfill(json=dict(status='success',data=dict(cloud_name='qa',api_key='qa',signature='qa',params=dict(public_id='qa/fixture',timestamp=1))));return
    if path.startswith('/api/auth/record-photos/'):
        if req.method=='PUT':
            writes.append(dict(path=path,body=req.post_data_json))
            if state.get('confirmPhotos'):state.setdefault('photos',{})[path.split('/')[-1]]=dict(slot=path.split('/')[-1],mime_type='image/jpeg',updated_at='2026-10-21T13:00:00Z')
            route.fulfill(json=dict(status='success'));return
        if req.method=='GET' and len(path.split('/'))>6:route.fulfill(body=pixel,content_type='image/png');return
    if req.method=='POST':
        body=req.post_data_json;writes.append(dict(path=path,body=body))
        if path.endswith('/901/renewals'):
            assert body['amount']=='140000' and body['request_id'] and body['item_id']==101
            assert ('receipt' in body)==state['collect']
            state.update(renewed=True,total=420000,end=body['return_at']+'+07:00',paid=420000 if state['collect'] else 280000)
            result=dict(order_id=901,code='QA-32031',version=2,return_at=state['end'],amount=140000,total_amount=420000)
            if state['collect']:
                assert body['receipt']['method']=='transfer' and body['receipt']['account_id']==15
                result['payment']=dict(context=context(),transaction_id=99001,replayed=False,company_transfer=False)
            route.fulfill(json=dict(status='success',data=result));return
        unexpected.append(req.method+' '+path);route.abort();return
    if req.method!='GET':unexpected.append(req.method+' '+path);route.abort();return
    if path=='/api/auth/order/car-rental' and query.get('table')==['1']:
        row=dict(id=901,code='QA-32031',name='QA-32031',status='renting',rental_type='daily',contract_type_id='daily',contract_type_name='Thuê ngày',store_id=32,store_name='CS Nguyễn Hoàng QA',customer_name='Khách QA',customer_phone='0900000000',total_amount=context()['total_amount'],paid_amount=context()['paid_amount'],deposit_amount=1000000,deposit_paid=1000000,deposit_refunded=0,return_adjustment_amount=0,vehicle_name='Wave QA',license='QA-333.71',unit_price=140000,start_date=start,end_date=state.get('end',old_end),vehicles_json=json.dumps([dict(id=700,name='Wave QA',license='QA-333.71')]))
        data=dict(rows=[row],total=1,scopeCount=1,tabCount=1,page=1,pages=1,statusCounts=[['renting',1]],statuses=['renting'],dueCount=0,summary=dict(contractCount=1,blacklistCount=0,totalAmount=context()['total_amount'],receivableAmount=context()['remaining'],badDebtAmount=0))
    elif path=='/api/auth/stores':data=[dict(id=32,store_name='CS Nguyễn Hoàng QA',kind='physical',status='opening')]
    elif path=='/api/auth/returns':data=[returnable()]
    elif path.endswith('/payments'):data=context()
    elif path.endswith('/telegram'):data=dict(auto_enabled=False,next_renewal_version=2,events=[])
    elif path.startswith('/api/auth/record-photos/'):data=list(state.get('photos',{}).values())
    elif path in ['/api/session','/api/auth/me']:route.fulfill(json=dict(user=dict(id=153,name='QA')));return
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as pw:
    for name,width,height in [('chromium',1440,1000),('webkit',390,844)]:
        browser=getattr(pw,name).launch()
        ctx=browser.new_context(viewport=dict(width=width,height=height),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
        ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.branch_cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
        ctx.route('https://api.cloudinary.com/**',lambda route:route.fulfill(json=dict(public_id='qa/fixture',version=1,signature='qa')))
        page=ctx.new_page();page.set_default_timeout(30000);page.on('pageerror',lambda e:errors.append(str(e)))
        for collect in [True,False]:
            state.clear();state['collect']=collect
            page.goto(a.url+'/contracts',wait_until='networkidle',timeout=90000)
            page.locator('button.mg-row-menu-trigger:visible').first.click();page.get_by_role('menuitem',name='Gia hạn',exact=True).click()
            form=page.get_by_role('dialog',name='Gia hạn · QA-32031')
            expect(form.get_by_label('Đã thực nhận tiền gia hạn',exact=False)).not_to_be_checked()
            form.get_by_label('Đã thực nhận tiền gia hạn' if collect else 'Chưa nhận tiền',exact=False).check()
            if collect:form.get_by_label('Hình thức thanh toán',exact=True).select_option('transfer')
            form.get_by_label('Chưa nhận tiền',exact=False).scroll_into_view_if_needed()
            radio=form.get_by_label('Chưa nhận tiền',exact=False)
            control=radio.bounding_box();label=radio.locator('..').bounding_box()
            assert control['x']<=label['x']+8 and 16<=control['width']<=22 and label['height']>=44
            page.screenshot(path=str(out/f'{name}-{width}-renewal-{"paid" if collect else "unpaid"}.png'))
            save_renewal=form.get_by_role('button',name='Lưu gia hạn và thu tiền' if collect else 'Lưu gia hạn',exact=True)
            if collect:
                expect(form).to_contain_text('Lưu ảnh bill chuyển khoản hoặc tiền mặt')
                expect(save_renewal).to_be_disabled()
                bill=form.get_by_label('Chọn ảnh Bill chuyển khoản / tiền mặt gia hạn',exact=True)
                bill.set_input_files(dict(name='bill.png',mimeType='image/png',buffer=pixel))
                save_bill=form.get_by_role('button',name='Lưu ảnh',exact=True)
                expect(save_bill).to_be_enabled()
                state['confirmPhotos']=True;save_bill.click()
                expect(form).to_contain_text('Đã lưu ảnh.')
                expect(save_renewal).to_be_enabled()
            save_renewal.click()
            expect(form).to_contain_text('Đã lưu gia hạn')
            if not collect:expect(form).to_contain_text('chưa ghi nhận thu 140.000')
            if collect:assert 'renewal-2-document-1' in state.get('photos',{})
            form.get_by_role('button',name='Đóng',exact=True).click()
            page.locator('button.mg-row-menu-trigger:visible').first.click();page.get_by_role('menuitem',name='Trả xe',exact=True).click()
            ret=page.get_by_role('dialog',name='Trả xe · QA-32031',exact=True)
            checkbox=ret.get_by_label('Đã hoàn cọc cho khách',exact=True)
            if collect:
                expect(checkbox).to_be_enabled();checkbox.check();ret.get_by_label('Hình thức hoàn',exact=True).select_option('cash')
            else:
                expect(checkbox).to_be_disabled();expect(ret).to_contain_text('gia hạn ngày trả không đồng nghĩa đã thu tiền')
            checkbox.scroll_into_view_if_needed()
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
            page.screenshot(path=str(out/f'{name}-{width}-{"paid" if collect else "unpaid"}.png'))
            ret.get_by_role('button',name='Hủy',exact=True).click()
            checks.append(dict(browser=name,width=width,collected=collect,refundEnabled=collect))
        state.clear();state['collect']=False
        page.goto(a.url+'/contracts',wait_until='networkidle',timeout=90000)
        page.locator('button.mg-row-menu-trigger:visible').first.click();page.get_by_role('menuitem',name='Gia hạn',exact=True).click()
        form=page.get_by_role('dialog',name='Gia hạn · QA-32031')
        picker=form.get_by_label('Chọn nhiều ảnh hồ sơ',exact=True)
        expect(form.get_by_role('button',name='Chọn nhiều ảnh',exact=True)).to_be_enabled()
        picker.set_input_files(dict(name='qa.png',mimeType='image/png',buffer=pixel))
        save=form.get_by_role('button',name='Lưu ảnh / video',exact=True)
        expect(save).to_be_enabled();expect(form.get_by_role('button',name='Lưu gia hạn',exact=True)).to_be_disabled()
        page.once('dialog',lambda dialog:dialog.dismiss())
        form.get_by_role('button',name='Hủy',exact=True).click();expect(form).to_be_visible()
        save.click()
        expect(form).to_contain_text('Chưa xác nhận đủ ảnh/video trong hồ sơ')
        expect(save).to_be_enabled();expect(form.get_by_role('button',name='Lưu gia hạn',exact=True)).to_be_disabled()
        page.screenshot(path=str(out/f'{name}-{width}-photo-not-attached.png'))
        state['confirmPhotos']=True;save.click()
        expect(form).to_contain_text('Đã lưu ảnh.')
        expect(form.get_by_role('button',name='Lưu gia hạn',exact=True)).to_be_enabled()
        assert list(state['photos'])==['renewal-2-1']
        form.get_by_role('button',name='Hủy',exact=True).click();expect(form).not_to_be_visible()
        checks.append(dict(browser=name,width=width,unconfirmedPhotosRetained=True,closeGuard=True,retryConfirmed=True))
        ctx.unroute_all(behavior='wait');ctx.close()
        browser.close()
assert not unexpected,unexpected
assert not errors,errors
assert all(not w['path'].endswith('/payments') for w in writes)
report=dict(checks=checks,errors=errors,renewalPosts=sum(w['path'].endswith('/renewals') for w in writes),standalonePaymentPosts=0,realBusinessWrites=0,realProviderRequests=0,realTelegramRequests=0)
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False))
