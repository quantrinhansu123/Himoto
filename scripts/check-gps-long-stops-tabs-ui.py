"""GPS long stops and contract tab badges. All application/provider APIs are intercepted."""
import argparse, json, re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser()
p.add_argument('--url', default='http://127.0.0.1:3025')
p.add_argument('--session-cookie-file', required=True)
p.add_argument('--output', default='.backups/gps-long-stops-20261024/ui')
a=p.parse_args(); out=Path(a.output); out.mkdir(parents=True,exist_ok=True)
expect.set_options(timeout=30000)
now=datetime.now(timezone.utc)
stamp=lambda hours:(now-timedelta(hours=hours)).isoformat()
checks, errors, unexpected, requests=[],[],[],[]
state={'gps_fail':False}
devices=[]
for id,vehicle,status,hours in [(1,101,'stopped',80),(2,101,'stopped',79),(3,102,'stopped',71),(4,103,'stopped',90),(5,103,'online',None),(6,104,'offline',100),(7,None,'stopped',100),(8,105,'stopped',90)]:
    devices.append(dict(id=id,vehicle_id=vehicle,provider='protrack',external_device_id=f'QA-IMEI-{id}',provider_device_name=f'GPS QA {id}',license=f'QA-{vehicle}' if vehicle else None,store_id=1,store_name='CS QA',management_status=status,mapping_status='auto',sync_received_at=stamp(1 if id==8 else 0),stopped_since=stamp(hours) if hours else None,heartbeat_at=stamp(0),position_recorded_at=stamp(100),last_speed=0,last_latitude=21,last_longitude=105))
contracts=[dict(id=id,contract_number=f'QA-{id}',order_status=status,order_type='daily',store_id=1,store_name='CS QA',customer_name=f'Khách QA {id}',total_amount=1000,paid_amount=0,start_date=stamp(30*24),end_date=stamp(days*24),bad_debt_at=stamp(24) if status=='bad_debt' else None,vehicles=[]) for id,status,days in [(1,'overdue',5),(2,'overdue',12),(3,'bad_debt',20),(4,'renting',-2),(5,'draft',-2),(6,'completed',2)]]

def mock(route):
    if mock_contract_type_read(route):return
    req=route.request; parsed=urlparse(req.url); path=parsed.path; query=parse_qs(parsed.query)
    requests.append(dict(path=path,query=query))
    if req.method not in ('GET','HEAD'):
        if path=='/api/auth/gps/refresh':route.fulfill(json=dict(status='success',data={}));return
        unexpected.append(req.method+' '+path);route.abort();return
    if path=='/api/auth/gps':
        if state['gps_fail']:route.fulfill(status=503,json=dict(status='error',message='QA GPS read unavailable'));return
        data=dict(devices=devices,events=[])
    elif path=='/api/auth/order/car-rental':
        assert query.get('status_counts')==['1'], query
        # Legacy array fixtures run through the same client projection used by fallback reads.
        data=contracts
    elif path in ('/api/auth/stores','/api/auth/store-directory'):data=[dict(id=1,store_name='CS QA',status='opening')]
    elif path=='/api/session':route.fulfill(json=dict(user=dict(name='QA')));return
    elif path.startswith('/api/auth/'):data=[]
    else:unexpected.append(req.method+' '+path);route.abort();return
    route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as pw:
    for engine,width in [('chromium',1440),('webkit',390)]:
        state['gps_fail']=False
        browser=getattr(pw,engine).launch()
        ctx=browser.new_context(viewport=dict(width=width,height=1000),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
        ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.session_cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')])
        ctx.add_init_script("""const qaFetch=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/auth/payment-events')return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return qaFetch.call(this,input,options);};""")
        ctx.route('**/api/**',mock)
        for domain in ['**protrack365.com/**','**gpscenter.xyz/**','**iopgps.com/**','**api.telegram.org/**']:
            ctx.route(domain,lambda route:(_ for _ in ()).throw(AssertionError('Real provider request blocked')))
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(a.url+'/gps',wait_until='networkidle',timeout=120000)
        summary=page.locator('.mg-gps-summary')
        long_stop=summary.get_by_role('button',name=re.compile('^Xe dừng trên 3 ngày'))
        expect(long_stop.locator('strong')).to_have_text('1')
        long_stop.click();expect(long_stop).to_have_attribute('aria-pressed','true')
        if width>767:
            records=page.locator('.mg-desktop-records tbody tr')
            expect(page.get_by_role('columnheader',name='Dừng liên tiếp',exact=True)).to_be_visible()
        else:records=page.locator('.mg-mobile-records .mg-reminder-card')
        expect(records).to_have_count(2)
        for record in records.all():expect(record).to_contain_text('QA-101');expect(record).to_contain_text('3 ngày')
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        page.screenshot(path=str(out/f'{engine}-gps-long-stops.png'),full_page=True)
        checks.append(f'{engine}: long-stop filter deduplicates vehicles, shows duration, excludes moving/offline/stale/unmapped and fits viewport')
        state['gps_fail']=True
        page.clock.install(time=datetime.now(timezone.utc));page.clock.fast_forward(11*60*1000)
        expect(long_stop.locator('strong')).to_have_text('0')
        expect(page.locator('.mg-field-error[role=alert]')).to_contain_text('QA GPS read unavailable')
        state['gps_fail']=False
        checks.append(f'{engine}: long-stop count expires when reads fail for over ten minutes, without a successful replacement response')
        for path in ['/contracts','/contracts/overdue','/contracts/ownership','/contracts/vat','/contracts/due','/contracts/drafts']:
            page.goto(a.url+path,wait_until='networkidle',timeout=120000)
            tabs=page.locator('.mg-status-tabs');expect(tabs.locator('button')).not_to_have_count(0)
            expect(tabs).to_have_attribute('aria-busy','false')
            for tab in tabs.locator('button').all():expect(tab.locator('span')).to_have_text(re.compile(r'^\d+$'))
            if path=='/contracts/overdue':
                expect(tabs.get_by_role('button',name=re.compile('^Quá hạn')).locator('span')).to_have_text('2')
                expect(tabs.get_by_role('button',name=re.compile('^Nợ xấu')).locator('span')).to_have_text('1')
                buckets=page.locator('.mg-overdue-buckets')
                expect(buckets.get_by_role('button',name=re.compile('^Trên 3 ngày')).locator('span')).to_have_text('2')
                expect(buckets.get_by_role('button',name=re.compile('^Trên 10 ngày')).locator('span')).to_have_text('1')
                buckets.get_by_role('button',name=re.compile('^Nợ xấu')).click()
                expect(tabs.get_by_role('button',name=re.compile('^Quá hạn')).locator('span')).to_have_text('2')
                expect(tabs.get_by_role('button',name=re.compile('^Nợ xấu')).locator('span')).to_have_text('1')
                expect(buckets.get_by_role('button',name=re.compile('^Trên 3 ngày')).locator('span')).to_have_text('2')
                page.screenshot(path=str(out/f'{engine}-overdue-counts.png'),full_page=True)
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),path
        checks.append(f'{engine}: every contract status/age tab has a count across all six lists; switching to bad debt preserves sibling counts')
        ctx.unroute_all(behavior='ignoreErrors');ctx.close();browser.close()
assert not errors,errors
assert not unexpected,unexpected
result=dict(passed=len(checks),checks=checks,javascriptErrors=errors,unexpectedRequests=unexpected,realBusinessWrites=0,realProviderRequests=0)
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
