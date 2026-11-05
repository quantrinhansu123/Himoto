"""Read-only Samsung store navigation smoke; store writes are tested in isolated SQL."""
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

parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',required=True,type=Path);args=parser.parse_args();assert not args.output.exists()
spec=importlib.util.spec_from_file_location('nativeqa',Path('scripts/check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
tree=ast.parse(Path('scripts/check-mobile-gps-native.py').read_text(encoding='utf-8'));names={'reveal','press','tabs','routes'};nodes=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name in names];assert len(nodes)==len(names)
exec(compile(ast.Module(body=nodes,type_ignores=[]),'store-smoke-helpers','exec'),globals())
state_path=Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json')
before=json.loads(state_path.read_text(encoding='utf-8'))['state']
preserved={str(path):hashlib.sha256(path.read_bytes()).hexdigest() for path in Path('.backups').glob('mobile-*/state.json') if '-fixture-' in path.parent.name and path.resolve()!=state_path.resolve()}
result={'status':'failed','error':'Not completed'}
try:
    assert routes()=={'tcp:8081':'tcp:8081','tcp:8091':'tcp:8131'}
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
    qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip());(qa.output/'started-epoch.json').write_text(json.dumps({'startedEpoch':qa.started_epoch}),encoding='utf-8')
    qa.launch();qa.wait('Lập hợp đồng',timeout=150);press('Mở Cơ sở');qa.wait('Thêm cơ sở');qa.tap('Xem Cơ sở QA');qa.wait('Mã cơ sở');qa.screenshot('01-store-profile');press('Chỉnh sửa cơ sở');qa.wait('Tên cơ sở');qa.screenshot('02-store-editor');qa.back();qa.wait('Mã cơ sở');qa.back();qa.wait('Thêm cơ sở');qa.tap('Thêm cơ sở');qa.wait('Mã cơ sở');qa.screenshot('03-new-store-defaults');qa.back()
    qa.passed('Samsung opens the typed store profile and current editor, then a new-store form with web defaults; both untouched forms close without writes')
    tabs();qa.tap('Tài khoản',bottom=True);press('Tải lại bản đang soạn trên thiết bị');reveal('Không có bản đang soạn được giữ trên thiết bị.');press('Tải lại danh sách đối chiếu');reveal('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.screenshot('04-empty-work-ledger');tabs();qa.tap('Tổng quan',bottom=True);reveal('Lập hợp đồng',True);qa.screenshot('05-demo-ready')
    after=json.loads(state_path.read_text(encoding='utf-8'))['state'];assert after==before,'Read-only store navigation must preserve every backend state field'
    assert source_snapshot()==qa.source_files
    for name,sha in preserved.items():assert hashlib.sha256(Path(name).read_bytes()).hexdigest()==sha
    diagnostics=collect(qa,module.PACKAGE);assert diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0 and not diagnostics['errors']
    result={'status':'passed','checks':qa.checks,'readOnlyNavigation':True,'fixtureOnly':True,'storeWrites':0,'backendStateUnchanged':True,'priorCheckpointsPreserved':len(preserved),'sourceFilesMatch':len(qa.source_files),'pendingLedgerEmpty':True,'openWorkEmpty':True,'diagnostics':diagnostics,'hostApiPort':8131,'fullAcceptance':False,'completedAt':datetime.now(timezone.utc).isoformat()}
except Exception as error:
    result={'status':'failed','checks':qa.checks,'error':str(error),'errorType':type(error).__name__,'completedAt':datetime.now(timezone.utc).isoformat()}
    try:qa.screenshot('failure')
    except Exception:pass
    raise
finally:
    result['reverseMappingsKept']=routes();(qa.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
