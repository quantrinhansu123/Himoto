"""Actionable draft errors and legacy review notices. Every business/provider API is mocked."""
import argparse,json,re
from datetime import datetime,timedelta,timezone
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3033');p.add_argument('--cookie-file',required=True);p.add_argument('--browser',choices=['all','chromium','webkit'],default='all');p.add_argument('--output',default='.backups/contract-feedback-20261025/ui');a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True);expect.set_options(timeout=30000)
now=datetime.now(timezone.utc);stamp=lambda days:(now+timedelta(days=days)).isoformat()
state={};checks=[];errors=[];writes=[];unexpected=[]
vehicle=dict(id=101,name='Xe QA',license='QA-00101',store_id=1,current_store_id=1,status='ready',type='xeso',brand='Honda',year=2026)
def reset(**kwargs):state.clear();state.update(record=None,reject=True,legacy=False,**kwargs)
def mock(route):
    if mock_contract_type_read(route):return
    req=route.request;path=urlparse(req.url).path
    if path=='/api/session':route.fulfill(json=dict(user=dict(name='QA')));return
    if path=='/api/auth/gps/refresh':route.fulfill(json=dict(status='success',data={}));return
    if path=='/api/auth/record-photos/contracts/901' and req.method=='POST':route.fulfill(json=dict(status='success',data=dict(copied=0)));return
    if req.method not in ('GET','HEAD'):
        if path=='/api/auth/order/car-rental' and req.method=='POST':
            body=req.post_data_json;writes.append(body)
            if state['reject']:route.fulfill(status=400,json=dict(status='error',message='Kiểm tra Đơn giá thuê: Đơn giá gửi lên chưa đúng định dạng.',fields=dict(unit_price='Kiểm tra đơn giá rồi lưu lại.')));return
            state['record']=dict(id=901,draft_reference='005807-QA',order_status='draft',draft_revision='2',rental_type=body['rental_type'],store_id=1,draft_payload=dict(management_composer=dict(version=1,**body)))
            route.fulfill(json=dict(status='success',data=state['record']));return
        unexpected.append(req.method+' '+path);route.abort();return
    if path in ('/api/auth/stores','/api/auth/store-directory'):data=[dict(id=1,store_name='Cơ sở QA',kind='physical',status='opening')]
    elif path in ('/api/auth/vehicle/vehicles','/api/auth/vehicles/inventory'):data=[vehicle]
    elif path=='/api/auth/order/car-rental':data=[state['record']] if state['record'] else []
    elif path=='/api/auth/record-photos/contracts/901':data=[]
    elif path=='/api/auth/order/car-rental/901':data=state['record']
    elif path=='/api/auth/gps':data=dict(devices=[],events=[],selected_vehicles=[])
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as pw:
    for engine in (['chromium','webkit'] if a.browser=='all' else [a.browser]):
        browser=getattr(pw,engine).launch();ctx=browser.new_context(viewport=dict(width=390 if engine=='webkit' else 1440,height=900),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
        ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
        ctx.add_init_script("""const qaFetch=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(['/api/auth/payment-events','/api/auth/gps/refresh'].includes(url.pathname))return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return qaFetch.call(this,input,options);};""")
        def collect_error(error):errors.append(str(error))
        page=ctx.new_page();page.on('pageerror',collect_error);reset();writes_before=len(writes)
        def fresh_page():
            global page
            # Isolate full-navigation scenarios: WebKit reports Playwright-routed
            # fetch cancellation during teardown as CORS. Keep every live-page error.
            page.wait_for_load_state('networkidle');page.remove_listener('pageerror',collect_error);page.close()
            page=ctx.new_page();page.on('pageerror',collect_error)
        page.goto(a.url+'/contracts',wait_until='networkidle',timeout=120000)
        new=page.get_by_role('button',name='Nhập hợp đồng',exact=True)
        if not new.is_visible():page.get_by_text('Thao tác khác',exact=True).click()
        new.click();form=page.locator('dialog.mg-contract-composer');expect(form).to_be_visible();form.locator('#contract-contract_number').fill('005807-QA')
        form.get_by_role('button',name='Hoàn tất & thanh toán',exact=True).click();summary=form.get_by_role('alert',name='Cần kiểm tra trước khi lưu hợp đồng',exact=True)
        expect(summary).to_be_visible();expect(summary).to_be_focused();assert summary.locator('li').count()>=4,summary.inner_text();assert len(writes)==writes_before
        expect(summary).to_contain_text('Thông tin đang nhập được giữ trên form');page.screenshot(path=str(out/f'{engine}-validation-summary.png'))
        summary.get_by_role('button',name=re.compile('^Xe 1:')).click();expect(form.get_by_role('tab',name='Phương tiện',exact=False)).to_have_attribute('aria-selected','true');expect(form.locator('#contract-vehicle-0')).to_be_focused()
        summary.get_by_role('button',name=re.compile('^CCCD')).click();expect(form.get_by_role('tab',name='Khách hàng',exact=False)).to_have_attribute('aria-selected','true');expect(form.locator('#contract-id-card')).to_be_focused()
        checks.append(dict(browser=engine,case='all-client-errors-are-announced-and-open-the-correct-tab-field'))
        form.get_by_role('tab',name='Ký kết & ghi chú',exact=False).click();form.get_by_role('button',name='Lưu nháp',exact=True).click()
        expect(summary).to_contain_text('Kiểm tra Đơn giá thuê');expect(summary).to_be_focused();expect(summary.get_by_role('button',name=re.compile('^Đơn giá thuê:'))).to_be_visible()
        summary.get_by_role('button',name=re.compile('^Đơn giá thuê:')).click();expect(form.locator('#contract-unit_price')).to_be_focused();expect(form.locator('#contract-unit_price')).to_have_attribute('aria-invalid','true');expect(form.get_by_role('tab',name='Chi phí',exact=True)).to_have_attribute('aria-selected','true')
        expect(form.locator('#contract-contract_number')).to_have_value('005807-QA');page.screenshot(path=str(out/f'{engine}-server-field-error.png'))
        form.locator('#contract-unit_price').fill('150000');expect(summary).to_have_count(0);state['reject']=False;form.get_by_role('button',name='Lưu nháp',exact=True).click();expect(form).not_to_be_visible();assert writes[-1]['draft']['contract_number']=='005807-QA'
        page.wait_for_url(a.url+'/contracts/drafts');page.wait_for_load_state('networkidle')
        checks.append(dict(browser=engine,case='server-field-error-keeps-data-links-to-input-and-retry-saves'))
        fresh_page()
        state['record']=dict(id=901,contract_number='QA-LEGACY-OWNERSHIP',order_status='renting',status='overdue',rental_type='ownership',store_id=1,customer_name='Khách QA',total_amount=1000000,paid_amount=0,start_date=stamp(-120),end_date=stamp(-30),vehicles=[vehicle],legacy_source_store_id='29',legacy_inferred_ownership=True)
        page.goto(a.url+'/contracts?contract_id=901',wait_until='networkidle',timeout=120000)
        if engine=='webkit':page.locator('.mg-mobile-card-main:visible').first.click()
        else:page.get_by_role('button',name='Thao tác QA-00101',exact=True).filter(visible=True).click();page.get_by_role('menuitem',name='Xem chi tiết',exact=True).click()
        detail=page.locator('dialog.mg-contract-detail');notice=detail.get_by_role('complementary',name='Hồ sơ cần đối chiếu',exact=True);expect(notice).to_be_visible();expect(notice.locator('li')).to_have_count(2)
        expect(notice).to_contain_text('Đối chiếu loại trên hợp đồng giấy');expect(notice).to_contain_text('Chưa có lịch đóng tiền');assert not page.evaluate('document.documentElement.scrollWidth>innerWidth');page.screenshot(path=str(out/f'{engine}-legacy-review-notice.png'))
        checks.append(dict(browser=engine,case='legacy-type-provenance-and-missing-schedule-are-visible-before-processing'))
        detail.get_by_role('button',name='Đóng',exact=True).click();fresh_page();state['record']['rental_type']='rental'
        page.goto(a.url+'/contracts?contract_id=901',wait_until='networkidle',timeout=120000)
        if engine=='webkit':page.locator('.mg-mobile-card-main:visible').first.click()
        else:page.get_by_role('button',name='Thao tác QA-00101',exact=True).filter(visible=True).click();page.get_by_role('menuitem',name='Xem chi tiết',exact=True).click()
        expect(page.locator('.mg-contract-review-notice')).to_have_count(0);checks.append(dict(browser=engine,case='ordinary-rentals-do-not-show-an-ownership-review-warning'))
        page.wait_for_load_state('networkidle');page.remove_listener('pageerror',collect_error);page.close();ctx.unroute_all(behavior='ignoreErrors');ctx.close();browser.close()
assert not errors,errors
assert not unexpected,unexpected
result=dict(passed=len(checks),checks=checks,javascriptErrors=errors,unexpectedWrites=unexpected,realBusinessWrites=0)
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2))
