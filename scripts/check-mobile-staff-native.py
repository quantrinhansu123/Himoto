"""Focused Samsung staff happy path on the existing preserved QA8131 dataset."""
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
exec(compile(ast.Module(body=nodes,type_ignores=[]),'staff-smoke-helpers','exec'),globals())
state_path=Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json');before=json.loads(state_path.read_text(encoding='utf-8'))['state']
preserved={str(path):hashlib.sha256(path.read_bytes()).hexdigest() for path in Path('.backups').glob('mobile-*/state.json') if '-fixture-' in path.parent.name and path.resolve()!=state_path.resolve()}
def stats():
    with urllib.request.urlopen('http://127.0.0.1:8131/__fixture_state',timeout=12) as response:value=json.load(response)
    assert value['fixtureOnly'] and value['vehicleWorkspace'];return value['staffWorkspace']
def account_empty():
    tabs();qa.tap('Tài khoản',bottom=True);press('Tải lại bản đang soạn trên thiết bị');reveal('Không có bản đang soạn được giữ trên thiết bị.');press('Tải lại danh sách đối chiếu');reveal('Không có thao tác chờ đối chiếu trong phạm vi này.')
def edit(label,value):
    assert re.fullmatch(r'[A-Za-z0-9-]+',value);qa.hide_keyboard();reveal(label);qa.text(label,value,replace=True);qa.hide_keyboard()
def acknowledge():
    qa.wait('Đã ghi nhận nhân sự #10001',timeout=60);press('Đã kiểm tra xác nhận nhân sự');qa.wait('StaffDemo0311')
result={'status':'failed','error':'Not completed'}
try:
    expected={'tcp:8081':'tcp:8081','tcp:8091':'tcp:8131'};current_routes=routes()
    assert all(current_routes.get(key,value)==value for key,value in expected.items()),'Unexpected QA reverse mapping; keep the original server'
    assert not stats()['requests'],'Do not recreate after an earlier written staff run; reconcile the original UUID first'
    for key,value in expected.items():
        if key not in current_routes:qa.command('reverse',key,value)
    assert routes()==expected
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as response:config=response.read().decode()
    assert 'http://127.0.0.1:8091' in config
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
    qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip());(qa.output/'started-epoch.json').write_text(json.dumps({'startedEpoch':qa.started_epoch}),encoding='utf-8')
    qa.launch();qa.wait('Lập hợp đồng',timeout=150);account_empty();tabs();qa.tap('Tổng quan',bottom=True);press('Mở Nhân sự');qa.wait('Thêm nhân sự');qa.tap('Thêm nhân sự');qa.wait('Họ và tên');edit('Họ và tên','StaffDemo0311');edit('Số điện thoại nhân sự','0000000000');edit('Chức vụ','NVKD');press('Rà soát và thêm nhân sự');qa.wait('Thêm nhân sự?');qa.tap('Xác nhận')
    qa.wait('Tài khoản nhân sự vừa cấp',timeout=60);qa.screenshot('01-one-time-credentials-masked');press('Đóng thông tin và mở xác nhận nhân sự');acknowledge();qa.screenshot('02-created-staff-profile')
    work=stats();row=work['profiles']['10001'];assert row['position']=='NVKD' and row['storeId']==23 and row['status']=='active' and row['userId']==110001 and len(work['requests'])==1;assert work['accounts']['110001']['enabled']
    qa.passed('Samsung creates one employee10001 in store23, opens masked one-time credential handoff and acknowledges its original creation UUID; no credentials are stored in the QA request ledger')
    press('Sửa nhân sự');qa.wait('Họ và tên');edit('Số điện thoại nhân sự','0000000001');press('Rà soát và lưu nhân sự');qa.wait('Lưu thay đổi nhân sự?');qa.tap('Xác nhận');acknowledge();assert stats()['profiles']['10001']['phone']=='0000000001'
    press('Chuyển sang Đã nghỉ việc');qa.wait('Chuyển sang Đã nghỉ việc?');qa.tap('Xác nhận nghỉ việc');acknowledge();qa.wait('Đã nghỉ việc');qa.screenshot('03-left-staff-profile');work=stats();assert work['profiles']['10001']['status']=='leave' and not work['accounts']['110001']['enabled'] and work['accounts']['110001']['deleted'] and len(work['requests'])==3
    qa.passed('Native edit and leave retain the same employee/login IDs and store, use revision updates and exact receipts, and show the linked QA login disabled after leave')
    press('Xóa hồ sơ nhân sự');qa.wait('Xóa hồ sơ nhân sự?');qa.tap('Xóa hồ sơ nhân sự');qa.wait('Đã ghi nhận nhân sự #10001');qa.screenshot('04-delete-receipt');press('Đã kiểm tra xác nhận nhân sự');qa.wait('Thêm nhân sự');assert '10001' not in stats()['profiles'] and len(stats()['requests'])==4
    account_empty();qa.screenshot('05-empty-work-ledger');tabs();qa.tap('Tổng quan',bottom=True);reveal('Lập hợp đồng',True);qa.screenshot('06-demo-ready')
    after=json.loads(state_path.read_text(encoding='utf-8'))['state'];assert {key:value for key,value in after.items() if key!='staff_workspace'}=={key:value for key,value in before.items() if key!='staff_workspace'}
    assert source_snapshot()==qa.source_files
    for name,sha in preserved.items():assert hashlib.sha256(Path(name).read_bytes()).hexdigest()==sha
    diagnostics=collect(qa,module.PACKAGE);assert diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0 and not diagnostics['errors']
    qa.passed('Native hard deletion returns its exact original receipt; final work/ledger are empty, all pre-existing QA fields/checkpoints are preserved and Samsung is left on the overview')
    result={'status':'passed','checks':qa.checks,'focusedHappyPathOnly':True,'fixtureOnly':True,'staffRequests':4,'staffId':10001,'accountId':110001,'sourceFilesMatch':len(qa.source_files),'priorCheckpointsPreserved':len(preserved),'preExistingFieldsUnchanged':True,'pendingLedgerEmpty':True,'openWorkEmpty':True,'diagnostics':diagnostics,'hostApiPort':8131,'fullAcceptance':False,'completedAt':datetime.now(timezone.utc).isoformat()}
except Exception as error:
    result={'status':'failed','checks':qa.checks,'error':str(error),'errorType':type(error).__name__,'completedAt':datetime.now(timezone.utc).isoformat()}
    try:qa.screenshot('failure')
    except Exception:pass
    raise
finally:
    result['reverseMappingsKept']=routes();(qa.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
