"""Focused unpaid renewal -> return -> soft delete on a new QA battery only.

Never reset or replay an interrupted write; inspect its original UUID first.
Financial source, native creation/editing and actual messaging remain separate.
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
tree=ast.parse(Path('scripts/check-mobile-gps-native.py').read_text(encoding='utf-8'));names={'reveal','press','tabs','routes'};nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names];assert len(nodes)==len(names);exec(compile(ast.Module(body=nodes,type_ignores=[]),'battery-smoke-helpers','exec'),globals())
state_path=Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json');before=json.loads(state_path.read_text(encoding='utf-8'))['state'];workspace=before['battery_workspace'];assert not workspace['requests'] and len(workspace['contracts'])==1;index=next(iter(workspace['contracts']));contract=workspace['contracts'][index];code=contract['code'];initial_revision=int(contract['revision'])
(qa.output/'before-state.json').write_text(json.dumps(before,ensure_ascii=False),encoding='utf-8');preserved=json.loads(Path('.backups/mobile-cashbook-delete-native-20261103-run1/preserved-checkpoints.json').read_text(encoding='utf-8'))

def acknowledge():
    qa.wait('Đã ghi nhận thao tác pin / sạc',timeout=90);reveal('Đã kiểm tra xác nhận pin / sạc');qa.screenshot('receipt-'+str(len(list(qa.output.glob('receipt-*.png')))+1));press('Đã kiểm tra xác nhận pin / sạc')

def show_debt():
    reveal('Lịch sử và công nợ gia hạn');labels=[n.get('text','') for n in qa.tree().iter('node')];assert any(label.startswith('Còn phải thu: 300') for label in labels),labels

try:
    assert routes()=={'tcp:8081':'tcp:8081','tcp:8091':'tcp:8131'}
    assert not re.search(r'\bshowing=true\b',qa.command('shell','dumpsys','window','policy')),'Wait for user unlock; do not bypass keyguard'
    print('Prewarming current battery source before exclusive Samsung smoke.',flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as response:assert 'http://127.0.0.1:8091' in response.read().decode()
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
    qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip());qa.launch();qa.wait('Lập hợp đồng',timeout=150);press('Mở Hợp đồng pin / sạc');qa.wait('Mở pin / sạc · '+code,timeout=90);qa.screenshot('01-battery-list');press('Mở pin / sạc · '+code);qa.wait('Hồ sơ pin / sạc');reveal('Gia hạn pin / sạc');qa.screenshot('02-battery-profile')
    press('Gia hạn pin / sạc');qa.wait('Gia hạn pin / sạc · '+code);press('Tiền gia hạn pin đã thực nhận');qa.tap('Chưa nhận, ghi công nợ gia hạn');qa.screenshot('03-unpaid-renewal');press('Rà soát thao tác pin / sạc');qa.wait('Gia hạn pin / sạc?');press('Xác nhận thao tác pin / sạc');acknowledge();qa.wait('Hồ sơ pin / sạc');reveal('Thu nợ gia hạn pin / sạc');show_debt();qa.screenshot('04-renewal-debt');print('Unpaid renewal and original receipt acknowledged.',flush=True)
    press('Trả pin / sạc',up=True);qa.wait('Trả pin / sạc · '+code);press('Xác nhận nhận lại pin / sạc');qa.tap('Đã nhận lại pin / sạc từ khách');press('Rà soát thao tác pin / sạc');qa.wait('Trả pin / sạc?');qa.screenshot('05-return-review');press('Xác nhận thao tác pin / sạc');acknowledge();qa.wait('Hồ sơ pin / sạc');reveal('Thu nợ gia hạn pin / sạc');show_debt();qa.screenshot('06-return-keeps-debt')
    press('Xóa hợp đồng pin / sạc');qa.wait('Xóa '+code+'?');qa.screenshot('07-delete-review');press('Xác nhận xóa hợp đồng pin');acknowledge();qa.wait('Hợp đồng pin / sạc');qa.screenshot('08-battery-after-delete');print('Return and soft deletion keep debt/history; original confirmations acknowledged.',flush=True)
    tabs();qa.tap('Tài khoản',bottom=True);press('Tải lại bản đang soạn trên thiết bị');reveal('Không có bản đang soạn được giữ trên thiết bị.');press('Tải lại danh sách đối chiếu');reveal('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.screenshot('09-empty-ledger');tabs();qa.tap('Tổng quan',bottom=True);reveal('Lập hợp đồng',True);qa.screenshot('10-demo-ready')
    after=json.loads(state_path.read_text(encoding='utf-8'))['state'];new=after.pop('battery_workspace');old=before.pop('battery_workspace');assert after==before and new['manifest']==old['manifest'];assert len(new['requests'])==3;row=new['contracts'][index];assert int(row['revision'])==initial_revision+3 and row['status']=='returned' and row['deleted_at'];events=new['history'][index];assert len(events)==2 and events[0]['action']=='renew' and events[0]['amount']==300 and events[0]['collected']==0 and events[1]['action']=='return';assert sum(e.get('amount',0)-e.get('collected',0) for e in events)==300
    for name,sha in preserved.items():assert hashlib.sha256(Path(name).read_bytes()).hexdigest()==sha
    assert source_snapshot()==qa.source_files;diagnostics=collect(qa,module.PACKAGE);assert not diagnostics['errors'] and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
    result={'status':'passed','fixtureOnly':True,'focusedHappyPathOnly':True,'groups':['Battery list/profile and unpaid renewal with original receipt acknowledgement','Return preserves renewal debt and soft deletion keeps history/receipts','Clean local work/recovery ledger and demo overview'],'sourceFilesMatch':len(qa.source_files),'newBatteryRequests':3,'requestKeys':list(new['requests']),'batteryId':int(index),'batteryRevision':row['revision'],'renewalDebtKept':300,'allOldFieldsUnchanged':True,'previousCheckpointsPreserved':len(preserved),'openWorkEmpty':True,'pendingLedgerEmpty':True,'diagnostics':diagnostics,'reverseMappingsKept':routes(),'realMessagesSent':0,'nativeFinancialOrCreationTested':False,'fullAcceptance':False,'completedAt':datetime.now(timezone.utc).isoformat()};(qa.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
except Exception:
    try:qa.screenshot('failure');payload=json.loads(state_path.read_text(encoding='utf-8'));(qa.output/'failure-observed.json').write_text(json.dumps({'generation':payload['generation'],'batteryWorkspace':payload['state']['battery_workspace']},ensure_ascii=False,indent=2),encoding='utf-8')
    except Exception:pass
    raise
