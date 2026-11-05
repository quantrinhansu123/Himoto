"""Verify real Samsung IME credentials without changing keyboard/autofill settings."""
import argparse
import hashlib
import importlib.util
import json
import re
import urllib.request
from datetime import datetime,timezone
from pathlib import Path
from lib.mobile_native_provenance import capture

parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
spec=importlib.util.spec_from_file_location('nativeqa',Path(__file__).with_name('check-mobile-native.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
account_input_types=[]
def state():
    with urllib.request.urlopen('http://127.0.0.1:8097/__fixture_state',timeout=8) as reply:result=json.load(reply)
    assert result['fixtureOnly'];return result
def checkpoint():
    data=json.loads(Path('.backups/mobile-transfer-fixture-20261102/state.json').read_text(encoding='utf-8'))['state']
    return {name:data[name] for name in ('vehicles','pending','events','requests','delayed')}
def login(name,expected):
    qa.wait('Đăng nhập');qa.text('Tài khoản',name)
    fields=[node for node in qa.matches(qa.tree(),'Tài khoản') if node.get('class')=='android.widget.EditText']
    assert len(fields)==1 and fields[0].get('text')==name,'IME changed the typed account'
    assert fields[0].get('password')=='false','Username must stay visible and accessible as plain text'
    flags=re.search(r'mCurAttribute:\s*inputType=(0x[0-9a-fA-F]+)',qa.command('shell','dumpsys','input_method'))
    if flags:
        account_input_types.append(flags[1]);assert int(flags[1],16)&15==1,'Account input is missing TYPE_CLASS_TEXT'
    qa.command('shell','input','keyevent','66');qa.text('Mật khẩu','fixture-password');qa.hide_keyboard()
    fields=[node for node in qa.matches(qa.tree(),'Tài khoản') if node.get('class')=='android.widget.EditText']
    assert len(fields)==1 and fields[0].get('text')==name,'Account changed after Next/blur'
    qa.screenshot('01-literal-receiver' if name=='qa-receiver' else '02-plain-username')
    qa.tap('Đăng nhập');qa.wait('Mở Đội xe',timeout=90);qa.wait(expected)
def logout():
    qa.tap('Tài khoản',bottom=True);qa.scroll_to('Đăng xuất');qa.tap('Đăng xuất');qa.wait('Đăng nhập')
try:
    original=state();data_before=checkpoint();keyboard_before=qa.command('shell','settings','get','secure','default_input_method').strip()
    assert keyboard_before and keyboard_before!='null'
    print('Prewarming current login source with the existing Metro origin.',flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as reply:config=reply.read().decode()
    assert re.search(r"apiOrigin[\s\S]{0,150}['\"]http://127\.0\.0\.1:8091['\"]",config) or re.search(r"['\"]EXPO_PUBLIC_API_URL['\"]:\s*\{[^}]{0,100}value:\s*['\"]http://127\.0\.0\.1:8091['\"]",config)
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as reply:entry=hashlib.file_digest(reply,'sha256').hexdigest()
    qa.command('reverse','tcp:8081','tcp:8081');qa.command('reverse','tcp:8091','tcp:8097');qa.verify_device_network()
    qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip())
    qa.launch();qa.wait('Đăng nhập',timeout=180)
    login('qa-receiver','QA Người nhận')
    qa.passed('Existing Samsung IME preserves the original repeated-letter account before and after Next; the exact receiver account authenticates without the qa8 alias')
    logout();login('qa','QA Quản lý')
    qa.tap('Tài khoản',bottom=True);qa.scroll_to('Tải lại danh sách đối chiếu');qa.tap('Tải lại danh sách đối chiếu');qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.tap('Tổng quan',bottom=True)
    qa.passed('Plain staff username still authenticates after receiver logout; scoped pending ledger remains empty')
    qa.finish()
    result=json.loads((args.output/'results.json').read_text(encoding='utf-8'));after=state()
    assert checkpoint()==data_before and all(after[k]==original[k] for k in ('writes','receipts','tombstones'))
    assert qa.command('shell','settings','get','secure','default_input_method').strip()==keyboard_before
    result.update(mode='focused-login-ime',keyboardUnchanged=True,fixtureBusinessStateUnchanged=True,accountInputTypes=account_input_types)
    (args.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    qa.command('reverse','tcp:8091','tcp:8091')
    print('Focused login acceptance complete; previous USB API route restored.',flush=True)
except Exception as failure:
    result={'status':'failed','completedGroups':len(qa.checks),'checks':qa.checks,'error':str(failure),'mode':'focused-login-ime','startedEpoch':qa.started_epoch,'completedAt':datetime.now(timezone.utc).isoformat()}
    try:result['diagnostics']=module.collect_diagnostics(qa,module.PACKAGE)
    except Exception as error:result['diagnosticsError']=type(error).__name__
    (args.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    try:qa.screenshot('failure')
    except RuntimeError:pass
    raise
