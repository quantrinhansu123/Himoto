"""Revenue/KPI and early refund UI. All business APIs are intercepted."""
import argparse,csv,io,json
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3014');p.add_argument('--cookie-file',required=True);p.add_argument('--browser',choices=['chromium','webkit'],default='chromium');p.add_argument('--output',default='.backups/revenue-ui');a=p.parse_args()
out=Path(a.output)/a.browser;out.mkdir(parents=True,exist_ok=True)
checks=[];errors=[];writes=[];queries=[];fail=[False]
amounts=dict(rental=1000000,renewal=500000,late=100000,early=200000,revenue=1400000)
report=dict(total=amounts,unassigned=dict(rental=0,renewal=0,late=0,early=0,revenue=0),unclassified_amount=0,unclassified_count=0,
    days=[dict(**amounts,key='2026-10-21',name='2026-10-21',events=4)],staff=[dict(**amounts,key='7',name='NVKD QA',events=4)])
payment=dict(id=42,code='QA-42',status='completed',store_id=23,revision='1',total_amount=800,paid_amount=1000,remaining=0,
    deposit_paid=500,deposit_refunded=0,deposit_held=500,rental_refundable=200,company_paid_amount=0,company_payment_count=0,
    accounts=[dict(id=1,label='Két QA',kind='cash',store_id=23,owner_type='')],history=[],items=[],end_date=None)
def mock(route):
    req=route.request;path=urlparse(req.url).path;query={k:v[0] for k,v in parse_qs(urlparse(req.url).query).items()}
    if req.method!='GET':
        assert path=='/api/auth/order/car-rental/42/payments'
        body=req.post_data_json;assert body['purpose']=='rental_refund' and body['amount']=='80'
        writes.append(body);payment.update(revision='2',paid_amount=920,rental_refundable=120)
        route.fulfill(json=dict(status='success',data=dict(context=payment,transaction_id=100,replayed=False,company_transfer=False)));return
    if path=='/api/auth/rental-revenue':
        queries.append(query)
        if fail[0]:fail[0]=False;route.fulfill(status=503,json=dict(status='error',message='QA không tải được doanh thu'));return
        data=report
    elif path=='/api/auth/order/car-rental/42/payments':data=payment
    elif path=='/api/auth/staff-sales':data=dict(rows=[])
    elif path=='/api/auth/stores':data=[dict(id=23,store_name='CS QA',status='opening')]
    elif path=='/api/session':route.fulfill(json=dict(user=dict(name='QA')));return
    elif path=='/api/auth/cashbook/vouchers':
        empty=dict(rows=[],total=0,amount=0,page=1,pageSize=5);data=dict(total=0,income=empty,expense=empty,actors=[])
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))
with sync_playwright() as pw:
    browser=getattr(pw,a.browser).launch();ctx=browser.new_context(viewport=dict(width=1440 if a.browser=='chromium' else 390,height=950),timezone_id='Asia/Ho_Chi_Minh',accept_downloads=True,reduced_motion='reduce')
    ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
    page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(a.url+'/staff-sales',wait_until='networkidle')
    panel=page.get_by_role('region',name='Doanh thu thuê xe thực thu',exact=True)
    expect(panel.locator('[data-revenue-total]')).to_have_text('1.400.000 đ')
    for key,value in [('rental','1.000.000 đ'),('renewal','500.000 đ'),('late','100.000 đ'),('early','200.000 đ')]:expect(panel.locator(f'[data-revenue="{key}"]')).to_have_text(value)
    expect(page.get_by_text('Thống kê hợp đồng & báo cáo khác',exact=True).locator('..')).not_to_have_attribute('open','')
    panel.get_by_role('button',name='Theo NVKD',exact=True).click();expect(panel.get_by_role('rowheader',name='NVKD QA')).to_be_visible()
    with page.expect_download() as download:panel.get_by_role('button',name='Xuất Excel (CSV)',exact=True).click()
    file=out/'revenue.csv';download.value.save_as(file)
    rows=list(csv.reader(io.StringIO(file.read_text(encoding='utf-8-sig'))));assert rows[1]==['NVKD QA','1000000','500000','100000','200000','1400000']
    checks.append('Full formula has four amounts and total, employee view reconciles, CSV matches visible definitions, unrelated statistics start collapsed')
    page.get_by_role('button',name='Hôm nay',exact=True).click();expect(panel).to_have_attribute('aria-busy','false');assert queries[-1]['from']==queries[-1]['to']
    page.get_by_label('Cơ sở đang xem',exact=True).select_option('23');expect(panel).to_have_attribute('aria-busy','false');assert queries[-1]['store_id']=='23'
    fail[0]=True;page.get_by_role('button',name='Tải lại',exact=True).click();expect(panel.get_by_role('alert')).to_contain_text('QA không tải')
    expect(panel.locator('[data-revenue-total]')).to_have_text('—')
    page.get_by_role('button',name='Tải lại',exact=True).click();expect(panel.locator('[data-revenue-total]')).to_have_text('1.400.000 đ')
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
    page.screenshot(path=str(out/'revenue.png'),full_page=True)
    checks.append('Today and branch filters reach report API; failures hide stale amounts and retry recovers; layout stays within desktop/mobile viewport')
    page.goto(a.url+'/cashbook?contract_id=42&purpose=rental_refund',wait_until='networkidle')
    dialog=page.get_by_role('dialog');expect(dialog.get_by_label('Nghiệp vụ',exact=True)).to_have_value('rental_refund')
    expect(dialog.get_by_text('Chỉ ghi nhận sau khi đã hoàn tiền thuê cho khách.',exact=False)).to_be_visible()
    amount=dialog.get_by_role('textbox',name='Số tiền thu (VNĐ)',exact=True);amount.fill('201')
    dialog.get_by_role('button',name='Ghi nhận đã hoàn tiền thuê',exact=True).click();assert not writes
    amount.fill('80');dialog.get_by_role('button',name='Ghi nhận đã hoàn tiền thuê',exact=True).click()
    expect(dialog).to_contain_text('Chi (hoàn tiền thuê)');assert len(writes)==1
    assert payment['deposit_held']==500
    page.screenshot(path=str(out/'refund.png'),full_page=True)
    checks.append('Early rental refund stays distinct from deposit; excess payout blocked; confirmed payout sends one allowlisted refund request and preserves deposit')
    assert not errors,errors;browser.close()
result=dict(passed=len(checks),browser=a.browser,checks=checks,realBusinessWrites=0,simulatedRefunds=len(writes),jsErrors=errors)
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
