"""Samsung five-part issued editor smoke; cancel before sending any write."""
import argparse,ast,hashlib,importlib.util,json,re,urllib.request
from copy import deepcopy
from datetime import datetime,timezone
from pathlib import Path
from lib.mobile_native_provenance import capture,source_snapshot
from lib.mobile_native_diagnostics import collect
parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();assert not args.output.exists()
spec=importlib.util.spec_from_file_location('nativeqa',Path('scripts/check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
def helpers(file,names):
    tree=ast.parse(Path(file).read_text(encoding='utf-8'));nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in names];assert len(nodes)==len(names);exec(compile(ast.Module(body=nodes,type_ignores=[]),file,'exec'),globals())
helpers('scripts/check-mobile-gps-native.py',{'reveal','press','tabs','routes'})
helpers('scripts/check-mobile-managed-accounts-native.py',{'login','account_empty','verify_preserved_business'})
state_path=Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json');before=json.loads(state_path.read_text(encoding='utf-8'));assert 'contract_edit_workspace'in before['state']and not before['state']['accounts_workspace']['admin_tokens'];(qa.output/'before-state.json').write_text(json.dumps(before,ensure_ascii=False),encoding='utf-8');preserved=json.loads(Path('.backups/mobile-cashbook-delete-native-20261103-run1/preserved-checkpoints.json').read_text(encoding='utf-8'))
def part(index):
    press('Phần đang sửa',True);qa.tap(['1. Hợp đồng & pháp lý','2. Khách hàng','3. Phương tiện','4. Chi phí','5. Ký kết & ghi chú'][index])
try:
    assert routes()=={'tcp:8081':'tcp:8081','tcp:8091':'tcp:8131'};assert not re.search(r'\bshowing=true\b',qa.command('shell','dumpsys','window','policy')),'User must unlock device'
    print('Prewarming issued full-edit source; exclusive UI reader; no submission.',flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180)as response:assert'http://127.0.0.1:8091'in response.read().decode()
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600)as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
    qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip());qa.launch();root=qa.wait_any(['Tài khoản','Đăng nhập'],timeout=150)
    if qa.matches(root,'Đăng nhập'):login('qa')
    account_empty();tabs();qa.tap('Hợp đồng',bottom=True);qa.wait('Tìm hợp đồng',timeout=90)
    if qa.matches(qa.tree(),'Xóa tìm kiếm'):qa.tap('Xóa tìm kiếm')
    qa.text('Tìm hợp đồng','9305',replace=False);qa.hide_keyboard();qa.wait('Xem EDIT9305, Khách sửa QA',timeout=90);press('Xem EDIT9305, Khách sửa QA');press('Sửa đầy đủ hợp đồng');qa.wait('Phần đang sửa',timeout=90);qa.screenshot('01-issued-overwrite-warning-and-five-parts')
    part(1);reveal('Họ tên khách thuê');qa.screenshot('02-incomplete-customer-editable');part(2);reveal('Thêm / thay xe');qa.screenshot('03-vehicle-edit-and-historical-line-notice');part(3);reveal('Tiền cọc đã thu theo phiếu: 0\xa0₫');qa.screenshot('04-fees-and-ledger-amounts');part(4);reveal('Ghi chú hợp đồng');qa.text('Ghi chú hợp đồng','9305001',replace=False);qa.hide_keyboard();press('Kiểm tra và lưu hợp đồng');qa.wait('Ghi đè hợp đồng đã phát hành?');qa.screenshot('05-explicit-overwrite-confirmation');assert qa.matches(qa.tree(),'Xác nhận lưu đè hợp đồng');press('Tiếp tục chỉnh sửa');qa.back();qa.wait('Rời màn sửa hợp đồng?');press('Rời màn sửa');qa.wait('Chi tiết hợp đồng',timeout=90);account_empty();tabs();qa.tap('Tổng quan',bottom=True);reveal('Lập hợp đồng',True);qa.screenshot('06-qa7-overview-empty-work-and-ledger')
    after=json.loads(state_path.read_text(encoding='utf-8'));assert not after['state']['accounts_workspace']['admin_tokens'];changed,nested=verify_preserved_business(before['state'],after['state'])
    for filename,sha in preserved.items():assert hashlib.sha256(Path(filename).read_bytes()).hexdigest()==sha
    assert source_snapshot()==qa.source_files;diagnostics=collect(qa,module.PACKAGE);assert not diagnostics['errors']and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
    result={'status':'passed','fixtureOnly':True,'focusedPreviewOnly':True,'groups':['Issued five-part editor reuses legal/customer/vehicle/fees/note fields','Incomplete document stays editable and shows ledger/overwrite notice','Edit note, cancel explicit overwrite and leave; restore QA7 overview/empty work/ledger'],'sourceFilesMatch':len(qa.source_files),'qaGeneration':after['generation'],'allOldBusinessFieldsUnchanged':True,'oldFieldsChangedOnlyForQaAuth':changed,'nestedAuthExpiryChanges':nested,'previousCheckpointsPreserved':len(preserved),'nativeEditSubmissions':0,'operationalDatabaseWrites':0,'originalQaActorRestored':7,'openWorkEmpty':True,'pendingLedgerEmpty':True,'diagnostics':diagnostics,'reverseMappingsKept':routes(),'fullAcceptance':False,'completedAt':datetime.now(timezone.utc).isoformat()};(qa.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
except Exception:
    try:qa.screenshot('failure')
    except Exception:pass
    raise
