"""Samsung catalogue CRUD/status + inline composer creation. Synthetic QA only.

Never replay/reset an interrupted write. Inspect its original receipts first.
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
parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();assert not args.output.exists(),'Inspect original evidence and UUIDs before resuming'
spec=importlib.util.spec_from_file_location('nativeqa',Path('scripts/check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
tree=ast.parse(Path('scripts/check-mobile-gps-native.py').read_text(encoding='utf-8'));names={'reveal','press','tabs','routes'};nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names];assert len(nodes)==len(names);exec(compile(ast.Module(body=nodes,type_ignores=[]),'contract-types-smoke-helpers','exec'),globals())
state_path=Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json');before=json.loads(state_path.read_text(encoding='utf-8'))['state'];workspace=before['types_workspace'];assert not workspace['requests'];(qa.output/'before-state.json').write_text(json.dumps(before,ensure_ascii=False),encoding='utf-8');preserved=json.loads(Path('.backups/mobile-cashbook-delete-native-20261103-run1/preserved-checkpoints.json').read_text(encoding='utf-8'))
name='QAType24Month0311';renamed='QAType24Renamed0311';inline='QAInlineType0311'
def edit(label,value):
    qa.hide_keyboard();reveal(label);qa.text(label,value,replace=True);qa.hide_keyboard()
def acknowledge():
    qa.wait('Đã lưu loại hợp đồng',timeout=90);reveal('Đã kiểm tra xác nhận loại hợp đồng');qa.screenshot('receipt-'+str(len(list(qa.output.glob('receipt-*.png')))+1));press('Đã kiểm tra xác nhận loại hợp đồng')
def confirm():
    qa.wait('Lưu loại hợp đồng?');press('Xác nhận lưu loại hợp đồng');acknowledge()
try:
    assert routes()=={'tcp:8081':'tcp:8081','tcp:8091':'tcp:8131'};assert not re.search(r'\bshowing=true\b',qa.command('shell','dumpsys','window','policy')),'Wait for user unlock; do not bypass keyguard'
    print('Prewarming current contract type source before exclusive Samsung smoke.',flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as response:assert 'http://127.0.0.1:8091' in response.read().decode()
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
    qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip());qa.launch();qa.wait('Lập hợp đồng',timeout=150);press('Mở Loại hợp đồng');qa.wait('Thêm loại hợp đồng',timeout=90);qa.screenshot('01-types-list');press('Thêm loại hợp đồng');qa.wait('Tên loại hợp đồng');edit('Tên loại hợp đồng',name);press('Cách tính tiền loại hợp đồng');qa.tap('Thuê theo tháng');edit('Thời hạn gợi ý loại hợp đồng (tháng)','24');qa.screenshot('02-new-monthly-type');press('Rà soát thêm loại hợp đồng');confirm();qa.wait('Loại hợp đồng');reveal('Đổi tên loại · '+name);qa.screenshot('03-created-type')
    press('Đổi tên loại · '+name);reveal('Tên loại hợp đồng',True);edit('Tên loại hợp đồng',renamed);press('Rà soát tên loại hợp đồng');confirm();qa.wait('Loại hợp đồng');press('Ẩn loại · '+renamed);confirm();qa.wait('Loại hợp đồng');reveal('Hiện loại · '+renamed);qa.screenshot('04-hidden-type');press('Hiện loại · '+renamed);confirm();qa.wait('Loại hợp đồng');reveal('Ẩn loại · '+renamed);qa.screenshot('05-type-visible-again');print('Catalogue create/rename/hide/unhide acknowledged with four original text-ID receipts.',flush=True)
    tabs();qa.tap('Tổng quan',bottom=True);reveal('Lập hợp đồng',True);press('Lập hợp đồng');qa.wait('Loại hợp đồng',timeout=90);press('Quản lý loại hợp đồng ngay khi soạn');qa.wait('Thêm loại hợp đồng');press('Thêm loại hợp đồng');qa.wait('Tên loại hợp đồng');edit('Tên loại hợp đồng',inline);press('Rà soát thêm loại hợp đồng');confirm();qa.wait('Quản lý loại hợp đồng ngay khi soạn');reveal('Loại hợp đồng',True);root=qa.tree();assert any(n.get('content-desc','').startswith('Loại hợp đồng, '+inline) or n.get('text')==inline for n in root.iter('node'));qa.screenshot('06-inline-created-selected');print('Inline composer creation selects its exact new active type without a server draft write.',flush=True)
    qa.back();qa.wait('Rời bản nháp?');press('Rời bản nháp');qa.wait('Lập hợp đồng');press('Lập hợp đồng');qa.wait('Có bản đang soạn trên thiết bị');press('Bỏ bản trên thiết bị');qa.wait('Bỏ bản đang soạn trên thiết bị?');press('Bỏ bản trên thiết bị');qa.wait('Loại hợp đồng');qa.back();qa.wait('Lập hợp đồng');tabs();qa.tap('Tài khoản',bottom=True);press('Tải lại bản đang soạn trên thiết bị');reveal('Không có bản đang soạn được giữ trên thiết bị.');press('Tải lại danh sách đối chiếu');reveal('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.screenshot('07-empty-work-ledger');tabs();qa.tap('Tổng quan',bottom=True);reveal('Lập hợp đồng',True);qa.screenshot('08-demo-ready')
    after=json.loads(state_path.read_text(encoding='utf-8'))['state'];new=after.pop('types_workspace');old=before.pop('types_workspace');assert after==before and new['manifest']==old['manifest'];assert len(new['requests'])==5 and all(new['rows'][k]==v for k,v in old['rows'].items());created=[v for k,v in new['rows'].items() if k not in old['rows']];assert len(created)==2;monthly=next(t for t in created if t['label']==renamed);assert monthly['rental_type']=='monthly' and monthly['term_months']==24 and monthly['active'];daily=next(t for t in created if t['label']==inline);assert daily['rental_type']=='daily' and daily['term_months']is None and daily['active'];assert {r['receipt']['typeId'] for r in new['requests'].values()}=={t['id'] for t in created}
    for filename,sha in preserved.items():assert hashlib.sha256(Path(filename).read_bytes()).hexdigest()==sha
    assert source_snapshot()==qa.source_files;diagnostics=collect(qa,module.PACKAGE);assert not diagnostics['errors'] and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
    result={'status':'passed','fixtureOnly':True,'focusedHappyPathOnly':True,'groups':['Create monthly24 and rename/hide/unhide with exact text-ID receipt acknowledgements','Inline creation selects the new daily type in the actual composer','Discard only this new unsaved local draft; clean work/ledger and demo overview'],'sourceFilesMatch':len(qa.source_files),'newTypeRequests':5,'requestKeys':list(new['requests']),'createdTypeIds':[t['id'] for t in created],'allOldFieldsUnchanged':True,'previousCheckpointsPreserved':len(preserved),'openWorkEmpty':True,'pendingLedgerEmpty':True,'diagnostics':diagnostics,'reverseMappingsKept':routes(),'operationalDatabaseWrites':0,'fullAcceptance':False,'completedAt':datetime.now(timezone.utc).isoformat()};(qa.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
except Exception:
    try:qa.screenshot('failure');payload=json.loads(state_path.read_text(encoding='utf-8'));(qa.output/'failure-observed.json').write_text(json.dumps({'generation':payload['generation'],'typesWorkspace':payload['state']['types_workspace']},ensure_ascii=False,indent=2),encoding='utf-8')
    except Exception:pass
    raise
