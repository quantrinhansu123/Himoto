"""Cashbook formulas and inherited rental reports. Every API is mocked; no live writes."""
import argparse,csv,io,json
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3021');p.add_argument('--cookie-file',required=True);p.add_argument('--browser',choices=['chromium','webkit'],default='chromium');p.add_argument('--output',default='.backups/rental-reports-documents-20261023/ui');a=p.parse_args()
out=Path(a.output)/a.browser;out.mkdir(parents=True,exist_ok=True);expect.set_options(timeout=30000)
checks=[];errors=[];requests=[];fail=[False];scope_fail=[False]
detail=dict(deposit_income=2000000,rental_income=1000000,renewal_income=500000,late_fee_income=100000,repair_income=30000,extra_income=20000,other_income=10000,deposit_refund_expense=400000,rental_refund_expense=200000,other_expense=5000)
amounts=dict(rental=1000000,renewal=500000,late=100000,early=200000,revenue=1400000)
actual=dict(total=amounts,unassigned=dict(rental=0,renewal=0,late=0,early=0,revenue=0),unclassified_amount=0,unclassified_count=0,days=[dict(**amounts,key='2026-10-23',name='2026-10-23',events=4)],staff=[dict(**amounts,key='7',name='NVKD QA',events=4)])
overview=dict(key='1',name='Cơ sở QA',breakdown=detail,revenue=1400000,income=3600000,expense=600000)
vehicles=[dict(id=1000+i,name=f'Xe báo cáo {i}',license=f'29B1-{i:05}',store_name='Cơ sở QA',type='xeso',year=2022,rentals=1,rental=(i+1)*100000,renewal=10000,adjustment=-20000 if i==0 else 50000,revenue=(i+1)*100000+10000+(-20000 if i==0 else 50000)) for i in range(13)]
records=[dict(id=100+i,type='out' if key.endswith('_expense') else 'in',created_at='2026-10-23T10:00:00+07:00',amount=value,user_id=7,user_name='QA',reason=key,content='QA',store_id=1,store_name='Cơ sở QA',category=key) for i,(key,value) in enumerate(detail.items())]

def money(value):return f'{value:,}'.replace(',','.')+' đ'
def mock(route):
    req=route.request;path=urlparse(req.url).path;q={key:value[0] for key,value in parse_qs(urlparse(req.url).query).items()};requests.append((path,q,req.method))
    assert req.method=='GET',f'Unexpected write: {path}'
    if path=='/api/session':route.fulfill(json=dict(user=dict(id=143,name='QA')));return
    if path=='/api/auth/stores':data=[dict(id=1,store_name='Cơ sở QA',status='opening')]
    elif path=='/api/auth/staff-sales':data=dict(rows=[])
    elif path=='/api/auth/rental-revenue':data=actual
    elif path=='/api/auth/staff-sales/vehicle-revenue':
        if fail[0]:fail[0]=False;route.fulfill(status=503,json=dict(status='error',message='QA lỗi tải báo cáo xe'));return
        if q.get('vehicle_id'):
            row=next(item for item in vehicles if str(item['id'])==q['vehicle_id'])
            data=[dict(id=33,order_id=42,code='HD-QA-42',rent_at='2026-10-23T09:00:00+07:00',return_at='2026-10-24T09:00:00+07:00',rental=row['rental'],renewal=row['renewal'],adjustment=row['adjustment'],revenue=row['revenue'])]
        else:
            rows=[item for item in vehicles if not q.get('search') or q['search'] in item['license'] or q['search'].lower() in item['name'].lower()]
            rows.sort(key=lambda item:item[q.get('sort','revenue')],reverse=q.get('direction','desc')=='desc');page=min(int(q.get('page',1)),max(1,(len(rows)+9)//10))
            data=dict(rows=rows if q.get('mode')=='all' else rows[(page-1)*10:page*10],total=len(rows),page=1 if q.get('mode')=='all' else page,size=10,**{key:sum(item[key] for item in rows) for key in ['rentals','rental','renewal','adjustment','revenue']})
    elif path=='/api/auth/staff-sales/rental-overview':
        row=dict(overview,key=q.get('from','2026-10-23'),name=q.get('from','2026-10-23')) if q.get('view')=='days' else overview
        data=dict(rows=[row],total=dict(overview,key='total',name='Tổng'))
    elif path=='/api/auth/cashbook/vouchers':
        if scope_fail[0]:scope_fail[0]=False;route.fulfill(status=503,json=dict(status='error',message='QA lỗi sổ quỹ'));return
        data=dict(total=len(records),actors=[['id:7','QA']],breakdown=detail)
        for kind in ['income','expense']:
            rows=[row for row in records if (row['type']=='out')==(kind=='expense')];size=int(q.get(kind+'_limit',5));page=min(int(q.get(kind+'_page',1)),max(1,(len(rows)+size-1)//size))
            data[kind]=dict(rows=rows[(page-1)*size:page*size],total=len(rows),amount=sum(row['amount'] for row in rows),page=page,pageSize=size)
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as pw:
    browser=getattr(pw,a.browser).launch();ctx=browser.new_context(viewport=dict(width=390 if a.browser=='webkit' else 1440,height=950),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce',accept_downloads=True)
    ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
    page=ctx.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(a.url+'/cashbook',wait_until='networkidle',timeout=120000)
    summary=page.get_by_role('region',name='Tổng hợp thu chi theo bộ lọc',exact=True)
    expect(summary).to_have_attribute('aria-busy','false')
    for key,value in [('revenue',1400000),('income',3600000),('expense',600000)]:
        card=summary.locator(f'[data-metric="{key}"]');expect(card.locator('.mg-cashbook-metric-value')).to_have_text(money(value));assert not card.evaluate('(element)=>element.open')
        expect(card.locator('dl')).not_to_be_visible();card.locator('summary').focus();card.locator('summary').press('Enter');expect(card.locator('dl')).to_be_visible()
    expect(summary.locator('[data-metric="revenue"] [data-summary="rental_refund_expense"]')).to_have_text(money(200000))
    expect(page.locator('#cashbook-income .mg-cashbook-table-total strong')).to_have_text(money(3660000))
    expect(page.locator('#cashbook-expense .mg-cashbook-table-total strong')).to_have_text(money(605000))
    page.get_by_role('button',name='Hôm nay',exact=True).click();expect(summary).to_have_attribute('aria-busy','false');last=[q for path,q,_ in requests if path.endswith('/vouchers')][-1];assert last['from']==last['to']
    page.screenshot(path=str(out/'cashbook-disclosures.png'),full_page=True)
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
    checks.append('Three cashbook totals match the requested formulas over all pages, initially hide children and support keyboard disclosure; all-voucher totals remain separate and Today requests one Vietnam day')
    scope_fail[0]=True;page.get_by_role('button',name='Tải lại',exact=True).click();expect(summary.locator('[data-metric="revenue"] .mg-cashbook-metric-value')).to_have_text('—')
    page.get_by_role('button',name='Tải lại',exact=True).click();expect(summary.locator('[data-metric="revenue"] .mg-cashbook-metric-value')).to_have_text(money(1400000))
    checks.append('Cashbook read failures hide stale totals and retry recovers the current filter')
    page.goto(a.url+'/staff-sales',wait_until='networkidle',timeout=120000)
    assert not any(path.endswith('/vehicle-revenue') or path.endswith('/rental-overview') for path,_,_ in requests)
    page.get_by_role('button',name='Doanh thu từng xe',exact=True).click()
    panel=page.get_by_role('region',name='Báo cáo doanh thu từng xe',exact=True)
    expect(panel).to_have_attribute('aria-busy','false');expect(panel.locator('tbody tr')).to_have_count(10)
    total=sum(row['revenue'] for row in vehicles);expect(panel.locator('[data-vehicle-revenue]')).to_have_text(money(total))
    panel.get_by_role('button',name='Trang cuối',exact=True).click();expect(panel.get_by_text('13 xe · Trang 2 / 2',exact=True)).to_be_visible();expect(panel.locator('tbody tr')).to_have_count(3)
    expect(panel.locator('[data-vehicle-revenue]')).to_have_text(money(total))
    panel.get_by_role('button',name='Xem lượt thuê xe 29B1-00000',exact=True).click();dialog=page.get_by_role('dialog',name='Doanh thu xe · 29B1-00000',exact=True)
    expect(dialog.get_by_role('link',name='HD-QA-42',exact=True)).to_have_attribute('href','/contracts?contract_id=42');expect(dialog.get_by_text(money(90000),exact=True)).to_have_count(2)
    dialog.get_by_role('button',name='Đóng',exact=True).click()
    with page.expect_download() as download:panel.get_by_role('button',name='Xuất Excel (CSV)',exact=True).click()
    file=out/'vehicles.csv';download.value.save_as(file);rows=list(csv.reader(io.StringIO(file.read_text(encoding='utf-8-sig'))));assert len(rows)==15 and rows[-1][-1]==str(total)
    panel.get_by_role('searchbox',name='Tìm xe trong báo cáo',exact=True).fill('29B1-00000');expect(panel.locator('tbody tr')).to_have_count(1);expect(panel.get_by_text('1 xe · Trang 1 / 1',exact=True)).to_be_visible()
    expect(panel.locator('[data-vehicle-revenue]')).to_have_text(money(90000))
    fail[0]=True;page.get_by_role('button',name='Tải lại',exact=True).click();expect(panel.get_by_role('alert')).to_contain_text('QA lỗi tải báo cáo xe')
    panel.get_by_role('button',name='Thử lại báo cáo',exact=True).click();expect(panel.locator('[data-vehicle-revenue]')).to_have_text(money(90000))
    page.screenshot(path=str(out/'vehicle-report.png'),full_page=True)
    checks.append('Vehicle report loads only when selected; last page reaches all vehicles, totals span every page, details link to the contract, CSV exports all rows, search resets page and failed reads retry without showing another filter')
    page.get_by_role('button',name='Tổng quan thuê xe',exact=True).click();panel=page.get_by_role('region',name='Tổng quan báo cáo thuê xe',exact=True)
    for key,value in [('revenue',1400000),('income',3600000),('expense',600000)]:expect(panel.locator(f'[data-overview="{key}"]')).to_have_text(money(value))
    panel.get_by_role('button',name='Xem theo ngày Cơ sở QA',exact=True).click();dialog=page.get_by_role('dialog',name='Thuê xe · Cơ sở QA',exact=True)
    expect(dialog.get_by_role('region',name='Thẻ thu chi theo ngày' if a.browser=='webkit' else 'Thu chi theo ngày',exact=True)).to_be_visible();dialog.get_by_role('button',name='Đóng',exact=True).click()
    panel.get_by_role('button',name='Theo ngày',exact=True).click();expect(panel.get_by_role('region',name='Thẻ thu chi theo ngày' if a.browser=='webkit' else 'Thu chi theo ngày',exact=True)).to_be_visible()
    with page.expect_download() as download:panel.get_by_role('button',name='Xuất Excel (CSV)',exact=True).click()
    file=out/'overview.csv';download.value.save_as(file);rows=list(csv.reader(io.StringIO(file.read_text(encoding='utf-8-sig'))));assert rows[-1][1:4]==['1400000','3600000','600000']
    page.get_by_role('button',name='Hôm nay',exact=True).click();expect(panel).to_have_attribute('aria-busy','false')
    page.get_by_label('Cơ sở đang xem',exact=True).select_option('1');expect(panel).to_have_attribute('aria-busy','false');last=[q for path,q,_ in requests if path.endswith('/rental-overview')][-1];assert last['from']==last['to'] and last['store_id']=='1'
    page.screenshot(path=str(out/'rental-overview.png'),full_page=True)
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
    checks.append('Overview reconciles deposit, rental, renewal, late and early-refund amounts; store drilldown/day view and CSV match; shared date/branch filters apply and mobile has no page overflow')
    assert not errors,errors
    result=dict(passed=len(checks),browser=a.browser,checks=checks,javascriptErrors=errors,realBusinessWrites=0);(out/'reports-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
    browser.close()
