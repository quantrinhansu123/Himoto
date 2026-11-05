"""Focused read-only report smoke + Android Excel save on the existing QA.

Open captures source/checkpoint, checks main navigation and opens the picker.
Save resumes that exact picker in a dedicated synthetic folder. Does not open
contract/customer links: the report SQL portfolio is separate from CRUD QA.
"""
import argparse
import ast
import base64
import hashlib
import importlib.util
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from lib.mobile_native_provenance import capture, source_snapshot
from lib.mobile_native_diagnostics import collect

parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--phase',choices=['open','ledger','save','verify'],required=True);args=parser.parse_args()
spec=importlib.util.spec_from_file_location('nativeqa',Path('scripts/check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
tree=ast.parse(Path('scripts/check-mobile-gps-native.py').read_text(encoding='utf-8'));names={'reveal','press','tabs','routes'};nodes=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name in names];assert len(nodes)==len(names)
exec(compile(ast.Module(body=nodes,type_ignores=[]),'reports-smoke-helpers','exec'),globals())
state_path=Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json');target='/sdcard/Download/HimotoQA/Reports-20261103'

def picker_nodes():return [n for n in qa.tree().iter('node') if 'documentsui' in n.get('package','')]

def system_press(labels):
    root=qa.tree();allowed=('com.android.documentsui','com.google.android.documentsui','com.android.packageinstaller','com.google.android.packageinstaller','android')
    matches=[n for n in root.iter('node') if n.get('package') in allowed and (n.get('text') in labels or n.get('content-desc') in labels) and n.get('enabled')=='true'];actionable=[n for n in matches if n.get('clickable')=='true'];matches=actionable or matches
    assert matches,'Expected QA folder control: '+str(labels)
    x1,y1,x2,y2=map(int,re.findall(r'\d+',matches[-1].get('bounds')));assert x2>x1 and y2>y1
    qa.command('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))

def select_report(label):
    press('Chọn báo cáo',True)
    assert not qa.matches(qa.tree(),'Doanh thu xe theo cơ sở chủ quản'),'Unentitled QA actor must not see the fleet option'
    qa.tap(label)

def press_choice(label):
    # A report name may also be the selected main-picker text. Require the
    # actual field button, rather than tapping that non-clickable child label.
    for _ in range(14):
        root=qa.tree();viewport=list(map(int,re.findall(r'\d+',next(root.iter('node')).get('bounds'))));width,height=viewport[2:]
        matches=[n for n in qa.matches(root,label) if n.get('clickable')=='true']
        for n in matches:
            x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')))
            if y1>=145 and y2<=height and y2>y1:
                qa.command('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));return
        qa.command('shell','input','swipe',str(width//2),str(int(height*.72)),str(width//2),str(int(height*.35)),'350')
    raise AssertionError('Actual choice button not found: '+label)

def ledger_open():
    press_choice('Sổ thu / chi');qa.tap('Phiếu chi');reveal('Tổng chi');qa.screenshot('05-ledger-totals');reveal('Phiếu theo bộ lọc');qa.screenshot('06-ledger-expense');press('Xuất Excel sổ thu / chi',True)
    for _ in range(10):
        nodes=picker_nodes()
        if nodes:break
    assert nodes,'Expected Android directory picker'
    known=['Show roots','Hiển thị gốc','Downloads','Download','Tải xuống','Bản tải xuống','HimotoQA','Reports-20261103','USE THIS FOLDER','SELECT','Select','CHỌN','CHỌN THƯ MỤC','SỬ DỤNG THƯ MỤC NÀY']
    controls=[{key:n.get(key) for key in ['text','content-desc','bounds','resource-id']} for n in nodes if n.get('text') in known or n.get('content-desc') in known]
    (qa.output/'picker-controls.json').write_text(json.dumps(controls,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'phase':'picker-open','controls':controls},ensure_ascii=False),flush=True)

if args.phase=='open':
    assert not (qa.output/'source-provenance.json').exists(),'Resume the existing export; do not start over'
    assert routes()=={'tcp:8081':'tcp:8081','tcp:8091':'tcp:8131'}
    before=json.loads(state_path.read_text(encoding='utf-8'));assert before['fixtureOnly'] and before['state']['reports_workspace']
    (qa.output/'before-state.json').write_text(json.dumps(before,ensure_ascii=False),encoding='utf-8')
    qa.command('shell','mkdir','-p',target);assert not qa.command('shell','ls','-1',target).splitlines(),'Use a fresh dedicated QA folder'
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as response:assert 'http://127.0.0.1:8091' in response.read().decode()
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
    capture(qa,entry);started=int(qa.command('shell','date','+%s').strip());(qa.output/'started-epoch.json').write_text(json.dumps({'startedEpoch':started}),encoding='utf-8')
    qa.launch();qa.wait('Lập hợp đồng',timeout=150);press('Mở Báo cáo doanh thu thuê xe');qa.wait('Chọn báo cáo',timeout=90)
    reveal('Doanh số ước tính');qa.screenshot('01-estimated-sales');reveal('Doanh thu thực thu');qa.screenshot('02-actual-rental-revenue')
    print('Default VN-month report opened with actual and estimated metrics.',flush=True)
    select_report('Doanh thu từng xe');reveal('Xem lượt thuê · Xe báo cáo QA 1');qa.screenshot('03-vehicle-revenue');press('Xem lượt thuê · Xe báo cáo QA 1');qa.wait('Chi tiết lượt thuê của xe');reveal('Mở hợp đồng · REPORT-101');qa.screenshot('04-vehicle-hire-detail');qa.back()
    print('Vehicle revenue drilldown opened; contract link deliberately not followed across separate QA portfolios.',flush=True)
    select_report('Sổ thu / chi');ledger_open()
else:
    proof=json.loads((qa.output/'source-provenance.json').read_text(encoding='utf-8'));current_sources=source_snapshot();changed=[key for key in set(current_sources)|set(proof['sourceFiles']) if current_sources.get(key)!=proof['sourceFiles'].get(key)]
    assert not changed or changed==['scripts/check-mobile-reports-native.py'],'App/shared/config must remain unchanged during native smoke'
    if changed:(qa.output/'harness-selector-update.json').write_text(json.dumps({'changed':changed,'originalSha256':proof['sourceFiles'][changed[0]],'updatedSha256':current_sources[changed[0]],'reason':'Resume read-only smoke after ambiguous selected report text opened the main picker; require the actual choice field button. No app source or checkpoint change.'},indent=2),encoding='utf-8')
    qa.started_epoch=json.loads((qa.output/'started-epoch.json').read_text(encoding='utf-8'))['startedEpoch']
    if args.phase=='ledger':
        root=qa.tree()
        if qa.matches(root,'Đóng Chọn báo cáo'):qa.tap('Sổ thu / chi')
        else:
            assert any(n.get('content-desc')=='Chọn báo cáo, Sổ thu / chi' for n in root.iter('node')),'Resume only the observed ledger report at its header'
        ledger_open();raise SystemExit(0)
    if args.phase=='save':
        assert picker_nodes(),'Resume only the existing Excel picker'
        assert any(n.get('text')=='HimotoQA' for n in picker_nodes()),'Expected device-storage Download initial directory'
        system_press(['HimotoQA']);system_press(['Reports-20261103']);system_press(['USE THIS FOLDER','Use this folder','SELECT','Select','CHỌN','CHỌN THƯ MỤC','SỬ DỤNG THƯ MỤC NÀY'])
    for _ in range(10):
        root=qa.tree();labels=[n.get('text','') for n in root.iter('node') if n.get('package')==module.PACKAGE and n.get('text','').startswith('Đã lưu 8 dòng vào ')]
        if labels:break
        if any(n.get('package') in ('com.android.documentsui','com.google.android.documentsui','android') and n.get('text') in ('ALLOW','Allow','CHO PHÉP','Cho phép') for n in root.iter('node')):system_press(['ALLOW','Allow','CHO PHÉP','Cho phép'])
    assert len(labels)==1,'Expected successful export of all eight QA receipt rows'
    reveal(labels[0],True);qa.screenshot('07-saved-excel-confirmation')
    files=qa.command('shell','ls','-1',target).splitlines();assert files==['HIMOTO-so-thu-chi-2026-11-01-2026-11-03.xlsx']
    data=qa.command('exec-out','cat',target+'/'+files[0],binary=True)
    before=json.loads((qa.output/'before-state.json').read_text(encoding='utf-8'))['state'];catalogue=json.loads(Path(before['reports_workspace']['catalogue']).read_text(encoding='utf-8'));expected=catalogue['exports']['ledger?from=2026-11-01&side=out&store_id=23&to=2026-11-03']
    assert data==base64.b64decode(expected['contentBase64']);(qa.output/'exported-qa.xlsx').write_bytes(data)
    tabs();qa.tap('Tài khoản',bottom=True);press('Tải lại bản đang soạn trên thiết bị');reveal('Không có bản đang soạn được giữ trên thiết bị.');press('Tải lại danh sách đối chiếu');reveal('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.screenshot('08-empty-ledger');tabs();qa.tap('Tổng quan',bottom=True);reveal('Lập hợp đồng',True);qa.screenshot('09-demo-ready')
    after=json.loads(state_path.read_text(encoding='utf-8'))['state'];assert after==before,'Read-only report/export must preserve the business checkpoint'
    assert source_snapshot()==current_sources;diagnostics=collect(qa,module.PACKAGE)
    result={'status':'passed' if not diagnostics['errors'] and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0 else 'functional-pass-diagnostics-incomplete','fixtureOnly':True,'focusedHappyPathOnly':True,'groups':['Default month estimates/actual receipts','Vehicle revenue/hire drilldown','Ledger expense side + both-sheet XLSX save'],'xlsxRows':8,'xlsxSha256':hashlib.sha256(data).hexdigest(),'fileOnSamsung':target+'/'+files[0],'sourceFilesMatch':len(proof['sourceFiles'])-len(changed),'harnessOnlySelectorUpdate':bool(changed),'qaCheckpointUnchanged':True,'pendingLedgerEmpty':True,'openWorkEmpty':True,'diagnostics':diagnostics,'reverseMappingsKept':routes(),'crossPortfolioContractLinksTested':False,'fullAcceptance':False,'completedAt':datetime.now(timezone.utc).isoformat()}
    (qa.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
