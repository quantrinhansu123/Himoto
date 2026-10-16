"""Synthetic mobile customer entry, photos and payment QA. Business APIs are intercepted."""
import argparse
import base64
import json
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3000')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--browser', default='chromium', choices=['chromium', 'webkit'])
parser.add_argument('--output', default='docs/qa/customer-entry')
args = parser.parse_args()
out = Path(args.output) / args.browser
out.mkdir(parents=True, exist_ok=True)
checks, writes, errors, contracts, photo_data = [], [], [], [], {}
cloud_photos = {}
fail_customer_photo = True
fail_plate_photo = True
stores = [dict(id=31, store_name='Cơ sở QA', code='QA31', status='opening', store_address='Địa chỉ QA', store_phone='0900000090')]
customer = dict(id=7, name='Khách QA', phone='0900000011', id_card='001234567890', status='active', store_id=31,
    store_name='Cơ sở QA', address='Địa chỉ QA', id_card_issued_on='2024-01-01', driver_license_issued_on='2024-02-29',
    relatives=[])
customers = [customer]
staff = [dict(id=700, full_name='Nhân sự QA', staff_code='QA700', position='PT', status='active', store_id=31)]
vehicles = [dict(id=100, name='Xe QA', license='QA-100', brand='Honda', type='xeso', year=2026,
    store_id=31, current_store_id=31, store_name='Cơ sở QA', status='ready', daily_price=200000, monthly_price=3000000, rentals=[])]
accounts = [dict(id=5, label='Tiền mặt QA', kind='cash', store_id=31, owner_type='')]
image_bytes = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6S8AAAAASUVORK5CYII=')

def mock(route):
    global fail_customer_photo, fail_plate_photo
    req = route.request
    parsed = urlparse(req.url)
    endpoint = parsed.path
    if endpoint == '/api/auth/photo-uploads/sign':
        upload_id = req.post_data_json['upload_id']
        route.fulfill(json=dict(status='success', data=dict(cloud_name='qa-cloud', api_key='qa-key', signature='qa-signature', params=dict(public_id=f'himoto/management/143/{upload_id}', type='authenticated', timestamp=1800000000))))
        return
    if endpoint == '/api/auth/photo-ocr':
        route.fulfill(json=dict(status='success', data=dict(fields=dict(name='Khách mới QA', id_card='009876543210') if req.headers.get('x-photo-kind') != 'plate' else {})))
        return
    if endpoint.startswith('/api/auth/record-photos/'):
        parts = endpoint.split('/')
        entity, record_id = parts[4], int(parts[5])
        slot = parts[6] if len(parts) > 6 else None
        key = (entity, record_id, slot)
        if req.method == 'PUT':
            assert req.headers['content-type'] == 'application/json'
            uploaded = cloud_photos[req.post_data_json['public_id']]
            assert uploaded.startswith(bytes([255, 216, 255]))
            if entity == 'customers' and record_id == 8 and fail_customer_photo:
                fail_customer_photo = False
                route.fulfill(status=503, json=dict(status='error', message='Lỗi tải ảnh QA. Bấm lưu lại.'))
                return
            if entity == 'contracts' and fail_plate_photo:
                fail_plate_photo = False
                route.fulfill(status=503, json=dict(status='error', message='Lỗi ảnh biển số QA. Bấm lưu lại.'))
                return
            photo_data[key] = uploaded
            writes.append(dict(path=endpoint, size=len(uploaded)))
            route.fulfill(json=dict(status='success'))
        elif slot:
            route.fulfill(content_type='image/jpeg', body=photo_data[key])
        else:
            route.fulfill(json=dict(status='success', data=[dict(slot=k[2], updated_at='2026-10-16T00:00:00Z') for k in photo_data if k[:2] == (entity, record_id)]))
        return
    if req.method not in ('GET', 'HEAD'):
        body = req.post_data_json
        writes.append(dict(path=endpoint, method=req.method, body=body))
        if endpoint == '/api/auth/customers':
            created = dict(body, id=8, store_name='Cơ sở QA')
            customers.append(created)
            route.fulfill(status=201, json=dict(status='success', data=created))
        elif endpoint == '/api/auth/order/car-rental' and req.method == 'POST':
            record = dict(id=901, draft_reference='NHAP-QA-901', status='draft', store_id=31, draft_revision='901',
                total=0, paid_amount=0, deposit_paid=0, collections=[], draft_payload={'management_composer': {'version': 1, **body}})
            contracts[:] = [record]
            route.fulfill(status=201, json=dict(status='success', data=record))
        elif endpoint == '/api/auth/order/car-rental/901' and req.method == 'PUT':
            assert body['draft']['contract_number'] == 'NHAP-QA-901'
            contracts[0].update(draft_revision='902', draft_payload={'management_composer': {'version': 1, **body}})
            route.fulfill(json=dict(status='success', data=contracts[0]))
        elif endpoint == '/api/auth/order/car-rental/901/finalize':
            assert [(r['purpose'], r['amount']) for r in body['receipts']] == [('deposit', '1000000'), ('rental', '200000')]
            contracts[0].update(status='renting', contract_number='261016-QA-0001', total=200000, paid_amount=200000, deposit_amount=1000000, deposit_paid=1000000)
            route.fulfill(json=dict(status='success', data=dict(order_id=901, code='261016-QA-0001', total_amount=200000,
                deposit_amount=1000000, paid_amount=1200000, transaction_ids=[1, 2])))
        else:
            raise AssertionError(f'Unexpected write {req.method} {endpoint}')
        return
    if endpoint == '/api/auth/customers/search-by-id-card':
        query = parse_qs(parsed.query).get('id_card', [''])[0]
        data = next((c for c in customers if query == c['id_card']), None)
    elif endpoint == '/api/auth/customers/search':
        query = parse_qs(parsed.query).get('query', [''])[0]
        data = [c for c in customers if query in [c['phone'], c['id_card']]]
    elif endpoint == '/api/auth/customers': data = customers
    elif endpoint == '/api/auth/stores': data = stores
    elif endpoint == '/api/auth/hr/staff': data = staff
    elif endpoint == '/api/auth/vehicle/vehicles': data = vehicles
    elif endpoint == '/api/auth/order/car-rental': data = contracts
    elif endpoint == '/api/auth/order/car-rental/901/payments':
        data = dict(id=901, code='NHAP-QA-901', status='draft', store_id=31, revision='901', total_amount=0, paid_amount=0,
            remaining=0, deposit_paid=0, deposit_refunded=0, deposit_held=0, company_paid_amount=0, company_payment_count=0,
            accounts=accounts, history=[], items=[], end_date=None)
    else: raise AssertionError(f'Unexpected read {endpoint}')
    route.fulfill(json=dict(status='success', data=data))

with sync_playwright() as p:
    browser = getattr(p, args.browser).launch()
    context = browser.new_context(viewport=dict(width=375, height=812), timezone_id='Asia/Ho_Chi_Minh', locale='vi-VN', reduced_motion='reduce')
    context.add_cookies([dict(name='himoto_management_session', value=Path(args.session_cookie_file).read_text().strip(), url=args.url, httpOnly=True, sameSite='Strict')])
    context.route('**/api/auth/**', mock)
    def mock_cloud(route):
        captured = page.evaluate('(url) => window.__qaCloudBodies[new URL(url).searchParams.get("qa_upload")]', route.request.url)
        cloud_photos[captured['public_id']] = base64.b64decode(captured['bytes'])
        route.fulfill(json=dict(public_id=captured['public_id'], version=1800000000, signature='qa-response-signature'))
    context.route('https://api.cloudinary.com/**', mock_cloud)
    context.add_init_script('''
      window.__qaCloudBodies = {};
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        if (String(input).startsWith('https://api.cloudinary.com/') && init?.body instanceof FormData) {
          const bytes = new Uint8Array(await init.body.get('file').arrayBuffer());
          let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
          const publicId = init.body.get('public_id');
          window.__qaCloudBodies[publicId] = {public_id:publicId,bytes:btoa(binary)};
          const url = new URL(String(input)); url.searchParams.set('qa_upload',publicId); input = url.href;
        }
        return originalFetch(input, init);
      };
    ''')
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url + '/customers', wait_until='domcontentloaded')
    page.add_style_tag(content='.mg-user-menu strong {visibility:hidden!important;}')
    page.get_by_role('button', name='Thêm khách hàng', exact=True).click()
    dialog = page.get_by_role('dialog', name='Thêm khách hàng tại chỗ')
    expect(dialog.get_by_label('Trạng thái hồ sơ', exact=False)).to_have_value('active')
    dialog.locator('#new-customer-id_card').fill('009876543210')
    dialog.get_by_label('Họ và tên', exact=False).fill('Khách mới QA')
    dialog.get_by_label('Số điện thoại', exact=False).fill('0900000022')
    dialog.get_by_label('Nơi ở hiện tại', exact=False).fill('Địa chỉ QA')
    cccd_date = dialog.get_by_label('Ngày cấp CCCD / CMND', exact=True)
    license_date = dialog.get_by_label('Ngày cấp GPLX', exact=True)
    expect(cccd_date).to_have_attribute('type', 'text')
    expect(cccd_date).to_have_attribute('inputmode', 'numeric')
    cccd_date.fill('31/02/2024')
    dialog.get_by_role('button', name='Lưu khách hàng', exact=True).click()
    expect(cccd_date).to_have_attribute('aria-invalid', 'true')
    assert not writes
    cccd_date.fill('12102024')
    expect(cccd_date).to_have_value('12/10/2024')
    license_date.fill('29/02/2024')
    payload = dict(name='qa.png', mimeType='image/png', buffer=image_bytes)
    camera = dialog.get_by_label('Chụp CCCD mặt trước', exact=True)
    expect(camera).to_have_attribute('capture', 'environment')
    camera.set_input_files(payload)
    dialog.get_by_label('Chọn ảnh CCCD mặt sau', exact=True).set_input_files(payload)
    expect(dialog.locator('.mg-photo-slot img')).to_have_count(2)
    expect(dialog.get_by_role('button', name='Lưu khách hàng', exact=True)).to_be_enabled()
    dialog.screenshot(path=str(out / 'new-customer-375.png'))
    dialog.get_by_role('button', name='Lưu khách hàng', exact=True).click()
    expect(dialog.locator('.mg-error-message')).to_contain_text('Lỗi tải ảnh QA')
    dialog.get_by_role('button', name='Lưu khách hàng', exact=True).click()
    expect(dialog).to_have_count(0)
    creates = [w for w in writes if w['path'] == '/api/auth/customers']
    assert len(creates) == 1
    assert creates[0]['body']['status'] == 'active'
    assert creates[0]['body']['id_card_issued_on'] == '2024-10-12'
    assert creates[0]['body']['driver_license_issued_on'] == '2024-02-29'
    assert len([k for k in photo_data if k[0] == 'customers' and k[1] == 8]) == 2
    checks.append('375px new customer: normal default, direct numeric dates, impossible dates blocked, front/back captures compressed and saved; failed upload retries without creating another customer')

    page.goto(args.url + '/customers', wait_until='domcontentloaded')
    page.get_by_role('searchbox').fill('Khách mới QA')
    page.get_by_role('button', name='Thao tác KH-008', exact=True).click()
    page.get_by_role('menuitem', name='Xem chi tiết', exact=True).click()
    detail = page.get_by_role('dialog')
    expect(detail.locator('.mg-photo-slot img')).to_have_count(2)
    detail.screenshot(path=str(out / 'saved-cccd-375.png'))
    detail.get_by_role('button', name='Đóng', exact=True).click()
    checks.append('customer detail reopens both saved CCCD images through authenticated endpoints')

    page.goto(args.url + '/contracts', wait_until='domcontentloaded')
    page.get_by_role('button', name='Nhập hợp đồng', exact=True).click()
    form = page.locator('dialog.mg-contract-composer')
    form.get_by_role('tab', name='Khách hàng', exact=False).click()
    form.locator('#contract-id-card').fill(customer['phone'])
    expect(form.locator('#contract-customer-name')).to_have_value(customer['name'])
    form.locator('#contract-store').select_option('31')
    form.locator('#contract-staff').fill(staff[0]['full_name'])
    # Inline customer dialog must use the same normal default even when partial profiles are allowed.
    form.get_by_role('button', name='Thêm mới', exact=False).click()
    inline = page.get_by_role('dialog', name='Thêm khách hàng tại chỗ')
    expect(inline.get_by_label('Trạng thái hồ sơ', exact=False)).to_have_value('active')
    inline.get_by_role('button', name='Hủy', exact=True).click()
    form.locator('#contract-id-card').fill(customer['phone'])
    expect(form.locator('#contract-customer-name')).to_have_value(customer['name'])
    form.get_by_role('tab', name='Phương tiện', exact=False).click()
    form.locator('#contract-vehicle-0').click()
    form.locator('#contract-vehicle-0-options-100').click()
    form.get_by_label('Chụp Biển số QA-100', exact=True).set_input_files(payload)
    expect(form.locator('.mg-photo-slot img')).to_have_count(1)
    form.screenshot(path=str(out / 'plate-camera-375.png'))
    form.get_by_role('tab', name='Chi phí', exact=False).click()
    form.locator('#contract-deposit_amount').fill('1000000')
    form.get_by_role('button', name='Hoàn tất & thanh toán', exact=True).click()
    expect(form.locator('.mg-error-message')).to_contain_text('Lỗi ảnh biển số QA')
    form.get_by_role('button', name='Hoàn tất & thanh toán', exact=True).click()
    receipt = page.get_by_role('dialog').filter(has_text='Xác nhận thanh toán')
    expect(receipt.locator('#rental-collection-0-amount')).to_have_value('200.000', timeout=20000)
    assert ('contracts', 901, 'plate-100') in photo_data
    assert len([w for w in writes if w['path'] == '/api/auth/order/car-rental']) == 1
    expect(receipt.locator('[data-purpose=rental]')).to_contain_text('Đã thanh toán đủ')
    receipt.locator('#rental-collection-0-amount').fill('100000')
    expect(receipt.locator('[data-purpose=rental]')).to_contain_text('Thanh toán một phần')
    receipt.get_by_label('Khách đã thanh toán tiền thuê / phí', exact=True).uncheck()
    expect(receipt.locator('[data-purpose=rental]')).to_contain_text('Chưa thanh toán')
    receipt.get_by_label('Khách đã thanh toán tiền thuê / phí', exact=True).check()
    receipt.locator('#rental-collection-0-amount').fill('200000')
    for width, height in [(375, 812), (812, 375), (1440, 1000)]:
        page.set_viewport_size(dict(width=width, height=height))
        receipt.screenshot(path=str(out / f'payment-{width}.png'))
        assert receipt.evaluate('(el)=>el.scrollWidth<=el.clientWidth+1'), receipt.evaluate('''el => ({width:el.clientWidth, scroll:el.scrollWidth, overflowing:[...el.querySelectorAll('*')].filter(x=>x.getBoundingClientRect().right>el.getBoundingClientRect().right+1).map(x=>({tag:x.tagName,id:x.id,cls:x.className,width:x.getBoundingClientRect().width})).slice(0,15)})''')
    receipt.get_by_role('button', name='Xác nhận lưu chính thức', exact=True).click()
    expect(form).to_have_count(0)
    assert len([w for w in writes if w['path'].endswith('/finalize')]) == 1
    checks.append('contract captures plate before saving; completion opens payment confirmation with full/partial/unpaid states, exact receipts and no 375px/landscape/desktop overflow')
    assert not errors, errors
    (out / 'results.json').write_text(json.dumps(dict(passed=len(checks), checks=checks, errors=errors, realBusinessWrites=0), ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(dict(passed=len(checks), checks=checks), ensure_ascii=False))
    browser.close()
