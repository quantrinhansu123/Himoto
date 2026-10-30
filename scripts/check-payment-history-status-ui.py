"""Receipt status totals and deletion selection. All business endpoints are fixtures."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3037')
parser.add_argument('--cookie-file', required=True)
parser.add_argument('--output', default='.backups/payment-history-status/ui')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
expect.set_options(timeout=30000)
state, checks, errors, unexpected, writes = {}, [], [], [], []


def context():
    active = [] if state.get('deleted') else [dict(id=51, type='in', amount=300000, status='approved'),
                                             dict(id=52, type='out', amount=100000, status='approved')]
    vouchers = active + [dict(id=53, type='in', amount=900000, status='cancelled')]
    for voucher in vouchers:
        voucher.update(deposit=False, paid_at='2026-10-24T13:59:00Z', method='Tiền mặt', account='Két QA', actor='Nhân viên QA', note='Phiếu QA')
    return dict(id=901, code='QA-RECEIPT-STATUS', status='renting', store_id=33, revision='10',
                total_amount=1200000, paid_amount=0 if state.get('deleted') else 300000,
                remaining=1200000 if state.get('deleted') else 900000, deposit_paid=0, deposit_refunded=0,
                deposit_held=0, company_paid_amount=0, company_payment_count=0, end_date='2026-11-22T12:00:00Z',
                accounts=[], items=[], history=vouchers)


def mock(route):
    if mock_contract_type_read(route):
        return
    req = route.request
    endpoint = urlparse(req.url).path
    if req.method == 'DELETE' and endpoint == '/api/auth/bulk-delete/transactions':
        body = req.post_data_json
        assert sorted(body['ids']) == [51, 52], body
        writes.append(body)
        state['deleted'] = True
        route.fulfill(json=dict(status='success', data=dict(ids=[51, 52])))
        return
    if req.method not in ('GET', 'HEAD'):
        unexpected.append(req.method + ' ' + endpoint)
        route.abort()
        return
    if endpoint == '/api/auth/order/car-rental/901/payments':
        data = context()
    elif endpoint == '/api/auth/order/car-rental':
        data = [dict(id=901, contract_number='QA-RECEIPT-STATUS', order_status='renting', order_type='daily',
                     store_id=33, store_name='CS QA', customer_name='Khách QA', total_amount=1200000,
                     paid_amount=300000, deposit_amount=0, vehicles=[dict(id=1, name='Xe QA', license='QA-1')])]
    elif endpoint in ('/api/auth/stores', '/api/auth/store-directory'):
        data = [dict(id=33, store_name='CS QA', status='opening')]
    else:
        data = []
    route.fulfill(json=dict(status='success', data=data))


with sync_playwright() as pw:
    for engine, width in [('chromium', 1440), ('webkit', 390)]:
        state.clear()
        browser = getattr(pw, engine).launch()
        ctx = browser.new_context(viewport=dict(width=width, height=950), timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
        ctx.add_init_script("const f=fetch;window.fetch=function(i,o){const u=new URL(typeof i==='string'?i:i.url,location.href);return u.pathname==='/api/auth/payment-events'?Promise.resolve(Response.json({status:'success',data:[]})):f.call(this,i,o);};")
        ctx.add_cookies([dict(name='himoto_management_session', value=Path(args.cookie_file).read_text().strip(), url=args.url, httpOnly=True, sameSite='Strict')])
        ctx.route('**/api/**', mock)
        page = ctx.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(args.url + '/contracts', wait_until='networkidle', timeout=120000)
        page.locator('button.mg-row-menu-trigger').filter(visible=True).first.click()
        page.get_by_role('menuitem', name='Thanh toán', exact=True).click()
        dialog = page.get_by_role('dialog', name='Thanh toán hợp đồng QA-RECEIPT-STATUS', exact=True)
        expect(dialog).to_be_visible()
        columns = dialog.locator('.mg-payment-history-columns')
        expect(columns.get_by_role('heading', name='Phiếu Thu (2) · Đã duyệt: 300.000 đ', exact=True)).to_be_visible()
        expect(columns.get_by_role('heading', name='Phiếu Chi (1) · Đã duyệt: −100.000 đ', exact=True)).to_be_visible()
        cancelled = columns.locator('li').filter(has_text='#53')
        expect(cancelled).to_contain_text('900.000')
        expect(cancelled).to_contain_text('Đã hủy · Không tính vào tổng đã duyệt')
        checks.append(f'{engine}: cancelled original voucher is visible and labelled while only approved income/expenses contribute to totals')
        dialog.get_by_role('button', name='Xóa phiếu đã duyệt', exact=True).click()
        confirm = dialog.get_by_role('alertdialog', name='Xác nhận xóa phiếu đã duyệt')
        expect(confirm).to_contain_text('2 phiếu đã duyệt')
        expect(confirm).to_contain_text('thu 300.000')
        expect(confirm).to_contain_text('chi 100.000')
        expect(confirm).not_to_contain_text('900.000')
        confirm.get_by_role('button', name='Hủy', exact=True).click()
        assert len(writes) == (0 if engine == 'chromium' else 1)
        dialog.get_by_role('button', name='Xóa phiếu đã duyệt', exact=True).click()
        confirm.get_by_role('button', name='Xóa hết', exact=True).click()
        expect(dialog.get_by_text('Đã xóa 2 phiếu Thu / Chi của hợp đồng QA-RECEIPT-STATUS.', exact=True)).to_be_visible()
        expect(columns.locator('li')).to_have_count(1)
        expect(cancelled).to_be_visible()
        expect(columns.get_by_role('heading', name='Phiếu Thu (1) · Đã duyệt: 0 đ', exact=True)).to_be_visible()
        expect(dialog.get_by_role('button', name='Xóa phiếu đã duyệt', exact=True)).to_have_count(0)
        checks.append(f'{engine}: confirmation and fixture deletion include only approved IDs; a cancelled-only history keeps its voucher and offers no bulk delete')
        page.set_viewport_size(dict(width=320, height=812))
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
        columns.screenshot(path=str(out / f'{engine}-cancelled-only-320.png'))
        checks.append(f'{engine}: receipt status and zero approved totals remain readable at 320px without page overflow')
        ctx.unroute_all(behavior='ignoreErrors')
        browser.close()

assert not errors, errors
assert not unexpected, unexpected
report = dict(passed=len(checks), checks=checks, javascriptErrors=errors, fixtureDeletes=len(writes), realBusinessWrites=0, realTelegramRequests=0)
(out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
