"""GPS status/evidence QA; every API and provider request is intercepted."""
import argparse,json,time
from datetime import datetime,timezone,timedelta
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from lib.contract_type_fixtures import mock_contract_type_read
parser=argparse.ArgumentParser()
parser.add_argument('--url',default='http://127.0.0.1:3101')
parser.add_argument('--session-cookie-file',required=True)
parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium')
parser.add_argument('--output',default='docs/qa/gps-status-parity')
args=parser.parse_args();out=Path(args.output)/args.browser;out.mkdir(parents=True,exist_ok=True)
expect.set_options(timeout=20000)
now=datetime.now(timezone.utc);stamp=lambda ago:(now-timedelta(seconds=ago)).isoformat()
checks,errors,unexpected,refreshes,reads=[],[],[],[],[]
stores=[dict(id=1,store_name='Cơ sở QA',status='opening')]
statuses=['stopped','online','offline','stale','warning','unavailable','none']
vehicles=[dict(id=35+i,name='WAVE QA',license='90B3-092.33' if i==0 else f'QA-{i}',store_id=1,current_store_id=1,status='ready',type='xeso',gps_has_device=i!=6,gps_normalized_status=status,gps_last_sync=stamp(700 if status=='stale' else 0),gps_heartbeat_at=stamp(7*60),gps_position_at=stamp(7*86400),gps_reported_at=stamp(7*86400),gps_ignition=False) for i,status in enumerate(statuses)]
def mock(route):
    if mock_contract_type_read(route):return
    req=route.request;path=urlparse(req.url).path.rstrip('/')
    if path=='/api/auth/gps/refresh':
        refreshes.append(time.monotonic())
        # A provider failure must still refresh the list and show a stale marker.
        route.fulfill(status=503,json=dict(status='error',message='QA provider unavailable'));return
    if req.method!='GET':unexpected.append(req.method+' '+path);route.abort();return
    if path=='/api/auth/vehicle/vehicles':reads.append(time.monotonic());data=vehicles
    elif path=='/api/auth/gps':
        data=dict(devices=[dict(id=230,vehicle_id=35,provider='protrack',external_device_id='qa-device',provider_device_name='90B3-092.33',license='90B3-092.33',store_id=1,store_name='Cơ sở QA',management_status='stopped',mapping_status='auto',sync_received_at=stamp(0),heartbeat_at=stamp(7*60),position_recorded_at=stamp(7*86400),last_speed=12,last_latitude=None,last_longitude=None)],events=[])
    else:data={'/api/auth/stores':stores,'/api/auth/customers':[],'/api/auth/order/car-rental':[],'/api/auth/hr/staff':[],'/api/auth/payment-events':[]}.get(path)
    if data is None:unexpected.append(req.method+' '+path);route.abort()
    else:route.fulfill(json=dict(status='success',data=data))
with sync_playwright() as p:
    browser=getattr(p,args.browser).launch();context=browser.new_context(viewport=dict(width=390,height=844),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
    context.add_cookies([dict(name='himoto_management_session',value=Path(args.session_cookie_file).read_text().strip(),url=args.url,httpOnly=True,sameSite='Strict')])
    context.route('**/api/**',mock)
    for domain in ['**protrack365.com/**','**gpscenter.xyz/**','**iopgps.com/**','**api.telegram.org/**']:
        context.route(domain,lambda route:(_ for _ in ()).throw(AssertionError('Real provider request blocked')))
    page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(args.url+'/vehicles',wait_until='networkidle')
    target=page.locator('.mg-mobile-record-card').filter(has=page.get_by_text('90B3-092.33',exact=False))
    expect(target).to_contain_text('ON · Đang dừng');expect(target).to_contain_text('HIMOTO đọc:');expect(target).to_contain_text('Vị trí GPS cũ:')
    for text in ['OFF · Mất kết nối','Chưa cập nhật','Cảnh báo','Không còn trong tài khoản GPS','Chưa gắn GPS']:
        expect(page.locator('.mg-mobile-card-list')).to_contain_text(text)
    initial=len(reads);page.wait_for_timeout(10800)
    assert len(refreshes)>=3 and len(reads)>=initial+2,(refreshes,reads)
    assert all(b-a>=3.8 for a,b in zip(refreshes,refreshes[1:])),refreshes
    checks.append('Vehicle cards show connected/stopped separately from OFF/stale/unavailable/unmapped; a failed refresh still reads status on the five-second cycle')
    for width in [390,1440]:
        page.set_viewport_size(dict(width=width,height=900));page.wait_for_function('document.documentElement.scrollWidth<=innerWidth')
        if width==390:target.evaluate("el=>el.scrollIntoView({block:'center'})")
        else:page.evaluate('window.scrollTo(0,0)')
        page.screenshot(path=str(out/f'vehicle-status-{width}.png'))
    page.locator('.mg-sidebar').get_by_role('link',name='Định vị GPS',exact=True).click()
    page.wait_for_url(args.url+'/gps');page.wait_for_load_state('networkidle')
    card=page.locator('.mg-reminder-card').filter(has=page.get_by_text('90B3-092.33',exact=True))
    for text in ['ON · Đang dừng','Tín hiệu thiết bị:','Vị trí GPS cũ:']:
        expect(card).to_contain_text(text)
    expect(card).not_to_contain_text('12 km/h')
    for width in [390,1440]:
        page.set_viewport_size(dict(width=width,height=900));page.wait_for_function('document.documentElement.scrollWidth<=innerWidth')
        if width==390:card.evaluate("el=>el.scrollIntoView({block:'center'})")
        else:page.evaluate('window.scrollTo(0,0)')
        page.screenshot(path=str(out/f'gps-evidence-{width}.png'))
    checks.append('GPS detail shows independent sync/heartbeat/old-position times and never renders seven-day-old 12 km/h as current speed at 390/1440px')
    assert not errors and not unexpected,(errors,unexpected)
    browser.close()
result=dict(passed=len(checks),browser=args.browser,checks=checks,javascriptErrors=errors,unexpectedRequests=unexpected,realBusinessWrites=0,realProviderRequests=0)
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2))
