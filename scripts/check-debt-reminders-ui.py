"""Synthetic reminder/branch QR checks. Every business API and outbound image is intercepted."""
import argparse,json
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3102');p.add_argument('--cookies-dir',default='.backups/zalo-qr-qa/cookies');p.add_argument('--output',default='.backups/zalo-qr-qa/ui');p.add_argument('--browser',choices=['chromium','webkit'],default='chromium');a=p.parse_args()
out=Path(a.output)/a.browser;out.mkdir(parents=True,exist_ok=True)
fixture=Path('scripts/check-contract-layout-ui.py').read_text(encoding='utf-8');ns={};exec(fixture[fixture.index('customer = '):fixture.index('state = ')],ns)
stores,staff,vehicles,contracts=[ns[k] for k in ['stores','staff','vehicles','contracts']]
contracts[0].update(code='HD-QA-900',name='Hợp đồng QA',total_amount=500000,paid_amount=100000,vehicles_json=json.dumps(contracts[0]['vehicles'],ensure_ascii=False),store_name='Cửa hàng QA 2')
banks=[dict(id=1,bank_code='VPB',account_number='000000001',account_name='BRANCH A QA',owner_type='unknown'),dict(id=2,bank_code='VCB',account_number='000000002',account_name='COMPANY A QA',owner_type='company')]
ctx=dict(id=900,code='HD-QA-900',store_id=2,store_name='Cửa hàng QA 2',customer_name=ns['customer']['name'],phone='0900000077',revision='300',amount=400000,due_at='2026-10-09T09:00:00+07:00',bank=banks[0],message='HIMOTO - Nhắc hợp đồng HD-QA-900\n400.000 đ\nSố tài khoản: 000000001')
checks=[];errors=[];unexpected=[];writes=[];state=dict(status='accepted',history=[])
def mock(route):
    req=route.request;url=urlparse(req.url);path=url.path;query=parse_qs(url.query)
    if req.method!='GET':
        if path=='/api/auth/debt-reminders' and req.method=='POST':
            body=req.post_data_json;writes.append(body);state['history'].insert(0,dict(**body,contract_code=ctx['code'],store_id=2,store_name=ctx['store_name'],customer_name=ctx['customer_name'],status=state['status'],created_at='2026-10-17T09:00:00+07:00',actor_name='Người gửi QA'))
            route.fulfill(json=dict(status='success',data=dict(request_id=body['request_id'],status=state['status'],replayed=False)));return
        unexpected.append(req.method+' '+path);route.abort();return
    if path.endswith('/debt-reminder'):data=ctx
    elif path=='/api/auth/debt-reminders':data=dict(rows=state['history'],total=len(state['history']),page=1,pages=1)
    elif path.endswith('/payment-qr'):
        bank=next(b for b in banks if b['id']==int(query.get('account_id',['1'])[0]));data=dict(id=900,code=ctx['code'],configured=True,mode='test',amount=400000,total=500000,paid=100000,bank=bank,accounts=banks,bank_id=bank['id'],memo='Thanh toán cho hợp đồng HD-QA-900',qr_url=f"https://vietqr.app/img?acc={bank['account_number']}&bank=970432&amount=400000",received_demo=0,event_version=0)
    elif path=='/api/auth/stores':data=stores
    elif path in ['/api/auth/hr/staff','/api/auth/contract-staff']:data=staff
    elif path=='/api/auth/vehicle/vehicles':data=vehicles
    elif path=='/api/auth/customers':data=[ns['customer']]
    elif path.startswith('/api/auth/record-photos/'):data=[]
    elif path.endswith('/history'):data=dict(versions=[],payments=[],items=[],changes=[],cashflow=[])
    elif path in ['/api/auth/contract-types','/api/auth/payment-events']:data=[]
    elif path=='/api/auth/order/car-rental':
        data=contracts
        if query.get('table')==['1']:data=dict(rows=contracts,total=1,scopeCount=1,tabCount=1,page=1,pages=1,statusCounts=[['renting',1]],statuses=['renting'],dueCount=0,summary=dict(contractCount=1,blacklistCount=0,totalAmount=500000,receivableAmount=400000,badDebtAmount=0))
    else:unexpected.append(path);route.abort();return
    route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as pw:
    browser=getattr(pw,a.browser).launch();context=browser.new_context(viewport=dict(width=1440,height=1000),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
    context.add_cookies([dict(name='himoto_management_session',value=(Path(a.cookies_dir)/'quantri.txt').read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);context.route('**/api/auth/**',mock)
    context.route('https://vietqr.app/**',lambda route:route.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><path d="M10 10h80v80H10zM150 10h80v80h-80zM10 150h80v80H10zM120 120h100v100H120z"/></svg>'))
    page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(a.url+'/debt-reminders',wait_until='domcontentloaded');expect(page.get_by_role('heading',name='Gửi nhắc nợ',exact=True)).to_be_visible()
    page.get_by_role('button',name='Tạo mới',exact=True).click();dialog=page.get_by_role('dialog');dialog.get_by_role('button',name=__import__('re').compile('HD-QA-900')).click()
    expect(dialog.get_by_label('Số điện thoại Zalo')).to_have_value('0900000077');expect(dialog.get_by_label('Số điện thoại Zalo')).to_have_attribute('readonly','')
    expect(dialog.get_by_role('textbox',name='Nội dung',exact=True)).to_have_value(ctx['message']);dialog.get_by_role('textbox',name='Nội dung',exact=True).fill(ctx['message']+'\nNội dung chỉnh sửa QA')
    page.screenshot(path=str(out/'reminder-desktop.png'));dialog.get_by_role('button',name='Gửi Zalo',exact=True).click()
    expect(dialog.get_by_text('Webhook đã tiếp nhận',exact=True)).to_be_visible();assert len(writes)==1 and writes[0]['phone']==ctx['phone'] and 'Nội dung chỉnh sửa QA' in writes[0]['message']
    expect(dialog.get_by_text(__import__('re').compile('chưa xác nhận khách đã nhận'))).to_be_visible();dialog.get_by_role('button',name='Đóng',exact=True).click()
    expect(page.get_by_role('region',name='Lịch sử gửi nhắc nợ').get_by_text('Webhook đã tiếp nhận',exact=True)).to_be_visible();checks.append('Create flow picks a contract, fills its phone and debt, submits edited text, and records accepted status without claiming delivery')
    page.goto(a.url+'/contracts',wait_until='domcontentloaded');page.get_by_role('button',name='Thao tác HD-QA-900',exact=True).click();page.get_by_role('menuitem',name='Nhắc nợ',exact=True).click();dialog=page.get_by_role('dialog');expect(dialog.get_by_label('Số điện thoại Zalo')).to_have_value(ctx['phone'])
    state['status']='failed';dialog.get_by_role('button',name='Gửi Zalo',exact=True).click();expect(dialog.get_by_text('Gửi thất bại',exact=True)).to_be_visible();dialog.get_by_role('button',name='Đóng',exact=True).click()
    page.get_by_role('button',name='Thao tác HD-QA-900',exact=True).click();page.get_by_role('menuitem',name='Xem chi tiết',exact=True).click();dialog=page.get_by_role('dialog');dialog.get_by_role('button',name='Nhắc nợ',exact=True).click();dialog=page.get_by_role('dialog');expect(dialog.get_by_label('Số điện thoại Zalo')).to_have_value(ctx['phone'])
    state['status']='unknown';dialog.get_by_role('button',name='Gửi Zalo',exact=True).click();expect(dialog.get_by_text('Chưa xác định kết quả',exact=True)).to_be_visible();dialog.get_by_role('button',name='Đóng',exact=True).click()
    checks.append('Both contract row and detail buttons open the same bound form; failure and uncertain provider results are shown accurately')
    page.get_by_role('button',name='Thao tác HD-QA-900',exact=True).click();page.get_by_role('menuitem',name='Nhập phiếu chi',exact=True).click();dialog=page.get_by_role('dialog')
    expect(dialog.get_by_label('Tài khoản nhận của cơ sở hợp đồng')).to_have_value('1');dialog.get_by_label('Tài khoản nhận của cơ sở hợp đồng').select_option('2')
    expect(dialog.get_by_label('Tài khoản nhận của cơ sở hợp đồng')).to_have_value('2');expect(dialog.get_by_alt_text('Mã VietQR thanh toán hợp đồng HD-QA-900')).to_have_attribute('src',__import__('re').compile('acc=000000002'))
    page.set_viewport_size(dict(width=375,height=812));page.screenshot(path=str(out/'branch-qr-mobile.png'));assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');dialog.get_by_role('button',name='Đóng',exact=True).click()
    page.get_by_role('button',name='Thao tác HD-QA-900',exact=True).click();page.get_by_role('menuitem',name='Nhắc nợ',exact=True).click();dialog=page.get_by_role('dialog');expect(dialog.get_by_role('textbox',name='Nội dung',exact=True)).to_be_visible();page.screenshot(path=str(out/'reminder-mobile.png'));assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.set_viewport_size(dict(width=812,height=375));expect(dialog.get_by_role('button',name='Gửi Zalo',exact=True)).to_be_visible();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');dialog.get_by_role('button',name='Đóng',exact=True).click()
    checks.append('QR switches among the owning branch accounts; reminder and QR dialogs fit phone portrait/landscape without horizontal overflow')
    for login,allowed in [('nv.giapbat',True),('ketoan',True),('hcns',False)]:
        scoped=browser.new_context(viewport=dict(width=375,height=812));scoped.add_cookies([dict(name='himoto_management_session',value=(Path(a.cookies_dir)/(login+'.txt')).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);scoped.route('**/api/auth/**',mock)
        tab=scoped.new_page();tab.goto(a.url+'/debt-reminders',wait_until='domcontentloaded')
        expect(tab.get_by_role('button',name='Tạo mới',exact=True)).to_be_visible() if allowed else expect(tab.get_by_role('heading',name='Không có quyền truy cập',exact=True)).to_be_visible();scoped.close()
    checks.append('Branch staff and accounting can open the reminder creation flow; HR cannot access it')
    assert not errors,errors;assert not unexpected,unexpected;context.close();browser.close()
result=dict(passed=len(checks),checks=checks,consoleErrors=errors,unexpectedRequests=unexpected,mockedWrites=len(writes),realZaloRequests=0,realBusinessWrites=0)
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2))
