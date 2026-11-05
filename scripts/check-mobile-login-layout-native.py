"""Physical Samsung login layout only. Never submit credentials or clear app data."""
import argparse, hashlib, importlib.util, json, re, time, urllib.request
from pathlib import Path
from datetime import datetime, timezone
from lib.mobile_native_provenance import capture, source_snapshot
from lib.mobile_native_diagnostics import collect
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
assert not args.output.exists()
spec=importlib.util.spec_from_file_location('qa',Path('scripts/check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),'282a05859f3f7ece',args.output,physical=True)
state=Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json');before=hashlib.sha256(state.read_bytes()).hexdigest()
assert before=='5771b6d70cde7f43f0c5388b4935e42b8d268a295c3b23c63dbabac6e8f91077'
source=source_snapshot()
try:
    print('Preparing current Samsung login bundle; no login submit.',flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
    qa.command('reverse','tcp:8081','tcp:8081');qa.command('reverse','tcp:8091','tcp:8131')
    qa.started_epoch=int(qa.command('shell','date','+%s').strip());qa.source_files=capture(qa,entry)
    qa.launch();tree=qa.wait('Tài khoản',timeout=180)
    tree=qa.tree();labels=' '.join(str(n.get('text','')) for n in tree.iter('node'))
    assert 'Theo dõi đội xe' not in labels and 'Một điểm chạm.' not in labels
    logos=qa.matches(tree,'Himoto');assert logos,'Himoto logo missing'
    bounds=lambda node:list(map(int,re.findall(r'\d+',node.get('bounds'))))
    _,_,width,height=bounds(next(tree.iter('node')))
    logo=bounds(logos[0]);assert abs((logo[0]+logo[2])/2-width/2)<=width*.025,(logo,width)
    buttons=[n for n in qa.matches(tree,'Đăng nhập') if n.get('clickable')=='true'];assert len(buttons)==1
    button=bounds(buttons[0]);assert button[3]<height-60 and button[3]-button[1]>=48
    qa.screenshot('01-centered-login')
    qa.tap('Đăng nhập');qa.wait('Nhập tài khoản và mật khẩu để tiếp tục.');qa.screenshot('02-empty-validation')
    qa.tap('Mật khẩu');qa.wait('Mật khẩu');qa.screenshot('03-keyboard')
    qa.hide_keyboard();qa.tap('Hiện mật khẩu');qa.wait('Ẩn mật khẩu');qa.tap('Ẩn mật khẩu');qa.wait('Hiện mật khẩu')
    assert source_snapshot()==source
    diagnostics=collect(qa,module.PACKAGE);assert diagnostics['newAppCrashes']==0 and diagnostics['newAppAnrs']==0
    result={'ok':True,'physicalSamsung':True,'logoCentered':True,'removedMarketingCopy':True,'submitVisibleWithoutScroll':True,'validation':True,'passwordToggle':True,'businessSubmissions':0,'credentialSubmissions':0,'sourceUnchanged':True,'diagnostics':diagnostics,'completedAt':datetime.now(timezone.utc).isoformat()}
    (args.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(result),flush=True)
except Exception as e:
    (args.output/'failure.json').write_text(json.dumps({'ok':False,'error':str(e)[:1000]}),encoding='utf8')
    raise
finally:
    assert hashlib.sha256(state.read_bytes()).hexdigest()==before,'Original checkpoint changed; do not reset/replay'
    (args.output/'restore.json').write_text(json.dumps({'checkpointUnchanged':True,'generation':81,'appDataCleared':False,'appUninstalled':False}),encoding='utf8')
