"""Synthetic OCR concurrency and form-edit QA; all business/provider APIs are intercepted."""
from lib.contract_type_fixtures import mock_contract_type_read
import argparse
import base64
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3000')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--browser', default='chromium', choices=['chromium', 'webkit'])
parser.add_argument('--output', default='docs/qa/photo-ocr')
args = parser.parse_args()
out = Path(args.output) / args.browser
out.mkdir(parents=True, exist_ok=True)
checks, errors, pending_cloud, pending_ocr = [], [], [], []
mode = 'hold'
cloud_available = True
stores = [dict(id=31, store_name='Cơ sở QA', status='opening')]
vehicles = [dict(id=i, name=f'Xe QA {i}', license=license, brand='Honda', type='xeso', status='ready',
    store_id=31, current_store_id=31, store_name='Cơ sở QA', daily_price=200000, rentals=[])
    for i, license in [(100, '29B1-123.45'), (101, '29B1-543.21')]]
vehicles[0].update(status='using', rentals=[dict(order_id=888,code='QA-OVERDUE',customer='Khách đang thuê QA',status='overdue',return_at='2026-10-15T13:00:00+07:00')])
lookup_requests = []
pixel = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6S8AAAAASUVORK5CYII=')
payload = dict(name='qa.png', mimeType='image/png', buffer=pixel)

def fulfill_ocr(route, fields):
    route.fulfill(json=dict(status='success', data=dict(fields=fields)))

def mock(route):
    if mock_contract_type_read(route): return
    req = route.request
    path = urlparse(req.url).path
    if path == '/api/auth/photo-uploads/sign':
        if not cloud_available:
            route.fulfill(status=503, json=dict(status='error', message='Chưa cấu hình Cloudinary QA'))
        else:
            route.fulfill(json=dict(status='success', data=dict(cloud_name='qa-cloud', api_key='qa-key', signature='qa-signature',
                params=dict(public_id='himoto/management/143/' + req.post_data_json['upload_id'], type='authenticated', timestamp=1800000000))))
    elif path == '/api/auth/photo-ocr':
        kind = req.headers.get('x-photo-kind')
        if mode == 'hold': pending_ocr.append((route, kind))
        elif mode == 'quota': route.fulfill(status=503, json=dict(status='error', message='Gemini đang giới hạn lượt đọc QA'))
        else: fulfill_ocr(route, dict(license='29B1-123.45') if kind == 'plate' else dict(id_card='001234567890', name='Tên đọc từ AI QA'))
    elif path.startswith('/api/auth/record-photos/'):
        route.fulfill(json=dict(status='success', data=[]))
    elif path == '/api/auth/customers/search':
        lookup_requests.append(req.url)
        if '009999999999' in req.url:
            data=[dict(id=8,name='Khách blacklist cũ QA',phone='0900000002',id_card='009999999999',store_id=31,status='blacklist',warning='Cảnh báo hồ sơ có sẵn QA',address='Địa chỉ hồ sơ cũ')]
        else:
            data=[dict(id=7,name='Khách hợp đồng QA',phone='0900000001',id_card='001234567890',store_id=31,status='active',address='Địa chỉ QA')]
        route.fulfill(json=dict(status='success', data=data))
    else:
        assert req.method == 'GET', f'Unexpected business write: {req.method} {path}'
        data = {'/api/auth/customers': [], '/api/auth/stores': stores, '/api/auth/vehicle/vehicles': vehicles,
                '/api/auth/order/car-rental': [], '/api/auth/hr/staff': []}.get(path)
        assert data is not None, path
        route.fulfill(json=dict(status='success', data=data))

with sync_playwright() as p:
    browser = getattr(p, args.browser).launch()
    context = browser.new_context(viewport=dict(width=375, height=812), timezone_id='Asia/Ho_Chi_Minh', locale='vi-VN', reduced_motion='reduce')
    context.add_cookies([dict(name='himoto_management_session', value=Path(args.session_cookie_file).read_text().strip(), url=args.url, httpOnly=True, sameSite='Strict')])
    context.route('**/api/auth/**', mock)
    context.route('https://api.cloudinary.com/**', lambda route: pending_cloud.append(route))
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url + '/customers', wait_until='domcontentloaded')
    page.get_by_role('button', name='Thêm khách hàng', exact=True).click()
    dialog = page.get_by_role('dialog', name='Thêm khách hàng tại chỗ')
    dialog.locator('#new-customer-name').fill('Tên trước khi chụp QA')
    dialog.locator('#new-customer-id_card').fill('009876543210')
    dialog.locator('#new-customer-phone').fill('0900000001')
    def cancel_photo_picker(container, input_label):
        field = container.get_by_label(input_label, exact=True)
        slot = field.locator('..')
        button = slot.get_by_role('button', name='Chụp ảnh' if input_label.startswith('Chụp ') else 'Chọn ảnh', exact=True)
        with page.expect_file_chooser() as chooser:
            button.click()
        chooser.value.set_files([])
        field.dispatch_event('cancel', dict(bubbles=True, cancelable=False))
        expect(container).to_be_visible()
    for label in ['Chụp CCCD mặt trước', 'Chọn ảnh CCCD mặt trước', 'Chụp CCCD mặt sau', 'Chọn ảnh CCCD mặt sau']:
        cancel_photo_picker(dialog, label)
        expect(dialog.locator('#new-customer-name')).to_have_value('Tên trước khi chụp QA')
        expect(dialog.locator('#new-customer-id_card')).to_have_value('009876543210')
        expect(dialog.locator('#new-customer-phone')).to_have_value('0900000001')
    assert not pending_ocr and not pending_cloud
    checks.append('Canceling camera/library on either CCCD side keeps the customer form and typed values, without starting OCR/uploads')
    dialog.get_by_label('Chụp CCCD mặt trước', exact=True).set_input_files(payload)
    expect(dialog.get_by_text('AI đang đọc ảnh…', exact=True)).to_be_visible()
    page.wait_for_function('document.querySelectorAll(".mg-photo-slot img").length === 1')
    dialog.locator('#new-customer-name').fill('Tên người dùng tự sửa QA')
    dialog.locator('#new-customer-phone').fill('0900000001')
    assert pending_ocr and pending_ocr[0][1] == 'cccd_front'
    route, _ = pending_ocr.pop(0)
    fulfill_ocr(route, dict(id_card='001234567890', name='Tên đọc từ AI QA', address='Địa chỉ trên CCCD QA'))
    expect(dialog.locator('#new-customer-id_card')).to_have_value('001234567890')
    expect(dialog.locator('#new-customer-name')).to_have_value('Tên người dùng tự sửa QA')
    expect(dialog.locator('#new-customer-address')).to_have_value('')
    dialog.locator('#new-customer-address').fill('Nơi ở hiện tại gõ tay QA')
    expect(dialog.get_by_text('Đang tải ảnh…', exact=True)).to_be_visible()
    assert pending_cloud, 'Cloudinary upload must already be running while OCR completes'
    checks.append('Front OCR replaces the pre-entered identity without matching warnings, leaves current address blank and preserves edits made while AI was reading')

    dialog.get_by_label('Chụp CCCD mặt sau', exact=True).set_input_files(payload)
    expect(dialog.get_by_text('AI đang đọc ảnh…', exact=True)).to_be_visible()
    route, kind = pending_ocr.pop(0)
    assert kind == 'cccd_back'
    fulfill_ocr(route, dict(id_card='009999999999', id_card_issued_on='12/10/2024', id_card_issued_by='Cơ quan cấp QA', address='Thường trú không được điền'))
    expect(dialog.locator('#new-customer-id_card')).to_have_value('009999999999')
    expect(dialog.locator('#new-customer-id_card_issued_on')).to_have_value('12')
    expect(dialog.locator('#new-customer-id_card_issued_on-month')).to_have_value('10')
    expect(dialog.locator('#new-customer-id_card_issued_on-year')).to_have_value('2024')
    expect(dialog.locator('#new-customer-id_card_issued_by')).to_have_value('Cơ quan cấp QA')
    expect(dialog.locator('#new-customer-address')).to_have_value('Nơi ở hiện tại gõ tay QA')
    expect(dialog.get_by_text('không khớp', exact=False)).to_have_count(0)
    expect(dialog.locator('#new-customer-status')).to_have_value('active')
    expect(dialog.get_by_role('button', name='Lưu khách hàng', exact=True)).to_be_enabled()
    assert len(pending_cloud) == 2
    dialog.screenshot(path=str(out / 'cccd-autofill-parallel-375.png'))
    checks.append('back OCR fills issue date and issuer from the second image; 0-prefixed identity, manual phone/name and normal profile status remain intact')
    for label in ['Chụp CCCD mặt trước', 'Chọn ảnh CCCD mặt sau']:
        cancel_photo_picker(dialog, label)
        expect(dialog.locator('.mg-photo-slot img')).to_have_count(2)
        expect(dialog.locator('#new-customer-id_card_issued_on-year')).to_have_value('2024')
        expect(dialog.locator('#new-customer-address')).to_have_value('Nơi ở hiện tại gõ tay QA')
    checks.append('Canceling photo replacement retains both previews, OCR results and manually entered current address')

    # Replacing a photo aborts its old request. A response for the old image must not modify the form.
    dialog.get_by_label('Chụp CCCD mặt trước', exact=True).set_input_files(payload)
    expect(dialog.get_by_text('AI đang đọc ảnh…', exact=True)).to_be_visible()
    old_route, _ = pending_ocr.pop(0)
    mode = 'ready'
    dialog.get_by_label('Chụp CCCD mặt trước', exact=True).set_input_files(payload)
    expect(dialog.get_by_text('AI đang đọc ảnh…', exact=True)).to_have_count(0)
    try: fulfill_ocr(old_route, dict(id_card='009999999999', address='Ảnh cũ không được áp dụng'))
    except Exception: pass
    expect(dialog.locator('#new-customer-id_card')).to_have_value('001234567890')
    expect(dialog.locator('#new-customer-address')).to_have_value('Nơi ở hiện tại gõ tay QA')
    mode = 'quota'
    back = dialog.locator('.mg-photo-grid > div').filter(has_text='CCCD mặt sau')
    back.get_by_role('button', name='Đọc lại ảnh', exact=True).click()
    expect(back.get_by_role('alert')).to_contain_text('giới hạn lượt đọc QA')
    expect(dialog.get_by_role('button', name='Lưu khách hàng', exact=True)).to_be_enabled()
    expect(dialog.locator('.mg-photo-slot img')).to_have_count(2)
    dialog.get_by_role('button', name='Hủy', exact=True).click()
    checks.append('photo replacement ignores stale OCR; provider errors preserve inputs/photos and allow manual entry without retrying automatically')

    mode = 'ready'
    page.goto(args.url + '/contracts', wait_until='domcontentloaded')
    page.get_by_role('button', name='Nhập hợp đồng', exact=True).click()
    form = page.locator('dialog.mg-contract-composer')
    form.get_by_role('tab', name='Khách hàng', exact=False).click()
    form.locator('#contract-id-card').fill('0900000001')
    expect(form.locator('#contract-customer-name')).to_have_value('Khách hợp đồng QA')
    form.locator('#contract-customer-address').fill('Nơi đang ở gõ tay trên hợp đồng')
    form.get_by_role('button', name='Thêm mới', exact=True).click()
    nested = page.get_by_role('dialog', name='Thêm khách hàng tại chỗ', exact=True)
    nested.locator('#new-customer-name').fill('Khách mới nhập trong hợp đồng QA')
    nested.locator('#new-customer-phone').fill('0900000022')
    for label in ['Chụp CCCD mặt trước', 'Chọn ảnh CCCD mặt sau']:
        cancel_photo_picker(nested,label)
        expect(form).to_be_visible()
        expect(nested.locator('#new-customer-name')).to_have_value('Khách mới nhập trong hợp đồng QA')
    nested.dispatch_event('cancel',dict(bubbles=True,cancelable=True))
    expect(nested).not_to_be_visible()
    expect(form).to_be_visible()
    form.locator('#contract-id-card').fill('0900000001')
    expect(form.locator('#contract-customer-name')).to_have_value('Khách hợp đồng QA')
    form.locator('#contract-customer-address').fill('Nơi đang ở gõ tay trên hợp đồng')
    checks.append('Canceling photo pickers in the nested customer dialog preserves child and parent; explicit dialog cancellation still closes only that dialog')
    mode = 'hold'
    form.get_by_label('Chụp CCCD mặt sau', exact=True).set_input_files(payload)
    expect(form.get_by_text('AI đang đọc ảnh…', exact=True)).to_be_visible()
    form.get_by_role('tab', name='Phương tiện', exact=False).click()
    form.get_by_label('Chụp Biển số để tự chọn xe', exact=True).set_input_files(payload)
    expect(form.get_by_text('AI đang đọc ảnh…', exact=True)).to_have_count(2)
    pending_by_kind = {kind: route for route, kind in pending_ocr}
    pending_ocr.clear()
    fulfill_ocr(pending_by_kind['plate'], dict(license='29B1-123.45'))
    fulfill_ocr(pending_by_kind['cccd_back'], dict(id_card='009999999999',name='Tên trên CCCD mới QA',id_card_issued_on='2024-10-12', id_card_issued_by='Cơ quan QA',address='Không lấy từ CCCD'))
    expect(form.locator('#contract-vehicle-0')).to_have_value('Xe QA 100 · 29B1-123.45')
    expect(form.locator('#contract-customer-id_card_issued_on')).to_have_value('12')
    expect(form.locator('#contract-customer-id_card_issued_on-month')).to_have_value('10')
    expect(form.locator('#contract-customer-id_card_issued_on-year')).to_have_value('2024')
    expect(form.get_by_text('Đã đọc biển số 29B1-123.45 và chọn xe Xe QA 100.', exact=True)).to_be_visible()
    expect(form.get_by_label('Chụp Biển số 29B1-123.45', exact=True)).to_have_count(1)
    expect(form.get_by_text('Cảnh báo: Quá hạn chưa trả',exact=True)).to_be_visible()
    expect(form.get_by_text('QA-OVERDUE',exact=False)).to_be_visible()
    form.get_by_role('tab', name='Khách hàng', exact=False).click()
    expect(form.locator('.mg-customer-status')).to_have_text('Cảnh báo: khách hàng bị chặn / có nợ xấu')
    expect(form.locator('#contract-customer-name')).to_have_value('Tên trên CCCD mới QA')
    expect(form.locator('#contract-customer-address')).to_have_value('Nơi đang ở gõ tay trên hợp đồng')
    expect(form.locator('#contract-customer-id_card_issued_by')).to_have_value('Cơ quan QA')
    assert any('009999999999' in request for request in lookup_requests)
    form.get_by_role('tab', name='Phương tiện', exact=False).click()
    cancel_photo_picker(form,'Chụp Biển số để tự chọn xe')
    cancel_photo_picker(form,'Chọn ảnh Biển số 29B1-123.45')
    expect(form.locator('#contract-vehicle-0')).to_have_value('Xe QA 100 · 29B1-123.45')
    form.screenshot(path=str(out / 'plate-select-375.png'))
    checks.append('Concurrent CCCD/plate reads preserve fields/photos and handwritten current address; new identity uses ordinary customer lookup/blacklist, and selected rented vehicle uses its existing overdue warning')

    form.get_by_role('button', name='Bỏ chọn xe 1', exact=True).click()
    mode = 'hold'
    form.get_by_label('Chụp Biển số để tự chọn xe', exact=True).set_input_files(payload)
    expect(form.get_by_text('AI đang đọc ảnh…', exact=True)).to_be_visible()
    form.locator('#contract-vehicle-0').click()
    form.locator('#contract-vehicle-0-options-101').click()
    route, kind = pending_ocr.pop(0)
    assert kind == 'plate'
    fulfill_ocr(route, dict(license='29B1-123.45'))
    expect(form.locator('#contract-vehicle-0')).to_have_value('Xe QA 101 · 29B1-543.21')
    expect(form.get_by_text('Lựa chọn xe đã thay đổi', exact=False)).to_be_visible()
    for width, height in [(375, 812), (1440, 1000)]:
        page.set_viewport_size(dict(width=width, height=height))
        form.screenshot(path=str(out / f'plate-manual-preserved-{width}.png'))
        assert form.evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
    checks.append('manual vehicle selection during OCR is preserved; mobile and desktop camera/status layouts fit without overflow')
    assert not errors, errors
    result = dict(passed=len(checks), checks=checks, errors=errors, realBusinessWrites=0, realProviderCalls=0)
    (out / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
    for route in pending_cloud:
        try: route.abort()
        except Exception: pass
    page.wait_for_timeout(100)
    browser.close()
