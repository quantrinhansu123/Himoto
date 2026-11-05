"""Samsung durable form/photo recovery through the real native work controller; synthetic backend only."""
import argparse
import ast
import base64
import hashlib
import importlib.util
import io
import json
import re
import time
import urllib.request
from datetime import datetime,timezone
from pathlib import Path
from zoneinfo import ZoneInfo
from PIL import Image,ImageDraw,ImageFont
from lib.mobile_native_provenance import capture,source_snapshot
from lib.mobile_native_diagnostics import collect

parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--fixture-port',type=int,default=8126);parser.add_argument('--state-file',type=Path,required=True);args=parser.parse_args()
assert 8100<=args.fixture_port<=8199 and not args.output.exists()
spec=importlib.util.spec_from_file_location('nativeqa',Path(__file__).with_name('check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
# Compile only inspected helpers, never execute another suite's top-level flow.
# Their full source is included in the before/after native provenance manifest.
def helpers(file,names):
    tree=ast.parse(Path(file).read_text(encoding='utf-8'));nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names];assert len(nodes)==len(names)
    exec(compile(ast.Module(body=nodes,type_ignores=[]),file,'exec'),globals())
helpers('scripts/check-mobile-gps-native.py',{'reveal','press','enter_login_field','login','tabs','logout','routes'})
helpers('scripts/check-mobile-customer-documents-native.py',{'bounds','tap_node','create_photo','exact_picker_timestamp'})
photo_name='Himoto-Media-QA-'+str(time.time_ns())+'.jpg';phone_path='/sdcard/Download/'+photo_name;photo_path=args.output/'synthetic-native-picker.jpg';picker_identity=None
def request(path,body=None):
    req=urllib.request.Request(f'http://127.0.0.1:{args.fixture_port}'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'} if body is not None else {})
    with urllib.request.urlopen(req,timeout=12) as reply:data=json.load(reply)
    assert data['fixtureOnly'];return data
def stats():return request('/__fixture_state')
def mode(value):request('/__fixture_mode',{'mode':value})
def preserved():
    files=['mobile-contract-flow-fixture-20261102','mobile-transfer-fixture-20261102','mobile-recovery-fixture-20261102','mobile-media-fixture-20261102','mobile-customer-documents-fixture-20261103-run4','mobile-gps-fixture-20261103-run5','mobile-contract-photos-fixture-20261103-run1','mobile-contract-photos-fixture-20261103-run2','mobile-customer-photo-copy-fixture-20261103-run1','mobile-media-delete-fixture-20261103-run1','mobile-media-delete-fixture-20261103-run2','mobile-contract-photo-order-fixture-20261103-run1','mobile-draft-work-fixture-20261103-run1']
    return {name:hashlib.sha256(Path('.backups',name,'state.json').read_bytes()).hexdigest() for name in files if Path('.backups',name,'state.json').is_file()}
def text(label,value):
    assert re.fullmatch(r'[A-Za-z0-9-]+',value)
    qa.hide_keyboard();reveal(label);fields=[n for n in qa.matches(qa.tree(),label) if n.get('class')=='android.widget.EditText'];assert len(fields)==1
    old=fields[0].get('text','');assert len(old)<300
    x1,y1,x2,y2=bounds(fields[0]);qa.command('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
    focused=False
    for _ in range(6):
        focused=any(n.get('package')==module.PACKAGE and n.get('class')=='android.widget.EditText' and n.get('content-desc')==label and n.get('focused')=='true' for n in qa.tree().iter('node'))
        if focused:break
    assert focused,'QA field focus not verified'
    if old:qa.command('shell','input','keyevent','KEYCODE_MOVE_END');qa.command('shell','input','keyevent',*(['KEYCODE_DEL']*(len(old)+1)))
    qa.command('shell','input','text',value);qa.hide_keyboard();reveal(label)
    assert any(n.get('text')==value for n in qa.matches(qa.tree(),label)),'QA input readback mismatch'
def pick(label):
    press(label);deadline=time.monotonic()+180;external_seen=False
    while time.monotonic()<deadline:
        root=qa.tree();external=[n for n in root.iter('node') if n.get('package') not in (module.PACKAGE,'com.android.systemui') and len(bounds(n))==4 and bounds(n)[3]>bounds(n)[1]]
        if external:external_seen=True
        if external_seen and not external and any(n.get('package')==module.PACKAGE for n in root.iter('node')):return
        exact=[n for n in external if photo_name in n.get('text','')+n.get('content-desc','') or photo_name.removesuffix('.jpg')==n.get('text','')]
        if exact:tap_node(exact[0]);continue
        identified=exact_picker_timestamp(root)
        if identified is not None:tap_node(identified);continue
        time.sleep(.5)
    raise AssertionError('Picker did not identify the exact generated QA image; no personal thumbnail was selected')
def upload():press('Lưu ảnh vào đúng hồ sơ');qa.tap('Xác nhận lưu ảnh')

def wait_cancelled_photo():
    # A tap returns before the fetch completes. Late delivery is allowed only
    # after the original resolver has durably tombstoned the dropped request.
    deadline=time.monotonic()+30
    while time.monotonic()<deadline:
        state=json.loads(args.state_file.read_text(encoding='utf-8'))['state']
        delayed=state.get('delayed_contract_photo')
        if delayed and delayed['headers']['idempotency-key'] in state.get('tombstones',{}):
            assert state['contract_photo_writes']==3
            assert delayed['path'].endswith('/rental-document-1')
            return
        time.sleep(.2)
    raise AssertionError('Dropped photo did not reach a durable cancellation before late delivery')
def codec():
    state=json.loads(args.state_file.read_text(encoding='utf-8'))['state'];proofs=[]
    for row in state['contract_photo_receipts'].values():
        proof=row['receipt'];data=base64.b64decode(state['contract_photos'][f"{proof['id']}:{proof['slot']}"]['jpeg']);assert len(data)==proof['bytes']<=2*1024*1024 and hashlib.sha256(data).hexdigest()==proof['sha256']
        with Image.open(io.BytesIO(data)) as image:image.load();assert image.format=='JPEG' and max(image.size)<=2200;dimensions=list(image.size)
        proofs.append({'slot':proof['slot'],'bytes':len(data),'sha256':proof['sha256'],'decodedDimensions':dimensions,'sourceDimensions':[4200,2800]})
    qa.output.joinpath('native-codec-proof.json').write_text(json.dumps(proofs,indent=2),encoding='utf-8')

def cold_account():
    qa.launch();root=qa.wait_any(['Định vị GPS','Đăng nhập'],timeout=150)
    if qa.matches(root,'Đăng nhập'):login('qa')
    qa.tap('Tài khoản',bottom=True);press('Tải lại bản đang soạn trên thiết bị');press('Tải lại danh sách đối chiếu')

def open_local():
    press('Mở bản đang soạn 90003');qa.wait('Bước 5: Ký kết & ghi chú');reveal('Ghi chú bản nháp')
    assert any(n.get('text')=='LocalMemoQA' for n in qa.matches(qa.tree(),'Ghi chú bản nháp'))

def open_pending(label):
    press('Đối chiếu '+label);qa.tap('Đối chiếu với máy chủ');press('Mở kết quả '+label);qa.wait('Bước 5: Ký kết & ghi chú')

previous=None;before=None
try:
    initial=stats();assert initial['draftCreates']==initial['contractPhotoWrites']==initial['activeSessions']==0 and not initial['contractPhotoReceipts'],'Fresh synthetic checkpoint required; never reset written QA'
    request('/__fixture_contract_photos',{})
    qa.command('shell','am','force-stop',module.PACKAGE);time.sleep(1);before=preserved()
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as r:config=r.read().decode()
    assert 'http://127.0.0.1:8091' in config and 'mobile-api.example.invalid' not in config
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as r:entry=hashlib.file_digest(r,'sha256').hexdigest()
    previous=routes();qa.command('reverse','tcp:8081','tcp:8081');qa.command('reverse','tcp:8091',f'tcp:{args.fixture_port}');qa.verify_device_network();qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip())
    qa.launch();qa.wait('Đăng nhập',timeout=150);login('qa');qa.tap('Tài khoản',bottom=True);press('Tải lại bản đang soạn trên thiết bị');qa.wait('Không có bản đang soạn được giữ trên thiết bị.');press('Tải lại danh sách đối chiếu');qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.')
    qa.tap('Hợp đồng',bottom=True);qa.tap('Thêm bản nháp');text('Số hợp đồng giấy','90003');qa.tap('Bước 3: Phương tiện');create_photo();pick('Chọn ảnh biển số');reveal('Bỏ xe 50A-123.45');press('Lái xe và đồ mượn 1',True);text('Lái xe 1','NativeWorkDriverQA');text('Mũ bảo hiểm xe 1','2');press('Thêm xe vào bản nháp',True);qa.tap('Chọn xe 51B-678.90')
    press('Bước 4: Chi phí',True);text('Tổng giá trị hợp đồng (VND)','1250000');press('Bước 5: Ký kết & ghi chú',True);text('Ghi chú bản nháp','LocalMemoQA');pick('Chọn ảnh hợp đồng');press('Mục ảnh hợp đồng',True);text('Tìm mục ảnh hợp đồng','Giay');press('Giấy phép lái xe');pick('Chọn ảnh hợp đồng');pick('Chọn ảnh hợp đồng');qa.wait('Đã giữ bản trên thiết bị',timeout=90);qa.screenshot('01-form-owned-photos-before-save');assert stats()['draftCreates']==stats()['contractPhotoWrites']==0
    cold_account();open_local();qa.wait('Đã giữ bản trên thiết bị');assert stats()['draftCreates']==stats()['contractPhotoWrites']==0;qa.screenshot('02-form-resume-before-metadata')
    qa.passed('The real native form restores its step/manual note and all owned queued images after process kill before any metadata or photo HTTP write')
    press('Lưu nháp');qa.wait('QA mất phản hồi sau commit.',timeout=90);assert stats()['draftCreates']==1;qa.screenshot('03-metadata-lost-response')
    cold_account();open_pending('tạo bản nháp');press('Hoàn tất ảnh bản nháp đã lưu');qa.wait('Hoàn tất ảnh hợp đồng',timeout=90);assert stats()['draftCreates']==1
    qa.passed('Lost metadata commit survives process kill; Account resolves the original draft UUID and reopens the same work/contract instead of creating a second draft')
    mode('contract-photo-license-lost');upload();qa.wait('QA mất phản hồi sau commit.',timeout=120);assert stats()['contractPhotoWrites']==2;qa.screenshot('04-gplx-lost-response')
    cold_account();open_pending('lưu ảnh hợp đồng #2001');press('Hoàn tất ảnh bản nháp đã lưu');qa.wait('Hoàn tất ảnh hợp đồng');reveal('Đã kiểm tra phiếu ảnh');qa.tap('Đã kiểm tra phiếu ảnh');press('Tải lại ô ảnh, giữ ảnh đang chọn');mode('contract-photo-transaction-drop');upload();qa.wait('QA chưa nhận được ảnh hợp đồng.',timeout=120);press('Đối chiếu ảnh với máy chủ');wait_cancelled_photo();assert request('/__fixture_contract_photo_late',{})['lateStatus']==409;assert stats()['contractPhotoWrites']==3
    qa.screenshot('05-exact-photo-recovery');qa.passed('GPLX lost commit restores its exact durable image association through Account; only the supplemental GPLX proceeds next, and dropped signed-photo delivery is tombstoned before late409')
    press('Tải lại ô ảnh, giữ ảnh đang chọn');upload();qa.wait('Tiếp tục soạn hợp đồng',timeout=120);final=stats();assert final['draftCreates']==1 and final['contractPhotoWrites']==4
    rows=sorted(final['contractPhotoReceipts'].values(),key=lambda row:int(row['receipt']['photoRevision']));assert [row['receipt']['slot'] for row in rows]==['plate-303','driver-license','driver-license-extra-2','rental-document-1']
    saved=final['drafts'][0]['input'];assert saved['notes']=='LocalMemoQA';draft=saved['draft'];assert [v['id'] for v in draft['vehicles']]==['303','304'] and draft['vehicles'][0]['driver_name']=='NativeWorkDriverQA' and draft['vehicles'][0]['borrow_hats']=='2' and draft['total_amount']=='1250000';codec()
    tabs();qa.tap('Tài khoản',bottom=True);press('Tải lại bản đang soạn trên thiết bị');qa.wait('Không có bản đang soạn được giữ trên thiết bị.');press('Tải lại danh sách đối chiếu');qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.screenshot('06-work-finished-ledger-empty');press('Đăng xuất');qa.wait('Đăng nhập');assert stats()['activeSessions']==0
    qa.passed('One original contract retains exact vehicles/driver/accessories/money/note and four ordered JPEG proofs; finished local work and ledger clear only after exact acknowledgements')
    diagnostics=collect(qa,module.PACKAGE);assert not diagnostics['errors'] and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
    assert source_snapshot()==qa.source_files and preserved()==before
    qa.output.joinpath('fixture-final.json').write_text(json.dumps(stats(),ensure_ascii=False,indent=2),encoding='utf-8')
    result={'status':'passed','passed':len(qa.checks),'checks':qa.checks,'fixtureOnly':True,'physicalDeviceTested':True,'formIntegrationEnabled':True,'fullAppCertified':False,'sourceFilesVerified':len(qa.source_files),'newAppCrashes':0,'newAppAnrs':0,'newSystemUiAnrs':0,'operationalWrites':0,'completedAt':datetime.now(timezone.utc).isoformat()};qa.output.joinpath('results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
except Exception as error:
    result={'status':'failed','passed':len(qa.checks),'checks':qa.checks,'error':str(error),'fixtureOnly':True,'completedAt':datetime.now(timezone.utc).isoformat()};qa.output.joinpath('results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    try:qa.screenshot('failure');qa.output.joinpath('fixture-failed.json').write_text(json.dumps(stats(),ensure_ascii=False,indent=2),encoding='utf-8')
    except Exception:pass
    raise
finally:
    if previous is not None:
        for port in ('tcp:8081','tcp:8091'):
            qa.command('reverse',port,previous[port]) if port in previous else qa.command('reverse','--remove',port)
        after=routes();qa.output.joinpath('usb-route.json').write_text(json.dumps({'before':previous,'after':after,'restored':after==previous}),encoding='utf-8');assert after==previous
