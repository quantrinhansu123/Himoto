"""Samsung durable form/photo recovery through the real native work controller; synthetic backend only."""
import argparse
import uuid
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

parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--fixture-port',type=int,default=8101);parser.add_argument('--state-file',type=Path,required=True);args=parser.parse_args()
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

run_id=str(uuid.uuid4());launch=f'himoto://contract-work-qa?run={run_id}&mode=transition'

def open_screen():
    qa.command('shell',f"am start -W -a android.intent.action.VIEW -d '{launch}' -p {module.PACKAGE}");qa.wait('QA an toàn khi rời form',timeout=120)

def cold_screen():
    qa.launch();root=qa.wait_any(['Định vị GPS','Đăng nhập'],timeout=150)
    if qa.matches(root,'Đăng nhập'):login('qa')
    open_screen()

def import_count():
    reveal('QA số ảnh 1',True)
    rows=[n.get('text','') for n in qa.tree().iter('node') if n.get('text','').startswith('QA lần giữ ảnh ')]
    assert len(rows)==1;return int(rows[0].rsplit(' ',1)[1])

def wait_modal_closed():
    deadline=time.monotonic()+45
    while time.monotonic()<deadline:
        root=qa.tree()
        if not qa.matches(root,'QA: Xác nhận rời') and qa.matches(root,'QA an toàn khi rời form'):return
        time.sleep(.2)
    raise AssertionError('Rejected leave did not keep the original form visible')

previous=None;before=None
try:
    assert args.fixture_port==8101 and args.state_file.resolve()==Path('.backups/mobile-contract-flow-fixture-20261102/state.json').resolve()
    initial=stats();assert initial['fixtureOnly'];qa.command('shell','am','force-stop',module.PACKAGE);before=json.loads(args.state_file.read_text(encoding='utf-8'))['state'];old={k:v for k,v in preserved().items() if k!='mobile-contract-flow-fixture-20261102'}
    previous=routes();assert previous=={'tcp:8081':'tcp:8081','tcp:8091':'tcp:8101'}
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as r:config=r.read().decode()
    assert 'http://127.0.0.1:8091' in config and 'mobile-api.example.invalid' not in config
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as r:entry=hashlib.file_digest(r,'sha256').hexdigest()
    qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip());qa.verify_device_network();cold_screen();create_photo();pick('Chọn ảnh hợp đồng');reveal('QA: Chưa cho phép ghi ảnh.');reveal('QA ảnh chưa giữ 1',True);qa.wait('QA file còn 1');qa.screenshot('01-import-failed-cache-held');count=import_count()
    press('QA: Rời màn hình');qa.tap('QA: Xác nhận rời');wait_modal_closed();reveal('QA ảnh chưa giữ 1',True);qa.wait('QA file còn 1');assert import_count()>count;qa.screenshot('02-leave-blocked-no-dispose')
    qa.passed('Real native photo hook keeps the selected QA image/cache when a controlled pre-copy storage failure rejects the actual leave confirmation; the form remains mounted')
    count=import_count();press('QA: Thử mở bộ chọn lần nữa');reveal('QA ảnh chưa giữ 1',True);assert import_count()>count;qa.wait('QA file còn 1');assert not any(n.get('package') in ('com.google.android.gms','com.google.android.documentsui','com.android.documentsui','com.sec.android.gallery3d','com.sec.android.app.myfiles') for n in qa.tree().iter('node'));qa.screenshot('03-picker-preflight-blocked')
    qa.passed('Picker preflight retries the unsaved image and rejects before opening any external selector when the existing queue cannot be held; no second image or business UUID is created')
    press('QA: Cho phép giữ ảnh');qa.wait('QA: Ảnh đã giữ an toàn',timeout=90);reveal('QA ảnh chưa giữ 0',True);qa.wait('QA file còn 1');press('QA: Rời màn hình');qa.tap('QA: Xác nhận rời');qa.wait('Tài khoản',timeout=60);qa.screenshot('04-retry-held-before-leave');open_screen();reveal('QA ảnh chưa giữ 0',True);qa.wait('QA số ảnh 1');qa.wait('QA file còn 1')
    qa.passed('A successful explicit retry writes the owned image/association before the actual leave hook permits navigation; reopening restores exactly one readable image')
    press('QA: Sửa trước khi ra nền');qa.command('shell','input','keyevent','KEYCODE_HOME');time.sleep(3);cold_screen();press('QA: Kiểm tra bản đọc lại');qa.wait('QA: AppState và khôi phục sau kill đúng',timeout=90);reveal('QA ảnh chưa giữ 0',True);qa.wait('QA file còn 1');qa.screenshot('05-background-kill-exact-work');press('QA: Kết thúc bản thử');qa.wait('QA: Đã kết thúc bản thử');press('QA: Rời màn hình');qa.tap('QA: Xác nhận rời');qa.wait('Tài khoản')
    qa.passed('A real HOME/background event records the production AppState checkpoint; process kill restores the exact note/photo SHA and zero request attempts, then explicit QA discard closes only its private synthetic work')
    tabs();qa.tap('Tài khoản',bottom=True);press('Tải lại danh sách đối chiếu');qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.screenshot('06-business-ledger-untouched')
    after=json.loads(args.state_file.read_text(encoding='utf-8'))['state'];changed=sorted(k for k in set(before)|set(after) if before.get(k)!=after.get(k));assert set(changed)<= {'sessions','sessionSeq'}
    assert source_snapshot()==qa.source_files and {k:v for k,v in preserved().items() if k!='mobile-contract-flow-fixture-20261102'}==old and routes()==previous
    diagnostics=collect(qa,module.PACKAGE);assert not diagnostics['errors'] and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
    result={'status':'passed','passed':len(qa.checks),'checks':qa.checks,'fixtureOnly':True,'physicalDeviceTested':True,'controlledStorageFailureBeforeCopy':True,'realDiskFilled':False,'businessWrites':0,'businessLedgerUntouched':True,'sourceFilesVerified':len(qa.source_files),'newAppCrashes':0,'newAppAnrs':0,'newSystemUiAnrs':0,'watchChangedKeys':changed,'qaWorkId':run_id,'qaScope':f'https://{run_id}.contract-work-transition-qa.invalid','fullFeatureCertified':False,'completedAt':datetime.now(timezone.utc).isoformat()};qa.output.joinpath('results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
except Exception as error:
    result={'status':'failed','passed':len(qa.checks),'checks':qa.checks,'error':str(error),'fixtureOnly':True,'qaWorkId':run_id,'qaScope':f'https://{run_id}.contract-work-transition-qa.invalid','completedAt':datetime.now(timezone.utc).isoformat()};qa.output.joinpath('results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    try:qa.screenshot('failure')
    except Exception:pass
    raise
finally:
    if previous is not None:assert routes()==previous
