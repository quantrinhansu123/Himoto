"""Ownership billing/collections/reminders QA. Every business API uses synthetic data."""
import argparse
import json
import re
import fitz
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3005')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='.backups/ownership/ui')
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
zone = timezone(timedelta(hours=7))
state = {'order': None, 'paid': 0, 'deposit': 0, 'now': '2026-10-13T09:00', 'history': []}
errors, blocked, saved, checks = [], [], [], []
customer = {'id': 77, 'name': 'Khách sở hữu QA', 'phone': '0900000077', 'id_card': '001234567877', 'address': 'Địa chỉ QA',
            'id_card_issued_on': '2024-01-15', 'id_card_issued_by': 'Nơi cấp QA', 'status': 'active', 'store_id': 35,
            'relatives': [{'name': 'Người thân QA', 'relationship': 'Mẹ', 'phone': '0900000078'}, {'name': 'Người thân QA 2', 'relationship': 'Anh', 'phone': '0900000079'}]}
account = {'id': 5, 'label': 'Két QA', 'kind': 'cash', 'store_id': 35, 'owner_type': ''}
vehicle = {'id': 101, 'name': 'Xe QA', 'license': 'QA-OWN', 'brand': 'Honda', 'type': 'scooter', 'color': 'Đen', 'year': 2020,
           'store_id': 35, 'status': 'ready', 'daily_price': 100000, 'monthly_price': 3000000}


def context():
    order = state['order'] or {}
    plan = order.get('draft_payload', {}).get('management_composer', {}).get('installment_plan')
    total = int(order.get('total_amount') or 0)
    bill = {}
    if plan:
        periods = plan['periods']
        total = sum(p['amount'] for p in periods if p['due_at'] <= state['now'])
        running, paid_periods = 0, 0
        for period in periods:
            running += period['amount']
            if running <= state['paid']:
                paid_periods += 1
        pending = periods[paid_periods] if paid_periods < len(periods) else None
        bill = {'billing_base_total': plan['amount'], 'billing': {'expected_total': sum(p['amount'] for p in periods),
                'period_count': len(periods), 'paid_periods': paid_periods, 'accrued_total': total,
                'remaining': max(total - state['paid'], 0), 'due_amount': max(total - state['paid'], 0),
                'next_due_at': pending['due_at'] if pending else None, 'overdue_at': pending['due_at'] if pending and pending['due_at'] <= state['now'] else None,
                'remaining_to_own': sum(p['amount'] for p in periods) - state['paid']}}
    return {'id': 901, 'code': order.get('contract_number', 'NHAP-OWN-QA'), 'status': order.get('status', 'draft'), 'store_id': 35, 'revision': str(100 + len(saved) + len(state['history'])),
            'total_amount': total, 'paid_amount': state['paid'], 'remaining': max(total - state['paid'], 0),
            'deposit_paid': state['deposit'], 'deposit_refunded': 0, 'deposit_held': state['deposit'],
            'company_paid_amount': 0, 'company_payment_count': 0, 'accounts': [account], 'history': state['history'], 'items': [{'id': 700, 'vehicle_id': 101, 'name': 'Xe QA', 'license': 'QA-OWN', 'revision': '1', 'return_at': '2027-10-13T09:00:00+07:00', 'renewal_amount': 0, 'daily_price': None}] if plan else [], 'end_date': order.get('end_date'), **bill}


def mock_api(route):
    request = route.request
    endpoint = urlparse(request.url).path.rstrip('/')
    if request.method in ['POST', 'PUT'] and endpoint.startswith('/api/auth/order/car-rental') and not endpoint.endswith(('/finalize', '/payments')):
        body = request.post_data_json
        saved.append(body)
        state['order'] = {'id': 901, 'draft_reference': 'NHAP-OWN-QA', 'status': 'draft', 'store_id': 35, 'draft_revision': str(100 + len(saved)),
                          'draft_payload': {'management_composer': {'version': 1, **body}}, 'created_at': '2026-10-13T09:00:00+07:00'}
        route.fulfill(status=201, json={'status': 'success', 'data': state['order']})
        return
    if request.method == 'POST' and endpoint.endswith('/finalize'):
        receipts = request.post_data_json['receipts']
        assert sum(int(r['amount']) for r in receipts if r['purpose'] == 'rental') == 200000
        assert sum(int(r['amount']) for r in receipts if r['purpose'] == 'deposit') == 3000000
        order = state['order']
        draft = order['draft_payload']['management_composer']['draft']
        periods = [{'due_at': draft['start_date'], 'amount': int(draft['unit_price'])}, *[{'due_at': p['due_at'], 'amount': int(p['amount'])} for p in draft['custom_installments']]]
        order['draft_payload']['management_composer']['installment_plan'] = {'version': 1, 'start': draft['start_date'], 'end': draft['end_date'], 'interval': 'custom', 'amount': int(draft['unit_price']), 'periods': periods}
        order.update(status='renting', contract_number='OWN-UI-901', rental_type='ownership', total_amount=int(draft['total_amount']),
                     paid_amount=int(draft['total_amount']), deposit_amount=int(draft['deposit_amount']), deposit_paid=int(draft['deposit_amount']),
                     customer_id=77, customer_name=customer['name'], customer_phone=customer['phone'], customer_id_card=customer['id_card'], customer_address=customer['address'],
                     start_date=draft['start_date'] + ':00+07:00', end_date=draft['end_date'] + ':00+07:00', vehicles=[vehicle])
        state['paid'], state['deposit'] = order['paid_amount'], order['deposit_paid']
        route.fulfill(json={'status': 'success', 'data': {'order_id': 901, 'code': 'OWN-UI-901', 'total_amount': state['paid'], 'deposit_amount': state['deposit'],
                                                       'paid_amount': state['paid'] + state['deposit'], 'transaction_ids': [501, 502], 'status': 'renting'}})
        return
    if endpoint.endswith('/payments'):
        if request.method == 'POST':
            body = request.post_data_json
            state['paid'] += int(body['amount'])
            state['order']['paid_amount'] = state['paid']
            transaction_id = 600 + len(state['history'])
            state['history'].insert(0, {'id': transaction_id, 'type': 'in', 'deposit': False, 'amount': int(body['amount']), 'paid_at': body['paid_at'] + ':00+07:00', 'method': 'Tiền mặt', 'account': 'Két QA', 'actor': 'QA', 'note': body['note']})
            route.fulfill(json={'status': 'success', 'data': {'context': context(), 'transaction_id': transaction_id, 'replayed': False, 'company_transfer': False}})
        else:
            route.fulfill(json={'status': 'success', 'data': context()})
        return
    if request.method != 'GET':
        blocked.append(endpoint)
        route.abort('blockedbyclient')
        return
    if endpoint == '/api/auth/stores':
        data = [{'id': 35, 'store_name': 'CS Thuê sở hữu', 'store_address': 'Địa chỉ QA', 'store_phone': '0900000002', 'status': 'opening'}]
    elif endpoint == '/api/auth/hr/staff':
        data = [{'id': 8, 'name': 'Đại diện QA', 'position': 'Nhân viên', 'status': 'active', 'store_id': 35}]
    elif endpoint in ['/api/auth/customers', '/api/auth/customers/search']:
        data = [customer]
    elif endpoint == '/api/auth/vehicle/vehicles':
        data = [vehicle]
    elif endpoint == '/api/auth/order/car-rental':
        data = [state['order']] if state['order'] else []
    elif endpoint == '/api/auth/cashbook/accounts':
        data = [{**account, 'name': account['label'], 'status': 'active', 'opening_balance': 0,
                 'income': state['paid'] + state['deposit'], 'expense': 0, 'balance': state['paid'] + state['deposit']}]
    elif endpoint == '/api/auth/transactions':
        data = [{**receipt, 'order_id': 901, 'contract_code': 'OWN-UI-901', 'store_id': 35,
                 'occurred_at': receipt['paid_at'], 'payment_method': receipt['method'], 'content': receipt['note']}
                for receipt in state['history']]
    elif endpoint in ['/api/session', '/api/auth/me']:
        route.fulfill(json={'user': {'id': 143, 'name': 'QA'}})
        return
    else:
        blocked.append(endpoint)
        route.abort('blockedbyclient')
        return
    route.fulfill(json={'status': 'success', 'data': data})


with sync_playwright() as p:
    browser = p.chromium.launch()
    browser_context = browser.new_context(viewport={'width': 1440, 'height': 1000}, timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
    browser_context.add_cookies([{'name': 'himoto_management_session', 'value': Path(args.session_cookie_file).read_text(encoding='utf-8').strip(), 'url': args.url, 'httpOnly': True, 'sameSite': 'Strict'}])
    browser_context.route('**/api/**', mock_api)
    page = browser_context.new_page()
    initial_time = int(datetime(2026, 10, 13, 9, tzinfo=zone).timestamp() * 1000)
    # Exercise the app's real minute callback without requiring a newer Playwright.
    page.add_init_script('''(() => {
      const NativeDate = Date, nativeInterval = setInterval, nativeClear = clearInterval;
      window.__qaNow = INITIAL_TIME;
      window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [window.__qaNow])); } static now() { return window.__qaNow; } };
      window.__qaIntervals = new Map();
      window.setInterval = (callback, delay, ...args) => {
        const id = nativeInterval(callback, delay, ...args);
        if (delay === 60000) window.__qaIntervals.set(id, () => callback(...args));
        return id;
      };
      window.clearInterval = id => { window.__qaIntervals.delete(id); nativeClear(id); };
    })();'''.replace('INITIAL_TIME', str(initial_time)))
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url + '/contracts', wait_until='domcontentloaded')
    page.get_by_role('button', name='Nhập hợp đồng', exact=True).click()
    form = page.locator('dialog.mg-contract-composer')
    tab = lambda name: form.get_by_role('tab', name=name, exact=False).click()
    tab('Khách hàng')
    form.locator('#contract-store').select_option('35')
    form.get_by_label('Đại diện ủy quyền Bên A', exact=False).fill('Đại diện QA')
    form.get_by_label('Tra cứu theo CCCD', exact=False).fill(customer['phone'])
    expect(form.get_by_label('Tên khách hàng', exact=True)).to_have_value(customer['name'])
    tab('Hợp đồng & pháp lý')
    expect(form.locator('#contract-record-type')).to_have_value('ownership')
    form.get_by_label('Ngày ký hợp đồng', exact=False).fill('2026-10-13')
    tab('Phương tiện')
    form.locator('#contract-start_date').fill('2026-10-13')
    form.get_by_label('Giờ thuê lúc (24h)', exact=True).select_option('09')
    form.get_by_label('Phút thuê lúc', exact=True).select_option('00')
    form.locator('#contract-end_date').fill('2027-10-13')
    form.get_by_label('Giờ hẹn trả (24h)', exact=True).select_option('09')
    form.get_by_label('Phút hẹn trả', exact=True).select_option('00')
    tab('Hợp đồng & pháp lý')
    for term, expected_end in [('6', '2027-04-13'), ('24', '2028-10-13'), ('12', '2027-10-13')]:
        form.get_by_label('Thời hạn thuê sở hữu', exact=True).select_option(term)
        tab('Phương tiện')
        expect(form.locator('#contract-end_date')).to_have_value(expected_end)
        tab('Hợp đồng & pháp lý')
    checks.append('6/12/24 month ownership choices suggest the exact calendar end date and preserve separate billing frequency')
    tab('Phương tiện')
    form.locator('#contract-vehicle-0').click()
    form.locator('#contract-vehicle-0-options-101').click()
    tab('Chi phí')
    expect(form.get_by_label('Kỳ đóng tiền', exact=True)).to_have_value('Theo tháng')
    form.locator('#contract-unit_price').fill('3000000')
    form.locator('#contract-deposit_amount').fill('3000000')
    expect(form.locator('#contract-rental-base')).to_have_value('3.000.000')
    expect(form.locator('#contract-total_amount')).to_have_value('3.000.000')
    expect(form.locator('#contract-amount-due')).to_have_value('6.000.000')
    expect(form).to_contain_text('12 kỳ')
    expect(form).to_contain_text('36.000.000 đ')
    form.screenshot(path=str(output / 'monthly-1440.png'))
    form.get_by_role('button', name='Xem mẫu in', exact=True).click()
    preview = page.locator('dialog.mg-contract-print-dialog')
    expect(preview.locator('.contract-page')).to_have_count(2)
    expect(preview.locator('.appendix-ownership-billing tbody tr')).to_have_count(12)
    expect(preview.locator('.sig-space')).to_have_count(2)
    page.evaluate('() => { window.__printCalls = 0; window.print = () => { window.__printCalls += 1; }; }')
    preview.get_by_role('button', name='In hợp đồng', exact=True).click()
    page.wait_for_function('window.__printCalls === 1')
    html = page.evaluate('''() => '<!doctype html><html lang="vi" class="himoto-printing"><head>'
      + Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'), node => node instanceof HTMLLinkElement ? `<link rel="stylesheet" href="${node.href}">` : node.outerHTML).join('')
      + '</head><body>' + document.querySelector('.himoto-print-root').outerHTML + '</body></html>' ''')
    pdf_page = browser_context.new_page()
    pdf_page.set_content(html, wait_until='networkidle')
    pdf_page.pdf(path=str(output / 'ownership-monthly.pdf'), prefer_css_page_size=True, print_background=True)
    with fitz.open(output / 'ownership-monthly.pdf') as pdf:
        assert len(pdf) == 2
        assert '36.000.000' in pdf[1].get_text()
        assert '\n'.join(p.get_text() for p in pdf).count('ĐẠI DIỆN BÊN A') == 1
    pdf_page.close()
    preview.get_by_role('button', name='Quay lại thông tin', exact=True).click()
    checks.append('ownership print includes all 12 calendar due dates/amounts and 36m schedule on an appendix; only one shared signing section remains')
    form.get_by_role('button', name='Lưu chính thức', exact=True).click()
    finalize = page.get_by_role('dialog', name=re.compile('Xác nhận thu tiền'))
    expect(finalize.locator('.mg-collection-total strong')).to_have_text('6.000.000 đ')
    assert saved[-1]['rental_type'] == 'ownership' and saved[-1]['draft']['total_amount'] == '3000000'
    assert saved[-1]['draft']['ownership_term_months'] == '12'
    page.set_viewport_size({'width': 375, 'height': 812})
    finalize.locator('.mg-collection-total').scroll_into_view_if_needed()
    finalize.screenshot(path=str(output / 'monthly-confirm-375.png'))
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    finalize.get_by_role('button', name='Quay lại', exact=True).click()
    page.set_viewport_size({'width': 1440, 'height': 1000})
    checks.append('one calendar year/monthly 3m shows 12/36m plan but composer and actual collection confirmation request only 3m rent + 3m deposit')
    for package, price, expected_total in [('Theo ngày', '100000', '3.100.000'), ('Theo tuần', '700000', '3.700.000')]:
        form.get_by_label('Kỳ đóng tiền', exact=True).select_option(package)
        form.locator('#contract-unit_price').fill(price)
        expect(form.locator('#contract-amount-due')).to_have_value(expected_total)
        tab('Hợp đồng & pháp lý')
        expect(form.locator('#contract-record-type')).to_have_value('ownership')
        tab('Chi phí')
    checks.append('daily/weekly first charges remain one period and package selection never changes ownership back into ordinary rental')
    form.get_by_label('Kỳ đóng tiền', exact=True).select_option('Tùy chọn')
    form.locator('#contract-unit_price').fill('200000')
    for index, date, hour, minute, amount in [(0, '2026-10-20', '10', '30', '500000'), (1, '2026-11-02', '09', '15', '1000000')]:
        form.get_by_role('button', name='Thêm ngày hẹn đóng tiền', exact=True).click()
        form.locator(f'#ownership-installment-{index}-due').fill(date)
        form.get_by_label(f'Giờ ngày hẹn lần {index + 2} (24h)', exact=True).select_option(hour)
        form.get_by_label(f'Phút ngày hẹn lần {index + 2}', exact=True).select_option(minute)
        form.locator(f'#ownership-installment-{index}-amount').fill(amount)
    expect(form.locator('#contract-total_amount')).to_have_value('200.000')
    expect(form.locator('#contract-amount-due')).to_have_value('3.200.000')
    expect(form).to_contain_text('1.700.000 đ')
    page.set_viewport_size({'width': 375, 'height': 812})
    form.screenshot(path=str(output / 'custom-375.png'))
    assert form.evaluate('(el) => el.scrollWidth <= el.clientWidth')
    form.get_by_role('button', name='Lưu chính thức', exact=True).click()
    expect(finalize.locator('.mg-collection-total strong')).to_have_text('3.200.000 đ')
    assert [item['amount'] for item in saved[-1]['draft']['custom_installments']] == ['500000', '1000000']
    finalize.get_by_role('button', name='Xác nhận lưu chính thức', exact=True).click()
    expect(finalize).not_to_be_visible()
    checks.append('custom unequal dates/amounts survive saving and confirmation; initial collection includes only first 200k + 3m deposit, not the 1.7m schedule')
    page.goto(args.url + '/contracts/due', wait_until='domcontentloaded')
    due_table = page.get_by_role('region', name=re.compile('Bảng đến hạn đóng tiền')).locator('table')
    expect(page.locator('.mg-billing-reminder')).to_have_count(0)
    page.set_viewport_size({'width': 1440, 'height': 1000})

    def advance(value):
        state['now'] = value
        milliseconds = int(datetime.fromisoformat(value).replace(tzinfo=zone).timestamp() * 1000)
        page.evaluate('(now) => { window.__qaNow = now; for (const tick of window.__qaIntervals.values()) tick(); }', milliseconds)

    advance('2026-10-20T10:30')
    expect(page.locator('.mg-billing-reminder')).to_contain_text('1 hợp đồng')
    expect(due_table.locator('tbody')).to_contain_text('500.000')
    due_table.locator('tbody tr').first.get_by_role('button', name=re.compile('^Thao tác ')).click()
    page.get_by_role('menuitem', name='Thanh toán', exact=True).click()
    payment = page.locator('dialog.mg-payment-dialog')
    expect(payment).to_contain_text('500.000 đ')
    assert payment.locator('option[value="renewal"]').evaluate('(el) => el.disabled')
    for amount in ['200000', '300000']:
        payment.get_by_label('Số tiền thu (VNĐ)', exact=True).fill(amount)
        payment.get_by_role('button', name='Ghi nhận thanh toán', exact=True).click()
        expect(payment.get_by_role('status')).to_contain_text('Đã xác nhận')
    expect(payment).to_contain_text('Đã đóng đủ 2 kỳ')
    payment.get_by_role('button', name='Đóng', exact=True).click()
    # Collection opens in the existing cashbook flow. Revisit the due list after closing it.
    expect(page).to_have_url(args.url + '/cashbook')
    page.get_by_role('link', name='Đến hạn đóng tiền', exact=True).click()
    expect(page.get_by_role('heading', name='Đến hạn đóng tiền', exact=True)).to_be_visible()
    advance('2026-10-20T10:30')
    expect(page.locator('.mg-billing-reminder')).to_have_count(0)
    advance('2026-11-02T09:15')
    expect(page.locator('.mg-billing-reminder')).to_contain_text('1 hợp đồng')
    expect(due_table.locator('tbody')).to_contain_text('1.000.000')
    page.set_viewport_size({'width': 375, 'height': 812})
    mobile_card = page.locator('.mg-mobile-record-card').filter(has_text='OWN-UI-901')
    expect(mobile_card).to_contain_text('Hẹn đóng: 02/11/2026 09:15')
    expect(mobile_card).to_contain_text('Còn thiếu đến hạn: 1.000.000')
    page.get_by_role('button', name='Đóng thông báo', exact=True).click()
    page.screenshot(path=str(output / 'due-375.png'), full_page=True)
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    advance('2027-10-13T09:00')
    expect(page.locator('.mg-billing-reminder')).to_contain_text('1 hợp đồng')
    checks.append('clock-driven reminders appear at each custom due date; partial then full receipts clear one reminder; the next unpaid installment remains through term end without future charges')
    assert not errors, errors
    assert not blocked, blocked
    browser.close()
result = {'passed': len(checks), 'checks': checks, 'javascriptErrors': errors, 'unexpectedRequestsBlocked': blocked, 'realBusinessWrites': 0}
(output / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
