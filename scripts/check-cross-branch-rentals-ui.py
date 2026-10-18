"""Synthetic contract QA: every business API request is intercepted."""
import argparse
import json
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3102')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='docs/qa/cross-branch-rentals')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
checks, queries, writes, errors = [], [], [], []
stores = [dict(id=i,store_name=name,code=f'QA{i}',status='opening') for i,name in [(31,'CS Láng'),(32,'CS Nguyễn Hoàng'),(34,'CS Thuốc Bắc')]]
customer = dict(id=7,name='Khách Láng QA',phone='0900000011',id_card='001234567890',status='active',store_id=31,store_name='CS Láng',
    first_rental_store_id=31,first_rental_store_name='CS Láng',first_rented_at='2024-03-01T00:00:00Z',address='Địa chỉ QA',relatives=[])
staff = [dict(id=700,full_name='Nhân sự Láng QA',staff_code='QA700',position='PT',status='active',store_id=31)]
vehicles = [dict(id=i,name=f'Xe QA {i}',license=f'QA-{i}',brand='Honda',type='xeso',year=2026,store_id=store,current_store_id=store,store_name=next(s['store_name'] for s in stores if s['id']==store),status=status,daily_price=150000,monthly_price=3000000,
    rentals=[dict(order_id=900,code='HD-QA-900',status='renting',customer='Khách khác QA',return_at='2026-10-12T08:00:00+07:00')] if i==103 else [])
    for i,store,status in [(100,32,'ready'),(101,34,'ready'),(102,32,'repairing'),(103,32,'ready')]]

def mock(route):
    req = route.request
    parsed = urlparse(req.url)
    endpoint = parsed.path
    if req.method not in ('GET','HEAD'):
        body = req.post_data_json
        writes.append(dict(path=endpoint,body=body))
        if endpoint == '/api/auth/order/car-rental' and req.method == 'POST':
            route.fulfill(status=201,json={'status':'success','data':dict(id=901,draft_reference='NHAP-QA-901',status='draft',store_id=31,draft_revision='901',draft_payload={'management_composer':{'version':1,**body}})})
        else:
            route.fulfill(status=409,json={'status':'error','message':'QA prevents live writes'})
        return
    if endpoint == '/api/auth/customers/search':
        params = parse_qs(parsed.query)
        assert 'store_id' not in params
        queries.append(params['query'][0])
        data = [customer] if params['query'][0] in [customer['phone'],customer['id_card']] else []
    elif endpoint == '/api/auth/customers': data = [customer]
    elif endpoint == '/api/auth/stores': data = stores
    elif endpoint == '/api/auth/hr/staff': data = staff
    elif endpoint == '/api/auth/vehicle/vehicles': data = vehicles
    elif endpoint == '/api/auth/order/car-rental': data = []
    else: raise AssertionError(f'Unexpected business request {endpoint}')
    route.fulfill(json={'status':'success','data':data})

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width':1440,'height':1000},timezone_id='Asia/Ho_Chi_Minh',locale='en-US',reduced_motion='reduce')
    context.add_cookies([dict(name='himoto_management_session',value=Path(args.session_cookie_file).read_text().strip(),url=args.url,httpOnly=True,sameSite='Strict')])
    context.route('**/api/auth/**',mock)
    page = context.new_page()
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(args.url+'/contracts',wait_until='domcontentloaded')
    page.get_by_role('button',name='Nhập hợp đồng',exact=True).click()
    form = page.locator('dialog.mg-contract-composer')
    expect(form).to_be_visible(timeout=30000)
    page.add_style_tag(content='.mg-user-menu strong { visibility:hidden!important; }')
    def tab(name): form.get_by_role('tab',name=name,exact=False).click()
    tab('Khách hàng')
    expect(form.locator('#contract-store')).to_have_value('')
    expect(form.locator('#contract-id-card')).to_be_enabled()
    form.locator('#contract-id-card').fill(customer['phone'])
    expect(form.locator('#contract-customer-name')).to_have_value(customer['name'])
    expect(form.locator('#contract-store')).to_have_value('31')
    expect(form.locator('.mg-customer-origin')).to_contain_text('CS Láng')
    expect(form.locator('#contract-staff-options option')).to_have_count(1)
    form.locator('#contract-staff').fill(staff[0]['full_name'])
    checks.append('lookup before selecting any branch finds the profile, shows original/first rental branches and automatically attributes this contract to source Láng')
    tab('Phương tiện')
    today = datetime.now(ZoneInfo('Asia/Ho_Chi_Minh')).strftime('%Y-%m-%d')
    expect(form.locator('#contract-start_date')).to_have_value(today)
    expect(form.locator('#contract-rental-days')).to_have_value('1')
    assert form.locator('input[type=datetime-local]').count() == 0
    form.get_by_label('Giờ thuê lúc (24h)',exact=True).select_option('15')
    form.get_by_label('Phút thuê lúc',exact=True).select_option('30')
    expect(form.get_by_label('Giờ hẹn trả (24h)',exact=True)).to_have_value('15')
    expect(form.get_by_label('Phút hẹn trả',exact=True)).to_have_value('30')
    for start,days,end in [('2026-10-31','2','2026-11-02'),('2026-12-31','1','2027-01-01'),('2028-02-28','2','2028-03-01')]:
        form.locator('#contract-start_date').fill(start)
        form.locator('#contract-rental-days').fill(days)
        expect(form.locator('#contract-end_date')).to_have_value(end)
    form.locator('#contract-end_date').fill('2028-03-03')
    expect(form.locator('#contract-rental-days')).to_have_value('4')
    form.locator('#contract-start_date').fill('2028-03-01')
    expect(form.locator('#contract-end_date')).to_have_value('2028-03-03')
    expect(form.locator('#contract-rental-days')).to_have_value('2')
    form.locator('#contract-rental-days').fill('0')
    expect(form.locator('#contract-rental-days')).to_have_attribute('aria-invalid','true')
    form.locator('#contract-start_date').fill('2026-10-11')
    form.locator('#contract-rental-days').fill('2')
    expect(form.locator('#contract-end_date')).to_have_value('2026-10-13')
    checks.append('explicit 15:30 under an AM/PM browser locale; today default and numeric durations cross month/year/leap boundaries, with manual return dates preserved and invalid days flagged')
    picker = form.locator('#contract-vehicle-0')
    expect(picker).to_be_enabled()
    picker.click()
    expect(form.locator('#contract-vehicle-0-options [role=option]')).to_have_count(2)
    expect(form.locator('#contract-vehicle-0-options-101')).to_contain_text('CS Thuốc Bắc')
    form.locator('#contract-vehicle-store-filter').select_option('32')
    picker.click()
    expect(form.locator('#contract-vehicle-0-options [role=option]')).to_have_count(1)
    form.locator('#contract-vehicle-0-options-100').click()
    expect(form.locator('.mg-vehicle-warning')).to_have_count(0)
    expect(form.locator('.mg-composer-vehicle-summary')).to_contain_text('Cơ sở quản lý xe: CS Nguyễn Hoàng')
    expect(form.locator('.mg-composer-vehicle-summary')).to_contain_text('Doanh thu: CS Láng')
    form.screenshot(path=str(out/'time-and-inventory-1440.png'))
    tab('Khách hàng')
    form.locator('#contract-store').select_option('34')
    tab('Phương tiện')
    expect(picker).to_have_value('Xe QA 100 · QA-100')
    expect(form.locator('.mg-composer-vehicle-summary')).to_contain_text('Doanh thu: CS Thuốc Bắc')
    tab('Khách hàng')
    form.locator('#contract-store').select_option('31')
    form.locator('#contract-staff').fill(staff[0]['full_name'])
    checks.append('stock filter works independently of source; ready stock is selectable, repairs and occupied vehicles are excluded, changing source preserves the vehicle and updates revenue')
    tab('Chi phí')
    method = form.locator('details.mg-method-picker').nth(1)
    method.locator('summary').click()
    method.get_by_label('Tiền mặt',exact=True).check()
    method.get_by_label('CK tk công ty',exact=True).check()
    expect(method).to_have_attribute('open','')
    expect(method.locator('summary')).to_contain_text('Tiền mặt, CK tk công ty')
    form.locator('#contract-unit_price').click()
    expect(method).not_to_have_attribute('open','')
    method.locator('summary').click()
    method.get_by_label('Tiền mặt',exact=True).focus()
    page.keyboard.press('Escape')
    expect(method).not_to_have_attribute('open','')
    expect(form).to_be_visible()
    method.locator('summary').click()
    form.locator('#contract-total_amount').focus()
    expect(method).not_to_have_attribute('open','')
    expect(method.locator('summary')).to_contain_text('Tiền mặt, CK tk công ty')
    checks.append('multi-method menu keeps internal selections, closes on outside mouse/focus and Escape, and retains chosen methods without closing the dialog')
    tab('Phương tiện')
    for width,height in [(375,812),(812,375)]:
        page.set_viewport_size({'width':width,'height':height})
        assert form.evaluate('(el)=>el.getBoundingClientRect().width<=innerWidth')
        assert form.evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
        form.screenshot(path=str(out/f'time-and-inventory-{width}.png'))
    checks.append('24-hour date/time and source/stock fields fit 375px portrait and 812px landscape')
    page.set_viewport_size({'width':1440,'height':1000})
    form.get_by_role('button',name='Lưu nháp',exact=True).click()
    expect(form).to_have_count(0)
    draft = writes[-1]['body']['draft']
    assert draft['store_id']=='31' and draft['customer_id']==7
    assert draft['customer_source_url']=='CS Láng'
    assert draft['vehicles'][0]['id']=='100' and draft['vehicles'][0]['stock_store_id']=='32'
    assert draft['start_date']=='2026-10-11T15:30' and draft['end_date']=='2026-10-13T15:30'
    assert draft['payment_method']=='Tiền mặt, CK tk công ty'
    checks.append('saved request preserves Láng source, original customer ID, NH vehicle, unambiguous 24-hour timestamps and selected payment methods')
    page.goto(args.url+'/vehicles',wait_until='domcontentloaded')
    table = page.get_by_role('table')
    expect(table.get_by_role('row').filter(has_text='QA-100')).to_be_visible()
    table.get_by_role('row').filter(has_text='QA-100').get_by_role('button',name='Sửa',exact=False).click()
    inventory = page.get_by_role('dialog')
    expect(inventory.locator('#vehicle-status')).to_be_enabled()
    expect(inventory.locator('#vehicle-store_id')).to_be_enabled()
    inventory.locator('#vehicle-status').select_option('using')
    expect(inventory).to_contain_text('Đã giao xe nhưng chưa nhập hợp đồng')
    inventory.get_by_role('button',name='Hủy',exact=True).click()
    table.get_by_role('row').filter(has_text='QA-103').get_by_role('button',name='Sửa',exact=False).click()
    inventory = page.get_by_role('dialog')
    expect(inventory.locator('#vehicle-status')).to_be_disabled()
    expect(inventory.locator('#vehicle-store_id')).to_be_disabled()
    expect(inventory).to_contain_text('Xe đang thuộc hợp đồng mở')
    inventory.get_by_role('button',name='Hủy',exact=True).click()
    checks.append('inventory status/branch remain editable for checkout without a contract; both are locked for vehicles on an actual open contract')
    assert not errors,errors
    (out/'results.json').write_text(json.dumps(dict(passed=len(checks),checks=checks,errors=errors,realBusinessWrites=0),ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(dict(passed=len(checks),checks=checks),ensure_ascii=False))
    browser.close()
