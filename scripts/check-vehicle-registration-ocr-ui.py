"""Registration scan QA on add/edit vehicle forms. Business writes and OCR responses are mocked."""
import argparse,base64,json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3022');p.add_argument('--session-cookie-file',required=True);p.add_argument('--browser',choices=['chromium','webkit'],default='chromium');p.add_argument('--output',default='.backups/vehicle-registration-20261021/ui');a=p.parse_args()
out=Path(a.output)/a.browser;out.mkdir(parents=True,exist_ok=True);expect.set_options(timeout=30000)
pending=[];writes=[];reads=[];checks=[];errors=[];mode='hold'
fields=dict(chassis='001AB0O123456789',engine='JF27E-0012345')
stores=[dict(id=32,store_name='CS QA',status='opening')]
vehicles=[dict(id=100,name='Xe QA đăng ký',license='QA-00100',brand='Honda',type='xeso',year=2026,store_id=32,current_store_id=32,store_name='CS QA',status='ready',chassis='MANUAL-OLD001',engine='',vehicle_revision='1',rentals=[])]
payload=dict(name='dang-ky-qa.png',mimeType='image/png',buffer=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6S8AAAAASUVORK5CYII='))
def fulfill(route,data):route.fulfill(json=dict(status='success',data=dict(fields=data)))
def mock(route):
    global mode
    if mock_contract_type_read(route):return
    req=route.request;path=urlparse(req.url).path
    if path=='/api/auth/gps/refresh':route.fulfill(json=dict(status='success',data=dict(refreshed=False,cached=True)));return
    if path=='/api/auth/photo-ocr':
        assert req.method=='POST' and req.headers['x-photo-kind']=='vehicle_registration'
        assert req.headers['content-type']=='image/jpeg';reads.append(path)
        if mode=='hold':pending.append(route)
        elif mode=='quota':route.fulfill(status=503,json=dict(status='error',message='Gemini đang giới hạn lượt đọc QA'))
        elif mode=='empty':fulfill(route,{})
        elif mode=='partial':fulfill(route,dict(engine=fields['engine']))
        else:fulfill(route,fields)
        return
    if req.method!='GET':
        assert path in ['/api/auth/vehicles','/api/auth/vehicles/100'],f'Unexpected mutation {path}'
        writes.append(dict(path=path,method=req.method,body=req.post_data_json))
        route.fulfill(status=201 if req.method=='POST' else 200,json=dict(status='success',data=dict(id=101 if req.method=='POST' else 100)));return
    if path=='/api/auth/stores':data=stores
    elif path in ['/api/auth/vehicle/vehicles','/api/auth/vehicles/inventory']:data=vehicles
    elif path=='/api/auth/gps':data=dict(devices=[],events=[])
    elif path=='/api/session':route.fulfill(json=dict(user=dict(name='QA')));return
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as pw:
    browser=getattr(pw,a.browser).launch();mobile=a.browser=='webkit'
    ctx=browser.new_context(viewport=dict(width=390 if mobile else 1440,height=900),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce',**(dict(is_mobile=True,has_touch=True) if mobile else {}))
    ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.session_cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
    page=ctx.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(a.url+'/vehicles',wait_until='networkidle',timeout=120000)
    page.get_by_role('button',name='Thêm xe',exact=True).click()
    dialog=page.get_by_role('dialog',name='Thêm xe',exact=True)
    panel=dialog.get_by_role('region',name='Đọc đăng ký xe')
    camera=panel.locator('input[capture="environment"]');library=panel.locator('input[type="file"]:not([capture])')
    dialog.locator('#vehicle-name').fill('Xe mới QA');dialog.locator('#vehicle-license').fill('QA-NEW001');dialog.locator('#vehicle-year').fill('2026');dialog.locator('#vehicle-store_id').select_option('32')
    for label in ['Chụp ảnh','Chọn ảnh']:
        with page.expect_file_chooser() as chooser:panel.get_by_role('button',name=label,exact=True).click()
        chooser.value.set_files([])
        expect(dialog.locator('#vehicle-name')).to_have_value('Xe mới QA')
    assert not reads
    checks.append('Camera uses environment capture, library is separate, and canceling either picker keeps the form without sending OCR')
    camera.set_input_files(payload);expect(panel.get_by_text('AI đang đọc ảnh…',exact=True)).to_be_visible()
    dialog.locator('#vehicle-chassis').fill('MANUAL-00001')
    fulfill(pending.pop(0),fields)
    expect(dialog.locator('#vehicle-chassis')).to_have_value('MANUAL-00001');expect(dialog.locator('#vehicle-engine')).to_have_value(fields['engine'])
    expect(dialog.locator('#vehicle-license')).to_have_value('QA-NEW001')
    checks.append('OCR fills engine, preserves a chassis edited while waiting, and never changes plate/name/store')
    dialog.locator('#vehicle-chassis').fill('');library.set_input_files(payload)
    expect(panel.get_by_text('AI đang đọc ảnh…',exact=True)).to_be_visible();fulfill(pending.pop(0),fields)
    expect(dialog.locator('#vehicle-chassis')).to_have_value(fields['chassis'])
    expect(dialog.locator('#vehicle-engine')).to_have_value(fields['engine'])
    assert len(writes)==0
    panel.scroll_into_view_if_needed();dialog.screenshot(path=str(out/'registration-autofill.png'))
    assert dialog.evaluate('(d)=>d.scrollWidth<=d.clientWidth+2')
    checks.append('Blank chassis/engine fill from OCR without changing leading zeros or O/0 in its response; preview remains compact and reading alone does not save a vehicle')
    library.set_input_files(payload);expect(panel.get_by_text('AI đang đọc ảnh…',exact=True)).to_be_visible();old=pending.pop(0)
    library.set_input_files(payload);expect(panel.get_by_text('AI đang đọc ảnh…',exact=True)).to_be_visible()
    fulfill(pending.pop(0),dict(chassis='NEW-000123',engine='NEW-000456'))
    expect(dialog.locator('#vehicle-chassis')).to_have_value('NEW-000123')
    try:fulfill(old,dict(chassis='STALE-0001',engine='STALE-0002'))
    except Exception:pass
    expect(dialog.locator('#vehicle-engine')).to_have_value('NEW-000456')
    library.set_input_files(payload);expect(panel.get_by_text('AI đang đọc ảnh…',exact=True)).to_be_visible();removed=pending.pop(0)
    panel.get_by_role('button',name='Bỏ ảnh mới',exact=False).click()
    try:fulfill(removed,fields)
    except Exception:pass
    expect(panel.locator('img')).to_have_count(0);expect(dialog.locator('#vehicle-chassis')).to_have_value('NEW-000123')
    checks.append('Replacing or removing an image cancels stale results; existing identifier values are not cleared')
    mode='quota';library.set_input_files(payload);expect(panel.get_by_role('alert')).to_contain_text('giới hạn lượt đọc QA')
    expect(dialog.get_by_role('button',name='Thêm xe',exact=True)).to_be_enabled()
    expect(dialog.locator('#vehicle-engine')).to_have_value('NEW-000456')
    before=len(reads);library.set_input_files(dict(name='invalid.txt',mimeType='text/plain',buffer=b'not an image'))
    expect(panel.get_by_role('alert').filter(has_text='Chọn một ảnh')).to_be_visible();assert len(reads)==before
    mode='empty';library.set_input_files(payload);expect(panel.get_by_role('alert')).to_contain_text('Chưa đọc được thông tin rõ ràng')
    expect(dialog.locator('#vehicle-chassis')).to_have_value('NEW-000123')
    mode='partial';dialog.locator('#vehicle-engine').fill('');library.set_input_files(payload)
    expect(dialog.locator('#vehicle-engine')).to_have_value(fields['engine']);expect(panel.get_by_text('Ảnh chưa đọc đủ',exact=False)).to_be_visible()
    checks.append('Quota, invalid files, unreadable and partial scans preserve inputs and allow manual entry/save or retry')
    mode='hold';library.set_input_files(payload);expect(panel.get_by_text('AI đang đọc ảnh…',exact=True)).to_be_visible();skipped=pending.pop(0)
    panel.get_by_role('button',name='Bỏ qua AI',exact=True).click()
    try:fulfill(skipped,fields)
    except Exception:pass
    dialog.get_by_role('button',name='Thêm xe',exact=True).click();expect(dialog).not_to_be_visible()
    assert writes[-1]['method']=='POST' and writes[-1]['body']['chassis']=='NEW-000123' and writes[-1]['body']['engine']==fields['engine']
    checks.append('Skip AI cancels pending work; the existing create API receives only the reviewed text when Save is pressed')
    action=page.get_by_role('button',name='Thao tác QA-00100',exact=True).filter(visible=True)
    if not action.count():action=page.locator('.mg-mobile-record-card').filter(has_text='QA-00100').get_by_role('button',name='Thao tác',exact=False)
    action.click();page.get_by_role('menuitem',name='Chỉnh sửa',exact=True).click()
    dialog=page.get_by_role('dialog',name='Chỉnh sửa xe',exact=True);panel=dialog.get_by_role('region',name='Đọc đăng ký xe');mode='ready'
    panel.locator('input[type="file"]:not([capture])').set_input_files(payload)
    expect(dialog.locator('#vehicle-chassis')).to_have_value('MANUAL-OLD001');expect(dialog.locator('#vehicle-engine')).to_have_value(fields['engine'])
    dialog.get_by_role('button',name='Lưu xe',exact=True).click();expect(dialog).not_to_be_visible()
    assert writes[-1]['method']=='PATCH' and writes[-1]['body']['chassis']=='MANUAL-OLD001' and writes[-1]['body']['engine']==fields['engine']
    assert not errors,errors
    checks.append('Edit uses the same scan controls, preserves existing manual chassis and sends reviewed fields to PATCH with no direct OCR write')
    result=dict(passed=len(checks),browser=a.browser,checks=checks,javascriptErrors=errors,simulatedVehicleWrites=len(writes),realBusinessWrites=0)
    (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
    browser.close()
