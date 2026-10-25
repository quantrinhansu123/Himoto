"""Ownership source/NVKD free text. All business APIs are intercepted."""
import argparse, json, re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser()
p.add_argument('--url',default='http://127.0.0.1:3026')
p.add_argument('--session-cookie-file',required=True)
p.add_argument('--output',default='.backups/contract-manual-source-20261025/ui')
a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
expect.set_options(timeout=15000)
checks=[];errors=[];writes=[];unexpected=[]
state={'record':None,'directory_fail':False}
stores=[{'id':36,'store_name':'CS Thuê sở hữu QA','kind':'lease_to_own','status':'opening'}]
staff=[{'id':7,'full_name':'NVKD trong danh sách QA','position':'NVKD','status':'active','store_id':36}]

def mock(route):
    if mock_contract_type_read(route):return
    req=route.request;path=urlparse(req.url).path
    if path=='/api/auth/gps/refresh':route.fulfill(json={'status':'success'});return
    if req.method=='POST' and path=='/api/auth/record-photos/contracts/901':
        route.fulfill(json={'status':'success','data':{'copied':0}});return
    if req.method not in ('GET','HEAD'):
        if req.method in ('POST','PUT') and path in ('/api/auth/order/car-rental','/api/auth/order/car-rental/901'):
            body=req.post_data_json;writes.append(body)
            state['record']={'id':901,'order_status':'draft','draft_reference':'NHAP-QA-901','draft_revision':str(len(writes)),
                'store_id':36,'customer_name':'Khách QA','rental_type':'ownership','draft_payload':{'management_composer':{'version':1,**body}}}
            route.fulfill(status=201,json={'status':'success','data':state['record']});return
        unexpected.append(req.method+' '+path);route.abort();return
    if path in ('/api/auth/stores','/api/auth/store-directory'):data=stores
    elif path=='/api/auth/hr/staff':data=staff
    elif path=='/api/auth/contract-staff':
        if state['directory_fail']:
            route.fulfill(status=503,json={'status':'error','message':'QA directory unavailable'});return
        data=staff
    elif path=='/api/auth/order/car-rental':data=[state['record']] if state['record'] else []
    elif path=='/api/auth/gps':data={'devices':[],'events':[]}
    elif path.startswith('/api/auth/'):data=[]
    elif path=='/api/session':route.fulfill(json={'user':{'name':'QA'}});return
    else:unexpected.append(req.method+' '+path);route.abort();return
    route.fulfill(json={'status':'success','data':data})

with sync_playwright() as pw:
    for engine,width in [('chromium',1440),('webkit',390)]:
        state.update(record=None,directory_fail=False)
        browser=getattr(pw,engine).launch()
        ctx=browser.new_context(viewport={'width':width,'height':1000},timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
        ctx.add_cookies([{'name':'himoto_management_session','value':Path(a.session_cookie_file).read_text().strip(),'url':a.url,'httpOnly':True,'sameSite':'Strict'}])
        ctx.route('**/api/**',mock)
        ctx.add_init_script("""const nativeFetch=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/auth/payment-events')return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return nativeFetch.call(this,input,options);};""")
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        def open_new():
            page.goto(a.url+'/contracts/ownership',wait_until='networkidle',timeout=120000)
            page.get_by_text('Thao tác khác',exact=True).click()
            page.get_by_role('button',name='Nhập hợp đồng',exact=True).click()
            form=page.locator('dialog.mg-contract-composer')
            expect(form).to_be_visible()
            form.get_by_role('tab',name='Hợp đồng',exact=False).click()
            return form
        def reopen():
            try:page.get_by_role('button',name='Thao tác NHAP-QA-901',exact=True).filter(visible=True).click(timeout=15000)
            except Exception:
                page.screenshot(path=str(out/f'{engine}-reopen-failure.png'),full_page=True)
                print(json.dumps({'url':page.url,'body':page.locator('main').inner_text()[:2200],'recordType':state['record'].get('order_type')},ensure_ascii=True),flush=True)
                raise
            page.get_by_role('menuitem',name='Duyệt & hoàn tất hợp đồng',exact=True).click()
            form=page.locator('dialog.mg-contract-composer');expect(form).to_be_visible()
            form.get_by_role('tab',name='Hợp đồng',exact=False).click();return form
        form=open_new()
        source=form.get_by_label('Nguồn khách',exact=True);sales=form.get_by_label('NVKD ghi nhận doanh số',exact=True)
        source.fill('Người giới thiệu chưa có hồ sơ QA');sales.fill('Nhân viên mới nhập tay QA');source.focus()
        expect(sales).to_have_value('Nhân viên mới nhập tay QA')
        expect(form.get_by_text('Không khớp nhân viên.',exact=False)).to_have_count(0)
        form.get_by_role('button',name='Lưu nháp',exact=True).click()
        try:expect(form).not_to_be_visible()
        except AssertionError:
            form.screenshot(path=str(out/f'{engine}-save-failure.png'))
            print(json.dumps({'alerts':form.get_by_role('alert').all_text_contents(),'errors':form.locator('.mg-field-error').all_text_contents(),'writes':len(writes),'unexpected':unexpected},ensure_ascii=True),flush=True)
            raise
        assert writes[-1]['rental_type']=='ownership'
        assert writes[-1]['draft']['sales_staff_name']=='Nhân viên mới nhập tay QA'
        assert not writes[-1]['draft'].get('sales_staff_id')
        page.wait_for_url(a.url+'/contracts/drafts')
        expect(page.get_by_role('button',name='Thao tác NHAP-QA-901',exact=True).filter(visible=True)).to_be_visible()
        page.wait_for_load_state('networkidle');page.reload(wait_until='networkidle');form=reopen()
        expect(form.get_by_label('Nguồn khách',exact=True)).to_have_value('Người giới thiệu chưa có hồ sơ QA')
        sales=form.get_by_label('NVKD ghi nhận doanh số',exact=True);expect(sales).to_have_value('Nhân viên mới nhập tay QA')
        form.get_by_label('Nguồn khách',exact=True).fill('Nguồn khác sau khi mở lại QA')
        expect(sales).to_have_value('Nhân viên mới nhập tay QA')
        sales.scroll_into_view_if_needed()
        form.screenshot(path=str(out/f'{engine}-manual-source.png'))
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        checks.append(f'{engine}: ownership source and manual NVKD survive save/reload/reopen; editing source retains explicit NVKD')
        sales.fill('NVKD trong danh sách QA')
        form.get_by_role('button',name='Lưu nháp',exact=True).click();expect(form).not_to_be_visible()
        assert writes[-1]['draft']['sales_staff_id']=='7'
        form=reopen();sales=form.get_by_label('NVKD ghi nhận doanh số',exact=True)
        expect(sales).to_have_value('NVKD trong danh sách QA')
        sales.fill('');form.get_by_role('button',name='Lưu nháp',exact=True).click();expect(form).not_to_be_visible()
        assert not writes[-1]['draft'].get('sales_staff_id') and not writes[-1]['draft'].get('sales_staff_name')
        checks.append(f'{engine}: listed employee keeps its ID; clearing removes both name and ID')
        state['directory_fail']=True
        form=open_new();sales=form.get_by_label('NVKD ghi nhận doanh số',exact=True)
        expect(form.get_by_text('Chưa tải được gợi ý nhân viên; vẫn có thể nhập thủ công.',exact=True)).to_be_visible()
        expect(sales).to_be_enabled();sales.fill('Nhập khi gợi ý lỗi QA')
        form.get_by_label('Nguồn khách',exact=True).fill('Nguồn nhập khi gợi ý lỗi QA')
        form.get_by_role('button',name='Lưu nháp',exact=True).click();expect(form).not_to_be_visible()
        assert writes[-1]['draft']['sales_staff_name']=='Nhập khi gợi ý lỗi QA'
        checks.append(f'{engine}: unavailable staff suggestions never block manual entry or draft save')
        page.wait_for_url(a.url+'/contracts/drafts');page.wait_for_load_state('networkidle')
        ctx.unroute_all(behavior='wait');ctx.close();browser.close()
assert not errors,errors
assert not unexpected,unexpected
result={'passed':len(checks),'checks':checks,'javascriptErrors':errors,'unexpectedRequests':unexpected,'mockedWrites':len(writes),'realBusinessWrites':0}
(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
