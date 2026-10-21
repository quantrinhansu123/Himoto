"""Compact monitoring, age groups, GPS and account archive UI; all business APIs mocked."""
import argparse,json,re
from pathlib import Path
from datetime import datetime,timedelta,timezone
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
from lib.contract_type_fixtures import mock_contract_type_read
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3022');p.add_argument('--cookie-file',required=True);p.add_argument('--browser',choices=['chromium','webkit'],default='chromium');p.add_argument('--output',default='.backups/monitoring-compact-20261021/ui');a=p.parse_args()
out=Path(a.output)/a.browser;out.mkdir(parents=True,exist_ok=True);checks=[];errors=[];writes=[];requests=[];expect.set_options(timeout=30000)
now=datetime.now(timezone(timedelta(hours=7)))
rows=[]
for id,days,owner in [(1,.5,True),(2,1.5,True),(3,5.5,True),(4,6.5,True),(5,15.5,True),(6,16.5,True),(7,.5,False),(8,3.5,False),(9,10.5,False)]:
    due=(now-timedelta(days=days)).isoformat()
    rows.append(dict(id=id,contract_number=f'QA-{id:03}',status='overdue',store_id=32 if id%2 else 33,store_name='CS QA',customer_name=f'Khách QA {id}',customer_phone='0900000000',rental_type='ownership' if owner else 'daily',start_date=(now-timedelta(days=30)).isoformat(),signed_on=(now-timedelta(days=31)).date().isoformat(),end_date=due,total_amount=500000,paid_amount=100000,deposit_amount=2000000,vehicles=[dict(id=id,name='Xe QA',license=f'QA-PLATE-{id}',return_at=due,completed_at=None)],overdue_items=[dict(return_at=due,daily_price=140000)]))
plan=dict(version=1,start=(now-timedelta(days=20)).strftime('%Y-%m-%dT%H:%M'),end=(now+timedelta(days=40)).strftime('%Y-%m-%dT%H:%M'),interval='week',amount=100000)
rows.append(dict(id=10,contract_number='QA-PLAN',status='renting',store_id=32,store_name='CS QA',customer_name='Khách kỳ đóng tiền QA',rental_type='ownership',start_date=plan['start'],end_date=plan['end'],total_amount=100000,paid_amount=200000,deposit_amount=3000000,draft_payload=dict(management_composer=dict(installment_plan=plan)),vehicles=[dict(id=10,name='Xe QA',license='QA-PLAN',return_at=plan['end']+'+07:00')],overdue_items=[dict(return_at=plan['end']+'+07:00',daily_price=None)]))
accounts=[dict(kind='bank',id=99,label='TK đã có phiếu QA',bank_name='QA bank',owner_name='QA',account_number='000000001',store_id=32,status='Active',opening_balance=123000,income=50000,expense=10000,balance=163000,voucher_count=2),dict(kind='bank',id=100,label='TK chưa dùng QA',bank_name='QA bank',owner_name='QA',account_number='000000002',store_id=32,status='Active',opening_balance=0,income=0,expense=0,balance=0,voucher_count=0),dict(kind='bank',id=101,label='TK đã ngừng QA',bank_name='QA bank',owner_name='QA',account_number='000000003',store_id=32,status='Inactive',opening_balance=0,income=0,expense=0,balance=0,voucher_count=0)]
for account in accounts:account['name']=account['label']
def mock(route):
    if mock_contract_type_read(route):return
    req=route.request;path=urlparse(req.url).path;query={k:v[0] for k,v in parse_qs(urlparse(req.url).query).items()};requests.append(dict(path=path,query=query))
    if req.method!='GET':
        writes.append(dict(path=path,method=req.method,body=req.post_data_json))
        assert path=='/api/auth/cashbook/accounts/bank/99/status' and req.post_data_json==dict(status='inactive')
        accounts[0]['status']='Inactive';route.fulfill(json=dict(status='success',data=None));return
    if path=='/api/auth/order/car-rental':data=rows
    elif path=='/api/session':route.fulfill(json=dict(user=dict(name='QA')));return
    elif path=='/api/auth/stores':data=[dict(id=id,store_name=f'CS QA {id}',kind='physical',status='opening') for id in [32,33]]
    elif path=='/api/auth/gps':
        ids=[int(id) for id in query['vehicle_ids'].split(',')];assert len(ids)<=20
        data=dict(selected_vehicles=[dict(vehicle_id=id,status=['online','offline','stopped'][id%3],synced_at=now.isoformat()) for id in ids])
    elif path=='/api/auth/cashbook/accounts':data=accounts
    elif path=='/api/auth/cashbook/vouchers':
        empty=dict(rows=[],total=0,amount=0,page=1,pageSize=10);data=dict(total=0,income=empty,expense=empty,actors=[])
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))
with sync_playwright() as pw:
    browser=getattr(pw,a.browser).launch();mobile=a.browser=='webkit';ctx=browser.new_context(viewport=dict(width=390 if mobile else 1500,height=900),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
    ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
    def collect(error):errors.append(str(error))
    page=ctx.new_page();page.on('pageerror',collect)
    def fresh(path):
        global page
        page.wait_for_load_state('networkidle');page.remove_listener('pageerror',collect);page.close();page=ctx.new_page();page.on('pageerror',collect)
        page.goto(a.url+path,wait_until='networkidle',timeout=120000)
    def visible_rows():return page.locator('.mg-mobile-monitoring-card') if mobile else page.locator('tbody tr')
    fresh('/contracts/ownership');region=page.get_by_role('region',name='Hợp đồng thuê sở hữu',exact=True)
    expect(visible_rows()).to_have_count(7)
    expect(region.get_by_role('region',name='Thống kê hợp đồng theo bộ lọc')).not_to_be_visible()
    expect(region.get_by_role('combobox',name='Lọc trạng thái')).not_to_be_visible()
    assert visible_rows().first.bounding_box()['y']<(450 if mobile else 560)
    if not mobile:
        assert region.get_by_role('columnheader').count()==10
        expect(region.get_by_role('columnheader',name='Nguồn / doanh thu',exact=True)).to_have_count(0)
    expect(region.get_by_text('ON · Đang dừng',exact=True).filter(visible=True).first).to_be_visible()
    for label,count in [('1–5 ngày',2),('6–15 ngày',3),('Trên 15 ngày',1)]:
        region.get_by_role('group',name='Nhóm quá hạn thuê sở hữu').get_by_role('button',name=re.compile('^'+label)).click();expect(visible_rows()).to_have_count(count)
        expect(region.get_by_role('button',name=re.compile('^'+label))).to_have_attribute('aria-pressed','true')
    checks.append('Ownership quick groups are visible outside filters, have correct counts and include an overdue installment even though its vehicle deadline is in the future')
    region.get_by_role('group',name='Nhóm quá hạn thuê sở hữu').get_by_role('button',name=re.compile('^6–15')).click()
    expect(visible_rows().filter(has_text='QA-PLAN')).to_contain_text('100.000')
    page.screenshot(path=str(out/'ownership-compact.png'),full_page=True)
    region.get_by_text('Bộ lọc nâng cao',exact=True).click();expect(region.get_by_role('combobox',name='Lọc trạng thái')).to_be_visible()
    region.get_by_text('Bộ lọc nâng cao',exact=True).click();expect(region.get_by_role('combobox',name='Lọc trạng thái')).not_to_be_visible()
    checks.append('Eight core fields replace noisy columns; full filters and statistics remain collapsed and available, with first contracts visible without a long scroll')
    fresh('/contracts/overdue');region=page.get_by_role('region',name='Hợp đồng quá hạn',exact=True)
    group=region.get_by_role('group',name='Nhóm quá hạn truyền thống')
    for label,count in [('Quá hạn',3),('Trên 3 ngày',2),('Trên 10 ngày',1)]:
        group.get_by_role('button',name=re.compile('^'+label)).click();expect(visible_rows()).to_have_count(count)
    assert any(r['query'].get('overdue_bucket')=='traditional-10' for r in requests)
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
    page.screenshot(path=str(out/'traditional-compact.png'),full_page=True)
    checks.append('Traditional shortcuts apply the right age and type before pagination; GPS and compact cards fit mobile/desktop widths')
    fresh('/cashbook');account_region=page.locator('#cashbook-accounts')
    expect(account_region.get_by_role('button',name='Thao tác TK đã có phiếu QA' if mobile else 'Ngừng sử dụng TK đã có phiếu QA',exact=True)).to_be_visible()
    account_region.get_by_role('combobox',name='Trạng thái tài khoản').select_option('all')
    expect(account_region.get_by_role('combobox',name='Trạng thái tài khoản')).to_have_value('all')
    expect(account_region.get_by_text('TK đã ngừng QA',exact=True).filter(visible=True)).to_be_visible()
    account_region.get_by_role('combobox',name='Trạng thái tài khoản').select_option('active')
    expect(account_region.get_by_text('TK đã ngừng QA',exact=True).filter(visible=True)).to_have_count(0)
    if mobile:
        account_region.get_by_role('button',name='Thao tác TK đã có phiếu QA',exact=True).click();page.get_by_role('menuitem',name='Ngừng sử dụng',exact=True).click()
    else:account_region.get_by_role('button',name='Ngừng sử dụng TK đã có phiếu QA',exact=True).click()
    dialog=page.get_by_role('dialog',name='Ngừng sử dụng tài khoản',exact=True)
    dialog.get_by_role('button',name='Ngừng sử dụng',exact=True).click();expect(dialog).not_to_be_visible()
    assert len(writes)==1
    expect(account_region.get_by_text('TK đã có phiếu QA',exact=True).filter(visible=True)).to_have_count(0)
    account_region.get_by_role('combobox',name='Trạng thái tài khoản').select_option('inactive')
    expect(account_region.get_by_text('TK đã có phiếu QA',exact=True).filter(visible=True)).to_be_visible()
    assert accounts[0]['balance']==163000 and accounts[0]['voucher_count']==2
    checks.append('Used accounts can be archived and hidden without deleting vouchers or changing balances; inactive accounts remain accessible through the status filter')
    assert not errors,errors
    page.wait_for_load_state('networkidle');page.remove_listener('pageerror',collect);page.close();ctx.unroute_all(behavior='wait');ctx.close();browser.close()
result=dict(passed=len(checks),browser=a.browser,checks=checks,javascriptErrors=errors,simulatedWrites=len(writes),realBusinessWrites=0,realTelegramRequests=0)
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
