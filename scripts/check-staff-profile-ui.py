"""Synthetic browser checks for the org chart, editable suggestions, branch accounts and identity fields."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3102')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='docs/qa/staff-profile')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
checks, writes, errors = [], [], []
stores = [{'id': i, 'code': f'CS{i}', 'store_name': name, 'status': 'opening', 'kind': 'physical'} for i, name in [(23,'CS Giáp Bát'),(31,'CS Láng'),(33,'CS Hà Đông'),(34,'CS Thuốc Bắc'),(35,'CS Thuê sở hữu')]]
staff = [{'id': i, 'staff_code': f'QA{i}', 'full_name': name, 'phone': f'09000000{i:02}', 'position': role, 'store_id': store, 'store_name': next((s['store_name'] for s in stores if s['id'] == store), ''), 'status': status} for i, name, role, store, status in [
    (1,'Nhân sự A QA','NVKD Giáp Bát',23,'active'), (2,'Nhân sự B QA','Nhân viên kinh doanh',23,'active'),
    (3,'Nhân sự PT QA','PT',23,'active'), (4,'Leader QA','QLCN / KT / Leader',35,'active'),
    (5,'Nhân sự trụ sở QA','TLS / NVKD',None,'active'), (6,'Hồ sơ cũ QA','PT Hà Đông',33,'leave')]]
accounts = [dict(id=i, kind='bank', store_id=store, store_name=next((s['store_name'] for s in stores if s['id'] == store), ''), owner_type='company', bank_name='QA Bank', owner_name=owner, account_number=f'000{i}', label=label, status='Active', opening_balance=0, income=0, expense=0, balance=0, voucher_count=0) for i, store, owner, label in [
    (1,23,'Tên đúng QA','QA company A'), (2,31,'Tên sai QA','QA company B'), (3,0,'Tên chung QA','QA shared')]]

def mock(route):
    req = route.request
    endpoint = urlparse(req.url).path
    if req.method in ('POST','PATCH','DELETE'):
        body = req.post_data_json
        writes.append(dict(path=endpoint, method=req.method, body=body))
        if endpoint == '/api/auth/hr/staff':
            i = max(s['id'] for s in staff) + 1
            staff.append({**body, 'id': i, 'staff_code': f'QA{i}', 'full_name': body['name'], 'store_name': next((s['store_name'] for s in stores if s['id'] == body['store_id']), '')})
            data = {'id': i, 'staff_code': f'QA{i}'}
        elif endpoint.startswith('/api/auth/hr/staff/'):
            target = next(s for s in staff if s['id'] == int(endpoint.split('/')[-1]))
            target.update(body)
            data = None
        elif endpoint.startswith('/api/auth/bulk-delete/'):
            route.fulfill(status=409, json={'status':'error','message':'Không xóa được nhân sự còn lịch trực.'})
            return
        elif endpoint == '/api/auth/customers':
            data = {**body, 'id': 9}
        else:
            data = None
        route.fulfill(json={'status':'success','data':data})
        return
    if endpoint == '/api/auth/stores': data = stores
    elif endpoint == '/api/auth/hr/staff': data = staff
    elif endpoint == '/api/auth/cashbook/accounts': data = accounts
    elif endpoint == '/api/auth/customers/search-by-id-card': data = None
    elif endpoint in ['/api/auth/customers','/api/auth/vehicle/vehicles','/api/auth/order/car-rental','/api/auth/transactions']: data = []
    else: raise AssertionError(f'Unexpected API {endpoint}')
    route.fulfill(json={'status':'success','data':data})

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width':1440,'height':1000}, reduced_motion='reduce')
    context.add_cookies([dict(name='himoto_management_session', value=Path(args.session_cookie_file).read_text().strip(), url=args.url, httpOnly=True, sameSite='Strict')])
    context.route('**/api/auth/**', mock)
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(args.url + '/staff', wait_until='domcontentloaded')
    expect(page.locator('.mg-org-chart')).to_be_visible(timeout=30000)
    page.add_style_tag(content='.mg-user-menu strong { visibility:hidden!important; }')
    branch = page.locator('.mg-org-card').filter(has=page.get_by_role('heading', name='CS Giáp Bát', exact=True))
    expect(branch.locator('.mg-org-group').filter(has=page.get_by_role('heading', name='NVKD', exact=False))).to_have_count(1)
    expect(branch.locator('.mg-org-person')).to_have_count(3)
    expect(page.locator('.mg-org-chart').get_by_text('Hồ sơ cũ QA', exact=True)).to_have_count(0)
    for name in ['Quản lý công nợ','Kế toán (KT)','PKD trụ sở công ty']:
        expect(page.locator('.mg-org-chart').get_by_role('heading', name=name, exact=True)).to_be_visible()
    own = page.locator('.mg-org-card').filter(has=page.get_by_role('heading', name='CS Thuê sở hữu', exact=True))
    expect(own.locator('.mg-org-role b')).to_have_text('Leader')
    page.get_by_label('Hiện nhân sự đã nghỉ việc', exact=True).check()
    expect(page.locator('.mg-org-chart').get_by_text('Hồ sơ cũ QA', exact=True)).to_be_visible()
    page.get_by_label('Hiện nhân sự đã nghỉ việc', exact=True).uncheck()
    page.screenshot(path=str(out/'chart-1440.png'), full_page=True)
    checks.append('aliases share one NVKD group; top departments, PKD headquarters and branch Leader; departed staff hidden with explicit toggle')

    def open_staff():
        page.get_by_role('button', name='Thêm nhân sự', exact=True).click()
        return page.get_by_role('dialog')

    dialog = open_staff()
    role = dialog.get_by_label('Chức vụ', exact=True)
    for query, expected in [('TPKD','TPKD'), ('QL','QL PTKD'), ('Nhân viên kinh doanh','NVKD')]:
        role.fill(query)
        expect(dialog.get_by_role('option', name=expected, exact=True)).to_be_visible()
        dialog.get_by_role('option', name=expected, exact=True).click()
        assert role.input_value() == expected
    role.fill('PT')
    expect(dialog.get_by_role('option', name='PT', exact=True)).to_be_visible()
    role.press('ArrowUp')
    role.press('Enter')
    assert role.input_value() == 'PT'
    role.fill('PT')
    role.press('ArrowDown')
    role.press('Enter')
    assert role.input_value() in ('PT','QL PTKD')
    role.fill('Chức vụ mới QA')
    dialog.get_by_label('Họ và tên', exact=False).fill('Nhân sự mới QA')
    dialog.get_by_label('Số điện thoại', exact=False).fill('0900000099')
    dialog.get_by_label('Cơ sở', exact=True).select_option('23')
    dialog.get_by_role('button', name='Thêm nhân sự', exact=True).click()
    expect(dialog).to_have_count(0)
    assert writes[-1]['body']['position'] == 'Chức vụ mới QA'
    dialog = open_staff()
    dialog.get_by_label('Chức vụ', exact=True).click()
    expect(dialog.get_by_role('option', name='Chức vụ mới QA', exact=True)).to_be_visible()
    dialog.get_by_label('Chức vụ', exact=True).fill('Nhân viên kinh doanh')
    dialog.get_by_label('Họ và tên', exact=False).fill('Nhân sự alias QA')
    dialog.get_by_label('Số điện thoại', exact=False).fill('0900000098')
    dialog.get_by_label('Cơ sở', exact=True).select_option('23')
    dialog.get_by_role('button', name='Thêm nhân sự', exact=True).click()
    expect(dialog).to_have_count(0)
    assert writes[-1]['body']['position'] == 'NVKD'
    checks.append('editable role combobox supports keyboard, PT/TPKD, saved custom suggestions and canonical NVKD writes')

    page.locator('.mg-org-chart').get_by_role('button', name='Xóa Nhân sự PT QA', exact=True).click()
    dialog = page.get_by_role('dialog')
    dialog.get_by_role('button', name='Xóa nhân sự', exact=True).click()
    expect(dialog.get_by_role('alert')).to_be_visible()
    dialog.get_by_role('button', name='Chuyển sang đã nghỉ việc', exact=True).click()
    expect(dialog).to_have_count(0)
    expect(page.locator('.mg-org-chart').get_by_text('Nhân sự PT QA', exact=True)).to_have_count(0)
    checks.append('blocked staff deletion offers retirement and removes the profile from active chart without deleting history')

    for width, height in [(1440,1000),(375,812),(812,375)]:
        page.set_viewport_size({'width':width,'height':height})
        dialog = open_staff()
        dialog.get_by_label('Chức vụ', exact=True).fill('PT')
        expect(dialog.get_by_role('option', name='PT', exact=True)).to_be_visible()
        assert dialog.evaluate('(e) => e.getBoundingClientRect().width <= innerWidth')
        page.screenshot(path=str(out/f'staff-form-{width}.png'), full_page=True)
        dialog.get_by_label('Chức vụ', exact=True).press('Escape')
        expect(dialog).to_be_visible()
        dialog.get_by_role('button', name='Hủy', exact=True).click()
    checks.append('staff dialog and suggestions fit desktop, 375px portrait and 812px landscape; Escape closes popup first')

    page.set_viewport_size({'width':1440,'height':1000})
    page.goto(args.url+'/cashbook', wait_until='domcontentloaded')
    expect(page.get_by_role('button', name='Sửa QA company A', exact=True)).to_be_visible(timeout=30000)
    page.get_by_role('button', name='Sửa QA company A', exact=True).click()
    dialog = page.get_by_role('dialog')
    dialog.get_by_label('Cơ sở', exact=True).select_option('31')
    owner = dialog.get_by_role('combobox', name='Chủ tài khoản', exact=False)
    owner.fill('')
    dialog.get_by_role('button', name='Xóa gợi ý Tên sai QA', exact=True).click()
    expect(dialog.get_by_role('option', name='Tên sai QA', exact=True)).to_have_count(0)
    dialog.get_by_role('option', name='Tên đúng QA', exact=True).click()
    page.screenshot(path=str(out/'company-account-1440.png'), full_page=True)
    dialog.get_by_role('button', name='Lưu tài khoản', exact=True).click()
    expect(dialog).to_have_count(0)
    assert writes[-1]['body']['store_id'] == '31' and writes[-1]['body']['owner_type'] == 'company'
    page.get_by_role('button', name='Sửa QA company A', exact=True).click()
    dialog = page.get_by_role('dialog')
    dialog.get_by_role('combobox', name='Chủ tài khoản', exact=False).fill('')
    expect(dialog.get_by_role('option', name='Tên sai QA', exact=True)).to_have_count(0)
    dialog.get_by_label('Cơ sở', exact=True).select_option('')
    dialog.get_by_role('combobox', name='Chủ tài khoản', exact=False).fill('Tên chung QA')
    dialog.get_by_role('button', name='Lưu tài khoản', exact=True).click()
    expect(dialog).to_have_count(0)
    assert writes[-1]['body']['store_id'] == '0'
    page.get_by_label('Cơ sở đang xem', exact=True).select_option('23')
    expect(page.get_by_role('button', name='Sửa QA company A', exact=True)).to_be_visible()
    expect(page.get_by_role('button', name='Sửa QA shared', exact=True)).to_be_visible()
    expect(page.get_by_role('button', name='Sửa QA company B', exact=True)).to_have_count(0)
    checks.append('company account has editable branch/shared scope; branch filtering excludes other company accounts; remove-owner-suggestion persists locally')

    for width in [1440,375]:
        page.set_viewport_size({'width':width,'height':1000 if width==1440 else 812})
        page.goto(args.url+'/customers', wait_until='domcontentloaded')
        page.get_by_role('button', name='Thêm khách hàng', exact=True).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_label('CCCD / CMND *', exact=True).fill('000000000001')
        dialog.get_by_label('Họ và tên', exact=False).fill('Khách QA')
        dialog.get_by_label('Số điện thoại', exact=False).fill('0900000001')
        dialog.get_by_label('Nơi ở hiện tại', exact=False).fill('Địa chỉ QA')
        dialog.get_by_label('Ngày cấp CCCD / CMND', exact=True).fill('2024-01-15')
        dialog.get_by_label('Nơi cấp CCCD / CMND', exact=True).fill('Nơi cấp QA')
        page.screenshot(path=str(out/f'customer-form-{width}.png'), full_page=True)
        dialog.get_by_role('button', name='Lưu khách hàng', exact=True).click()
        expect(dialog).to_have_count(0)
        assert writes[-1]['body']['id_card_issued_on']=='2024-01-15' and writes[-1]['body']['id_card_issued_by']=='Nơi cấp QA'
    checks.append('customer popup exposes and persists issue date/place on desktop and mobile')
    assert not errors, errors
    (out/'results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors}, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps({'passed':len(checks),'checks':checks}, ensure_ascii=False))
    browser.close()
