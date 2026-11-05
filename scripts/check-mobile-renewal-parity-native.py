"""Samsung read-only hour/day quote and multi-vehicle selection smoke."""
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
parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();assert not args.output.exists()
spec=importlib.util.spec_from_file_location('nativeqa',Path('scripts/check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
def helpers(file,names):
    tree=ast.parse(Path(file).read_text(encoding='utf-8'));nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in names];assert len(nodes)==len(names);exec(compile(ast.Module(body=nodes,type_ignores=[]),file,'exec'),globals())
helpers('scripts/check-mobile-gps-native.py',{'reveal','press','tabs','routes'})
helpers('scripts/check-mobile-managed-accounts-native.py',{'edit','account_empty'})
helpers('scripts/check-mobile-backfill-native.py',{'choose','leave_form'})
state_path=Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json');before=json.loads(state_path.read_text(encoding='utf-8'));assert before['generation']==64 and not before['state']['accounts_workspace']['admin_tokens'];preserved=json.loads(Path('.backups/mobile-cashbook-delete-native-20261103-run1/preserved-checkpoints.json').read_text(encoding='utf-8'));(qa.output/'before-state.json').write_text(json.dumps(before,ensure_ascii=False),encoding='utf-8')
def pick(label):
    qa.hide_keyboard();reveal('Tìm hợp đồng đã có');qa.text('Tìm hợp đồng đã có','9103');qa.hide_keyboard();press('Tìm hợp đồng để nhập bổ sung');qa.wait(label+' · RENEW9103',timeout=90);press(label+' · RENEW9103')
try:
    assert routes()=={'tcp:8081':'tcp:8081','tcp:8091':'tcp:8131'};assert not re.search(r'\bshowing=true\b',qa.command('shell','dumpsys','window','policy')),'User must unlock device'
    print('Prewarming pulled-source renewal parity; native smoke has no writes.',flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180)as response:assert'http://127.0.0.1:8091'in response.read().decode()
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600)as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
    qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip());qa.launch();qa.wait('Tài khoản',timeout=150);account_empty();tabs();qa.tap('Tổng quan',bottom=True);press('Mở Thao tác nhanh');qa.wait('Thao tác nhanh');press('Nhập bổ sung giao dịch lịch sử');qa.wait('Nội dung cần bổ sung',timeout=90);choose('Lượt gia hạn bị quên chưa nhập');pick('Bổ sung gia hạn');qa.wait('Xe gia hạn',timeout=90);press('Xe gia hạn');qa.tap('RENEW29101 · Xe gia hạn A');reveal('Ngày gia hạn thực tế');qa.screenshot('01-actual-renewal-date-prominent');press('Gia hạn theo');qa.tap('Giờ');edit('Số giờ gia hạn','2');reveal('Phí gia hạn thỏa thuận (VND)');assert any(n.get('text')=='40000'for n in qa.matches(qa.tree(),'Phí gia hạn thỏa thuận (VND)'));qa.screenshot('02-two-hours-20000-rate-40000-fee');leave_form()
    choose('Khoản thu/chi của hợp đồng đã có');pick('Bổ sung thu chi');qa.wait('Nghiệp vụ thu/chi',timeout=90);press('Nghiệp vụ thu/chi');qa.tap('Thu tiền và gia hạn một hoặc nhiều xe');edit('Số ngày gia hạn trong phiếu thu','2');press('Chọn gia hạn RENEW29101');qa.tap('Gia hạn và thu tiền xe này');press('Chọn gia hạn RENEW29102');qa.tap('Gia hạn và thu tiền xe này');reveal('Tiền gia hạn RENEW29102 (VND)');assert any(n.get('text')=='400000'for n in qa.matches(qa.tree(),'Tiền gia hạn RENEW29102 (VND)'));qa.screenshot('03-second-vehicle-keeps-own-due-and-fee');reveal('Số ngày gia hạn trong phiếu thu',True);root=qa.tree();assert any(n.get('text','').startswith('2 xe được chọn')and'600.000'in n.get('text','')for n in root.iter('node'));qa.screenshot('04-two-vehicles-one-600000-voucher-preview');leave_form();account_empty();tabs();qa.tap('Tổng quan',bottom=True);reveal('Lập hợp đồng',True);qa.screenshot('05-demo-ready-qa7')
    assert json.loads(state_path.read_text(encoding='utf-8'))==before
    for filename,sha in preserved.items():assert hashlib.sha256(Path(filename).read_bytes()).hexdigest()==sha
    assert source_snapshot()==qa.source_files;diagnostics=collect(qa,module.PACKAGE);assert not diagnostics['errors']and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
    result={'status':'passed','fixtureOnly':True,'focusedReadOnlyHappyPath':True,'groups':['Actual renewal date is visible before unit/count/rate entry; two hours at20000 suggests40000','Two selected vehicles retain distinct due times and200000/400000 line fees; one voucher preview totals600000','Return to QA7 overview with empty work/ledger and unchanged checkpoint'],'sourceFilesMatch':len(qa.source_files),'qaGeneration':64,'allCheckpointFieldsUnchanged':True,'previousCheckpointsPreserved':len(preserved),'nativeWrites':0,'operationalDatabaseWrites':0,'openWorkEmpty':True,'pendingLedgerEmpty':True,'diagnostics':diagnostics,'reverseMappingsKept':routes(),'fullAcceptance':False,'completedAt':datetime.now(timezone.utc).isoformat()};(qa.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
except Exception:
    try:qa.screenshot('failure')
    except Exception:pass
    raise
