"""Samsung grouped terms/history/draft-delete preview; no submit or reset."""
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
state_path=Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json');before=json.loads(state_path.read_text(encoding='utf-8'));assert 'terms_actions_workspace'in before['state']and not before['state']['accounts_workspace']['admin_tokens'];(qa.output/'before-state.json').write_text(json.dumps(before,ensure_ascii=False),encoding='utf-8');preserved=json.loads(Path('.backups/mobile-cashbook-delete-native-20261103-run1/preserved-checkpoints.json').read_text(encoding='utf-8'))
def record(id,label):
    account_empty();tabs();qa.tap('Hợp đồng',bottom=True);qa.wait('Tìm hợp đồng',timeout=90)
    if qa.matches(qa.tree(),'Xóa tìm kiếm'):qa.tap('Xóa tìm kiếm')
    qa.text('Tìm hợp đồng',id,replace=False);qa.hide_keyboard();press(label)
try:
    assert routes()=={'tcp:8081':'tcp:8081','tcp:8091':'tcp:8131'};assert not re.search(r'\bshowing=true\b',qa.command('shell','dumpsys','window','policy')),'User must unlock device'
    print('Prewarm grouped terms/history/delete source; one UI reader, zero submissions.',flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180)as response:assert'http://127.0.0.1:8091'in response.read().decode()
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600)as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
    qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip());qa.launch();root=qa.wait_any(['Tài khoản','Đăng nhập'],timeout=150)
    if qa.matches(root,'Đăng nhập'):login('qa')
    record('9301','Xem EDIT9301, Khách sửa ngày QA');press('Lịch sử / phiếu thu chi hợp đồng');qa.wait('Nội dung lịch sử');qa.screenshot('01-real-history-before-after-and-approved-totals');press('Nội dung lịch sử');qa.tap('Phiếu thu / chi (33)');reveal('Phiếu #12 · Thu 990.000\xa0₫');qa.screenshot('02-cancelled-voucher-retained');qa.back();qa.wait('Chi tiết hợp đồng');press('Sửa tiền / ngày thuê');qa.wait('Dòng xe sửa tiền / ngày thuê');reveal('Tổng tiền hợp đồng sau sửa (VND)');qa.text('Tổng tiền hợp đồng sau sửa (VND)','315000');qa.hide_keyboard();reveal('Lý do sửa tiền / ngày thuê');qa.text('Lý do sửa tiền / ngày thuê','9301001',replace=False);qa.hide_keyboard();press('Kiểm tra tiền / ngày thuê đã sửa');qa.wait('Lưu tiền / ngày thuê đã sửa?');qa.screenshot('03-terms-real-paid-and-explicit-review');press('Tiếp tục chỉnh sửa');qa.back();qa.wait('Rời màn sửa tiền / ngày thuê?');press('Rời màn sửa tiền / ngày thuê');qa.wait('Chi tiết hợp đồng')
    record('9306','Xem EDIT9306, Khách thời hạn QA');press('Thời hạn / mức đóng thuê sở hữu');qa.wait('EDIT9306');reveal('Thời hạn thuê sở hữu');qa.screenshot('04-ownership-terms-readonly-for-branch-role');assert not qa.matches(qa.tree(),'Kiểm tra thời hạn / mức đóng');qa.back();qa.wait('Chi tiết hợp đồng')
    record('9312','Xem DRAFT9312, Khách nháp xóa QA');press('Xóa nháp trên máy chủ');qa.wait('Kiểm tra và xóa nháp máy chủ');press('Kiểm tra và xóa nháp máy chủ');qa.wait('Xóa bản nháp trên máy chủ?');qa.screenshot('05-server-draft-delete-review-cancel');press('Tiếp tục chỉnh sửa');qa.back();qa.wait('Chi tiết hợp đồng');account_empty();tabs();qa.tap('Tổng quan',bottom=True);reveal('Lập hợp đồng',True);qa.screenshot('06-qa7-overview-empty-work-ledger')
    after=json.loads(state_path.read_text(encoding='utf-8'));changed,nested=verify_preserved_business(before['state'],after['state']);assert not after['state']['accounts_workspace']['admin_tokens']
    for filename,sha in preserved.items():assert hashlib.sha256(Path(filename).read_bytes()).hexdigest()==sha
    assert source_snapshot()==qa.source_files;diagnostics=collect(qa,module.PACKAGE);assert not diagnostics['errors']and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
    result={'status':'passed','fixtureOnly':True,'focusedPreviewOnly':True,'groups':['Actual history/voucher totals and retained cancelled receipt','Rental terms local edit and explicit review/cancel without money write','Ownership terms read-only for branch role and server draft delete review/cancel','Restore QA7 Overview with empty work/ledger and all old checkpoints'],'sourceFilesMatch':len(qa.source_files),'qaGeneration':after['generation'],'allOldBusinessFieldsUnchanged':True,'oldFieldsChangedOnlyForQaAuth':changed,'nestedAuthExpiryChanges':nested,'previousCheckpointsPreserved':len(preserved),'nativeFinancialSubmissions':0,'nativeDeletes':0,'operationalDatabaseWrites':0,'originalQaActorRestored':7,'openWorkEmpty':True,'pendingLedgerEmpty':True,'diagnostics':diagnostics,'reverseMappingsKept':routes(),'fullAcceptance':False,'completedAt':datetime.now(timezone.utc).isoformat()};(qa.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
except Exception:
    try:qa.screenshot('failure')
    except Exception:pass
    raise
