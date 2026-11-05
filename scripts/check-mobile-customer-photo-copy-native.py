"""Focused Samsung copy ordering/lost-commit/process-kill acceptance; synthetic only."""
import argparse,ast,hashlib,importlib.util,json,re,time,urllib.request
from pathlib import Path
from datetime import datetime,timezone
from zoneinfo import ZoneInfo
from PIL import Image,ImageDraw,ImageFont
from lib.mobile_native_provenance import capture,source_snapshot
from lib.mobile_native_diagnostics import collect

parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--fixture-port',type=int,default=8122);parser.add_argument('--state-file',type=Path,required=True);args=parser.parse_args()
assert 8100<=args.fixture_port<=8199 and not args.output.exists()
spec=importlib.util.spec_from_file_location('nativeqa',Path(__file__).with_name('check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
def helpers(file,names):
    tree=ast.parse(Path(file).read_text(encoding='utf-8'));nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names];assert len(nodes)==len(names)
    exec(compile(ast.Module(body=nodes,type_ignores=[]),file,'exec'),globals())
helpers('scripts/check-mobile-gps-native.py',{'reveal','press','enter_login_field','login','tabs','routes'})
helpers('scripts/check-mobile-customer-documents-native.py',{'bounds','tap_node','create_photo','exact_picker_timestamp'})
helpers('scripts/check-mobile-contract-photos-native.py',{'text','pick'})
photo_name='Himoto-Media-QA-'+str(time.time_ns())+'.jpg';phone_path='/sdcard/Download/'+photo_name;photo_path=args.output/'synthetic-native-picker.jpg';picker_identity=None
def request(path,body=None):
    req=urllib.request.Request(f'http://127.0.0.1:{args.fixture_port}'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'} if body is not None else {})
    with urllib.request.urlopen(req,timeout=12) as r:data=json.load(r)
    assert data['fixtureOnly'];return data
def stats():return request('/__fixture_state')
def mode(value):request('/__fixture_mode',{'mode':value})
def preserved():
    names=['mobile-contract-flow-fixture-20261102','mobile-contract-photos-fixture-20261103-run1','mobile-contract-photos-fixture-20261103-run2','mobile-customer-documents-fixture-20261103-run4','mobile-gps-fixture-20261103-run5']
    return {name:hashlib.sha256(Path('.backups',name,'state.json').read_bytes()).hexdigest() for name in names if Path('.backups',name,'state.json').is_file()}
def await_cancelled():
    deadline=time.monotonic()+30
    while time.monotonic()<deadline:
        s=json.loads(args.state_file.read_text(encoding='utf-8'))['state'];delayed=s.get('delayed_customer_photo_copy')
        if delayed and delayed['headers']['idempotency-key'] in s.get('tombstones',{}):return
        time.sleep(.2)
    raise AssertionError('Copy cancellation not durable before late delivery')
def account():tabs();qa.tap('Tài khoản',bottom=True);press('Tải lại danh sách đối chiếu')
previous=None;before=None
try:
    initial=stats();assert initial['draftCreates']==initial['contractPhotoWrites']==initial['customerPhotoCopyWrites']==initial['activeSessions']==0,'Use a fresh checkpoint, never reset acceptance data'
    request('/__fixture_customer_copy_sources',{})
    qa.command('shell','am','force-stop',module.PACKAGE);time.sleep(1);before=preserved()
    print('Prewarming frozen source for exclusive Samsung copy acceptance.',flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as r:config=r.read().decode()
    assert 'http://127.0.0.1:8091' in config and 'mobile-api.example.invalid' not in config
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as r:entry=hashlib.file_digest(r,'sha256').hexdigest()
    previous=routes();qa.command('reverse','tcp:8081','tcp:8081');qa.command('reverse','tcp:8091',f'tcp:{args.fixture_port}');qa.verify_device_network();qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip())
    qa.launch();login('qa');account();qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.tap('Hợp đồng',bottom=True);qa.tap('Thêm bản nháp');text('Số hợp đồng giấy','96031');qa.tap('Bước 2: Khách hàng');press('Chọn hồ sơ khách');qa.tap('Chọn khách Khách hợp đồng QA, QA-001');qa.tap('Dùng hồ sơ đã chọn')
    press('Bước 5: Ký kết & ghi chú',True);create_photo();pick('Chọn ảnh hợp đồng');reveal('Bỏ ảnh đang chọn · Khi thuê · Hợp đồng đã ký');mode('copy-lost');press('Lưu nháp');qa.wait('Hoàn tất ảnh hợp đồng',timeout=90);assert stats()['customerPhotoCopyWrites']==0
    press('Lưu ảnh vào đúng hồ sơ');qa.tap('Xác nhận lưu ảnh');qa.wait('Đối chiếu lấy giấy tờ với máy chủ',timeout=90)
    first=stats();assert first['draftCreates']==first['contractPhotoWrites']==first['customerPhotoCopyWrites']==1
    state=json.loads(args.state_file.read_text(encoding='utf-8'))['state'];event=state['customer_photo_copy_events'][0];assert event['draftCreates']==event['photosBeforeCopy']==1
    original=next(iter(state['customer_photo_copy_receipts'].values()))['receipt'];assert original['copied']==4;qa.screenshot('01-copy-after-images-lost')
    qa.passed('Samsung saves one metadata draft then one selected native photo, then copies four customer papers using the original contract ID; a lost copy response keeps both durable keys')
    qa.launch();qa.wait('Định vị GPS',timeout=150);account();press('Đối chiếu lấy giấy tờ khách vào hợp đồng #2001');qa.wait('Đối chiếu và kết thúc yêu cầu?');qa.tap('Đối chiếu với máy chủ');press('Mở kết quả lấy giấy tờ khách vào hợp đồng #2001');qa.wait('Phiếu lấy giấy tờ đã ghi');reveal('Đã bổ sung 4 ảnh · Đã có 0 ảnh');qa.screenshot('02-original-copy-after-process-kill');press('Đã kiểm tra kết quả lấy giấy tờ')
    account();press('Đối chiếu tạo bản nháp');qa.wait('Đối chiếu và kết thúc yêu cầu?');qa.tap('Đối chiếu với máy chủ');press('Mở kết quả tạo bản nháp');qa.wait('Tiếp tục soạn hợp đồng');assert stats()['customerPhotoCopyWrites']==1
    qa.passed('After process kill, Account recovers the original four-paper proof and saved metadata separately; acknowledgements keep the one original draft/image/copy')
    press('Ảnh và hồ sơ nghiệp vụ');press('Lấy giấy tờ từ hồ sơ khách');qa.wait('Lấy giấy tờ vào hợp đồng');mode('copy-drop');press('Lấy giấy tờ vào hợp đồng');qa.wait('Đối chiếu lấy giấy tờ với máy chủ');press('Đối chiếu lấy giấy tờ với máy chủ');await_cancelled();assert request('/__fixture_customer_copy_late',{})['lateStatus']==409
    press('Tải lại kết quả lấy giấy tờ');press('Lấy giấy tờ vào hợp đồng');qa.wait('Đã bổ sung 0 ảnh · Đã có 4 ảnh');qa.screenshot('03-no-op-copy-original-images');press('Đã kiểm tra kết quả lấy giấy tờ');assert stats()['customerPhotoCopyWrites']==2
    account();qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.screenshot('04-copy-ledger-empty');press('Đăng xuất');qa.wait('Đăng nhập');assert stats()['activeSessions']==0
    qa.passed('Dropped no-op copy is durably tombstoned before late409; retry preserves all four existing papers, records zero new images and returns an empty ledger/logout0')
    diagnostics=collect(qa,module.PACKAGE);assert not diagnostics['errors'] and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
    assert source_snapshot()==qa.source_files and preserved()==before
    final=stats();qa.output.joinpath('fixture-final.json').write_text(json.dumps(final,ensure_ascii=False,indent=2),encoding='utf-8')
    result={'status':'passed','passed':len(qa.checks),'checks':qa.checks,'fixtureOnly':True,'physicalDeviceTested':True,'fullAppCertified':False,'sourceFilesVerified':len(qa.source_files),'newAppCrashes':0,'newAppAnrs':0,'newSystemUiAnrs':0,'operationalWrites':0,'completedAt':datetime.now(timezone.utc).isoformat()};qa.output.joinpath('results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
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
