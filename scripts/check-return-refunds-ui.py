"""Refund form regressions. All API writes are intercepted; no real return/refund."""
import argparse,json
from datetime import datetime,timedelta,timezone
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3014');p.add_argument('--branch-cookie-file',required=True);p.add_argument('--output',default='.backups/return-refunds-20261019/ui');a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True);expect.set_options(timeout=30000)
state={};posts=[];errors=[];unexpected=[];checks=[]
now=datetime.now(timezone(timedelta(hours=7)));start=(now-timedelta(days=1)).isoformat();end=(now+timedelta(hours=1)).isoformat()
accounts=[dict(id=15,kind='bank',store_id=32,owner_type='personal',label='TK cá nhân chi hoàn QA'),dict(id=5,kind='cash',store_id=32,owner_type='',label='Két chi hoàn QA')]
def payment():return dict(id=901,code='QA-RETURN',status='renting',store_id=32,revision='1',total_amount=420000,paid_amount=420000,remaining=0,deposit_paid=1000000,deposit_refunded=0,deposit_held=1000000,company_paid_amount=0,company_payment_count=0,accounts=accounts,history=[],items=[])
def photos():return [dict(slot='return-101-document-2',mime_type='image/jpeg',updated_at=now.isoformat())] if state['qr'] else []
def mock(route):
    if mock_contract_type_read(route):return
    req=route.request;path=urlparse(req.url).path;query=parse_qs(urlparse(req.url).query)
    if req.method=='POST':
        assert path=='/api/auth/returns',path
        body=req.post_data_json;posts.append(body)
        s=body['settlements'][0];assert len(body['items'])==1 and s['order_id']==901
        if state['case']=='deferred':assert s['refund_deferred'] and 'refund' not in s
        else:
            r=s['refund'];assert r['amount']=='1000000' and r['account_id']==15 and r['method']=='transfer'
            if state['case'] in ['typed','formatted-qr']:assert r['recipient_account']=='000123456'
        route.fulfill(json=dict(status='success',data=[dict(item_id=101,contract_code='QA-RETURN',status='completed',fee=0)]));return
    if req.method!='GET':unexpected.append(req.method+' '+path);route.abort();return
    if path=='/api/auth/order/car-rental' and query.get('table')==['1']:
        data=dict(rows=[],total=0,scopeCount=0,tabCount=0,page=1,pages=1,statusCounts=[],statuses=[],dueCount=0,summary=dict(contractCount=0,blacklistCount=0,totalAmount=0,receivableAmount=0,badDebtAmount=0))
    elif path=='/api/auth/stores':data=[dict(id=32,store_name='CS QA',kind='physical',status='opening')]
    elif path=='/api/auth/returns':data=[dict(item_id=101,order_id=901,contract_code='QA-RETURN',order_status='renting',customer_name='Khách QA',customer_id_card='',vehicle_id=700,vehicle_name='Wave QA',license='QA-358.49',store_id=32,store_name='CS QA',scheduled_start_at=start,scheduled_return_at=end,completed_at=None,item_revision='1',order_revision='1',total_amount=420000,paid_amount=420000,overdue=False,daily_price=140000,deposit_paid=1000000,deposit_held=1000000)]
    elif path.endswith('/payments'):
        if state['case']=='load-error':route.fulfill(status=503,json=dict(status='error',message='QA không tải được khoản hoàn'));return
        data=payment()
    elif path.endswith('/telegram'):data=dict(auto_enabled=False,events=[])
    elif path=='/api/auth/record-photos/contracts/901':data=photos()
    elif path.startswith('/api/auth/record-photos/contracts/901/'):route.fulfill(body=b'',content_type='image/jpeg');return
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as pw:
    for name,width,height in [('chromium',1440,1000),('webkit',390,844)]:
        browser=getattr(pw,name).launch();ctx=browser.new_context(viewport=dict(width=width,height=height),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
        # Answer this unrelated background poll immediately. WebKit otherwise
        # reports an aborted routed fetch as CORS during full-page navigation.
        ctx.add_init_script("""const qaFetch=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/auth/payment-events')return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return qaFetch.call(this,input,options);};""")
        ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.branch_cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        for case in ['typed','qr-only','partial-qr','formatted-qr','invalid-qr','missing-recipient','deferred','load-error']:
            state.clear();state.update(case=case,qr=case in ['qr-only','partial-qr','formatted-qr','invalid-qr'])
            before=len(posts);page.goto(a.url+'/contracts?action=return&query=QA-358.49',wait_until='networkidle',timeout=90000)
            dialog=page.get_by_role('dialog',name='Trả xe',exact=True);section=dialog.get_by_role('region',name='Thu phí và hoàn cọc',exact=True)
            submit=dialog.get_by_role('button',name='Xác nhận trả 1 xe',exact=True)
            submit.click();expect(dialog.get_by_role('alert',exact=False).filter(has_text='Hoàn tất mục')).to_be_visible();assert len(posts)==before
            if case=='load-error':
                expect(dialog).to_contain_text('QA không tải được khoản hoàn');dialog.get_by_role('button',name='Hủy',exact=True).click();checks.append(dict(browser=name,case=case,blocked=True));continue
            if case=='deferred':section.get_by_label('Chưa hoàn cọc',exact=False).check()
            else:
                section.get_by_label('Đã hoàn cọc cho khách',exact=True).check()
                if state['qr']:expect(section).to_contain_text('Đã nhận ảnh hồ sơ hoàn cọc')
                if case in ['typed','formatted-qr']:
                    section.locator('#return-901-recipient_account').fill('000.123 456')
                if case=='typed':
                    section.locator('#return-901-recipient_bank').fill('QA bank');section.locator('#return-901-recipient_name').fill('Khách QA')
                if case=='partial-qr':section.locator('#return-901-recipient_bank').fill('QA bank')
                if case=='invalid-qr':section.locator('#return-901-recipient_account').fill('bad/#')
                if case=='missing-recipient':section.locator('#return-901-recipient_account').fill('000123456')
            section.get_by_label('Đã hoàn cọc cho khách',exact=True).scroll_into_view_if_needed()
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
            page.screenshot(path=str(out/f'{name}-{width}-{case}.png'))
            submit.click()
            if case in ['invalid-qr','missing-recipient']:
                expect(dialog.get_by_role('alert').filter(has_text='Hoàn tất mục')).to_be_visible();assert len(posts)==before
                dialog.get_by_role('button',name='Hủy',exact=True).click()
            else:
                expect(dialog).to_contain_text('Đã trả xe hợp đồng QA-RETURN');assert len(posts)==before+1
                if case=='deferred':expect(dialog).to_contain_text('Chưa ghi nhận hoàn hết cọc')
                dialog.get_by_role('button',name='Đóng',exact=True).click()
            checks.append(dict(browser=name,case=case,blocked=case in ['invalid-qr','missing-recipient']))
        ctx.unroute_all(behavior='wait');ctx.close();browser.close()
assert not errors,errors
assert not unexpected,unexpected
report=dict(checks=checks,javascriptErrors=errors,returnPosts=len(posts),realBusinessWrites=0,realTelegramRequests=0)
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False))
