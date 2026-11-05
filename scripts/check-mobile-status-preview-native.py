"""Focused Samsung status review; no submit, no original-checkpoint or app reset."""
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

parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--fork-state',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
assert not args.output.exists()
spec=importlib.util.spec_from_file_location('nativeqa',Path('scripts/check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
tree=ast.parse(Path('scripts/check-mobile-gps-native.py').read_text(encoding='utf-8'));names={'reveal','press','tabs','routes','enter_login_field'};nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in names];assert len(nodes)==len(names);exec(compile(ast.Module(body=nodes,type_ignores=[]),'status-native-helpers','exec'),globals())
original=Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json');original_sha=hashlib.sha256(original.read_bytes()).hexdigest()
before=deepcopy(json.loads(args.fork_state.read_text(encoding='utf-8'))['state']);before_routes=routes();assert before_routes=={'tcp:8081':'tcp:8081','tcp:8091':'tcp:8131'}
assert not re.search(r'\bshowing=true\b',qa.command('shell','dumpsys','window','policy')),'Wait for user unlock'
try:
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180)as r:assert'http://127.0.0.1:8091'in r.read().decode()
    url='http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable'
    with urllib.request.urlopen(url,timeout=240)as r:entry=hashlib.file_digest(r,'sha256').hexdigest()
    qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip())
    qa.command('reverse','tcp:8091','tcp:8137');qa.launch();root=qa.wait_any(['Đăng nhập','Lập hợp đồng'],timeout=150)
    if qa.matches(root,'Đăng nhập'):
        enter_login_field('Tài khoản','qa');enter_login_field('Mật khẩu','fixture-password');press('Đăng nhập');qa.wait('Lập hợp đồng',timeout=90)
    tabs();qa.tap('Đội xe',bottom=True);qa.wait('Xem EDIT19303, Xe QA 19303',timeout=90);press('Xem EDIT19303, Xe QA 19303');press('Đổi trạng thái / tạo nháp từ kho');press('Nhập thông tin đổi trạng thái')
    qa.wait('Tên khách',timeout=60);qa.screenshot('01-default-current-stock-empty-customer');press('Trạng thái',True);press('Lập hợp đồng nháp')
    reveal('Tên khách *');qa.text('Tên khách *','QA',replace=False);qa.hide_keyboard()
    name_before=[n.get('text','')for n in qa.matches(qa.tree(),'Tên khách *')if n.get('class')=='android.widget.EditText'];assert len(name_before)==1 and name_before[0]
    qa.text('SĐT khách *','0901234567',replace=False);qa.hide_keyboard();reveal('CCCD khách *');qa.text('CCCD khách *','012345678901',replace=False);qa.hide_keyboard();press('Rà soát đổi trạng thái')
    qa.wait('Rà soát trước khi ghi',timeout=90);qa.screenshot('02-review-no-money-or-stock-move');press('Lưu và tạo hợp đồng nháp');qa.wait('Tạo hợp đồng nháp từ kho?');qa.screenshot('03-confirmation-cancelled');press('Tiếp tục chỉnh sửa');press('Sửa thông tin');reveal('Tên khách *',True)
    assert [n.get('text','')for n in qa.matches(qa.tree(),'Tên khách *')if n.get('class')=='android.widget.EditText']==name_before
    qa.back();qa.wait('Rời màn đổi trạng thái?');press('Rời màn đổi trạng thái');tabs();qa.tap('Tài khoản',bottom=True);press('Tải lại danh sách đối chiếu');reveal('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.screenshot('04-empty-pending-ledger');press('Đăng xuất');qa.wait('Đăng nhập')
    after=deepcopy(json.loads(args.fork_state.read_text(encoding='utf-8'))['state'])
    for state in [before,after]:
        state.pop('sessions',None);state.pop('sessionSeq',None)
        for key in ['vehicle_media','vehicle_transfers']:state[key].pop('sessions',None)
    assert after==before and hashlib.sha256(original.read_bytes()).hexdigest()==original_sha and source_snapshot()==qa.source_files
    diagnostics=collect(qa,module.PACKAGE);assert not diagnostics['errors']and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
    result={'ok':True,'fixtureOnly':True,'focusedPreviewOnly':True,'nativeSubmissions':0,'originalCheckpointUnchanged':True,'forkBusinessUnchanged':True,'pendingLedgerEmpty':True,'sourceFilesMatch':len(qa.source_files),'screenshots':4,'diagnostics':diagnostics,'fullAcceptance':False,'completedAt':datetime.now(timezone.utc).isoformat()}
    (qa.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
except Exception:
    try:qa.screenshot('failure')
    except Exception:pass
    raise
finally:
    qa.command('reverse','tcp:8091','tcp:8131');assert routes()==before_routes
    (qa.output/'restore.json').write_text(json.dumps({'reverseRestored':True,'originalCheckpointUnchanged':hashlib.sha256(original.read_bytes()).hexdigest()==original_sha}),encoding='utf-8')
