"""Actual web UI with synthetic API responses; all mutations are intercepted."""
import argparse
import copy
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3021')
parser.add_argument('--cookie-file', required=True)
parser.add_argument('--output', default='.backups/revenue-renewal-20261111/ui')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
base = dict(id=990, code='PIN-QA-990', store_id=23, store_name='CS QA', status='renting', staff_name='QA',
            customer_name='Khách pin QA', customer_phone='', customer_id=None, customer_id_card='',
            battery_name='Pin + Sạc', vehicle_license='QA-001', starts_at='2026-10-01T09:00',
            ends_at='2026-11-01T09:00', rent_price=300000, price_unit='tháng', package_name='1 tháng',
            paid_amount=300000, deposit_amount=1000000, legacy_paid_amount=0, legacy_deposit_amount=0,
            revision='1', created_at='2026-10-01T02:00:00Z')
amounts = dict(rental=1000000, renewal=500000, late=100000, early=200000, revenue=1400000)
empty = dict(rental=0, renewal=0, late=0, early=0, revenue=0)
report = dict(total=amounts, unassigned=empty, company_fees=0, unclassified_amount=0, unclassified_count=0,
              days=[dict(**amounts, key='2026-11-11', name='2026-11-11', events=4)],
              staff=[dict(**amounts, key='company', name='Công ty', events=4)])
checks, errors, writes = [], [], []
state = {}


def workflow():
    return dict(contract=state['contract'], history=state['history'], accounts=[],
                renewal_amount=300000 if state['history'] else 0, renewal_collected=0,
                renewal_remaining=300000 if state['history'] else 0)


def mock(route):
    req = route.request
    url = urlparse(req.url)
    path = url.path
    if path.endswith('/telegram') and '/battery-contracts/' in path:
        key = req.post_data_json['request_id'] if req.method == 'POST' else parse_qs(url.query)['request_id'][0]
        event = next((e for e in state['history'] if e['request_id'] == key), None)
        title = 'Thuê pin / sạc' if key == 'rental' else 'Trả pin / sạc' if event['action'] == 'return' else 'Gia hạn pin / sạc'
        status = state['notices'].get(key)
        if req.method == 'POST':
            writes.append(dict(path=path, body=req.post_data_json))
            status = state['notices'][key] = 'sent'
        data = dict(eligible=True, battery_contract_id=990, request_id=key, destination_label='Nhóm QA',
                    text=f"{title}\nKhách pin QA\n{'PIN-QA-NEW' if state.get('created') else 'PIN-QA-990'}\nHình thức thanh toán: Chưa ghi nhận thanh toán",
                    status=status, can_send=status is None, message_count=1 if status == 'sent' else 0)
    elif req.method not in ('GET', 'HEAD'):
        body = req.post_data_json
        writes.append(dict(path=path, body=body))
        if path == '/api/auth/battery-contracts/990/actions':
            event = dict(body, at='2026-11-11T02:00:00Z', actor_name='QA', collected=0, remaining=300000)
            if body['action'] == 'renew':
                event['before_ends_at'] = state['contract']['ends_at']
                state['contract']['ends_at'] = body['ends_at']
            else:
                assert body['action'] == 'return'
                state['contract']['status'] = 'returned'
            state['history'].append(event)
            state['contract']['revision'] = str(int(state['contract']['revision']) + 1)
            data = workflow()
        elif path == '/api/auth/battery-contracts' and req.method == 'POST':
            state['created'] = True
            data = dict(base, code='PIN-QA-NEW')
        else:
            raise AssertionError(f'Unexpected mutation: {req.method} {path}')
    elif path == '/api/auth/battery-contracts/990/actions':
        data = workflow()
    elif path == '/api/auth/battery-contracts':
        data = dict(rows=[state['contract']], scopeCount=1)
    elif path == '/api/auth/stores':
        data = [dict(id=23, store_name='CS QA', kind='lease_to_own', status='opening')]
    elif path == '/api/auth/rental-revenue':
        data = report
    elif path == '/api/auth/rental-revenue/estimated-sales':
        data = dict(sales=1000000, contracts=1, vehicles=1, vehicle_days=1, active_contracts=1, finished_contracts=0)
    elif path == '/api/auth/cashbook/accounts':
        data = []
    else:
        data = []
    route.fulfill(json=dict(status='success', data=data))


with sync_playwright() as pw:
    for engine, width in [(pw.chromium, 1440), (pw.webkit, 390)]:
        browser = engine.launch()
        context = browser.new_context(viewport=dict(width=width, height=1000), timezone_id='Asia/Ho_Chi_Minh')
        context.add_cookies([dict(name='himoto_management_session', value=Path(args.cookie_file).read_text().strip(),
                                  url=args.url, httpOnly=True, sameSite='Strict')])
        context.route('**/api/**', mock)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        state.update(contract=copy.deepcopy(base), history=[], notices={}, created=False)
        page.goto(args.url + '/staff-sales', wait_until='domcontentloaded', timeout=120000)
        revenue = page.get_by_role('article', name='Doanh thu thuê xe thực thu', exact=True)
        expect(revenue.locator('[data-revenue-total]')).to_have_text('1.400.000 đ', timeout=60000)
        expect(revenue.locator('[data-revenue="late"]')).to_have_text('100.000 đ')
        expect(revenue.locator('[data-revenue="renewal"]')).to_have_text('500.000 đ')
        expect(revenue).to_contain_text('HĐ bắt đầu trước kỳ')
        revenue.screenshot(path=str(out / f'revenue-{engine.name}.png'))
        checks.append(f'{engine.name}: four-part revenue formula, late/renewal amounts and receipt-date explanation render')
        page.goto(args.url + '/contracts/battery', wait_until='domcontentloaded', timeout=120000)

        def open_action(label):
            page.get_by_role('button', name='Thao tác PIN-QA-990', exact=True).click()
            page.get_by_role('menuitem', name=label, exact=True).click()
            return page.get_by_role('dialog')

        dialog = open_action('Gia hạn pin / sạc')
        dialog.get_by_role('radio', name='Chưa nhận tiền', exact=False).check()
        dialog.get_by_role('button', name='Lưu gia hạn', exact=True).click()
        expect(dialog.locator('.mg-telegram-preview')).to_contain_text('Gia hạn pin / sạc')
        expect(dialog.locator('.mg-telegram-preview')).to_contain_text('Chưa ghi nhận thanh toán')
        dialog.get_by_role('button', name='Gửi thông tin Telegram', exact=True).click()
        expect(dialog.get_by_role('button', name='Đã gửi Telegram', exact=True)).to_be_disabled()
        dialog.screenshot(path=str(out / f'battery-renewal-{engine.name}.png'))
        dialog.get_by_role('button', name='Đóng', exact=True).click()
        dialog = open_action('Gửi / xem Telegram pin / sạc')
        expect(dialog.get_by_role('button', name='Đã gửi Telegram', exact=True)).to_be_disabled()
        dialog.get_by_role('button', name='Gửi / xem Telegram thuê pin / sạc', exact=True).click()
        expect(dialog.locator('.mg-telegram-preview')).to_contain_text('Thuê pin / sạc')
        expect(dialog.get_by_role('button', name='Gửi thông tin Telegram', exact=True)).to_be_enabled()
        dialog.get_by_role('button', name='Đóng', exact=True).click()
        dialog = open_action('Trả pin / sạc')
        dialog.get_by_role('checkbox', name='Đã nhận lại pin', exact=False).check()
        dialog.get_by_role('button', name='Xác nhận trả pin / sạc', exact=True).click()
        expect(dialog.locator('.mg-telegram-preview')).to_contain_text('Trả pin / sạc')
        key = state['history'][-1]['request_id']
        state['notices'][key] = 'unknown'
        dialog.get_by_role('button', name='Làm mới trạng thái', exact=True).click()
        expect(dialog.get_by_role('button', name='Gửi thông tin Telegram', exact=True)).to_be_disabled()
        expect(dialog.get_by_role('alert')).to_contain_text('Chưa rõ Telegram đã nhận')
        dialog.get_by_role('button', name='Đóng', exact=True).click()
        checks.append(f'{engine.name}: renewal opens Telegram, sent state survives reopening, switching selects rental, return opens its event, unknown send is blocked')
        page.get_by_role('button', name='Tạo hợp đồng thuê pin / sạc', exact=True).click()
        form = page.get_by_role('dialog')
        form.get_by_label('Cơ sở cho thuê', exact=False).select_option('23')
        form.get_by_label('Họ tên Ông/Bà', exact=False).fill('Khách pin QA mới')
        form.get_by_role('button', name='Lưu', exact=True).click()
        followup = page.get_by_role('dialog', name='Đã lưu hợp đồng · PIN-QA-NEW', exact=True)
        expect(followup.locator('.mg-telegram-preview')).to_contain_text('Thuê pin / sạc')
        expect(followup.get_by_role('button', name='Gửi thông tin Telegram', exact=True)).to_be_enabled()
        followup.screenshot(path=str(out / f'battery-rental-{engine.name}.png'))
        followup.get_by_role('button', name='Đóng', exact=True).click()
        checks.append(f'{engine.name}: newly saved battery contract opens rental Telegram confirmation before closing')
        context.close()
        browser.close()
assert not errors, errors
result = dict(passed=len(checks), checks=checks, simulatedWrites=len(writes), realBusinessWrites=0, telegramSends=0, jsErrors=errors)
(out / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
