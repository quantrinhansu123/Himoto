"""Focused account admin QA: create/edit/lock/open/reveal/delete then QA7 restore.

No operational credentials, password disclosure or password reset. Inspect original
UUIDs after interruption; never replay/reset an earlier written portfolio.
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
parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();assert not args.output.exists(),'Inspect original evidence and UUIDs before resuming'
spec=importlib.util.spec_from_file_location('nativeqa',Path('scripts/check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
tree=ast.parse(Path('scripts/check-mobile-gps-native.py').read_text(encoding='utf-8'));names={'reveal','press','tabs','routes'};nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in names];assert len(nodes)==len(names);exec(compile(ast.Module(body=nodes,type_ignores=[]),'account-smoke-helpers','exec'),globals())
state_path=Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json');before=json.loads(state_path.read_text(encoding='utf-8'))['state'];workspace=before['accounts_workspace'];assert not workspace['requests'];(qa.output/'before-state.json').write_text(json.dumps(before,ensure_ascii=False),encoding='utf-8');preserved=json.loads(Path('.backups/mobile-cashbook-delete-native-20261103-run1/preserved-checkpoints.json').read_text(encoding='utf-8'))
name='AccountDemo0311';login_name='accountdemo0311';renamed='AccountDemoEdit0311'
def edit(label,value):
    qa.hide_keyboard();reveal(label);qa.text(label,value,replace=True);qa.hide_keyboard()
def login(value):
    qa.wait('Đăng nhập',timeout=120)
    for label,text in [('Tài khoản',value),('Mật khẩu','fixture-password')]:
        qa.hide_keyboard();reveal(label);nodes=[n for n in qa.matches(qa.tree(),label)if n.get('class')=='android.widget.EditText'];assert len(nodes)==1
        before=nodes[0].get('text','');hint='Email hoặc tên đăng nhập'if label=='Tài khoản'else'Nhập mật khẩu';assert before in ('',hint,'qa','qa-accounts')if label=='Tài khoản'else before in('',hint)
        x1,y1,x2,y2=map(int,re.findall(r'\d+',nodes[0].get('bounds')));qa.command('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));focused=False
        for _ in range(6):
            focused=any(n.get('package')==module.PACKAGE and n.get('class')=='android.widget.EditText'and n.get('content-desc')==label and n.get('focused')=='true'for n in qa.tree().iter('node'))
            if focused:break
        assert focused,'QA login field did not receive focus'
        if before not in('',hint):qa.command('shell','input','keyevent','KEYCODE_MOVE_END');qa.command('shell','input','keyevent',*(['KEYCODE_DEL']*(len(before)+1)))
        qa.command('shell','input','text',text);qa.hide_keyboard()
    reveal('Tài khoản',True);press('Đăng nhập');qa.wait('Lập hợp đồng',timeout=120)
def logout():
    tabs();qa.tap('Tài khoản',bottom=True);press('Đăng xuất');qa.wait('Đăng nhập')
def account_empty():
    tabs();qa.tap('Tài khoản',bottom=True);press('Tải lại bản đang soạn trên thiết bị');reveal('Không có bản đang soạn được giữ trên thiết bị.');press('Tải lại danh sách đối chiếu');reveal('Không có thao tác chờ đối chiếu trong phạm vi này.')
def acknowledge():
    qa.wait('Đã ghi nhận thao tác tài khoản',timeout=90);reveal('Đã kiểm tra xác nhận tài khoản');qa.screenshot('receipt-'+str(len(list(qa.output.glob('receipt-*.png')))+1));press('Đã kiểm tra xác nhận tài khoản')
def confirm_save():
    press('Rà soát lưu tài khoản');qa.wait('Lưu tài khoản và phân quyền?');press('Xác nhận lưu tài khoản')
def scope_part():
    press('Phần tài khoản',True);qa.tap('Vai trò và cơ sở')
def set_enabled(value):
    scope_part();press('Cho phép tài khoản đăng nhập');qa.tap('Cho phép đăng nhập'if value else'Khóa đăng nhập');confirm_save();acknowledge();qa.wait('Phân quyền và sửa tài khoản')

def verify_preserved_business(before_state,after_state):
    before_state=deepcopy(before_state);after_state=deepcopy(after_state);changed_auth=[]
    for name in ('vehicle_media','vehicle_transfers'):
        old=before_state[name]['sessions']['1']['expiresAt'];new=after_state[name]['sessions']['1']['expiresAt']
        if old!=new:
            assert new in after_state['sessions'].values(),'Nested QA session must use a live parent session expiry'
            changed_auth.append(f'{name}.sessions.1.expiresAt');after_state[name]['sessions']['1']['expiresAt']=old
    changed=sorted(k for k in set(after_state)|set(before_state)if after_state.get(k)!=before_state.get(k));assert set(changed)<={'sessions','sessionSeq'}
    return changed,changed_auth
try:
    assert routes()=={'tcp:8081':'tcp:8081','tcp:8091':'tcp:8131'};assert not re.search(r'\bshowing=true\b',qa.command('shell','dumpsys','window','policy')),'Wait for user unlock; do not bypass keyguard'
    print('Prewarming current managed-account source before exclusive Samsung smoke.',flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180)as response:assert'http://127.0.0.1:8091'in response.read().decode()
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600)as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
    qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip());qa.launch();root=qa.wait_any(['Tài khoản','Đăng nhập'],timeout=150)
    if qa.matches(root,'Đăng nhập'):login('qa')
    account_empty()
    if not workspace['admin_tokens']:logout();login('qa-accounts')
    tabs();qa.tap('Tổng quan',bottom=True);press('Mở Tài khoản và phân quyền',True);qa.wait('Tạo tài khoản',timeout=90);qa.screenshot('01-admin-accounts-list');press('Tạo tài khoản');qa.wait('Tên hiển thị tài khoản');edit('Tên hiển thị tài khoản',name);edit('Tên đăng nhập tài khoản',login_name);scope_part();press('Phạm vi cơ sở tài khoản');qa.tap('QA Cơ sở');qa.screenshot('02-account-store-and-role');confirm_save();qa.wait('Tài khoản vừa tạo',timeout=90);qa.screenshot('03-one-time-credentials-masked');press('Đóng thông tin và mở xác nhận tài khoản');acknowledge();qa.wait('Phân quyền và sửa tài khoản');qa.screenshot('04-created-account-profile')
    press('Phân quyền và sửa tài khoản');qa.wait('Tên hiển thị tài khoản');edit('Tên hiển thị tài khoản',renamed);set_enabled(False);reveal('Đã khóa',True);qa.screenshot('05-account-locked');press('Phân quyền và sửa tài khoản');qa.wait('Tên hiển thị tài khoản');set_enabled(True);reveal('Hoạt động',True);qa.screenshot('06-account-opened');print('Account creation/edit/lock/reopen acknowledged, no password reset.',flush=True)
    press('Xem mật khẩu đã lưu');qa.wait('Xem mật khẩu tài khoản?');press('Xác nhận xem mật khẩu');reveal('Mật khẩu tài khoản đang xem');qa.screenshot('07-entitled-password-masked');press('Đóng mật khẩu và mở xác nhận');acknowledge();qa.wait('Phân quyền và sửa tài khoản');press('Xóa tài khoản');qa.wait('Xóa quyền đăng nhập tài khoản?');qa.screenshot('08-soft-delete-reviewed');press('Xác nhận xóa tài khoản');acknowledge();qa.wait('Tạo tài khoản');qa.screenshot('09-account-removed-from-list');account_empty();logout();login('qa');account_empty();press('Đổi mật khẩu của mình',True);qa.wait('Mật khẩu hiện tại');qa.screenshot('10-own-password-form-no-write');qa.back();qa.wait('Tài khoản');tabs();qa.tap('Tổng quan',bottom=True);reveal('Lập hợp đồng',True);qa.screenshot('11-demo-ready-qa7')
    after=json.loads(state_path.read_text(encoding='utf-8'))['state'];new=after.pop('accounts_workspace');old=before.pop('accounts_workspace');changed,nested_auth=verify_preserved_business(before,after);assert new['options']==old['options']and new['manifest']==old['manifest']and new['actor']==old['actor']and not new['admin_tokens'];assert len(new['requests'])==5;created=[v for k,v in new['rows'].items()if k not in old['rows']];assert len(created)==1;row=created[0];assert row['name']==renamed and row['login_name']==login_name and row['store_id']==23 and row['access_role']=='branch_staff'and row['deleted_at']and not row['enabled'];assert all(new['rows'][k]==v for k,v in old['rows'].items());assert len(new['audit'])==5 and any(e['action']=='password_reveal'for e in new['audit']);assert'QaGenerated0311'not in json.dumps(new,ensure_ascii=False)
    for filename,sha in preserved.items():assert hashlib.sha256(Path(filename).read_bytes()).hexdigest()==sha
    assert source_snapshot()==qa.source_files;diagnostics=collect(qa,module.PACKAGE);assert not diagnostics['errors']and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
    result={'status':'passed','fixtureOnly':True,'focusedHappyPathOnly':True,'groups':['QA admin create and ephemeral masked credentials/receipt acknowledgement','Rename/lock/reopen, individually entitled password audit and soft deletion preserve history','Return to original QA7 and empty work/ledger; own-password form read only'],'sourceFilesMatch':len(qa.source_files),'newAccountRequests':5,'requestKeys':list(new['requests']),'createdAccountId':row['id'],'allOldBusinessFieldsUnchanged':True,'oldFieldsChangedOnlyForQaAuth':changed,'previousCheckpointsPreserved':len(preserved),'originalQaActorRestored':7,'openWorkEmpty':True,'pendingLedgerEmpty':True,'diagnostics':diagnostics,'reverseMappingsKept':routes(),'operationalDatabaseWrites':0,'nativeOwnPasswordWriteTested':False,'passwordDisclosedOrPrinted':False,'fullAcceptance':False,'completedAt':datetime.now(timezone.utc).isoformat()};(qa.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
except Exception:
    try:qa.screenshot('failure');payload=json.loads(state_path.read_text(encoding='utf-8'));w=payload['state']['accounts_workspace'];(qa.output/'failure-observed.json').write_text(json.dumps({'generation':payload['generation'],'requests':w['requests'],'rows':w['rows'],'adminSessionCount':len(w['admin_tokens'])},ensure_ascii=False,indent=2),encoding='utf-8')
    except Exception:pass
    raise
