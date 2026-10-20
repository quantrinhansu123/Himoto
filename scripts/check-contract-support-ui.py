"""Contract send/delete/payment/returned-stock flows. Every API is intercepted; no business/provider writes."""
import argparse
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3015')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='.backups/branch-support-20261020/ui')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
checks, errors, writes = [], [], []
state = {}
stores = [dict(id=34, store_name='CS Hàng Bút', status='opening'), dict(id=35, store_name='CS Thuê sở hữu', kind='lease_to_own', status='opening')]
customer = dict(id=77, name='Khách QA Hàng Bút', phone='0900000077', id_card='001234567890', status=1, store_id=34)
staff = [dict(id=8, full_name='Nhân viên hỗ trợ QA', position='NVKD', status='active', store_id=34)]
issued = dict(id=900, contract_number='QA-900', order_status='renting', store_id=34, customer_id=77,
              customer_name=customer['name'], total_amount=170000, paid_amount=170000)
draft = dict(id=901, draft_reference='NHAP-QA-901', order_status='draft', store_id=34, customer_name='Bản nháp QA', draft_revision='7')
root = 'finalize:900:QA-900'


def event(key, status):
    unknown = key == 'unknown-root'
    return dict(key=key, kind='rental', label='Thuê xe QA', phases=['rental'], text='Khách thuê xe QA\nHợp đồng: QA-900\n',
                hash='a' * 64, photo_count=0, video_count=0, status=status, sent_at=None,
                can_send=status == 'manual', unchanged=status in ('pending', 'sent'), attachments=[],
                notice_id='11111111-1111-4111-8111-111111111111', can_retry_confirmed_absent=unknown,
                destination_label='Nhóm cơ sở CS Hàng Bút', delivery_error='TELEGRAM_TIMEOUT' if unknown else None)


def mock(route):
    req = route.request
    parsed = urlparse(req.url)
    endpoint = parsed.path
    if endpoint == '/api/auth/gps/refresh':
        route.fulfill(json=dict(status='success', data=dict(refreshed=False, cached=True)))
        return
    if endpoint.startswith('/api/auth/record-photos/'):
        if req.method not in ('GET', 'HEAD'):
            writes.append(dict(path=endpoint, method=req.method, body=None))
        route.fulfill(json=dict(status='success', data=[]))
        return
    if req.method not in ('GET', 'HEAD'):
        body = req.post_data_json
        writes.append(dict(path=endpoint, method=req.method, body=body))
        if endpoint == '/api/auth/order/car-rental/901/draft':
            assert req.method == 'DELETE'
            if state['stale']:
                state['stale'] = False
                state['revision'] = '8'
                route.fulfill(status=409, json=dict(status='error', message='Bản nháp đã thay đổi. Làm mới danh sách rồi kiểm tra trước khi xóa.'))
            else:
                assert body == dict(revision='8'), body
                state['deleted'] = True
                route.fulfill(json=dict(status='success', data=dict(id=901)))
        elif endpoint == '/api/auth/order/car-rental/900/telegram':
            assert body['action'] == 'send' and body['event_key'] == root, body
            assert state['send'] == 'manual', 'A repeat send was attempted'
            state['send'] = 'pending'
            route.fulfill(json=dict(status='success', data=dict(auto_enabled=False, next_renewal_version=2,
                events=[event(root, 'pending'), event('unknown-root', 'unknown')])))
        elif endpoint in ('/api/auth/order/car-rental', '/api/auth/order/car-rental/902'):
            assert body['draft']['store_id'] == '34', body
            state['new_draft'] = body
            route.fulfill(status=201, json=dict(status='success', data=dict(id=902, status='draft', draft_revision='9',
                draft_reference='NHAP-NEW-QA', store_id=34, draft_payload={'management_composer': body})))
        else:
            route.fulfill(status=409, json=dict(status='error', message='QA blocked unexpected mutation'))
            raise AssertionError(f'Unexpected mutation: {endpoint}')
        return
    if endpoint == '/api/auth/stores':
        data = stores
    elif endpoint == '/api/auth/store-directory':
        data = [dict(**s, manager_user_id=None, manager_name=None) for s in stores]
    elif endpoint in ('/api/auth/hr/staff', '/api/auth/contract-staff'):
        data = staff
    elif endpoint in ('/api/auth/vehicle/vehicles', '/api/auth/vehicles/inventory'):
        blocker = [dict(order_id=888, code='QA-OTHER-888', status='overdue', store_name='CS Thuê sở hữu')] if state['blocked'] else []
        data = [dict(id=100, name='VISION QA', license='QA-00100', brand='Honda', type='xega', year=2026,
            status='using' if blocker else 'ready', store_id=34, current_store_id=34, store_name='CS Hàng Bút',
            daily_price=170000, available=not bool(blocker), rental_blockers=blocker)]
    elif endpoint == '/api/auth/order/car-rental':
        data = [issued] + ([] if state['deleted'] else [dict(draft, draft_revision=state['revision'])])
        if parse_qs(parsed.query).get('scope') == ['drafts']:
            data = [r for r in data if r['order_status'] == 'draft']
    elif endpoint == '/api/auth/contract-telegram-pending':
        data = dict(total=1 + (state['send'] != 'sent'), page=1, rows=[dict(order_id=900, code='QA-900', customer_name=customer['name'],
            event_key=key, event_type='rental', status=status, store_name='CS Hàng Bút', created_at='2026-10-19T10:00:00Z')
            for key, status in ([(root, state['send'])] if state['send'] != 'sent' else []) + [('unknown-root', 'unknown')]])
    elif endpoint == '/api/auth/order/car-rental/900/telegram':
        if state['send'] == 'pending':
            state['send'] = 'sent'
        data = dict(auto_enabled=False, next_renewal_version=2, events=[event(root, state['send']), event('unknown-root', 'unknown')])
    elif endpoint == '/api/auth/order/car-rental/902/payments':
        personal = dict(id=9, kind='bank', store_id=34, owner_type='unknown', account_type=2,
            bank_name='MB Bank', owner_name='QA ONLY', account_number='0000000009', label='CK cá nhân · MB Bank · QA ONLY · 0000000009')
        company = dict(id=18, kind='bank', store_id=34, owner_type='company', label='CK công ty · QA ONLY')
        data = dict(id=902, code='NHAP-NEW-QA', status='draft', revision='9', store_id=34, total_amount=170000,
            paid_amount=0, remaining=170000, deposit_paid=0, deposit_refunded=0, deposit_held=0,
            company_paid_amount=0, company_payment_count=0, accounts=[company] if state['no_personal'] else [personal, company], history=[], items=[], end_date=None)
    elif endpoint == '/api/auth/returns':
        data = [dict(item_id=1001, order_id=900, contract_code='QA-900', order_status='completed', customer_name=customer['name'],
            customer_id_card='', vehicle_id=100, vehicle_name='VISION QA', license='QA-00100', store_id=34, store_name='CS Hàng Bút',
            scheduled_start_at='2026-10-17T10:00:00Z', scheduled_return_at='2026-10-19T10:00:00Z', completed_at='2026-10-19T10:00:00Z',
            item_revision='1', order_revision='2', total_amount=170000, paid_amount=170000, overdue=False, daily_price=170000, deposit_paid=0, deposit_held=0)]
    elif endpoint == '/api/auth/customers/search':
        data = [customer]
    elif endpoint == '/api/auth/gps':
        data = dict(devices=[], events=[])
    elif endpoint.startswith('/api/auth/record-photos/') or endpoint in ('/api/auth/customers', '/api/auth/payment-events'):
        data = []
    elif mock_contract_type_read(route):
        return
    else:
        raise AssertionError(f'Unexpected API read: {endpoint}')
    route.fulfill(json=dict(status='success', data=data))


with sync_playwright() as p:
    for engine, size in [(p.chromium, dict(width=1440, height=1000)), (p.webkit, dict(width=390, height=844))]:
        state.update(deleted=False, stale=True, revision='7', send='manual', blocked=False, no_personal=False)
        browser = engine.launch()
        ctx = browser.new_context(viewport=size, timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce',
            **(dict(is_mobile=True, has_touch=True) if engine.name == 'webkit' else {}))
        ctx.add_cookies([dict(name='himoto_management_session', value=Path(args.session_cookie_file).read_text().strip(),
            url=args.url, httpOnly=True, sameSite='Strict')])
        ctx.route('**/api/**', mock)
        ctx.add_init_script("""const originalFetch=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);
          if(url.pathname==='/api/auth/payment-events')return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return originalFetch.call(this,input,options);};""")
        page = ctx.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))

        def goto(path='/contracts'):
            page.goto(args.url + path, wait_until='domcontentloaded', timeout=120000)
            expect(page.get_by_role('button', name='Nhập hợp đồng', exact=True)).to_be_enabled(timeout=60000)

        def row_action(code, name):
            page.get_by_role('button', name='Thao tác ' + code, exact=True).filter(visible=True).click()
            page.get_by_role('menuitem', name=name, exact=True).click()

        goto()
        page.get_by_role('button', name='Chưa gửi Telegram', exact=True).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_role('button', name='QA-900 · Thuê xe', exact=False).first.click()
        dialog.get_by_role('button', name='Gửi toàn bộ Telegram', exact=False).click()
        expect(dialog.get_by_text('Telegram đã nhận tin và ảnh', exact=False).last).to_be_visible(timeout=15000)
        expect(dialog.get_by_text('Đã xếp thông báo vào hàng đợi.', exact=False)).to_have_count(0)
        assert len([w for w in writes if w['path'].endswith('/telegram')]) == (1 if engine.name == 'chromium' else 2)
        dialog.screenshot(path=str(out / f'telegram-sent-{engine.name}.png'))
        checks.append(f'{engine.name}: saved old transaction opens from pending list, sends once, polls confirmation and locks duplicate send')
        dialog.get_by_role('button', name='Quay lại danh sách', exact=True).click()
        expect(dialog.get_by_text('1 giao dịch chưa gửi đủ', exact=True)).to_be_visible()
        dialog.get_by_role('button', name='QA-900 · Thuê xe', exact=False).filter(has_text='Chưa xác định').click()
        retry = dialog.get_by_role('button', name='Gửi lại sau khi đối chiếu', exact=True)
        expect(retry).to_be_disabled()
        dialog.get_by_role('checkbox', name='Đã kiểm tra nhóm', exact=False).check()
        expect(retry).to_be_enabled()
        checks.append(f'{engine.name}: timeout requires explicit absence confirmation; no automatic historical replay')
        dialog.get_by_role('button', name='Đóng', exact=True).click()

        goto('/contracts/drafts')
        row_action('NHAP-QA-901', 'Xem chi tiết')
        detail = page.get_by_role('dialog', name='Chi tiết hợp đồng:', exact=False)
        expect(detail.get_by_role('button', name='Gửi Telegram', exact=True)).to_have_count(0)
        expect(detail.get_by_role('button', name='Tiếp tục hoàn tất hợp đồng', exact=True)).to_be_enabled()
        detail.get_by_role('tab', name='Telegram', exact=False).click()
        expect(detail.get_by_text('Hợp đồng đang lưu nháp.', exact=False)).to_be_visible()
        detail.screenshot(path=str(out / f'draft-finalize-guidance-{engine.name}.png'))
        detail.get_by_role('button', name='Đóng', exact=True).click()
        checks.append(f'{engine.name}: draft detail offers completion and explains why Telegram requires an issued transaction')
        row_action('NHAP-QA-901', 'Xóa bản nháp')
        dialog = page.get_by_role('dialog', name='Xóa bản nháp?', exact=False)
        before = len(writes)
        dialog.get_by_role('button', name='Giữ bản nháp', exact=True).click()
        assert len(writes) == before
        row_action('NHAP-QA-901', 'Xóa bản nháp')
        dialog.get_by_role('button', name='Xóa bản nháp', exact=True).click()
        expect(dialog.get_by_role('alert')).to_contain_text('Bản nháp đã thay đổi')
        dialog.get_by_role('button', name='Giữ bản nháp', exact=True).click()
        goto('/contracts/drafts')
        row_action('NHAP-QA-901', 'Xóa bản nháp')
        dialog.get_by_role('button', name='Xóa bản nháp', exact=True).click()
        expect(dialog).not_to_be_visible()
        expect(page.get_by_role('button', name='Thao tác NHAP-QA-901', exact=True).filter(visible=True)).to_have_count(0)
        checks.append(f'{engine.name}: delete cancellation writes nothing; stale revision keeps draft; reload then confirm hides only draft')

        goto()
        page.get_by_role('button', name='Nhập hợp đồng', exact=True).click()
        form = page.locator('dialog.mg-contract-composer')
        form.get_by_role('tab', name='Khách hàng', exact=False).click()
        form.locator('#contract-store').select_option('34')
        form.locator('#contract-staff').fill(staff[0]['full_name'])
        form.locator('#contract-id-card').fill(customer['phone'])
        expect(form.locator('#contract-customer-name')).to_have_value(customer['name'])
        form.get_by_role('tab', name='Phương tiện', exact=False).click()
        form.locator('#contract-vehicle-0').click()
        form.locator('#contract-vehicle-0-options-100').click()
        form.get_by_role('tab', name='Chi phí', exact=False).click()
        form.locator('#contract-unit_price').fill('170000')
        form.locator('#contract-deposit_amount').fill('500000')
        for label in ['Hình thức dự kiến nhận cọc', 'Hình thức dự kiến thu thuê/phí']:
            summary = form.get_by_label(label, exact=True)
            summary.click()
            picker = summary.locator('..')
            picker.get_by_label('CK tk cá nhân', exact=True).check()
            for other in ['Tiền mặt', 'CK tk công ty']:
                picker.get_by_label(other, exact=True).uncheck()
            summary.click()
        form.get_by_role('button', name='Hoàn tất & thanh toán', exact=True).click()
        payment = page.get_by_role('dialog', name='Xác nhận thanh toán', exact=False)
        expect(payment.locator('#deposit-collection-0-method')).to_have_value('transfer')
        expect(payment.locator('#deposit-collection-0-account')).to_have_value('bank:9')
        expect(payment.locator('#rental-collection-0-account')).to_have_value('bank:9')
        expect(payment.get_by_role('button', name='Xác nhận lưu chính thức', exact=True)).to_be_enabled()
        payment.screenshot(path=str(out / f'hang-but-personal-{engine.name}.png'))
        checks.append(f'{engine.name}: personal Hàng Bút account_type=2 is selectable for deposit and rental; final confirmation enabled')
        payment.get_by_role('button', name='Đóng hộp thoại', exact=True).click()
        state['no_personal'] = True
        form.get_by_role('button', name='Hoàn tất & thanh toán', exact=True).click()
        expect(payment.locator('#deposit-collection-0-method')).to_have_value('transfer')
        expect(payment.locator('#deposit-collection-0-account')).to_be_disabled()
        expect(payment.get_by_role('button', name='Xác nhận lưu chính thức', exact=True)).to_be_disabled()
        checks.append(f'{engine.name}: missing personal bank blocks confirmation and preserves selected method instead of silently using company bank')

        goto()
        state['blocked'] = True
        row_action('QA-900', 'Trả xe')
        returned = page.get_by_role('dialog', name='Trả xe', exact=False)
        expect(returned.get_by_text('Xe còn được giữ bởi hợp đồng khác.', exact=False)).to_be_visible()
        expect(returned.get_by_role('link', name='QA-OTHER-888', exact=True)).to_be_visible()
        expect(returned.get_by_text('CS Thuê sở hữu', exact=False)).to_be_visible()
        returned.screenshot(path=str(out / f'returned-other-contract-{engine.name}.png'))
        checks.append(f'{engine.name}: already returned car identifies the different blocking contract and its actual branch')
        goto()
        state['blocked'] = False
        row_action('QA-900', 'Trả xe')
        returned = page.get_by_role('dialog', name='Trả xe', exact=False)
        expect(returned.get_by_text('Xe đã về kho và có thể chọn cho hợp đồng mới.', exact=True)).to_be_visible()
        checks.append(f'{engine.name}: reconciled returned car displays stock availability without a second return')
        ctx.unroute_all(behavior='wait')
        ctx.close()
        browser.close()

assert not errors, errors
result = dict(passed=len(checks), checks=checks, mocked_writes=len(writes), real_business_writes=0, real_telegram_messages=0, errors=errors)
(out / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
