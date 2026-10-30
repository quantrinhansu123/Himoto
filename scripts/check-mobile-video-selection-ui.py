"""Exercise a supplied local video with phone-provider metadata; no media leaves the test browser."""
import argparse
import base64
import json
import sys
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3037')
parser.add_argument('--session-cookie-file', required=True)
parser.add_argument('--video-file', required=True)
parser.add_argument('--browser', choices=['chromium', 'webkit'], default='webkit')
parser.add_argument('--observe', action='store_true')
parser.add_argument('--output', default='.backups/mobile-video-selection')
args = parser.parse_args()
out = Path(args.output) / args.browser
out.mkdir(parents=True, exist_ok=True)
source = Path('scripts/check-contract-final-submit-ui.py').read_text(encoding='utf-8').split('with sync_playwright() as p:')[0]
original_argv = sys.argv
sys.argv = ['fixture', '--url', args.url, '--session-cookie-file', args.session_cookie_file, '--browser', args.browser, '--output', str(out)]
fixture = {'__name__': 'synthetic_contract_fixture'}
exec(compile(source, 'synthetic_contract_fixture', 'exec'), fixture)
sys.argv = original_argv
video_bytes = Path(args.video_file).read_bytes()
errors, outcomes, unexpected = [], [], []

with sync_playwright() as p:
    browser = getattr(p, args.browser).launch()
    for label, name, mime in [('standard', 'phone-video.mp4', 'video/mp4'), ('no-name-or-type', 'blob', ''),
                              ('provider-type', 'phone-video.mp4', 'com.apple.quicktime-movie')]:
        fixture['state'].clear()
        fixture['unexpected'].clear()
        fixture['writes'].clear()
        stats = {'signs': 0, 'fallbacks': 0}
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, timezone_id='Asia/Ho_Chi_Minh')
        context.add_cookies([{'name': 'himoto_management_session', 'value': Path(args.session_cookie_file).read_text().strip(), 'url': args.url, 'httpOnly': True, 'sameSite': 'Strict'}])

        def guard(route):
            req = route.request
            parsed = urlparse(req.url)
            if parsed.netloc != urlparse(args.url).netloc:
                if parsed.netloc == 'api.cloudinary.com':
                    stats['fallbacks'] += 1
                unexpected.append('external request ' + parsed.netloc)
                route.abort()
                return
            if parsed.path == '/api/auth/order/car-rental/followups' and req.method == 'GET':
                route.fulfill(json={'data': []})
                return
            if parsed.path == '/api/auth/photo-uploads/video':
                body = req.post_data_json
                if body['action'] == 'config':
                    data = {'enabled': True}
                else:
                    assert body['action'] == 'sign' and body['bytes'] > 0 and len(body['sha256']) == 64
                    stats['signs'] += 1
                    data = {'receipt': {'provider': 'cloudfly-browser', 'resource_type': 'video', 'upload_id': body['upload_id'], 'signature': 'a' * 64}}
                route.fulfill(json={'status': 'success', 'data': data})
                return
            if parsed.path == '/api/auth/photo-uploads/sign':
                stats['fallbacks'] += 1
                route.fulfill(status=503, json={'status': 'error', 'message': 'QA: Cloudinary is blocked'})
                return
            if parsed.path.startswith('/api/'):
                assert req.method == 'GET', 'No business write is expected'
                fixture['mock'](route)
            else:
                unexpected.append('Unexpected API ' + parsed.path)
                route.abort()

        context.route('**/api/**', guard)
        context.route('https://api.cloudinary.com/**', guard)
        context.route('https://s3.cloudfly.vn/**', lambda route: route.abort())
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(args.url + '/contracts', wait_until='networkidle', timeout=90000)
        page.get_by_role('button', name='Nhập hợp đồng', exact=True).click()
        form = page.locator('dialog.mg-contract-composer')
        form.get_by_role('tab', name='Phương tiện', exact=False).click()
        media = form.get_by_role('group', name='Ảnh xe 4 góc, toàn cảnh & video', exact=True)
        picker = media.get_by_label('Chọn video Video tình trạng xe 1', exact=True)
        picker.evaluate('''(input, data) => {
          const transfer = new DataTransfer();
          transfer.items.add(new File([Uint8Array.from(atob(data.bytes), c => c.charCodeAt(0))], data.name, {type:data.mime}));
          input.files = transfer.files;
          input.dispatchEvent(new Event('change', {bubbles:true}));
        }''', {'name': name, 'mime': mime, 'bytes': base64.b64encode(video_bytes).decode()})
        page.wait_for_function('''() => [...document.querySelectorAll('.mg-photo-feedback,.mg-field-error')].some(el =>
          /Đã tải lên|Chọn video|Không nhận diện|Cloudinary|Không đọc|Video đang trống|Video có dung lượng/.test(el.textContent))''', timeout=70000)
        messages = media.locator('.mg-field-error,.mg-photo-feedback').all_text_contents()
        ready = any('Đã tải lên' in text for text in messages)
        outcomes.append({'case': label, 'ready': ready, 'signs': stats['signs'], 'fallbacks': stats['fallbacks'], 'messages': messages})
        print(json.dumps({'browser': args.browser, **outcomes[-1]}, ensure_ascii=False), flush=True)
        form.screenshot(path=str(out / (label + '.png')))
        if not args.observe:
            assert ready and stats['signs'] == 1 and stats['fallbacks'] == 0, outcomes[-1]
        assert not fixture['unexpected'], fixture['unexpected']
        context.unroute_all(behavior='ignoreErrors')
        context.close()
    browser.close()
assert not errors and not unexpected, (errors, unexpected)
report = {'browser': args.browser, 'outcomes': outcomes, 'javascriptErrors': errors, 'businessWrites': 0, 'realCloudUploads': 0, 'telegramRequests': 0}
(out / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
