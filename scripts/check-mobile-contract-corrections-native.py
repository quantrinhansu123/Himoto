"""Samsung correction review smoke; no financial submission or old UUID replay."""
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
state_path=Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json');before=json.loads(state_path.read_text(encoding='utf-8'));assert 'contract_corrections_workspace'in before['state']and not before['state']['accounts_workspace']['admin_tokens'];(qa.output/'before-state.json').write_text(json.dumps(before,ensure_ascii=False),encoding='utf-8');preserved=json.loads(Path('.backups/mobile-cashbook-delete-native-20261103-run1/preserved-checkpoints.json').read_text(encoding='utf-8'))
try:
    assert routes()=={'tcp:8081':'tcp:8081','tcp:8091':'tcp:8131'};assert not re.search(r'\bshowing=true\b',qa.command('shell','dumpsys','window','policy')),'User must unlock device'
    print('Prewarming correction source; one UI reader, cancel before financial submission.',flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180)as response:assert'http://127.0.0.1:8091'in response.read().decode()
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600)as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
    qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip());qa.launch();root=qa.wait_any(['Tài khoản','Đăng nhập'],timeout=150)
    if qa.matches(root,'Đăng nhập'):login('qa')
    account_empty();tabs();qa.tap('Hợp đồng',bottom=True);qa.wait('Tìm hợp đồng',timeout=90)
    if qa.matches(qa.tree(),'Xóa tìm kiếm'):qa.tap('Xóa tìm kiếm')
    qa.text('Tìm hợp đồng','9405',replace=False);qa.hide_keyboard();qa.wait('Xem CORRECT9405, Khách sửa tiền QA',timeout=90);press('Xem CORRECT9405, Khách sửa tiền QA');press('Sửa cọc / khoản đã thu');qa.wait('Phiếu thu cần sửa',timeout=90);qa.screenshot('01-receipt-deposit-and-real-ledger')
    press('Tách thêm khoản tiền mặt / chuyển khoản');qa.screenshot('02-split-receipt-routing');reveal('Lý do sửa khoản thu');qa.text('Lý do sửa khoản thu','9405001',replace=False);qa.hide_keyboard();press('Kiểm tra sửa cọc / khoản thu');qa.wait('Xác nhận sửa phiếu đã ghi?');qa.screenshot('03-receipt-review-before-submit');press('Tiếp tục chỉnh sửa');qa.back();qa.wait('Rời màn sửa khoản thu?');press('Rời màn sửa khoản thu');qa.wait('Chi tiết hợp đồng',timeout=90)
    press('Sửa ngày / tiền thực thu gia hạn');qa.wait('Phiếu gia hạn cần sửa',timeout=90);qa.screenshot('04-renewal-voucher-picker');reveal('Số tiền thực tế đã thu (VND)');qa.text('Số tiền thực tế đã thu (VND)','110000',replace=True);qa.hide_keyboard();reveal('Lý do sửa gia hạn / khoản thu');qa.text('Lý do sửa gia hạn / khoản thu','9405002',replace=False);qa.hide_keyboard();press('Kiểm tra sửa ngày / tiền thực thu gia hạn');qa.wait('Xác nhận sửa phiếu đã ghi?');qa.screenshot('05-renewal-amount-and-time-review');press('Tiếp tục chỉnh sửa');qa.back();qa.wait('Rời màn sửa khoản thu?');press('Rời màn sửa khoản thu');qa.wait('Chi tiết hợp đồng',timeout=90)
    account_empty();tabs();qa.tap('Tổng quan',bottom=True);reveal('Lập hợp đồng',True);qa.screenshot('06-qa7-overview-empty-work-and-ledger')
    after=json.loads(state_path.read_text(encoding='utf-8'));changed,nested=verify_preserved_business(before['state'],after['state']);assert not after['state']['accounts_workspace']['admin_tokens']
    for filename,sha in preserved.items():assert hashlib.sha256(Path(filename).read_bytes()).hexdigest()==sha
    assert source_snapshot()==qa.source_files;diagnostics=collect(qa,module.PACKAGE);assert not diagnostics['errors']and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
    result={'status':'passed','fixtureOnly':True,'focusedPreviewOnly':True,'groups':['Initial receipts/deposit select/split/route/reason and cancel explicit correction','Renewal fee vs real collected/date fields, review and cancel','Restore QA7 overview and empty work/ledger with all old checkpoints preserved'],'sourceFilesMatch':len(qa.source_files),'qaGeneration':after['generation'],'allOldBusinessFieldsUnchanged':True,'oldFieldsChangedOnlyForQaAuth':changed,'nestedAuthExpiryChanges':nested,'previousCheckpointsPreserved':len(preserved),'nativeFinancialSubmissions':0,'operationalDatabaseWrites':0,'originalQaActorRestored':7,'openWorkEmpty':True,'pendingLedgerEmpty':True,'diagnostics':diagnostics,'reverseMappingsKept':routes(),'fullAcceptance':False,'completedAt':datetime.now(timezone.utc).isoformat()};(qa.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
except Exception:
    try:qa.screenshot('failure')
    except Exception:pass
    raise
