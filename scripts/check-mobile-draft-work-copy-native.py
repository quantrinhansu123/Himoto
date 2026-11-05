"""Samsung customer-paper copy through durable draft work, lost response and cold cancellation; synthetic only."""
import argparse,ast,base64,hashlib,importlib.util,io,json,re,time,urllib.request
from pathlib import Path
from datetime import datetime,timezone
from zoneinfo import ZoneInfo
from PIL import Image,ImageDraw,ImageFont
from lib.mobile_native_provenance import capture,source_snapshot
from lib.mobile_native_diagnostics import collect

parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--fixture-port',type=int,default=8129);parser.add_argument('--state-file',type=Path,required=True);args=parser.parse_args()
assert 8100<=args.fixture_port<=8199 and not args.output.exists()
spec=importlib.util.spec_from_file_location('nativeqa',Path(__file__).with_name('check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
def helpers(file,names):
    tree=ast.parse(Path(file).read_text(encoding='utf-8'));nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names];assert len(nodes)==len(names)
    exec(compile(ast.Module(body=nodes,type_ignores=[]),file,'exec'),globals())
helpers('scripts/check-mobile-gps-native.py',{'reveal','press','enter_login_field','login','tabs','routes'})
helpers('scripts/check-mobile-customer-documents-native.py',{'bounds','tap_node','create_photo','exact_picker_timestamp'})
helpers('scripts/check-mobile-draft-work-native.py',{'text','pick','codec','cold_account'})
photo_name='Himoto-Media-QA-'+str(time.time_ns())+'.jpg';phone_path='/sdcard/Download/'+photo_name;photo_path=args.output/'synthetic-native-picker.jpg';picker_identity=None
def request(path,body=None):
    req=urllib.request.Request(f'http://127.0.0.1:{args.fixture_port}'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'} if body is not None else {})
    with urllib.request.urlopen(req,timeout=12) as r:data=json.load(r)
    assert data['fixtureOnly'];return data
def stats():return request('/__fixture_state')
def mode(value):request('/__fixture_mode',{'mode':value})
def preserved():
    # Hash every retained mobile fixture checkpoint, including prior form runs.
    files=sorted(Path('.backups').glob('mobile-*/state.json'))
    return {str(path):hashlib.sha256(path.read_bytes()).hexdigest() for path in files if '-fixture-' in path.parent.name and path.resolve()!=args.state_file.resolve()}

def await_cancelled():
    deadline=time.monotonic()+30
    while time.monotonic()<deadline:
        s=json.loads(args.state_file.read_text(encoding='utf-8'))['state'];delayed=s.get('delayed_customer_photo_copy')
        if delayed and delayed['headers']['idempotency-key'] in s.get('tombstones',{}):return
        time.sleep(.2)
    raise AssertionError('Copy cancellation not durable before late delivery')
def account():
    tabs();qa.tap('Tài khoản',bottom=True);press('Tải lại bản đang soạn trên thiết bị');press('Tải lại danh sách đối chiếu')

def empty_work():
    account();reveal('Không có bản đang soạn được giữ trên thiết bị.',True);reveal('Không có thao tác chờ đối chiếu trong phạm vi này.')

def start_customer_draft(number):
    qa.tap('Hợp đồng',bottom=True);qa.tap('Thêm bản nháp');text('Số hợp đồng giấy',number);qa.tap('Bước 2: Khách hàng');press('Chọn hồ sơ khách');qa.tap('Chọn khách Khách hợp đồng QA, QA-001');qa.tap('Dùng hồ sơ đã chọn')
    press('Bước 5: Ký kết & ghi chú',True);text('Ghi chú bản nháp','LocalMemoQA')

def original_work():
    qa.wait('Bước 5: Ký kết & ghi chú');reveal('Ghi chú bản nháp');assert any(n.get('text')=='LocalMemoQA' for n in qa.matches(qa.tree(),'Ghi chú bản nháp'))

def cold_copy_account():
    cold_account();reveal('Đối chiếu lấy giấy tờ khách vào hợp đồng #'+str(stats()['drafts'][-1]['id']))

previous=None;before=None
try:
    initial=stats();assert initial['draftCreates']==initial['contractPhotoWrites']==initial['customerPhotoCopyWrites']==initial['activeSessions']==0,'Use a fresh checkpoint, never reset acceptance data'
    request('/__fixture_customer_copy_sources',{})
    qa.command('shell','am','force-stop',module.PACKAGE);time.sleep(1);before=preserved();qa.output.joinpath('preserved-checkpoints-before.json').write_text(json.dumps(before,indent=2),encoding='utf-8')
    print('Prewarming frozen source for exclusive Samsung durable-copy acceptance.',flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as r:config=r.read().decode()
    assert 'http://127.0.0.1:8091' in config and 'mobile-api.example.invalid' not in config
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as r:entry=hashlib.file_digest(r,'sha256').hexdigest()
    previous=routes();assert previous=={'tcp:8081':'tcp:8081','tcp:8091':'tcp:8101'};qa.command('reverse','tcp:8091',f'tcp:{args.fixture_port}');qa.verify_device_network();qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip())
    qa.launch();qa.wait('Đăng nhập',timeout=150);login('qa');empty_work();start_customer_draft('96031');create_photo();pick('Chọn ảnh hợp đồng');reveal('Bỏ ảnh đang chọn · Khi thuê · Hợp đồng đã ký');mode('copy-lost');press('Lưu nháp');qa.wait('Hoàn tất ảnh hợp đồng',timeout=90);assert stats()['customerPhotoCopyWrites']==0
    press('Lưu ảnh vào đúng hồ sơ');qa.tap('Xác nhận lưu ảnh');qa.wait('Đối chiếu lấy giấy tờ với máy chủ',timeout=90)
    first=stats();assert first['draftCreates']==first['contractPhotoWrites']==first['customerPhotoCopyWrites']==1
    state=json.loads(args.state_file.read_text(encoding='utf-8'))['state'];event=state['customer_photo_copy_events'][0];assert event['draftCreates']==event['photosBeforeCopy']==1
    original=next(iter(state['customer_photo_copy_receipts'].values()))['receipt'];assert original['id']==2001 and original['copied']==4 and original['customerId']==1
    # The fixture stores numeric IDs in receipts; never coerce an unexpected target.
    qa.screenshot('01-copy-after-owned-photo-lost')
    qa.passed('The real work saves one metadata draft and its owned native image before customer-paper copy; lost copy response keeps the original copy request and one contract/four-paper result')
    cold_copy_account();press('Đối chiếu lấy giấy tờ khách vào hợp đồng #2001');qa.tap('Đối chiếu với máy chủ');press('Mở kết quả lấy giấy tờ khách vào hợp đồng #2001');original_work();press('Hoàn tất giấy tờ bản nháp đã lưu',True);qa.wait('Phiếu lấy giấy tờ đã ghi',timeout=90);reveal('Đã bổ sung 4 ảnh · Đã có 0 ảnh');qa.screenshot('02-copy-receipt-from-original-work');press('Đã kiểm tra kết quả lấy giấy tờ');qa.wait('Tiếp tục soạn hợp đồng',timeout=90)
    assert stats()['draftCreates']==stats()['contractPhotoWrites']==stats()['customerPhotoCopyWrites']==1;empty_work();qa.screenshot('03-first-work-finished')
    qa.passed('After process kill Account opens the original durable work with exact note, ID and already-saved photo; copy receipt acknowledgement finishes that work and clears its ledger without another draft/photo/copy')
    start_customer_draft('96032');mode('copy-drop');press('Lưu nháp');qa.wait('Đối chiếu lấy giấy tờ với máy chủ',timeout=90);assert stats()['draftCreates']==2 and stats()['contractPhotoWrites']==stats()['customerPhotoCopyWrites']==1;qa.screenshot('04-copy-only-work-dropped')
    cold_copy_account();press('Đối chiếu lấy giấy tờ khách vào hợp đồng #2002');qa.tap('Đối chiếu với máy chủ');qa.wait('Đã xác nhận thao tác chưa được ghi và khóa mã cũ. Có thể mở lại hồ sơ để tiếp tục.');await_cancelled();assert request('/__fixture_customer_copy_late',{})['lateStatus']==409
    assert stats()['customerPhotoCopyWrites']==1;qa.screenshot('05-copy-cancelled-after-process-kill')
    qa.passed('The no-photo draft enters copy directly; process kill and Account cancellation settle the linked local copy attempt before ledger removal, and the original delayed request returns409')
    press('Mở bản đang soạn 96032',True);original_work();press('Hoàn tất giấy tờ bản nháp đã lưu',True);qa.wait('Tiếp tục soạn hợp đồng',timeout=120)
    final=stats();assert final['draftCreates']==2 and final['contractPhotoWrites']==1 and final['customerPhotoCopyWrites']==2
    state=json.loads(args.state_file.read_text(encoding='utf-8'))['state'];assert len(state['tombstones'])==1
    copies=[row['receipt'] for row in state['customer_photo_copy_receipts'].values()];assert sorted(row['id'] for row in copies)==[2001,2002] and all(row['copied']==4 and row['sourceCount']==4 and row['presentCount']==0 for row in copies)
    assert copies[0]['requestId']==original['requestId']
    assert all(row['input']['notes']=='LocalMemoQA' and row['input']['draft']['customer_id']==1 for row in final['drafts'])
    owned={k:v for k,v in state['contract_photos'].items() if not k.endswith(':rental-document-1')};assert len(owned)==8
    for contract in (2001,2002):
        assert {key.split(':',1)[1] for key in owned if key.startswith(str(contract)+':')}=={'customer-id-front','customer-id-back','customer-driver-license','customer-id-front-extra-2'}
        for source in state['document_photos'].values():
            slot=re.sub(r'^(id_front|id_back|driver_license)',lambda match:{'id_front':'customer-id-front','id_back':'customer-id-back','driver_license':'customer-driver-license'}[match[1]],source['photo']['slot'])
            assert owned[f'{contract}:{slot}']['jpeg']==source['jpeg']
    codec();empty_work();qa.screenshot('06-both-works-finished-ledger-empty');press('Đăng xuất');qa.wait('Đăng nhập');assert stats()['activeSessions']==0
    qa.passed('Resuming the cancelled work retries only copy on original contract2002, preserves exact customer/note, records two four-paper results and one selected JPEG overall, then both local works/ledger finish and logout0')
    diagnostics=collect(qa,module.PACKAGE);assert not diagnostics['errors'] and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
    assert source_snapshot()==qa.source_files and preserved()==before
    qa.output.joinpath('fixture-final.json').write_text(json.dumps(stats(),ensure_ascii=False,indent=2),encoding='utf-8')
    result={'status':'passed','passed':len(qa.checks),'checks':qa.checks,'fixtureOnly':True,'physicalDeviceTested':True,'durableWorkCopyTested':True,'fullAppCertified':False,'sourceFilesVerified':len(qa.source_files),'newAppCrashes':0,'newAppAnrs':0,'newSystemUiAnrs':0,'operationalWrites':0,'completedAt':datetime.now(timezone.utc).isoformat()};qa.output.joinpath('results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
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
