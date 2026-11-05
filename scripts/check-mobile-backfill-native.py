"""Focused Samsung historical-entry screens. SQL exercises writes separately.

One UIAutomator reader; no native financial write, provider I/O or checkpoint reset.
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
parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();assert not args.output.exists()
spec=importlib.util.spec_from_file_location('nativeqa',Path('scripts/check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
def helpers(file,names):
    tree=ast.parse(Path(file).read_text(encoding='utf-8'));nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in names];assert len(nodes)==len(names);exec(compile(ast.Module(body=nodes,type_ignores=[]),file,'exec'),globals())
helpers('scripts/check-mobile-gps-native.py',{'reveal','press','tabs','routes'})
helpers('scripts/check-mobile-managed-accounts-native.py',{'edit','account_empty'})
state_path=Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json');before=json.loads(state_path.read_text(encoding='utf-8'));assert before['generation']==63 and not before['state']['backfill_workspace']['requests']and not before['state']['accounts_workspace']['admin_tokens'];preserved=json.loads(Path('.backups/mobile-cashbook-delete-native-20261103-run1/preserved-checkpoints.json').read_text(encoding='utf-8'));(qa.output/'before-state.json').write_text(json.dumps(before,ensure_ascii=False),encoding='utf-8')
def choose(label):
    press('Nội dung cần bổ sung',True);qa.tap(label)
def pick(label):
    qa.hide_keyboard();reveal('Tìm hợp đồng đã có');qa.text('Tìm hợp đồng đã có','9003');qa.hide_keyboard();press('Tìm hợp đồng để nhập bổ sung');qa.wait(label+' · HISTORY9003',timeout=90);press(label+' · HISTORY9003')
def leave_form():
    qa.back();root=qa.wait_any(['Nhập bổ sung giao dịch','Rời bước gia hạn?','Rời bước thu/chi?','Rời bản nháp?'])
    if qa.matches(root,'Rời bước gia hạn?'):press('Rời bước gia hạn')
    if qa.matches(root,'Rời bước thu/chi?'):press('Rời bước thu/chi')
    if qa.matches(root,'Rời bản nháp?'):press('Rời bản nháp')
    qa.wait('Nhập bổ sung giao dịch')
try:
    assert routes()=={'tcp:8081':'tcp:8081','tcp:8091':'tcp:8131'};assert not re.search(r'\bshowing=true\b',qa.command('shell','dumpsys','window','policy')),'User must unlock device'
    print('Prewarming historical-entry source; financial writes remain in isolated SQL.',flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180)as response:assert'http://127.0.0.1:8091'in response.read().decode()
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600)as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
    qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip());qa.launch();qa.wait('Tài khoản',timeout=150);account_empty();tabs();qa.tap('Tổng quan',bottom=True);press('Mở Thao tác nhanh');qa.wait('Thao tác nhanh');press('Nhập bổ sung giao dịch lịch sử');qa.wait('Nội dung cần bổ sung',timeout=90);press('Nội dung cần bổ sung');qa.wait('Hợp đồng bị quên chưa nhập');qa.wait('Lượt gia hạn bị quên chưa nhập');qa.wait('Khoản thu/chi của hợp đồng đã có');qa.screenshot('01-three-web-backfill-actions');qa.tap('Lượt gia hạn bị quên chưa nhập');pick('Bổ sung gia hạn');qa.wait('Xe gia hạn',timeout=90);qa.screenshot('02-returned-line-renewal-source');reveal('Phí khác cộng vào tiền thuê (VND)');reveal('Ngày gia hạn thực tế');reveal('Lý do nhập bổ sung gia hạn');qa.screenshot('03-historical-time-fees-and-reason');leave_form()
    choose('Khoản thu/chi của hợp đồng đã có');pick('Bổ sung thu chi');qa.wait('Nghiệp vụ thu/chi',timeout=90);qa.screenshot('04-historical-payment-context');reveal('Xác nhận giao dịch thu chi lịch sử');reveal('Ngày thực thu/chi');qa.screenshot('05-explicit-money-confirmation-and-blank-time');leave_form();choose('Hợp đồng bị quên chưa nhập');press('Nhập bổ sung hợp đồng');qa.wait('Loại hợp đồng',timeout=90);qa.screenshot('06-existing-composer-historical-entry');leave_form();account_empty();tabs();qa.tap('Tổng quan',bottom=True);reveal('Lập hợp đồng',True);qa.screenshot('07-demo-ready-qa7')
    assert json.loads(state_path.read_text(encoding='utf-8'))==before
    for filename,sha in preserved.items():assert hashlib.sha256(Path(filename).read_bytes()).hexdigest()==sha
    assert source_snapshot()==qa.source_files;diagnostics=collect(qa,module.PACKAGE);assert not diagnostics['errors']and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
    result={'status':'passed','fixtureOnly':True,'focusedReadOnlyHappyPath':True,'groups':['Three independently permissioned web backfill actions and scoped search','Returned-line renewal with real-time/reason, extra/rental/outside fees and existing bill path','Historical payment with empty default date/explicit cash confirmation, existing composer entry and clean QA7 return'],'sourceFilesMatch':len(qa.source_files),'qaGeneration':before['generation'],'allCheckpointFieldsUnchanged':True,'previousCheckpointsPreserved':len(preserved),'nativeFinancialWrites':0,'operationalDatabaseWrites':0,'openWorkEmpty':True,'pendingLedgerEmpty':True,'diagnostics':diagnostics,'reverseMappingsKept':routes(),'fullAcceptance':False,'completedAt':datetime.now(timezone.utc).isoformat()};(qa.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
except Exception:
    try:qa.screenshot('failure')
    except Exception:pass
    raise
