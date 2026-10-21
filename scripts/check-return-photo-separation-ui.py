"""Photo saves never return a vehicle; completed returns accept more evidence.

All API and Cloudinary writes are intercepted. No real business data changes.
"""
import argparse
import json
import re
import struct
import zlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3018')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--output', default='.backups/return-photo-separation-20261021/ui')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
expect.set_options(timeout=30000)
state, posts, errors, checks = {}, [], [], []
now = datetime.now(timezone(timedelta(hours=7)))
start, end = (now-timedelta(days=1)).isoformat(), (now+timedelta(days=1)).isoformat()


def chunk(kind, data):
    return struct.pack('!I', len(data))+kind+data+struct.pack('!I', zlib.crc32(kind+data) & 0xffffffff)


pixel = b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR', struct.pack('!IIBBBBB', 16, 16, 8, 2, 0, 0, 0))+chunk(b'IDAT', zlib.compress((b'\x00'+bytes([216, 234, 242])*16)*16))+chunk(b'IEND', b'')
vehicle = dict(id=245, name='Airblade QA', license='QA-141.53', store_id=23, status='ready', available=True, rental_blockers=[])


def mock(route):
    if mock_contract_type_read(route):
        return
    req = route.request
    path = urlparse(req.url).path
    completed = state['completed']
    status = 'completed' if completed else 'renting'
    if path.startswith('/api/auth/record-photos/contracts/901/'):
        slot = path.split('/')[-1]
        if req.method == 'PUT':
            state['photos'][slot] = 'image/jpeg'
            route.fulfill(json=dict(status='success', data={}))
        else:
            assert req.method == 'GET'
            route.fulfill(body=pixel, content_type='image/png')
        return
    if path == '/api/auth/photo-uploads/sign':
        assert req.method == 'POST'
        route.fulfill(json=dict(status='success', data=dict(cloud_name='qa', api_key='qa', signature='qa', params=dict(public_id='qa/'+req.post_data_json['upload_id'], timestamp=1))))
        return
    if path == '/api/auth/returns' and req.method == 'POST':
        assert not completed, 'Supplementing a completed return must not post a return'
        posts.append(req.post_data_json)
        route.fulfill(json=dict(status='success', data=[dict(item_id=101, contract_code='QA-RETURN', status='completed', fee=0)]))
        return
    assert req.method == 'GET', req.method+' '+path
    if path == '/api/auth/stores':
        data = [dict(id=33, store_name='CS Hà Đông QA', status='opening')]
    elif path == '/api/auth/order/car-rental':
        data = [dict(id=901, contract_number='QA-RETURN', order_status=status, store_id=33, customer_name='Khách QA', total_amount=300000, paid_amount=300000, created_at=start, start_date=start, end_date=end, vehicles=[vehicle])]
    elif path == '/api/auth/returns':
        data = [dict(item_id=101, order_id=901, contract_code='QA-RETURN', order_status=status, customer_name='Khách QA', customer_id_card='', vehicle_id=245, vehicle_name='Airblade QA', license='QA-141.53', store_id=33, store_name='CS Hà Đông QA', scheduled_start_at=start, scheduled_return_at=end, completed_at=now.isoformat() if completed else None, item_revision='1', order_revision='1', total_amount=300000, paid_amount=300000, overdue=False, daily_price=150000, deposit_paid=0, deposit_held=0)]
    elif path.endswith('/payments'):
        data = dict(id=901, code='QA-RETURN', status=status, store_id=33, revision='1', total_amount=300000, paid_amount=300000, remaining=0, deposit_paid=0, deposit_refunded=0, deposit_held=0, accounts=[], history=[], items=[])
    elif path.endswith('/telegram'):
        data = dict(auto_enabled=False, events=[])
    elif path == '/api/auth/record-photos/contracts/901':
        data = [dict(slot=slot, mime_type=mime, updated_at=now.isoformat()) for slot, mime in state['photos'].items()]
    elif path == '/api/auth/vehicles/inventory':
        data = [vehicle]
    elif path == '/api/auth/gps/selected':
        data = dict(devices=[], events=[])
    else:
        data = []
    route.fulfill(json=dict(status='success', data=data))


def cloud(route):
    public_id = re.search(r'name="public_id"\r\n\r\n([^\r]+)', route.request.post_data_buffer.decode('latin1')).group(1)
    route.fulfill(json=dict(public_id=public_id, version=1, signature='qa'))


def save_photo(dialog):
    field = dialog.get_by_role('group', name='Toàn cảnh xe', exact=True)
    field.get_by_label('Chọn ảnh Toàn cảnh xe', exact=True).set_input_files(dict(name='qa.png', mimeType='image/png', buffer=pixel))
    save = dialog.get_by_role('button', name='Lưu ảnh / video', exact=True)
    expect(save).to_be_enabled()
    save.click()
    expect(dialog.get_by_text('Đã lưu ảnh.', exact=True)).to_be_visible()
    assert 'return-101-1' in state['photos']


with sync_playwright() as pw:
    for name, width, height in [('chromium', 1440, 1000), ('webkit', 390, 844)]:
        browser = getattr(pw, name).launch()
        ctx = browser.new_context(viewport=dict(width=width, height=height), timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
        ctx.add_init_script("""const qaFetch=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/auth/payment-events')return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return qaFetch.call(this,input,options);};""")
        ctx.add_cookies([dict(name='himoto_management_session', value=Path(args.session_cookie_file).read_text().strip(), url=args.url, httpOnly=True, sameSite='Strict')])
        ctx.route('**/api/**', mock)
        ctx.route('https://api.cloudinary.com/**', cloud)
        page = ctx.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        state.clear()
        state.update(completed=False, photos={})
        before = len(posts)
        page.goto(args.url+'/contracts?action=return&query=QA-141.53', wait_until='networkidle', timeout=120000)
        dialog = page.get_by_role('dialog', name='Trả xe', exact=True)
        expect(dialog.get_by_role('region', name='Thu phí và hoàn cọc')).to_be_visible()
        dialog.locator('#contract-return-hourly-rate').press('Enter')
        dialog.locator('form').evaluate("form => form.dispatchEvent(new SubmitEvent('submit', {bubbles:true,cancelable:true}))")
        save_photo(dialog)
        assert len(posts) == before
        expect(dialog.get_by_role('button', name='Xác nhận trả 1 xe', exact=True)).to_be_visible()
        checks.append(name+': Enter, implicit submit and photo save leave the rental open')
        dialog.screenshot(path=str(out/f'{name}-photo-saved-still-renting.png'))
        dialog.get_by_role('button', name='Xác nhận trả 1 xe', exact=True).click()
        expect(dialog).to_contain_text('Đã trả xe hợp đồng QA-RETURN')
        assert len(posts) == before+1
        checks.append(name+': explicit confirmation records exactly one return')

        state.update(completed=True, photos={})
        page.goto(args.url+'/contracts?contract_id=901', wait_until='networkidle', timeout=120000)
        page.locator('button.mg-row-menu-trigger').filter(visible=True).first.click()
        page.get_by_role('menuitem', name='Xem chi tiết', exact=True).click()
        detail = page.get_by_role('dialog', name='Chi tiết hợp đồng:', exact=False)
        detail.get_by_role('button', name='Bổ sung ảnh trả xe', exact=True).click()
        dialog = page.get_by_role('dialog', name='Trả xe · QA-RETURN', exact=True)
        expect(dialog).to_contain_text('Tất cả xe trong hợp đồng đã được trả')
        expect(dialog.get_by_role('button', name='Xác nhận trả 1 xe', exact=True)).to_have_count(0)
        save_photo(dialog)
        assert len(posts) == before+1
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        dialog.screenshot(path=str(out/f'{name}-completed-return-photo-supplement.png'))
        checks.append(name+': completed contract accepts return photos without a new return or settlement')
        ctx.unroute_all(behavior='wait')
        ctx.close()
        browser.close()

assert not errors, errors
report = dict(passed=len(checks), checks=checks, javascriptErrors=errors, simulatedReturns=len(posts), realBusinessWrites=0, realTelegramRequests=0)
(out/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
