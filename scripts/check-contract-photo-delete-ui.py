"""Saved contract media deletion. All API writes are fixtures; no real deletion/Telegram."""
import argparse, json, struct, zlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from lib.contract_type_fixtures import mock_contract_type_read

p = argparse.ArgumentParser()
p.add_argument('--url', default='http://127.0.0.1:3022')
p.add_argument('--cookies', default='.backups/contract-photo-delete-20261024')
p.add_argument('--output', default='.backups/contract-photo-delete-20261024/ui')
p.add_argument('--expect-missing', action='store_true')
p.add_argument('--expect-role-block', action='store_true')
a = p.parse_args()
out = Path(a.output)
out.mkdir(parents=True, exist_ok=True)
expect.set_options(timeout=30000)
state, checks, errors, mutations, unexpected, held = {}, [], [], [], [], []
now = datetime.now(timezone(timedelta(hours=7)))
labels = ['Toàn cảnh xe', 'Đầu xe', 'Đuôi xe', 'Bên trái']


def chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)


pixel = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!IIBBBBB', 16, 16, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress((b'\x00' + bytes([220, 230, 240]) * 16) * 16)) + chunk(b'IEND', b'')


def event():
    photos = [photo for photo in state['photos'] if photo['slot'].startswith('renewal-2-')]
    changed = len(photos) != 4
    return dict(key='renewal:901:2', kind='renewal', label='Gia hạn v2 · QA-901', phases=['renewal-2'], text='HỢP ĐỒNG QA-DELETE\nGIA HẠN ĐÃ HOÀN TẤT', hash=('a' if not changed else 'b') * 64,
                photo_count=len(photos), video_count=0, status='sent', sent_at=now.isoformat(), can_send=changed, unchanged=not changed,
                attachments=[dict(slot=photo['slot'], mime_type='image/jpeg', label='Gia hạn v2 · ' + labels[int(photo['slot'].split('-')[-1]) - 1]) for photo in photos])


def mock(route):
    if mock_contract_type_read(route):
        return
    req = route.request
    path = urlparse(req.url).path
    prefix = '/api/auth/record-photos/contracts/901/'
    if req.method == 'POST' and path == prefix[:-1]:
        route.fulfill(json=dict(status='success', data=dict(copied=0)))
        return
    if req.method == 'DELETE' and path.startswith(prefix):
        mutations.append(path)
        if state.get('fail_delete'):
            route.fulfill(status=503, json=dict(status='error', message='QA chưa xóa được ảnh; thử lại'))
        elif state.get('hold_delete'):
            held.append(route)
        else:
            state['photos'] = [photo for photo in state['photos'] if photo['slot'] != path.split('/')[-1]]
            route.fulfill(json=dict(status='success'))
        return
    if req.method != 'GET':
        unexpected.append(req.method + ' ' + path)
        route.abort()
        return
    if path.startswith(prefix):
        route.fulfill(body=pixel, content_type='image/png')
        return
    if path == '/api/auth/order/car-rental/901/telegram':
        if state.get('fail_refresh'):
            state['fail_refresh'] = False
            route.fulfill(status=503, json=dict(status='error', message='QA không tải được nội dung mới'))
            return
        data = dict(auto_enabled=False, next_renewal_version=3, events=[event()])
        if state.get('sending'):
            data['events'][0].update(status='pending', can_send=False)
    elif path == '/api/auth/record-photos/contracts/901':
        data = state['photos']
    elif path == '/api/auth/order/car-rental':
        data = [dict(id=901, contract_number='QA-DELETE', order_status=state['status'], order_type='daily', store_id=state['store_id'], store_name='CS QA', customer_name='Khách QA', total_amount=200000, paid_amount=200000,
                     created_at=now.isoformat(), start_date=(now-timedelta(days=2)).isoformat(), end_date=(now-timedelta(days=1)).isoformat())]
    elif path in ['/api/auth/stores', '/api/auth/store-directory']:
        data = [dict(id=state['store_id'], store_name='CS QA', status='opening')]
    else:
        data = []
    route.fulfill(json=dict(status='success', data=data))


def open_detail(page):
    page.goto(a.url + '/contracts?contract_id=901', wait_until='networkidle', timeout=90000)
    page.locator('button.mg-row-menu-trigger').filter(visible=True).first.click()
    page.get_by_role('menuitem', name='Xem chi tiết', exact=True).click()
    return page.get_by_role('dialog', name='Chi tiết hợp đồng: QA-DELETE', exact=True)


def reset(status='overdue'):
    store_id = state.get('store_id', 32)
    state.clear()
    state.update(store_id=store_id, status=status, photos=[dict(slot=f'renewal-2-{i+1}', mime_type='image/jpeg', updated_at=now.isoformat()) for i in range(4)] + [
        dict(slot='return-101-video-1', mime_type='video/mp4', updated_at=now.isoformat()),
        dict(slot='return-101-document-1', mime_type='image/jpeg', updated_at=now.isoformat()),
        dict(slot='rental-document-1', mime_type='image/jpeg', updated_at=now.isoformat())])


with sync_playwright() as pw:
    profiles = [('admin', 'chromium', 1440, 950), ('branch_staff', 'webkit', 390, 844), ('branch_staff', 'chromium', 844, 390), ('accounting', 'chromium', 1440, 950), ('ownership_staff', 'webkit', 390, 844)]
    if a.expect_missing:
        profiles = profiles[:1]
    elif a.expect_role_block:
        profiles = [profile for profile in profiles if profile[0] in ['accounting','ownership_staff']]
    for role, engine, width, height in profiles:
        browser = getattr(pw, engine).launch()
        ctx = browser.new_context(viewport=dict(width=width, height=height), timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
        # Keep unrelated payment polling in-memory, including during WebKit teardown.
        # This is the same empty fixture as the API mock, with no real payment reads.
        ctx.add_init_script("""const qaFetch=window.fetch;window.fetch=function(input,options){const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/auth/payment-events')return Promise.resolve(new Response(JSON.stringify({status:'success',data:[]}),{headers:{'Content-Type':'application/json'}}));return qaFetch.call(this,input,options);};""")
        ctx.add_cookies([dict(name='himoto_management_session', value=Path(a.cookies, f'session-{role}.txt').read_text().strip(), url=a.url, httpOnly=True, sameSite='Strict')])
        ctx.route('**/api/**', mock)
        page = ctx.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        reset()
        profiles_by_role = {profile['role']: profile for profile in json.loads(Path(a.cookies, 'profiles.json').read_text(encoding='utf-8'))}
        state['store_id'] = profiles_by_role[role]['store_id'] or 32
        detail = open_detail(page)
        detail.get_by_role('tab', name='Telegram', exact=True).click()
        gallery = detail.get_by_label('Toàn bộ ảnh và video sẽ gửi', exact=True)
        expect(gallery.locator('img')).to_have_count(4)
        delete = gallery.get_by_role('button', name='Xóa ảnh Gia hạn v2 · Toàn cảnh xe', exact=True)
        if a.expect_missing:
            expect(delete).to_have_count(0)
            checks.append('Reproduced on previous release: four saved renewal photos, no delete action in the Telegram preview')
            detail.get_by_role('tab', name='Ảnh thuê / trả xe', exact=True).click()
            expect(detail.locator('.mg-transaction-photo-gallery img')).to_have_count(6)
            expect(detail.locator('.mg-transaction-photo-gallery').get_by_role('button', name='Xóa', exact=False)).to_have_count(0)
            checks.append('Reproduced on previous release: saved renewal/return gallery also has no delete action')
        elif a.expect_role_block:
            expect(delete).to_have_count(0)
            checks.append(role+': reproduced missing renewal delete button under the previous phase permission')
        else:
            expect(delete).to_be_visible()
            box = delete.bounding_box()
            assert box['height'] >= 44 and box['width'] >= 44
            before = len(mutations)
            page.once('dialog', lambda dialog: dialog.dismiss())
            delete.click()
            assert len(mutations) == before
            expect(gallery.locator('img')).to_have_count(4)
            checks.append(f'{engine} {width}: visible touch target; cancel leaves saved media unchanged')

            state['fail_delete'] = True
            page.once('dialog', lambda dialog: dialog.accept())
            delete.click()
            expect(gallery.get_by_role('alert')).to_contain_text('QA chưa xóa được ảnh')
            expect(gallery.locator('img')).to_have_count(4)
            expect(delete).to_be_enabled()
            checks.append(f'{engine} {width}: server error keeps the photo and permits retry')

            state.update(fail_delete=False, hold_delete=True)
            page.once('dialog', lambda dialog: dialog.accept())
            before = len(mutations)
            delete.evaluate('(button)=>{button.click();button.click();}')
            expect(delete).to_be_disabled()
            page.wait_for_timeout(100)
            assert len(mutations) == before + 1 and len(held) == 1
            expect(detail.get_by_role('button', name='Làm mới nội dung và ảnh', exact=True)).to_be_disabled()
            state['photos'] = [photo for photo in state['photos'] if photo['slot'] != 'renewal-2-1']
            held.pop().fulfill(json=dict(status='success'))
            state['hold_delete'] = False
            expect(gallery.locator('img')).to_have_count(3)
            expect(delete).to_have_count(0)
            expect(detail.get_by_role('button', name='Gửi toàn bộ Telegram', exact=False)).to_contain_text('3 ảnh')
            assert not unexpected
            gallery.scroll_into_view_if_needed()
            page.screenshot(path=str(out/f'{role}-{engine}-{width}-renewal-deleted.png'))
            checks.append(f'{role} {engine} {width}: duplicate click issues one DELETE; refresh updates count/hash without sending Telegram')

            detail.get_by_role('tab', name='Ảnh thuê / trả xe', exact=True).click()
            all_media = detail.locator('.mg-transaction-photo-gallery')
            expect(all_media.get_by_role('button', name='Xóa ảnh Gia hạn v2 · Toàn cảnh xe', exact=True)).to_have_count(0)
            video_delete = all_media.get_by_role('button', name='Xóa video Trả xe · Video 1', exact=True)
            page.once('dialog', lambda dialog: dialog.accept())
            video_delete.click()
            expect(video_delete).to_have_count(0)
            expect(all_media.get_by_role('button', name='Xóa ảnh Trả xe · Ảnh hợp đồng khi trả xe', exact=True)).to_be_visible()
            assert len([photo for photo in state['photos'] if photo['slot'].startswith('renewal-2-')]) == 3
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
            checks.append(f'{engine} {width}: gallery deletes only the selected media slot; no horizontal overflow')

            reset('completed')
            detail = open_detail(page)
            detail.get_by_role('tab', name='Telegram', exact=True).click()
            completed_delete = detail.get_by_role('button', name='Xóa ảnh Gia hạn v2 · Bên trái', exact=True)
            page.once('dialog', lambda dialog: dialog.accept())
            completed_delete.click()
            expect(completed_delete).to_have_count(0)
            checks.append(f'{engine} {width}: completed contract permits deleting previously saved renewal photos')

            state['fail_refresh'] = True
            page.once('dialog', lambda dialog: dialog.accept())
            detail.get_by_role('button', name='Xóa ảnh Gia hạn v2 · Đầu xe', exact=True).click()
            expect(detail.get_by_role('alert')).to_contain_text('QA không tải được nội dung mới')
            expect(detail.get_by_role('button', name='Gửi toàn bộ Telegram', exact=False)).to_have_count(0)
            detail.get_by_role('button', name='Làm mới nội dung và ảnh', exact=True).click()
            expect(detail.get_by_label('Toàn bộ ảnh và video sẽ gửi', exact=True).locator('img')).to_have_count(2)
            checks.append(f'{engine} {width}: refresh failure after successful delete hides stale send controls; retry restores the correct count')

            state['sending'] = True
            detail.get_by_role('button', name='Làm mới nội dung và ảnh', exact=True).click()
            expect(detail.get_by_role('button', name='Xóa ảnh Gia hạn v2 · Toàn cảnh xe', exact=True)).to_be_disabled()
            checks.append(f'{engine} {width}: media cannot be deleted from the Telegram preview while a send is pending')
        ctx.unroute_all(behavior='ignoreErrors')
        ctx.close()
        browser.close()

assert not errors, errors
assert not unexpected, unexpected
report = dict(passed=len(checks), checks=checks, javascriptErrors=errors, interceptedDeletes=len(mutations), realBusinessWrites=0, realTelegramRequests=0)
(out/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
