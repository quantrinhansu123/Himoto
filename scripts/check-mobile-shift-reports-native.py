"""Focused PGD draft -> submit on the new shift QA workspace, no messaging.

Resume an interrupted run by inspecting its original UUIDs; never reset rows.
KTNB write/media/financial source correctness are separate SQL/staging checks.
"""
import argparse
import ast
import hashlib
import importlib.util
import json
import re
import urllib.request
from datetime import datetime,timezone
from pathlib import Path
from lib.mobile_native_provenance import capture,source_snapshot
from lib.mobile_native_diagnostics import collect
parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();assert not args.output.exists(),'Inspect original evidence and UUIDs before resuming'
spec=importlib.util.spec_from_file_location('nativeqa',Path('scripts/check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
tree=ast.parse(Path('scripts/check-mobile-gps-native.py').read_text(encoding='utf-8'));names={'reveal','press','tabs','routes'};nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names];assert len(nodes)==len(names);exec(compile(ast.Module(body=nodes,type_ignores=[]),'shift-smoke-helpers','exec'),globals())
state_path=Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json');before=json.loads(state_path.read_text(encoding='utf-8'))['state'];workspace=before['shifts_workspace'];assert not workspace['requests'] and workspace['rows']['3']['revision']==1
(qa.output/'before-state.json').write_text(json.dumps(before,ensure_ascii=False),encoding='utf-8');preserved=json.loads(Path('.backups/mobile-cashbook-delete-native-20261103-run1/preserved-checkpoints.json').read_text(encoding='utf-8'))
def acknowledge():
    qa.wait('Đã ghi nhận báo cáo ca',timeout=90);reveal('Đã kiểm tra xác nhận báo cáo ca');qa.screenshot('receipt-'+str(len(list(qa.output.glob('receipt-*.png')))+1));press('Đã kiểm tra xác nhận báo cáo ca')
try:
    assert routes()=={'tcp:8081':'tcp:8081','tcp:8091':'tcp:8131'}
    assert not re.search(r'\bshowing=true\b',qa.command('shell','dumpsys','window','policy')),'Wait for the user to unlock the Samsung; do not bypass keyguard'
    print('Prewarming current shift source before exclusive Samsung smoke.',flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as response:assert 'http://127.0.0.1:8091' in response.read().decode()
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
    qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip());qa.launch();qa.wait('Lập hợp đồng',timeout=150);press('Mở Báo cáo cuối ca');qa.wait('Mở báo cáo ca #3',timeout=90);qa.screenshot('01-shift-list');press('Mở báo cáo ca #3');qa.wait('Tiếp tục kiểm kê và chốt ca');qa.screenshot('02-pgd-draft')
    press('Tiếp tục kiểm kê và chốt ca');qa.wait('Phần báo cáo ca');press('Lưu nháp báo cáo ca');qa.wait('Lưu nháp báo cáo ca?');press('Xác nhận lưu nháp báo cáo ca');acknowledge();qa.wait('Tiếp tục kiểm kê và chốt ca');print('Draft update and exact original receipt acknowledged.',flush=True)
    press('Tiếp tục kiểm kê và chốt ca');qa.wait('Phần báo cáo ca');press('Phần báo cáo ca');qa.tap('An toàn cuối ca');press('Xác nhận an toàn cuối ca');qa.tap('Đã tắt thiết bị điện');qa.screenshot('03-safety-reviewed');press('Rà soát và chốt báo cáo ca');qa.wait('Chốt báo cáo cuối ca?');qa.screenshot('04-submit-confirmation');press('Xác nhận chốt báo cáo ca');acknowledge();qa.wait('Mở đối soát KTNB');assert not qa.matches(qa.tree(),'Tiếp tục kiểm kê và chốt ca');qa.screenshot('05-pgd-submitted')
    press('Mở đối soát KTNB');qa.wait('KTNB đối soát · Cơ sở ca QA');qa.screenshot('06-ktnb-read-only');assert not qa.matches(qa.tree(),'Lưu nháp đối soát KTNB');qa.back();print('PGD submitted with safety confirmation; KTNB source opened read-only for the existing QA actor.',flush=True)
    tabs();qa.tap('Tài khoản',bottom=True);press('Tải lại bản đang soạn trên thiết bị');reveal('Không có bản đang soạn được giữ trên thiết bị.');press('Tải lại danh sách đối chiếu');reveal('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.screenshot('07-empty-ledger');tabs();qa.tap('Tổng quan',bottom=True);reveal('Lập hợp đồng',True);qa.screenshot('08-demo-ready')
    after=json.loads(state_path.read_text(encoding='utf-8'))['state'];new=after.pop('shifts_workspace');old=before.pop('shifts_workspace');assert after==before and new['manifest']==old['manifest'];assert len(new['requests'])==2;row=new['rows']['3'];assert row['revision']==3 and row['status']=='submitted' and row['payload']['electricity_off'] is True
    for name,sha in preserved.items():assert hashlib.sha256(Path(name).read_bytes()).hexdigest()==sha
    assert source_snapshot()==qa.source_files;diagnostics=collect(qa,module.PACKAGE);assert not diagnostics['errors'] and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
    result={'status':'passed','fixtureOnly':True,'focusedHappyPathOnly':True,'groups':['PGD list/profile/draft save and original receipt acknowledgement','Safety-reviewed submission and locked PGD editor','KTNB read-only view and clean local work/recovery ledger'],'sourceFilesMatch':len(qa.source_files),'newShiftRequests':2,'requestKeys':list(new['requests']),'reportId':3,'reportRevision':3,'allOldFieldsUnchanged':True,'previousCheckpointsPreserved':len(preserved),'openWorkEmpty':True,'pendingLedgerEmpty':True,'diagnostics':diagnostics,'reverseMappingsKept':routes(),'realMessagesSent':0,'nativeMediaOrKtnbWriteTested':False,'fullAcceptance':False,'completedAt':datetime.now(timezone.utc).isoformat()};(qa.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
except Exception:
    try:qa.screenshot('failure');payload=json.loads(state_path.read_text(encoding='utf-8'));(qa.output/'failure-observed.json').write_text(json.dumps({'generation':payload['generation'],'shiftRequests':payload['state']['shifts_workspace']['requests'],'report':payload['state']['shifts_workspace']['rows']['3']},ensure_ascii=False,indent=2),encoding='utf-8')
    except Exception:pass
    raise
