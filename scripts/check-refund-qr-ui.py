"""Synthetic QR only. Every API write is intercepted; never return/refund a real contract."""
import argparse,json
from datetime import datetime,timedelta,timezone
from pathlib import Path
from urllib.parse import urlparse,parse_qs
import qrcode
from PIL import Image,ImageDraw,ImageFont
from playwright.sync_api import sync_playwright,expect
from lib.contract_type_fixtures import mock_contract_type_read

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3014');p.add_argument('--cookie-file',required=True);p.add_argument('--output',default='.backups/refund-qr-20261021/ui');a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True);expect.set_options(timeout=30000)
def tlv(key,value):return key+str(len(value)).zfill(2)+value
value='000201010211'+tlv('38',tlv('00','A000000727')+tlv('01',tlv('00','970422')+tlv('01','000123456789'))+tlv('02','QRIBFTTA'))+'53037045802VN6304'
crc=0xffff
for byte in value.encode():
    crc^=byte<<8
    for _ in range(8):crc=((crc<<1)^0x1021 if crc&0x8000 else crc<<1)&0xffff
qr=qrcode.make(value+f'{crc:04X}').convert('RGB');image=Image.new('RGB',(850,1100),'white');image.paste(qr,((850-qr.width)//2,25))
draw=ImageDraw.Draw(image);font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',34)
for n,line in enumerate(['MBBank','000123456789','NGUYEN VAN QA']):draw.text((75,850+n*65),line,fill='black',font=font)
fixture=out/'synthetic-recipient.png';image.save(fixture)
noqr=out/'synthetic-text.png';textimage=Image.new('RGB',(850,400),'white');d=ImageDraw.Draw(textimage)
for n,line in enumerate(['MBBank','000123456789','NGUYEN VAN QA']):d.text((75,75+n*65),line,fill='black',font=font)
textimage.save(noqr)
state={};errors=[];unexpected=[];checks=[];posts=[]
now=datetime.now(timezone(timedelta(hours=7)));start=(now-timedelta(days=1)).isoformat();end=(now+timedelta(hours=1)).isoformat()
fields=dict(recipient_bank='MB Bank',recipient_account='000123456789',recipient_name='NGUYEN VAN QA')
def mock(route):
    if mock_contract_type_read(route):return
    req=route.request;path=urlparse(req.url).path;query=parse_qs(urlparse(req.url).query)
    if req.method=='PUT' and path=='/api/auth/record-photos/contracts/901/return-101-document-2':
        assert req.headers['content-type']=='image/jpeg'
        # WebKit does not expose the body of a fetch whose body is a File.
        if req.post_data_buffer is not None:assert req.post_data_buffer[:3]==bytes([255,216,255])
        state['uploads']+=1
        if state['case']=='upload-error':route.fulfill(status=503,json=dict(status='error',message='QA chưa lưu được ảnh'));return
        state['saved']=True;route.fulfill(json=dict(status='success'));return
    if req.method=='DELETE' and path=='/api/auth/record-photos/contracts/901/return-101-document-2':
        state['saved']=False;route.fulfill(json=dict(status='success'));return
    if req.method=='POST' and path.endswith('/refund-qr'):
        state['reads']+=1
        if state['case']=='manual-inflight':state['held']=route;return
        if state['case']=='ai-unavailable':route.fulfill(status=503,json=dict(status='error',message='QA AI tạm thời bận'));return
        route.fulfill(json=dict(status='success',data=dict(fields=fields)));return
    if req.method=='POST' and path=='/api/auth/returns' and state.get('confirm'):
        body=req.post_data_json;posts.append(body);settlement=body['settlements'][0]
        if state['case']=='deferred':assert settlement['refund_deferred'] and 'refund' not in settlement;assert settlement['refund_recipient']['account']=='000123456789'
        else:assert settlement['refund']['recipient_account']=='000123456789' and settlement['refund']['recipient_name']=='NGUYEN VAN QA'
        route.fulfill(json=dict(status='success',data=[dict(item_id=101,contract_code='QA-RETURN',status='completed',fee=0)]));return
    if req.method!='GET':unexpected.append(req.method+' '+path);route.abort();return
    if path=='/api/auth/order/car-rental' and query.get('table')==['1']:
        data=dict(rows=[],total=0,scopeCount=0,tabCount=0,page=1,pages=1,statusCounts=[],statuses=[],dueCount=0,summary=dict(contractCount=0,blacklistCount=0,totalAmount=0,receivableAmount=0,badDebtAmount=0))
    elif path=='/api/auth/stores':data=[dict(id=32,store_name='CS QA',kind='physical',status='opening')]
    elif path=='/api/auth/returns':data=[dict(item_id=101,order_id=901,contract_code='QA-RETURN',order_status='renting',customer_name='Khách QA',customer_id_card='',vehicle_id=700,vehicle_name='Wave QA',license='QA-358.49',store_id=32,store_name='CS QA',scheduled_start_at=start,scheduled_return_at=end,completed_at=None,item_revision='1',order_revision='1',total_amount=420000,paid_amount=420000,overdue=False,daily_price=140000,deposit_paid=1000000,deposit_held=1000000)]
    elif path.endswith('/payments'):data=dict(id=901,code='QA-RETURN',status='renting',store_id=32,revision='1',total_amount=420000,paid_amount=420000,remaining=0,deposit_paid=1000000,deposit_refunded=0,deposit_held=1000000,company_paid_amount=0,company_payment_count=0,accounts=[] if state['case']=='deferred' else [dict(id=15,kind='bank',store_id=32,owner_type='personal',label='TK cá nhân chi hoàn QA')],history=[],items=[])
    elif path.endswith('/telegram'):data=dict(auto_enabled=False,events=[])
    elif path=='/api/auth/record-photos/contracts/901':data=[dict(slot='return-101-document-2',mime_type='image/jpeg',updated_at=now.isoformat())] if state['saved'] else []
    elif path=='/api/auth/record-photos/contracts/901/return-101-document-2':route.fulfill(body=fixture.read_bytes(),content_type='image/png');return
    else:data=[]
    route.fulfill(json=dict(status='success',data=data))

with sync_playwright() as pw:
    for name,width,height in [('chromium',1440,1000),('webkit',390,844)]:
        browser=getattr(pw,name).launch();ctx=browser.new_context(viewport=dict(width=width,height=height),timezone_id='Asia/Ho_Chi_Minh',reduced_motion='reduce')
        ctx.add_init_script("""const qaFetch=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/auth/payment-events')return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return qaFetch.call(this,input,options);};""")
        ctx.add_cookies([dict(name='himoto_management_session',value=Path(a.cookie_file).read_text().strip(),url=a.url,httpOnly=True,sameSite='Strict')]);ctx.route('**/api/**',mock)
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        for case in ['qr-success','text-only','ai-unavailable','manual-inflight','upload-error','reread','deferred']:
            state.clear();state.update(case=case,saved=case=='reread',uploads=0,reads=0,held=None,confirm=False)
            before=len(posts);page.goto(a.url+'/contracts?action=return&query=QA-358.49',wait_until='networkidle',timeout=90000)
            dialog=page.get_by_role('dialog',name='Trả xe',exact=True);section=dialog.get_by_role('region',name='Thu phí và hoàn cọc',exact=True)
            section.get_by_label('Chưa hoàn cọc' if case=='deferred' else 'Đã hoàn cọc cho khách',exact=case!='deferred').check()
            widget=section.locator('[aria-label="Quét ảnh QR nhận hoàn cọc"]')
            submit=dialog.get_by_role('button',name='Xác nhận trả 1 xe',exact=True)
            if case=='reread':widget.get_by_role('button',name='Đọc lại ảnh QR đã lưu').click()
            else:widget.get_by_label('Chọn ảnh QR nhận hoàn cọc',exact=True).set_input_files(str(noqr if case=='text-only' else fixture))
            if case=='manual-inflight':
                expect(widget).to_have_attribute('aria-busy','true');expect(widget).to_contain_text('Đang đọc QR')
                section.locator('#return-901-recipient_account').fill('009999999');section.locator('#return-901-recipient_name').fill('TEN GO TAY')
                expect(submit).to_be_disabled();expect(dialog.locator('.mg-dialog-footer')).to_contain_text('Đang lưu / đọc ảnh QR');assert len(posts)==before
                assert state['held'];state['held'].fulfill(json=dict(status='success',data=dict(fields=fields)))
            expect(widget).to_have_attribute('aria-busy','false')
            assert len(posts)==before
            if case=='upload-error':
                expect(widget).to_contain_text('QA chưa lưu được ảnh');assert not state['saved'] and state['reads']==0
                expect(section.locator('#return-901-recipient_account')).to_have_value('')
                # QR is optional: a failed optional upload must not invent a return
                # or prevent staff from confirming an otherwise valid refund.
                expect(submit).to_be_enabled();assert len(posts)==before
            elif case=='manual-inflight':
                expect(section.locator('#return-901-recipient_account')).to_have_value('009999999');expect(section.locator('#return-901-recipient_name')).to_have_value('TEN GO TAY')
            else:
                expect(section.locator('#return-901-recipient_account')).to_have_value('000123456789')
                expect(section.locator('#return-901-recipient_bank')).to_have_value('MB Bank' if case=='text-only' else 'MBBank')
                expect(section.locator('#return-901-recipient_name')).to_have_value('' if case=='ai-unavailable' else 'NGUYEN VAN QA')
                assert state['saved'] and state['reads']==1 and state['uploads']==(0 if case=='reread' else 1)
            widget.scroll_into_view_if_needed();assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
            page.screenshot(path=str(out/f'{name}-{case}.png'))
            if case in ['qr-success','deferred']:
                state['confirm']=True;submit.click();expect(dialog).to_contain_text('Đã trả xe hợp đồng QA-RETURN');assert len(posts)==before+1
                dialog.get_by_role('button',name='Đóng',exact=True).click()
            else:dialog.get_by_role('button',name='Hủy',exact=True).click()
            checks.append(dict(browser=name,case=case,passed=True))
        ctx.unroute_all(behavior='ignoreErrors');ctx.close();browser.close()
assert not errors,errors
assert not unexpected,unexpected
report=dict(checks=checks,javascriptErrors=errors,interceptedReturnPosts=len(posts),realBusinessWrites=0,realTelegramRequests=0)
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False))
