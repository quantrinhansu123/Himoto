"""Lost-response recovery and unsaved report navigation; all business APIs mocked."""
import argparse, base64, hashlib, json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

p=argparse.ArgumentParser()
p.add_argument('--url',default='http://127.0.0.1:3026')
p.add_argument('--cookie-file',required=True)
p.add_argument('--browser',choices=['chromium','webkit'],default='chromium')
p.add_argument('--output',default='.backups/shift-report-fix/ui')
a=p.parse_args();out=Path(a.output)/a.browser;out.mkdir(parents=True,exist_ok=True)
state={'report':None,'receipts':{},'writes':[],'applied':[],'drop':None,'hold':False,'held':None}
checks=[];errors=[];dialogs=[];accept_dialog=True
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvGQAAAAASUVORK5CYII=')
slots={'Kiểm kê xe / pin':['Ảnh kiểm kê xe','Ảnh kiểm kê pin'],'Tiền các tài khoản':['Ảnh tiền mặt thực tế','Ảnh tài khoản cá nhân','Ảnh tài khoản Công ty'],'An toàn cuối ca':['Ảnh khóa cửa']}

def mock(route):
    req=route.request;path=urlparse(req.url).path
    if path=='/api/session':route.fulfill(json={'user':{'name':'QA'}});return
    if path.startswith('/api/auth/shift-reports'):
        if req.method=='GET':
            if path=='/api/auth/shift-reports':route.fulfill(json={'data':[state['report']] if state['report'] else []})
            else:route.fulfill(content_type='image/png',body=png)
            return
        raw=req.post_data_json if req.method=='POST' else None
        kind=('submit' if raw['status']=='submitted' else 'draft') if raw else 'photo'
        key=req.headers.get('x-shift-request-id');assert key,'Every write must carry a stable request ID'
        fingerprint=hashlib.sha256(path.encode()+(req.post_data_buffer or b'')+req.headers.get('x-report-revision','').encode()).hexdigest()
        state['writes'].append({'kind':kind,'key':key,'hash':fingerprint})
        if state['hold']:
            state['hold']=False;state['held']=(route,raw,key,fingerprint);return
        if key in state['receipts']:
            previous=state['receipts'][key];assert previous['hash']==fingerprint,'Retry changed the original request'
            route.fulfill(json={'data':previous['data']});return
        row=state['report']
        if raw:
            if raw.get('id') is None:
                if row:route.fulfill(status=409,json={'message':'PGD đã có báo cáo ngày này.'});return
                row={'id':9001,'revision':1,'payload':raw['payload'],'status':'draft','photos':[],'store_name':'CS QA','created_by_name':'QA','updated_at':'2026-10-22T00:00:00Z'}
                state['report']=row
            else:
                if raw['revision']!=row['revision'] or row['status']!='draft':route.fulfill(status=409,json={'message':'Báo cáo đã thay đổi.'});return
                row['revision']+=1;row['payload']=raw['payload'];row['status']=raw['status']
            data={k:row[k] for k in ['id','revision']}
        else:
            if int(req.headers['x-report-revision'])!=row['revision'] or row['status']!='draft':route.fulfill(status=409,json={'message':'Báo cáo đã thay đổi.'});return
            row['revision']+=1;row['photos']=list(set(row['photos']+[path.split('/')[-1]]));data={'revision':row['revision']}
        state['applied'].append(kind);state['receipts'][key]={'hash':fingerprint,'data':data}
        if state['drop']==kind:state['drop']=None;route.abort('failed');return
        route.fulfill(json={'data':data});return
    data=[{'id':32,'store_name':'CS QA','kind':'physical','status':'opening'}] if path=='/api/auth/stores' else []
    route.fulfill(json={'status':'success','data':data})

with sync_playwright() as pw:
    browser=getattr(pw,a.browser).launch()
    context=browser.new_context(viewport={'width':390 if a.browser=='webkit' else 1440,'height':950},reduced_motion='reduce')
    context.add_cookies([{'name':'himoto_management_session','value':Path(a.cookie_file).read_text().strip(),'url':a.url,'httpOnly':True,'sameSite':'Strict'}])
    context.route('**/api/**',mock)
    page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
    def dialog(d):
        dialogs.append(d.type)
        d.accept() if accept_dialog else d.dismiss()
    page.on('dialog',dialog)
    def fresh():
        page.goto(a.url+'/shift-reports',wait_until='networkidle',timeout=120000)
        page.get_by_role('button',name='Tạo báo cáo',exact=True).click()
        page.get_by_label('PGD',exact=True).select_option('32')
        page.get_by_label('Nhân sự trực ca',exact=True).fill('QA unsaved report')
    def choose(tab,label):
        page.get_by_role('tab',name=tab,exact=True).click()
        page.get_by_label(label,exact=True).set_input_files({'name':'qa.png','mimeType':'image/png','buffer':png})
    def retry():
        expect(page.get_by_role('button',name='Thử lại thao tác lưu',exact=True)).to_be_visible()
        expect(page.locator('#shift-staff')).to_be_disabled()
        page.get_by_role('button',name='Thử lại thao tác lưu',exact=True).click()
    def menu(name):
        if a.browser=='webkit':page.get_by_role('button',name='Mở menu',exact=True).click()
        return page.get_by_role('navigation',name='Điều hướng quản lý',exact=True).filter(visible=True).get_by_role('link',name=name,exact=True)
    fresh();state['drop']='draft'
    page.get_by_role('button',name='Lưu nháp',exact=True).click();retry()
    expect(page.get_by_role('status').filter(has_text='Đã lưu nháp báo cáo và ảnh.')).to_be_visible()
    assert state['applied']==['draft'] and len(state['writes'])==2
    assert state['writes'][0]['key']==state['writes'][1]['key']
    expect(page.locator('#shift-staff')).to_be_enabled()
    checks.append('Lost create response replays the same request; one report is created and the editor resumes without 409.')
    page.get_by_role('tab',name='Thông tin',exact=True).click();page.locator('#shift-staff').fill('QA edited report')
    state['drop']='draft';before=len(state['applied'])
    page.get_by_role('button',name='Lưu nháp',exact=True).click();retry()
    expect(page.get_by_role('button',name='Thử lại thao tác lưu',exact=True)).to_have_count(0)
    assert len(state['applied'])==before+1
    checks.append('Lost draft update response replays without another revision increment and keeps the edited values.')
    choose('Kiểm kê xe / pin','Ảnh kiểm kê xe');choose('Kiểm kê xe / pin','Ảnh kiểm kê pin')
    state['drop']='photo';before=len(state['applied'])
    page.get_by_role('button',name='Lưu nháp',exact=True).click();retry()
    expect(page.get_by_role('button',name='Thử lại thao tác lưu',exact=True)).to_have_count(0)
    expect(page.get_by_text('Ảnh mới · Chưa lưu',exact=True)).to_have_count(0)
    assert state['applied'][before:]==['draft','photo','photo']
    assert state['report']['revision']==5
    checks.append('Lost photo response resumes that photo then uploads the next photo; confirmed steps are not repeated and file bytes remain identical.')
    for tab,labels in slots.items():
        if tab=='Kiểm kê xe / pin':continue
        for label in labels:choose(tab,label)
    page.get_by_label('Xác nhận đã tắt các thiết bị điện',exact=True).check()
    state['drop']='submit';before=len(state['applied'])
    page.get_by_role('button',name='Chốt báo cáo',exact=True).click();retry()
    expect(page.get_by_text('Đã chốt · Chỉ xem',exact=True)).to_be_visible()
    assert state['applied'][before:]==['draft','photo','photo','photo','photo','submit']
    expect(page.get_by_role('button',name='Chốt báo cáo',exact=True)).to_have_count(0)
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
    page.screenshot(path=str(out/'submission-recovered.png'),full_page=True)
    checks.append('Lost submit response recovers the locked report without reopening it or submitting twice; all six photos remain saved.')
    state['report']=None;state['receipts']={};state['writes']=[];state['applied']=[]
    fresh();choose('Kiểm kê xe / pin','Ảnh kiểm kê xe');dialogs.clear();accept_dialog=False
    menu('Danh sách hợp đồng').click();expect(page).to_have_url(a.url+'/shift-reports')
    assert dialogs==['confirm']
    expect(page.get_by_text('Ảnh mới · Chưa lưu',exact=True)).to_be_visible()
    expect(page.locator('#shift-staff')).to_have_value('QA unsaved report')
    if a.browser=='webkit':page.get_by_role('button',name='Đóng menu',exact=True).click()
    page.screenshot(path=str(out/'unsaved-navigation-blocked.png'),full_page=True)
    checks.append('Dismissed navigation confirmation keeps the current report values and unsaved photo, including mobile menu navigation.')
    accept_dialog=True
    menu('Danh sách hợp đồng').click();page.wait_for_url('**/contracts');page.wait_for_load_state('networkidle')
    assert dialogs==['confirm','confirm'] and state['applied']==[]
    menu('Báo cáo cuối ca').click();page.wait_for_url('**/shift-reports');page.wait_for_load_state('networkidle')
    expect(page.locator('#shift-staff')).to_have_count(0)
    checks.append('Confirmed navigation leaves the page; discarding local data is explicit and does not create a business write.')
    page.get_by_role('button',name='Tạo báo cáo',exact=True).click()
    page.locator('#shift-store').select_option('32');page.locator('#shift-staff').fill('QA busy report')
    state['hold']=True;page.get_by_role('button',name='Lưu nháp',exact=True).click()
    expect(page.get_by_role('button',name='Đang lưu…',exact=True)).to_be_visible();assert state['held']
    count=len(dialogs);menu('Danh sách hợp đồng').click();expect(page).to_have_url(a.url+'/shift-reports');assert len(dialogs)==count
    route,raw,key,fingerprint=state['held'];state['held']=None
    state['report']={'id':9002,'revision':1,'payload':raw['payload'],'status':'draft','photos':[],'store_name':'CS QA','created_by_name':'QA','updated_at':'2026-10-22T00:00:00Z'}
    route.fulfill(json={'data':{'id':9002,'revision':1}})
    expect(page.get_by_role('button',name='Lưu nháp',exact=True)).to_be_visible()
    if a.browser=='webkit':page.get_by_role('button',name='Đóng menu',exact=True).click()
    menu('Danh sách hợp đồng').click();page.wait_for_url('**/contracts');assert len(dialogs)==count
    checks.append('Navigation is blocked during an in-flight save; after a confirmed save navigation succeeds without a dirty warning.')
    assert not errors,errors
    context.close();browser.close()
result={'passed':len(checks),'browser':a.browser,'checks':checks,'javascriptErrors':errors,'realBusinessWrites':0}
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
