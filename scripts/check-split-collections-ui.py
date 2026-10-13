"""Synthetic fee/collection QA; all business APIs are intercepted."""
import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from zoneinfo import ZoneInfo
import fitz
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3102')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='docs/qa/split-collections')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
checks, writes, errors, contracts = [], [], [], []
stores = [dict(id=i, store_name=name, code=f'QA{i}', status='opening', store_address='Địa chỉ QA', store_phone='0900000090')
          for i, name in [(31, 'CS Láng'), (32, 'CS Nguyễn Hoàng')]]
customer = dict(id=7, name='Khách thanh toán QA', phone='0900000011', id_card='001234567890', status='active',
    store_id=31, store_name='CS Láng', address='Địa chỉ QA', id_card_issued_on='2024-01-01', id_card_issued_by='Nơi cấp QA',
    relatives=[dict(name='Người thân QA 1', relationship='Mẹ', phone='0900000012'), dict(name='Người thân QA 2', relationship='Anh', phone='0900000013')])
staff = [dict(id=700, full_name='Nhân sự Láng QA', staff_code='QA700', position='PT', status='active', store_id=31)]
vehicles = [dict(id=100, name='Xe QA 100', license='QA-100', brand='Honda', type='xeso', year=2026,
    store_id=32, current_store_id=32, store_name='CS Nguyễn Hoàng', status='ready', daily_price=200000, monthly_price=3000000, rentals=[])]
accounts = [dict(id=5, label='Tiền mặt Láng QA', kind='cash', store_id=31, owner_type=''),
    dict(id=6, label='TK cá nhân Láng QA', kind='bank', store_id=31, owner_type='personal'),
    dict(id=7, label='TK công ty Láng QA', kind='bank', store_id=31, owner_type='company')]

def mock(route):
    req = route.request
    parsed = urlparse(req.url)
    endpoint = parsed.path
    if req.method not in ('GET', 'HEAD'):
        body = req.post_data_json
        writes.append(dict(path=endpoint, body=body))
        if endpoint == '/api/auth/order/car-rental' and req.method == 'POST':
            record = dict(id=901, draft_reference='NHAP-QA-901', status='draft', store_id=31, draft_revision='901',
                total=0, paid_amount=0, deposit_paid=0, collections=[], draft_payload={'management_composer': {'version': 1, **body}})
            contracts[:] = [record]
            route.fulfill(status=201, json={'status': 'success', 'data': record})
        elif endpoint == '/api/auth/order/car-rental/901/finalize':
            collections = [dict(purpose=row['purpose'], amount=int(row['amount']), paid_at=row['paid_at'],
                method={'cash': 'Tiền mặt', 'transfer': 'CK tk cá nhân', 'company_transfer': 'CK tk công ty'}[row['method']],
                account=next(a['label'] for a in accounts if a['id'] == row['account_id'])) for row in body['receipts']]
            contracts[0].update(status='renting', contract_number='261011-QA-0001', total=250000, paid_amount=250000,
                deposit_amount=2000000, deposit_paid=2000000, collections=collections)
            route.fulfill(json={'status': 'success', 'data': dict(order_id=901, code='261011-QA-0001', total_amount=250000,
                deposit_amount=2000000, paid_amount=2250000, transaction_ids=[1, 2, 3])})
        else:
            raise AssertionError(f'Unexpected write {endpoint}')
        return
    if endpoint == '/api/auth/customers/search':
        params = parse_qs(parsed.query)
        assert 'store_id' not in params
        data = [customer] if params.get('query', [''])[0] in [customer['phone'], customer['id_card']] else []
    elif endpoint == '/api/auth/customers': data = [customer]
    elif endpoint == '/api/auth/stores': data = stores
    elif endpoint == '/api/auth/hr/staff': data = staff
    elif endpoint == '/api/auth/vehicle/vehicles': data = vehicles
    elif endpoint == '/api/auth/order/car-rental': data = contracts
    elif endpoint == '/api/auth/order/car-rental/901/payments':
        data = dict(id=901, code='NHAP-QA-901', status='draft', store_id=31, revision='901', total_amount=0, paid_amount=0,
            remaining=0, deposit_paid=0, deposit_refunded=0, deposit_held=0, company_paid_amount=0,
            company_payment_count=0, accounts=accounts, history=[], items=[], end_date=None)
    else: raise AssertionError(f'Unexpected read {endpoint}')
    route.fulfill(json={'status': 'success', 'data': data})

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, timezone_id='Asia/Ho_Chi_Minh', locale='en-US', reduced_motion='reduce')
    context.add_cookies([dict(name='himoto_management_session', value=Path(args.session_cookie_file).read_text().strip(),
        url=args.url, httpOnly=True, sameSite='Strict')])
    context.route('**/api/auth/**', mock)
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(args.url + '/contracts', wait_until='domcontentloaded')
    page.get_by_role('button', name='Nhập hợp đồng', exact=True).click()
    form = page.locator('dialog.mg-contract-composer')
    page.add_style_tag(content='.mg-user-menu strong {visibility:hidden!important;}')
    def tab(name): form.get_by_role('tab', name=name, exact=False).click()
    tab('Khách hàng')
    form.locator('#contract-id-card').fill(customer['phone'])
    expect(form.locator('#contract-customer-name')).to_have_value(customer['name'])
    form.locator('#contract-staff').fill(staff[0]['full_name'])
    tab('Phương tiện')
    form.locator('#contract-vehicle-0').click()
    form.locator('#contract-vehicle-0-options-100').click()
    tab('Chi phí')
    form.locator('#contract-deposit_amount').fill('2000000')
    form.get_by_role('button', name='Thêm khoản phí', exact=True).click()
    form.locator('#contract-charge-0-name').fill('Phí ship')
    form.locator('#contract-charge-0-amount').fill('50000')
    expect(form.locator('#contract-total_amount')).to_have_value('250.000')
    expect(form.locator('#contract-amount-due')).to_have_value('2.250.000')
    assert form.get_by_label('Số tiền đã thanh toán', exact=False).count() == 0
    form.get_by_role('button', name='Thêm khoản phí', exact=True).click()
    form.locator('#contract-charge-1-name').fill('Phí QA bỏ')
    form.locator('#contract-charge-1-amount').fill('10000')
    expect(form.locator('#contract-total_amount')).to_have_value('260.000')
    form.get_by_role('button', name='Bỏ khoản phí 2', exact=True).click()
    expect(form.locator('#contract-total_amount')).to_have_value('250.000')
    method = form.locator('details.mg-method-picker').first
    method.locator('summary').click()
    method.get_by_label('CK tk cá nhân', exact=True).check()
    method.get_by_label('CK tk công ty', exact=True).check()
    form.locator('#contract-unit_price').click()
    expect(method).not_to_have_attribute('open', '')
    form.screenshot(path=str(out / 'named-fees-1440.png'))
    checks.append('named ship fee is included in 250k rental/fees and 2.25m quote; adding/removing fees recalculates; no quote is labelled as money collected')
    form.get_by_role('button', name='Lưu chính thức', exact=True).click()
    receipt = page.get_by_role('dialog').filter(has_text='Xác nhận thu tiền')
    expect(receipt.locator('#deposit-collection-0-amount')).to_be_visible(timeout=20000)
    expect(receipt.locator('#deposit-collection-0-amount')).to_have_value('')
    expect(receipt.locator('#deposit-collection-1-amount')).to_have_value('')
    receipt.locator('#deposit-collection-0-amount').fill('200000')
    receipt.locator('#deposit-collection-1-amount').fill('1800000')
    expect(receipt.locator('#deposit-collection-0-account')).to_have_value('6')
    expect(receipt.locator('#deposit-collection-1-account')).to_have_value('7')
    yesterday = (datetime.now(ZoneInfo('Asia/Ho_Chi_Minh')) - timedelta(days=1)).strftime('%Y-%m-%d')
    receipt.locator('#deposit-collection-0-paid-at').fill(yesterday)
    expect(receipt.locator('#rental-collection-0-amount')).to_have_value('250.000')
    receipt.locator('#rental-collection-0-amount').fill('250001')
    receipt.get_by_role('button', name='Xác nhận lưu chính thức', exact=True).click()
    expect(receipt.get_by_role('alert')).to_contain_text('vượt số còn phải thu')
    assert not any(w['path'].endswith('/finalize') for w in writes)
    receipt.locator('#rental-collection-0-amount').fill('100000')
    expect(receipt.locator('[data-purpose=rental]')).to_contain_text('150.000 đ')
    receipt.locator('#rental-collection-0-amount').fill('250000')
    receipt.get_by_role('button', name='Thêm khoản thu cọc', exact=True).click()
    expect(receipt.locator('#deposit-collection-2-amount')).to_be_visible()
    receipt.get_by_role('button', name='Bỏ khoản tiền cọc 3', exact=True).click()
    for width, height in [(1440, 1000), (375, 812)]:
        page.set_viewport_size({'width': width, 'height': height})
        assert receipt.evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
        receipt.screenshot(path=str(out / f'split-receipts-{width}.png'))
    checks.append('multiple selected methods require explicit allocation; rows support distinct accounts/dates and adding/removing; overcollection is blocked and partial payment leaves debt; 375px mobile fits')
    page.set_viewport_size({'width': 1440, 'height': 1000})
    receipt.get_by_role('button', name='Xác nhận lưu chính thức', exact=True).click()
    expect(form).to_have_count(0)
    allocation = writes[-1]['body']['receipts']
    assert [(r['purpose'], r['amount'], r['account_id']) for r in allocation] == [
        ('deposit', '200000', 6), ('deposit', '1800000', 7), ('rental', '250000', 5)]
    assert allocation[0]['paid_at'].startswith(yesterday)
    assert writes[0]['body']['draft']['paid_amount'] == '0'
    assert writes[0]['body']['draft']['extra_charges'] == [dict(name='Phí ship', amount='50000')]
    checks.append('request sends exactly 200k personal advance, 1.8m company deposit and 250k cash fees, with actual dates; draft money received remains zero')
    page.goto(args.url + '/contracts', wait_until='domcontentloaded')
    page.get_by_role('button', name='Thao tác 261011-QA-0001', exact=True).click()
    page.get_by_role('menuitem', name='Điền và in hợp đồng', exact=True).click()
    form = page.locator('dialog.mg-contract-composer')
    page.evaluate('''() => {
      window.__printCalls = 0;
      window.print = () => { window.__printCalls += 1; };
    }''')
    form.get_by_role('button', name='Xem mẫu in', exact=True).click()
    preview = page.locator('dialog.mg-contract-print-dialog')
    paper = preview.locator('.contract-print-wrapper')
    expect(paper).to_contain_text('Đã thu phí thuê: 250.000 đ')
    expect(paper).not_to_contain_text('Đã nhận cọc')
    expect(paper).not_to_contain_text('CHI TIẾT PHÍ VÀ CÁC KHOẢN ĐÃ THU')
    preview.screenshot(path=str(out / 'print-preview-1440.png'))
    preview.get_by_role('button', name='In hợp đồng', exact=True).click()
    page.wait_for_function('window.__printCalls > 0')
    html = page.evaluate('''() => '<!doctype html><html lang="vi" class="himoto-printing"><head>'
      + Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'), node => node instanceof HTMLLinkElement ? `<link rel="stylesheet" href="${node.href}">` : node.outerHTML).join('')
      + '</head><body>' + document.querySelector('.himoto-print-root').outerHTML + '</body></html>' ''')
    print_page = context.new_page()
    print_page.set_content(html, wait_until='networkidle')
    print_page.pdf(path=str(out / 'split-collections.pdf'), prefer_css_page_size=True, print_background=True)
    with fitz.open(out / 'split-collections.pdf') as pdf:
        assert len(pdf) == 1, len(pdf)
        text = '\n'.join(p.get_text() for p in pdf)
        for value in ['250.000', '2.000.000']:
            assert value in text, value
        assert 'CHI TIẾT PHÍ VÀ CÁC KHOẢN ĐÃ THU' not in text
        pdf[0].get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(str(out / 'collections-pdf-page.png'))
    checks.append('reopened contract prints actual 250k fees separately from 2m deposit on the contract page, without a fee/receipt appendix; actual PDF has one page')
    assert not errors, errors
    (out / 'results.json').write_text(json.dumps(dict(passed=len(checks), checks=checks, errors=errors, realBusinessWrites=0), ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(dict(passed=len(checks), checks=checks), ensure_ascii=False))
    browser.close()
