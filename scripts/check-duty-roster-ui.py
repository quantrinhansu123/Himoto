"""Synthetic duty roster QA: every /api/** intercepted; no operational writes."""
import argparse,copy,json,re
from datetime import date,timedelta
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect

parser=argparse.ArgumentParser()
parser.add_argument('--url',default='http://127.0.0.1:3009')
parser.add_argument('--session-cookie-file',required=True)
parser.add_argument('--output',default='.backups/qr-duty-roster/duty-ui')
args=parser.parse_args()
output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
checks,errors,unexpected,writes=[],[],[],[]
rows=[];mode={'next':'','read_error':False}
staff=[dict(id=1,full_name='Nhân viên QA A',status='active',store_id=23),dict(id=2,full_name='Nhân viên QA B',status='active',store_id=31),dict(id=3,full_name='Nhân viên QA nghỉ',status='inactive',store_id=23)]
stores=[dict(id=23,store_name='Cơ sở QA A',status='opening'),dict(id=31,store_name='Cơ sở QA B',status='opening')]
def mock(route):
    request=route.request;path=urlparse(request.url).path;query=parse_qs(urlparse(request.url).query)
    if path=='/api/auth/duty-roster' and request.method=='GET':
        if mode['read_error']:
            route.fulfill(status=503,json=dict(message='Không tải được lịch trực QA'));return
        start=query.get('week',['2026-10-05'])[0]
        store=query.get('store_id',[''])[0]
        end=(date.fromisoformat(start)+timedelta(days=7)).isoformat()
        found=[copy.deepcopy(row) for row in rows if (not store or str(row['store_id'])==store) and row['duty_date'][:10]>=start and row['duty_date'][:10]<end]
        route.fulfill(json=dict(status='success',data=dict(week=start,schedules=found)));return
    match=re.fullmatch(r'/api/auth/duty-roster(?:/(\d+))?',path)
    if match and request.method in ['POST','PATCH','DELETE']:
        payload=request.post_data_json;writes.append(copy.deepcopy(payload))
        behavior=mode['next'];mode['next']=''
        if behavior=='conflict':route.fulfill(status=409,json=dict(message='Ca trực đã thay đổi. Làm mới và mở lại để sửa.'));return
        if behavior=='overlap':route.fulfill(status=409,json=dict(message='Nhân viên đã có ca trực trùng giờ, kể cả tại cơ sở khác.'));return
        if request.method=='DELETE':
            row=next(row for row in rows if row['id']==int(match[1]));assert row['revision']==payload['revision'];rows.remove(row)
            route.fulfill(json=dict(status='success',data=None));return
        assert set(payload)=={'store_id','staff_id','starts_at','ends_at','shift_name','role_in_shift','notes','request_id' if request.method=='POST' else 'revision'}
        if request.method=='PATCH':
            row=next(row for row in rows if row['id']==int(match[1]));assert row['revision']==payload['revision']
        else:
            row=dict(id=max([row['id'] for row in rows],default=0)+1,revision='0');rows.append(row)
        person=next(person for person in staff if person['id']==payload['staff_id'])
        assert person['status']=='active'
        row.update({key:value for key,value in payload.items() if key not in ['request_id','revision']})
        row.update(dict(revision=str(int(row['revision'])+1),staff_name=person['full_name'],staff_phone='0000000000',store_name=next(store['store_name'] for store in stores if store['id']==row['store_id']),duty_date=payload['starts_at'][:10],starts_at=payload['starts_at']+':00+07:00',ends_at=payload['ends_at']+':00+07:00'))
        if behavior=='lost':route.abort('failed');return
        route.fulfill(json=dict(status='success',data=copy.deepcopy(row)));return
    if request.method!='GET':unexpected.append(path);route.abort('blockedbyclient');return
    data={'/api/session':None,'/api/auth/me':None,'/api/auth/hr/staff':staff,'/api/auth/stores':stores,'/api/auth/customers':[],'/api/auth/vehicle/vehicles':[],'/api/auth/order/car-rental':[]}
    if path not in data:unexpected.append(path);route.abort('blockedbyclient');return
    route.fulfill(json=dict(user=dict(id=143,name='QA')) if data[path] is None else dict(status='success',data=copy.deepcopy(data[path])))

with sync_playwright() as p:
    browser=p.chromium.launch();ctx=browser.new_context(viewport=dict(width=1440,height=1000),timezone_id='Asia/Ho_Chi_Minh')
    ctx.add_cookies([dict(name='himoto_management_session',value=Path(args.session_cookie_file).read_text().strip(),url=args.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
    page=ctx.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(args.url+'/duty-roster',wait_until='domcontentloaded',timeout=120000)
    expect(page.get_by_role('heading',name='Lịch trực cơ sở',exact=False)).to_be_visible()
    page.get_by_label('Ngày trong tuần',exact=True).fill('2026-10-08')
    expect(page.get_by_label('Ngày trong tuần',exact=True)).to_have_value('2026-10-05')
    expect(page.locator('.mg-duty-day')).to_have_count(7)
    expect(page.locator('.mg-duty-card')).to_have_count(0)
    checks.append('navigation, week anchored Monday, seven days and empty state; no fabricated schedules')
    def new_shift(person='1',store='23',start='2026-10-05T08:00',end='2026-10-05T12:00'):
        page.get_by_role('button',name='Thêm ca trực',exact=True).click();dialog=page.get_by_role('dialog')
        dialog.get_by_label('Cơ sở của ca trực',exact=True).select_option(store)
        dialog.get_by_label('Nhân viên của ca trực',exact=True).select_option(person)
        expect(dialog.get_by_label('Nhân viên của ca trực',exact=True).locator('option[value="3"]')).to_have_count(0)
        dialog.get_by_label('Bắt đầu ca trực',exact=True).fill(start);dialog.get_by_label('Kết thúc ca trực',exact=True).fill(end)
        dialog.get_by_label('Tên ca trực',exact=True).fill('Ca QA');return dialog
    dialog=new_shift(end='2026-10-05T07:00')
    dialog.get_by_role('button',name='Lưu ca trực',exact=True).click();expect(dialog.get_by_role('alert')).to_contain_text('sau giờ bắt đầu');assert len(writes)==0
    dialog.get_by_label('Kết thúc ca trực',exact=True).fill('2026-10-05T12:00');dialog.get_by_role('button',name='Lưu ca trực',exact=True).click()
    expect(page.locator('.mg-duty-card')).to_have_count(1)
    expect(page.locator('.mg-duty-card')).to_contain_text('08:00 – 12:00')
    checks.append('create saves selected branch/staff/date/time; inactive staff excluded; reversed hours blocked before request')
    page.get_by_role('button',name='Sửa ca trực #1',exact=True).click();dialog=page.get_by_role('dialog')
    expect(dialog.get_by_label('Bắt đầu ca trực',exact=True)).to_have_value('2026-10-05T08:00')
    dialog.get_by_label('Kết thúc ca trực',exact=True).fill('2026-10-05T13:00');dialog.get_by_role('button',name='Lưu ca trực',exact=True).click()
    expect(page.locator('.mg-duty-card')).to_contain_text('08:00 – 13:00')
    mode['next']='conflict';page.get_by_role('button',name='Sửa ca trực #1',exact=True).click();dialog=page.get_by_role('dialog');dialog.get_by_role('button',name='Lưu ca trực',exact=True).click()
    expect(dialog.get_by_role('alert')).to_contain_text('đã thay đổi');expect(dialog.get_by_label('Tên ca trực',exact=True)).to_be_disabled()
    dialog.get_by_role('button',name='Làm mới lịch để kiểm tra',exact=True).click();expect(page.get_by_role('dialog')).to_have_count(0)
    checks.append('edit restores Vietnam hours and updates card; stale revision freezes input and refreshes without false success')
    mode['next']='overlap';dialog=new_shift(store='31');dialog.get_by_role('button',name='Lưu ca trực',exact=True).click();expect(dialog.get_by_role('alert')).to_contain_text('trùng giờ');assert len(rows)==1
    dialog.get_by_role('button',name='Đóng',exact=True).click()
    dialog=new_shift(person='2',store='31',start='2026-10-06T22:00',end='2026-10-07T06:00');dialog.get_by_role('button',name='Lưu ca trực',exact=True).click()
    expect(page.locator('.mg-duty-card')).to_have_count(3)
    expect(page.locator('.mg-duty-card').filter(has_text='Nhân viên QA B').first).to_contain_text('qua đêm')
    page.screenshot(path=str(output/'desktop-duty-roster.png'),full_page=True)
    page.get_by_label('Cơ sở lịch trực',exact=True).select_option('23');expect(page.locator('.mg-duty-card')).to_have_count(1)
    page.get_by_label('Cơ sở lịch trực',exact=True).select_option('all');expect(page.locator('.mg-duty-card')).to_have_count(3)
    page.get_by_label('Lọc nhân viên trực',exact=True).select_option('2');expect(page.locator('.mg-duty-card')).to_have_count(2)
    page.get_by_label('Lọc nhân viên trực',exact=True).select_option('')
    page.get_by_role('button',name='Tuần sau',exact=True).click();expect(page.get_by_label('Ngày trong tuần',exact=True)).to_have_value('2026-10-12');expect(page.locator('.mg-duty-card')).to_have_count(0)
    page.get_by_role('button',name='Tuần trước',exact=True).click();expect(page.locator('.mg-duty-card')).to_have_count(3)
    checks.append('server overlap shown without new shift; overnight appears on both days; branch/staff filters combine')
    page.set_viewport_size(dict(width=375,height=812))
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    expect(page.locator('.mg-duty-day')).to_have_count(7)
    page.screenshot(path=str(output/'mobile-duty-roster.png'),full_page=True)
    page.get_by_role('button',name='Xóa ca trực #1',exact=True).click();dialog=page.get_by_role('dialog');expect(dialog).to_contain_text('Nhân viên QA A');dialog.get_by_role('button',name='Đóng',exact=True).click();assert len(rows)==2
    page.get_by_role('button',name='Xóa ca trực #1',exact=True).click();page.get_by_role('dialog').get_by_role('button',name='Xác nhận xóa',exact=True).click();expect(page.get_by_role('button',name='Xóa ca trực #1',exact=True)).to_have_count(0)
    checks.append('375px stacked week fits viewport; explicit delete confirmation, cancel preserves shift, confirmed delete updates roster')
    mode['next']='lost';dialog=new_shift(person='1',start='2026-10-09T08:00',end='2026-10-09T12:00');dialog.get_by_role('button',name='Lưu ca trực',exact=True).click();expect(dialog.get_by_label('Tên ca trực',exact=True)).to_be_disabled();expect(dialog.get_by_text('Làm mới lịch để kiểm tra ca đã lưu',exact=False)).to_be_visible()
    dialog.get_by_role('button',name='Làm mới lịch để kiểm tra',exact=True).click();expect(page.locator('.mg-duty-card')).to_have_count(3)
    mode['read_error']=True;page.get_by_role('button',name='Làm mới',exact=True).click();expect(page.locator('.mg-duty-page').get_by_role('alert')).to_contain_text('Không tải được');expect(page.get_by_role('button',name='Thêm ca trực',exact=True)).to_be_disabled();expect(page.locator('.mg-duty-card')).to_have_count(0)
    mode['read_error']=False;page.get_by_role('button',name='Thử lại',exact=True).click();expect(page.locator('.mg-duty-card')).to_have_count(3)
    checks.append('lost response locks form and requires read before continuing; failed GET clears stale rows, disables writes, recovers on retry')
    assert not unexpected,unexpected;assert not errors,errors
    report=dict(passed=len(checks),checks=checks,jsErrors=errors,unexpected=unexpected,operationalWrites=0)
    (output/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=False,indent=2));browser.close()
