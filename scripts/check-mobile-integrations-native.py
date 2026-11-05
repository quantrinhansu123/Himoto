"""Focused Samsung integration configuration and counter workflows, local QA only.

Never reset/replay an interrupted write. Keep original receipts for reconciliation.
No real providers, bot tokens, historical-contract writes or outbound messages.
"""
import argparse
import ast
import hashlib
import importlib.util
import json
import re
import urllib.request
from copy import deepcopy
from datetime import datetime,timezone
from pathlib import Path
from lib.mobile_native_provenance import capture,source_snapshot
from lib.mobile_native_diagnostics import collect

parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--resume-local-from',type=Path);args=parser.parse_args();assert not args.output.exists(),'Inspect original evidence and UUIDs before resuming'
spec=importlib.util.spec_from_file_location('nativeqa',Path('scripts/check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
def helpers(filename,names):
    tree=ast.parse(Path(filename).read_text(encoding='utf-8'));nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in names];assert len(nodes)==len(names);exec(compile(ast.Module(body=nodes,type_ignores=[]),filename,'exec'),globals())
helpers('scripts/check-mobile-gps-native.py',{'reveal','press','tabs','routes'})
helpers('scripts/check-mobile-managed-accounts-native.py',{'edit','login','logout','account_empty','verify_preserved_business'})
state_path=Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json');before=json.loads(state_path.read_text(encoding='utf-8'))['state'];workspace=before['integrations_workspace'];assert not workspace['requests']and not before['accounts_workspace']['admin_tokens'];(qa.output/'before-state.json').write_text(json.dumps(before,ensure_ascii=False),encoding='utf-8');preserved=json.loads(Path('.backups/mobile-cashbook-delete-native-20261103-run1/preserved-checkpoints.json').read_text(encoding='utf-8'));phase='prewarm'
continued=None
if args.resume_local_from:
    previous=args.resume_local_from.resolve();assert previous.is_relative_to(Path('.backups').resolve());observed=json.loads((previous/'failure-observed.json').read_text(encoding='utf-8'));assert observed['phase']=='historical-local'and not observed['requests']and observed['adminSessionCount']==0;assert json.loads((previous/'before-state.json').read_text(encoding='utf-8'))==before
    proof=json.loads((previous/'source-provenance.json').read_text(encoding='utf-8'))['sourceFiles'];current=source_snapshot();harness='scripts/check-mobile-integrations-native.py';assert {k:v for k,v in proof.items()if k!=harness}=={k:v for k,v in current.items()if k!=harness},'Only the local-continuation harness may differ; app and all other QA source must match'
    continued={'path':str(previous),'sameAppSource':True,'originalHarnessSha256':proof[harness],'completedReadAndLocalEvidence':{p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(previous.glob('0[1-5]-*.png'))}};assert len(continued['completedReadAndLocalEvidence'])==5;(qa.output/'continued-from.json').write_text(json.dumps(continued,indent=2),encoding='utf-8')

def acknowledge():
    qa.wait('Đã lưu cấu hình tích hợp',timeout=90);reveal('Đã kiểm tra xác nhận tích hợp');qa.screenshot('receipt-'+str(len(list(qa.output.glob('receipt-*.png')))+1));press('Đã kiểm tra xác nhận tích hợp');qa.wait('Phần cấu hình tích hợp')
def confirm():
    qa.wait('Lưu cấu hình tích hợp?');press('Xác nhận lưu cấu hình tích hợp');acknowledge()
def part(label):
    press('Phần cấu hình tích hợp',True);qa.tap(label)
def leave_history():
    qa.back();root=qa.wait_any(['Rời bản nháp?','Thao tác nhanh'])
    if qa.matches(root,'Rời bản nháp?'):press('Rời bản nháp')
    qa.wait('Thao tác nhanh')
try:
    assert routes()=={'tcp:8081':'tcp:8081','tcp:8091':'tcp:8131'};assert not re.search(r'\bshowing=true\b',qa.command('shell','dumpsys','window','policy')),'Wait for user unlock; do not bypass keyguard'
    print('Prewarming integration/operations source before exclusive Samsung smoke.',flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180)as response:assert'http://127.0.0.1:8091'in response.read().decode()
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600)as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
    qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip());qa.launch();root=qa.wait_any(['Tài khoản','Đăng nhập'],timeout=150)
    if qa.matches(root,'Đăng nhập'):login('qa')
    if not continued:account_empty()
    tabs();qa.tap('Tổng quan',bottom=True);phase='operations';press('Mở Thao tác nhanh');qa.wait('Thao tác nhanh')
    if not continued:
        reveal('4 hợp đồng đang thuê');reveal('2 hợp đồng quá hạn');qa.screenshot('01-scoped-operations-counts');reveal('Biển số hoặc số điện thoại nhận trả xe',True);edit('Biển số hoặc số điện thoại nhận trả xe','29001');press('Tìm hợp đồng đang thuê để trả');qa.wait('Xem OPSQA29001, Khách vận hành QA',timeout=90);qa.screenshot('02-active-return-search');press('Xem OPSQA29001, Khách vận hành QA');qa.wait('OPSQA29001',timeout=90);qa.screenshot('03-original-contract-record');qa.back();qa.wait('Xem OPSQA29001, Khách vận hành QA');qa.back();qa.wait('Thao tác nhanh')
    phase='historical-local';press('Nhập bổ sung giao dịch lịch sử',True)
    if continued:
        qa.wait('Có bản đang soạn trên thiết bị');press('Tiếp tục bản đang soạn');qa.wait('Loại hợp đồng');reveal('Lý do nhập bổ sung');assert any(n.get('text')=='Demo0311'for n in qa.matches(qa.tree(),'Lý do nhập bổ sung'));qa.screenshot('05-history-local-work-restored');leave_history()
    else:
        qa.wait('Loại hợp đồng',timeout=90);press('Tình trạng thực tế của hợp đồng bổ sung');qa.tap('Khách đã trả xe từ trước');edit('Lý do nhập bổ sung','Demo0311');qa.screenshot('04-returned-history-form-no-server-write');leave_history();press('Nhập bổ sung giao dịch lịch sử',True);qa.wait('Có bản đang soạn trên thiết bị');press('Tiếp tục bản đang soạn');qa.wait('Loại hợp đồng');reveal('Lý do nhập bổ sung');assert any(n.get('text')=='Demo0311'for n in qa.matches(qa.tree(),'Lý do nhập bổ sung'));qa.screenshot('05-history-local-work-restored');leave_history()
    press('Nhập bổ sung giao dịch lịch sử',True);qa.wait('Có bản đang soạn trên thiết bị');press('Bỏ bản trên thiết bị');qa.wait('Bỏ bản đang soạn trên thiết bị?');press('Bỏ bản trên thiết bị');qa.wait('Loại hợp đồng');leave_history();account_empty()
    phase='admin-login';logout();login('qa-accounts');tabs();qa.tap('Tổng quan',bottom=True);press('Mở Tích hợp GPS và Telegram');qa.wait('Phần cấu hình tích hợp',timeout=90);label=workspace['settings']['accounts'][0]['label'];qa.screenshot('06-integration-status-and-gps');phase='gps-enable';press('Bật tự đồng bộ · '+label);confirm();phase='gps-disable';press('Tắt tự đồng bộ · '+label);confirm();print('Two original GPS enablement receipts acknowledged.',flush=True)
    phase='telegram';part('Nhóm Telegram');qa.wait('Bot token Telegram mới');edit('Mã chủ đề nhóm cơ sở','13');reveal('Hai nhóm riêng cho thuê sở hữu');qa.screenshot('07-telegram-groups-preserve-secret');press('Rà soát lưu cấu hình Telegram');confirm();part('Nhật ký sự kiện GPS');qa.screenshot('08-history-cursors-read-only');part('Thông báo gần nhất');qa.screenshot('09-notifications-read-only');account_empty();phase='restore-qa7';logout();login('qa');account_empty();tabs();qa.tap('Tổng quan',bottom=True);reveal('Lập hợp đồng',True);qa.screenshot('10-demo-ready-qa7')
    after=json.loads(state_path.read_text(encoding='utf-8'))['state'];new=after.pop('integrations_workspace');old=before.pop('integrations_workspace');changed,nested_auth=verify_preserved_business(before,after);assert new['operations']==old['operations']and new['manifest']==old['manifest'];assert new['revision']==3 and len(new['requests'])==3 and all(r['status']=='committed'for r in new['requests'].values());s=deepcopy(new['settings']);o=deepcopy(old['settings']);s.pop('configVersion');o.pop('configVersion');group=next(g for g in s['groups']if g['store_id']==23);assert group['thread_id']==13;group['thread_id']=12;assert s==o
    for filename,sha in preserved.items():assert hashlib.sha256(Path(filename).read_bytes()).hexdigest()==sha
    assert source_snapshot()==qa.source_files;diagnostics=collect(qa,module.PACKAGE);assert not diagnostics['errors']and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
    result={'status':'passed','fixtureOnly':True,'focusedHappyPathOnly':True,'groups':['Scoped active/overdue counts, return search and original contract profile','Historical returned choice and reason survive local work resume; discard only this new local work, no server write','Admin GPS enable/disable and Telegram topic update with three receipt acknowledgements, unchanged bot and ownership routes, no dispatch'],'continuedFrom':continued,'sourceFilesMatch':len(qa.source_files),'newIntegrationRequests':3,'requestKeys':list(new['requests']),'allOldBusinessFieldsUnchanged':True,'oldFieldsChangedOnlyForQaAuth':changed,'nestedAuthExpiriesChanged':nested_auth,'previousCheckpointsPreserved':len(preserved),'originalQaActorRestored':7,'openWorkEmpty':True,'pendingLedgerEmpty':True,'diagnostics':diagnostics,'reverseMappingsKept':routes(),'operationalDatabaseWrites':0,'historicalServerWriteTested':False,'nativeProviderCredentialsWriteTested':False,'outboundMessages':0,'fullAcceptance':False,'completedAt':datetime.now(timezone.utc).isoformat()};(qa.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
except Exception:
    try:qa.screenshot('failure');payload=json.loads(state_path.read_text(encoding='utf-8'));w=payload['state']['integrations_workspace'];(qa.output/'failure-observed.json').write_text(json.dumps({'phase':phase,'generation':payload['generation'],'requests':w['requests'],'adminSessionCount':len(payload['state']['accounts_workspace']['admin_tokens'])},ensure_ascii=False,indent=2),encoding='utf-8')
    except Exception:pass
    raise
