"""Synthetic UI/print checks. Real cookies authenticate the page; all business APIs are intercepted."""
import argparse,json
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3102');p.add_argument('--cookies-dir',default='.backups/account-access/cookies');p.add_argument('--output',default='.backups/account-access/ui');p.add_argument('--browser',choices=['chromium','webkit'],default='chromium');a=p.parse_args()
out=Path(a.output)/a.browser;out.mkdir(parents=True,exist_ok=True)
fixture=Path('scripts/check-contract-layout-ui.py').read_text(encoding='utf-8')
namespace={};exec(fixture[fixture.index('customer = '):fixture.index('state = ')],namespace)
stores,staff,vehicles,contracts=[namespace[k] for k in ['stores','staff','vehicles','contracts']]
contracts[0].update(code='HD-QA-900',name='Hợp đồng QA',total_amount=500000,paid_amount=100000,vehicles_json=json.dumps(contracts[0]['vehicles'],ensure_ascii=False),staff_name='Đại diện QA 8',relatives=namespace['customer']['relatives'])
contracts[0]['relatives_json']=json.dumps(namespace['customer']['relatives'],ensure_ascii=False)
checks=[];errors=[];unexpected=[];writes=[];state={'amount':400000,'paid':100000,'demo':0,'events':[]}
qr=dict(id=900,code='HD-QA-900',configured=True,mode='test',amount=400000,total=500000,paid=100000,bank=dict(bank_code='VPB',account_number='000000001',account_name='QA ONLY'),memo='Thanh toán cho hợp đồng HD-QA-900',qr_url='https://vietqr.app/img?acc=000000001&bank=970432&amount=400000&des=QA',received_demo=0,event_version=0)

def mock(route):
    req=route.request;url=urlparse(req.url);path=url.path;query=parse_qs(url.query)
    if req.method!='GET':
        if path=='/api/auth/accounts':
            writes.append(req.post_data_json);route.fulfill(json=dict(status='success',data={}));return
        unexpected.append(req.method+' '+path);route.abort();return
    if path.endswith('/payment-qr'):
        data={**qr,'amount':state['amount'],'paid':state['paid'],'received_demo':state['demo'],'event_version':len(state['events'])}
    elif path=='/api/auth/payment-events':data=[e for e in state['events'] if int(e['id'])>int(query.get('after',['0'])[0])]
    elif path=='/api/auth/accounts':data=[]
    elif path=='/api/auth/stores':data=stores
    elif path in ['/api/auth/hr/staff','/api/auth/contract-staff']:data=staff
    elif path=='/api/auth/vehicle/vehicles':data=vehicles
    elif path=='/api/auth/customers':data=[namespace['customer']]
    elif path.startswith('/api/auth/record-photos/'):data=[]
    elif path.endswith('/history'):data=dict(versions=[],payments=[],items=[],changes=[])
    elif path=='/api/auth/contract-types':data=[]
    elif path=='/api/auth/order/car-rental':
        data=contracts
        if query.get('table')==['1']:data=dict(rows=contracts,total=1,scopeCount=1,tabCount=1,page=1,pages=1,statusCounts=[['renting',1]],statuses=['renting'],dueCount=0,summary=dict(contractCount=1,blacklistCount=0,totalAmount=500000,receivableAmount=400000,badDebtAmount=0))
    else:unexpected.append(path);route.abort();return
    route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as pw:
    browser=getattr(pw,a.browser).launch()
    context=browser.new_context(viewport=dict(width=1440,height=1000),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
    context.add_cookies([dict(name='himoto_management_session',value=(Path(a.cookies_dir)/'quantri.txt').read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')])
    context.route('**/api/auth/**',mock)
    # Network image rendering is isolated from the QR payload/URL unit tests.
    context.route('https://vietqr.app/**',lambda route:route.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="white"/><path d="M10 10h80v80H10zM150 10h80v80h-80zM10 150h80v80H10zM120 120h100v100H120z" fill="black"/><text x="105" y="105">QA</text></svg>'))
    page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(a.url+'/accounts',wait_until='domcontentloaded')
    page.get_by_role('button',name='Tạo tài khoản',exact=True).click()
    dialog=page.get_by_role('dialog');expect(dialog).to_be_visible()
    dialog.locator('#account-name').fill('QA user');dialog.locator('#account-login').fill('qa.ui')
    dialog.locator('#account-password').fill('qa-synthetic-password')
    dialog.locator('#account-role').select_option('branch_staff')
    expect(dialog.locator('#account-store')).to_be_visible()
    expect(dialog.get_by_text('Phạm vi toàn hệ thống',exact=True)).to_have_count(0)
    dialog.locator('#account-store').select_option('2')
    dialog.get_by_role('button',name='Lưu tài khoản',exact=True).click()
    expect(dialog).not_to_be_visible();assert len(writes)==1 and writes[0]['store_id']==2 and writes[0]['scope_all'] is False
    checks.append('Admin creates an account with explicit role and required single-branch scope (mock write only)')

    page.goto(a.url+'/contracts',wait_until='domcontentloaded')
    page.get_by_role('button',name='Thao tác HD-QA-900',exact=True).click()
    page.get_by_role('menuitem',name='Nhập phiếu chi',exact=True).click()
    dialog=page.get_by_role('dialog');expect(dialog.get_by_label('Số tiền QR',exact=True)).to_have_value('400000')
    expect(dialog.get_by_text(qr['memo'],exact=True)).to_be_visible()
    image=dialog.get_by_alt_text('Mã VietQR thanh toán hợp đồng HD-QA-900');expect(image).to_be_visible()
    dialog.get_by_label('Số tiền QR',exact=True).fill('100000')
    expect(image).to_have_attribute('src',__import__('re').compile('amount=100000'))
    dialog.get_by_label('Số tiền QR',exact=True).fill('900000')
    expect(dialog.get_by_text('Nhập số tiền lớn hơn 0 và không vượt phần còn phải thu.')).to_be_visible()
    dialog.get_by_label('Số tiền QR',exact=True).fill('100000')
    state['demo']=100000;state['events']=[dict(id=1,mode='test',status='simulated',amount=100000,code=qr['code'],message='QA demo')]
    expect(dialog.get_by_text(__import__('re').compile(r'SePay demo đã báo nhận 100\.000'))).to_be_visible(timeout=12000)
    assert state['amount']==400000
    page.screenshot(path=str(out/'qr-desktop.png'))
    checks.append('Contract shortcut pre-fills remaining total and memo; amount validation and polled demo receipt preserve actual debt')
    page.set_viewport_size(dict(width=375,height=812));page.screenshot(path=str(out/'qr-mobile.png'))
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    dialog.get_by_role('button',name='Đóng',exact=True).click();page.set_viewport_size(dict(width=1440,height=1000))
    page.get_by_role('button',name='Thao tác HD-QA-900',exact=True).click()
    page.get_by_role('menuitem',name='Điền và in hợp đồng',exact=True).click()
    page.get_by_role('button',name='Xem mẫu in',exact=True).click()
    expect(page.locator('.contract-payment-qr')).to_be_visible(timeout=20000)
    expect(page.locator('.contract-payment-qr')).to_contain_text(qr['memo'])
    page.locator('.contract-payment-qr').scroll_into_view_if_needed();page.screenshot(path=str(out/'print-qr.png'))
    if a.browser=='chromium':
        page.evaluate('window.__qaPrinted=false;window.print=()=>{window.__qaPrinted=true}')
        page.get_by_role('button',name='In hợp đồng',exact=True).click()
        page.wait_for_function('window.__qaPrinted===true')
        html=page.evaluate("""() => '<!doctype html><html lang="vi" class="himoto-printing"><head>'+Array.from(document.querySelectorAll('style,link[rel="stylesheet"]'),n=>n instanceof HTMLLinkElement?`<link rel="stylesheet" href="${n.href}">`:n.outerHTML).join('')+'</head><body>'+document.querySelector('.himoto-print-root').outerHTML+'</body></html>'""")
        pdfpage=context.new_page();pdfpage.set_content(html,wait_until='networkidle');pdfpage.pdf(path=str(out/'contract-qr.pdf'),prefer_css_page_size=True,print_background=True)
        import fitz
        with fitz.open(out/'contract-qr.pdf') as pdf:
            assert qr['memo'] in '\n'.join(p.get_text() for p in pdf)
            assert len(pdf)==2,('QR must not add a page',len(pdf))
            pdf[0].get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save(out/'contract-qr-pdf.png')
        pdfpage.close()
    checks.append('The issued contract print preview embeds its QR and transfer memo at the end')
    for login in ['nv.thuesohuu','ketoan','hcns']:
        scoped=browser.new_context(viewport=dict(width=375,height=812))
        scoped.add_cookies([dict(name='himoto_management_session',value=(Path(a.cookies_dir)/(login+'.txt')).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);scoped.route('**/api/auth/**',mock)
        tab=scoped.new_page();tab.goto(a.url+'/accounts',wait_until='domcontentloaded');expect(tab.get_by_role('heading',name='Không có quyền truy cập',exact=True)).to_be_visible()
        scoped.close()
    checks.append('Non-admin roles cannot open account management on desktop or mobile')
    assert not errors,errors;assert not unexpected,unexpected
    context.close();browser.close()
result=dict(passed=len(checks),checks=checks,consoleErrors=errors,unexpectedRequests=unexpected,mockedWrites=len(writes),realBusinessWrites=0)
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2))
