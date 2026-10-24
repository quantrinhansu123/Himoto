"""Performance regressions: bounded reads, metadata freshness, lazy reports and GPS paging. All APIs mocked."""
import argparse,json
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
from lib.contract_type_fixtures import mock_contract_type_read
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3014');p.add_argument('--cookie-file',required=True);p.add_argument('--browser',choices=['chromium','webkit'],default='chromium');p.add_argument('--output',default='.backups/product-speed-20261025/ui');a=p.parse_args()
out=Path(a.output)/a.browser;out.mkdir(parents=True,exist_ok=True)
state=dict(total=75,queries=[],hold_summary=False,held=None);errors=[];writes=[]
class Checks(list):
    def append(self,value):
        super().append(value);print(f'PASS: {value}',flush=True)
checks=Checks()
def mock(route):
    req=route.request;path=urlparse(req.url).path;q={k:v[0] for k,v in parse_qs(urlparse(req.url).query).items()}
    state['queries'].append((path,q,req.method))
    if mock_contract_type_read(route):return
    if path=='/api/auth/gps/refresh':route.fulfill(json=dict(status='success',data=dict(cached=True)));return
    if req.method!='GET':writes.append(path);route.abort();return
    if path=='/api/session':route.fulfill(json=dict(user=dict(name='QA')));return
    if path=='/api/auth/order/car-rental':
        if q.get('summary')=='sales':route.fulfill(json=dict(status='success',data=[]));return
        total=0 if q.get('search')=='NOT-FOUND' else state['total'];size=int(q.get('size','10'));number=int(q.get('page','1'));rows=[dict(id=i,code=f'QA-{i:03}',name=f'QA-{i:03}',status='completed',customer_name=f'KHÁCH QA {i}',customer_phone='0900000000',store_id=34,license=f'QA-{i:03}',vehicles_json='[]',start_date='2026-10-23T09:00',end_date='2026-10-24T09:00',total_amount=1000,paid_amount=1000) for i in range(1,total+1)]
        data=dict(rows=rows[(number-1)*size:number*size],total=total,scopeCount=state['total'],tabCount=total,page=number,pages=max(1,(total+size-1)//size),statusCounts=[['completed',total]] if q.get('status_counts')=='1' else [],statuses=['completed'],dueCount=0,summary=dict(contractCount=total,blacklistCount=0,totalAmount=total*1000,receivableAmount=0,badDebtAmount=0))
    elif path=='/api/auth/vehicle/vehicles':
        assert q.get('table')=='1','Full vehicle collection downloaded during ordinary table/GPS refresh'
        rows=[dict(id=i,code=f'XE-{i}',name=f'XE QA {i}',license=f'QA-{i:03}',store_id=34,status='ready',location_status='none') for i in range(1,11)]
        data=dict(rows=rows,total=1000,scopeCount=1000,tabCount=1000,page=1,pages=100,statusCounts=[['ready',1000]],statuses=['ready'],dueCount=0,summary=None)
    elif path=='/api/auth/rental-revenue':
        if state['hold_summary']:state['held']=route;return
        amounts=dict(rental=1000,renewal=0,late=0,early=0,revenue=1000);data=dict(total=amounts,days=[dict(**amounts,key='2026-10-23',name='2026-10-23',events=1)],staff=[dict(**amounts,key='1',name='QA',events=1)],unassigned=dict(rental=0,renewal=0,late=0,early=0,revenue=0),unclassified_amount=0,unclassified_count=0)
    elif path=='/api/auth/rental-revenue/transactions':
        totals=dict(count=0,contracts=0,income_count=0,expense_count=0,revenue_count=0,income=0,expense=0,net=0,revenue=0,deposit=0,deposit_refund=0,methods={k:dict(income=0,expense=0,revenue=0,count=0) for k in ['cash','personal','company','mixed','unknown']});data=dict(rows=[],total=0,page=1,pages=1,page_size=20,totals=totals,export_all=False)
    elif path=='/api/auth/staff-sales':data=dict(rows=[])
    elif path=='/api/auth/gps':
        if q.get('vehicle_ids'):data=dict(selected_vehicles=[])
        else:data=dict(devices=[dict(id=i,vehicle_id=i,provider='protrack',external_device_id=f'IMEI-QA-{i}',provider_device_name=f'GPS QA {i}',mapping_status='manual',license=f'QA-{i:03}',store_id=34,store_name='QA',management_status='none',sync_received_at=None,heartbeat_at=None,last_latitude=None,last_longitude=None,last_speed=None) for i in range(1,121)],events=[])
    elif path in ['/api/auth/stores','/api/auth/store-directory']:data=[dict(id=34,store_name='CS QA',status='opening')]
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))
def calls(path):return [q for p,q,m in state['queries'] if p==path]
with sync_playwright() as pw:
    browser=getattr(pw,a.browser).launch();ctx=browser.new_context(viewport=dict(width=1440 if a.browser=='chromium' else 390,height=1000),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
    ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
    page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.clock.install(time=datetime.now(timezone.utc))
    page.goto(a.url+'/contracts',wait_until='networkidle');expect(page.locator('.mg-result-range strong').last).to_have_text('75')
    assert calls('/api/auth/order/car-rental')[-1].get('status_counts')=='1'
    page.clock.fast_forward(10000);page.get_by_role('button',name='Trang sau',exact=True).click();expect(page.locator('.mg-current-page')).to_have_text('2');assert 'status_counts' not in calls('/api/auth/order/car-rental')[-1]
    page.clock.fast_forward(10000);page.get_by_role('button',name='Trang sau',exact=True).click();expect(page.locator('.mg-current-page')).to_have_text('3');assert 'status_counts' not in calls('/api/auth/order/car-rental')[-1]
    page.clock.fast_forward(12000);page.get_by_role('button',name='Trang sau',exact=True).click();expect(page.locator('.mg-current-page')).to_have_text('4');assert calls('/api/auth/order/car-rental')[-1].get('status_counts')=='1'
    checks.append('Pagination reuses fresh statistics without re-running full-history summaries; expiry is measured from the original statistics read and does not slide forward on each page')
    state['total']=76;before=len(calls('/api/auth/order/car-rental'));page.get_by_role('button',name='Trang sau',exact=True).click();expect(page.locator('.mg-result-range strong').last).to_have_text('76');expect(page.locator('.mg-current-page')).to_have_text('5');assert len(calls('/api/auth/order/car-rental'))==before+2;assert calls('/api/auth/order/car-rental')[-1].get('status_counts')=='1'
    checks.append('A concurrent create changes total, so pagination obtains new counts and financial summaries instead of retaining stale metadata')
    page.get_by_role('searchbox').fill('NOT-FOUND');expect(page.locator('.mg-result-range strong').last).to_have_text('0');assert calls('/api/auth/order/car-rental')[-1].get('status_counts')=='1'
    page.get_by_role('searchbox').fill('');expect(page.locator('.mg-result-range strong').last).to_have_text('76');page.get_by_text('Thao tác khác',exact=True).click();page.get_by_role('button',name='Làm mới',exact=True).click();expect(page.locator('table')).to_have_attribute('aria-busy','false');assert calls('/api/auth/order/car-rental')[-1].get('status_counts')=='1'
    checks.append('Search/filter changes cannot reuse another result set’s counts; explicit refresh invalidates row and statistics caches together')
    page.goto(a.url+'/vehicles',wait_until='networkidle');expect(page.locator('.mg-result-range strong').last).to_have_text('1000');assert len(calls('/api/auth/vehicle/vehicles'))==1
    page.clock.fast_forward(31000);expect(page.locator('table')).to_have_attribute('aria-busy','false');page.wait_for_timeout(300);assert len(calls('/api/auth/vehicle/vehicles'))>=2;assert all(q.get('table')=='1' for q in calls('/api/auth/vehicle/vehicles'))
    checks.append('Vehicle page and GPS refresh request only paged rows, never the full stock collection, while the existing 30-second table refresh remains active')
    state['queries'].clear();state['hold_summary']=True;page.goto(a.url+'/staff-sales',wait_until='domcontentloaded');book=page.get_by_role('region',name='Sổ giao dịch từng phiếu',exact=True);expect(book.get_by_role('heading',level=3)).to_contain_text('0 phiếu')
    assert calls('/api/auth/rental-revenue/transactions');assert not calls('/api/auth/staff-sales');assert not calls('/api/auth/hr/staff');assert not any(q.get('summary')=='sales' for q in calls('/api/auth/order/car-rental'))
    state['hold_summary']=False;held=state['held'];assert held;state['held']=None;mock(held);expect(page.locator('[data-revenue-total]')).to_have_text('1.000 đ')
    checks.append('Ledger reads start independently of the headline revenue response; hidden supplementary reports and staff directory perform no eager reads')
    page.get_by_text('Thống kê hợp đồng & báo cáo khác',exact=True).click();expect(page.get_by_text('Theo NVKD / TLS được phân công',exact=True)).to_be_visible();page.wait_for_timeout(300);assert calls('/api/auth/staff-sales');assert calls('/api/auth/hr/staff');assert any(q.get('summary')=='sales' for q in calls('/api/auth/order/car-rental'))
    checks.append('Opening supplementary reports loads their data on demand; the complete feature remains available')
    page.goto(a.url+'/gps',wait_until='networkidle');expect(page.locator('.mg-desktop-records tbody tr')).to_have_count(50);expect(page.get_by_role('button',name='Toàn bộ xe 120',exact=True)).to_be_visible();page.get_by_role('button',name='Trang GPS sau',exact=True).click();expect(page.get_by_text('Trang 2/3',exact=True)).to_be_visible()
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
    page.get_by_role('navigation',name='Phân trang GPS',exact=True).screenshot(path=str(out/'gps-pagination.png'))
    page.get_by_role('searchbox',name='Tìm GPS',exact=True).fill('QA-120');expect(page.locator('.mg-desktop-records tbody tr')).to_have_count(1);expect(page.locator('.mg-desktop-records tbody')).to_contain_text('QA-120')
    checks.append('GPS renders at most 50 devices per page while whole-fleet counts and searches include all devices, including records beyond the current page')
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth');assert not errors,errors;assert not writes,writes;page.screenshot(path=str(out/'gps.png'),full_page=True);browser.close()
result=dict(passed=len(checks),browser=a.browser,checks=checks,realBusinessWrites=0,realProviderCalls=0,jsErrors=errors);(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
