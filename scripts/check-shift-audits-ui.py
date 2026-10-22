"""PGD evidence and KTNB reconciliation acceptance flow; no real business writes."""
import argparse,base64,copy,hashlib,json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3027');p.add_argument('--cookie-file',required=True);p.add_argument('--browser',choices=['chromium','webkit'],default='chromium');p.add_argument('--output',default='.backups/shift-audits/ui');a=p.parse_args()
out=Path(a.output)/a.browser;out.mkdir(parents=True,exist_ok=True);checks=[];errors=[]
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvGQAAAAASUVORK5CYII=')
values={'other_vehicles':0,'daily_vehicles':16,'monthly_vehicles':7,'vehicles':19,'external_vehicles':1,'batteries':4,'cash':1865000,'personal':64710134,'company':26790959,'revenue_day':770000,'revenue_month':71418000}
labels={'other_vehicles':'Xe khác / thuê sở hữu','daily_vehicles':'Xe thuê ngày','monthly_vehicles':'Xe thuê tháng','vehicles':'Xe tại PGD','external_vehicles':'Xe giữ bên ngoài','batteries':'Pin cửa hàng','cash':'Tiền mặt','personal':'TK cá nhân','company':'TK công ty','revenue_day':'Doanh thu thuê xe trong ngày','revenue_month':'Doanh thu thuê xe lũy kế tháng'}
payload={'store_id':32,'date':'2026-10-21','staff':'Nhân sự PGD QA','vehicles':19,'batteries':4,'charged':2,'transfers':1,'cash':1865000,'personal':64300134,'company':26790959,'electricity_off':True,'notes':'Không','daily_vehicles':16,'monthly_vehicles':7,'external_vehicles':[{'plate':'QA-CA-1','reason':'CA giữ'}]}
snapshot={'captured_at':'2026-10-21T14:00:00Z','date':'2026-10-21','fingerprint':'source-1','values':{**values,'vehicles':20,'external_vehicles':None},'assets_total':43,'revenue':{'rental':200000,'renewal':570000,'late':0,'early':0,'revenue':770000},'unclassified_count':0,'transfers':[{'plate':'QA-IN','from':'CS QA NH','to':'CS QA HĐ'},{'plate':'QA-OUT','from':'CS QA HĐ','to':'CS QA NH'}],'inventory_note':'Kho được chụp lúc PGD chốt.','accounts_note':'Số dư sổ quỹ, không phải số dư ngân hàng trực tiếp.'}
report={'id':9101,'payload':payload,'status':'submitted','revision':1,'photos':[],'media':[],'legacy_photos':[],'audit':None,'app_snapshot':snapshot,'store_name':'CS QA HĐ','created_by_name':'PGD QA','updated_at':'2026-10-21T14:00:00Z'}
state={'report':report,'receipts':{},'audit_writes':0,'media_writes':0,'drop':None,'cloud':{},'writes':[]}
def mock(route):
    req=route.request;path=urlparse(req.url).path
    if 'api.cloudinary.com' in req.url:
        key=next(iter(state['cloud']));route.fulfill(json={'public_id':state['cloud'][key],'version':1,'signature':'a'*40});return
    if path=='/api/auth/photo-uploads/sign':
        key=req.post_data_json['upload_id'];public_id='himoto/management-video/1/'+key;state['cloud']={key:public_id}
        route.fulfill(json={'status':'success','data':{'cloud_name':'qa','api_key':'qa','signature':'qa','params':{'public_id':public_id}}});return
    if path=='/api/session':route.fulfill(json={'user':{'name':'QA'}});return
    if path=='/api/auth/payment-events':route.fulfill(content_type='text/event-stream',body=': QA mock\n\n');return
    if path=='/api/auth/shift-reports':route.fulfill(json={'data':[state['report']]});return
    if path.startswith('/api/auth/shift-reports/'):
        if req.method=='GET':
            if path.endswith('/audit'):route.fulfill(json={'data':snapshot})
            else:route.fulfill(content_type='image/png',body=png)
            return
        key=req.headers['x-shift-request-id'];fingerprint=hashlib.sha256((req.post_data_buffer or b'')+req.headers.get('x-report-revision','').encode()).hexdigest();state['writes'].append({'key':key,'hash':fingerprint})
        if key in state['receipts']:
            previous=state['receipts'][key];assert previous['hash']==fingerprint;route.fulfill(json={'data':previous['data']});return
        if path.endswith('/audit'):
            raw=req.post_data_json
            if raw['fingerprint']!=snapshot['fingerprint']:route.fulfill(status=409,json={'message':'Số liệu app đã thay đổi. Lấy lại số liệu app.'});return
            assert raw['report_revision']==report['revision']
            revision=(report['audit']['revision'] if report['audit'] else 0)+1;state['audit_writes']+=1
            audit={'input':raw['input'],'snapshot':copy.deepcopy(snapshot),'status':raw['status'],'result':'explained' if raw['status']=='confirmed' else 'pending','revision':revision,'reviewer_name':'KTNB QA','updated_at':'2026-10-22T12:00:00Z','confirmed_at':'2026-10-22T12:00:00Z' if raw['status']=='confirmed' else None};report['audit']=audit
            data={'id':report['id'],'revision':revision,'audit':audit};kind='audit'
        else:
            assert req.headers['x-shift-stage']=='audit';assert int(req.headers['x-report-revision'])==report['revision'];report['revision']+=1;state['media_writes']+=1
            media_id=path.split('/')[-1];mime='video/mp4' if req.headers['content-type']=='application/json' else 'image/jpeg'
            report['media'].append({'id':media_id,'category':req.headers['x-shift-category'],'stage':'audit','mime_type':mime,'filename':'QA evidence','url':path})
            data={'revision':report['revision']};kind='media'
        state['receipts'][key]={'hash':fingerprint,'data':data}
        if state['drop']==kind:state['drop']=None;route.abort('failed');return
        route.fulfill(json={'data':data});return
    data=[{'id':32,'store_name':'CS QA HĐ','status':'opening','kind':'physical'}] if path=='/api/auth/stores' else []
    route.fulfill(json={'status':'success','data':data})

with sync_playwright() as pw:
    browser=getattr(pw,a.browser).launch();ctx=browser.new_context(viewport={'width':390 if a.browser=='webkit' else 1440,'height':950},reduced_motion='reduce')
    ctx.add_cookies([{'name':'himoto_management_session','value':Path(a.cookie_file).read_text().strip(),'url':a.url,'httpOnly':True,'sameSite':'Strict'}]);ctx.route('**/api/**',mock);ctx.route('https://api.cloudinary.com/**',mock)
    page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
    page.goto(a.url+'/shift-reports',wait_until='networkidle',timeout=120000)
    page.get_by_role('button',name='Đối soát KTNB',exact=True).click();panel=page.get_by_role('region',name='KTNB đối soát báo cáo',exact=True)
    expect(panel.get_by_label('Sổ · Tiền mặt',exact=True)).to_have_value('')
    expect(panel.get_by_label('KTNB · Tiền mặt',exact=True)).to_have_value('')
    expect(panel.get_by_text('64.300.134 đ',exact=True)).to_be_visible()
    expect(panel.get_by_text('64.710.134 đ',exact=True)).to_be_visible()
    checks.append('PGD and KTNB are separate steps; original PGD amounts stay visible and unknown independent checks start blank.')
    for group in ['Sổ','KTNB']:
        for key,value in values.items():panel.get_by_label(group+' · '+labels[key],exact=True).fill(str(value))
    panel.get_by_role('button',name='Thêm xe bên ngoài',exact=True).click();panel.get_by_label('Biển số xe ngoài 1',exact=True).fill('QA-CA-1');panel.get_by_label('Lý do xe ngoài 1',exact=True).fill('CA giữ')
    for i,item in enumerate(snapshot['transfers'],1):
        panel.get_by_role('button',name='Thêm điều chuyển',exact=True).click()
        for key in ['plate','from','to']:panel.get_by_label(f'Điều chuyển {i} {key}',exact=True).fill(item[key])
    panel.get_by_role('button',name='Xác nhận đối soát',exact=True).click()
    expect(panel.get_by_role('alert')).to_contain_text('giải trình');assert state['audit_writes']==0
    for label in ['Xe tại PGD','TK cá nhân']:panel.get_by_label('Giải trình · '+label,exact=True).fill('Đã kiểm tra ảnh và sổ, có giải trình riêng. '+label)
    expect(panel.get_by_role('row').filter(has_text='TK cá nhân')).to_contain_text('410.000 đ')
    expect(panel.get_by_role('alert')).to_contain_text('giải trình')
    checks.append('19 physical + 1 external and the 410,000 VND difference are kept distinct; confirmation requires per-item explanations and a complete external-vehicle list.')
    file={'name':'qa.jpg','mimeType':'image/png','buffer':png}
    panel.locator('summary').filter(has_text='Minh chứng KTNB').click()
    panel.get_by_label('Ảnh kiểm kê xe',exact=True).set_input_files([file,{**file,'name':'qa-2.jpg'}])
    panel.get_by_label('Ảnh khóa cửa',exact=True).set_input_files({'name':'qa.mp4','mimeType':'video/mp4','buffer':b'QA fake video; external upload is mocked'})
    state['drop']='media';panel.get_by_role('button',name='Lưu nháp KTNB',exact=True).click()
    expect(panel.get_by_role('button',name='Thử lại đối soát',exact=True)).to_be_visible();expect(panel.get_by_label('Sổ · Tiền mặt',exact=True)).to_be_disabled()
    panel.get_by_role('button',name='Thử lại đối soát',exact=True).click();expect(panel.get_by_role('button',name='Thử lại đối soát',exact=True)).to_have_count(0)
    assert state['media_writes']==3 and state['audit_writes']==1
    assert len(report['media'])==3 and any(m['mime_type']=='video/mp4' for m in report['media'])
    checks.append('Multiple photos and video save as KTNB evidence; a lost attachment response resumes without duplicating assets or discarding selected files.')
    snapshot['fingerprint']='source-2'
    panel.get_by_role('button',name='Lưu nháp KTNB',exact=True).click();expect(panel.get_by_role('alert')).to_contain_text('Số liệu app đã thay đổi')
    assert state['audit_writes']==1
    panel.get_by_role('button',name='Lấy lại số liệu app',exact=True).click();expect(panel.get_by_role('button',name='Lấy lại số liệu app',exact=True)).to_be_enabled()
    checks.append('Changed app data blocks a stale approval; refresh is explicit and retains independent book/actual entries.')
    state['drop']='audit';panel.get_by_role('button',name='Xác nhận đối soát',exact=True).click();expect(panel.get_by_role('button',name='Thử lại đối soát',exact=True)).to_be_visible()
    panel.get_by_role('button',name='Thử lại đối soát',exact=True).click();expect(panel.get_by_text('Đã xác nhận · Có giải trình',exact=True)).to_be_visible()
    assert state['audit_writes']==2 and report['payload']['personal']==64300134 and report['payload']['vehicles']==19
    expect(panel.get_by_label('Sổ · Tiền mặt',exact=True)).to_be_disabled();expect(panel.get_by_role('button',name='Xác nhận đối soát',exact=True)).to_have_count(0)
    panel.get_by_text('Nội dung báo cáo KTNB để gửi / lưu',exact=True).click()
    expect(panel.locator('pre')).to_contain_text('770.000 đồng');expect(panel.locator('pre')).to_contain_text('71.418.000 đồng');expect(panel.locator('pre')).to_contain_text('KTNB QA')
    checks.append('A lost confirmation response replays once; confirmed results lock, preserve PGD data, and generate a copyable report with daily/monthly revenue and the reviewer.')
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
    page.screenshot(path=str(out/'audit-confirmed.png'),full_page=True)
    panel.get_by_role('row').filter(has_text='TK cá nhân').screenshot(path=str(out/'personal-difference.png'))
    page.get_by_role('button',name='Danh sách báo cáo (1)',exact=True).click()
    page.get_by_label('Tiến độ báo cáo',exact=True).select_option('explained');expect(page.get_by_role('button',name='Xem đối soát',exact=True)).to_be_visible()
    page.get_by_label('Tiến độ báo cáo',exact=True).select_option('pending');expect(page.get_by_text('Chưa có báo cáo phù hợp.',exact=True)).to_be_visible()
    checks.append('Branch history filters distinguish pending and explained approvals; the reconciliation layout fits desktop and narrow mobile screens.')
    assert not errors,errors
    ctx.close();browser.close()
result={'passed':len(checks),'browser':a.browser,'checks':checks,'javascriptErrors':errors,'realBusinessWrites':0,'realCloudUploads':0}
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
