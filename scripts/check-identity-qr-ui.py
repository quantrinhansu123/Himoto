"""Browser acceptance using synthetic QR codes; no real customer data or external network."""
import argparse,base64,json,subprocess
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image,ImageFilter,ImageOps
from playwright.sync_api import sync_playwright,expect

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:3097');p.add_argument('--output',type=Path,required=True);args=p.parse_args()
assert not args.output.exists();args.output.mkdir(parents=True)
subprocess.run(['node','scripts/generate-identity-qr-fixtures.cjs',str(args.output)],check=True)
first=args.output/'first.png';second=args.output/'second.png';invalid=args.output/'invalid.png'
with Image.open(first) as image:
    image.convert('RGB').rotate(90,expand=True).save(args.output/'rotated.png')
    ImageOps.invert(image.convert('RGB')).save(args.output/'inverted.png')
    image.convert('RGB').filter(ImageFilter.GaussianBlur(0.5)).save(args.output/'blurred.png')
(args.output/'broken.png').write_bytes(b'not an image')
wasm=Path('public/vendor/zxing/3.1.6/zxing_reader.wasm').resolve()
checks=[];blocked=[];wasm_requests=[];errors=[]
with sync_playwright() as playwright:
 browser=playwright.chromium.launch()
 context=browser.new_context(viewport={'width':390,'height':844},locale='vi-VN')
 def route(r):
  url=urlparse(r.request.url)
  if url.hostname not in ('127.0.0.1','localhost'):
   blocked.append(url.hostname);return r.abort()
  if url.path=='/vendor/zxing/3.1.6/zxing_reader.wasm':
   wasm_requests.append(url.path);return r.fulfill(path=str(wasm),content_type='application/wasm')
  return r.continue_()
 context.route('**/*',route)
 page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
 page.goto(args.url,wait_until='networkidle')
 field=lambda name:page.get_by_role('textbox',name=name,exact=True)
 def choose(files):page.get_by_label('Chọn QR',exact=True).set_input_files([str(f) for f in files])
 def clear():field('CCCD').fill('');field('Họ tên').fill('')
 field('Địa chỉ').fill('Địa chỉ hiện tại QA')
 for image in (first,args.output/'rotated.png',args.output/'inverted.png',args.output/'blurred.png'):
  clear();choose([image]);expect(field('CCCD')).to_have_value('001200000001',timeout=30000)
  expect(field('Họ tên')).to_have_value('NGUYỄN VĂN QA');expect(field('Ngày cấp')).to_have_value('2022-06-05')
  expect(field('Địa chỉ')).to_have_value('Địa chỉ hiện tại QA')
 checks.append('ZXing-C++ decodes Vietnamese QR in normal, rotated, inverted and slightly blurred images without changing the current address')
 clear();choose([args.output/'broken.png',first]);expect(field('CCCD')).to_have_value('001200000001',timeout=30000)
 clear();field('CCCD').fill('123456789');choose([first]);expect(field('CCCD')).to_have_value('001200000001',timeout=30000)
 field('CCCD').fill('009999999999');field('Họ tên').fill('Giữ nguyên QA');choose([first])
 expect(page.get_by_text('QR thuộc căn cước khác',exact=False)).to_be_visible(timeout=30000)
 expect(field('CCCD')).to_have_value('009999999999');expect(field('Họ tên')).to_have_value('Giữ nguyên QA')
 clear();choose([first,second]);expect(page.get_by_text('nhiều căn cước khác nhau',exact=False)).to_be_visible(timeout=30000);expect(field('CCCD')).to_have_value('')
 choose([invalid]);expect(page.get_by_text('Chưa tìm thấy QR căn cước hợp lệ',exact=False)).to_be_visible(timeout=30000)
 checks.append('Bad images, legacy identity matches, mismatched and multiple identities fail safely without replacing another customer')
 page.evaluate('''() => { const original=Image.prototype.decode; Image.prototype.decode=function(){return new Promise(resolve=>setTimeout(resolve,800)).then(()=>original.call(this));}; }''')
 clear();field('Họ tên').fill('Trước khi quét');choose([first]);field('Họ tên').fill('Chỉnh sửa trong lúc quét')
 expect(field('CCCD')).to_have_value('001200000001',timeout=30000);expect(field('Họ tên')).to_have_value('Chỉnh sửa trong lúc quét')
 clear();field('Họ tên').fill('Khách hiện tại');choose([first]);field('CCCD').fill('009999999999')
 expect(page.get_by_text('Đã điền QR',exact=False)).to_be_visible(timeout=30000)
 expect(field('CCCD')).to_have_value('009999999999');expect(field('Họ tên')).to_have_value('Khách hiện tại')
 checks.append('Manual edits and a changed identity during the scan are preserved')
 image_url='data:image/png;base64,'+base64.b64encode(first.read_bytes()).decode()
 page.evaluate('''async source => {
   const image=new Image();image.src=source;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
   canvas.getContext('2d').drawImage(image,0,0);window.__qrCanvas=canvas;
   Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{
     window.__qrStream=canvas.captureStream(8);
     window.__qrTimer=setInterval(()=>canvas.getContext('2d').drawImage(image,0,0),125);
     return window.__qrStream;
   }}});
 }''',image_url)
 clear();page.get_by_role('button',name='Quét QR bằng camera',exact=True).click()
 expect(field('CCCD')).to_have_value('001200000001',timeout=30000)
 assert page.evaluate('window.__qrStream.getTracks().every(track=>track.readyState==="ended")')
 page.evaluate('clearInterval(window.__qrTimer)')
 expect(page.get_by_role('button',name='Quét QR bằng camera',exact=True)).to_be_visible()
 page.evaluate('''() => { navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError');}; }''')
 page.get_by_role('button',name='Quét QR bằng camera',exact=True).click()
 expect(page.get_by_text('Chưa được cấp quyền camera',exact=False)).to_be_visible(timeout=10000)
 page.get_by_role('button',name='Dừng quét',exact=True).click()
 page.evaluate('''() => { navigator.mediaDevices.getUserMedia=async()=>{
   window.__lateStream=window.__qrCanvas.captureStream(8);
   await new Promise(resolve=>setTimeout(resolve,700));return window.__lateStream;
 }; }''')
 page.get_by_role('button',name='Quét QR bằng camera',exact=True).click()
 page.get_by_role('button',name='Dừng quét',exact=True).click()
 page.wait_for_function('window.__lateStream && window.__lateStream.getTracks().every(track=>track.readyState==="ended")',timeout=10000)
 checks.append('Live camera decodes a synthetic QR, stops its tracks and reports denied permission with an image fallback')
 assert wasm_requests and not blocked and not errors,(blocked,errors)
 context.close()
 # A rejected WASM initialization must not poison every subsequent attempt.
 retry_context=browser.new_context(viewport={'width':390,'height':844},locale='vi-VN')
 retry_requests=[];retry_allowed=False
 def retry_route(r):
  url=urlparse(r.request.url)
  if url.path=='/vendor/zxing/3.1.6/zxing_reader.wasm':
   retry_requests.append(url.path)
   if not retry_allowed:return r.fulfill(status=503,body='Temporarily unavailable')
  return route(r)
 retry_context.route('**/*',retry_route)
 retry_page=retry_context.new_page()
 retry_page.goto(args.url,wait_until='networkidle')
 retry_page.get_by_label('Chọn QR',exact=True).set_input_files(str(first))
 expect(retry_page.get_by_text('Chưa tải được bộ quét QR',exact=False)).to_be_visible(timeout=30000)
 expect(retry_page.get_by_role('textbox',name='CCCD',exact=True)).to_have_value('')
 retry_allowed=True
 retry_page.get_by_label('Chọn QR',exact=True).set_input_files(str(first))
 expect(retry_page.get_by_role('textbox',name='CCCD',exact=True)).to_have_value('001200000001',timeout=30000)
 assert len(retry_requests)>=2 and not blocked,(retry_requests,blocked)
 checks.append('After a temporary WASM download failure, selecting the QR again succeeds without reloading the page')
 retry_context.close();browser.close()
result={'ok':True,'checks':checks,'sameOriginWasmRequests':len(wasm_requests),'externalHosts':blocked,'pageErrors':errors,'realCustomerData':False,'businessWrites':0}
(args.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(result,ensure_ascii=False))
