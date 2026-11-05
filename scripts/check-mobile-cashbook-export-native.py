"""Samsung CSV file happy path, in two observable phases; no business writes.

Open captures the current source/checkpoint and opens the Android folder picker.
Save resumes that exact picker, selecting only the dedicated synthetic QA folder.
"""
import argparse
import ast
import hashlib
import importlib.util
import json
import re
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from lib.mobile_native_provenance import capture, source_snapshot
from lib.mobile_native_diagnostics import collect
from lib.mobile_cashbook_fixture import export_csv

parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--phase',choices=['open','save','verify'],required=True);args=parser.parse_args()
spec=importlib.util.spec_from_file_location('nativeqa',Path('scripts/check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
tree=ast.parse(Path('scripts/check-mobile-gps-native.py').read_text(encoding='utf-8'));names={'reveal','press','tabs','routes'};nodes=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name in names];assert len(nodes)==len(names)
exec(compile(ast.Module(body=nodes,type_ignores=[]),'csv-smoke-helpers','exec'),globals())
state_path=Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json');target='/sdcard/Download/HimotoQA/Exports-20261103'

def picker_nodes():
    return [n for n in qa.tree().iter('node') if 'documentsui' in n.get('package','')]

def system_press(labels):
    root=qa.tree();allowed=('com.android.documentsui','com.google.android.documentsui','com.android.packageinstaller','com.google.android.packageinstaller','android')
    matches=[n for n in root.iter('node') if n.get('package') in allowed and (n.get('text') in labels or n.get('content-desc') in labels) and n.get('enabled')=='true']
    actionable=[n for n in matches if n.get('clickable')=='true'];matches=actionable or matches
    if not matches: raise AssertionError('Expected system folder control: '+str(labels))
    n=matches[-1];x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')));assert x2>x1 and y2>y1
    qa.command('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))

if args.phase=='open':
    assert not (qa.output/'source-provenance.json').exists(),'Resume the existing picker; do not start another export'
    assert routes()=={'tcp:8081':'tcp:8081','tcp:8091':'tcp:8131'}
    before=json.loads(state_path.read_text(encoding='utf-8'));assert before['fixtureOnly']
    (qa.output/'before-state.json').write_text(json.dumps(before,ensure_ascii=False),encoding='utf-8')
    qa.command('shell','mkdir','-p',target)
    files=qa.command('shell','ls','-1',target).splitlines();assert not files,'Use the new dedicated QA export folder'
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as response:assert 'http://127.0.0.1:8091' in response.read().decode()
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
    capture(qa,entry);started=int(qa.command('shell','date','+%s').strip());(qa.output/'started-epoch.json').write_text(json.dumps({'startedEpoch':started}),encoding='utf-8')
    qa.launch();qa.wait('Lập hợp đồng',timeout=150);press('Mở Sổ quỹ / Sổ két');qa.wait('Xuất CSV sổ quỹ',timeout=90);qa.screenshot('01-export-action');press('Xuất CSV sổ quỹ')
    for _ in range(10):
        nodes=picker_nodes()
        if nodes:break
    assert nodes,'Expected Android directory picker'
    # Keep only known navigation/QA controls, avoiding unrelated file names.
    known=['Show roots','Hiển thị gốc','Open navigation drawer','Downloads','Download','Tải xuống','Bản tải xuống','HimotoQA','Exports-20261103','USE THIS FOLDER','SELECT','Select','CHỌN','CHỌN THƯ MỤC','SỬ DỤNG THƯ MỤC NÀY']
    controls=[{key:n.get(key) for key in ['text','content-desc','bounds','resource-id']} for n in nodes if n.get('text') in known or n.get('content-desc') in known]
    (qa.output/'picker-controls.json').write_text(json.dumps(controls,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'phase':'picker-open','controls':controls},ensure_ascii=False),flush=True)
else:
    proof=json.loads((qa.output/'source-provenance.json').read_text(encoding='utf-8'));current_sources=source_snapshot()
    changed=[key for key in set(current_sources)|set(proof['sourceFiles']) if current_sources.get(key)!=proof['sourceFiles'].get(key)]
    assert not changed or changed==['scripts/check-mobile-cashbook-export-native.py'],'App/shared/config must stay identical while the system picker is open'
    if changed:
        (qa.output/'harness-locale-update.json').write_text(json.dumps({'changed':changed,'originalSha256':proof['sourceFiles'][changed[0]],'updatedSha256':current_sources[changed[0]],'reason':'QA harness update for Vietnamese system labels and raw adb file transport; app/shared/config unchanged'},indent=2),encoding='utf-8')
    matching_files=len(current_sources)-len(changed);proof['sourceFiles']=current_sources
    qa.started_epoch=json.loads((qa.output/'started-epoch.json').read_text(encoding='utf-8'))['startedEpoch']
    if args.phase=='save':
        assert picker_nodes(),'Resume only the original CSV folder picker'
        # The app supplies the device-storage Download initial URI, avoiding the
        # Android 9 Downloads-provider raw tree which rejects file creation.
        assert any(n.get('text')=='HimotoQA' for n in picker_nodes()),'Expected the device-storage Download folder from the initial URI'
        system_press(['HimotoQA']);system_press(['Exports-20261103']);system_press(['USE THIS FOLDER','Use this folder','SELECT','Select','CHỌN','CHỌN THƯ MỤC','SỬ DỤNG THƯ MỤC NÀY'])
    for _ in range(10):
        root=qa.tree()
        labels=[n.get('text','') for n in root.iter('node') if n.get('package')==module.PACKAGE and n.get('text','').startswith('Đã lưu 10 dòng vào ')]
        if labels:break
        allow=[n for n in root.iter('node') if n.get('package') in ('com.android.documentsui','com.google.android.documentsui','com.android.packageinstaller','com.google.android.packageinstaller','android') and n.get('text') in ('ALLOW','Allow','CHO PHÉP','Cho phép')]
        if allow:system_press(['ALLOW','Allow','CHO PHÉP','Cho phép'])
    assert len(labels)==1,'Expected successful export of all 10 QA vouchers'
    reveal(labels[0],True);qa.screenshot('02-saved-csv-confirmation')
    files=qa.command('shell','ls','-1',target).splitlines();assert len(files)==1 and re.fullmatch(r'himoto-so-quy-qa-[0-9]+\.csv',files[0])
    # adb shell on this Android 9 device translates LF to CRLF, corrupting a
    # byte comparison of CSV's original CRLF. exec-out reads the actual bytes.
    data=qa.command('exec-out','cat',target+'/'+files[0],binary=True)
    before=json.loads((qa.output/'before-state.json').read_text(encoding='utf-8'))['state'];assert data.decode('utf-8')==export_csv(before['cashbook_workspace']['vouchers'])
    (qa.output/'exported-qa.csv').write_bytes(data)
    tabs();qa.tap('Tài khoản',bottom=True);press('Tải lại bản đang soạn trên thiết bị');reveal('Không có bản đang soạn được giữ trên thiết bị.');press('Tải lại danh sách đối chiếu');reveal('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.screenshot('03-empty-ledger');tabs();qa.tap('Tổng quan',bottom=True);reveal('Lập hợp đồng',True);qa.screenshot('04-demo-ready')
    after=json.loads(state_path.read_text(encoding='utf-8'))['state'];assert after==before,'Native export must not mutate the business checkpoint'
    assert source_snapshot()==proof['sourceFiles'];diagnostics=collect(qa,module.PACKAGE)
    result={'status':'passed' if not diagnostics['errors'] and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0 else 'functional-pass-diagnostics-incomplete','fixtureOnly':True,'focusedHappyPathOnly':True,'csvRows':10,'csvSha256':hashlib.sha256(data).hexdigest(),'fileOnSamsung':target+'/'+files[0],'sourceFilesMatch':matching_files,'harnessOnlyLocaleUpdate':bool(changed),'qaCheckpointUnchanged':True,'pendingLedgerEmpty':True,'openWorkEmpty':True,'diagnostics':diagnostics,'reverseMappingsKept':routes(),'fullAcceptance':False,'completedAt':datetime.now(timezone.utc).isoformat()}
    (qa.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
