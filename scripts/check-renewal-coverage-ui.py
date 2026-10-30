"""New renewal coverage, early/late receipt dates and multi-bike payment regression.
All business endpoints are fixtures. No customer writes or Telegram calls.
"""
from pathlib import Path
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta
from playwright.sync_api import sync_playwright, expect

# Share only the existing fixture definitions, without running its scenarios.
source=Path(__file__).with_name('check-renewal-collection-ui.py').read_text(encoding='utf-8')
exec(compile(source.split('with sync_playwright() as pw:')[0],__file__,'exec'),globals())
original_mock=mock
original_context=context
original_returnable=returnable

def context():
    data=original_context()
    if state.get('payment'):
        data['items']=[dict(id=101,vehicle_id=700,name='Wave QA',license='QA-333.71',revision='1',return_at='2026-10-15T09:30:00Z',daily_price=130000,renewal_amount=0),
                       dict(id=102,vehicle_id=701,name='SH QA',license='QA-333.72',revision='1',return_at='2026-10-23T08:04:00Z',daily_price=300000,renewal_amount=0)]
    return data

def returnable():
    data=original_returnable()
    data['scheduled_start_at']='2026-01-01T00:00:00Z'
    data['daily_price']=state.get('rate',130000)
    return data

def mock(route):
    req=route.request
    endpoint=urlparse(req.url).path
    if req.method=='POST' and endpoint.endswith('/renewals'):
        body=req.post_data_json
        assert body['return_at']==state['expected_end'],body
        assert body['amount']==str(state['expected_fee']),body
        assert body['expected_amount']==str(state['expected_fee']),body
        assert 'receipt' not in body
        writes.append(dict(path=endpoint,body=body))
        state.update(renewed=True,total=280000+state['expected_fee'],end=body['return_at']+'+07:00')
        route.fulfill(json=dict(status='success',data=dict(order_id=901,code='QA-32031',version=2,return_at=state['end'],amount=state['expected_fee'],total_amount=state['total'])))
        return
    if req.method=='POST' and endpoint.endswith('/payments'):
        body=req.post_data_json
        assert body['purpose']=='renewal' and body['paid_at']=='2026-10-29T08:10',body
        assert body['amount']=='1720000',body
        assert [(row['item_id'],row['return_at'],row['amount']) for row in body['items']]==[(101,'2026-10-19T16:30','520000'),(102,'2026-10-27T15:04','1200000')],body
        writes.append(dict(path=endpoint,body=body))
        state.update(renewed=True,total=2000000,paid=2000000)
        route.fulfill(json=dict(status='success',data=dict(context=context(),transaction_id=99001,replayed=False,company_transfer=False)))
        return
    original_mock(route)

with sync_playwright() as pw:
    for engine,width in [('chromium',1440),('webkit',390)]:
        browser=getattr(pw,engine).launch()
        ctx=browser.new_context(viewport=dict(width=width,height=950),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
        ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.branch_cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')])
        ctx.add_init_script("const f=fetch;window.fetch=function(i,o){const u=new URL(typeof i==='string'?i:i.url,location.href);return u.pathname==='/api/auth/payment-events'?Promise.resolve(Response.json({status:'success',data:[]})):f.call(this,i,o);};")
        ctx.route('**/api/**',mock)
        ctx.route('https://api.telegram.org/**',lambda route:(unexpected.append('REAL TELEGRAM'),route.abort()))
        def open_form(payment=False):
            page=ctx.new_page()
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(a.url+'/contracts',wait_until='networkidle',timeout=120000)
            page.locator('button.mg-row-menu-trigger:visible').first.click()
            page.get_by_role('menuitem',name='Thanh toán' if payment else 'Gia hạn',exact=True).click()
            dialog=page.get_by_role('dialog',name='Thanh toán hợp đồng QA-32031' if payment else 'Gia hạn · QA-32031',exact=True)
            expect(dialog).to_be_visible()
            return page,dialog
        for case,due,count,rate,end,fee,unit in [
            ('late-seven-days','2026-10-15T09:30:00Z',7,130000,'2026-10-22T16:30',910000,'day'),
            ('late-four-days','2026-10-23T08:04:00Z',4,300000,'2026-10-27T15:04',1200000,'day'),
            ('early-seven-days','2026-11-15T09:30:00Z',7,130000,'2026-11-22T16:30',910000,'day'),
            ('hour-midnight','2026-10-23T16:30:00Z',2,130000,'2026-10-24T01:30',40000,'hour')]:
            state.clear();state.update(collect=False,rate=rate,expected_end=end,expected_fee=fee)
            old_end=due
            page,form=open_form()
            if unit=='hour':form.get_by_label('Gia hạn theo',exact=False).select_option('hour')
            form.get_by_label('Số ngày gia hạn' if unit=='day' else 'Số giờ gia hạn',exact=True).fill(str(count))
            def assert_quote():
                expect(form.locator('#renewal-return-at')).to_have_value(end[:10])
                expect(form.get_by_label('Giờ ngày trả mới (24h)',exact=True)).to_have_value(end[11:13])
                expect(form.get_by_label('Phút ngày trả mới',exact=True)).to_have_value(end[14:16])
                expect(form.get_by_label('Chi phí gia hạn (VNĐ)',exact=False)).to_have_value(f'{fee:,}'.replace(',','.'))
            assert_quote()
            form.get_by_label('Đã thực nhận tiền gia hạn',exact=False).check()
            form.locator('#renewal-paid-at').fill('2026-10-29')
            form.get_by_label('Giờ ngày giờ thu (24h)',exact=True).select_option('08')
            form.get_by_label('Phút ngày giờ thu',exact=True).select_option('10')
            assert_quote()
            form.get_by_label('Chưa nhận tiền',exact=False).check()
            assert_quote()
            form.get_by_role('button',name='Lưu gia hạn',exact=True).click()
            expect(form).to_contain_text('Đã lưu gia hạn')
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
            checks.append(dict(browser=engine,case=case,coverage=end,fee=fee,receiptDateIndependent=True))
            page.close()
        state.clear();state.update(payment=True,collect=True)
        page,form=open_form(payment=True)
        form.get_by_label('Nghiệp vụ',exact=True).select_option('renewal')
        form.get_by_role('checkbox',name='Wave QA · QA-333.71',exact=True).check()
        form.get_by_role('checkbox',name='SH QA · QA-333.72',exact=True).check()
        form.get_by_label('Số ngày gia hạn',exact=True).fill('4')
        form.get_by_label('Hình thức thanh toán',exact=True).select_option('cash')
        form.locator('#payment-paid-at').fill('2026-10-29')
        form.get_by_label('Giờ ngày giờ thu (24h)',exact=True).select_option('08')
        form.get_by_label('Phút ngày giờ thu',exact=True).select_option('10')
        expect(form.get_by_label('Tiền gia hạn QA-333.71',exact=True)).to_have_value('520.000')
        expect(form.get_by_label('Tiền gia hạn QA-333.72',exact=True)).to_have_value('1.200.000')
        form.get_by_role('button',name='Thu tiền và gia hạn',exact=True).click()
        expect(form).to_contain_text('Đã xác nhận gia hạn')
        checks.append(dict(browser=engine,case='multi-bike-payment',separateDeadlines=True,receiptDateIndependent=True))
        page.close()
        state.clear();state.update(collect=False)
        old_end=None
        page,form=open_form()
        expect(form).to_contain_text('chưa có ngày hợp lệ')
        expect(form.get_by_role('button',name='Lưu gia hạn',exact=True)).to_be_disabled()
        checks.append(dict(browser=engine,case='missing-deadline',noReceiptDateFallback=True))
        page.close()
        ctx.unroute_all(behavior='ignoreErrors');ctx.close();browser.close()
assert not errors,errors
assert not unexpected,unexpected
report=dict(passed=len(checks),checks=checks,errors=errors,simulatedWrites=len(writes),realBusinessWrites=0,realTelegramRequests=0)
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
