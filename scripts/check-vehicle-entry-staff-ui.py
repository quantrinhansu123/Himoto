"""Vehicle form dismissal + TLS source/vehicle branch regression. All business APIs are mocked."""
import argparse
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3014')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='.backups/vehicle-entry-staff-20261020/ui')
parser.add_argument('--contracts-only', action='store_true')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
checks, errors, writes = [], [], []
state = dict(legacy=None, hold_staff=False, inventory_reads=0, inventory_stale=True)
held_staff = []
stores = [dict(id=i, store_name=name, status='opening') for i, name in [(32, 'CS Nguyễn Hoàng'), (36, 'Trụ Sở Chính')]]
staff = [dict(id=7, full_name='Nhân sự Nguyễn Hoàng QA', position='NVKD', status='active', store_id=32),
         dict(id=8, full_name='TLS Huệ QA', position='TLS', status='active', store_id=None),
         dict(id=9, full_name='Nhân sự trụ sở QA', position='NVKD', status='active', store_id=36)]
customer = dict(id=77, name='Khách TLS QA', phone='0900000077', id_card='001234567890', status=1, store_id=36)
vehicles = [dict(id=100, name='WAVE QA', license='QA-00100', brand='Honda', type='xeso', year=2026,
                 status='ready', store_id=32, current_store_id=32, store_name='CS Nguyễn Hoàng', daily_price=140000)]


def mock(route):
    req = route.request
    parsed = urlparse(req.url)
    endpoint = parsed.path
    if endpoint == '/api/auth/gps/refresh':
        route.fulfill(json=dict(status='success', data=dict(refreshed=False, cached=True)))
        return
    if endpoint.startswith('/api/auth/record-photos/'):
        route.fulfill(json=dict(status='success', data=[]))
        return
    if mock_contract_type_read(route):
        return
    if req.method not in ('GET', 'HEAD'):
        body = req.post_data_json
        writes.append(dict(path=endpoint, body=body))
        if endpoint == '/api/auth/order/car-rental' or endpoint in ('/api/auth/order/car-rental/900','/api/auth/order/car-rental/901'):
            saved_id = int(endpoint.rsplit('/',1)[1]) if endpoint.rsplit('/',1)[1].isdigit() else 900
            route.fulfill(status=201, json=dict(status='success', data=dict(id=saved_id, status='draft', draft_reference='NHAP-QA',
                draft_revision='1', store_id=body['draft']['store_id'], draft_payload={'management_composer': body})))
        elif endpoint == '/api/auth/vehicles':
            route.fulfill(status=201, json=dict(status='success', data=dict(id=101, **body)))
        else:
            route.fulfill(status=409, json=dict(status='error', message='QA blocked unexpected mutation'))
            raise AssertionError(f'Unexpected mutation: {endpoint}')
        return
    if endpoint == '/api/auth/stores':
        data = stores
    elif endpoint == '/api/auth/store-directory':
        data = [dict(**s, manager_user_id=None, manager_name=None) for s in stores]
    elif endpoint == '/api/auth/hr/staff':
        branch = parse_qs(parsed.query).get('store_id', [''])[0]
        data = [s for s in staff if not branch or str(s['store_id']) == branch]
        if state['hold_staff']:
            held_staff.append((route, data))
            return
    elif endpoint == '/api/auth/contract-staff':
        data = staff
    elif endpoint in ('/api/auth/vehicle/vehicles', '/api/auth/vehicles/inventory'):
        data = vehicles
        if endpoint.endswith('/inventory'):
            state['inventory_reads'] += 1
            data = [dict(v, rental_blockers=[dict(order_id=800,code='QA-OLD',status='wait_payment',store_name='CS QA')]
                         if state['inventory_stale'] else []) for v in vehicles]
    elif endpoint == '/api/auth/customers/search':
        data = [customer]
    elif endpoint == '/api/auth/order/car-rental' and parse_qs(parsed.query).get('table') == ['1']:
        data = [state['legacy']] if state['legacy'] else []
    elif endpoint in ('/api/auth/order/car-rental/900/payments','/api/auth/order/car-rental/901/payments'):
        data = dict(id=900, code='NHAP-QA', status='draft', store_id=36, revision='1', total_amount=140000,
                    paid_amount=0, remaining=140000, deposit_paid=0, deposit_refunded=0, deposit_held=0,
                    company_paid_amount=0, company_payment_count=0, accounts=[], history=[], items=[], end_date=None)
    elif endpoint == '/api/auth/gps':
        data = dict(devices=[], events=[])
    elif endpoint.startswith('/api/auth/record-photos/') or endpoint in ('/api/auth/customers', '/api/auth/order/car-rental', '/api/auth/payment-events'):
        data = []
    else:
        raise AssertionError(f'Unexpected read: {endpoint}')
    route.fulfill(json=dict(status='success', data=data))


with sync_playwright() as p:
    for engine, size in [(p.chromium, dict(width=1440, height=1000)), (p.webkit, dict(width=390, height=844))]:
        state.update(legacy=None, hold_staff=False, inventory_reads=0, inventory_stale=True)
        browser = engine.launch()
        ctx = browser.new_context(viewport=size, reduced_motion='reduce', timezone_id='Asia/Ho_Chi_Minh',
                                  **(dict(is_mobile=True, has_touch=True) if engine.name == 'webkit' else {}))
        ctx.add_cookies([dict(name='himoto_management_session', value=Path(args.session_cookie_file).read_text().strip(),
                             url=args.url, httpOnly=True, sameSite='Strict')])
        ctx.route('**/api/**', mock)
        ctx.add_init_script("""const originalFetch=window.fetch;window.fetch=function(input,options){
            const url=new URL(typeof input==='string'?input:input.url,location.href);
            if(url.pathname==='/api/auth/payment-events')return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));
            return originalFetch.call(this,input,options);};""")
        page = ctx.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        if not args.contracts_only:
            page.goto(args.url + '/vehicles', wait_until='domcontentloaded', timeout=120000)
            page.get_by_role('button', name='Thêm xe', exact=True).click(timeout=60000)
            dialog = page.get_by_role('dialog', name='Thêm xe', exact=True)
            expect(dialog).to_be_visible()
            dialog.locator('#vehicle-name').fill('WAVE QA đang nhập')
            dialog.locator('#vehicle-license').fill('QA-CHUA-LUU')
            dialog.locator('#vehicle-type').select_option('xeso')
            dialog.locator('#vehicle-store_id').select_option('32')
            page.mouse.click(1, 1)
            expect(dialog).to_be_visible()
            expect(dialog.locator('#vehicle-name')).to_have_value('WAVE QA đang nhập')
            checks.append(f'{engine.name}: outside click and field/select changes retain unsaved vehicle form')
            # A native select cancel must not discard the form; Escape may request an explicit discard confirmation.
            page.keyboard.press('Escape')
            expect(dialog).to_be_visible()
            expect(dialog.get_by_role('button', name='Tiếp tục nhập', exact=True)).to_be_visible()
            dialog.get_by_role('button', name='Tiếp tục nhập', exact=True).click()
            expect(dialog.locator('#vehicle-license')).to_have_value('QA-CHUA-LUU')
            dialog.get_by_role('button', name='Đóng hộp thoại', exact=True).click()
            expect(dialog).to_be_visible()
            dialog.get_by_role('button', name='Tiếp tục nhập', exact=True).click()
            dialog.screenshot(path=str(out / f'vehicle-preserved-{engine.name}.png'))
            dialog.get_by_role('button', name='Hủy', exact=True).click()
            dialog.get_by_role('button', name='Bỏ thay đổi', exact=True).click()
            expect(dialog).not_to_be_visible()
            checks.append(f'{engine.name}: Escape, close and cancel require explicit discard; continuing keeps fields')
        page.goto(args.url + '/contracts', wait_until='domcontentloaded', timeout=120000)
        page.get_by_role('button', name='Nhập hợp đồng', exact=True).click(timeout=60000)
        form = page.locator('dialog.mg-contract-composer')
        expect(form).to_be_visible(timeout=30000)
        tab = lambda name: form.get_by_role('tab', name=name, exact=False).click()
        tab('Khách hàng')
        form.locator('#contract-store').select_option('32')
        expect(form.locator('#contract-staff-options option[value="Nhân sự trụ sở QA"]')).to_have_count(1)
        form.locator('#contract-staff').fill(staff[2]['full_name'])
        form.locator('#contract-id-card').fill(customer['phone'])
        expect(form.locator('#contract-customer-name')).to_have_value(customer['name'])
        tab('Hợp đồng')
        form.get_by_label('Liên kết nguồn khách', exact=True).select_option(label='Trụ Sở Chính')
        form.get_by_label('Nguồn khách', exact=True).fill('Tls')
        expect(form.get_by_label('Nguồn khách', exact=True)).to_have_value('TLS')
        expect(form.locator('#contract-source-staff-options option[value="TLS"]')).to_have_count(1)
        expect(form.locator('#contract-source-staff-options option[value="TLS Huệ QA"]')).to_have_count(0)
        tab('Phương tiện')
        picker = form.locator('#contract-vehicle-0')
        expect(form.get_by_role('button',name='Làm mới kho xe',exact=True)).to_be_enabled()
        picker.click()
        expect(form.locator('#contract-vehicle-0-options-100')).to_have_attribute('aria-disabled','true')
        state['inventory_stale']=False
        form.get_by_role('button',name='Làm mới kho xe',exact=True).click()
        expect(form.get_by_role('button',name='Làm mới kho xe',exact=True)).to_be_enabled()
        picker.click()
        form.locator('#contract-vehicle-0-options-100').click()
        checks.append(f'{engine.name}: refreshing stale stock removes an obsolete settlement blocker and preserves entered customer/staff/source fields')
        tab('Chi phí')
        form.locator('#contract-unit_price').fill('140000')
        form.locator('#contract-deposit_amount').fill('1000000')
        tab('Khách hàng')
        expect(form.locator('#contract-store')).to_have_value('32')
        expect(form.locator('#contract-staff')).to_have_value(staff[2]['full_name'])
        form.screenshot(path=str(out / f'tls-branch-{engine.name}.png'))
        before = len(writes)
        form.get_by_role('button', name='Hoàn tất & thanh toán', exact=True).click()
        expect(page.get_by_role('heading', name='Xác nhận thanh toán', exact=False)).to_be_visible(timeout=20000)
        assert len(writes) == before + 1, writes
        draft = writes[-1]['body']['draft']
        assert (draft['store_id'], draft['vehicle_store_id'], draft['staff_id'], draft.get('tls_staff_id','')) == ('36', '32', '9', ''), draft
        assert draft['customer_source']=='TLS'
        assert not draft.get('sales_staff_id')
        checks.append(f'{engine.name}: generic TLS and a supporting employee from another branch save to payment confirmation without branch restriction')
        legacy_body = json.loads(json.dumps(writes[-1]['body']))
        legacy_body['draft'].update(staff_id='9', staff_name='')
        state['legacy'] = dict(id=901, order_status='draft', draft_reference='NHAP-QA-OLD', draft_revision='1',
            store_id=36, customer_id=77, customer_name=customer['name'], license='QA-00100',
            draft_payload={'management_composer': legacy_body})
        state['hold_staff'] = True
        page.goto(args.url + '/contracts/drafts', wait_until='domcontentloaded')
        page.get_by_role('button', name='Thao tác NHAP-QA-OLD', exact=True).filter(visible=True).click()
        page.get_by_role('menuitem', name='Tiếp tục sửa bản nháp', exact=True).click()
        form = page.locator('dialog.mg-contract-composer')
        expect(form).to_be_visible()
        form.get_by_role('tab',name='Khách hàng',exact=False).click()
        before = len(writes)
        form.locator('#contract-staff').fill('Nhân viên mới hỗ trợ QA')
        form.get_by_role('button', name='Hoàn tất & thanh toán', exact=True).click()
        expect(page.get_by_role('heading', name='Xác nhận thanh toán', exact=False)).to_be_visible()
        assert len(writes) == before+1
        free = writes[-1]['body']['draft']
        assert free['staff_id']=='' and free['staff_name']=='Nhân viên mới hỗ trợ QA'
        state['hold_staff'] = False
        for route, rows in held_staff:
            route.fulfill(json=dict(status='success', data=rows))
        held_staff.clear()
        payment = page.get_by_role('dialog', name='Xác nhận thanh toán', exact=False)
        payment.get_by_role('button', name='Đóng hộp thoại', exact=True).click()
        expect(form.locator('#contract-staff')).to_have_value('Nhân viên mới hỗ trợ QA')
        form.screenshot(path=str(out / f'free-staff-{engine.name}.png'))
        checks.append(f'{engine.name}: a new employee name saves while branch suggestions are still loading, and remains intact after suggestions arrive')
        ctx.unroute_all(behavior='wait')
        ctx.close()
        browser.close()
assert not errors, errors
result = dict(passed=len(checks), checks=checks, mocked_writes=len(writes), real_business_writes=0, errors=errors)
(out / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
