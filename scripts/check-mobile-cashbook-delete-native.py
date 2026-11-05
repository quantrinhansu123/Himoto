"""Samsung focused voucher-delete happy path: only the three new QA samples.

Never delete/reset earlier demo vouchers, business fields, receipts or ledger.
"""
import argparse
import ast
import hashlib
import importlib.util
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from lib.mobile_native_provenance import capture, source_snapshot
from lib.mobile_native_diagnostics import collect

parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();assert not args.output.exists()
spec=importlib.util.spec_from_file_location('nativeqa',Path('scripts/check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
tree=ast.parse(Path('scripts/check-mobile-gps-native.py').read_text(encoding='utf-8'));names={'reveal','press','tabs','routes'};nodes=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name in names];assert len(nodes)==len(names)
exec(compile(ast.Module(body=nodes,type_ignores=[]),'bulk-smoke-helpers','exec'),globals())
state_path=Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json');before=json.loads(state_path.read_text(encoding='utf-8'))['state']
preserved={str(path):hashlib.sha256(path.read_bytes()).hexdigest() for path in Path('.backups').glob('mobile-*/state.json') if '-fixture-' in path.parent.name and path.resolve()!=state_path.resolve()}
(qa.output/'before-state.json').write_text(json.dumps(before,ensure_ascii=False),encoding='utf-8');(qa.output/'preserved-checkpoints.json').write_text(json.dumps(preserved),encoding='utf-8')
def stats():
    with urllib.request.urlopen('http://127.0.0.1:8131/__fixture_state',timeout=12) as response:value=json.load(response)
    assert value['fixtureOnly'] and value['vehicleWorkspace'];return value['cashbookBulkWorkspace']
def account_empty():
    tabs();qa.tap('Tài khoản',bottom=True);press('Tải lại bản đang soạn trên thiết bị');reveal('Không có bản đang soạn được giữ trên thiết bị.');press('Tải lại danh sách đối chiếu');reveal('Không có thao tác chờ đối chiếu trong phạm vi này.')
result={'status':'failed','error':'Not completed'}
try:
    assert routes()=={'tcp:8081':'tcp:8081','tcp:8091':'tcp:8131'}
    work=stats();assert not work['requests'] and [row['id'] for row in work['rows']]==['15001','15002','15003'],'Resume original requests; never recreate QA samples after a written run'
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as response:assert 'http://127.0.0.1:8091' in response.read().decode()
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
    qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip());(qa.output/'started-epoch.json').write_text(json.dumps({'startedEpoch':qa.started_epoch}),encoding='utf-8')
    qa.launch();qa.wait('Lập hợp đồng',timeout=150);account_empty();tabs();qa.tap('Tổng quan',bottom=True);press('Mở Sổ quỹ / Sổ két');press('Phiếu chi (4)');press('Chọn phiếu chi #15003');press('Xóa phiếu đã chọn (1)',True);qa.wait('1 phiếu trong danh sách xóa');qa.screenshot('01-selected-voucher-review');press('Xóa 1 phiếu đã rà soát');qa.wait('Đã xác nhận xóa 1 phiếu',timeout=60);qa.screenshot('02-selected-delete-confirmed');press('Đóng kết quả xóa phiếu')
    work=stats();assert len(work['requests'])==1 and [row['id'] for row in work['rows']]==['15001','15002']
    qa.passed('Samsung selects only new QA expense15003, reviews count/amount and deletes it with its own confirmed batch UUID; old vouchers remain intact')
    press('Phiếu thu (9)',True);press('Bộ lọc sổ quỹ',True);qa.wait('Tìm phiếu thu chi');qa.text('Tìm phiếu thu chi','1500');qa.hide_keyboard();press('Ẩn bộ lọc sổ quỹ',True);qa.wait('Phiếu thu (2)');press('Xóa hết phiếu thu theo bộ lọc');qa.wait('2 phiếu trong danh sách xóa');reveal('Gõ XOA để xác nhận xóa toàn bộ danh sách');qa.text('Gõ XOA để xác nhận xóa toàn bộ danh sách','XOA');qa.hide_keyboard();qa.screenshot('03-all-filtered-review');press('Xóa 2 phiếu đã rà soát');qa.wait('Đã xác nhận xóa 2 phiếu',timeout=60);qa.screenshot('04-all-filtered-confirmed');press('Đóng kết quả xóa phiếu');work=stats();assert not work['rows'] and len(work['requests'])==2
    assert sorted(row['result']['deletedCount'] for row in work['requests'].values())==[1,2]
    qa.passed('Filtered delete-all freezes only new QA income15001/15002, requires XOA and confirms exactly two deletions under a second original UUID')
    account_empty();qa.screenshot('05-empty-work-ledger');tabs();qa.tap('Tổng quan',bottom=True);reveal('Lập hợp đồng',True);qa.screenshot('06-demo-ready')
    after=json.loads(state_path.read_text(encoding='utf-8'))['state'];assert {key:value for key,value in after.items() if key!='cashbook_bulk_workspace'}=={key:value for key,value in before.items() if key!='cashbook_bulk_workspace'}
    for name,sha in preserved.items():assert hashlib.sha256(Path(name).read_bytes()).hexdigest()==sha
    assert source_snapshot()==qa.source_files;diagnostics=collect(qa,module.PACKAGE);assert not diagnostics['errors'] and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
    qa.passed('Both normal-success batch UUIDs were reconciled; all pre-existing QA fields/checkpoints stay unchanged, work/ledger are empty, Samsung remains on overview and diagnostics report no new crash/ANR')
    result={'status':'passed','checks':qa.checks,'focusedHappyPathOnly':True,'fixtureOnly':True,'newSampleVouchersDeleted':3,'bulkRequests':2,'sourceFilesMatch':len(qa.source_files),'preExistingFieldsUnchanged':True,'priorCheckpointsPreserved':len(preserved),'openWorkEmpty':True,'pendingLedgerEmpty':True,'diagnostics':diagnostics,'fullAcceptance':False,'completedAt':datetime.now(timezone.utc).isoformat()}
except Exception as error:
    result={'status':'failed','checks':qa.checks,'error':str(error),'errorType':type(error).__name__,'completedAt':datetime.now(timezone.utc).isoformat()}
    try:qa.screenshot('failure')
    except Exception:pass
    raise
finally:
    result['reverseMappingsKept']=routes();(qa.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
