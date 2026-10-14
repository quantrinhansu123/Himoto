"""Cashbook pagination and destructive-action scope; every API is intercepted."""
import argparse
import asyncio
import csv
import io
import json
import unicodedata
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.async_api import async_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3101')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='.backups/cashbook-performance/ui')
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
records = [dict(id=base + i, type=kind, created_at=f'2026-10-02T{1+i%12:02}:00:00Z', user_id=7+i%2,
    user_name='Trần Hoài Linh', store_id=1+i%2, store_name=f'Cơ sở QA {1+i%2}', amount=(i+1)*100000,
    reason='Bảo dưỡng' if kind=='out' else 'Thanh toán hợp đồng', content=f'Nội dung QA {i}',
    order_id=42, contract_code='HD-QA-42', payment_method='Tiền mặt', account='Két QA')
    for base, kind in [(1000, 'in'), (2000, 'out')] for i in range(24)]

def normalize(value):
    return ''.join(c for c in unicodedata.normalize('NFD', str(value)) if not 0x300<=ord(c)<=0x36f).replace('đ','d').replace('Đ','D').lower().strip()

def filtered(query):
    result=[]
    for row in records:
        date=(datetime.fromisoformat(row['created_at'].replace('Z','+00:00'))+timedelta(hours=7)).date().isoformat()
        if query.get('store_id') and str(row['store_id'])!=query['store_id']: continue
        if query.get('actor') and f"id:{row['user_id']}"!=query['actor']: continue
        if query.get('from') and date<query['from']: continue
        if query.get('to') and date>query['to']: continue
        label='Phiếu chi' if row['type']=='out' else 'Phiếu thu'
        if query.get('search') and not any(normalize(query['search']) in normalize(row.get(key,'')) for key in ['id','user_name','reason','content','contract_code','payment_method','account','store_name']) and normalize(query['search']) not in normalize(label): continue
        result.append(row)
    return result

async def main():
    checks, errors, requests, mock_writes, unexpected = [], [], [], [], []
    delay, fail = [0], [False]
    async def api(route):
        endpoint=urlparse(route.request.url).path
        query={key: value[0] for key,value in parse_qs(urlparse(route.request.url).query).items()}
        requests.append((endpoint,query))
        if route.request.method!='GET':
            if endpoint=='/api/auth/bulk-delete/transactions':
                body=route.request.post_data_json
                mock_writes.append(body)
                await route.fulfill(json={'status':'success','data':{'ids':body['ids']}})
            else:
                unexpected.append(endpoint); await route.abort()
        elif endpoint=='/api/auth/cashbook/vouchers':
            if delay[0]: await asyncio.sleep(delay[0])
            if fail[0] and not query.get('mode'):
                fail[0]=False
                await route.fulfill(status=503,json={'status':'error','message':'Lỗi QA tải sổ quỹ'})
                return
            matches=filtered(query)
            if query.get('mode'):
                selected=[row for row in matches if not query.get('type') or (row['type']=='out')==(query['type']=='expense')]
                data=[dict(id=row['id'],amount=row['amount']) for row in selected] if query['mode']=='ids' else selected
            else:
                data={'total':len(records)}
                for kind in ['income','expense']:
                    rows=[row for row in matches if (row['type']=='out')==(kind=='expense')]
                    key=query.get(kind+'_sort','date'); key={'date':'created_at','actor_name':'user_name','time':'created_at'}.get(key,key)
                    rows.sort(key=lambda row:(row.get(key,''),row['id']),reverse=query.get(kind+'_direction','desc')=='desc')
                    size=int(query.get(kind+'_limit',5)); page=min(int(query.get(kind+'_page',1)),max(1,(len(rows)+size-1)//size))
                    data[kind]=dict(total=len(rows),amount=sum(row['amount'] for row in rows),page=page,pageSize=size,rows=rows[(page-1)*size:page*size])
                actors=sorted({row['user_id'] for row in records if not query.get('store_id') or str(row['store_id'])==query['store_id']})
                data['actors']=[[f'id:{actor}',f'Trần Hoài Linh · #{actor}'] for actor in actors]
            await route.fulfill(json={'status':'success','data':data})
        elif endpoint=='/api/auth/stores':
            await route.fulfill(json={'status':'success','data':[dict(id=i,store_name=f'Cơ sở QA {i}',status='opening') for i in [1,2]]})
        elif endpoint=='/api/auth/cashbook/accounts': await route.fulfill(json={'status':'success','data':[]})
        elif endpoint in ['/api/session','/api/auth/me']: await route.fulfill(json={'user':dict(id=143,name='QA')})
        else: unexpected.append(endpoint); await route.abort()
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True)
        context=await browser.new_context(viewport={'width':1440,'height':1000},timezone_id='Asia/Ho_Chi_Minh',accept_downloads=True)
        cookies=json.loads(Path(args.session_cookie_file).read_text(encoding='utf-8-sig'))
        for cookie in cookies: cookie['domain']=urlparse(args.url).hostname; cookie['secure']=args.url.startswith('https:')
        await context.add_cookies(cookies)
        await context.route('**/api/**',api)
        page=await context.new_page()
        page.on('pageerror',lambda error:errors.append(str(error)))
        await page.goto(args.url+'/cashbook')
        income,expense=page.locator('#cashbook-income'),page.locator('#cashbook-expense')
        for panel in [income,expense]:
            await expect(panel.locator('tbody .mg-code')).to_have_count(5)
            await expect(panel.locator('.mg-title-count')).to_have_text('24')
        assert all(endpoint!='/api/auth/transactions' and not query.get('mode') for endpoint,query in requests)
        initial_requests=sum(endpoint.endswith('/vouchers') for endpoint,_ in requests)
        assert initial_requests<=2,initial_requests
        checks.append('initial load requests two bounded pages, never downloads the full transaction endpoint, and displays full counts')
        original_expense=await expense.locator('tbody .mg-code').all_text_contents()
        first=await income.locator('tbody .mg-code').first.text_content()
        await income.locator('tbody').get_by_label('Chọn phiếu '+first,exact=True).check()
        await income.get_by_role('button',name='Trang sau phiếu thu',exact=True).click()
        await expect(income.locator('.mg-current-page')).to_have_text('2')
        await expect(income.locator('table')).to_have_attribute('aria-busy','false')
        second=await income.locator('tbody .mg-code').first.text_content()
        await income.locator('tbody').get_by_label('Chọn phiếu '+second,exact=True).check()
        assert await expense.locator('tbody .mg-code').all_text_contents()==original_expense
        await page.get_by_role('button',name='Xóa phiếu đã chọn (2)',exact=True).click()
        dialog=page.get_by_role('dialog')
        await expect(dialog).to_contain_text('2 phiếu thu')
        await dialog.get_by_role('button',name='Hủy',exact=True).click()
        await income.get_by_label('Số dòng mỗi trang phiếu thu',exact=True).select_option('10')
        await expect(income.locator('tbody .mg-code')).to_have_count(10)
        await income.get_by_role('button',name='Sắp xếp phiếu thu theo ID',exact=True).click()
        await expect(income.locator('tbody .mg-code').first).to_have_text('1000')
        checks.append('paging/size/sort are independent; selected rows and amounts persist across pages')
        await page.get_by_role('searchbox').fill('bao duong')
        await expect(expense.locator('.mg-title-count')).to_have_text('24')
        await expect(income.locator('.mg-title-count')).to_have_text('0')
        await page.locator('.mg-cashbook-filters').get_by_role('button',name='Xóa bộ lọc',exact=True).click()
        await expect(income.locator('.mg-title-count')).to_have_text('24')
        await page.locator('#cashbook-actor').select_option('id:7')
        await expect(income.locator('.mg-title-count')).to_have_text('12')
        await page.get_by_label('Cơ sở đang xem',exact=True).select_option('1')
        await expect(page.locator('#cashbook-actor')).to_have_value('')
        await expect(income.locator('table')).to_have_attribute('aria-busy','false')
        await page.locator('#cashbook-actor').select_option('id:7')
        await page.locator('#cashbook-start').fill('2026-10-02')
        await page.locator('#cashbook-end').fill('2026-10-02')
        await expect(income.locator('.mg-title-count')).to_have_text('12')
        await expect(expense.locator('.mg-title-count')).to_have_text('12')
        async with page.expect_download() as downloading:
            await page.get_by_role('button',name='Xuất CSV',exact=True).click()
        downloaded=await downloading.value
        csvpath=output/'export.csv'; await downloaded.save_as(csvpath)
        rows=list(csv.reader(io.StringIO(csvpath.read_text(encoding='utf-8-sig'))))
        assert len(rows)==25 and all(len(row)==12 for row in rows)
        checks.append('accent-free search, exact actor, branch and inclusive date filters work; CSV exports all 24 matching vouchers beyond the visible pages')
        await expense.get_by_role('button',name='Xóa hết (12)',exact=True).click()
        await expect(dialog).to_contain_text('12 phiếu chi')
        await expect(dialog.get_by_role('button',name='Xóa hết 12 phiếu chi',exact=True)).to_be_disabled()
        await dialog.locator('#cashbook-delete-all-confirm').fill('XOA')
        await expect(dialog.get_by_role('button',name='Xóa hết 12 phiếu chi',exact=True)).to_be_enabled()
        assert any(query.get('mode')=='ids' and query.get('type')=='expense' and query.get('store_id')=='1' and query.get('actor')=='id:7' for _,query in requests)
        await dialog.get_by_role('button',name='Hủy',exact=True).click()
        assert not mock_writes
        checks.append('delete-all resolves every matching ID, retains the full filter snapshot, requires typed confirmation, and cancel sends no writes')
        await page.locator('#cashbook-start').fill('2026-10-03')
        await expect(page.locator('#cashbook-date-error')).to_be_visible()
        await expect(page.get_by_role('button',name='Xuất CSV',exact=True)).to_be_disabled()
        await page.locator('.mg-cashbook-filters').get_by_role('button',name='Xóa bộ lọc',exact=True).click()
        await expect(income.locator('.mg-title-count')).to_have_text('24')
        delay[0]=0.6
        await page.get_by_role('button',name='Tải lại',exact=True).click()
        await expect(income.locator('table')).to_have_attribute('aria-busy','true')
        await expect(income.get_by_role('status').last).to_contain_text('Đang tải')
        await expect(income.locator('table')).to_have_attribute('aria-busy','false')
        delay[0]=0; fail[0]=True
        await page.get_by_role('button',name='Tải lại',exact=True).click()
        await expect(income.get_by_role('alert').last).to_contain_text('Lỗi QA')
        await income.get_by_role('button',name='Thử lại',exact=True).last.click()
        await expect(income.locator('.mg-title-count')).to_have_text('24')
        await expect(expense.locator('.mg-title-count')).to_have_text('24')
        checks.append('reversed dates prevent export; loading, failed requests and retry remain explicit')
        for width in [1440,375]:
            await page.set_viewport_size({'width':width,'height':1000 if width>600 else 812})
            assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            if width==375:
                await expect(income.locator('.mg-mobile-card-detail')).to_have_count(10)
                await expect(expense.locator('.mg-mobile-card-detail')).to_have_count(5)
            await page.screenshot(path=str(output/f'cashbook-{width}.png'),full_page=True)
        checks.append('desktop and mobile show only the requested records without page overflow')
        assert not unexpected,unexpected
        assert not errors,errors
        assert not mock_writes,mock_writes
        await browser.close()
    result=dict(passed=len(checks),checks=checks,jsErrors=errors,unexpectedRequests=unexpected,businessWrites=0)
    (output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))

asyncio.run(main())
