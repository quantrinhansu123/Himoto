"""Daily ledger, pagination and full XLSX export. All business APIs are mocked."""
import argparse,json,math,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3014');p.add_argument('--cookie-file',required=True);p.add_argument('--browser',choices=['chromium','webkit'],default='chromium');p.add_argument('--output',default='.backups/staff-sales-reconcile-20261025/ui');a=p.parse_args()
out=Path(a.output)/a.browser;out.mkdir(parents=True,exist_ok=True)
checks=[];errors=[];requests=[];export_queries=[];fail=[False];malformed=[False];writes=[]
methods=['cash','personal','company','mixed','unknown']
fixtures=[(170000,'renewal','personal'),(360000,'renewal','cash'),(360000,'renewal','cash'),(680000,'rental','personal'),(250000,'rental','personal'),(280000,'rental','company'),(540000,'rental','cash'),(400000,'rental','company'),(200000,'rental','personal'),(400000,'rental','company'),(200000,'rental','cash'),(200000,'rental','personal'),(400000,'rental','personal'),(1200000,'rental','personal'),(300000,'rental','personal'),(320000,'rental','personal'),(440000,'rental','company'),(200000,'rental','personal'),(400000,'rental','personal'),(500000,'rental','personal'),(160000,'rental','personal'),(600000,'rental','personal')]
fixtures += [(2000000,'deposit','personal')]*17+[(3000000,'deposit','company'),(2000000,'deposit_refund','personal')]
rows=[dict(id=str(1000+i),order_id=42+i%21,code=str(42+i%21).zfill(6),customer=f'KHÁCH ĐỐI CHIẾU {i+1:02}',store_id=23,store_name='CS Giáp Bát QA',at=f'2026-10-23T{3+i//60:02}:{i%60:02}:00.000Z',day='2026-10-23',category=category,method=method,type='out' if category=='deposit_refund' else 'in',amount=value,revenue=value if category in ['rental','renewal'] else 0,staff_name='NVKD QA',actor_name='Người ghi nhận QA',note=f'Phiếu kiểm thử {i+1}',vehicles=f'QA-{i+1:03}',start_at=None,end_at=None) for i,(value,category,method) in enumerate(fixtures)]
def ledger(q):
    data=rows
    if q.get('category'):data=[r for r in data if r['revenue']!=0] if q['category']=='revenue' else [r for r in data if r['category']==q['category']]
    if q.get('method'):data=[r for r in data if r['method']==q['method']]
    if q.get('search'):data=[r for r in data if q['search'].lower() in ' '.join(str(v) for v in r.values()).lower()]
    income=sum(r['amount'] for r in data if r['type']!='out');expense=sum(r['amount'] for r in data if r['type']=='out');total=len(data)
    grouped={k:dict(income=sum(r['amount'] for r in data if r['method']==k and r['type']!='out'),expense=sum(r['amount'] for r in data if r['method']==k and r['type']=='out'),revenue=sum(r['revenue'] for r in data if r['method']==k),count=sum(r['method']==k for r in data)) for k in methods}
    totals=dict(count=total,contracts=len(set(r['order_id'] for r in data)),income_count=sum(r['type']!='out' for r in data),expense_count=sum(r['type']=='out' for r in data),revenue_count=sum(r['revenue']!=0 for r in data),income=income,expense=expense,net=income-expense,revenue=sum(r['revenue'] for r in data),deposit=sum(r['amount'] for r in data if r['category']=='deposit'),deposit_refund=sum(r['amount'] for r in data if r['category']=='deposit_refund'),methods=grouped)
    size=int(q.get('size','20'));pages=max(1,math.ceil(total/size));page=min(int(q.get('page','1')),pages);all_rows=q.get('all')=='1'
    return dict(rows=data if all_rows else data[(page-1)*size:page*size],total=total,page=1 if all_rows else page,pages=1 if all_rows else pages,page_size=max(1,total) if all_rows else size,totals=totals,export_all=all_rows)
amounts=dict(rental=7670000,renewal=890000,late=0,early=0,revenue=8560000)
summary=dict(total=amounts,unassigned=dict(rental=0,renewal=0,late=0,early=0,revenue=0),unclassified_amount=0,unclassified_count=0,days=[dict(**amounts,key='2026-10-23',name='2026-10-23',events=22)],staff=[dict(**amounts,key='7',name='NVKD QA',events=22)])
def mock(route):
    req=route.request;path=urlparse(req.url).path;q={k:v[0] for k,v in parse_qs(urlparse(req.url).query).items()}
    if req.method!='GET':writes.append(path);route.fulfill(status=405,json=dict(status='error'));return
    if path=='/api/auth/rental-revenue/transactions':
        requests.append(q)
        if q.get('all')=='1':export_queries.append(q)
        if fail[0]:fail[0]=False;route.fulfill(status=503,json=dict(status='error',message='QA sổ tạm gián đoạn'));return
        data=ledger(q)
        if malformed[0]:malformed[0]=False;data['totals']['revenue']+=400000
    elif path=='/api/auth/rental-revenue':data=summary
    elif path=='/api/auth/staff-sales':data=dict(rows=[])
    elif path=='/api/auth/stores':data=[dict(id=23,store_name='CS Giáp Bát QA',status='opening')]
    elif path=='/api/session':route.fulfill(json=dict(user=dict(name='QA')));return
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))
def verify_xlsx(file,expected_count,expected_revenue):
    ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with zipfile.ZipFile(file) as z:
        strings=[''.join(n.itertext()) for n in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('x:si',ns)]
        xml=ET.fromstring(z.read('xl/worksheets/sheet1.xml'));sheet_rows=xml.findall('x:sheetData/x:row',ns)
        assert len(sheet_rows)==expected_count+5,(len(sheet_rows),expected_count)
        values={c.attrib['r']:strings[int(c.find('x:v',ns).text)] if c.attrib.get('t')=='s' else c.find('x:v',ns).text for row in sheet_rows for c in row.findall('x:c',ns) if c.find('x:v',ns) is not None}
        assert values['D5'].startswith('0000'),values['D5']
        assert values[f'M{expected_count+5}']==str(expected_revenue)
        assert sum(int(values.get(f'M{n}',0)) for n in range(5,expected_count+5))==expected_revenue
        assert xml.find('x:sheetViews/x:sheetView/x:pane',ns).attrib['ySplit']=='4'
with sync_playwright() as pw:
    browser=getattr(pw,a.browser).launch();ctx=browser.new_context(viewport=dict(width=1440 if a.browser=='chromium' else 390,height=1000),timezone_id='Asia/Ho_Chi_Minh',accept_downloads=True,reduced_motion='reduce')
    ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
    page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(a.url+'/staff-sales',wait_until='networkidle')
    panel=page.get_by_role('region',name='Doanh thu thuê xe thực thu',exact=True);book=page.get_by_role('region',name='Sổ giao dịch từng phiếu',exact=True)
    expect(book.locator('[data-ledger-revenue]')).to_have_text('8.560.000 đ');expect(book.get_by_role('heading',level=3)).to_contain_text('41 phiếu')
    expect(book.locator('tbody tr')).to_have_count(20);expect(book.locator('tfoot')).to_contain_text('Tổng 41 phiếu');expect(book.get_by_text('45.560.000 đ',exact=True)).to_be_visible()
    for key,amount in [('cash','1.460.000 đ'),('personal','5.580.000 đ'),('company','1.520.000 đ')]:expect(book.locator(f'[data-ledger-method="{key}"]')).to_have_text(amount)
    checks.append('Default ledger displays all approved income/expense types, 41-voucher count, 22 revenue allocations, deposit separation and payment methods matching 8.56m')
    book.get_by_role('button',name='Trang giao dịch sau',exact=True).click();expect(book.get_by_text('Trang 2/3',exact=True)).to_be_visible();expect(book.locator('tbody tr')).to_have_count(20);expect(book.locator('tfoot')).to_contain_text('Tổng 41 phiếu')
    book.get_by_role('button',name='Trang giao dịch sau',exact=True).click();expect(book.locator('tbody tr')).to_have_count(1);expect(book.get_by_role('button',name='Trang giao dịch sau',exact=True)).to_be_disabled();expect(book.locator('tbody')).to_contain_text('Hoàn cọc')
    checks.append('Pagination shows 20/20/1 rows, disabled boundaries and totals for every matching voucher rather than only the visible page')
    with page.expect_download() as event:book.get_by_role('button',name='Xuất sổ Excel',exact=True).click()
    xlsx=out/'all-41.xlsx';event.value.save_as(xlsx);verify_xlsx(xlsx,41,8560000);assert export_queries[-1]['all']=='1'
    checks.append('Export from page three fetches all 41 matching receipts; XLSX retains leading-zero contracts, frozen headings, per-row values and reconciled whole-report totals')
    book.get_by_label('Lọc nghiệp vụ giao dịch',exact=True).select_option('revenue');expect(book.get_by_role('heading',level=3)).to_contain_text('22 phiếu');expect(book.get_by_text('Trang 1/2',exact=True)).to_be_visible()
    book.get_by_label('Số phiếu mỗi trang',exact=True).select_option('50');expect(book.locator('tbody tr')).to_have_count(22)
    book.get_by_label('Lọc hình thức giao dịch',exact=True).select_option('cash');expect(book.locator('[data-ledger-revenue]')).to_have_text('1.460.000 đ');expect(book.locator('tbody tr')).to_have_count(4)
    book.get_by_label('Tìm giao dịch',exact=True).fill('QA-002');expect(book.locator('tbody tr')).to_have_count(1);expect(book.locator('tbody')).to_contain_text('360.000 đ');expect(book.locator('tbody a')).to_have_attribute('href','/contracts?contract_id=43')
    book.locator('tbody summary').click();expect(book.get_by_text('Người ghi nhận QA',exact=True)).to_be_visible();expect(book.get_by_text('Phiếu kiểm thử 2',exact=True)).to_be_visible()
    checks.append('Revenue/category/method/search filters reset pagination, narrow amounts and expose source receipt actor/note plus exact contract link')
    with page.expect_download() as event:book.get_by_role('button',name='Xuất sổ Excel',exact=True).click()
    xlsx=out/'one-matching.xlsx';event.value.save_as(xlsx);verify_xlsx(xlsx,1,360000);assert export_queries[-1]['category']=='revenue' and export_queries[-1]['method']=='cash' and export_queries[-1]['search']=='QA-002'
    book.get_by_label('Tìm giao dịch',exact=True).fill('NO-RESULT');expect(book.get_by_text('Không có giao dịch khớp bộ lọc trong kỳ.',exact=True)).to_be_visible();expect(book.get_by_role('button',name='Xuất sổ Excel',exact=True)).to_be_disabled()
    book.get_by_role('button',name='Xóa bộ lọc giao dịch',exact=True).click();expect(book.locator('tbody tr')).to_have_count(41)
    checks.append('Filtered XLSX includes only matching receipts; no-result filter shows zero and disables export; reset restores complete ledger')
    fail[0]=True;book.get_by_label('Lọc hình thức giao dịch',exact=True).select_option('cash');expect(book.get_by_role('alert')).to_contain_text('QA sổ tạm gián đoạn');expect(book.locator('[data-ledger-revenue]')).to_have_count(0)
    book.get_by_role('button',name='Thử tải lại sổ',exact=True).click();expect(book.locator('[data-ledger-revenue]')).to_have_text('1.460.000 đ')
    malformed[0]=True;book.get_by_label('Lọc hình thức giao dịch',exact=True).select_option('personal');expect(book.get_by_role('alert')).to_contain_text('tổng chi tiết chưa khớp');expect(book.locator('tbody tr')).to_have_count(0)
    book.get_by_role('button',name='Thử tải lại sổ',exact=True).click();expect(book.locator('[data-ledger-revenue]')).to_have_text('5.580.000 đ')
    checks.append('Network errors and mismatched API totals hide stale amounts/rows, prevent misleading reconciliation and recover on retry')
    page.get_by_role('button',name='Hôm qua',exact=True).click();expect(page.get_by_role('button',name='Hôm qua',exact=True)).to_have_attribute('aria-pressed','true');expect(book.locator('[data-ledger-revenue]')).to_have_text('8.560.000 đ');assert requests[-1]['from']==requests[-1]['to']
    page.get_by_label('Từ ngày doanh số',exact=True).fill('2026-10-23');page.get_by_label('Đến ngày doanh số',exact=True).fill('2026-10-23');page.get_by_label('Cơ sở đang xem',exact=True).select_option('23')
    expect(book.locator('[data-ledger-revenue]')).to_have_text('8.560.000 đ');assert requests[-1]['from']==requests[-1]['to']=='2026-10-23' and requests[-1]['store_id']=='23'
    page.screenshot(path=str(out/'ledger.png'),full_page=True)
    scroll=book.get_by_role('region',name='Bảng từng phiếu thu chi',exact=True);assert scroll.evaluate('(e)=>e.scrollWidth>e.clientWidth');scroll.evaluate('(e)=>e.scrollLeft=e.scrollWidth');assert scroll.evaluate('(e)=>e.scrollLeft>0')
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
    panel.get_by_role('button',name='Theo ngày',exact=True).click();expect(panel.get_by_role('rowheader',name='23/10/2026',exact=True)).to_be_visible()
    panel.get_by_role('button',name='Theo NVKD',exact=True).click();expect(panel.get_by_role('rowheader',name='NVKD QA',exact=True)).to_be_visible()
    checks.append('Yesterday/custom date/branch apply to ledger; desktop/mobile keep horizontal table scrolling inside viewport; day/staff summaries remain available')
    assert not errors,errors;assert not writes,writes;browser.close()
result=dict(passed=len(checks),browser=a.browser,checks=checks,realBusinessWrites=0,jsErrors=errors)
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
