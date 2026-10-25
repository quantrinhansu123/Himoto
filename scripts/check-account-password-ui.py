"""Account branch filtering, exclusive recovery and self password changes; APIs are mocked."""
import argparse, json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3027');p.add_argument('--sessions-file',required=True);p.add_argument('--output',default='.backups/account-passwords-20261025/ui')
a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True);tokens=json.loads(Path(a.sessions_file).read_text())
expect.set_options(timeout=20000)
checks=[];errors=[];unexpected=[];writes=[];reads=[]
state={'role':'recovery','version':1}
stores=[{'id':33,'store_name':'CS Hà Đông QA','status':'opening'},{'id':31,'store_name':'CS Láng QA','status':'opening'}]
def rows():
    recovery=state['role']=='recovery'
    return [dict(id=id,name=name,email=login+'@example.invalid',login_name=login,access_role='branch_staff' if store else 'admin',store_id=store,store_name=label,scope_all=store is None,permissions=['contracts.read'],enabled=True,status='active',revision=str(state['version']),can_edit=True,can_delete=True,password_available=recovery,can_reset_password=recovery,password_changed_at='2026-10-25T05:00:00Z' if state['version']==1 else '2026-10-25T06:00:00Z') for id,name,login,store,label in [(901,'Nhân viên Hà Đông QA','qa.hadong',33,'CS Hà Đông QA'),(902,'Nhân viên Láng QA','qa.lang',31,'CS Láng QA'),(903,'Tài khoản toàn hệ thống QA','qa.global',None,None)]]

def mock(route):
    req=route.request;url=urlparse(req.url);path=url.path;query=parse_qs(url.query)
    if path=='/api/auth/gps/refresh':route.fulfill(json={'status':'success'});return
    if req.method not in ('GET','HEAD'):
        if path=='/api/auth/accounts/password' and req.method=='POST':
            body=req.post_data_json;writes.append({'path':path,'action':body['action']})
            assert state['role']=='recovery' and body['action']=='reveal'
            data={'id':body['id'],'password':f'QA-synthetic-value-{state["version"]}','revision':str(state['version'])}
            route.fulfill(json={'status':'success','data':data});return
        if path=='/api/auth/password' and req.method=='PATCH':
            body=req.post_data_json;assert body['new_password']==body['confirmation'];writes.append({'path':path,'action':'self-change'})
            route.fulfill(json={'status':'success','data':{'changed_at':'2026-10-25T06:00:00Z'}});return
        unexpected.append(req.method+' '+path);route.abort();return
    if path=='/api/auth/accounts':
        branch=query.get('store_id',['all'])[0];reads.append(branch)
        data=[row for row in rows() if branch=='all' or str(row['store_id'])==branch and not row['scope_all']]
    elif path in ('/api/auth/stores','/api/auth/store-directory'):data=stores
    elif path=='/api/auth/gps':data={'devices':[],'events':[]}
    elif path=='/api/session':route.fulfill(json={'user':{'name':'QA'}});return
    elif path.startswith('/api/auth/'):data=[]
    else:unexpected.append(req.method+' '+path);route.abort();return
    route.fulfill(json={'status':'success','data':data})

with sync_playwright() as pw:
    for engine,width in [('chromium',1440),('webkit',390)]:
        browser=getattr(pw,engine).launch()
        for role in ['recovery','admin','staff']:
            state.update(role=role,version=1)
            ctx=browser.new_context(viewport={'width':width,'height':1000},timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
            ctx.add_cookies([{'name':'himoto_management_session','value':tokens[role],'url':a.url,'httpOnly':True,'sameSite':'Strict'}])
            ctx.route('**/api/**',mock)
            ctx.add_init_script("""const originalFetch=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/auth/payment-events')return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return originalFetch.call(this,input,options);};""")
            page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(a.url+('/vehicles' if role=='staff' else '/accounts'),wait_until='networkidle',timeout=120000)
            if role!='staff':
                table=page.get_by_role('region',name='Danh sách tài khoản',exact=True) if width>767 else page.get_by_role('list',name='Danh sách tài khoản trên điện thoại',exact=True)
                records=table.locator('tbody tr' if width>767 else '.mg-reminder-card');expect(records).to_have_count(3)
                page.get_by_label('Cơ sở đang xem',exact=True).select_option('33')
                expect(records).to_have_count(1);expect(table).to_contain_text('Nhân viên Hà Đông QA');expect(table).not_to_contain_text('Nhân viên Láng QA');expect(table).not_to_contain_text('Tài khoản toàn hệ thống QA');assert '33' in reads
                assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
                if role=='recovery':
                    expect(table.get_by_role('columnheader',name='Mật khẩu',exact=True) if width>767 else table.get_by_text('Mật khẩu',exact=True)).to_be_visible()
                    assert 'QA-synthetic-value-' not in page.locator('body').inner_text()
                    table.get_by_role('button',name='Hiện mật khẩu qa.hadong',exact=True).click();expect(table.locator('code')).to_have_text('QA-synthetic-value-1')
                    state['version']=2;page.clock.install(time=datetime.now(timezone.utc));page.clock.fast_forward(16000)
                    expect(table.locator('code')).to_have_text('••••••••')
                    table.get_by_role('button',name='Hiện mật khẩu qa.hadong',exact=True).click();expect(table.locator('code')).to_have_text('QA-synthetic-value-2')
                    table.get_by_role('button',name='Ẩn mật khẩu qa.hadong',exact=True).click()
                    expect(table.get_by_role('button',name='Đặt lại mật khẩu',exact=True)).to_have_count(0)
                    page.screenshot(path=str(out/f'{engine}-branch-recovery.png'),full_page=True)
                    checks.append(f'{engine}: Hà Đông filter applies; only the authorized identity can view; employee changes update the displayed password and no reset control exists')
                else:
                    expect(table.get_by_role('columnheader',name='Mật khẩu',exact=True) if width>767 else table.get_by_text('Mật khẩu',exact=True)).to_have_count(0)
                    expect(table.get_by_role('button',name='Đặt lại mật khẩu',exact=True)).to_have_count(0)
                    table.get_by_role('button',name='Phân quyền',exact=True).click()
                    dialog=page.get_by_role('dialog',name='Cập nhật tài khoản',exact=True)
                    expect(dialog.locator('#account-password')).to_have_count(0)
                    dialog.get_by_role('button',name='Hủy',exact=True).click()
                    checks.append(f'{engine}: another administrator has branch filtering and permission editing, with no password view/reset controls')
            page.get_by_label('Menu người dùng',exact=True).click()
            page.get_by_role('button',name='Đổi mật khẩu của tôi',exact=True).click()
            dialog=page.get_by_role('dialog',name='Đổi mật khẩu của tôi',exact=True)
            dialog.get_by_label('Mật khẩu hiện tại',exact=True).fill('QA-only-current')
            dialog.get_by_label('Mật khẩu mới',exact=True).fill('QA-only-new-strong')
            dialog.get_by_label('Nhập lại mật khẩu mới',exact=True).fill('QA-only-new-strong')
            expect(dialog.get_by_label('Mật khẩu mới',exact=True)).to_have_attribute('type','password')
            dialog.get_by_role('button',name='Lưu mật khẩu mới',exact=True).click();expect(dialog).not_to_be_visible()
            checks.append(f'{engine}: {role} can use own-password dialog without account-management privileges')
            page.wait_for_load_state('networkidle');ctx.unroute_all(behavior='wait');ctx.close()
        browser.close()
assert not errors,errors
assert not unexpected,unexpected
result={'passed':len(checks),'checks':checks,'javascriptErrors':errors,'unexpectedRequests':unexpected,'mockedWrites':len(writes),'realBusinessWrites':0,'passwordsPrinted':False}
(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2))
