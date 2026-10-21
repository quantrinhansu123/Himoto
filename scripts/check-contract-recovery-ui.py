"""Reservation continuation UI; all writes and provider APIs are intercepted."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

parser=argparse.ArgumentParser()
parser.add_argument('--url',default='http://127.0.0.1:3018')
parser.add_argument('--session-cookie-file',required=True)
parser.add_argument('--output',default='.backups/contract-issues-20261021/ui')
args=parser.parse_args()
out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
checks,errors,writes=[],[],[]
state={}
customer=dict(id=77,name='Khách cọc QA',phone='0900000077',id_card='001234567877',status=1,store_id=33)
vehicle=dict(id=245,name='Airblade QA',license='QA-141.53',brand='Honda',type='xega',status='ready',store_id=23,current_store_id=23,store_name='CS Giáp Bát',available=True,rental_blockers=[])
reservation=dict(id=900,contract_number='QA-COC-900',order_status='deposit_contract',store_id=33,customer_id=77,customer_name=customer['name'],customer_phone=customer['phone'],customer_id_card=customer['id_card'],
                 rental_type='daily',start_date='2026-10-21T02:00:00Z',end_date='2026-10-22T02:00:00Z',signed_on='2026-10-21',created_at='2026-10-21T01:00:00Z',total_amount=300000,paid_amount=100000,deposit_amount=0,draft_revision='7',vehicles=[vehicle])

def mock(route):
    req=route.request;path=urlparse(req.url).path
    if path=='/api/auth/gps/refresh':
        route.fulfill(json=dict(status='success',data=dict(cached=True,refreshed=False)));return
    if path.startswith('/api/auth/record-photos/'):
        route.fulfill(json=dict(status='success',data=dict(copied=0) if req.method=='POST' else []));return
    if req.method not in ('GET','HEAD'):
        body=req.post_data_json;writes.append(dict(path=path,method=req.method,body=body))
        assert path=='/api/auth/order/car-rental/900/profile', path
        assert req.method=='PATCH' and body['revision']=='7'
        assert body['profile']['customer']['name']=='Khách cọc QA'
        assert 'total_amount' not in body['profile'] and 'paid_amount' not in body['profile']
        state['saved']=True
        route.fulfill(json=dict(status='success',data=dict(revision='8')));return
    if path=='/api/auth/stores':data=[dict(id=33,store_name='CS Hà Đông',status='opening')]
    elif path=='/api/auth/store-directory':data=[dict(id=33,store_name='CS Hà Đông',status='opening'),dict(id=23,store_name='CS Giáp Bát',status='opening')]
    elif path in ('/api/auth/contract-staff','/api/auth/hr/staff'):data=[]
    elif path=='/api/auth/order/car-rental':data=[reservation]
    elif path=='/api/auth/order/car-rental/900/payments':data=dict(id=900,code='QA-COC-900',status='deposit_contract',revision='8' if state.get('saved') else '7',store_id=33,total_amount=300000,paid_amount=100000,remaining=200000,
           deposit_paid=0,deposit_refunded=0,deposit_held=0,company_paid_amount=0,company_payment_count=0,accounts=[],history=[],items=[dict(item_id=1001,vehicle_id=245,name='Airblade QA',license='QA-141.53')],end_date='2026-10-22T02:00:00Z')
    elif path in ('/api/auth/vehicle/vehicles','/api/auth/vehicles/inventory'):data=[vehicle]
    elif path=='/api/auth/customers/search':data=[customer]
    elif path=='/api/auth/gps':data=dict(devices=[],events=[])
    elif path=='/api/auth/order/car-rental/900/history':data=dict(changes=[],cashflow=[])
    elif path.startswith('/api/auth/record-photos/'):data=[]
    elif path in ('/api/auth/payment-events','/api/auth/staff-sales/staff','/api/auth/contract-sales-staff','/api/auth/customers'):data=[]
    elif path=='/api/session':
        route.fulfill(json=dict(user=dict(name='QA')));return
    elif mock_contract_type_read(route):return
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as p:
    for engine,viewport in [(p.chromium,dict(width=1440,height=1000)),(p.webkit,dict(width=390,height=844))]:
        state.clear();browser=engine.launch();ctx=browser.new_context(viewport=viewport,timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
        ctx.add_cookies([dict(name='himoto_management_session',value=Path(args.session_cookie_file).read_text().strip(),url=args.url,httpOnly=True,sameSite='Strict')])
        ctx.route('**/api/**',mock);page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(args.url+'/contracts',wait_until='domcontentloaded',timeout=120000)
        menu=page.locator('button.mg-row-menu-trigger').filter(visible=True).first
        menu.click(timeout=60000)
        page.get_by_role('menuitem',name='Bổ sung hồ sơ / Tiếp tục hợp đồng cọc',exact=True).click()
        dialog=page.get_by_role('dialog',name='Bổ sung hồ sơ hợp đồng cọc',exact=True)
        expect(dialog).to_be_visible(timeout=60000)
        advance=dialog.get_by_role('button',name='Tiếp tục giao xe',exact=True)
        expect(advance).to_be_disabled()
        save=dialog.get_by_role('button',name='Lưu hồ sơ hợp đồng',exact=True)
        expect(save).to_be_enabled()
        save.click()
        expect(dialog.get_by_text('Đã lưu hồ sơ, ảnh',exact=False)).to_be_visible(timeout=30000)
        expect(advance).to_be_enabled()
        dialog.screenshot(path=str(out/f'continue-reservation-{engine.name}.png'))
        checks.append(engine.name+': existing reservation opens full profile, requires save, and updates only profile without receiving money again')
        advance.click()
        handover=page.get_by_role('dialog',name='Giao xe đã đặt cọc',exact=True)
        expect(handover).to_be_visible(timeout=30000)
        expect(handover.get_by_text('Đã trả trước',exact=True)).to_be_visible()
        expect(handover.get_by_role('button',name='Xác nhận giao xe',exact=True)).to_be_enabled()
        handover.screenshot(path=str(out/f'handover-preserves-advance-{engine.name}.png'))
        assert len([w for w in writes if w['path'].endswith('/handover')])==0
        checks.append(engine.name+': continuation reaches explicit handover with prior advance preserved; QA never confirms delivery')
        handover.get_by_role('button',name='Đóng',exact=True).click()
        menu.click();page.get_by_role('menuitem',name='Xem chi tiết',exact=True).click()
        detail=page.get_by_role('dialog',name='Chi tiết hợp đồng:',exact=False)
        expect(detail.get_by_role('button',name='Bổ sung hồ sơ hợp đồng cọc',exact=True)).to_be_visible()
        expect(detail.get_by_role('button',name='Giao xe đã đặt cọc',exact=True)).to_be_visible()
        checks.append(engine.name+': detail exposes both profile continuation and explicit handover')
        ctx.close();browser.close()
assert not errors,errors
result=dict(passed=len(checks),checks=checks,errors=errors,simulatedWrites=len(writes),realBusinessWrites=0,realTelegramMessages=0)
(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
