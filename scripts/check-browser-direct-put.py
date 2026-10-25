"""Receive one signed synthetic upload in stdin. Never print its URL, headers or payload."""
import json
import sys
from playwright.sync_api import sync_playwright

try:
    data = json.load(sys.stdin)
    with sync_playwright() as p:
        browser = getattr(p, data['browser']).launch()
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        origin = data['origin']
        harness = origin + '/_qa_synthetic_video_upload'
        def guard(route):
            if route.request.url == harness:
                route.fulfill(body='<!doctype html><title>Synthetic upload</title>', content_type='text/html')
            elif route.request.url.startswith('https://s3.cloudfly.vn/'):
                route.continue_()
            else:
                route.abort()
        context.route('**/*', guard)
        page = context.new_page()
        page.goto(harness)
        result = page.evaluate('''async data => {
          const bytes = Uint8Array.from(atob(data.bytes), c => c.charCodeAt(0));
          const file = new File([bytes], 'synthetic-video.mp4', {type:'video/mp4'});
          return await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest(); xhr.open('PUT', data.url); xhr.timeout=45000;
            for (const [key,value] of Object.entries(data.headers)) xhr.setRequestHeader(key,value);
            let progress=false;
            xhr.upload.onprogress = () => {progress=true;};
            xhr.onload = () => resolve({status:xhr.status, progress, etagReadable:!!xhr.getResponseHeader('ETag')});
            xhr.onerror=xhr.ontimeout=()=>reject(new Error('Synthetic upload failed'));
            xhr.send(file);
          });
        }''', data)
        assert result['status'] == 200 and result['etagReadable'], result
        context.close()
        browser.close()
        print(json.dumps({'passed': True, 'browser': data['browser'], **result}))
except Exception:
    print(json.dumps({'passed': False, 'error': 'SYNTHETIC_BROWSER_PUT_FAILED'}))
    sys.exit(1)
