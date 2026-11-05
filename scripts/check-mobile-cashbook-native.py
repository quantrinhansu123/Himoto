"""Focused Samsung cashbook happy path; same preserved QA8131 checkpoint."""
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
exec(compile(ast.Module(body=nodes,type_ignores=[]),'cashbook-smoke-helpers','exec'),globals())
state_path=Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json');before=json.loads(state_path.read_text(encoding='utf-8'))['state']
preserved={str(path):hashlib.sha256(path.read_bytes()).hexdigest() for path in Path('.backups').glob('mobile-*/state.json') if '-fixture-' in path.parent.name and path.resolve()!=state_path.resolve()}
def stats():
    with urllib.request.urlopen('http://127.0.0.1:8131/__fixture_state',timeout=12) as response:value=json.load(response)
    assert value['fixtureOnly'] and value['vehicleWorkspace'];return value['cashbookWorkspace']
def account_empty():
    tabs();qa.tap('Tài khoản',bottom=True);press('Tải lại bản đang soạn trên thiết bị');reveal('Không có bản đang soạn được giữ trên thiết bị.');press('Tải lại danh sách đối chiếu');reveal('Không có thao tác chờ đối chiếu trong phạm vi này.')
def edit(label,value):
    assert re.fullmatch(r'[A-Za-z0-9-]+',value);qa.hide_keyboard();reveal(label);qa.text(label,value,replace=True);qa.hide_keyboard()
def acknowledge():
    qa.wait('Đã ghi nhận két #12001',timeout=60);press('Đã kiểm tra xác nhận tài khoản sổ quỹ');qa.wait('KetDemo0311')
def reconciliation():
    for _ in range(12):
        root=qa.tree()
        labels=[n.get('text','') for n in root.iter('node') if n.get('package')==module.PACKAGE and n.get('text','').startswith('Tổng tất cả phiếu chi:')]
        if labels:
            assert len(labels)==1 and '160.000' in labels[0];reveal(labels[0]);return
        qa.command('shell','input','swipe','500','1400','500','550','350')
    raise AssertionError('Category reconciliation totals not visible')
result={'status':'failed','error':'Not completed'}
try:
    expected={'tcp:8081':'tcp:8081','tcp:8091':'tcp:8131'};current_routes=routes()
    assert all(current_routes.get(key,value)==value for key,value in expected.items()),'Unexpected QA reverse mapping'
    assert not stats()['requests'],'Earlier cashbook writes exist; reconcile original UUID first'
    for key,value in expected.items():
        if key not in current_routes:qa.command('reverse',key,value)
    assert routes()==expected
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as response:config=response.read().decode()
    assert 'http://127.0.0.1:8091' in config
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
    qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip());(qa.output/'started-epoch.json').write_text(json.dumps({'startedEpoch':qa.started_epoch}),encoding='utf-8')
    qa.launch();qa.wait('Lập hợp đồng',timeout=150);account_empty();tabs();qa.tap('Tổng quan',bottom=True);press('Mở Sổ quỹ / Sổ két');qa.wait('Doanh thu thuê xe');qa.screenshot('01-cashbook-summary');press('Chi tiết và đối chiếu thu chi');reconciliation();qa.screenshot('02-category-reconciliation')
    press('Tài khoản ngân hàng và két',True);qa.wait('Thêm tài khoản sổ quỹ');press('Mở tài khoản Két QA cơ sở');qa.wait('Danh sách thu chi của tài khoản');press('Danh sách thu chi của tài khoản');qa.wait('Thu chi két #12000');qa.screenshot('03-account-transactions');qa.back();qa.wait('Danh sách thu chi của tài khoản');qa.back();qa.wait('Thêm tài khoản sổ quỹ')
    qa.passed('Samsung opens cashbook/category reconciliation and existing cash account all-time balance plus its approved transaction list on the current QA server')
    press('Thêm tài khoản sổ quỹ');qa.wait('Tên két / nội dung');edit('Tên két / nội dung','KetDemo0311');edit('Số dư đầu kỳ (đồng)','1000000');press('Rà soát và thêm tài khoản');qa.wait('Thêm tài khoản sổ quỹ?');qa.tap('Xác nhận');acknowledge();work=stats();assert len(work['requests'])==1 and work['profiles']['cash:12001']['opening']==1000000;qa.screenshot('04-created-cash')
    press('Sửa tài khoản sổ quỹ');qa.wait('Số dư đầu kỳ (đồng)');edit('Số dư đầu kỳ (đồng)','-500');press('Rà soát và lưu tài khoản');qa.wait('Lưu thay đổi tài khoản?');qa.tap('Xác nhận');acknowledge();assert stats()['profiles']['cash:12001']['opening']==-500
    press('Ngừng sử dụng tài khoản');qa.wait('Ngừng sử dụng tài khoản?');qa.tap('Xác nhận ngừng sử dụng');acknowledge();assert stats()['profiles']['cash:12001']['status']=='inactive';qa.screenshot('05-inactive-cash')
    qa.passed('Native create/edit/stop-using keep the same cash ID, permit a signed opening amount and acknowledge three separate original UUID/revision receipts')
    press('Xóa tài khoản sổ quỹ');qa.wait('Xóa tài khoản sổ quỹ?');qa.tap('Xóa tài khoản',bottom=True);qa.wait('Đã ghi nhận két #12001');qa.screenshot('06-delete-receipt');press('Đã kiểm tra xác nhận tài khoản sổ quỹ');qa.wait('Thêm tài khoản sổ quỹ');assert 'cash:12001' not in stats()['profiles'] and len(stats()['requests'])==4
    account_empty();qa.screenshot('07-empty-work-ledger');tabs();qa.tap('Tổng quan',bottom=True);reveal('Lập hợp đồng',True);qa.screenshot('08-demo-ready')
    after=json.loads(state_path.read_text(encoding='utf-8'))['state'];assert {key:value for key,value in after.items() if key!='cashbook_workspace'}=={key:value for key,value in before.items() if key!='cashbook_workspace'}
    assert after['cashbook_workspace']['vouchers']==before['cashbook_workspace']['vouchers']
    for name,sha in preserved.items():assert hashlib.sha256(Path(name).read_bytes()).hexdigest()==sha
    assert source_snapshot()==qa.source_files
    diagnostics=collect(qa,module.PACKAGE);assert diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0 and not diagnostics['errors']
    qa.passed('Delete of unused cash returns its exact receipt, all original fields/vouchers/checkpoints survive, work/ledger are empty and Samsung remains on overview')
    result={'status':'passed','checks':qa.checks,'focusedHappyPathOnly':True,'fixtureOnly':True,'cashbookRequests':4,'cashId':12001,'sourceFilesMatch':len(qa.source_files),'priorCheckpointsPreserved':len(preserved),'preExistingFieldsUnchanged':True,'pendingLedgerEmpty':True,'openWorkEmpty':True,'diagnostics':diagnostics,'hostApiPort':8131,'fullAcceptance':False,'completedAt':datetime.now(timezone.utc).isoformat()}
except Exception as error:
    result={'status':'failed','checks':qa.checks,'error':str(error),'errorType':type(error).__name__,'completedAt':datetime.now(timezone.utc).isoformat()}
    try:qa.screenshot('failure')
    except Exception:pass
    raise
finally:
    result['reverseMappingsKept']=routes();(qa.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
