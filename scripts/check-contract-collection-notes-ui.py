"""Contract-list collection notes. Every browser API/write is intercepted."""
import argparse, copy, json
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser()
p.add_argument('--url',default='http://127.0.0.1:3047')
p.add_argument('--sessions',required=True)
p.add_argument('--output',default='.backups/contract-collection-notes-20261028/ui')
p.add_argument('--browser',choices=['all','chromium','webkit'],default='all')
p.add_argument('--role',choices=['all','admin','ownership_staff','accounting'],default='all')
a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
expect.set_options(timeout=20000)
checks=[];errors=[];writes=[]

def contract(i):
    return dict(id=i,contract_number=f'QA-NOTE-{i}',order_status='overdue',order_type='daily',rental_type='daily',store_id=35,store_name='CS Thuê sở hữu QA',store_kind='branch',customer_name=f'Khách QA {i}',customer_phone='0900000000',rent_at='2026-10-01T01:00:00Z',return_at='2026-10-15T01:00:00Z',total_amount=500000,paid_amount=0,deposit_amount=0,draft_revision='1',vehicles=[dict(id=100+i,name='Xe QA',license=f'QA-PLATE-{i}',rent_at='2026-10-01T01:00:00Z',return_at='2026-10-15T01:00:00Z')])

with sync_playwright() as pw:
    for engine,width in [('chromium',1440),('webkit',390)]:
      if a.browser not in ['all',engine]:continue
      browser=getattr(pw,engine).launch()
      for role in ['admin','ownership_staff','accounting']:
        if a.role not in ['all',role]:continue
        state={'notes':{i:dict(contact_status='contacted',handling_status='branch',customer_condition='Đã liên hệ',notes='Ghi chú đã lưu' if i==1 else '',revision=1) for i in [1,2]},'fail':False,'conflict':False,'reads':0,'report_reads':0}
        def mock(route):
            req=route.request;u=urlparse(req.url);path=u.path;q=parse_qs(u.query)
            if mock_contract_type_read(route):return
            if path=='/api/auth/order/car-rental/followups':
                if req.method=='GET':
                    state['reads']+=1
                    ids=[int(i) for i in q.get('ids',[''])[0].split(',') if i]
                    route.fulfill(json={'data':[{'id':i,'followup':state['notes'][i]} for i in ids]});return
                assert req.method=='PATCH' and role!='accounting'
                b=req.post_data_json;writes.append(copy.deepcopy(b));old=state['notes'][b['order_id']]
                assert set(b)=={'order_id','revision','contact_status','handling_status','customer_condition','notes'}
                if state['fail']:
                    state['fail']=False;route.fulfill(status=503,json={'message':'QA chưa lưu được'});return
                if state['conflict']:
                    state['conflict']=False;old.update(notes='Ghi chú của người khác',handling_status='escalated',revision=old['revision']+1)
                if b['revision']!=old['revision']:
                    route.fulfill(status=409,json={'message':'Ghi chú đã thay đổi. Tải lại trước khi lưu.'});return
                state['notes'][b['order_id']]={k:v for k,v in b.items() if k!='order_id'}
                state['notes'][b['order_id']]['revision']+=1
                route.fulfill(json={'data':{'revision':state['notes'][b['order_id']]['revision']}});return
            if path=='/api/auth/gps/debts':
                assert req.method=='GET','Opening notes must never send a report'
                state['report_reads']+=1
                r=dict(id=1,code='QA-NOTE-1',customer='Khách QA 1',phone='',store_id=35,store_name='CS Thuê sở hữu QA',vehicle='QA-PLATE-1',started_at='2026-10-01T08:00',due_at='2026-10-15T08:00',days=13,amount=500000,late_fee=0,gps=[],customer_status='Bình thường',followup=state['notes'][1])
                route.fulfill(json={'data':{'rows':[r],'read_at':'2026-10-28T10:00:00Z','messages':['QA preview'],'hash':'a'*64,'deliveries':[]}});return
            assert req.method=='GET' or path=='/api/auth/gps/refresh',f'Unexpected mutation {req.method} {path}'
            if path=='/api/auth/order/car-rental':data=[contract(1),contract(2)]
            elif path in ['/api/auth/stores','/api/auth/store-directory']:data=[dict(id=35,name='CS Thuê sở hữu QA',store_name='CS Thuê sở hữu QA',status='active',kind='lease_to_own')]
            elif path=='/api/auth/gps':data={'devices':[],'events':[]}
            elif path=='/api/auth/gps/refresh':data={'cached':True}
            elif path=='/api/session':route.fulfill(json={'user':{'name':'QA'}});return
            else:data=[]
            route.fulfill(json={'status':'success','data':data})
        ctx=browser.new_context(viewport={'width':width,'height':900},timezone_id='Asia/Ho_Chi_Minh')
        token=(Path(a.sessions)/f'session-{role}.txt').read_text().strip()
        ctx.add_cookies([{'name':'himoto_management_session','value':token,'url':a.url,'httpOnly':True,'sameSite':'Strict'}])
        ctx.route('**/api/**',mock)
        ctx.add_init_script("const originalFetch=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);return url.pathname==='/api/auth/payment-events'?Promise.resolve(Response.json({status:'success',data:[]})):originalFetch.call(this,input,options);};")
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        label=f'{engine}/{role}'
        for path in ['/contracts','/contracts/overdue']:
            page.goto(a.url+path,wait_until='networkidle',timeout=90000)
            region=page.locator('.mg-desktop-records') if width>767 else page.locator('.mg-mobile-records')
            expect(region.get_by_text('Ghi chú tình trạng khách',exact=True).first).to_be_visible()
            expect(region).to_contain_text('QA-NOTE-1')
            if role=='accounting':
                expect(region.locator('.mg-collection-note textarea')).to_have_count(0)
                expect(region).to_contain_text(state['notes'][1]['notes'])
                continue
            note=region.get_by_role('textbox',name='Ghi chú tình trạng khách QA-NOTE-1',exact=True)
            second=region.get_by_role('textbox',name='Ghi chú tình trạng khách QA-NOTE-2',exact=True)
            if width<=767:
                main=note.locator('xpath=ancestor::li[1]').locator('.mg-mobile-card-main')
                assert main.bounding_box()['width']>250,'Contract summary must remain readable on mobile'
                assert note.bounding_box()['y']>=main.bounding_box()['y']+main.bounding_box()['height']-1,'Notes must appear below the contract summary'
            expect(note).to_have_value(state['notes'][1]['notes'])
            note.fill('28/10 gọi khách\nHẹn thanh toán 30/10')
            second.fill('Bản nhập dòng thứ hai')
            cell=note.locator('xpath=..')
            state['fail']=True;cell.get_by_role('button',name='Lưu ghi chú',exact=True).click()
            expect(cell.get_by_role('alert')).to_contain_text('QA chưa lưu được')
            expect(note).to_have_value('28/10 gọi khách\nHẹn thanh toán 30/10')
            expect(second).to_have_value('Bản nhập dòng thứ hai')
            cell.get_by_role('button',name='Lưu ghi chú',exact=True).click()
            expect(cell.get_by_role('button',name='Lưu ghi chú',exact=True)).to_have_count(0)
            expect(second).to_have_value('Bản nhập dòng thứ hai')
            second.locator('xpath=..').get_by_role('button',name='Huỷ',exact=True).click()
            note.fill('Nội dung đang nhập');state['conflict']=True
            cell.get_by_role('button',name='Lưu ghi chú',exact=True).click()
            expect(cell).to_contain_text('Ghi chú của người khác')
            expect(note).to_have_value('Nội dung đang nhập')
            expect(cell.get_by_role('button',name='Lưu ghi chú',exact=True)).to_be_disabled()
            cell.get_by_role('button',name='Giữ nội dung đang nhập',exact=True).click()
            cell.get_by_role('button',name='Lưu ghi chú',exact=True).click()
            expect(cell.get_by_role('button',name='Lưu ghi chú',exact=True)).to_have_count(0)
            assert state['notes'][1]['handling_status']=='escalated'
            note.fill('');cell.get_by_role('button',name='Lưu ghi chú',exact=True).click()
            expect(cell.get_by_role('button',name='Lưu ghi chú',exact=True)).to_have_count(0)
            assert state['notes'][1]['notes']==''
            note.fill('Ghi chú dùng chung ở hai danh sách');cell.get_by_role('button',name='Lưu ghi chú',exact=True).click()
            expect(cell.get_by_role('button',name='Lưu ghi chú',exact=True)).to_have_count(0)
        checks.append(label+': both contract lists display shared notes; staff can save/clear, retain drafts after errors and resolve conflicts; accounting remains read-only')
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
        page.screenshot(path=str(out/f'{engine}-{role}-inline-notes.png'),full_page=True)
        page.locator('.mg-debt-report > summary').click()
        expect(page.locator('.mg-collection-table')).to_contain_text(state['notes'][1]['notes'])
        page.screenshot(path=str(out/f'{engine}-{role}-contracts.png'),full_page=True)
        before=state['report_reads'];page.goto(a.url+'/gps',wait_until='networkidle',timeout=90000)
        expect(page.locator('.mg-debt-report')).to_have_count(0)
        assert state['report_reads']==before
        checks.append(label+': debt report is available under contracts and absent from GPS; no automatic report sends')
        ctx.unroute_all(behavior='ignoreErrors');ctx.close()
      browser.close()
assert not errors,errors
report={'passed':len(checks),'checks':checks,'javascript_errors':errors,'simulated_writes':len(writes),'real_business_writes':0,'real_telegram_sends':0}
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
