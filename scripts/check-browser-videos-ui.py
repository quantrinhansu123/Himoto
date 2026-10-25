"""Exercise the production UI and its real bundled worker; intercept every business/storage write."""
import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3018')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--browser', choices=['chromium', 'webkit'], default='chromium')
parser.add_argument('--fixtures', default='.backups/browser-video-20261025/fixtures')
parser.add_argument('--output', default='.backups/browser-video-20261025/ui')
args = parser.parse_args()
out = Path(args.output) / args.browser
out.mkdir(parents=True, exist_ok=True)

# Reuse the established synthetic contract fixtures without running their test flow.
fixture_source = Path('scripts/check-contract-final-submit-ui.py').read_text(encoding='utf-8').split('with sync_playwright() as p:')[0]
argv_before = sys.argv
sys.argv = ['fixture', '--url', args.url, '--session-cookie-file', args.session_cookie_file, '--browser', args.browser, '--output', str(out)]
namespace = {'__name__': 'synthetic_contract_fixture'}
exec(compile(fixture_source, 'synthetic_contract_fixture', 'exec'), namespace)
sys.argv = argv_before
checks, outcomes, errors = [], [], []
fixture_dir = Path(args.fixtures)
probe = Path('.backups/browser-video-20261025/tools/npm/node_modules/@ffprobe-installer/win32-x64/ffprobe.exe')

with sync_playwright() as playwright:
    browser = getattr(playwright, args.browser).launch()
    for filename, no_worker, retry_upload, stuck_worker in [
        ('avc.mov', False, True, False), ('rotated.mov', False, False, False), ('silent.mp4', False, False, False),
        ('hevc.mov', False, False, False), ('silent.webm', False, False, False), ('vp9.webm', False, False, False),
        ('avc.mov', True, False, False), ('avc.mov', False, False, True), ('long61.mp4', False, False, False),
    ]:
        namespace['state'].clear()
        namespace['unexpected'].clear()
        namespace['writes'].clear()
        context = browser.new_context(viewport={'width': 390, 'height': 844}, timezone_id='Asia/Ho_Chi_Minh')
        token = Path(args.session_cookie_file).read_text().strip()
        context.add_cookies([{'name': 'himoto_management_session', 'value': token, 'url': args.url, 'httpOnly': True, 'sameSite': 'Strict'}])
        # WebKit's interception protocol can omit Blob request bodies. Capture the same
        # Blob locally for inspection without replacing the actual send operation.
        context.add_init_script("""const send = XMLHttpRequest.prototype.send;
          XMLHttpRequest.prototype.send = function(body) {
            if (body instanceof Blob && body.type === 'video/mp4') window.__qaVideoBlob = body;
            return send.call(this, body);
          };""")
        if no_worker:
            context.add_init_script("Object.defineProperty(window, 'Worker', {value: undefined});")
        if stuck_worker:
            context.add_init_script("""window.Worker=class {constructor(){window.__qaWorkerStarted=true;} postMessage(){} terminate(){window.__qaWorkerTerminated=true;}};
              const timer=window.setTimeout.bind(window);
              window.setTimeout=(fn,ms,...args)=>timer(fn,window.__qaWorkerStarted && ms===45000?50:ms,...args);""")
        state = {'signs': 0, 'uploads': 0, 'fallbacks': 0, 'verifications': 0, 'workers': 0, 'fail_upload': retry_upload, 'output': None}
        def mock(route):
            req = route.request
            path = urlparse(req.url).path
            if path == '/api/auth/photo-uploads/video':
                body = req.post_data_json
                if body['action'] == 'config': data = {'enabled': True}
                elif body['action'] == 'sign':
                    state['signs'] += 1
                    state['signed'] = body
                    data = {'url': 'https://qa-video-upload.invalid/upload', 'headers': {'Content-Type': 'video/mp4'}, 'ticket': 'qa-ticket'}
                else:
                    state['verifications'] += 1
                    assert state['output'], 'Must upload bytes before verification'
                    assert hashlib.sha256(state['output']).hexdigest() == state['signed']['sha256']
                    data = {'receipt': {'provider': 'cloudfly-browser', 'resource_type': 'video', 'upload_id': state['signed']['upload_id'], 'signature': 'a'*64}}
                route.fulfill(json={'status': 'success', 'data': data})
                return
            if path.startswith('/api/auth/record-photos/') and req.method == 'PUT' and '-video-' in path:
                proof = req.post_data_json
                assert proof.get('provider') == 'cloudfly-browser' or proof.get('resource_type') == 'video'
            namespace['mock'](route)
        def upload(route):
            headers = {'Access-Control-Allow-Origin': args.url, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'PUT,OPTIONS'}
            if route.request.method == 'OPTIONS': route.fulfill(status=204, headers=headers); return
            state['uploads'] += 1
            if state['fail_upload']:
                state['fail_upload'] = False
                route.fulfill(status=503, headers=headers); return
            state['output'] = route.request.post_data_buffer or bytes(page.evaluate('async () => Array.from(new Uint8Array(await window.__qaVideoBlob.arrayBuffer()))'))
            route.fulfill(status=200, headers=headers)
        def cloud(route):
            state['fallbacks'] += 1
            body = route.request.post_data_buffer.decode('latin1')
            public_id = re.search(r'name="public_id"\r\n\r\n([^\r]+)', body).group(1)
            route.fulfill(json={'public_id': public_id, 'version': 1, 'signature': 'qa'}, headers={'Access-Control-Allow-Origin': '*'})
        context.route('**/api/**', mock)
        context.route('https://qa-video-upload.invalid/**', upload)
        context.route('https://api.cloudinary.com/**', cloud)
        context.route('https://api.telegram.org/**', lambda route: route.abort())
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        def worker_created(worker): state['workers'] += 1
        page.on('worker', worker_created)
        page.goto(args.url + '/contracts', wait_until='networkidle')
        tools = page.locator('summary').filter(has_text='Thao tác khác')
        if tools.count(): tools.click()
        page.get_by_role('button', name='Nhập hợp đồng', exact=True).click()
        form = page.locator('dialog.mg-contract-composer')
        form.get_by_role('tab', name='Khách hàng', exact=False).click()
        form.locator('#contract-store').select_option('1')
        form.locator('#contract-id-card').fill(namespace['customer']['phone'])
        expect(form.locator('#contract-customer-name')).to_have_value('Khách QA')
        form.locator('#contract-staff').fill(namespace['staff'][0]['full_name'])
        form.get_by_role('tab', name='Phương tiện', exact=False).click()
        form.locator('#contract-vehicle-0').click()
        form.locator('#contract-vehicle-0-options-101').click()
        media = form.get_by_role('group', name='Ảnh xe 4 góc, toàn cảnh & video', exact=True)
        started = time.monotonic()
        media.get_by_label('Chọn video Video tình trạng xe 1', exact=True).set_input_files(str(fixture_dir / filename))
        if filename == 'long61.mp4':
            expect(media).to_contain_text('tối đa 60 giây', timeout=20000)
            assert not state['uploads'] and not state['fallbacks']
            checks.append('Overlong video is rejected before upload')
        else:
            if retry_upload:
                expect(media).to_contain_text('Chưa tải được video', timeout=70000)
                workers_before = state['workers']
                expect(media.get_by_role('button', name='Bỏ ảnh mới Video tình trạng xe 1', exact=True)).to_be_visible()
                media.get_by_role('alert').filter(has_text='Chưa tải được video.').first.scroll_into_view_if_needed()
                form.screenshot(path=str(out / 'upload-error-file-retained.png'))
                media.get_by_role('button', name='Tải tệp lại', exact=True).click()
            expect(media).to_contain_text('Đã tải lên · bấm Lưu ảnh / video', timeout=70000)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            elapsed = round((time.monotonic() - started) * 1000)
            if filename in ('avc.mov', 'rotated.mov', 'silent.mp4') and not no_worker and not stuck_worker:
                assert state['uploads'] > 0 and state['fallbacks'] == 0, state
            if no_worker: assert state['fallbacks'] == 1 and state['uploads'] == 0
            if stuck_worker:
                assert state['fallbacks'] == 1 and state['uploads'] == 0
                assert page.evaluate('window.__qaWorkerTerminated === true')
                checks.append('Timed-out worker is terminated before the source enters the fallback path')
            if retry_upload:
                assert state['workers'] == workers_before and state['uploads'] == 2
                checks.append('Failed upload retains the file; retry reuses the prepared video without another worker')
            if state['output']:
                target = out / (filename.replace('.', '-') + '.mp4')
                target.write_bytes(state['output'])
                info = json.loads(subprocess.check_output([str(probe), '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(target)]))
                video = next(track for track in info['streams'] if track['codec_type'] == 'video')
                audio = [track for track in info['streams'] if track['codec_type'] == 'audio']
                assert video['codec_name'] == 'h264'
                assert not audio or audio[0]['codec_name'] == 'aac'
                if filename != 'silent.mp4' and filename != 'silent.webm': assert audio, 'Source sound must survive conversion'
                assert 2.8 < float(info['format']['duration']) < 3.3
                if filename == 'rotated.mov':
                    rotation = int(video.get('tags', {}).get('rotate', 0)) or int(next((item.get('rotation', 0) for item in video.get('side_data_list', []) if item.get('rotation')), 0))
                    assert abs(rotation) == 90 or video['height'] > video['width'], 'Portrait orientation lost'
            form.get_by_role('tab', name='Chi phí', exact=False).click()
            form.locator('#contract-deposit_amount').fill('0')
            form.get_by_role('button', name='Hoàn tất & thanh toán', exact=True).click()
            expect(page.get_by_role('dialog').filter(has=page.get_by_role('heading', name='Xác nhận thanh toán', exact=False))).to_be_visible()
            assert any('-video-' in key for key in namespace['state'].get('photos', {}))
            assert 'telegram-send' not in namespace['writes']
            checks.append(f'{filename}: ready receipt attaches before final confirmation; no Telegram send')
            outcomes.append({'file': filename, 'workerDisabled': no_worker, 'path': 'browser' if state['output'] else 'fallback', 'elapsedMs': elapsed})
            page.screenshot(path=str(out / (filename.replace('.', '-') + ('-fallback' if no_worker else '') + '.png')))
        assert not namespace['unexpected'], namespace['unexpected']
        context.close()
    browser.close()
assert not errors, errors
report = {'passed': len(checks), 'browser': args.browser, 'checks': checks, 'outcomes': outcomes, 'javascriptErrors': errors, 'realBusinessWrites': 0, 'realTelegramRequests': 0}
(out / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
