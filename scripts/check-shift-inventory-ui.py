"""Inventory scope comparison and safe historical refresh. Business APIs mocked."""
import argparse,json
from pathlib import Path
from datetime import datetime,timedelta,timezone
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3014');p.add_argument('--cookie-file',required=True);p.add_argument('--browser',choices=['chromium','webkit'],default='chromium');p.add_argument('--output',default='.backups/shift-inventory-20261025/ui');a=p.parse_args()
out=Path(a.output)/a.browser;out.mkdir(parents=True,exist_ok=True)
today=datetime.now(timezone(timedelta(hours=7))).date();past=(today-timedelta(days=1)).isoformat();today=today.isoformat();state=dict(fail=False,queries=[],writes=[]);errors=[];checks=[]
def mock(route):
    req=route.request;path=urlparse(req.url).path;q={k:v[0] for k,v in parse_qs(urlparse(req.url).query).items()}
    if req.method!='GET':state['writes'].append(path);route.abort();return
    if path=='/api/session':route.fulfill(json=dict(user=dict(name='QA')));return
    if path=='/api/auth/shift-reports':route.fulfill(json=dict(data=[]));return
    if path=='/api/auth/shift-reports/autofill':
        state['queries'].append(q)
        if q['section']=='inventory' and state['fail']:state['fail']=False;route.fulfill(status=503,json=dict(message='QA kiểm kê tạm gián đoạn'));return
        data=dict(section=q['section'],store_id=int(q['store_id']),date=q['date'],values={},notices=[],sources=['Số trong ngày và hiện trạng có phạm vi khác nhau.'],read_at=today+'T01:00:00+07:00')
        if q['section']=='inventory':
            current=q['date']==today
            data['inventory']=dict(started_contracts=0 if current else 10,started_vehicles=0 if current else 12,active_contracts=34,active_vehicles=38,daily_vehicles=37,monthly_vehicles=0,other_vehicles=1,stock_vehicles=2,ready_vehicles_raw=3,ready_conflicts=1,ready_rentals=1,missing_vehicle_lines=1,duplicate_vehicles=0,issues=[dict(kind='ready_rental',order_id=123,code='QA-READY',vehicle_id=1,license='QA-01'),dict(kind='missing_vehicle',order_id=124,code='QA-MISSING',vehicle_id=None,license='')])
            if current:data['values']=dict(vehicles=2,daily_vehicles=37,monthly_vehicles=0,other_vehicles=1)
            else:data['notices']=['Đang xem ngày cũ: giữ nguyên số kiểm kê đã nhập. Hiện trạng xe chỉ để tham khảo, không tự điền vào tồn cuối ngày đã chọn.']
        route.fulfill(json=dict(data=data));return
    data=[dict(id=34,store_name='CS A QA',kind='physical',status='opening'),dict(id=32,store_name='CS B QA',kind='physical',status='opening')] if path in ['/api/auth/stores','/api/auth/store-directory'] else []
    route.fulfill(json=dict(status='success',data=data))
with sync_playwright() as pw:
    browser=getattr(pw,a.browser).launch();ctx=browser.new_context(viewport=dict(width=1440 if a.browser=='chromium' else 390,height=1000),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
    ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
    page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(a.url+'/shift-reports',wait_until='networkidle')
    page.get_by_role('button',name='Tạo báo cáo',exact=True).click();page.locator('#shift-store').select_option('34');expect(page.locator('#shift-staff')).to_be_enabled()
    page.get_by_role('tab',name='Kiểm kê xe / pin',exact=True).click();panel=page.locator('#shift-inventory-panel-vehicles');button=panel.get_by_role('button',name='Tự điền từ DB',exact=True)
    button.click();expect(page.locator('#shift-daily_vehicles')).to_have_value('37');expect(page.locator('#shift-vehicles')).to_have_value('2');expect(page.locator('#shift-other_vehicles')).to_have_value('1');expect(page.locator('#shift-vehicle-total')).to_have_value('40')
    comparison=page.get_by_role('region',name='Đối chiếu hợp đồng và xe',exact=True);expect(comparison).to_be_visible();expect(comparison.locator('[data-inventory-active-vehicles]')).to_have_text('38');expect(comparison.locator('[data-inventory-started-contracts]')).to_have_text('0');expect(comparison.locator('[data-inventory-stock]')).to_contain_text('2 xe')
    expect(comparison.get_by_role('link',name='HĐ QA-READY',exact=True)).to_have_attribute('href','/contracts?contract_id=123');expect(comparison).to_contain_text('QA-01');expect(comparison).to_contain_text('HĐ chưa gắn xe');expect(comparison).to_contain_text('trạng thái xe và hợp đồng trong DB chưa thay đổi')
    checks.append('Today fills four reconciled groups, subtracts ready/rental overlap, shows current inventory separately from daily activity and provides contract/plate warnings without changing business records')
    page.get_by_role('tab',name='Thông tin',exact=True).click();page.locator('#shift-date').fill(past);expect(page.locator('#shift-staff')).to_be_enabled();page.get_by_role('tab',name='Kiểm kê xe / pin',exact=True).click();expect(comparison).to_have_count(0)
    for key,value in [('vehicles','7'),('daily_vehicles','11'),('monthly_vehicles','4'),('other_vehicles','9')]:page.locator('#shift-'+key).fill(value)
    button.click();expect(comparison.locator('[data-inventory-started-contracts]')).to_have_text('10');expect(comparison.locator('[data-inventory-started-vehicles]')).to_have_text('12');expect(comparison.locator('[data-inventory-active-vehicles]')).to_have_text('38');expect(panel).to_contain_text('giữ nguyên số kiểm kê đã nhập')
    for key,value in [('vehicles','7'),('daily_vehicles','11'),('monthly_vehicles','4'),('other_vehicles','9')]:expect(page.locator('#shift-'+key)).to_have_value(value)
    expect(page.locator('#shift-vehicle-total')).to_have_value('31');assert state['queries'][-1]['date']==past and state['queries'][-1]['store_id']=='34'
    checks.append('Changing report date hides stale metadata; historical read displays 10 contracts/12 vehicles and current stock side by side while preserving every manually entered historical inventory field')
    state['fail']=True;page.locator('#shift-daily_vehicles').fill('22');button.click();expect(page.get_by_role('alert').filter(has_text='QA kiểm kê tạm gián đoạn')).to_be_visible();expect(page.locator('#shift-daily_vehicles')).to_have_value('22');button.click();expect(page.locator('#shift-daily_vehicles')).to_be_enabled();expect(page.locator('#shift-daily_vehicles')).to_have_value('22')
    checks.append('A failed source read preserves entered counts; retry keeps historical values and refreshes only comparison evidence')
    page.screenshot(path=str(out/'inventory.png'),full_page=True);assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
    page.get_by_role('tab',name='Thông tin',exact=True).click();page.locator('#shift-store').select_option('32');expect(page.locator('#shift-staff')).to_be_enabled();page.get_by_role('tab',name='Kiểm kê xe / pin',exact=True).click();expect(comparison).to_have_count(0);button.click();expect(comparison).to_be_visible();assert state['queries'][-1]['store_id']=='32'
    checks.append('Branch switching cannot show another branch’s comparison; desktop/mobile remain within viewport')
    assert not state['writes'],state['writes'];assert not errors,errors;browser.close()
result=dict(passed=len(checks),browser=a.browser,checks=checks,realBusinessWrites=0,jsErrors=errors);(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
