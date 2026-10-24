"""Operating fixes: API fixtures only; no real recovery, return, money or Telegram."""
import argparse,copy,json
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3023');p.add_argument('--cookie-file',default='.backups/contract-photo-delete-20261024/session-admin.txt');p.add_argument('--output',default='.backups/operating-fixes-20261024/ui');a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True);expect.set_options(timeout=30000)
state={};checks=[];errors=[];writes=[];unexpected=[]
vehicles=[dict(id=777,name='Vision QA',license='29G1-742.69',brand='Honda',type='xega',status='using',store_id=32,current_store_id=32,store_name='CS QA',available=False,rental_blockers=[dict(order_id=990,code='QA-NOW',status='renting',store_name='CS QA')])]

def records():
    return [dict(id=901,contract_number='QA-DEBT',order_status='bad_debt',order_type='daily',store_id=32,customer_name='Khách QA nợ',total_amount=1410000,paid_amount=200000,license='29G1-742.69'),dict(id=902,contract_number='QA-PAST',order_status='completed',order_type='daily',store_id=32,customer_name='Khách QA cũ',total_amount=1410000,paid_amount=1000000,license='29G1-742.69')]

def payment():
    deposit=state.get('deposit',0);paid=state.get('paid',1000000)
    return dict(id=902,code='QA-PAST',status='completed',store_id=32,revision=str(1+len(writes)),total_amount=1410000,paid_amount=paid,remaining=max(1410000-paid,0),deposit_paid=deposit,deposit_refunded=0,deposit_held=deposit,deposit_remaining=2000000-deposit,accounts=[dict(id=5,kind='cash',store_id=32,owner_type='',label='Két QA'),dict(id=6,kind='bank',store_id=32,owner_type='personal',label='TK QA',bank_name='MB Bank',account_number='000000000000',owner_name='QA')],history=state.get('history',[]),items=[],end_date='2026-10-04T03:00:00Z')

def mock(route):
    if mock_contract_type_read(route):return
    req=route.request;parsed=urlparse(req.url);path=parsed.path;q=parse_qs(parsed.query)
    if path=='/api/auth/gps/refresh':route.fulfill(json=dict(status='success',data=dict(cached=True)));return
    if path.startswith('/api/auth/record-photos/') and req.method=='POST':route.fulfill(json=dict(status='success',data=dict(copied=0)));return
    if req.method=='POST' and path=='/api/auth/returns/recover':
        body=req.post_data_json;assert set(body)=={'item_id','item_revision','request_id','recovered_at','note'};assert body['item_id']==101 and body['recovered_at']=='2026-10-04T10:15'
        writes.append(copy.deepcopy(body))
        if state.get('recovery_error'):route.fulfill(status=503,json=dict(status='error',message='QA thu hồi chưa ghi nhận'));return
        state['recovered']=True;route.fulfill(json=dict(status='success',data=dict(item_id=101,order_id=901,vehicle_id=777,recovered_at=body['recovered_at']+':00+07:00',replayed=False)));return
    if req.method=='POST' and path=='/api/auth/order/car-rental/902/renewals':
        body=req.post_data_json;assert body['occurred_at']=='2026-10-03T09:00';assert body['note']=='QA quên nhập gia hạn';assert 'receipt' not in body
        assert body['return_at']=='2026-10-06T10:00' and body['amount']=='470000';writes.append(copy.deepcopy(body))
        route.fulfill(json=dict(status='success',data=dict(order_id=902,code='QA-PAST',version=2,return_at='2026-10-06T10:00:00+07:00',total_amount=1880000,amount=470000)));return
    if req.method=='POST' and path=='/api/auth/order/car-rental/902/payments':
        body=req.post_data_json;assert body['paid_at']=='2026-10-03T11:20';assert body['note']=='QA khoản tiền thực tế bị quên';assert body['account_id']==5 and body['method']=='cash'
        assert body.get('purpose') in [None,'deposit','deposit_refund'];writes.append(copy.deepcopy(body))
        amount=int(body['amount'])
        if body.get('purpose')=='deposit':state['deposit']=state.get('deposit',0)+amount
        elif body.get('purpose')=='deposit_refund':state['deposit']-=amount
        else:state['paid']=state.get('paid',1000000)+amount
        route.fulfill(json=dict(status='success',data=dict(context=payment(),transaction_id=600+len(writes),replayed=False,company_transfer=False)));return
    if req.method!='GET':unexpected.append(req.method+' '+path);route.abort();return
    if path=='/api/auth/order/car-rental':
        data=records()
        if q.get('search'):data=[row for row in data if q['search'][0].lower() in row['contract_number'].lower()]
    elif path in ['/api/auth/stores','/api/auth/store-directory']:data=[dict(id=32,store_name='CS QA',status='opening')]
    elif path=='/api/auth/returns':
        id=int(q.get('order_id',['902'])[0]);recovery=id==901
        data=[dict(item_id=101 if recovery else 102,order_id=id,contract_code='QA-DEBT' if recovery else 'QA-PAST',order_status='bad_debt' if recovery else 'completed',customer_name='Khách QA',vehicle_id=777,vehicle_name='Vision QA',license='29G1-742.69',store_id=32,store_name='CS QA',scheduled_start_at='2026-10-01T03:00:00Z',scheduled_return_at='2026-10-04T03:00:00Z',completed_at=('2026-10-04T03:15:00Z' if state.get('recovered') else None) if recovery else '2026-10-07T03:00:00Z',item_revision='1',order_revision='1',total_amount=1410000,paid_amount=1000000,daily_price=235000,overdue=False,deposit_paid=0,deposit_held=0)]
    elif path=='/api/auth/order/car-rental/902/payments':data=payment()
    elif path.endswith('/telegram'):data=dict(auto_enabled=False,next_renewal_version=2,events=[])
    elif path in ['/api/auth/vehicles/inventory','/api/auth/vehicle/vehicles']:data=vehicles
    elif path=='/api/auth/cashbook':data=dict(total=0,income=dict(rows=[],total=0,amount=0,page=1,pageSize=20),expense=dict(rows=[],total=0,amount=0,page=1,pageSize=20),actors=[],summary=dict(income=0,expense=0,balance=0))
    elif path=='/api/auth/gps/selected':data=dict(devices=[],events=[])
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))

def date_time(dialog,id,label,value):
    dialog.locator('#'+id).fill(value[:10]);dialog.get_by_label('Giờ '+label.lower()+' (24h)',exact=True).select_option(value[11:13]);dialog.get_by_label('Phút '+label.lower(),exact=True).select_option(value[14:16])

def select_backfill(page,kind):
    page.goto(a.url+'/contracts?action=backfill',wait_until='networkidle',timeout=90000)
    dialog=page.get_by_role('dialog',name='Nhập bổ sung giao dịch',exact=True)
    dialog.get_by_label('Nội dung cần bổ sung',exact=True).select_option(kind)
    if kind!='contract':
        dialog.get_by_label('Tìm hợp đồng đã có',exact=True).fill('QA-PAST');dialog.get_by_role('button',name='QA-PAST',exact=False).click()
    return dialog

with sync_playwright() as pw:
    for engine,width,height in [('chromium',1440,950),('webkit',390,844)]:
        state.clear();before=len(writes)
        browser=getattr(pw,engine).launch();ctx=browser.new_context(viewport=dict(width=width,height=height),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
        ctx.add_init_script("""const f=fetch;window.fetch=function(input,options){const u=new URL(typeof input==='string'?input:input.url,location.href);if(u.pathname==='/api/auth/payment-events')return Promise.resolve(Response.json({status:'success',data:[]}));return f.call(this,input,options);};""")
        ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
        page=ctx.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(a.url+'/contracts?contract_id=901',wait_until='networkidle',timeout=90000);page.locator('button.mg-row-menu-trigger').filter(visible=True).first.click();page.get_by_role('menuitem',name='Xem chi tiết',exact=True).click()
        detail=page.get_by_role('dialog',name='Chi tiết hợp đồng: QA-DEBT',exact=True);detail.get_by_role('button',name='Thu hồi xe nợ xấu',exact=True).click()
        dialog=page.get_by_role('dialog',name='Thu hồi xe nợ xấu · QA-DEBT',exact=True);button=dialog.get_by_role('button',name='Xác nhận đã thu hồi',exact=True);expect(button).to_be_disabled()
        date_time(dialog,'bad-debt-recovered-at','Ngày giờ thực tế thu hồi','2026-10-04T10:15');dialog.get_by_label('Ghi chú thu hồi',exact=True).fill('QA xe đã thu về');expect(button).to_be_disabled()
        dialog.get_by_role('checkbox').check();state['recovery_error']=True;button.click();expect(dialog.get_by_role('alert')).to_contain_text('QA thu hồi chưa ghi nhận');expect(button).to_be_enabled()
        state['recovery_error']=False;button.click();expect(dialog).to_contain_text('Đã ghi nhận thu hồi.');expect(button).to_have_count(0);assert writes[-1]['request_id']==writes[-2]['request_id'];dialog.screenshot(path=str(out/f'{engine}-recovery.png'))
        checks.append(engine+': bad-debt recovery requires actual time, note and physical confirmation; errors keep form; retry uses the same key without money/Telegram')

        picker=select_backfill(page,'contract');picker.get_by_role('button',name='Nhập bổ sung hợp đồng',exact=True).click();form=page.locator('dialog.mg-contract-composer')
        expect(form.get_by_role('region',name='Nhập bổ sung hợp đồng',exact=True)).to_be_visible();form.get_by_label('Tình trạng thực tế của hợp đồng',exact=True).select_option('returned');date_time(form,'backfill-returned-at','Ngày giờ thực tế trả xe','2026-10-07T10:00');form.get_by_label('Lý do nhập bổ sung',exact=True).fill('QA hợp đồng đã trả xe bị quên')
        expect(form).to_contain_text('không đổi trạng thái xe hiện tại');assert len(writes)==before+2
        checks.append(engine+': supplemental contract opens the historical/ongoing choice and actual return fields without creating an order')

        select_backfill(page,'renewal');dialog=page.get_by_role('dialog',name='Nhập bổ sung gia hạn · QA-PAST',exact=True)
        expect(dialog).to_contain_text('Vision QA');dialog.get_by_label('Số ngày gia hạn',exact=True).fill('2');date_time(dialog,'renewal-occurred-at','Ngày giờ gia hạn thực tế','2026-10-03T09:00');dialog.get_by_label('Lý do nhập bổ sung',exact=True).fill('QA quên nhập gia hạn')
        dialog.get_by_role('radio',name='Chưa nhận tiền',exact=False).check()
        dialog.get_by_role('button',name='Lưu gia hạn',exact=True).click();expect(dialog).to_contain_text('Đã lưu gia hạn QA-PAST');assert writes[-1]['occurred_at']=='2026-10-03T09:00'
        dialog.screenshot(path=str(out/f'{engine}-renewal-history.png'));checks.append(engine+': already returned vehicle accepts a historical renewal with actual occurrence and a separate unpaid choice')

        for purpose in ['deposit','deposit_refund','debt']:
            if purpose=='deposit_refund':state['deposit']=2000000
            page.goto(a.url+'/cashbook?contract_id=902&backfill=1',wait_until='networkidle',timeout=90000)
            dialog=page.get_by_role('dialog',name='Nhập bổ sung thu/chi QA-PAST',exact=True);dialog.get_by_label('Nghiệp vụ',exact=True).select_option(purpose)
            button=dialog.get_by_role('button',name='Ghi nhận giao dịch đã phát sinh',exact=True);expect(button).to_be_disabled()
            date_time(dialog,'payment-paid-at','Ngày giờ chi' if purpose=='deposit_refund' else 'Ngày giờ thu','2026-10-03T11:20')
            dialog.get_by_label('Nội dung thu / chuyển khoản',exact=True).fill('QA khoản tiền thực tế bị quên')
            dialog.get_by_role('checkbox',name='Tôi đã kiểm tra lịch sử;',exact=False).check()
            # Ensure no QR workflow or new external transfer is needed for historical entry.
            dialog.get_by_label('Hình thức thanh toán',exact=True).select_option('cash')
            dialog.screenshot(path=str(out/f'{engine}-supplemental-{purpose}.png'))
            button.click();expect(dialog).to_contain_text('Đã xác nhận phiếu');assert writes[-1].get('purpose')==(None if purpose=='debt' else purpose)
            checks.append(engine+': supplemental '+purpose+' requires original date/reason/confirmation and records a single fixture receipt')
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
        ctx.unroute_all(behavior='ignoreErrors');ctx.close();browser.close()
assert not errors,errors
assert not unexpected,unexpected
report=dict(passed=len(checks),checks=checks,javascriptErrors=errors,simulatedWrites=len(writes),realBusinessWrites=0,realTelegramRequests=0)
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2))
