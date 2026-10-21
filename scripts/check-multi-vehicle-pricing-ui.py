"""Multi-vehicle pricing regressions; every API write is intercepted."""
import argparse, copy, json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3018');p.add_argument('--session-cookie-file',required=True);p.add_argument('--output',default='.backups/multi-vehicle-pricing-20261021/ui');a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True);expect.set_options(timeout=30000)
checks,errors,writes=[],[],[];state={}
customer=dict(id=77,store_id=32,name='Khách hai xe QA',phone='0900000077',id_card='001234567877',status=1,address='Địa chỉ QA')
vehicles=[dict(id=i,store_id=32,current_store_id=32,name='Vision QA '+str(i),license='QA-'+str(i),status='ready',type='xega',available=True,rental_blockers=[]) for i in [100,101]]

def draft():
    d={key:'' for key in ['staff_name','contract_number','signed_on','created_on','store_id','vehicle_store_id','staff_id','start_date','end_date','unit_price','total_amount','paid_amount','deposit_amount','package_name','payment_method','deposit_payment_method','collateral_description','customer_source','customer_source_url','authorization_date']}
    d.update(contract_number='QA-MULTI',signed_on='2026-10-21',created_on='2026-10-21',store_id='32',vehicle_store_id='32',staff_id='700',staff_name='Nhân viên QA',customer_id=77,start_date='2026-10-21T09:00',end_date='2026-10-22T09:00',unit_price='200000',total_amount='250000',paid_amount='0',deposit_amount='1000000',package_name='Theo ngày',extra_charges=[dict(name='Phí ship',amount='50000')],relatives=[dict(name='',relationship='',phone='')]*2,contract_type_id='daily',contract_type_name='Thuê theo ngày',document_requirements=dict(phone=True,id_card=False,address=False,representative=False,relatives=0))
    d['customer']={key:'' for key in ['name','phone','email','address','id_card','id_card_issued_on','id_card_issued_by','driver_license_number','driver_license_issued_on','birthday','relatives_text','warning_note','customer_type','nationality','contact_channel','contact_detail']}
    d['customer'].update({key:customer[key] for key in ['name','phone','id_card','address']})
    d['vehicles']=[]
    for v in vehicles:
        line={key:'' for key in ['id','name','license','brand','type_text','color','year','driver_name','driver_license_number','driver_license_issued_on','rent_at','return_at']}
        line.update(id=str(v['id']),name=v['name'],license=v['license'],borrow_hats='2',borrow_raincoats='2');d['vehicles'].append(line)
    return d

def record():
    return dict(id=901,draft_reference='QA-MULTI',order_status='draft',store_id=32,customer_id=77,customer_name=customer['name'],total_amount=0,paid_amount=0,draft_revision=str(state['revision']),draft_payload=dict(management_composer=dict(version=1,status='draft',rental_type='daily',notes='',draft=state['draft'])))

def mock(route):
    if mock_contract_type_read(route):return
    req=route.request;path=urlparse(req.url).path
    if path=='/api/auth/gps/refresh':route.fulfill(json=dict(status='success',data=dict(cached=True,refreshed=False)));return
    if path.startswith('/api/auth/record-photos/'):
        assert req.method in ['GET','POST'];route.fulfill(json=dict(status='success',data=dict(copied=0) if req.method=='POST' else []));return
    if req.method=='PUT' and path=='/api/auth/order/car-rental/901':
        body=req.post_data_json;writes.append(copy.deepcopy(body));assert body['draft']['total_amount']=='795000';assert len(body['draft']['vehicles'])==2
        state['draft']=body['draft'];state['revision']+=1;route.fulfill(json=dict(status='success',data=record()));return
    assert req.method=='GET',req.method+' '+path
    if path=='/api/auth/order/car-rental':data=[record()]
    elif path=='/api/auth/stores':data=[dict(id=32,store_name='CS QA',status='opening')]
    elif path=='/api/auth/store-directory':data=[dict(id=32,store_name='CS QA',status='opening')]
    elif path in ['/api/auth/contract-staff','/api/auth/hr/staff']:data=[dict(id=700,store_id=32,full_name='Nhân viên QA',status='active')]
    elif path in ['/api/auth/vehicle/vehicles','/api/auth/vehicles/inventory']:data=vehicles
    elif path=='/api/auth/customers':data=[customer]
    elif path=='/api/auth/order/car-rental/901/payments':data=dict(id=901,code='QA-MULTI',status='draft',store_id=32,revision=str(state['revision']),total_amount=795000,paid_amount=0,remaining=795000,deposit_paid=0,deposit_refunded=0,deposit_held=0,accounts=[],history=[],items=[])
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as pw:
    for name,width,height in [('chromium',1440,1000),('webkit',390,844)]:
        state.clear();state.update(draft=draft(),revision=1)
        browser=getattr(pw,name).launch();ctx=browser.new_context(viewport=dict(width=width,height=height),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
        ctx.add_init_script("""const qaFetch=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/auth/payment-events')return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return qaFetch.call(this,input,options);};""")
        ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.session_cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(a.url+'/contracts/drafts',wait_until='networkidle',timeout=120000)
        page.locator('button.mg-row-menu-trigger').filter(visible=True).first.click();page.get_by_role('menuitem',name='Tiếp tục sửa bản nháp',exact=True).click()
        form=page.locator('dialog.mg-contract-composer')
        def tab(label):form.get_by_role('tab',name=label,exact=False).click()
        tab('Chi phí');expect(form.locator('#contract-unit_price')).to_have_value('200.000');expect(form.locator('#contract-rental-base')).to_have_value('400.000');expect(form.locator('#contract-total_amount')).to_have_value('450.000');expect(form.locator('#contract-amount-due')).to_have_value('1.450.000')
        expect(form).to_contain_text('2 xe × 1 ngày × 200.000 đ = 400.000 đ')
        checks.append(name+': old two-vehicle draft recalculates two rents; contract fee and deposit count once')
        tab('Phương tiện');form.get_by_role('button',name='Bỏ xe 2',exact=True).click();tab('Chi phí');expect(form.locator('#contract-total_amount')).to_have_value('250.000')
        tab('Phương tiện');form.get_by_role('button',name='Thêm xe',exact=True).click();tab('Chi phí');expect(form.locator('#contract-total_amount')).to_have_value('250.000')
        tab('Phương tiện');form.locator('#contract-vehicle-1').click();form.locator('#contract-vehicle-1-options-101').click();form.locator('#contract-rental-days').fill('2')
        tab('Chi phí');expect(form.locator('#contract-rental-base')).to_have_value('800.000');form.locator('#contract-unit_price').fill('180000');expect(form.locator('#contract-rental-base')).to_have_value('720.000')
        form.locator('#contract-charge-0-amount').fill('75000');expect(form.locator('#contract-total_amount')).to_have_value('795.000');expect(form.locator('#contract-amount-due')).to_have_value('1.795.000')
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth');form.screenshot(path=str(out/f'{name}-two-vehicle-total.png'))
        checks.append(name+': removing, adding, selecting, changing duration/rate and editing fees immediately update the quote')
        form.get_by_role('button',name='Lưu nháp',exact=True).click();expect(form).to_have_count(0)
        page.wait_for_load_state('networkidle')
        page.reload(wait_until='networkidle')
        page.locator('button.mg-row-menu-trigger').filter(visible=True).first.click();page.get_by_role('menuitem',name='Tiếp tục sửa bản nháp',exact=True).click();form=page.locator('dialog.mg-contract-composer');tab('Chi phí');expect(form.locator('#contract-unit_price')).to_have_value('180.000');expect(form.locator('#contract-total_amount')).to_have_value('795.000')
        form.get_by_role('button',name='Hoàn tất & thanh toán',exact=True).click()
        pay=page.get_by_role('dialog',name='Xác nhận thanh toán · QA-MULTI',exact=True);expect(pay).to_be_visible();expect(pay).to_contain_text('795.000');expect(pay).to_contain_text('1.000.000')
        assert len([w for w in writes if w['draft']['total_amount']=='795000'])>=2
        pay.screenshot(path=str(out/f'{name}-payment-matches-two-vehicles.png'))
        checks.append(name+': saved/reopened draft retains its manual price and corrected total; payment dialog receives that total without a real issue or receipt')
        ctx.unroute_all(behavior='wait');ctx.close();browser.close()
assert not errors,errors
report=dict(passed=len(checks),checks=checks,javascriptErrors=errors,simulatedDraftSaves=len(writes),realBusinessWrites=0,realTelegramRequests=0)
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2))
