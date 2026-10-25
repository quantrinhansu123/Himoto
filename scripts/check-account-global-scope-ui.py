"""Account scope selector on desktop and iPhone. All business requests are mocked."""
import argparse,json
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3035');p.add_argument('--sessions-file',required=True);p.add_argument('--output',default='.backups/account-global-scope-20261025/ui');a=p.parse_args()
tokens=json.loads(Path(a.sessions_file).read_text());out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
expect.set_options(timeout=20000)
checks=[];errors=[];unexpected=[];writes=[];state={}
permissions=['contracts.read','customers.read']
stores=[dict(id=32,store_name='CS Nguyễn Hoàng QA',kind='physical',status='opening'),dict(id=35,store_name='CS Thuê sở hữu QA',kind='lease_to_own',status='opening')]
def account(id,role,store):return dict(id=id,name='Nhân sự QA '+str(id),email='qa'+str(id)+'@example.invalid',login_name='qa'+str(id),access_role=role,store_id=store,scope_all=False,permissions=permissions,enabled=True,status='active',store_name=stores[store==35]['store_name'],revision='1',can_edit=True,can_delete=False)

def mock(route):
    req=route.request;url=urlparse(req.url);path=url.path
    if req.method not in ('GET','HEAD'):
        if path=='/api/auth/accounts' and req.method=='PATCH':
            body=req.post_data_json
            assert state['actor']=='admin'
            assert body['permissions']==permissions and body['password']=='' and body['id']==901
            assert body['access_role']==state['record']['access_role']
            expected=state['expected'];assert body['scope_all']==expected['scope_all'] and body['store_id']==expected['store'],body
            state['record'].update(scope_all=body['scope_all'],store_id=body['store_id'])
            writes.append(dict(role=body['access_role'],scope_all=body['scope_all'],store_id=body['store_id']))
            route.fulfill(json=dict(status='success',data=dict(id=901)));return
        unexpected.append(req.method+' '+path);route.abort();return
    if path=='/api/auth/accounts':
        record=state['record'].copy()
        if state['actor']=='manager':record.update(access_role='branch_staff',store_id=32,scope_all=False)
        selected=parse_qs(url.query).get('store_id',['all'])[0]
        data=[record] if selected=='all' or not record['scope_all'] and str(record['store_id'])==selected else []
    elif path in ('/api/auth/stores','/api/auth/store-directory'):data=stores if state['actor']=='admin' else [stores[0]]
    elif path=='/api/session':route.fulfill(json=dict(user=dict(name='QA')));return
    elif path=='/api/auth/gps':data=dict(devices=[],events=[])
    elif path.startswith('/api/auth/'):data=[]
    else:unexpected.append(req.method+' '+path);route.abort();return
    route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as pw:
    for engine,width,height in [('chromium',1440,1000),('webkit',390,844)]:
        browser=getattr(pw,engine).launch()
        for actor in ['admin','manager']:
            state.update(actor=actor,record=account(901,'branch_manager',32))
            ctx=browser.new_context(viewport=dict(width=width,height=height),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
            ctx.add_cookies([dict(name='himoto_management_session',value=tokens[actor],url=a.url,httpOnly=True,sameSite='Strict')])
            ctx.route('**/api/**',mock)
            ctx.add_init_script("""const original=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(['/api/auth/payment-events','/api/auth/gps/refresh'].includes(url.pathname))return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return original.call(this,input,options);};""")
            page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(a.url+'/accounts',wait_until='networkidle',timeout=120000)
            if actor=='manager':
                expect(page.get_by_role('link',name='Tài khoản & Phân quyền',exact=True)).to_have_count(0)
                expect(page.get_by_role('heading',name='Không có quyền truy cập',exact=True)).to_be_visible()
                expect(page.get_by_role('button',name='Phân quyền',exact=True)).to_have_count(0)
                checks.append(f'{engine}: branch manager has no account menu or editor even when opening /accounts directly')
                ctx.close();continue
            container=page.get_by_role('region',name='Danh sách tài khoản',exact=True) if width>767 else page.get_by_role('list',name='Danh sách tài khoản trên điện thoại',exact=True)
            def edit():
                container.get_by_role('button',name='Phân quyền',exact=True).click()
                dialog=page.get_by_role('dialog',name='Cập nhật tài khoản',exact=True)
                expect(dialog).to_be_visible();return dialog
            if actor=='admin':
                for role in ['branch_manager','branch_staff','ownership_manager','ownership_staff']:
                    state['record']=account(901,role,35 if role.startswith('ownership_') else 32)
                    with page.expect_response(lambda r:urlparse(r.url).path=='/api/auth/accounts' and r.request.method=='GET'):
                        page.get_by_role('button',name='Làm mới',exact=True).click()
                    label={'branch_manager':'Quản lý cơ sở','branch_staff':'Nhân viên cơ sở','ownership_manager':'Quản lý thuê sở hữu','ownership_staff':'Nhân viên thuê sở hữu'}[role]
                    expect(container).to_contain_text(label);dialog=edit()
                    expect(dialog.get_by_label('Vai trò',exact=True)).to_have_value(role)
                    expect(dialog.get_by_role('checkbox',name='Quản lý tài khoản và phân quyền',exact=True)).to_have_count(0)
                    scope=dialog.get_by_label('Cơ sở được phân quyền',exact=True)
                    expect(scope).to_have_value(str(state['record']['store_id']))
                    scope.select_option('all');expect(scope).to_have_value('all')
                    expect(dialog.locator('#account-scope-help')).to_contain_text('theo các quyền thao tác đã chọn')
                    assert not dialog.evaluate('el=>el.scrollWidth>el.clientWidth')
                    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
                    if role=='branch_manager':dialog.screenshot(path=str(out/f'{engine}-{width}-all-branches.png'))
                    state['expected']=dict(scope_all=True,store=None)
                    dialog.get_by_role('button',name='Lưu tài khoản',exact=True).click();expect(dialog).not_to_be_visible()
                    expect(container).to_contain_text('Toàn hệ thống')
                    dialog=edit();scope=dialog.get_by_label('Cơ sở được phân quyền',exact=True);expect(scope).to_have_value('all')
                    store=35 if role.startswith('ownership_') else 32
                    scope.select_option(str(store));state['expected']=dict(scope_all=False,store=store)
                    dialog.get_by_role('button',name='Lưu tài khoản',exact=True).click();expect(dialog).not_to_be_visible()
                    expect(container).not_to_contain_text('Toàn hệ thống')
                checks.append(f'{engine} {width}px: all four staff/manager roles save and reopen all branches, then return to one branch; permissions unchanged and no overflow')
                dialog=edit();dialog.get_by_label('Vai trò',exact=True).select_option('admin')
                scope=dialog.get_by_label('Cơ sở được phân quyền',exact=True);expect(scope).to_have_value('all');expect(scope).to_be_disabled()
                dialog.get_by_role('button',name='Hủy',exact=True).click()
                checks.append(f'{engine}: administrator role retains mandatory global scope')
            ctx.close()
        browser.close()
assert not errors,errors
assert not unexpected,unexpected
assert len(writes)==16,len(writes)
result=dict(passed=len(checks),checks=checks,mockedWrites=len(writes),realAccountChanges=0,browserErrors=errors,unexpectedRequests=unexpected)
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2))
