"""Lazy contract tabs and interrupted forms. All browser APIs are fixtures; no writes."""
import argparse
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect, Error
from lib.contract_type_fixtures import mock_contract_type_read

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3021')
parser.add_argument('--cookies', default='.backups/lazy-contract-tabs-20261023')
parser.add_argument('--output', default='.backups/lazy-contract-tabs-20261023/ui')
parser.add_argument('--outage-url', help='Optional second local server with a deliberately unavailable test database')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
checks, errors, requests = [], [], []
state = {}
held = []
tabs = ['Tất cả', 'Đang thuê', 'Nháp', 'Quá hạn', 'Hoàn thành']
fixtures = [dict(id=100+i, code=f'QA-{status}', name=f'QA-{status}', status=status,
                 customer_name=f'Khách QA {status}', customer_phone='0900000000',
                 store_id=35, store_name='Cơ sở QA', store_kind='lease_to_own', rental_type='ownership',
                 start_date='2026-10-23T08:30', end_date='2026-11-23T17:45',
                 deposit_amount=2000000, total_amount=100000, paid_amount=0, draft_revision='1',
                 overdue_minutes=14400 if status=='overdue' else 0, monitoring_amount=100000,
                 license=f'QA-PLATE-{i}', vehicles_json='[]')
            for i, status in enumerate(['renting', 'draft', 'overdue', 'completed'])]


def envelope(query):
    status = query.get('status', '')
    source = [dict(fixtures[0],id=1000-i,code=f'QA-NEW-{i}' if i<5 else f'QA-VPS-{i}',
                   status='renting' if i<146 else 'completed' if i<237 else 'wait_payment') for i in range(239)] if state.get('history') else fixtures
    rows = [row for row in source if (not status or row['status']==status)
            and (not query.get('search') or query['search'].lower() in row['code'].lower())]
    total=len(rows)
    size=int(query.get('size',10))
    pages=max(1,(total+size-1)//size)
    page=min(int(query.get('page',1)),pages)
    rows=rows[(page-1)*size:page*size]
    return dict(status='success', data=dict(rows=rows, total=total, scopeCount=total, tabCount=total,
                                           page=page, pages=pages, statusCounts=[], statuses=sorted({row['status'] for row in rows}),
                                           dueCount=0, summary=None, recentDays=None))


def mock(route):
    req = route.request
    path = urlparse(req.url).path
    query = {key:values[0] for key,values in parse_qs(urlparse(req.url).query).items()}
    requests.append(dict(path=path, query=query, method=req.method))
    if mock_contract_type_read(route):
        return
    if req.method not in ('GET', 'HEAD'):
        # Keep every request on the test machine; provider/business writes never leave it.
        route.fulfill(status=503, json=dict(status='error', message='QA mutations blocked'))
        return
    if path=='/api/session':
        route.fulfill(status=503 if state.get('sessionFailure') else 200, json=dict(user=dict(id=143, name='QA')))
        return
    if path=='/api/auth/order/car-rental':
        status=query.get('status','')
        if state.get('holdAll') and not status:
            held.append((route, envelope(query)))
            return
        if state.get('failStatus')==status:
            route.fulfill(status=503, json=dict(status='error',message='QA Supabase temporarily unavailable'))
            return
        route.fulfill(json=envelope(query))
        return
    if path in ('/api/auth/stores','/api/auth/store-directory'):
        data=[dict(id=35,store_name='Cơ sở QA',kind='lease_to_own',status='opening')]
    elif path=='/api/auth/gps':
        data=dict(selected_vehicles=[], devices=[], events=[])
    else:
        data=[]
    route.fulfill(json=dict(status='success',data=data))


def list_reads():
    return [request for request in requests if request['path']=='/api/auth/order/car-rental' and request['query'].get('table')=='1']


def strip(page):
    return page.locator('.mg-page-contracts:visible .mg-status-tabs')


def assert_tabs(page):
    expect(strip(page)).to_be_visible()
    for label in tabs:
        expect(strip(page).get_by_role('button',name=label,exact=True)).to_be_visible()


with sync_playwright() as pw:
    for role, account, engine, width in [('operations',143,pw.chromium,1440),('ownership-staff',156,pw.webkit,390),('ownership-manager',157,pw.chromium,1440)]:
        state.clear(); requests.clear(); held.clear()
        browser=engine.launch()
        ctx=browser.new_context(viewport=dict(width=width,height=1000),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
        ctx.add_cookies([dict(name='himoto_management_session',value=Path(args.cookies,f'session-{account}.txt').read_text().strip(),url=args.url,httpOnly=True,sameSite='Strict')])
        ctx.route('**/api/**',mock)
        page=ctx.new_page()
        page.on('pageerror',lambda error:errors.append(str(error)))
        path='/contracts' if role=='operations' else '/contracts/ownership'
        page.goto(args.url+path,wait_until='domcontentloaded',timeout=120000)
        assert_tabs(page)
        expect(page.locator('.mg-page-contracts:visible .mg-table tbody')).to_contain_text('QA-renting',timeout=60000)
        page.wait_for_timeout(1800)
        assert len(list_reads())==1, list_reads()
        assert list_reads()[0]['query'].get('status','')==''
        for label,status in [('Đang thuê','renting'),('Nháp','draft'),('Quá hạn','overdue'),('Hoàn thành','completed')]:
            before=len(list_reads())
            strip(page).get_by_role('button',name=label,exact=True).click()
            expect(strip(page).get_by_role('button',name=label,exact=True)).to_have_attribute('aria-pressed','true')
            expect(page.locator('.mg-page-contracts:visible .mg-table tbody')).to_contain_text(f'QA-{status}')
            assert len(list_reads())==before+1, list_reads()
            assert list_reads()[-1]['query']['status']==status
            assert f'status={status}' in page.url
            assert_tabs(page)
        before=len(list_reads())
        strip(page).get_by_role('button',name='Tất cả',exact=True).click()
        expect(page.locator('.mg-page-contracts:visible .mg-table tbody')).to_contain_text('QA-renting')
        page.wait_for_timeout(350)
        assert len(list_reads())==before, 'An already loaded tab should reuse its own cached page'
        checks.append(f'{role}: one initial list request, one per newly selected tab, all five remain visible, returning to a loaded tab uses its cache')
        strip(page).get_by_role('button',name='Hoàn thành',exact=True).click()
        page.reload(wait_until='domcontentloaded')
        expect(strip(page).get_by_role('button',name='Hoàn thành',exact=True)).to_have_attribute('aria-pressed','true')
        expect(page.locator('.mg-page-contracts:visible .mg-table tbody')).to_contain_text('QA-completed')
        checks.append(f'{role}: the chosen tab survives a browser reload')
        if role!='operations':
            if width<768:
                card=page.locator('.mg-mobile-monitoring-card').first
                expect(card).to_contain_text('Bắt đầu')
                expect(card).to_contain_text('Dự kiến trả')
                expect(card).to_contain_text('23/10/2026 08:30')
                expect(card).to_contain_text('23/11/2026 17:45')
            else:
                expect(page.get_by_role('columnheader',name='Thời gian thuê',exact=True)).to_be_visible()
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
            page.locator('.mg-page-contracts:visible').screenshot(path=str(out/f'{role}-dates.png'))
            checks.append(f'{role}: rental start and expected return are visible with the correct Vietnam-local dates')
        state['history']=True
        page.close();page=ctx.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
        before=len(list_reads())
        page.goto(args.url+'/contracts/ownership',wait_until='domcontentloaded')
        area=page.locator('.mg-page-contracts:visible')
        expect(area.locator('.mg-result-range')).to_contain_text('239',timeout=30000)
        expect(area.locator('.mg-page-total')).to_have_text('/ 24')
        assert len(list_reads())==before+1
        area.get_by_role('button',name='Trang cuối',exact=True).click()
        expect(area.locator('.mg-table tbody')).to_contain_text('QA-VPS-238')
        expect(area.locator('.mg-result-range')).to_contain_text('231–239')
        expect(area.locator('.mg-current-page')).to_have_text('24')
        assert list_reads()[-1]['query']['page']=='24'
        page.screenshot(path=str(out/f'{role}-history-last-page.png'))
        area.get_by_placeholder('Tìm mã hợp đồng, khách hàng hoặc biển số…',exact=True).fill('QA-VPS-238')
        expect(area.locator('.mg-page-total')).to_have_text('/ 1')
        expect(area.locator('.mg-table tbody')).to_contain_text('QA-VPS-238')
        expect(area.locator('.mg-result-range')).to_contain_text('1–1')
        assert list_reads()[-1]['query']['search']=='QA-VPS-238'
        assert list_reads()[-1]['query']['page']=='1'
        area.get_by_role('button',name='Xóa từ khóa',exact=True).click()
        expect(area.locator('.mg-page-total')).to_have_text('/ 24')
        strip(page).get_by_role('button',name='Đang thuê',exact=True).click()
        expect(area.locator('.mg-result-range')).to_contain_text('146')
        expect(area.locator('.mg-page-total')).to_have_text('/ 15')
        area.get_by_role('button',name='Trang cuối',exact=True).click()
        expect(area.locator('.mg-table tbody')).to_contain_text('QA-VPS-145')
        expect(area.locator('.mg-result-range')).to_contain_text('141–146')
        assert list_reads()[-1]['query']['page']=='15'
        checks.append(f'{role}: exact totals expose all 24 history pages and 15 active pages; last-page navigation and global search both reach imported contracts')
        state.pop('history')
        if role=='operations':
            page.close(); page=ctx.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
            state['holdAll']=True
            with page.expect_request(lambda req: urlparse(req.url).path=='/api/auth/order/car-rental'):
                page.goto(args.url+'/contracts',wait_until='domcontentloaded')
            page.wait_for_function("document.querySelector('.mg-status-tabs')!==null")
            strip(page).get_by_role('button',name='Hoàn thành',exact=True).click()
            try:
                expect(page.locator('.mg-page-contracts:visible .mg-table tbody')).to_contain_text('QA-completed',timeout=15000)
            except AssertionError:
                print(json.dumps(dict(raceRequests=list_reads(),url=page.url,active=strip(page).locator('[aria-pressed="true"]').all_text_contents()),ensure_ascii=False))
                page.screenshot(path=str(out/'race-failed.png'))
                raise
            state['holdAll']=False
            for route,body in held:
                try:route.fulfill(json=body)
                except Error:pass  # The obsolete request is expected to have been aborted.
            held.clear();page.wait_for_timeout(250)
            expect(strip(page).get_by_role('button',name='Hoàn thành',exact=True)).to_have_attribute('aria-pressed','true')
            expect(page.locator('.mg-page-contracts:visible .mg-table tbody')).not_to_contain_text('QA-renting')
            checks.append('A delayed first-tab response cannot replace the rows or selection of the newly opened completed tab')
            state['failStatus']='draft'
            strip(page).get_by_role('button',name='Nháp',exact=True).click()
            expect(page.get_by_text('Không tải được dữ liệu',exact=True).filter(visible=True)).to_be_visible()
            assert_tabs(page)
            expect(strip(page).get_by_role('button',name='Nháp',exact=True)).to_have_attribute('aria-pressed','true')
            state.pop('failStatus')
            page.get_by_role('button',name='Thử lại',exact=True).filter(visible=True).click()
            expect(page.locator('.mg-page-contracts:visible .mg-table tbody')).to_contain_text('QA-draft')
            checks.append('A 503 on a new tab leaves that tab selected and all filters available; retry recovers that same tab')
            page.close();page=ctx.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
            page.clock.install()
            page.goto(args.url+'/contracts/ownership?action=new',wait_until='domcontentloaded')
            dialog=page.get_by_role('dialog',name='Nhập hợp đồng',exact=True)
            expect(dialog).to_be_visible(timeout=90000)
            dialog.get_by_role('tab',name='Ký kết & ghi chú',exact=True).click()
            note=dialog.get_by_label('Ghi chú hợp đồng',exact=True)
            text='QA: Đã nhập gần xong, chuyển sang Telegram rồi quay lại. '*8
            note.fill(text)
            state['sessionFailure']=True
            before=len([request for request in requests if request['path']=='/api/session'])
            page.evaluate("() => {for(let i=0;i<10;i++){window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));}}")
            page.wait_for_timeout(300)
            after=len([request for request in requests if request['path']=='/api/session'])
            assert after-before<=1, 'Returning from another app must not flood the session endpoint'
            expect(note).to_have_value(text)
            state['failStatus']=''
            page.clock.fast_forward(61000)
            expect(page.get_by_text('Chưa làm mới được danh sách.',exact=False)).to_be_visible(timeout=30000)
            expect(dialog).to_be_visible()
            expect(note).to_have_value(text)
            assert '/login' not in page.url
            dialog.screenshot(path=str(out/'interrupted-form-preserved.png'))
            checks.append('An almost-complete form survives repeated app-focus events, a 503 session check and a failed background list refresh without logging out or clearing input')
            dialog.get_by_role('button',name='Đóng',exact=True).click()
            expect(page.get_by_role('columnheader',name='Thời gian thuê',exact=True)).to_be_visible()
            checks.append('Operations management sees both rental dates on the ownership list, including after a failed background refresh')
        ctx.close();browser.close()

    if args.outage_url:
        browser=pw.chromium.launch()
        ctx=browser.new_context()
        ctx.add_cookies([dict(name='himoto_management_session',value=Path(args.cookies,'session-143.txt').read_text().strip(),url=args.outage_url,httpOnly=True,sameSite='Strict')])
        page=ctx.new_page()
        page.goto(args.outage_url+'/contracts/ownership',wait_until='domcontentloaded',timeout=60000)
        expect(page.get_by_role('heading',name='Kết nối dữ liệu đang gián đoạn',exact=True)).to_be_visible()
        assert '/login' not in page.url
        expect(page.get_by_role('button',name='Thử lại',exact=True)).to_be_visible()
        checks.append('A real server-side DB connection failure shows a retry page at the same URL, rather than treating a signed session as logged out')
        ctx.clear_cookies()
        page.goto(args.outage_url+'/contracts/ownership',wait_until='domcontentloaded')
        expect(page).to_have_url(args.outage_url+'/login')
        checks.append('An unsigned/anonymous request remains blocked even while the database is unavailable')
        ctx.close();browser.close()

assert not errors, errors
report=dict(passed=len(checks),checks=checks,errors=errors,realBusinessWrites=0,realTelegramMessages=0)
(out/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
