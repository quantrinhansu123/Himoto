"""Synthetic global customer lookup checks; intercept every business request."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3102')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='docs/qa/customer-global-search')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
checks, queries, writes, errors = [], [], [], []
stores = [dict(id=i,store_name=name,code=f'QA{i}',status='opening') for i,name in [(23,'CS Giáp Bát'),(31,'CS Láng'),(34,'CS Thuốc Bắc')]]
staff = [dict(id=700,full_name='Nhân sự hợp đồng QA',staff_code='QA700',position='PT',status='active',store_id=23)]
family = [dict(name='Người thân một QA',relationship='Mẹ',phone='0900000099'),dict(name='Người thân hai QA',relationship='Anh',phone='0900000098')]
customers = [dict(id=i,name=name,phone=phone,id_card=f'00123456789{i}',status='active',store_id=store,store_name=next((s['store_name'] for s in stores if s['id']==store),''),
    first_rental_store_id=34,first_rental_store_name='CS Thuốc Bắc',first_rented_at='2024-03-01T00:00:00Z',
    address='Địa chỉ QA',id_card_issued_on='2024-01-15',id_card_issued_by='Nơi cấp QA',driver_license_number='GPLX-QA',driver_license_issued_on='2023-01-15',relatives=family)
    for i,name,phone,store in [(1,'Khách A QA','0900000011',31),(2,'Khách B QA','0900000022',23),(3,'Khách C QA','0900000022',31)]]
customers.append(dict(id=4,name='Khách mới QA',phone='0900000033',id_card='001234567894',status='active',store_id=31,store_name='CS Láng',address='Địa chỉ mới QA',relatives=[]))

def mock(route):
    req = route.request
    parsed = urlparse(req.url)
    endpoint = parsed.path
    if req.method not in ('GET','HEAD'):
        writes.append(dict(path=endpoint,body=req.post_data_json))
        route.fulfill(status=409,json={'status':'error','message':'QA prevents live writes'})
        return
    if endpoint == '/api/auth/customers/search':
        params = parse_qs(parsed.query)
        assert 'store_id' not in params
        q = params['query'][0]
        queries.append(q)
        if q == '0900000044':
            route.fulfill(status=503,json={'status':'error','message':'Lỗi kết nối QA'})
            return
        data = [c for c in customers if q in (c['phone'],c['id_card'])]
    elif endpoint == '/api/auth/customers': data = customers
    elif endpoint == '/api/auth/stores': data = stores
    elif endpoint == '/api/auth/hr/staff': data = staff
    elif endpoint in ('/api/auth/vehicle/vehicles','/api/auth/order/car-rental'): data = []
    else: raise AssertionError(f'Unexpected business request {endpoint}')
    route.fulfill(json={'status':'success','data':data})

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width':1440,'height':1000},timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
    context.add_cookies([dict(name='himoto_management_session',value=Path(args.session_cookie_file).read_text().strip(),url=args.url,httpOnly=True,sameSite='Strict')])
    context.route('**/api/auth/**',mock)
    page = context.new_page()
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.goto(args.url+'/contracts',wait_until='domcontentloaded')
    page.get_by_role('button',name='Nhập hợp đồng',exact=True).click()
    form = page.locator('dialog.mg-contract-composer')
    expect(form).to_be_visible(timeout=30000)
    form.get_by_role('tab',name='Khách hàng',exact=False).click()
    page.add_style_tag(content='.mg-user-menu strong { visibility:hidden!important; }')
    store = form.locator('#contract-store')
    identity = form.locator('#contract-id-card')
    expect(store).to_have_value('')
    expect(identity).to_be_enabled()
    identity.fill('090.000.0011')
    expect(form.locator('#contract-customer-name')).to_have_value('Khách A QA')
    for key,value in [('phone','0900000011'),('id_card','001234567891'),('address','Địa chỉ QA'),('id_card_issued_on','2024-01-15'),('id_card_issued_by','Nơi cấp QA'),('driver_license_number','GPLX-QA'),('driver_license_issued_on','2023-01-15')]:
        expect(form.locator('#contract-customer-'+key)).to_have_value(value)
    expect(form.locator('#contract-relative-0-name')).to_have_value('Người thân một QA')
    origin = form.locator('.mg-customer-origin')
    expect(origin.locator('dd').nth(0)).to_have_text('CS Láng')
    expect(origin.locator('dd').nth(1)).to_have_text('CS Thuốc Bắc')
    checks.append('formatted phone lookup before selecting a branch fills identity, address, license, relatives and separate owner/first rental branches')

    store.select_option('23')
    expect(form.locator('#contract-customer-name')).to_have_value('Khách A QA')
    expect(identity).to_have_value('090.000.0011')
    expect(origin).to_contain_text('hồ sơ vẫn thuộc CS Láng')
    expect(form.locator('#contract-staff-options option')).to_have_count(1)
    expect(form.locator('#contract-staff-options option')).to_have_attribute('value','Nhân sự hợp đồng QA')
    store.select_option('31')
    expect(form.locator('#contract-staff-options option')).to_have_count(0)
    expect(form.locator('#contract-customer-name')).to_have_value('Khách A QA')
    expect(origin.locator('p')).to_have_count(0)
    checks.append('changing the rental branch retains the selected customer and original owner, while contract staff remain restricted to the rental branch')

    identity.fill('0900000022')
    expect(form.locator('.mg-customer-match-list [role=option]')).to_have_count(2)
    expect(form.locator('#contract-customer-name')).to_be_disabled()
    for index,name in [(0,'CS Giáp Bát'),(1,'CS Láng')]:
        expect(form.locator('.mg-customer-match-list [role=option]').nth(index)).to_contain_text(name)
        expect(form.locator('.mg-customer-match-list [role=option]').nth(index)).to_contain_text('Thuê lần đầu: CS Thuốc Bắc')
    form.get_by_role('option',name='Khách B QA',exact=False).click()
    expect(form.locator('#contract-customer-name')).to_have_value('Khách B QA')
    expect(origin.locator('dd').nth(0)).to_have_text('CS Giáp Bát')
    checks.append('duplicate phone numbers require an explicit profile choice showing owner and first rental branches')

    identity.fill('001234567891')
    expect(form.locator('#contract-customer-name')).to_have_value('Khách A QA')
    identity.fill('0900000033')
    expect(form.locator('#contract-customer-name')).to_have_value('Khách mới QA')
    expect(origin.locator('dd').nth(1)).to_have_text('Chưa có lịch sử thuê')
    identity.fill('0900000090')
    expect(form.locator('#contract-lookup-status')).to_contain_text('trên toàn hệ thống')
    expect(form.locator('#contract-customer-name')).to_have_value('')
    expect(origin).to_have_count(0)
    identity.fill('0900000044')
    expect(form.locator('#contract-lookup-status')).to_have_attribute('role','alert')
    expect(form.locator('#contract-lookup-status')).to_contain_text('Lỗi kết nối QA')
    checks.append('CCCD also searches globally; new profiles show no rental history; missing customers and request errors clear old origin details')

    # Let an old response resolve after a new lookup, even if the fetch is aborted.
    page.evaluate("""() => {
      const fetch = window.fetch.bind(window);
      window.fetch = async (url,options) => {
        if (String(url).includes('customers/search?query=0900000011')) {
          const response = await fetch(url,{...options,signal:undefined});
          await new Promise(resolve=>setTimeout(resolve,1200));
          return response;
        }
        return fetch(url,options);
      };
    }""")
    identity.fill('0900000011')
    page.wait_for_timeout(500)
    identity.fill('0900000033')
    expect(form.locator('#contract-customer-name')).to_have_value('Khách mới QA')
    page.wait_for_timeout(1300)
    expect(form.locator('#contract-customer-name')).to_have_value('Khách mới QA')
    checks.append('a late previous lookup cannot overwrite the currently selected profile')

    identity.fill('001234567891')
    expect(form.locator('#contract-customer-name')).to_have_value('Khách A QA')
    for width,height in [(1440,1000),(375,812)]:
        page.set_viewport_size({'width':width,'height':height})
        expect(origin).to_be_visible()
        if width < 600:
            origin.scroll_into_view_if_needed()
        overflow = page.evaluate('document.documentElement.scrollWidth > innerWidth')
        assert not overflow
        page.screenshot(path=str(out/f'lookup-{width}.png'))
    assert not writes, writes
    assert not errors, errors
    checks.append('desktop and mobile origin panels render without horizontal overflow or browser errors; no business writes')
    browser.close()
out.joinpath('results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'businessWrites':len(writes),'searches':len(queries)},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'passed':len(checks),'checks':checks,'businessWrites':len(writes)},ensure_ascii=False,indent=2))
