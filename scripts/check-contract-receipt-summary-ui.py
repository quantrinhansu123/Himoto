"""Full contract receipts in Costs. All APIs intercepted, no business mutations."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3027')
parser.add_argument('--cookie-file', required=True)
parser.add_argument('--output', default='.backups/contract-receipt-summary/ui')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
expect.set_options(timeout=30000)
state, checks, errors, unexpected = {}, [], [], []


def receipt(i, amount, category='renewal', status='approved', kind='income'):
    return dict(id=i, at='2026-10-03T11:07:44Z', type=kind, reason='Thu tiền gia hạn' if category == 'renewal' else 'Tiền cọc' if category == 'deposit' else 'Thu tiền thuê xe',
                note='Cùng thời điểm / nội dung QA', amount=amount, method='Tiền mặt', account='Két QA', actor='Nhân viên QA',
                status='Đã duyệt' if status == 'approved' else 'Đã hủy', status_code=status, category=category, order_id=901)


vouchers = [receipt(1, 500000, 'deposit'), receipt(2, 1500000, 'rental')]
vouchers += [receipt(i, 750000) for i in range(3, 16)]
vouchers += [receipt(16, 500000), receipt(17, 500000), receipt(18, 99000000, status='cancelled')]
summary = dict(received=12750000, spent=0, net=12750000, receipt_count=17, rental_received=1500000,
               renewal_received=10750000, other_received=0, rental_refunded=0, deposit_received=500000, deposit_refunded=0, deposit_held=500000)


def mock(route):
    if mock_contract_type_read(route):
        return
    req = route.request
    endpoint = urlparse(req.url).path
    if req.method not in ('GET', 'HEAD'):
        unexpected.append(req.method + ' ' + endpoint)
        route.abort()
        return
    if endpoint == '/api/auth/order/car-rental/901/history':
        state['history_reads'] += 1
        if state.get('fail'):
            state['fail'] = False
            route.fulfill(status=503, json=dict(status='error', message='QA không tải được lịch sử đầy đủ'))
            return
        data = dict(changes=[], cashflow=vouchers + ([receipt(19, 250000, category='rental_refund', kind='expense')] if state.get('refund') else []),
                    receipts=dict(summary, spent=250000, net=12500000, rental_refunded=250000) if state.get('refund') else summary)
    elif endpoint == '/api/auth/order/car-rental':
        data = [dict(id=901, contract_number='QA-FULL-RECEIPTS', order_status='renting', order_type='daily',
                     store_id=33, store_name='CS QA', customer_name='Khách QA', total_amount=12000000 if state.get('refund') else 2000000,
                     paid_amount=12000000 if state.get('refund') else 2000000, deposit_amount=500000, vehicles=[dict(id=1, name='Xe QA', license='QA-1')])]
    elif endpoint in ('/api/auth/stores', '/api/auth/store-directory'):
        data = [dict(id=33, store_name='CS QA', status='opening')]
    else:
        data = []
    route.fulfill(json=dict(status='success', data=data))


with sync_playwright() as pw:
    for engine, width in [('chromium', 1440), ('webkit', 390)]:
        state.clear()
        state.update(history_reads=0)
        browser = getattr(pw, engine).launch()
        ctx = browser.new_context(viewport=dict(width=width, height=950), timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
        ctx.add_init_script("const f=fetch;window.fetch=function(i,o){const u=new URL(typeof i==='string'?i:i.url,location.href);return u.pathname==='/api/auth/payment-events'?Promise.resolve(Response.json({status:'success',data:[]})):f.call(this,i,o);};")
        ctx.add_cookies([dict(name='himoto_management_session', value=Path(args.cookie_file).read_text().strip(), url=args.url, httpOnly=True, sameSite='Strict')])
        ctx.route('**/api/**', mock)
        page = ctx.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(args.url + '/contracts', wait_until='networkidle', timeout=120000)
        page.locator('button.mg-row-menu-trigger').filter(visible=True).first.click()
        page.get_by_role('menuitem', name='Xem chi tiết', exact=True).click()
        dialog = page.get_by_role('dialog', name='Chi tiết hợp đồng: QA-FULL-RECEIPTS', exact=True)
        expect(dialog).to_be_visible()
        assert state['history_reads'] == 0
        state['fail'] = True
        dialog.get_by_role('tab', name='Chi phí', exact=False).click()
        costs = dialog.get_by_role('tabpanel', name='Chi phí', exact=False)
        expect(costs.get_by_role('alert').first).to_contain_text('QA không tải được lịch sử đầy đủ')
        expect(costs.get_by_role('region', name='Tổng thu chi theo phiếu của hợp đồng')).to_have_count(0)
        costs.get_by_role('button', name='Làm mới', exact=True).click()
        totals = costs.get_by_role('region', name='Tổng thu chi theo phiếu của hợp đồng')
        expect(totals).to_contain_text('17 phiếu thu đã duyệt')
        for label, amount in [('Tổng tiền đã thu (gồm cọc)', '12.750.000'), ('Đã thu gia hạn', '10.750.000'), ('Đã thu cọc', '500.000'), ('Đã thu thuê / phí', '1.500.000')]:
            expect(totals.locator('dl > div').filter(has=page.get_by_text(label, exact=True))).to_contain_text(amount)
        expect(costs.get_by_role('status').filter(has_text='Số thu thuê / phí theo phiếu')).to_contain_text('khác số tổng hợp 2.000.000')
        expect(costs.locator('dl > div').filter(has=page.get_by_text('Cọc đã thu', exact=True))).to_contain_text('500.000')
        expect(costs.get_by_text('Còn thiếu tiền thuê (cần đối chiếu)', exact=True).locator('..')).to_contain_text('—')
        details = costs.get_by_role('region', name='Chi tiết từng phiếu thu chi', exact=True)
        expect(details.locator('li')).to_have_count(18)
        for i in [1, 2, 3, 15, 16, 17, 18]:
            expect(details.locator('li').filter(has_text=f'#{i} ·')).to_have_count(1)
        expect(details).to_contain_text('Đã hủy')
        checks.append(f'{engine}: Costs loads all 17 approved receipts including old renewals/deposit; duplicate-looking voucher IDs remain visible, cancelled receipt is excluded from totals, stale header discrepancy is explicit')
        reads = state['history_reads']
        dialog.get_by_role('tab', name='Lịch sử thu chi', exact=False).click()
        expect(dialog.get_by_role('tabpanel', name='Lịch sử thu chi', exact=False)).to_contain_text('12.750.000')
        dialog.get_by_role('tab', name='Chi phí', exact=False).click()
        assert state['history_reads'] == reads
        page.set_viewport_size(dict(width=320, height=812))
        expect(totals).to_be_visible()
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
        totals.screenshot(path=str(out / f'{engine}-costs-summary-320.png'))
        checks.append(f'{engine}: failure/retry never publishes zero totals, both tabs reuse the complete history, and the full summary is readable at 320px without page overflow')
        state['refund'] = True
        page.reload(wait_until='networkidle')
        page.locator('button.mg-row-menu-trigger').filter(visible=True).first.click()
        page.get_by_role('menuitem', name='Xem chi tiết', exact=True).click()
        dialog.get_by_role('tab', name='Chi phí', exact=False).click()
        expect(totals).to_contain_text('12.750.000')
        expect(totals.locator('dl > div').filter(has=page.get_by_text('Đã hoàn tiền thuê', exact=True))).to_contain_text('250.000')
        expect(costs.get_by_role('status').filter(has_text='khác số tổng hợp')).to_have_count(0)
        checks.append(f'{engine}: approved rental refund stays separate from gross receipts and is subtracted before comparing the contract paid total, avoiding a false mismatch')
        ctx.unroute_all(behavior='ignoreErrors')
        browser.close()

assert not errors, errors
assert not unexpected, unexpected
report = dict(passed=len(checks), checks=checks, javascriptErrors=errors, realBusinessWrites=0, realTelegramRequests=0)
(out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
