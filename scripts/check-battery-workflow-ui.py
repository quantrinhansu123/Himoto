"""Battery workflow and destination receive UI; all browser API writes are mocked."""
import argparse
import copy
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3017')
parser.add_argument('--admin-session', required=True)
parser.add_argument('--staff-session', required=True)
parser.add_argument('--output', default='.backups/ownership-support-20261020/ui')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
checks, errors, writes = [], [], []
state = {}
stores = [dict(id=35, store_name='CS Thuê sở hữu', kind='lease_to_own', status='opening')]
base = dict(id=990, code='PIN-QA-990', store_id=35, store_name='CS Thuê sở hữu', store_address='', store_phone='',
            customer_id=None, customer_name='Khách pin QA', customer_phone='0900000000', customer_address='', customer_id_card='',
            status='renting', staff_name='QA', signed_on='2026-01-31', signed_place='', id_card_issued_on='', id_card_issued_by='',
            battery_name='Pin xe điện', vehicle_license='QA-001', vehicle_brand='Vinfast', vehicle_type='Xe điện', vehicle_color='', vehicle_year='',
            starts_at='2026-01-31T09:30', ends_at='2026-02-28T09:30', rent_price=300000, price_unit='tháng', package_name='1 tháng',
            paid_amount=300000, paid_method='CK', deposit_amount=3000000, deposit_method='TM', deposit_note='', notes='',
            created_at='2026-01-31T02:30:00Z', revision='1')
accounts = [dict(id=11, kind='bank', store_id=35, owner_type='unknown', status='Active', label='MB · Cá nhân QA · 0011'),
            dict(id=12, kind='bank', store_id=35, owner_type='company', status='Active', label='MB · Công ty QA · 0012')]


def context():
    return dict(contract=state['battery'], history=state['history'], accounts=accounts,
                renewal_amount=state['fee'], renewal_collected=state['paid'], renewal_remaining=state['fee'] - state['paid'])


def mock(route):
    req = route.request
    path = urlparse(req.url).path
    if path == '/api/auth/gps/refresh':
        route.fulfill(json=dict(status='success', data=dict(refreshed=False, cached=True)))
        return
    if req.method not in ('GET', 'HEAD'):
        body = req.post_data_json
        writes.append(dict(path=path, method=req.method, body=body))
        assert path == '/api/auth/battery-contracts/990/actions', f'Unexpected mutation: {path}'
        if state['fail']:
            route.fulfill(status=500, json=dict(status='error', message='QA: mất phản hồi; kiểm tra lịch sử'))
            return
        event = dict(body, actor_id=143, actor_name='QA', at='2026-10-20T15:00:00Z', request_hash='a' * 64)
        if body['action'] == 'renew':
            assert body['ends_at'] == '2026-03-28T09:30', body
            event['before_ends_at'] = state['battery']['ends_at']
            state['battery']['ends_at'] = body['ends_at']
            state['fee'] += body['amount']
            event.update(collected=body['amount'] if body.get('receipt') else 0, remaining=0 if body.get('receipt') else body['amount'])
        elif body['action'] == 'collect_renewal':
            assert body['renewal_id'] == state['history'][0]['request_id']
            state['history'][0].update(collected=body['amount'], remaining=0)
            event['collected'] = body['amount']
        elif body['action'] == 'return':
            state['battery']['status'] = 'returned'
        else:
            raise AssertionError(body)
        if body.get('receipt'):
            assert body['receipt']['method'] == 'transfer' and body['receipt']['account_id'] == 11, body
            event['transaction_id'] = 12345
            state['paid'] += body['amount']
            state['battery']['paid_amount'] += body['amount']
        state['history'].append(event)
        state['battery']['revision'] = str(int(state['battery']['revision']) + 1)
        route.fulfill(json=dict(status='success', data=context()))
        return
    if path == '/api/auth/battery-contracts/990/actions':
        data = context()
    elif path == '/api/auth/battery-contracts':
        data = [state['battery']]
    elif path == '/api/auth/stores':
        data = stores
    elif path in ('/api/auth/hr/staff', '/api/auth/contract-staff'):
        data = []
    elif path == '/api/auth/vehicle/vehicles':
        data = [dict(id=1336, name='Wave', license='20AA-903.64', status='in_transit', type='xeso', store_id=32,
                     current_store_id=35, store_name='CS Thuê sở hữu', transfer_event_id=341, transfer_from_store_id=32,
                     transfer_to_store_id=35, transfer_from_store_name='CS Nguyễn Hoàng', transfer_to_store_name='CS Thuê sở hữu')]
    elif path == '/api/auth/vehicles/inventory':
        data = []
    elif path == '/api/auth/gps/refresh':
        data = dict(refreshed=False, cached=True)
    elif path == '/api/auth/gps':
        data = dict(devices=[], events=[])
    else:
        data = []
    route.fulfill(json=dict(status='success', data=data))


with sync_playwright() as p:
    for engine, viewport in [(p.chromium, dict(width=1440, height=1000)), (p.webkit, dict(width=375, height=812))]:
        browser = engine.launch()
        ctx = browser.new_context(viewport=viewport, timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce',
                                  **(dict(is_mobile=True, has_touch=True) if engine.name == 'webkit' else {}))
        ctx.add_cookies([dict(name='himoto_management_session', value=Path(args.admin_session).read_text().strip(), url=args.url, httpOnly=True, sameSite='Strict')])
        ctx.route('**/api/**', mock)
        page = ctx.new_page()
        page.on('pageerror', lambda error: errors.append(dict(engine=engine.name, phase=state.get('phase'), message=str(error), stack=error.stack)))

        def reset():
            if page.locator('table.mg-table-battery').count():
                expect(page.locator('table.mg-table-battery')).to_have_attribute('aria-busy', 'false')
            state.update(battery=copy.deepcopy(base), history=[], fee=0, paid=0, fail=False)
            page.goto(args.url + '/contracts/battery', wait_until='domcontentloaded', timeout=120000)
            expect(page.get_by_role('button', name='Thao tác PIN-QA-990', exact=True)).to_be_visible(timeout=60000)

        def action(name):
            page.get_by_role('button', name='Thao tác PIN-QA-990', exact=True).click()
            page.get_by_role('menuitem', name=name, exact=True).click()
            return page.get_by_role('dialog')

        def choose_personal(dialog):
            dialog.get_by_role('combobox', name='Hình thức thanh toán', exact=True).select_option('transfer')
            expect(dialog.get_by_role('combobox', name='Tài khoản nhận', exact=True)).to_have_value('11')

        reset()
        state['phase'] = 'unpaid renewal'
        dialog = action('Gia hạn pin / sạc')
        expect(dialog.get_by_label('Chi phí gia hạn (VNĐ)', exact=True)).to_have_value('300.000')
        expect(dialog.locator('#battery-renewal-end')).to_have_value('2026-03-28')
        dialog.get_by_role('radio', name='Chưa nhận tiền', exact=False).check()
        dialog.get_by_label('Ghi chú', exact=True).fill('Gia hạn pin theo tháng')
        dialog.screenshot(path=str(out / f'battery-renewal-{engine.name}.png'))
        dialog.get_by_role('button', name='Lưu gia hạn', exact=True).click()
        expect(dialog.get_by_text('Nợ gia hạn', exact=True)).to_be_visible()
        assert state['paid'] == 0 and state['fee'] == 300000
        checks.append(f'{engine.name}: monthly date/rate suggestion, explicit unpaid renewal and recorded debt')
        state['phase'] = 'debt collection'
        dialog.get_by_role('button', name='Thu tiền gia hạn', exact=True).click()
        choose_personal(dialog)
        dialog.get_by_role('button', name='Lưu và thu tiền gia hạn', exact=True).click()
        expect(dialog.get_by_role('button', name='Thu tiền gia hạn', exact=True)).to_have_count(0)
        assert state['paid'] == 300000 and state['battery']['ends_at'] == '2026-03-28T09:30'
        expect(page.locator('table.mg-table-battery')).to_have_attribute('aria-busy', 'false')
        checks.append(f'{engine.name}: later collection chooses the exact branch account and does not extend the date again')
        dialog.get_by_role('button', name='Đóng', exact=True).click()
        state['phase'] = 'return'
        dialog = action('Trả pin / sạc')
        dialog.get_by_role('checkbox', name='Đã nhận lại pin', exact=False).check()
        dialog.get_by_role('button', name='Xác nhận trả pin / sạc', exact=True).click()
        expect(dialog.get_by_text('Nhận lại lúc:', exact=False)).to_be_visible()
        assert state['battery']['status'] == 'returned' and state['battery']['deposit_amount'] == 3000000
        expect(page.locator('table.mg-table-battery')).to_have_attribute('aria-busy', 'false')
        dialog.get_by_role('button', name='Đóng', exact=True).click()
        page.get_by_role('button', name='Thao tác PIN-QA-990', exact=True).click()
        expect(page.get_by_role('menuitem', name='Gia hạn pin / sạc', exact=True)).to_have_count(0)
        page.keyboard.press('Escape')
        checks.append(f'{engine.name}: confirmed return retains deposit and removes renewal from returned contracts')
        reset()
        state['phase'] = 'immediate collection'
        dialog = action('Gia hạn pin / sạc')
        dialog.get_by_role('radio', name='Đã thực nhận tiền', exact=False).check()
        expect(dialog.get_by_text('Chưa có tài khoản đang hoạt động', exact=False)).to_be_visible()
        expect(dialog.get_by_role('button', name='Lưu và thu tiền gia hạn', exact=True)).to_be_disabled()
        choose_personal(dialog)
        dialog.get_by_role('button', name='Lưu và thu tiền gia hạn', exact=True).click()
        expect(dialog.get_by_text('Phiếu thu #12345', exact=False)).to_be_visible()
        expect(page.locator('table.mg-table-battery')).to_have_attribute('aria-busy', 'false')
        checks.append(f'{engine.name}: immediate receipt, missing cash account blocks saving without switching the method')
        reset()
        state['phase'] = 'uncertain response'
        state['fail'] = True
        dialog = action('Gia hạn pin / sạc')
        dialog.get_by_role('radio', name='Chưa nhận tiền', exact=False).check()
        before = len(writes)
        dialog.get_by_role('button', name='Lưu gia hạn', exact=True).click()
        expect(dialog.get_by_role('alert')).to_contain_text('mất phản hồi')
        expect(dialog.get_by_role('button', name='Lưu gia hạn', exact=True)).to_be_disabled()
        assert len(writes) == before + 1
        checks.append(f'{engine.name}: uncertain save is locked pending history review, with no automatic retry')
        ctx.close()
        state['phase'] = 'staff receive'
        # Actual ownership-staff server role; API fixtures retain a pending destination transfer.
        staff = browser.new_context(viewport=viewport, timezone_id='Asia/Ho_Chi_Minh')
        staff.add_cookies([dict(name='himoto_management_session', value=Path(args.staff_session).read_text().strip(), url=args.url, httpOnly=True, sameSite='Strict')])
        staff.route('**/api/**', mock)
        page = staff.new_page()
        page.on('pageerror', lambda error: errors.append(dict(engine=engine.name, phase=state.get('phase'), message=str(error), stack=error.stack)))
        page.goto(args.url + '/vehicles', wait_until='domcontentloaded', timeout=120000)
        receive = page.get_by_role('button', name='Nhận xe', exact=True).filter(visible=True)
        # Desktop receive is inside the row menu; mobile also offers a direct button.
        if viewport['width'] > 600:
            page.get_by_role('button', name='Thao tác', exact=False).filter(visible=True).first.click()
            receive = page.get_by_role('menuitem', name='Nhận xe', exact=True)
        expect(receive).to_be_visible(timeout=30000)
        receive.scroll_into_view_if_needed()
        page.screenshot(path=str(out / f'ownership-receive-{engine.name}.png'))
        checks.append(f'{engine.name}: ownership staff sees receive action on destination pending transfer')
        staff.close()
        browser.close()

assert not errors, errors
result = dict(passed=len(checks), checks=checks, errors=errors, simulatedWrites=len(writes), realBusinessWrites=0, realTelegramMessages=0)
(out / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
