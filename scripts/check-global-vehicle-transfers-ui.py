"""Global fleet permissions: only fixture writes; never move production stock."""
import argparse, json
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3025');p.add_argument('--sessions',default='.backups/global-vehicle-transfers-20261024');p.add_argument('--output',default='.backups/global-vehicle-transfers-20261024/ui');a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True);expect.set_options(timeout=30000)
checks=[];errors=[];unexpected=[];writes=[];state={}
stores=[dict(id=80001,store_name='Cơ sở tài khoản QA'),dict(id=80002,store_name='Cơ sở đi QA'),dict(id=80003,store_name='Cơ sở đến QA')]

def vehicle():
    moving=state.get('moved',False);received=state.get('received',False)
    return dict(id=91001,name='Xe toàn hệ thống QA',license='QA-GLOBAL-1',brand='Honda',type='xeso',year=2024,color='Đỏ',odometer=0,store_id=80002,current_store_id=80003 if moving else 80002,store_name=stores[2 if moving else 1]['store_name'],status='ready' if not moving or received else 'in_transit',vehicle_revision='12' if received else '11' if moving else '10',rentals=[],rental_blockers=[],transfer_event_id=40001 if moving else None,transfer_from_store_id=80002,transfer_to_store_id=80003,transfer_from_store_name=stores[1]['store_name'],transfer_to_store_name=stores[2]['store_name'],transfer_receivable=0 if received else 1)

def mock(route):
    req=route.request;u=urlparse(req.url);endpoint=u.path;query=parse_qs(u.query)
    if endpoint=='/api/auth/gps/refresh':route.fulfill(json=dict(status='success',data=dict(cached=True)));return
    if req.method!='GET':
        if req.method=='POST' and endpoint=='/api/auth/vehicles/91001/actions':
            body=req.post_data_json;writes.append(body);assert body['action'] in ['transfer','receive'];assert 'created_by' not in body
            if state.get('fail_'+body['action'],True):
                state['fail_'+body['action']]=False;route.fulfill(status=409,json=dict(status='error',message='QA lỗi tạm thời, kiểm tra rồi thử lại.'));return
            if body['action']=='transfer':assert str(body['to_store_id'])=='80003';state['moved']=True
            else:assert int(body['transfer_event_id'])==40001;state['received']=True
            route.fulfill(json=dict(status='success',data=dict(id=91001,event_id=40002 if state.get('received') else 40001)));return
        unexpected.append(req.method+' '+endpoint);route.abort();return
    if endpoint=='/api/session':route.fulfill(json=dict(user=dict(name='Nhân viên QA')));return
    if endpoint=='/api/auth/stores':data=[stores[0]]
    elif endpoint=='/api/auth/store-directory':data=stores
    elif endpoint in ['/api/auth/vehicle/vehicles','/api/auth/vehicles/inventory']:
        v=vehicle();data=[v]
        if endpoint.endswith('/inventory'):v.update(store_id=v['current_store_id'],available=v['status']=='ready')
        elif query.get('table'):
            selected=query.get('store',['all'])[0];rows=[v] if selected=='all' or selected==str(v['current_store_id']) else []
            data=dict(rows=rows,total=len(rows),scopeCount=1,tabCount=1,page=1,pages=1,statusCounts=[],statuses=[],dueCount=0,summary=None)
    elif endpoint=='/api/auth/vehicles/transfers':data=dict(rows=[],total=0,scopeCount=0,page=1,size=25)
    elif endpoint=='/api/auth/gps/refresh':data=dict(cached=True)
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))

profiles=json.loads((Path(a.sessions)/'profiles.json').read_text(encoding='utf-8'))
with sync_playwright() as pw:
    for engine,width,height in [('chromium',1440,950),('webkit',390,844)]:
        browser=getattr(pw,engine).launch()
        for profile in profiles:
            role=profile['role'];state.clear();before=len(writes)
            ctx=browser.new_context(viewport=dict(width=width,height=height),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
            ctx.add_cookies([dict(name='himoto_management_session',value=(Path(a.sessions)/f'session-{role}.txt').read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')])
            ctx.add_init_script("const f=fetch;window.fetch=function(i,o){const u=new URL(typeof i==='string'?i:i.url,location.href);return u.pathname==='/api/auth/payment-events'?Promise.resolve(Response.json({status:'success',data:[]})):f.call(this,i,o);};")
            ctx.route('**/api/**',mock);page=ctx.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(a.url+'/vehicles',wait_until='networkidle',timeout=90000)
            branch=page.get_by_role('combobox',name='Cơ sở đang xem',exact=True);expect(branch).to_have_value('all');expect(branch.locator('option')).to_have_count(4)
            branch.select_option('80002');expect(branch).to_have_value('80002');branch.select_option('all')
            page.get_by_role('button',name='Chuyển xe',exact=True).click();dialog=page.get_by_role('dialog',name='Chuyển xe',exact=True)
            dialog.locator('#vehicle-action-vehicle').fill('QA-GLOBAL-1 — Xe toàn hệ thống QA');expect(dialog.locator('#vehicle-action-from')).to_have_value('Cơ sở đi QA')
            expect(dialog.locator('#vehicle-action-to option[value="80002"]')).to_have_count(0)
            expect(dialog.locator('#vehicle-action-to option[value="80001"]')).to_have_count(1);expect(dialog.locator('#vehicle-action-to option[value="80003"]')).to_have_count(1)
            dialog.locator('#vehicle-action-to').select_option('80003');dialog.locator('#vehicle-action-note').fill('QA điều chuyển ngoài cơ sở tài khoản')
            dialog.screenshot(path=str(out/f'{engine}-{role}-transfer.png'))
            dialog.get_by_role('button',name='Chuyển xe',exact=True).click();expect(dialog.get_by_role('alert')).to_contain_text('QA lỗi tạm thời');expect(dialog.locator('#vehicle-action-to')).to_have_value('80003')
            dialog.get_by_role('button',name='Chuyển xe',exact=True).click()
            evidence=page.get_by_role('dialog',name='Đã chuyển xe · Tải ảnh',exact=True);expect(evidence).to_be_visible();evidence.get_by_role('button',name='Đóng',exact=True).click()
            checks.append(f'{engine}/{role}: sees every branch, selects foreign stock and retries dispatch without losing input')
            page.get_by_role('button',name='Nhận xe',exact=True).filter(visible=True).first.click();dialog=page.get_by_role('dialog',name='Nhận xe',exact=True)
            expect(dialog.locator('#vehicle-receive-from')).to_have_value('Cơ sở đi QA');expect(dialog.locator('#vehicle-receive-to')).to_have_value('Cơ sở đến QA')
            button=dialog.get_by_role('button',name='Xác nhận đã nhận xe',exact=True);button.click();expect(dialog.get_by_role('alert')).to_contain_text('QA lỗi tạm thời');button.click()
            evidence=page.get_by_role('dialog',name='Đã nhận xe · Tải ảnh',exact=True);expect(evidence).to_be_visible();evidence.screenshot(path=str(out/f'{engine}-{role}-received.png'));evidence.get_by_role('button',name='Đóng',exact=True).click()
            assert len(writes)==before+4;assert state['received'];assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
            checks.append(f'{engine}/{role}: confirms the correct transfer to foreign destination and opens receipt-photo evidence')
            ctx.unroute_all(behavior='ignoreErrors');ctx.close()
        browser.close()
assert not errors,errors
assert not unexpected,unexpected
report=dict(passed=len(checks),checks=checks,javascriptErrors=errors,simulatedWrites=len(writes),realBusinessWrites=0,realTelegramRequests=0)
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2))
