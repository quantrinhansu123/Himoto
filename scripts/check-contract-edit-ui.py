"""Issued-contract editing. All browser APIs are mocked; no business/provider writes."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

parser=argparse.ArgumentParser()
parser.add_argument('--url',default='http://127.0.0.1:3022')
parser.add_argument('--sessions',default='.backups/contract-edit-20261024/sessions')
parser.add_argument('--output',default='.backups/contract-edit-20261024/ui')
args=parser.parse_args()
out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
profiles={p['role']:p for p in json.loads(Path(args.sessions,'profiles.json').read_text())}
checks,errors,writes=[],[],[]
state={}

def records():
    return [dict(id=900,contract_number=state.get('code','005986'),status='renting',store_id=state['store'],store_name='Cơ sở QA',customer_id=77,
        customer_name='Khách QA sửa HĐ',customer_phone='0900000077',customer_id_card='001234567890',customer_address='Địa chỉ QA',
        total_amount=180000,paid_amount=180000,deposit_amount=1000000,rental_type='daily',start_date='2026-10-24T09:00:00+07:00',end_date='2026-10-26T09:00:00+07:00',
        created_at='2026-10-24T09:00:00+07:00',signed_on='2026-10-24',notes='Ghi chú gốc',draft_revision=state.get('revision','7'),vehicles=[])]

def mock(route):
    req=route.request;parsed=urlparse(req.url);path=parsed.path
    if path=='/api/auth/gps/refresh':
        route.fulfill(json=dict(status='success',data=dict(cached=True,refreshed=False)));return
    if req.method not in ('GET','HEAD'):
        assert path=='/api/auth/order/car-rental/900/profile',path
        body=req.post_data_json;writes.append(body)
        assert req.method=='PATCH' and body['revision']==state.get('revision','7')
        assert set(body)=={'revision','profile','contract_number','notes'}
        assert 'total_amount' not in body['profile'] and 'store_id' not in body['profile']
        if state.get('conflict'):
            route.fulfill(status=409,json=dict(status='error',message='Số hợp đồng đã được sử dụng. Kiểm tra số HĐ giấy trước khi lưu.'));return
        state['code']=body['contract_number'].strip();state['revision']='8'
        route.fulfill(json=dict(status='success',data=dict(revision='8',code=state['code'])));return
    if path=='/api/auth/order/car-rental':
        data=records()
        if state.get('foreign'):
            # Deliberately expose a foreign row to verify UI guards independently of RLS.
            rows=[dict(**row,code=row['contract_number'],name=row['contract_number']) for row in data]
            rows[0]['store_id']=state['store']+1
            route.fulfill(json=dict(status='success',data=dict(rows=rows,total=1,scopeCount=1,tabCount=1,page=1,pages=1,statusCounts=[['renting',1]],statuses=['renting'],summary=None,dueCount=0)));return
    elif path in ('/api/auth/stores','/api/auth/store-directory'):data=[dict(id=state['store'],store_name='Cơ sở QA',status='opening')]
    elif path in ('/api/auth/hr/staff','/api/auth/contract-staff','/api/auth/customers','/api/auth/vehicle/vehicles','/api/auth/vehicles/inventory'):data=[]
    elif path=='/api/auth/gps':data=dict(devices=[],events=[])
    elif path.endswith('/history'):data=dict(changes=[],cashflow=[])
    elif path.endswith('/telegram'):data=dict(events=[],auto_enabled=False)
    elif path=='/api/session':route.fulfill(json=dict(user=dict(name='QA')));return
    elif mock_contract_type_read(route):return
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as p:
    for role,engine,width,height,foreign in [('branch_staff',p.chromium,1440,1000,False),('branch_staff',p.webkit,390,844,False),('ownership_staff',p.chromium,1440,1000,False),('accounting',p.chromium,1440,1000,False),('admin',p.chromium,1440,1000,False),('branch_staff',p.chromium,1440,1000,True)]:
        state.clear();state['store']=profiles[role]['store_id'] or 23;state['foreign']=foreign
        browser=engine.launch();ctx=browser.new_context(viewport=dict(width=width,height=height),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
        ctx.add_cookies([dict(name='himoto_management_session',value=Path(args.sessions,f'session-{role}.txt').read_text().strip(),url=args.url,httpOnly=True,sameSite='Strict')])
        ctx.route('**/api/**',mock);page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        try:
            page.goto(args.url+'/contracts',wait_until='domcontentloaded',timeout=120000)
            menu=page.locator('button.mg-row-menu-trigger').filter(visible=True).first
            menu.click(timeout=60000)
            edit=page.get_by_role('menuitem',name='Sửa hợp đồng',exact=True)
            if role=='accounting' or foreign:
                expect(edit).to_have_count(0)
                page.get_by_role('menuitem',name='Xem chi tiết',exact=True).click()
                expect(page.get_by_role('dialog')).to_be_visible(timeout=30000)
                expect(page.get_by_role('button',name='Sửa hợp đồng',exact=True)).to_have_count(0)
                checks.append(f'{role}: edit hidden in both list and detail'+(' for a foreign contract even when returned by the list API' if foreign else ''));continue
            expect(edit).to_be_visible();edit.click()
            dialog=page.get_by_role('dialog',name='Sửa hợp đồng',exact=True)
            number=dialog.get_by_label('Số HĐ giấy *',exact=True)
            expect(number).to_have_value('005986',timeout=30000)
            number.fill('');dialog.get_by_role('button',name='Lưu hợp đồng',exact=True).click()
            expect(number).to_be_focused();expect(dialog.get_by_text('Nhập số HĐ giấy, không dùng mã NHAP-/EXCEL-.',exact=True)).to_be_visible()
            state['conflict']=True;number.fill('005987');dialog.get_by_role('button',name='Lưu hợp đồng',exact=True).click()
            expect(dialog.get_by_role('alert')).to_contain_text('Số hợp đồng đã được sử dụng')
            expect(number).to_have_value('005987')
            expect(dialog.get_by_label('Tên khách hàng',exact=True)).to_have_value('Khách QA sửa HĐ')
            dialog.get_by_label('Tên khách hàng',exact=True).fill('Tên khách đã sửa')
            dialog.get_by_label('Ghi chú hợp đồng',exact=True).fill('Sửa theo số trên HĐ giấy')
            dialog.screenshot(path=str(out/f'edit-{role}-{engine.name}-{width}.png'))
            assert dialog.evaluate('(d)=>d.scrollWidth<=d.clientWidth+2'),'Dialog overflows horizontally'
            state['conflict']=False;dialog.get_by_role('button',name='Lưu hợp đồng',exact=True).click()
            expect(dialog).to_have_count(0,timeout=30000)
            expect(page.get_by_text('Đã lưu hợp đồng 005987.',exact=True)).to_be_visible(timeout=30000)
            assert writes[-1]['contract_number']=='005987' and writes[-1]['profile']['customer']['name']=='Tên khách đã sửa'
            assert writes[-1]['notes']=='Sửa theo số trên HĐ giấy'
            menu.click();page.get_by_role('menuitem',name='Xem chi tiết',exact=True).click()
            button=page.get_by_role('button',name='Sửa hợp đồng',exact=True)
            expect(button).to_be_visible(timeout=30000);button.click()
            nested=page.get_by_role('dialog',name='Sửa hợp đồng',exact=True)
            expect(nested.get_by_label('Số HĐ giấy *',exact=True)).to_have_value('005987')
            nested.get_by_role('button',name='Đóng',exact=True).click()
            checks.append(f'{role} {engine.name} {width}px: list and detail edit work, blank/duplicate numbers retain input, correction submits only profile fields and refreshes the list')
        except Exception:
            page.screenshot(path=str(out/f'failure-{role}-{engine.name}-{width}.png'),full_page=True)
            raise
        finally:ctx.close();browser.close()
assert not errors,errors
print(json.dumps(dict(passed=len(checks),checks=checks,profile_requests=len(writes),real_business_writes=0,real_provider_requests=0),ensure_ascii=False,indent=2))
