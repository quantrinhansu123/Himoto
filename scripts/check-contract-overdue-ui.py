"""Overdue time / fee / debt columns on desktop and mobile. All APIs are read-only mocks."""
import argparse,json
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3022');p.add_argument('--cookie-file',required=True);p.add_argument('--browser',choices=['chromium','webkit'],default='chromium');p.add_argument('--output',default='.backups/media-tabs-overdue-20261021/overdue');a=p.parse_args()
out=Path(a.output)/a.browser;out.mkdir(parents=True,exist_ok=True);checks=[];requests=[];errors=[];expect.set_options(timeout=30000)
rows=[]
for id,minutes,fee in [(1,3075,360000),(2,125,60000),(3,2880,None)]:
    row=dict(id=id,code=f'QA-OVERDUE-{id}',name=f'QA-OVERDUE-{id}',status='overdue',customer_name=f'Khách quá hạn QA {id}',customer_phone='0900000000',vehicle_name='Xe QA',license=f'QA-{id:03}',store_id=32,store_name='CS QA',start_date='2026-10-01T09:00:00+07:00',end_date='2026-10-18T09:00:00+07:00',total_amount=1000000,paid_amount=600000,deposit_amount=2000000,rental_type='daily',contract_type_id='daily',contract_type_name='Thuê theo ngày',overdue_days=minutes//1440,overdue_minutes=minutes,rental_debt_amount=400000)
    if fee is not None:row['overdue_fee_estimate']=fee
    rows.append(row)

def mock(route):
    if mock_contract_type_read(route):return
    req=route.request;path=urlparse(req.url).path;query={k:v[0] for k,v in parse_qs(urlparse(req.url).query).items()}
    assert req.method=='GET',f'Unexpected business write: {req.method} {path}'
    requests.append(dict(path=path,query=query))
    if path=='/api/auth/order/car-rental':
        assert query.get('scope')=='overdue' and query.get('table')=='1'
        data_rows=list(rows)
        if query.get('overdue_days'):
            days=int(query['overdue_days']);data_rows=[r for r in data_rows if r['overdue_days']==days]
        key=query.get('sort','overdue_minutes');reverse=query.get('direction')=='desc'
        known=[r for r in data_rows if key in r];missing=[r for r in data_rows if key not in r]
        data_rows=sorted(known,key=lambda r:r[key],reverse=reverse)+missing
        data=dict(rows=data_rows,total=len(data_rows),scopeCount=3,tabCount=len(data_rows),page=1,pages=1,statusCounts=[['overdue',3],['renting',3]],statuses=['overdue'],dueCount=0,summary=dict(contractCount=len(data_rows),blacklistCount=0,totalAmount=len(data_rows)*1000000,receivableAmount=len(data_rows)*400000,badDebtAmount=0))
    elif path=='/api/session':route.fulfill(json=dict(user=dict(name='QA')));return
    elif path=='/api/auth/stores':data=[dict(id=32,store_name='CS QA',status='opening')]
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as pw:
    browser=getattr(pw,a.browser).launch();mobile=a.browser=='webkit'
    ctx=browser.new_context(viewport=dict(width=390 if mobile else 1600,height=1000),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
    ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
    page=ctx.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(a.url+'/contracts/overdue',wait_until='networkidle',timeout=120000)
    region=page.get_by_role('region',name='Hợp đồng quá hạn',exact=True)
    expect(region.get_by_role('heading',name='Hợp đồng quá hạn',exact=True)).to_be_visible()
    expect(region.get_by_text('Tiền thuê còn thiếu chưa gồm phí tạm tính',exact=False)).to_be_visible()
    if mobile:
        card=region.locator('.mg-mobile-record-card').filter(has_text='QA-OVERDUE-1')
        expect(card).to_contain_text('2 ngày 3 giờ 15 phút');expect(card).to_contain_text('360.000');expect(card).to_contain_text('400.000')
        expect(region.locator('.mg-mobile-record-card').filter(has_text='QA-OVERDUE-2')).to_contain_text('0 ngày 2 giờ 5 phút')
        expect(region.locator('.mg-mobile-record-card').filter(has_text='QA-OVERDUE-3')).to_contain_text('Cần đối chiếu')
        region.get_by_role('combobox',name='Sắp xếp danh sách',exact=True).select_option('overdue_fee_estimate')
    else:
        for text in ['Thời gian quá hạn','Phí quá hạn (tạm tính)','Tiền thuê còn thiếu']:expect(region.get_by_role('columnheader',name=text,exact=False)).to_be_visible()
        row=region.locator('tbody tr').filter(has_text='QA-OVERDUE-1')
        expect(row).to_contain_text('2 ngày 3 giờ 15 phút');expect(row).to_contain_text('360.000');expect(row).to_contain_text('400.000')
        expect(region.locator('tbody tr').filter(has_text='QA-OVERDUE-2')).to_contain_text('0 ngày 2 giờ 5 phút')
        expect(region.locator('tbody tr').filter(has_text='QA-OVERDUE-3')).to_contain_text('Cần đối chiếu')
        region.get_by_role('columnheader',name='Phí quá hạn (tạm tính)',exact=False).get_by_role('button').click()
    checks.append('Elapsed days/hours/minutes, estimated late fees and rental debt are visible together; missing prices show a reconciliation message')
    page.wait_for_timeout(500)
    assert any(r['query'].get('sort')=='overdue_fee_estimate' for r in requests)
    region.get_by_role('spinbutton',name='Số ngày quá hạn',exact=True).fill('0')
    if mobile:expect(region.locator('.mg-mobile-record-card')).to_have_count(1)
    else:expect(region.locator('tbody tr')).to_have_count(1)
    checks.append('Fee sorting reaches the paged API and the 0-day filter keeps rentals overdue by only hours')
    page.screenshot(path=str(out/'overdue-filtered.png'),full_page=True)
    region.get_by_role('button',name='Bỏ lọc số ngày quá hạn',exact=True).click()
    if mobile:expect(region.locator('.mg-mobile-record-card')).to_have_count(3)
    else:expect(region.locator('tbody tr')).to_have_count(3)
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
    page.screenshot(path=str(out/'overdue-columns.png'),full_page=True)
    assert not errors,errors
    checks.append('The full and filtered lists fit desktop/mobile widths without JavaScript errors or financial writes')
    ctx.unroute_all(behavior='wait');ctx.close();browser.close()
result=dict(passed=len(checks),browser=a.browser,checks=checks,javascriptErrors=errors,realBusinessWrites=0)
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
