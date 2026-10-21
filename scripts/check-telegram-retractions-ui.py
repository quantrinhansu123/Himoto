"""Retraction UI. All API mutations intercepted; no Telegram or financial operations."""
import argparse,copy,json
from datetime import datetime,timedelta,timezone
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3014');p.add_argument('--cookie-file',required=True);p.add_argument('--output',default='.backups/telegram-retractions-20261021/ui');a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True);expect.set_options(timeout=30000)
now=datetime.now(timezone(timedelta(hours=7)));state={};checks=[];errors=[];posts=[];unexpected=[]
ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002']
def delivery(index=0):
    block={'expired':'Đã sát hoặc quá giới hạn thu hồi 48 giờ; nhờ quản trị nhóm xóa trực tiếp.','readonly':'Tài khoản chưa có quyền thu hồi giao dịch này.','legacy':'Tin cũ chưa lưu chính xác nhóm nhận; nhờ quản trị nhóm xóa trực tiếp.'}.get(state['case'],'')
    return dict(id=ids[index],sent_at=(now-timedelta(hours=index+1)).isoformat(),message_count=3,text='NỘI DUNG ĐÃ GỬI '+str(index+1),can_retract=not bool(block),blocked_reason=block,expires_at=(now+timedelta(hours=47-index)).isoformat(),retraction_state=None)
def event():
    ds=[delivery(0)]+([delivery(1)] if state['case']=='multiple' else [])
    current=next(d for d in ds if d['id']==state.get('selected',ids[0]))
    if state.get('requested'):
        current.update(retraction_state='failed' if state['case']=='retry' and state['attempts']==1 else 'done',retraction_reason='QA chỉnh sửa nhầm hợp đồng',retracted_at=now.isoformat(),can_retract=state['case']=='retry' and state['attempts']==1)
        current['blocked_reason']='Bot không có quyền xóa tin trong nhóm. Kiểm tra rồi thử lại.' if current['retraction_state']=='failed' else 'Đã thu hồi lần gửi này.'
    done=state.get('requested') and current['retraction_state']=='done'
    failed=state.get('requested') and current['retraction_state']=='failed'
    return dict(key='rental:901',kind='rental',label='Thuê xe QA',phases=['rental'],destination_label='Nhóm cơ sở CS QA',text='BẢN ĐÚNG ĐANG XEM TRƯỚC',hash='a'*64,photo_count=2,video_count=0,status='retracted' if done else 'retraction_failed' if failed else 'sent',sent_at=now.isoformat(),can_send=bool(done) and state['case']!='cancelled',unchanged=not done,attachments=[],deliveries=ds)
def mock(route):
    if mock_contract_type_read(route):return
    req=route.request;path=urlparse(req.url).path
    if path=='/api/auth/order/car-rental/901/telegram':
        if req.method=='POST':
            body=req.post_data_json;posts.append(copy.deepcopy(body))
            if body['action']=='send':assert state.get('allow_send');state['sent_again']=True
            else:
                assert body['action']=='retract' and body['confirmed'] and body['reason']=='QA chỉnh sửa nhầm hợp đồng'
                assert body['notice_id']==(ids[1] if state['case']=='multiple' else ids[0])
                assert set(body)=={'action','event_key','notice_id','request_id','reason','confirmed'}
                state['selected']=body['notice_id'];state['requested']=True;state['attempts']+=1
                if state['case']=='api-error':state['requested']=False;route.fulfill(status=403,json=dict(status='error',message='QA yêu cầu bị từ chối'));return
        value=event()
        if state.get('sent_again'):value.update(can_send=False,status='sent',unchanged=True)
        route.fulfill(json=dict(status='success',data=dict(auto_enabled=False,next_renewal_version=2,events=[value])));return
    if req.method!='GET':unexpected.append(req.method+' '+path);route.abort();return
    if path=='/api/auth/order/car-rental':data=[dict(id=901,contract_number='QA-RETRACT',order_status='cancelled' if state['case']=='cancelled' else 'renting',order_type='daily',store_id=32,store_name='CS QA',customer_name='Khách QA',total_amount=200000,paid_amount=200000)]
    elif path in ['/api/auth/stores','/api/auth/store-directory']:data=[dict(id=32,store_name='CS QA',status='opening')]
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as pw:
    for name,width,height in [('chromium',1440,1000),('webkit',390,844)]:
        browser=getattr(pw,name).launch();ctx=browser.new_context(viewport=dict(width=width,height=height),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
        ctx.add_init_script("""const qaFetch=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/auth/payment-events')return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return qaFetch.call(this,input,options);};""")
        ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        for case in ['success','multiple','expired','readonly','legacy','retry','api-error','cancelled']:
            state.clear();state.update(case=case,attempts=0);before=len(posts)
            page.goto(a.url+'/contracts',wait_until='networkidle',timeout=120000)
            page.locator('button.mg-row-menu-trigger').filter(visible=True).first.click()
            page.get_by_role('menuitem',name='Lịch sử Telegram / Thu hồi tin' if case=='cancelled' else 'Gửi Telegram',exact=True).click()
            dialog=page.get_by_role('dialog',name='Gửi Telegram · QA-RETRACT',exact=True)
            section=dialog.get_by_role('region',name='Thu hồi tin Telegram',exact=True)
            expect(section.get_by_role('button',name='Thu hồi tin Telegram',exact=True)).to_be_visible();assert len(posts)==before
            section.get_by_role('button',name='Thu hồi tin Telegram',exact=True).click()
            if case in ['expired','readonly','legacy']:
                expect(section.get_by_role('button',name='Xác nhận thu hồi Telegram',exact=True)).to_have_count(0)
                expect(section).to_contain_text(delivery()['blocked_reason']);assert len(posts)==before
            else:
                if case=='multiple':section.get_by_label('Lần gửi cần thu hồi',exact=True).select_option(ids[1])
                section.locator('summary').click();expect(section).to_contain_text('NỘI DUNG ĐÃ GỬI '+('2' if case=='multiple' else '1'))
                button=section.get_by_role('button',name='Xác nhận thu hồi Telegram',exact=True);expect(button).to_be_disabled()
                section.get_by_label('Lý do thu hồi',exact=True).fill('QA chỉnh sửa nhầm hợp đồng');expect(button).to_be_disabled()
                section.get_by_label('Tôi xác nhận thu hồi đúng lần gửi đã chọn khỏi Telegram',exact=True).check()
                if case=='success':section.scroll_into_view_if_needed();page.screenshot(path=str(out/f'{name}-confirm.png'))
                button.click()
                if case=='api-error':expect(dialog.get_by_role('alert')).to_contain_text('QA yêu cầu bị từ chối')
                else:
                    if case=='retry':
                        expect(section).to_contain_text('Bot không có quyền');section.get_by_role('button',name='Thử thu hồi lại',exact=True).click()
                    expect(section).to_contain_text('Đã thu hồi toàn bộ 3 tin / tệp');assert not state.get('sent_again')
                    if case=='success':
                        state['allow_send']=True;dialog.get_by_role('button',name='Gửi toàn bộ Telegram',exact=False).click();expect(dialog.get_by_role('button',name='Đã gửi Telegram',exact=False)).to_be_disabled()
                    if case=='cancelled':expect(dialog.get_by_role('button',name='Gửi toàn bộ Telegram',exact=False)).to_be_disabled()
            section.scroll_into_view_if_needed();assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
            page.screenshot(path=str(out/f'{name}-{case}.png'));checks.append(dict(browser=name,case=case,passed=True))
            dialog.get_by_role('button',name='Đóng',exact=True).click()
        ctx.unroute_all(behavior='ignoreErrors');ctx.close();browser.close()
assert not errors,errors
assert not unexpected,unexpected
report=dict(checks=checks,javascriptErrors=errors,interceptedMutations=len(posts),realTelegramRequests=0,realBusinessWrites=0)
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False))
