"""Read-only browser timings. Saves aggregate timings/sizes, never business response bodies."""
import argparse
import json
import time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='https://himoto.vercel.app')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--routes', default='/operations,/vehicles,/customers,/contracts,/contracts/drafts,/contracts/overdue,/contracts/vat,/contracts/ownership,/contracts/due,/contracts/battery,/contracts/types,/cashbook,/staff,/duty-roster,/stores,/staff-sales')
parser.add_argument('--mobile', action='store_true')
parser.add_argument('--runs', type=int, default=1)
args = parser.parse_args()
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
results = []

observer = """(() => {
window.__qa={lcp:0,longTasks:[],rows:0};
new MutationObserver(()=>{if(!window.__qa.rows&&document.querySelector('table tbody td[data-column],.mg-mobile-card-list>li'))window.__qa.rows=performance.now();}).observe(document,{childList:true,subtree:true});
new PerformanceObserver(list=>{for(const e of list.getEntries())window.__qa.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
new PerformanceObserver(list=>{for(const e of list.getEntries())window.__qa.longTasks.push({at:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});
})()"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    for path in args.routes.split(','):
        for run in range(args.runs):
            context = browser.new_context(viewport=dict(width=390 if args.mobile else 1440, height=844 if args.mobile else 1000),
                                          timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
            context.add_cookies([dict(name='himoto_management_session', value=Path(args.session_cookie_file).read_text().strip(),
                                     url=args.url, httpOnly=True, secure=args.url.startswith('https'), sameSite='Strict')])
            context.add_init_script(observer)
            # A page may start GPS/integration refresh automatically. Measuring
            # load must never trigger business writes or provider synchronisation.
            context.route('**/api/**', lambda route: route.continue_() if route.request.method in ['GET', 'HEAD'] else route.abort())
            page = context.new_page()
            page.set_default_timeout(45000)
            errors, failed, methods = [], [], []
            page.on('pageerror', lambda error: errors.append(str(error)[:300]))
            page.on('response', lambda response: failed.append(dict(path=urlparse(response.url).path, status=response.status)) if response.status >= 400 else None)
            page.on('request', lambda request: methods.append(request.method) if request.method not in ['GET', 'HEAD'] else None)
            started = time.monotonic()
            problem = None
            try:
                response = page.goto(args.url + path, wait_until='domcontentloaded', timeout=45000)
                page.locator('#management-main').wait_for(state='visible')
                # Hydrated screens have begun their ordinary API reads before this poll settles.
                page.wait_for_function("""() => performance.getEntriesByType('resource').some(e=>e.name.includes('/api/auth/')) &&
                  !document.querySelector('table[aria-busy="true"],.mg-table-state[role="status"],.mg-table-skeleton')""", timeout=45000)
                page.wait_for_load_state('networkidle', timeout=45000)
                page.evaluate('() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
            except Exception as error:
                problem = str(error).split('\n')[0][:300]
            elapsed = round((time.monotonic() - started) * 1000)
            timing = page.evaluate("""() => {
                const n=performance.getEntriesByType('navigation')[0],q=window.__qa||{longTasks:[]};
                const resources=performance.getEntriesByType('resource').map(e=>({path:new URL(e.name).pathname,
                    start:Math.round(e.startTime),duration:Math.round(e.duration),ttfb:Math.round(e.responseStart-e.requestStart),
                    transfer:e.transferSize,encoded:e.encodedBodySize,decoded:e.decodedBodySize}));
                return {ttfb:Math.round(n.responseStart-n.requestStart),domContentLoaded:Math.round(n.domContentLoadedEventEnd),
                    fcp:Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime||0),lcp:Math.round(q.lcp||0),firstRowsMs:Math.round(q.rows||0),
                    blockingMs:Math.round(q.longTasks.reduce((sum,e)=>sum+Math.max(e.duration-50,0),0)),longTasks:q.longTasks.length,
                    resources,buildId:document.querySelector('script#__NEXT_DATA__')?.textContent?JSON.parse(document.querySelector('script#__NEXT_DATA__').textContent).buildId:null};
            }""")
            resources = timing.pop('resources')
            api = [r for r in resources if r['path'].startswith('/api/')]
            scripts = [r for r in resources if r['path'].endswith('.js')]
            result = dict(path=path, run=run+1, viewport='mobile' if args.mobile else 'desktop', status=response.status if response else None,
                          settledMs=elapsed, **timing, api=api, resourceCount=len(resources),scriptRequests=len(scripts),
                          scriptBytes=sum(r['encoded'] for r in scripts),apiBytes=sum(r['decoded'] for r in api),
                          totalTransfer=sum(r['transfer'] for r in resources),failed=failed,errors=errors,nonReadRequests=methods,problem=problem)
            results.append(result)
            output.write_text(json.dumps(dict(baseUrl=args.url,results=results),ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps({k:result[k] for k in ['path','settledMs','ttfb','fcp','blockingMs','scriptBytes','apiBytes','problem']},ensure_ascii=False),flush=True)
            context.close()
    browser.close()
