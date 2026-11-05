"""One new synthetic reminder on Samsung. The QA endpoint has no HTTP client.

Do not repeat/reset this mutation after partial execution; inspect the existing
UUID and recover it first. Business source is exercised separately on PGlite.
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

parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--resume-launched',action='store_true');args=parser.parse_args()
assert args.resume_launched or not args.output.exists(),'Use a new evidence directory; never replay a partially completed reminder'
spec=importlib.util.spec_from_file_location('nativeqa',Path('scripts/check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
tree=ast.parse(Path('scripts/check-mobile-gps-native.py').read_text(encoding='utf-8'));names={'reveal','press','tabs','routes'};nodes=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name in names];assert len(nodes)==len(names);exec(compile(ast.Module(body=nodes,type_ignores=[]),'reminder-smoke-helpers','exec'),globals())
state_path=Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json');before=json.loads(state_path.read_text(encoding='utf-8'))['state'];workspace=before['reminders_workspace'];assert not workspace['rows'] and not workspace['requests'],'Inspect existing UUIDs; do not reset written QA'
if args.resume_launched:
    assert before==json.loads((qa.output/'before-state.json').read_text(encoding='utf-8')),'Checkpoint changed while waiting for unlock'
else:(qa.output/'before-state.json').write_text(json.dumps(before,ensure_ascii=False),encoding='utf-8')
preserved=json.loads(Path('.backups/mobile-cashbook-delete-native-20261103-run1/preserved-checkpoints.json').read_text(encoding='utf-8'))
try:
    assert routes()=={'tcp:8081':'tcp:8081','tcp:8091':'tcp:8131'}
    if args.resume_launched:
        proof=json.loads((qa.output/'source-provenance.json').read_text(encoding='utf-8'));current=source_snapshot();changed=[k for k in set(current)|set(proof['sourceFiles']) if current.get(k)!=proof['sourceFiles'].get(k)];assert changed==['scripts/check-mobile-debt-reminders-native.py'],'Only the unlock-resume harness may change'
        assert qa.command('shell','pidof',module.PACKAGE).strip(),'The already launched QA app must remain live'
        assert not re.search(r'\bshowing=true\b',qa.command('shell','dumpsys','window','policy')),'Wait for the user to unlock; do not bypass the lock screen'
        qa.source_files=current;qa.started_epoch=int(datetime.fromisoformat(proof['capturedAt']).timestamp());(qa.output/'harness-unlock-resume.json').write_text(json.dumps({'changed':changed,'originalSha256':proof['sourceFiles'][changed[0]],'updatedSha256':current[changed[0]],'reason':'Resume the live MainActivity after Android keyguard caused am start -W timeout; no restart, no prior send, app/shared/config unchanged','diagnosticEpoch':'Conservative floor of original provenance timestamp before launch'},indent=2),encoding='utf-8')
    else:
        print('Prewarming current source for the fake-provider reminder smoke.',flush=True)
        with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as reply:config=reply.read().decode();assert 'http://127.0.0.1:8091' in config and 'mobile-api.example.invalid' not in config
        with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as reply:entry=hashlib.file_digest(reply,'sha256').hexdigest()
        qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip());qa.launch()
    qa.wait('Lập hợp đồng',timeout=150);press('Mở Gửi nhắc nợ');qa.wait('Mục nhắc nợ',timeout=90);qa.screenshot('01-reminder-history')
    press('Mục nhắc nợ');qa.tap('Chọn hợp đồng để soạn');reveal('Soạn Zalo · REMIND-QA-17001');qa.screenshot('02-due-contract')
    press('Chọn nhắc nợ · REMIND-QA-17001');press('Rà soát gửi nhắc nợ hàng loạt',True);qa.wait('Rà soát nhắc nợ hàng loạt');qa.screenshot('03-bulk-review-only');press('Đóng rà soát nhắc nợ');press('Soạn Zalo · REMIND-QA-17001')
    qa.wait('Soạn nhắc nợ qua Zalo');qa.screenshot('04-single-context');press('Rà soát và gửi Zalo');qa.wait('Gửi nhắc nợ qua Zalo?');qa.screenshot('05-confirmation');press('Xác nhận gửi Zalo')
    qa.wait('Webhook đã tiếp nhận',timeout=75);qa.screenshot('06-original-result');reveal('Đã kiểm tra lần gửi nhắc nợ');press('Đã kiểm tra lần gửi nhắc nợ');qa.wait('Mục nhắc nợ');reveal('Webhook đã tiếp nhận');qa.screenshot('07-shared-history')
    print('One local fake-provider reminder recorded and acknowledged; checking the linked QA record.',flush=True)
    press('Mở hợp đồng · REMIND-QA-17001');qa.wait('Soạn nhắc nợ Zalo');qa.screenshot('08-linked-contract');qa.back()
    tabs();qa.tap('Tài khoản',bottom=True);press('Tải lại bản đang soạn trên thiết bị');reveal('Không có bản đang soạn được giữ trên thiết bị.');press('Tải lại danh sách đối chiếu');reveal('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.screenshot('09-empty-ledger');tabs();qa.tap('Tổng quan',bottom=True);reveal('Lập hợp đồng',True);qa.screenshot('10-demo-ready')
    after=json.loads(state_path.read_text(encoding='utf-8'))['state'];new=after.pop('reminders_workspace');old=before.pop('reminders_workspace');assert before==after and new['manifest']==old['manifest'];assert len(new['rows'])==len(new['requests'])==1
    key,row=next(iter(new['rows'].items()));assert row['order_id']==17001 and row['status']=='accepted' and row['amount']==700 and row['phone']=='0900000001';assert new['requests'][key]['status']=='committed'
    for name,sha in preserved.items():assert hashlib.sha256(Path(name).read_bytes()).hexdigest()==sha
    assert source_snapshot()==qa.source_files;diagnostics=collect(qa,module.PACKAGE);assert not diagnostics['errors'] and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
    result={'status':'passed','fixtureOnly':True,'focusedHappyPathOnly':True,'groups':['Due contract picker and bulk review without sending','Single message review/confirmation and original result acknowledgement','Shared history/linked QA record and clean recovery ledger'],'newFakeProviderReminders':1,'requestKey':key,'realMessagesSent':0,'sourceFilesMatch':len(qa.source_files)-(1 if args.resume_launched else 0),'harnessOnlyUnlockResume':args.resume_launched,'allPreviousFieldsUnchanged':True,'previousCheckpointsPreserved':len(preserved),'pendingLedgerEmpty':True,'openWorkEmpty':True,'diagnostics':diagnostics,'reverseMappingsKept':routes(),'fullAcceptance':False,'completedAt':datetime.now(timezone.utc).isoformat()}
    (qa.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
except Exception:
    try:qa.screenshot('failure');(qa.output/'failure-observed.json').write_text(json.dumps({'sourceMatch':source_snapshot()==qa.source_files,'currentGeneration':json.loads(state_path.read_text(encoding='utf-8'))['generation'],'rows':len(json.loads(state_path.read_text(encoding='utf-8'))['state']['reminders_workspace']['rows'])}),encoding='utf-8')
    except Exception:pass
    raise
