"""Contract counters and employee/account flows. All application API writes are fixtures."""
import argparse, copy, json, re
from pathlib import Path
from urllib.parse import urlparse
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3017');p.add_argument('--sessions',default='.backups/staff-accounts-20261024');p.add_argument('--output',default='.backups/staff-accounts-20261024/ui');a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True);expect.set_options(timeout=30000)
state={};checks=[];errors=[];posts=[];unexpected=[];now=datetime.now(timezone(timedelta(hours=7)))
credential=dict(login_name='nv.qa.generated',password='QA-only-generated-password-2026',enabled=True)

def account_rows():
    store=35 if state['role']=='manager' else 32
    rows=[dict(id=901,name='Nhân sự QA',email='qa@example.invalid',login_name='nv.qa',access_role='ownership_staff' if store==35 else 'branch_staff',store_id=store,store_name='CS QA',scope_all=False,permissions=['contracts.read','customers.read','vehicles.read'],enabled=True,status='active',revision='1',staff_id=901,staff_code='NV0901',can_edit=True,can_delete=True)]
    if state.get('deleted'):rows=[]
    if state.get('created'):rows.append(dict(rows[0] if rows else {},id=905,name='Tài khoản mới QA',email='new@qa.invalid',login_name=credential['login_name'],access_role='branch_staff',store_id=store,store_name='CS QA',scope_all=False,enabled=True,status='active',revision='2',can_edit=True,can_delete=True))
    rows.append(dict(id=157 if state['role']=='manager' else 145,name='Quản lý QA',email='manager@qa.invalid',login_name='ql.qa',access_role='ownership_manager' if state['role']=='manager' else 'admin',store_id=store if state['role']=='manager' else None,store_name='CS QA',scope_all=state['role']!='manager',enabled=True,status='active',revision='1',can_edit=state['role']!='manager',can_delete=False))
    return rows

def mock(route):
    if mock_contract_type_read(route):return
    req=route.request;path=urlparse(req.url).path
    if req.method not in ('GET','HEAD'):
        body=req.post_data_json;posts.append(dict(path=path,method=req.method,body=copy.deepcopy(body)))
        if path=='/api/auth/accounts':
            if req.method=='POST':
                assert body['login_name']=='' and body['password']=='';assert body['store_id']==(35 if state['role']=='manager' else 32);assert not body['scope_all'];state['created']=True
                route.fulfill(json=dict(status='success',data=dict(id=905,credentials=credential)));return
            if req.method=='PATCH':assert body['id']==901 and body['revision']=='1';route.fulfill(json=dict(status='success',data=dict(id=901)));return
            if req.method=='DELETE':
                assert body==dict(id=901,revision='1')
                if not state.get('delete_denied'):state['delete_denied']=True;route.fulfill(status=409,json=dict(status='error',message='Tài khoản đã thay đổi. Tải lại rồi thao tác.'));return
                state['deleted']=True;route.fulfill(json=dict(status='success',data=dict(id=901)));return
        if path=='/api/auth/hr/staff' and req.method=='POST':
            assert body['name']=='Nhân sự mới QA' and body['store_id']==32;assert 'password' not in body and 'permissions' not in body;state['staff_created']=True
            route.fulfill(status=201,json=dict(status='success',data=dict(id=902,staff_code='NV0902',credentials=credential)));return
        unexpected.append(req.method+' '+path);route.abort();return
    if path=='/api/auth/accounts':data=account_rows()
    elif path in ('/api/auth/stores','/api/auth/store-directory'):data=[dict(id=32,store_name='CS QA',status='opening'),dict(id=35,store_name='CS Sở hữu QA',status='opening',kind='lease_to_own')]
    elif path=='/api/auth/hr/staff':
        data=[dict(id=901,staff_code='NV0901',full_name='Nhân sự QA',phone='0900000001',position='NVKD',status='active',store_id=32)]
        if state.get('staff_created'):data.append(dict(id=902,staff_code='NV0902',full_name='Nhân sự mới QA',phone='0900000002',position='NVKD',status='active',store_id=32))
    elif path=='/api/auth/order/car-rental':
        data=[]
        for id,status,amount in [(901,'overdue',100000),(902,'bad_debt',900000),(903,'renting',200000),(904,'reserved',300000)]:
            data.append(dict(id=id,contract_number=f'QA-{id}',order_status=status,order_type='daily',store_id=32,store_name='CS QA',customer_name=f'Khách QA {id}',total_amount=amount,paid_amount=0,start_date=(now-timedelta(days=20)).isoformat(),end_date=(now+timedelta(days=5) if status=='renting' else now-timedelta(days=5)).isoformat(),bad_debt_at=(now-timedelta(days=2)).isoformat() if status=='bad_debt' else None,vehicles=[]))
    elif path=='/api/auth/gps':data=dict(devices=[],events=[])
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as pw:
 for engine,width,height in [('chromium',1440,1000),('webkit',390,844)]:
  browser=getattr(pw,engine).launch()
  for role in ('admin','manager','staff'):
   state.clear();state['role']=role
   ctx=browser.new_context(viewport=dict(width=width,height=height),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
   ctx.add_init_script("""const qaFetch=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/auth/payment-events')return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return qaFetch.call(this,input,options);};""")
   ctx.add_cookies([dict(name='himoto_management_session',value=(Path(a.sessions)/f'session-{role}.txt').read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
   page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(a.url+'/accounts',wait_until='networkidle',timeout=120000)
   if role=='staff':
    expect(page.get_by_role('heading',name='Không có quyền truy cập',exact=True)).to_be_visible();expect(page.get_by_role('button',name='Tạo tài khoản',exact=True)).to_have_count(0)
    checks.append(dict(browser=engine,role=role,case='account-ui-denied'));ctx.close();continue
   table=page.get_by_role('region',name='Danh sách tài khoản',exact=True);expect(table).to_contain_text('nv.qa')
   if role=='manager':expect(table.get_by_role('button',name='Phân quyền / Đổi mật khẩu',exact=True).last).to_be_disabled()
   table.get_by_role('button',name='Phân quyền / Đổi mật khẩu',exact=True).first.click()
   dialog=page.get_by_role('dialog',name='Cập nhật tài khoản',exact=True)
   if role=='manager':
    expect(dialog.get_by_label('Cơ sở được phân quyền',exact=True)).to_be_disabled();expect(dialog.locator('#account-role option[value="admin"]')).to_have_count(0);expect(dialog.get_by_label('Quản lý tài khoản và phân quyền',exact=True)).to_be_disabled()
   dialog.get_by_label('Tên hiển thị',exact=True).fill('Nhân sự sửa QA');dialog.get_by_role('button',name='Lưu tài khoản',exact=True).click();expect(dialog).to_have_count(0)
   checks.append(dict(browser=engine,role=role,case='scoped-edit-controls'))
   page.get_by_role('button',name='Tạo tài khoản',exact=True).click();dialog=page.get_by_role('dialog',name='Tạo tài khoản',exact=True);dialog.get_by_label('Tên hiển thị',exact=True).fill('Tài khoản mới QA')
   if role=='admin':dialog.get_by_label('Cơ sở được phân quyền',exact=True).select_option('32')
   dialog.get_by_role('button',name='Lưu tài khoản',exact=True).click();issued=page.get_by_role('dialog',name='Tài khoản nhân sự vừa tạo',exact=True);expect(issued.get_by_label('Tài khoản',exact=True)).to_have_value(credential['login_name']);expect(issued.get_by_label('Mật khẩu đã sinh',exact=True)).to_have_value(credential['password']);page.screenshot(path=str(out/f'{engine}-{role}-credentials.png'));issued.get_by_role('button',name='Đóng',exact=True).click();expect(page.get_by_label('Mật khẩu đã sinh',exact=True)).to_have_count(0)
   checks.append(dict(browser=engine,role=role,case='auto-credentials-once'))
   table.locator('tr').filter(has_text='nv.qa').first.get_by_role('button',name='Xóa tài khoản',exact=True).click();dialog=page.get_by_role('dialog',name='Xóa tài khoản?',exact=True);dialog.get_by_role('button',name='Xác nhận xóa tài khoản',exact=True).click();expect(dialog.get_by_role('alert')).to_contain_text('Tài khoản đã thay đổi');dialog.get_by_role('button',name='Xác nhận xóa tài khoản',exact=True).click();expect(dialog).to_have_count(0);expect(table.get_by_role('cell',name='nv.qa',exact=True)).to_have_count(0)
   checks.append(dict(browser=engine,role=role,case='delete-conflict-and-retry'))
   if role=='admin':
    page.goto(a.url+'/staff',wait_until='networkidle',timeout=120000);page.get_by_role('button',name='Thêm nhân sự',exact=True).click();dialog=page.get_by_role('dialog',name='Thêm nhân sự',exact=True)
    dialog.locator('#staff-name').fill('Nhân sự mới QA');dialog.locator('#staff-phone').fill('0900000002');dialog.get_by_label('Cơ sở',exact=True).select_option('32');dialog.get_by_role('button',name='Thêm nhân sự',exact=True).click();issued=page.get_by_role('dialog',name='Tài khoản nhân sự vừa tạo',exact=True);expect(issued.get_by_label('Tài khoản',exact=True)).to_have_value(credential['login_name']);issued.get_by_role('button',name='Đóng',exact=True).click()
    checks.append(dict(browser=engine,role=role,case='employee-and-generated-login'))
    page.goto(a.url+'/contracts',wait_until='networkidle',timeout=120000);tabs=page.locator('.mg-status-tabs');expect(tabs.get_by_role('button',name=re.compile(r'^Tất cả'))).to_contain_text('4');expect(tabs.get_by_role('button',name=re.compile(r'^Đang thuê'))).to_contain_text('2');expect(tabs.get_by_role('button',name=re.compile(r'^Nợ xấu'))).to_contain_text('1');expect(tabs.get_by_role('button',name=re.compile(r'^Bảo lưu'))).to_contain_text('1')
    page.get_by_text('Thống kê & thông tin thêm',exact=True).click();metrics=page.locator('.mg-contract-metrics');expect(metrics.locator('div').filter(has=page.get_by_text('Tổng tiền',exact=True))).to_contain_text('600.000');expect(metrics.locator('div').filter(has=page.get_by_text('Nợ xấu',exact=True))).to_contain_text('900.000')
    tabs.get_by_role('button',name=re.compile(r'^Quá hạn')).click();expect(metrics.locator('div').filter(has=page.get_by_text('Tổng tiền',exact=True))).to_contain_text('100.000');page.screenshot(path=str(out/f'{engine}-contract-counts.png'));checks.append(dict(browser=engine,role=role,case='contract-counters-and-separated-summary'))
   assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
   ctx.unroute_all(behavior='ignoreErrors');ctx.close()
  browser.close()
assert not errors,errors
assert not unexpected,unexpected
report=dict(passed=len(checks),checks=checks,javascriptErrors=errors,interceptedMutations=len(posts),realBusinessWrites=0,passwordsReal=False)
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False))
