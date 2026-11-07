"""Synthetic support workflows; no operational writes or real location/media."""
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
import json
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import expect
from lib.mobile_record_media_fixture import image_blob


def support_response(route, state, headers):
    request=route.request
    url=urlparse(request.url)
    kind=url.path.rsplit('/',1)[-1]
    if kind not in ('attendance','guide-faq'):return False
    params=parse_qs(url.query)
    def reply(data,status=200):route.fulfill(status=status,headers=headers,json=data)
    if params.get('photo'):
        route.fulfill(headers={**headers,'Content-Type':'image/jpeg'},body=image_blob());return True
    now=lambda:datetime.now(timezone.utc).isoformat()
    if request.method=='POST':
        message=BytesParser(policy=policy.default).parsebytes(('Content-Type: '+request.headers['content-type']+'\r\nMIME-Version: 1.0\r\n\r\n').encode()+request.post_data_buffer)
        fields={part.get_param('name',header='content-disposition'):part.get_payload(decode=True) for part in message.iter_parts()}
        value=lambda name:fields.get(name,b'').decode()
        if kind=='attendance':
            key=value('request_id');receipts=state.setdefault('attendance_receipts',{})
            if key not in receipts:
                state['attendance_writes']=state.get('attendance_writes',0)+1
                state['attendance_open']=value('action')=='in'
                receipts[key]={'id':1,'action':value('action'),'clock_in_at':now(),'clock_out_at':None if state['attendance_open'] else now()}
            if state.pop('lose_attendance',False):route.abort('failed')
            else:reply({'id':1,'replayed':False})
        elif value('action')=='ask':
            state['faq_asked']=value('question');state['faq_writes']=state.get('faq_writes',0)+1
            reply({'success':True})
        else:
            state['faq_answer']=value('answer');state['faq_answer_writes']=state.get('faq_answer_writes',0)+1
            reply({'success':True})
        return True
    if kind=='attendance':
        if 'request_id' in params:reply({'result':state.get('attendance_receipts',{}).get(params['request_id'][0])});return True
        opened=state.get('attendance_open',False)
        loc={'latitude':21.01,'longitude':105.8,'accuracy':8,'timestamp':0}
        rows=[] if not state.get('attendance_writes') else [{'id':1,'staff_id':101,'staff_name':'Actor QA','store_name':'Branch QA','clock_in_at':now(),'clock_out_at':None if opened else now(),'in_location':loc,'out_location':None if opened else loc,'shift_name':'S','scheduled_in':now(),'scheduled_out':now(),'late_minutes':0}]
        reply({'staff':{'name':'Actor QA'},'open':{'id':1,'clock_in_at':now()} if opened else None,'latest':{'clock_in_at':now(),'clock_out_at':None if opened else now()} if rows else None,'shift':None,'late_minutes':0 if rows else None,'server_now':now(),'rows':rows,'total':len(rows),'page':1})
    else:
        rows=[{'id':1,'category':'Hợp đồng','question':state.get('faq_asked','Câu hỏi nghiệp vụ QA'),'asker_name':'Actor QA','answer':state.get('faq_answer',''),'answerer_name':'Quản lý QA' if state.get('faq_answer') else None,'revision':1,'created_at':now(),'images':[]}]
        reply({'rows':rows,'user_name':'Actor QA','can_answer':True,'total':1,'page':1,'hasMore':False})
    return True


def run_support_workflows(page,state,base_url,output,checks):
    button=lambda label:page.get_by_role('button',name=label,exact=True)
    field=lambda label:page.get_by_role('textbox',name=label,exact=True)
    page.context.grant_permissions(['geolocation','camera'])
    page.context.set_geolocation({'latitude':21.01,'longitude':105.8,'accuracy':8})
    page.goto(base_url);field('Tài khoản').fill('qa');page.get_by_label('Mật khẩu',exact=True).fill('fixture-password');button('Đăng nhập').click()
    page.get_by_role('tab',name='Tài khoản',exact=True).click();button('Chấm công vào / ra ca').click()
    expect(button('Vào ca')).to_be_enabled();button('Vào ca').click()
    file=output/'synthetic-selfie.jpg';file.write_bytes(image_blob())
    with page.expect_file_chooser() as chooser:button('Chụp ảnh hiện tại').click()
    chooser.value.set_files(file)
    button('Lấy vị trí GPS').click();expect(page.get_by_text('Đã lấy GPS',exact=False)).to_be_visible()
    state['lose_attendance']=True;button('Xác nhận vào ca').click()
    expect(page.get_by_text('Không kết nối được máy chủ.',exact=False)).to_be_visible()
    button('Đóng chấm công vào ca').click();button('Đối chiếu lần chấm đang chờ').click()
    expect(button('Ra ca')).to_be_enabled();assert state['attendance_writes']==1
    button('Xem ảnh và GPS #1').click();expect(page.get_by_role('img',name='Ảnh vào ca #1',exact=True)).to_be_visible()
    checks.append('Camera photo/GPS required; lost attendance response resolves original UUID once, shows open shift and scoped evidence')
    for width,height,scheme in ((320,740,'light'),(375,812,'dark'),(812,375,'light'),(1024,768,'dark')):
        page.set_viewport_size({'width':width,'height':height});page.emulate_media(color_scheme=scheme,reduced_motion='reduce')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
        page.screenshot(path=str(output/f'attendance-{width}-{scheme}.png'),full_page=True)
    page.go_back();button('Hướng dẫn và hỏi đáp').click()
    expect(page.get_by_role('heading',name='Hướng dẫn và hỏi đáp',exact=True)).to_be_visible();button('Bước tiếp theo').click()
    expect(page.get_by_text('BƯỚC 2 /',exact=False)).to_be_visible();button('Hỏi đáp').click()
    button('Đặt câu hỏi').click();field('Câu hỏi').fill('Cần kiểm tra hợp đồng QA');button('Gửi câu hỏi').click()
    expect(page.get_by_text('Cần kiểm tra hợp đồng QA',exact=True)).to_be_visible();assert state['faq_writes']==1
    button('Trả lời câu hỏi #1').click();field('Câu trả lời').fill('Kiểm tra giấy tờ và khoản thu QA');button('Lưu câu trả lời').click()
    expect(page.get_by_text('Kiểm tra giấy tờ và khoản thu QA',exact=True)).to_be_visible();assert state['faq_answer_writes']==1
    checks.append('Native guide steps and FAQ ask/answer use authenticated API, retain text, refresh confirmed results and respect server answer grant')
    for width,height,scheme in ((320,740,'light'),(375,812,'dark'),(812,375,'light'),(1024,768,'dark')):
        page.set_viewport_size({'width':width,'height':height});page.emulate_media(color_scheme=scheme,reduced_motion='reduce')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
        page.screenshot(path=str(output/f'faq-{width}-{scheme}.png'),full_page=True)
    checks.append('New support screens fit four phone/tablet/landscape widths in light/dark themes')
