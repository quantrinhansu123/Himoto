"""Bad debt and ownership hold/resume. Every business write is a fixture."""
import argparse,copy,json
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from datetime import datetime,timedelta
from playwright.sync_api import sync_playwright,expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3026');p.add_argument('--sessions',default='.backups/contract-lifecycle-20261024');p.add_argument('--output',default='.backups/contract-lifecycle-20261024/ui');a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True);expect.set_options(timeout=30000)
checks=[];errors=[];writes=[];unexpected=[];state={};opened=901;fail_action=None;borrowed=False;fixture_store=32
original_plan=dict(version=1,start='2026-10-01T08:00',end='2027-04-01T08:00',interval='month',amount=100000)

def initialize():
    global borrowed
    borrowed=False;state.clear()
    for id,status,own,total,paid,vehicle_ids in [(901,'overdue',False,1000000,0,[101,102]),(902,'renting',True,100000,20000,[201,202]),(903,'renting',True,750000,100000,[301]),(904,'bad_debt',False,1000000,1000000,[401])]:
        state[id]=dict(status=status,ownership=own,base=total,total=total,paid=paid,deposit=0,settlement=False,events=[],plan=copy.deepcopy(original_plan) if id==902 else None,held_at=None,resume_vehicle_count=0,items=[dict(id=id*10+i,vehicle_id=v,name='Xe QA',license=f'QA-CAR-{v}',rent_at='2026-10-01T01:00:00Z',return_at='2026-10-10T01:00:00Z' if not own else '2027-04-01T01:00:00Z',completed_at=None) for i,v in enumerate(vehicle_ids)])

def context(id):
    s=state[id];remaining=max(s['total']-s['paid'],0);clear=remaining==0 and s['deposit']==0
    return dict(id=id,code=f'QA-LIFE-{id}',status=s['status'],revision=str(10+len(s['events'])),ownership=s['ownership'],overdue=s['status']=='overdue',items=s['items'],all_returned=all(i['completed_at'] for i in s['items']),returned_count=sum(bool(i['completed_at']) for i in s['items']),total_amount=s['total'],paid_amount=s['paid'],remaining=remaining,deposit_held=s['deposit'],overpayment=max(s['paid']-s['total'],0),settled=s['settlement'] and clear,can_settle=clear,settlement_note='Đủ số liệu tiền để xác nhận tất toán.' if clear else 'Còn công nợ hoặc cọc cần đối chiếu.',events=s['events'],held_at=s['held_at'],resume_vehicle_count=s['resume_vehicle_count'],plan=s['plan'],base_total=s['base'],start_at='2026-10-01T01:00:00Z',end_at=(s['plan']['end']+':00+07:00') if s['plan'] else '2027-04-01T01:00:00Z')

def record(id):
    s=state[id]
    return dict(id=id,contract_number=f'QA-LIFE-{id}',order_status=s['status'],order_type='ownership' if s['ownership'] else 'daily',rental_type='ownership' if s['ownership'] else 'daily',store_id=32,store_kind='lease_to_own' if s['ownership'] else 'branch',store_name='Cơ sở QA',customer_name='Khách QA',total_amount=s['total'],paid_amount=s['paid'],rent_at='2026-10-01T01:00:00Z',return_at='2026-10-10T01:00:00Z' if not s['ownership'] else '2027-04-01T01:00:00Z',draft_revision=str(10+len(s['events'])),draft_payload=dict(management_composer=dict(installment_plan=s['plan'])) if s['plan'] else {},vehicles=[dict(id=i['vehicle_id'],name=i['name'],license=i['license'],rent_at=i['rent_at'],return_at=i['return_at'],completed_at=i['completed_at']) for i in s['items']])

def close_if_ready(s):
    if s['settlement'] and s['paid']==s['total'] and s['deposit']==0 and all(i['completed_at'] for i in s['items']):s['status']='completed'

def mock(route):
    global fail_action
    req=route.request;parsed=urlparse(req.url);path=parsed.path;q=parse_qs(parsed.query)
    if mock_contract_type_read(route):return
    if path=='/api/auth/gps/refresh':route.fulfill(json=dict(status='success',data=dict(cached=True)));return
    if req.method!='GET':
        if req.method=='POST' and path.endswith('/lifecycle'):
            id=int(path.split('/')[-2]);s=state[id];body=req.post_data_json;writes.append(copy.deepcopy(body));assert body['confirmed'] is True and len(body['note'])>=5 and 'actor_id' not in body
            if fail_action==body['action']:fail_action=None;route.fulfill(status=409,json=dict(status='error',message='QA kiểm tra lại xe và hợp đồng trước khi thử lại.'));return
            action=body['action'];old=s['status'];event=dict(action=action,at=body['at']+':00+07:00',recorded_at=body['at']+':00+07:00',actor_id=1,actor_name='Nhân viên QA',note=body['note'],request_id=body['request_id'],request_hash='QA',**{'from':old,'to':old})
            if action=='mark_bad_debt':assert old=='overdue';s['status']='bad_debt'
            elif action=='settle':assert s['total']==s['paid'] and s['deposit']==0;s['settlement']=True;close_if_ready(s)
            elif action=='hold':
                assert s['ownership'];s['status']='reserved';s['held_at']=body['at'];s['resume_vehicle_count']=sum(not i['completed_at'] for i in s['items'])
                for item in s['items']:
                    if not item['completed_at']:item['completed_at']=body['at']+':00+07:00'
                if s['plan']:s['plan']['stopped_at']=body['at']
            elif action=='resume':
                assert old=='reserved';assert len(body['vehicle_ids'])==s['resume_vehicle_count'];assert len(set(body['vehicle_ids']))==len(body['vehicle_ids']);assert 201 not in body['vehicle_ids'] if borrowed else True
                if s['plan']:
                    delta=datetime.fromisoformat(body['at'])-datetime.fromisoformat(s['held_at']);dues=['2026-10-01T08:00','2026-11-01T08:00','2026-12-01T08:00','2027-01-01T08:00','2027-02-01T08:00','2027-03-01T08:00'];s['plan']=dict(version=1,start=dues[0],end=(datetime.fromisoformat('2027-04-01T08:00')+delta).isoformat(timespec='minutes'),interval='custom',amount=100000,periods=[dict(due_at=(datetime.fromisoformat(d)+delta).isoformat(timespec='minutes') if d>s['held_at'] else d,amount=100000) for d in dues])
                else:
                    assert body['resume_amount']=='350000' and body['resume_package']=='Theo tháng';s['plan']=dict(version=1,start='2026-10-01T08:00',end=body['resume_end'],interval='custom',amount=s['base'],periods=[dict(due_at='2026-10-01T08:00',amount=s['base']),dict(due_at=body['at'],amount=350000)]);s['total']+=350000
                for index,v in enumerate(body['vehicle_ids']):s['items'].append(dict(id=id*100+index,vehicle_id=v,name='Xe QA mới',license=f'QA-CAR-{v}',rent_at=body['at']+':00+07:00',return_at=s['plan']['end']+':00+07:00',completed_at=None))
                s['status']='renting';s['held_at']=None;s['settlement']=False
            else:raise AssertionError(action)
            event['to']=s['status'];s['events'].append(event);route.fulfill(json=dict(status='success',data=context(id)));return
        if req.method=='POST' and path=='/api/auth/returns/recover':
            body=req.post_data_json;writes.append(copy.deepcopy(body));s=state[opened];item=next(i for i in s['items'] if i['id']==body['item_id']);assert not item['completed_at'];item['completed_at']=body['recovered_at']+':00+07:00';close_if_ready(s)
            route.fulfill(json=dict(status='success',data=dict(item_id=item['id'],order_id=opened,vehicle_id=item['vehicle_id'],recovered_at=item['completed_at'],replayed=False)));return
        unexpected.append(req.method+' '+path);route.abort();return
    if path=='/api/session':route.fulfill(json=dict(user=dict(name='Nhân viên QA')));return
    if path.endswith('/lifecycle'):data=context(int(path.split('/')[-2]))
    elif path=='/api/auth/order/car-rental':data=[{**record(opened),'store_id':fixture_store}]
    elif path in ['/api/auth/stores','/api/auth/store-directory']:data=[dict(id=fixture_store,store_name='Cơ sở QA',status='opening')]
    elif path=='/api/auth/returns':
        data=[dict(item_id=i['id'],item_revision='10',order_id=opened,order_status=state[opened]['status'],code=f'QA-LIFE-{opened}',vehicle_id=i['vehicle_id'],vehicle_name=i['name'],license=i['license'],completed_at=i['completed_at'],store_id=32,store_name='Cơ sở QA',total_amount=state[opened]['total'],paid_amount=state[opened]['paid'],deposit_paid=0,deposit_held=0,scheduled_start_at=i['rent_at'],scheduled_return_at=i['return_at']) for i in state[opened]['items']]
    elif path in ['/api/auth/vehicles/inventory','/api/auth/vehicle/vehicles']:
        data=[dict(id=v,name='Xe kho QA',license=f'QA-CAR-{v}',status='using' if borrowed and v==201 else 'ready',store_id=32,current_store_id=32,store_name='Cơ sở QA',type='xe_dien',brand='VinFast',available=not(borrowed and v==201),rental_blockers=[dict(order_id=999,code='QA-KHACH-MOI',status='renting',store_name='Cơ sở khác QA')] if borrowed and v==201 else []) for v in [201,202,203,204,301]]
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))

def date_time(dialog,id,label,value):
    dialog.locator('#'+id).fill(value[:10]);dialog.get_by_label('Giờ '+label.lower()+' (24h)',exact=True).select_option(value[11:13]);dialog.get_by_label('Phút '+label.lower(),exact=True).select_option(value[14:16])

def open_detail(page,id):
    global opened
    opened=id;page.goto(a.url+f'/contracts?contract_id={id}',wait_until='networkidle',timeout=90000)
    try:page.locator('button.mg-row-menu-trigger').filter(visible=True).first.click()
    except Exception:
        page.screenshot(path=str(out/'failed-list.png'));(out/'failed-list.txt').write_text(page.locator('body').inner_text(),encoding='utf-8');raise
    page.get_by_role('menuitem',name='Xem chi tiết',exact=True).click();detail=page.get_by_role('dialog',name=f'Chi tiết hợp đồng: QA-LIFE-{id}',exact=True);detail.get_by_role('tab',name='Nợ xấu / bảo lưu',exact=True).click();panel=detail.locator('#contract-detail-panel-lifecycle');expect(panel.get_by_role('button',name='Làm mới tình trạng',exact=True)).to_be_visible();return detail,panel

def confirm(page,title,at,label,note='QA đối chiếu xe và công nợ'):
    dialog=page.get_by_role('dialog',name=title,exact=True);button=dialog.get_by_role('button',name=title,exact=True);expect(button).to_be_disabled();date_time(dialog,'lifecycle-at',label,at);dialog.get_by_label('Lý do / nội dung đối chiếu',exact=True).fill(note);expect(button).to_be_disabled();dialog.get_by_role('checkbox').check();return dialog,button

def recover(page,panel):
    panel.get_by_role('button',name='Thu hồi xe nợ xấu',exact=True).click();dialog=page.get_by_role('dialog',name=f'Thu hồi xe nợ xấu · QA-LIFE-{opened}',exact=True);date_time(dialog,'bad-debt-recovered-at','Ngày giờ thực tế thu hồi','2026-10-24T11:00');dialog.get_by_label('Ghi chú thu hồi',exact=True).fill('QA xe đã thực tế thu về');dialog.get_by_role('checkbox').check();dialog.get_by_role('button',name='Xác nhận đã thu hồi',exact=True).click();expect(dialog).to_contain_text('Đã ghi nhận thu hồi.');dialog.get_by_role('button',name='Đóng',exact=True).click()

with sync_playwright() as pw:
    for engine,width,height in [('chromium',1440,950),('webkit',390,844)]:
        browser=getattr(pw,engine).launch()
        for role in ['admin','ownership_staff','accounting']:
            fixture_store=next(profile['storeId'] or 32 for profile in json.loads((Path(a.sessions)/'profiles.json').read_text()) if profile['role']==role)
            initialize();ctx=browser.new_context(viewport=dict(width=width,height=height),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce');ctx.add_cookies([dict(name='himoto_management_session',value=(Path(a.sessions)/f'session-{role}.txt').read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
            ctx.add_init_script("const f=fetch;window.fetch=function(i,o){const u=new URL(typeof i==='string'?i:i.url,location.href);return u.pathname==='/api/auth/payment-events'?Promise.resolve(Response.json({status:'success',data:[]})):f.call(this,i,o);};")
            page=ctx.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
            if role=='accounting':
                detail,panel=open_detail(page,904);expect(panel.get_by_role('button',name='Thu hồi xe nợ xấu',exact=True)).to_have_count(0);panel.get_by_role('button',name='Xác nhận tất toán',exact=True).click();dialog,button=confirm(page,'Xác nhận tất toán','2026-10-24T10:00','Ngày giờ xác nhận');button.click();expect(panel).to_contain_text('Đã xác nhận tất toán');assert state[904]['status']=='bad_debt';checks.append(engine+'/'+role+': finance can confirm settlement independently without vehicle-return authority');ctx.unroute_all(behavior='ignoreErrors');ctx.close();continue
            detail,panel=open_detail(page,901);panel.get_by_role('button',name='Chuyển sang Nợ xấu',exact=True).click();dialog,button=confirm(page,'Chuyển sang Nợ xấu','2026-10-24T10:00','Ngày giờ xác nhận');fail_action='mark_bad_debt';button.click();expect(dialog.get_by_role('alert')).to_contain_text('QA kiểm tra lại');expect(dialog.get_by_label('Lý do / nội dung đối chiếu',exact=True)).to_have_value('QA đối chiếu xe và công nợ');button.click();expect(dialog).not_to_be_visible();assert writes[-1]['request_id']==writes[-2]['request_id'];expect(panel.get_by_role('button',name='Xác nhận tất toán',exact=True)).to_be_disabled();checks.append(engine+'/'+role+': overdue classification requires reason/confirmation; failure preserves form and retry identity')
            recover(page,panel);expect(panel).to_contain_text('Đã trả 1/2');assert state[901]['status']=='bad_debt';recover(page,panel);expect(panel).to_contain_text('Đã trả tất cả xe');assert state[901]['status']=='bad_debt';checks.append(engine+'/'+role+': each physical recovery updates vehicle state independently while unpaid debt stays open')
            state[901]['paid']=1000000;panel.get_by_role('button',name='Làm mới tình trạng',exact=True).click();expect(panel.get_by_role('button',name='Xác nhận tất toán',exact=True)).to_be_enabled();panel.get_by_role('button',name='Xác nhận tất toán',exact=True).click();dialog,button=confirm(page,'Xác nhận tất toán','2026-10-24T12:00','Ngày giờ xác nhận');expect(dialog).to_contain_text('xác nhận sẽ đóng hợp đồng');button.click();expect(panel).to_contain_text('Hoàn thành');assert state[901]['status']=='completed';panel.screenshot(path=str(out/f'{engine}-{role}-closed.png'));checks.append(engine+'/'+role+': all returned plus approved ledger reconciliation closes the contract')
            detail,panel=open_detail(page,904);panel.get_by_role('button',name='Xác nhận tất toán',exact=True).click();dialog,button=confirm(page,'Xác nhận tất toán','2026-10-24T10:00','Ngày giờ xác nhận');expect(dialog).to_contain_text('hợp đồng vẫn Nợ xấu');button.click();expect(panel).to_contain_text('Đã xác nhận tất toán');assert state[904]['status']=='bad_debt';recover(page,panel);expect(panel).to_contain_text('Hoàn thành');checks.append(engine+'/'+role+': settlement before return keeps bad debt until the final actual recovery')
            detail,panel=open_detail(page,902);panel.get_by_role('button',name='Bảo lưu hợp đồng',exact=True).click();dialog,button=confirm(page,'Bảo lưu hợp đồng','2026-10-15T10:00','Ngày giờ thực tế thu xe và bảo lưu');expect(dialog).to_contain_text('nợ và cọc cũ được giữ nguyên');button.click();expect(panel).to_contain_text('Đang bảo lưu');assert state[902]['base']==100000 and state[902]['paid']==20000 and state[902]['plan']['stopped_at']=='2026-10-15T10:00';checks.append(engine+'/'+role+': ownership hold confirms physical return, pauses billing and retains old debt/deposit')
            borrowed=True;panel.get_by_role('button',name='Thuê lại từ bảo lưu',exact=True).click();dialog=page.get_by_role('dialog',name='Thuê lại từ bảo lưu',exact=True);date_time(dialog,'lifecycle-at','Ngày giờ thực tế thuê lại','2026-10-24T10:00');field=dialog.get_by_label('Xe thuê lại 1',exact=True);field.fill('QA-CAR-201');expect(dialog.get_by_role('option').filter(has_text='QA-CAR-201')).to_have_attribute('aria-disabled','true')
            field.fill('QA-CAR-203');dialog.get_by_role('option').filter(has_text='QA-CAR-203').click();field=dialog.get_by_label('Xe thuê lại 2',exact=True);field.fill('QA-CAR-203');expect(dialog.get_by_role('option').filter(has_text='QA-CAR-203')).to_have_attribute('aria-disabled','true');field.fill('QA-CAR-204');dialog.get_by_role('option').filter(has_text='QA-CAR-204').click();dialog.get_by_label('Lý do / nội dung đối chiếu',exact=True).fill('QA chọn xe rảnh và tiếp tục lịch cũ');dialog.get_by_role('checkbox').check();expect(dialog).to_contain_text('10/04/2027');dialog.screenshot(path=str(out/f'{engine}-{role}-resume.png'));fail_action='resume';button=dialog.get_by_role('button',name='Thuê lại từ bảo lưu',exact=True);button.click();expect(dialog.get_by_role('alert')).to_contain_text('QA kiểm tra lại');button.click();expect(dialog).not_to_be_visible();assert len(state[902]['items'])==4 and sum(not i['completed_at'] for i in state[902]['items'])==2;checks.append(engine+'/'+role+': resume blocks another customer and duplicate vehicle selections; new free vehicles preserve prior lines and remaining schedule')
            detail,panel=open_detail(page,903);panel.get_by_role('button',name='Bảo lưu hợp đồng',exact=True).click();dialog,button=confirm(page,'Bảo lưu hợp đồng','2026-10-15T10:00','Ngày giờ thực tế thu xe và bảo lưu');button.click();expect(panel).to_contain_text('Đang bảo lưu');panel.get_by_role('button',name='Thuê lại từ bảo lưu',exact=True).click();dialog=page.get_by_role('dialog',name='Thuê lại từ bảo lưu',exact=True);date_time(dialog,'lifecycle-at','Ngày giờ thực tế thuê lại','2026-10-24T10:00');field=dialog.get_by_label('Xe thuê lại 1',exact=True);field.fill('QA-CAR-301');dialog.get_by_role('option').filter(has_text='QA-CAR-301').click();date_time(dialog,'lifecycle-resume-end','Kết thúc thời gian còn lại','2026-11-24T10:00');dialog.get_by_label('Tiền mỗi kỳ cho toàn bộ xe (VNĐ)',exact=True).fill('350000');dialog.get_by_label('Lý do / nội dung đối chiếu',exact=True).fill('QA đối chiếu lịch còn lại hợp đồng cũ');dialog.get_by_role('checkbox').check();dialog.get_by_role('button',name='Thuê lại từ bảo lưu',exact=True).click();expect(dialog).not_to_be_visible();assert state[903]['base']==750000 and state[903]['paid']==100000 and state[903]['total']==1100000;checks.append(engine+'/'+role+': legacy hold requires an explicit remaining schedule and retains existing debt before charging new periods')
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1');ctx.unroute_all(behavior='ignoreErrors');ctx.close()
        browser.close()
assert not errors,errors
assert not unexpected,unexpected
report=dict(passed=len(checks),checks=checks,javascriptErrors=errors,simulatedWrites=len(writes),realBusinessWrites=0,realTelegramRequests=0)
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2))
