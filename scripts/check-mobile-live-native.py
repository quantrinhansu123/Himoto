"""Samsung read/session QA on deployed HTTPS API. No business submit/reset."""
import argparse
import hashlib
import importlib.util
import json
import re
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from lib.mobile_native_provenance import capture, source_snapshot
from lib.mobile_native_diagnostics import collect


def hidden_input():
    import msvcrt
    print('QA_INPUT_READY_NO_ECHO', flush=True)
    value=''
    while True:
        char=msvcrt.getwch()
        if char in ('\r','\n'): break
        if char=='\x03' or len(value)>4096: raise RuntimeError('QA_INPUT_CANCELLED')
        value+=char
    return json.loads(value)


def run(args):
    assert not args.output.exists()
    original=Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json')
    checkpoint=hashlib.sha256(original.read_bytes()).hexdigest()
    assert checkpoint=='5771b6d70cde7f43f0c5388b4935e42b8d268a295c3b23c63dbabac6e8f91077'
    spec=importlib.util.spec_from_file_location('nativeqa',Path('scripts/check-mobile-native.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    release=args.release_apk is not None
    physical=not args.serial.startswith('emulator-')
    if physical:assert args.serial=='282a05859f3f7ece','Only the user-authorized Samsung is selected'
    qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=physical)
    def wait(label,timeout=70):
        until=time.monotonic()+timeout
        while time.monotonic()<until:
            tree=qa.tree()
            if qa.matches(tree,label): return tree
        raise RuntimeError('QA_CONTROL_TIMEOUT: '+label)
    def reveal(label,up=False):
        for _ in range(16):
            tree=qa.tree();bounds=list(map(int,re.findall(r'\d+',next(tree.iter('node')).get('bounds'))));width,height=bounds[2:]
            for node in qa.matches(tree,label):
                x1,y1,x2,y2=map(int,re.findall(r'\d+',node.get('bounds')))
                if x2>x1 and y2>y1 and y1>=145 and y2<=height:return
            start,end=(.35,.72)if up else(.72,.35)
            qa.command('shell','input','swipe',str(width//2),str(int(height*start)),str(width//2),str(int(height*end)),'350')
        raise RuntimeError('QA_CONTROL_NOT_VISIBLE: '+label)
    def press(label,up=False):reveal(label,up);qa.tap(label)
    def enter(label,value):
        # Values stay in process memory; subprocess failures never include args.
        if not re.fullmatch(r'[A-Za-z0-9._@+-]{1,256}',value):raise RuntimeError('QA_NATIVE_INPUT_UNSUPPORTED_CHARACTERS')
        qa.hide_keyboard();reveal(label)
        nodes=[n for n in qa.matches(qa.tree(),label)if n.get('class')=='android.widget.EditText'];assert len(nodes)==1
        x1,y1,x2,y2=map(int,re.findall(r'\d+',nodes[0].get('bounds')))
        qa.command('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
        for _ in range(6):
            focused=[n for n in qa.matches(qa.tree(),label)if n.get('class')=='android.widget.EditText'and n.get('focused')=='true']
            if focused:break
        if not focused:raise RuntimeError('QA_LOGIN_FIELD_FOCUS_FAILED')
        old=nodes[0].get('text','');hint='Email hoặc tên đăng nhập'if label=='Tài khoản'else'Nhập mật khẩu'
        if old not in ('',hint):
            qa.command('shell','input','keyevent','KEYCODE_MOVE_END');qa.command('shell','input','keyevent',*(['KEYCODE_DEL']*(len(old)+1)))
        typed=subprocess.run(qa.adb+['shell','input','text',value],capture_output=True,timeout=30)
        if typed.returncode:raise RuntimeError('QA_NATIVE_INPUT_FAILED')
        qa.hide_keyboard()
        if label=='Tài khoản':
            nodes=[n for n in qa.matches(qa.tree(),label)if n.get('class')=='android.widget.EditText']
            if len(nodes)!=1 or nodes[0].get('text')!=value:raise RuntimeError('QA_USERNAME_READBACK_MISMATCH')
    def launch():
        qa.command('shell','am','force-stop',module.PACKAGE)
        if release:qa.command('shell','am','start','-W','-n',module.PACKAGE+'/.MainActivity')
        else:qa.command('shell',"am start -W -a android.intent.action.VIEW -d 'exp+himoto-staff://?__expo_url=http%3A%2F%2F127.0.0.1%3A8082&__expo_disable_fab=1&__expo_disable_auto_launch=1&__expo_disable_onboarding=1' -p "+module.PACKAGE)
    def tab(label):qa.tap(label,bottom=True)
    def logout():
        tab('Tài khoản');press('Đăng xuất');wait('Đăng nhập')
    def reverse():return qa.command('reverse','--list')
    before_reverse=reverse();added=False;logged=False;credentials=None;checks=[];network_before=None;stage='initial'
    def progress(value):
        nonlocal stage
        stage=value
        (qa.output/'progress.json').write_text(json.dumps(dict(stage=stage,checks=checks),indent=2),encoding='utf-8')
        print('QA_STAGE '+stage,flush=True)
    try:
        assert not re.search(r'\bshowing=true\b',qa.command('shell','dumpsys','window','policy')),'QA_DEVICE_LOCKED'
        if release:
            import zipfile
            from lib.mobile_release_evidence import verify_artifact,verify_installed
            release_proof=verify_artifact(args.release_apk);verify_installed(qa,release_proof)
            with zipfile.ZipFile(args.release_apk)as apk:bundle=apk.read('assets/index.android.bundle')
            assert b'https://himoto.vercel.app'in bundle and b'http://127.0.0.1:8091'not in bundle
            entry=hashlib.sha256(bundle).hexdigest()
        else:
            with urllib.request.urlopen('http://127.0.0.1:8082/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180)as response:bundle=response.read().decode()
            assert 'https://himoto.vercel.app'in bundle and 'http://127.0.0.1:8091'not in bundle,'QA_BUNDLE_ORIGIN_MISMATCH'
            url='http://127.0.0.1:8082/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable'
            with urllib.request.urlopen(url,timeout=600)as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
        qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip())
        if not release:
            assert'tcp:8082'not in before_reverse
            qa.command('reverse','tcp:8082','tcp:8082');added=True
        progress('launch-login');launch();wait('Đăng nhập',150)
        credentials=hidden_input();enter('Tài khoản',credentials['username']);enter('Mật khẩu',credentials['password']);credentials=None
        progress('submit-login');press('Đăng nhập');wait('Lập hợp đồng',120);logged=True
        qa.screenshot('01-live-overview');checks.append('Native HTTPS admin login and live overview')
        if args.focus_export_upgrade:
            assert release
            from lib.mobile_release_export_native import run as focused
            proof=focused(qa,args,wait,reveal,press,enter,launch,tab,logout);logged=False
            diagnostics=collect(qa,module.PACKAGE)
            assert not diagnostics['errors']and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
            assert source_snapshot()==qa.source_files
            result={**proof,'liveBackend':True,'signedRelease':True,'fullAcceptance':False,'businessSubmissions':0,'diagnostics':diagnostics,'completedAt':datetime.now(timezone.utc).isoformat()}
            (qa.output/'results.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(dict(ok=True,focusedExportUpgrade=True,xlsxRows=0,sameSignatureReinstall=True,businessSubmissions=0)),flush=True);return
        tab('Tài khoản');wait('Phạm vi truy cập');reveal('Toàn bộ cơ sở');qa.screenshot('02-live-account-scope')
        # No bearer is read from SecureStore. A process restart must restore it.
        progress('process-restore');launch();wait('Lập hợp đồng',120);tab('Tài khoản');wait('Phạm vi truy cập');reveal('Toàn bộ cơ sở')
        checks.append('SecureStore restores live admin session after process restart')
        if release:
            network_before={key:qa.command('shell','settings','get','global',key).strip()for key in ['wifi_on','mobile_data']}
            assert network_before['wifi_on']in('0','1','2','3')and network_before['mobile_data']in('0','1'),'QA_NETWORK_STATE_UNKNOWN'
            qa.command('shell','svc','wifi','disable');qa.command('shell','svc','data','disable')
            progress('offline-restore');launch();wait('Không kết nối được máy chủ. Kiểm tra kết nối mạng và thử lại.',90)
            assert not qa.matches(qa.tree(),'Đăng nhập'),'QA_OFFLINE_RESTORE_DISCARDED_SESSION'
            qa.screenshot('offline-session-retained')
            qa.command('shell','svc','wifi','enable'if network_before['wifi_on']in('1','2')else'disable')
            qa.command('shell','svc','data','enable'if network_before['mobile_data']=='1'else'disable');network_before=None
            progress('network-reconnect')
            # Wi-Fi enabling can finish before connectivity returns. Retry only
            # the read-only session restore after a completed failed attempt.
            for reconnect_attempt in range(3):
                press('Thử lại')
                restored=qa.wait_any(['Lập hợp đồng','Không kết nối được máy chủ. Kiểm tra kết nối mạng và thử lại.'],100)
                if qa.matches(restored,'Lập hợp đồng'):break
                time.sleep(3)
            else:raise RuntimeError('QA_NETWORK_RECONNECT_FAILED')
            checks.append('Offline process restore retains session; reconnect/retry restores authenticated workspace')
        progress('account-list');tab('Tổng quan');press('Mở Tài khoản và phân quyền');wait('Tạo tài khoản',90);qa.screenshot('03-live-accounts')
        progress('return-to-catalogue');qa.back();tab('Tổng quan');reveal('Lập hợp đồng',True);tab('Đội xe');reveal('Lịch sử điều chuyển',True)
        progress('export-columns');press('Tải Excel theo bộ lọc');wait('Chọn tất cả cột',90);qa.screenshot('04-live-export-columns')
        # Do not download the entire operational fleet. Columns/read only here;
        # actual native XLSX save is checked with a bounded synthetic file.
        checks.append('Native account permission and live Excel-column endpoint')
        progress('pending-and-logout');qa.back();tab('Tài khoản');reveal('Không có thao tác chờ đối chiếu trong phạm vi này.')
        qa.screenshot('05-live-empty-pending');logout();logged=False
        launch();wait('Đăng nhập',120);qa.screenshot('06-live-logout-survives-restart')
        checks.append('Empty live pending ledger, server logout, and no session on relaunch')
        diagnostics=collect(qa,module.PACKAGE)
        assert not diagnostics['errors']and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
        assert source_snapshot()==qa.source_files,'QA_SOURCE_CHANGED'
        result=dict(ok=True,liveBackend=True,developmentBinary=not release,signedReleaseReadSessionAcceptance=release,fullAcceptance=False,checks=checks,screenshots=7 if release else 6,businessSubmissions=0,credentialFilesWritten=0,originalCheckpointUnchanged=True,diagnostics=diagnostics,completedAt=datetime.now(timezone.utc).isoformat())
        (qa.output/'results.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(dict(ok=True,checks=len(checks),screenshots=result['screenshots'],businessSubmissions=0,signedReleaseReadSessionAcceptance=release)),flush=True)
    except Exception as error:
        # Do not dump input hierarchy/screenshots on a credential-entry failure.
        safe=str(error)if isinstance(error,(AssertionError,RuntimeError))else type(error).__name__
        if logged:
            try:qa.screenshot('failure-after-authentication')
            except Exception:pass
        (qa.output/'failure.json').write_text(json.dumps(dict(ok=False,stage=stage,error=safe,loggedIn=logged,credentialValuesLogged=False),indent=2),encoding='utf-8')
        print(json.dumps(dict(ok=False,error=safe,credentialValuesLogged=False)),flush=True)
        raise
    finally:
        credentials=None
        if network_before:
            qa.command('shell','svc','wifi','enable'if network_before['wifi_on']in('1','2')else'disable')
            qa.command('shell','svc','data','enable'if network_before['mobile_data']=='1'else'disable')
        if logged:
            try:
                for _ in range(5):
                    if qa.matches(qa.tree(),'Tài khoản'):break
                    qa.back()
                logout();logged=False
            except Exception:pass
        if added and 'tcp:8082'in reverse():qa.command('reverse','--remove','tcp:8082')
        unchanged=hashlib.sha256(original.read_bytes()).hexdigest()==checkpoint
        (qa.output/'restore.json').write_text(json.dumps(dict(originalCheckpointUnchanged=unchanged,reverseRestored=reverse()==before_reverse,liveSessionLoggedOut=not logged)),encoding='utf-8')
        assert unchanged


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--release-apk',type=Path);parser.add_argument('--focus-export-upgrade',action='store_true')
    args=parser.parse_args()
    try:run(args)
    except Exception:sys.exit(1)
