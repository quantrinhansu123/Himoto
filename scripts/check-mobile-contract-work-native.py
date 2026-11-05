"""Synthetic private-files Samsung test, using the actual Expo58 filesystem adapter.

This does not certify the future draft-form/Account integration or iPhone.
It never calls operational writes, touches the pending ledger or opens a gallery.
"""
import argparse,ast,hashlib,importlib.util,json,re,time,urllib.request,uuid
from datetime import datetime,timezone
from pathlib import Path
from lib.mobile_native_provenance import capture,source_snapshot
from lib.mobile_native_diagnostics import collect

parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
assert not args.output.exists()
spec=importlib.util.spec_from_file_location('nativeqa',Path(__file__).with_name('check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
tree=ast.parse(Path('scripts/check-mobile-gps-native.py').read_text(encoding='utf-8'));names={'reveal','press','enter_login_field','login','routes','tabs'};nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names];assert len(nodes)==len(names)
exec(compile(ast.Module(body=nodes,type_ignores=[]),'gps-qa-helpers','exec'),globals())
run_id=str(uuid.uuid4());launch=f'himoto://contract-work-qa?run={run_id}'
watch_path=Path('.backups/mobile-contract-flow-fixture-20261102/state.json')
before=None;original_routes=None

def start_screen():
    qa.command('shell',f"am start -W -a android.intent.action.VIEW -d '{launch}' -p {module.PACKAGE}")
    qa.wait('QA lưu bản đang soạn',timeout=90)

def original_uuid():
    root=qa.tree();rows=[]
    for n in root.iter('node'):
        text=n.get('text','')
        if text.startswith('QA metadata '):
            value=text.rsplit(' ',1)[-1];uuid.UUID(value);rows.append(value)
    assert len(set(rows))==1,'One exact synthetic metadata attempt expected';return rows[0]

def cold():
    qa.launch();root=qa.wait_any(['Định vị GPS','Đăng nhập'],timeout=150)
    if qa.matches(root,'Đăng nhập'):login('qa')
    start_screen()

def preserve_other_checkpoints():
    paths=[Path('.backups')/name/'state.json' for name in ['mobile-contract-photo-order-fixture-20261103-run1','mobile-media-delete-fixture-20261103-run1','mobile-media-delete-fixture-20261103-run2','mobile-customer-photo-copy-fixture-20261103-run1']]
    return {str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths if p.is_file()}

try:
    original_routes=routes();assert original_routes=={'tcp:8081':'tcp:8081','tcp:8091':'tcp:8101'}
    with urllib.request.urlopen('http://127.0.0.1:8101/health',timeout=10) as reply:assert json.load(reply)['fixtureOnly']
    qa.command('shell','am','force-stop',module.PACKAGE);before=json.loads(watch_path.read_text(encoding='utf-8'))['state'];others=preserve_other_checkpoints()
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as reply:config=reply.read().decode()
    assert 'http://127.0.0.1:8091' in config and 'mobile-api.example.invalid' not in config
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as reply:entry=hashlib.file_digest(reply,'sha256').hexdigest()
    qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip());qa.verify_device_network()
    cold();qa.wait('QA: Đã đọc lại từ file');press('QA: Tạo bản và ảnh');qa.wait('QA: Đã lưu form và ảnh riêng',timeout=90);qa.screenshot('01-native-owned-files')
    qa.passed('Actual SDK58 File create/write/copy/hash/arrayBuffer prepares an owned JPEG and full synthetic Vietnamese form, drops only its QA cache output and cold-reads the durable association without backend writes')
    press('QA: Chuẩn bị mã metadata');qa.wait('QA: Mã gốc đã lưu trước reserve');pending=original_uuid();qa.screenshot('02-native-planned-key')
    cold();qa.wait('QA: Đã đọc lại từ file');assert original_uuid()==pending;press('QA: Kiểm tra dữ liệu gốc');qa.wait('QA: Khôi phục form ảnh và mã gốc đạt');qa.screenshot('03-native-kill-restore')
    qa.passed('Real process kill restores exact manual driver/money/step/photo and the original metadata UUID; an existing reservation requires resolver recovery instead of another send')
    press('QA: Xác nhận phiếu tổng hợp');qa.wait('QA: Đã khôi phục ID gốc trước xóa mã');cold();qa.wait('QA: Đã đọc lại từ file');assert original_uuid()==pending;qa.wait('QA contract 92001');press('QA: Kiểm tra dữ liệu gốc');qa.wait('QA: Khôi phục form ảnh và mã gốc đạt');qa.screenshot('04-native-original-id')
    qa.passed('Synthetic receipt and local acknowledgement survive a second real process kill on original ID92001; only the fake QA ledger completion runs after the persisted acknowledgement')
    press('QA: Tạo ghi dở và kiểm tra');qa.wait('QA: Ghi dở bị chặn bản cũ còn nguyên');qa.screenshot('05-native-partial-generation');cold();qa.wait('Không đọc hoặc ghi được bản đang soạn trên thiết bị. Dữ liệu trước được giữ; chưa được gửi tiếp.');qa.screenshot('06-native-partial-restart-blocked')
    qa.passed('Actual native partial generation leaves the sealed state SHA unchanged and blocks restart rather than returning an empty/older queue; no cleanup or reset hides the failed generation')
    qa.command('shell',f"am start -W -a android.intent.action.VIEW -d 'himoto://' -p {module.PACKAGE}");qa.wait('Định vị GPS');qa.tap('Tài khoản',bottom=True);press('Tải lại danh sách đối chiếu');qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.screenshot('07-original-ledger-untouched')
    after=json.loads(watch_path.read_text(encoding='utf-8'))['state'];changed=sorted(k for k in set(before)|set(after) if before.get(k)!=after.get(k));assert set(changed)<={'sessions','sessionSeq'}
    assert source_snapshot()==qa.source_files and preserve_other_checkpoints()==others and routes()==original_routes
    diagnostics=collect(qa,module.PACKAGE);assert not diagnostics['errors'] and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
    result={'status':'passed','passed':len(qa.checks),'checks':qa.checks,'fixtureOnly':True,'physicalDeviceTested':True,'nativeFileAdapterExecuted':True,'formIntegrationEnabled':False,'fullAppCertified':False,'operationalWrites':0,'sourceFilesVerified':len(qa.source_files),'newAppCrashes':0,'newAppAnrs':0,'newSystemUiAnrs':0,'pendingLedgerUntouched':True,'watchChangedKeys':changed,'qaScope':f'https://{run_id}.contract-work-native-qa.invalid','qaWorkId':run_id,'qaRequestId':pending,'qaOriginalId':92001,'intentionallyIncompleteSyntheticGenerationRetained':True,'completedAt':datetime.now(timezone.utc).isoformat()}
    qa.output.joinpath('results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
except Exception as error:
    result={'status':'failed','passed':len(qa.checks),'checks':qa.checks,'error':str(error),'fixtureOnly':True,'qaWorkId':run_id,'qaScope':f'https://{run_id}.contract-work-native-qa.invalid','completedAt':datetime.now(timezone.utc).isoformat()};qa.output.joinpath('results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    try:qa.screenshot('failure')
    except Exception:pass
    raise
finally:
    if original_routes is not None:assert routes()==original_routes
