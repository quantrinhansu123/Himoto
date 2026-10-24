"""Compact tables and the shared viewport scrollbar. All application/provider APIs are intercepted."""
import argparse, json, re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser()
p.add_argument('--url',default='http://127.0.0.1:3026')
p.add_argument('--session-cookie-file',required=True)
p.add_argument('--baseline-only',action='store_true')
p.add_argument('--browser',choices=['all','chromium','webkit'],default='all')
p.add_argument('--output',default='.backups/table-density-20261025/ui')
a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
expect.set_options(timeout=20000)
now=datetime.now(timezone.utc);stamp=lambda days:(now-timedelta(days=days)).isoformat()
stores=[dict(id=1,store_name='CS Nguyễn Hoàng',status='opening',store_revision='1',vehicle_count=25,staff_count=25)]
vehicles=[dict(id=101+i,name='HONDA WAVE ALPHA 110',license=f'QA-{101+i:05}',brand='Honda',type='xecon',color='Đỏ Nâu',year=2025,status='ready',store_id=1,current_store_id=1,store_name=stores[0]['store_name'],holder_name='Nguyễn Văn Khách Hàng Kiểm Thử',overdue_days=6,daily_price=170000,monthly_price=1800000,odometer=12345,vehicle_revision='1',gps_has_device=True,gps_normalized_status='stopped',gps_last_sync=stamp(0),gps_heartbeat_at=stamp(0),gps_position_at=stamp(7)) for i in range(25)]
customers=[dict(id=1+i,name='Nguyễn Văn Khách Hàng Kiểm Thử',phone='0900000001',id_card=f'{1+i:012}',address='Số 123 đường kiểm thử, phường kiểm thử, thành phố Hà Nội',status='active',store_id=1,store_name=stores[0]['store_name'],contract_count=5,customer_revision='1') for i in range(25)]
staff=[dict(id=1+i,full_name='Nguyễn Văn Nhân Sự Kiểm Thử',email='qa.staff.long@example.invalid',phone='0900000002',position='NVKD',status='active',store_id=1,store_name=stores[0]['store_name'],joined_at=stamp(60)) for i in range(25)]
contracts=[dict(id=1+i,contract_number=f'QA-HD-{1+i:04}',order_status='renting',order_type='daily',customer_id=1,customer_name=customers[0]['name'],customer_phone=customers[0]['phone'],store_id=1,store_name=stores[0]['store_name'],rent_at=stamp(2),return_at=stamp(-7),total_amount=1700000,paid_amount=100000,vehicles=vehicles[:1]) for i in range(25)]
errors,unexpected,checks,metrics=[],[],[],[]

def mock(route):
    if mock_contract_type_read(route):return
    req=route.request;path=urlparse(req.url).path
    if req.method not in ('GET','HEAD'):
        if path=='/api/auth/gps/refresh':route.fulfill(json=dict(status='success',data={}));return
        unexpected.append(req.method+' '+path);route.abort();return
    if path=='/api/session':route.fulfill(json=dict(user=dict(name='QA')));return
    data={'/api/auth/stores':stores,'/api/auth/store-directory':stores,'/api/auth/vehicle/vehicles':vehicles,'/api/auth/vehicles/inventory':vehicles,'/api/auth/customers':customers,'/api/auth/hr/staff':staff,'/api/auth/contract-staff':staff,'/api/auth/order/car-rental':contracts}.get(path,[])
    if path=='/api/auth/gps':data=dict(devices=[],events=[],selected_vehicles=[])
    route.fulfill(json=dict(status='success',data=data))

def visible_pane(page):return page.locator('.mg-table-scroll:visible').filter(has=page.locator('table')).first

def scroll_to_pane(page,pane):
    pane.evaluate("el=>window.scrollBy(0,el.getBoundingClientRect().top-180)")

def measure(pane):
    return pane.evaluate("""el=>({tableWidth:el.querySelector('table').getBoundingClientRect().width,paneWidth:el.clientWidth,rowHeight:el.querySelector('tbody tr').getBoundingClientRect().height,padding:getComputedStyle(el.querySelector('tbody td')).padding,font:getComputedStyle(el.querySelector('tbody td')).fontSize,typeWidth:el.querySelector('[data-column=type]')?.getBoundingClientRect().width})""")

def assert_sync(page,pane):
    dock=page.locator('.mg-table-scroll-dock')
    expect(dock).to_be_visible()
    expect(pane).to_have_attribute('id',re.compile('.+'))
    target=pane.get_attribute('id');expect(dock).to_have_attribute('aria-controls',target)
    assert dock.bounding_box()['y']+dock.bounding_box()['height']<=page.viewport_size['height']+1
    pane.evaluate('el=>el.scrollLeft=100')
    page.wait_for_function("id=>Math.abs(document.getElementById(id).scrollLeft-document.querySelector('.mg-table-scroll-dock').scrollLeft)<2",arg=target)
    dock.focus();dock.press('End')
    page.wait_for_function("id=>{const e=document.getElementById(id);return Math.abs(e.scrollLeft-(e.scrollWidth-e.clientWidth))<2}",arg=target)
    dock.press('Home')
    page.wait_for_function("id=>document.getElementById(id).scrollLeft<2",arg=target)
    dock.press('ArrowRight')
    page.wait_for_function("id=>{const e=document.getElementById(id);return e.scrollLeft>=Math.min(70,e.scrollWidth-e.clientWidth)-1}",arg=target)
    # Vertical scrolling keeps the same control reachable in the viewport.
    pane.evaluate('el=>el.scrollTop=80')
    expect(dock).to_be_visible()

with sync_playwright() as pw:
    for engine in (['chromium'] if a.baseline_only else ['chromium','webkit'] if a.browser=='all' else [a.browser]):
        browser=getattr(pw,engine).launch(ignore_default_args=['--hide-scrollbars'] if engine=='chromium' else None)
        ctx=browser.new_context(viewport=dict(width=1440,height=720),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
        ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.session_cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')])
        ctx.route('**/api/**',mock)
        ctx.add_init_script("""const qaFetch=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/auth/payment-events')return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return qaFetch.call(this,input,options);};""")
        for domain in ['**protrack365.com/**','**gpscenter.xyz/**','**iopgps.com/**','**api.telegram.org/**']:
            ctx.route(domain,lambda route:(_ for _ in ()).throw(AssertionError('Real provider request blocked')))
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        for path in (['/vehicles'] if a.baseline_only else ['/vehicles','/customers','/staff','/contracts','/stores']):
            page.goto(a.url+path,wait_until='networkidle',timeout=120000)
            pane=visible_pane(page);expect(pane.locator('table')).to_have_attribute('aria-busy','false');expect(pane.locator('tbody tr')).not_to_have_count(0)
            scroll_to_pane(page,pane)
            metric=dict(browser=engine,path=path,**measure(pane));metrics.append(metric)
            page.screenshot(path=str(out/f'{engine}-{path.strip("/")}-1440.png'))
            if a.baseline_only:continue
            assert metric['rowHeight']<100,metric
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),path
            page.set_viewport_size(dict(width=1024,height=720));scroll_to_pane(page,pane)
            overflowing=pane.evaluate('el=>el.scrollWidth>el.clientWidth+1')
            if overflowing:assert_sync(page,pane)
            else:expect(page.locator('.mg-table-scroll-dock')).to_have_count(0)
            if path=='/vehicles':
                # Drag the actual browser thumb, without replacing it with a custom slider.
                if engine=='chromium':
                    dock=page.locator('.mg-table-scroll-dock');dock.focus();dock.press('Home')
                    page.wait_for_function("id=>document.getElementById(id).scrollLeft<2",arg=pane.get_attribute('id'))
                    box=dock.bounding_box();page.mouse.move(box['x']+40,box['y']+box['height']-8);page.mouse.down();page.mouse.move(box['x']+180,box['y']+box['height']-8,steps=12);page.mouse.up()
                    page.wait_for_function("id=>document.getElementById(id).scrollLeft>0",arg=pane.get_attribute('id'))
                page.screenshot(path=str(out/f'{engine}-vehicles-scrollbar-1024.png'))
                page.get_by_role('button',name='Thu gọn thanh điều hướng',exact=True).click()
                if pane.evaluate('el=>el.scrollWidth>el.clientWidth+1'):assert_sync(page,pane)
                page.get_by_role('button',name='Mở rộng thanh điều hướng',exact=True).click()
                page.get_by_label('Ẩn hiện cột',exact=True).click()
                menu=page.locator('.mg-column-menu .mg-popover')
                while menu.locator('input:checked').count()>1:
                    menu.locator('input:checked:not(:disabled)').first.uncheck()
                page.wait_for_function("()=>{const e=document.querySelector('.mg-desktop-records.mg-table-scroll');return e.scrollWidth<=e.clientWidth+1}")
                expect(page.locator('.mg-table-scroll-dock')).to_have_count(0)
                while menu.locator('input:not(:checked)').count():menu.locator('input:not(:checked)').first.check()
                page.get_by_label('Ẩn hiện cột',exact=True).click();scroll_to_pane(page,pane);assert_sync(page,pane)
                page.screenshot(path=str(out/f'{engine}-vehicles-all-columns-1024.png'))
                # Touch layouts keep the existing record cards and bottom navigation.
                page.set_viewport_size(dict(width=390,height=844))
                expect(page.locator('.mg-mobile-records:visible')).to_be_visible()
                expect(page.locator('.mg-table-scroll-dock')).to_have_count(0)
                page.screenshot(path=str(out/f'{engine}-vehicles-mobile.png'))
                overflow=page.evaluate("""()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,wide:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left<-1)}).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width}))})""")
                assert overflow['document']<=overflow['viewport'],overflow
            checks.append(f'{engine} {path}: compact rows, viewport fit and bidirectional keyboard/native scrolling')
            print(json.dumps(dict(browser=engine,path=path,tableWidth=metric['tableWidth'],rowHeight=metric['rowHeight'])),flush=True)
            page.set_viewport_size(dict(width=1440,height=720))
        if not a.baseline_only:
            # Exercise the shared observer on independently scrolling, dynamically mounted tables.
            page.evaluate("""()=>{window.scrollTo(0,0);const root=document.createElement('div');root.id='qa-tables';root.style='position:fixed;left:280px;top:180px;width:600px;z-index:10;background:white';for(let i=0;i<2;i++){const pane=document.createElement('div');pane.className=i?'shift-table-scroll':'mg-table-scroll';pane.setAttribute('aria-label','QA table '+i);pane.tabIndex=0;pane.style='height:120px;min-height:0;overflow:auto;margin:10px 0';pane.innerHTML='<table style="width:1400px"><tbody><tr><td>QA table '+i+'</td></tr></tbody></table>';root.append(pane);}document.querySelector('.mg-content').append(root);}""")
            for i in [0,1]:
                pane=page.locator('#qa-tables > div').nth(i);pane.focus();assert_sync(page,pane)
            page.evaluate("""()=>{const d=document.createElement('dialog');d.id='qa-modal';d.className='mg-dialog';d.style='width:700px;padding:20px';d.innerHTML='<div class="mg-dialog-header">QA dialog</div><div class="mg-table-scroll" aria-label="QA modal table" style="height:240px;min-height:0"><table style="width:1400px"><tbody><tr><td>Modal table</td></tr></tbody></table></div><div class="mg-dialog-footer">Footer</div>';document.body.append(d);d.showModal();}""")
            pane=page.locator('#qa-modal .mg-table-scroll');assert_sync(page,pane)
            expect(page.locator('#qa-modal .mg-table-scroll-dock')).to_have_count(1)
            page.emulate_media(media='print');expect(page.locator('.mg-table-scroll-dock:visible')).to_have_count(0);page.emulate_media(media='screen')
            page.evaluate("document.getElementById('qa-modal').close();document.getElementById('qa-modal').remove();document.getElementById('qa-tables').remove()")
            page.wait_for_timeout(150)
            expect(page.locator('.mg-table-scroll-dock')).to_have_count(0)
            checks.append(f'{engine}: multiple tables, shift table, modal top layer, removal, print and mobile cards')
        ctx.unroute_all(behavior='ignoreErrors');ctx.close();browser.close()
assert not errors,errors
assert not unexpected,unexpected
result=dict(passed=len(checks),checks=checks,metrics=metrics,javascriptErrors=errors,unexpectedRequests=unexpected,realBusinessWrites=0,realProviderRequests=0)
(out/('baseline-metrics.json' if a.baseline_only else 'results.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
