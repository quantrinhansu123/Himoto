"""Staff transfer feedback and account scope after saving. All business APIs are mocked."""
import argparse,json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3036');p.add_argument('--sessions-file',required=True);p.add_argument('--output',default='.backups/admin-permissions-transfers-20261025/ui-transfers');a=p.parse_args()
token=json.loads(Path(a.sessions_file).read_text())['admin'];out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
expect.set_options(timeout=25000)
stores=[dict(id=32,store_name='CS Nguyễn Hoàng QA',kind='physical',status='opening'),dict(id=35,store_name='CS Thuê sở hữu QA',kind='lease_to_own',status='opening')]
state={};checks=[];writes=[];errors=[];unexpected=[]
def mock(route):
    req=route.request;path=urlparse(req.url).path
    if req.method not in ('GET','HEAD'):
        if path=='/api/auth/hr/staff/601' and req.method=='PATCH':
            body=req.post_data_json;assert body['store_id']==35 and body['position']=='NVKD';assert not any(k in body for k in ['permissions','scope_all','access_role'])
            writes.append(dict(store_id=body['store_id'],rejected=state['reject']))
            if state['reject']:route.fulfill(status=500,json=dict(status='error',message='Không lưu được thay đổi nhân sự.'));return
            state['store']=body['store_id'];route.fulfill(json=dict(status='success',data=dict(credentials=None)));return
        unexpected.append(req.method+' '+path);route.abort();return
    if path in ('/api/auth/stores','/api/auth/store-directory'):data=stores
    elif path in ('/api/auth/hr/staff','/api/auth/contract-staff'):
        data=[dict(id=601,staff_code='QA0601',full_name='Nhân viên điều chuyển QA',phone='0900000601',position='NVKD',store_id=state['store'],store_name=next(s['store_name'] for s in stores if s['id']==state['store']),status='active',user_id=901)]
    elif path=='/api/auth/accounts':data=[dict(id=901,name='Nhân viên điều chuyển QA',email='qa901@example.invalid',login_name='qa901',access_role='branch_staff',store_id=state['store'],store_name=next(s['store_name'] for s in stores if s['id']==state['store']),scope_all=False,permissions=['contracts.read','customers.read'],enabled=True,status='active',revision='2',can_edit=True,can_delete=False)]
    elif path=='/api/auth/gps':data=dict(devices=[],events=[])
    elif path=='/api/session':route.fulfill(json=dict(user=dict(name='QA')));return
    elif path.startswith('/api/auth/'):data=[]
    else:unexpected.append(req.method+' '+path);route.abort();return
    route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as pw:
    for engine,width,height in [('chromium',1440,1000),('webkit',390,844)]:
        state.update(store=32,reject=True)
        browser=getattr(pw,engine).launch();ctx=browser.new_context(viewport=dict(width=width,height=height),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
        ctx.add_cookies([dict(name='himoto_management_session',value=token,url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
        ctx.add_init_script("""const original=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(['/api/auth/payment-events','/api/auth/gps/refresh'].includes(url.pathname))return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return original.call(this,input,options);};""")
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(a.url+'/staff',wait_until='networkidle',timeout=120000)
        page.get_by_role('button',name='Sửa Nhân viên điều chuyển QA',exact=True).click()
        dialog=page.get_by_role('dialog',name='Sửa nhân sự',exact=True)
        expect(dialog.get_by_label('Cơ sở',exact=True)).to_have_value('32')
        expect(dialog.locator('#staff-store-hint')).to_contain_text('tự chuyển quyền truy cập sang cơ sở mới')
        dialog.get_by_label('Cơ sở',exact=True).select_option('35')
        dialog.screenshot(path=str(out/f'{engine}-{width}-transfer.png'))
        dialog.get_by_role('button',name='Lưu nhân sự',exact=True).click()
        expect(dialog.get_by_role('alert')).to_have_text('Không lưu được thay đổi nhân sự.');assert state['store']==32
        state['reject']=False
        dialog.get_by_role('button',name='Lưu nhân sự',exact=True).click();expect(dialog).not_to_be_visible()
        branch=page.locator('.mg-org-card').filter(has=page.get_by_role('heading',name='CS Thuê sở hữu QA',exact=True))
        expect(branch).to_contain_text('Nhân viên điều chuyển QA')
        checks.append(f'{engine} {width}px: staff edit explains account synchronization, retains the form on error, and moves the employee card after saving')
        page.wait_for_load_state('networkidle');page.close()
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(a.url+'/accounts',wait_until='networkidle',timeout=120000)
        container=page.get_by_role('region',name='Danh sách tài khoản',exact=True) if width>767 else page.get_by_role('list',name='Danh sách tài khoản trên điện thoại',exact=True)
        expect(container).to_contain_text('CS Thuê sở hữu QA')
        container.get_by_role('button',name='Phân quyền',exact=True).click();dialog=page.get_by_role('dialog',name='Cập nhật tài khoản',exact=True)
        expect(dialog.get_by_label('Cơ sở được phân quyền',exact=True)).to_have_value('35')
        expect(dialog.get_by_role('checkbox',name='Quản lý tài khoản và phân quyền',exact=True)).to_have_count(0)
        expect(dialog.get_by_role('checkbox',name='Xem hợp đồng',exact=True)).to_be_checked()
        assert not dialog.evaluate('el=>el.scrollWidth>el.clientWidth')
        checks.append(f'{engine}: account editor reads the new branch with existing operation grants and no delegable account-management checkbox')
        ctx.close();browser.close()
assert not errors,errors
assert not unexpected,unexpected
result=dict(passed=len(checks),checks=checks,mockedWrites=len(writes),realStaffChanges=0,browserErrors=errors,unexpectedRequests=unexpected)
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2))
