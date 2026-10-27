"""Legacy ownership fee labels on desktop/mobile; live mode permits only GETs."""
import argparse,json,re
from datetime import datetime,timedelta,timezone
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from lib.contract_type_fixtures import mock_contract_type_read

parser=argparse.ArgumentParser()
parser.add_argument('--url',default='http://127.0.0.1:3027')
parser.add_argument('--cookie-file',required=True)
parser.add_argument('--browser',choices=['chromium','webkit'],required=True)
parser.add_argument('--live',action='store_true')
parser.add_argument('--output',default='.backups/overdue-billing-comparison-20261027/ui')
args=parser.parse_args();out=Path(args.output)/('live' if args.live else 'fixtures')/args.browser;out.mkdir(parents=True,exist_ok=True)
now=datetime.now(timezone.utc);errors=[];writes=[];checks=[];expect.set_options(timeout=45000)
fixtures=[]
for index,code,minutes,price,rate in [(1,'VPS-29986',8980,190000,0),(2,'VPS-31140',8900,160000,15000),(3,'VPS-28513',7849,190000,0),(4,'QA-NO-PRICE',7849,None,0)]:
    due=(now-timedelta(minutes=minutes)).isoformat()
    fixtures.append(dict(id=index,contract_number=code,status='overdue',store_id=35,store_kind='lease_to_own',store_name='CS QA',customer_name='Khách QA',rental_type='ownership',legacy_source_store_id='29',total_amount=1000000,paid_amount=1000000,deposit_amount=3000000,start_date=(now-timedelta(days=60)).isoformat(),end_date=due,vehicles=[dict(id=index,name='Xe QA',license=f'QA-{index}',return_at=due)],overdue_items=[dict(return_at=due,daily_price=None,legacy_fee_policy=True,legacy_daily_price=price,legacy_hourly_rate=rate,legacy_fixed_total=False)]))

def route_api(route):
    req=route.request;path=urlparse(req.url).path
    if req.method!='GET':
        writes.append(dict(path=path,method=req.method));route.fulfill(status=403,json=dict(message='Read-only verification'));return
    if args.live:route.continue_();return
    if mock_contract_type_read(route):return
    if path=='/api/auth/order/car-rental':data=fixtures
    elif path=='/api/auth/stores':data=[dict(id=35,store_name='CS QA',kind='lease_to_own',status='opening')]
    elif path=='/api/auth/gps':data=dict(selected_vehicles=[])
    elif path=='/api/session':route.fulfill(json=dict(user=dict(name='QA')));return
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as p:
    browser=getattr(p,args.browser).launch();mobile=args.browser=='webkit'
    ctx=browser.new_context(viewport=dict(width=390 if mobile else 1500,height=900),timezone_id='Asia/Ho_Chi_Minh',service_workers='block',reduced_motion='reduce')
    ctx.add_cookies([dict(name='himoto_management_session',value=Path(args.cookie_file).read_text().strip(),url=args.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',route_api)
    for code in ['VPS-29986','VPS-31140','VPS-28513']:
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(args.url+'/contracts/ownership?status=overdue&search='+code,wait_until='networkidle',timeout=90000)
        region=page.get_by_role('region',name='Hợp đồng thuê sở hữu',exact=True)
        rows=region.locator('.mg-mobile-record-card' if mobile else 'tbody tr')
        row=rows.filter(has_text=code);expect(row).to_have_count(1)
        expect(row).to_contain_text('Phí trễ tạm tính');expect(row).to_contain_text('Nợ thuê đã ghi nhận:')
        if not args.live:expect(row).to_contain_text('1.020.000' if code=='VPS-31140' else '1.140.000')
        else:expect(row.locator('.mg-monitoring-amount strong')).to_have_text(re.compile(r'.*[1-9].*'))
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
        row.screenshot(path=str(out/(code+'.png')))
        checks.append(code+': legacy estimated fee and recorded rental debt are separate and visible')
        page.wait_for_load_state('networkidle');page.close()
    if not args.live:
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(args.url+'/contracts/ownership?status=overdue&search=QA-NO-PRICE',wait_until='networkidle',timeout=90000)
        rows=page.locator('.mg-mobile-record-card' if mobile else 'tbody tr');row=rows.filter(has_text='QA-NO-PRICE')
        expect(row).to_contain_text('Cần đối chiếu');expect(row).to_contain_text('Nợ thuê đã ghi nhận:')
        checks.append('Missing daily price shows reconciliation instead of a false zero')
        page.wait_for_load_state('networkidle');page.close()
    assert not errors,errors
    assert not writes,writes
    ctx.unroute_all(behavior='wait');ctx.close();browser.close()
report=dict(passed=len(checks),browser=args.browser,live=args.live,checks=checks,javascript_errors=errors,realBusinessWrites=0,realTelegramSends=0)
(out/'results.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8');print(json.dumps(report,ensure_ascii=False))
