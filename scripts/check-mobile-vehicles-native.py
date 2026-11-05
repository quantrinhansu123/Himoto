"""Focused Samsung vehicle happy-path smoke; no provider, camera or deep matrix."""
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

parser = argparse.ArgumentParser(); parser.add_argument('--serial', required=True); parser.add_argument('--output', type=Path, required=True); resume = parser.add_mutually_exclusive_group(); resume.add_argument('--resume-created', action='store_true'); resume.add_argument('--resume-updated', action='store_true'); args = parser.parse_args()
assert not args.output.exists()
spec = importlib.util.spec_from_file_location('nativeqa', Path('scripts/check-mobile-native.py')); module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
qa = module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'), args.serial, args.output, physical=True)
tree = ast.parse(Path('scripts/check-mobile-gps-native.py').read_text(encoding='utf-8')); names = {'reveal', 'press', 'enter_login_field', 'login', 'tabs', 'routes'}
nodes = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]; assert len(nodes) == len(names)
exec(compile(ast.Module(body=nodes, type_ignores=[]), 'vehicle-smoke-helpers', 'exec'), globals())
new_path = Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json'); previous_path = Path('.backups/mobile-demo-workspace-fixture-20261103-run1/state.json')
old_state = json.loads(previous_path.read_text(encoding='utf-8'))['state']
preserved = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in Path('.backups').glob('mobile-*/state.json') if '-fixture-' in path.parent.name and path.resolve() not in (new_path.resolve(), previous_path.resolve())}


def stats():
    with urllib.request.urlopen('http://127.0.0.1:8131/__fixture_state', timeout=12) as response: value = json.load(response)
    assert value['fixtureOnly'] and value['vehicleWorkspace']; return value


def account_empty():
    tabs(); qa.tap('Tài khoản', bottom=True); press('Tải lại bản đang soạn trên thiết bị'); reveal('Không có bản đang soạn được giữ trên thiết bị.'); press('Tải lại danh sách đối chiếu'); reveal('Không có thao tác chờ đối chiếu trong phạm vi này.')


def edit(label, value):
    assert re.fullmatch(r'[A-Za-z0-9-]+', value)
    qa.hide_keyboard(); reveal(label); qa.text(label, value, replace=True); qa.hide_keyboard()


switched = False
result = {'status': 'failed', 'error': 'Not completed'}
try:
    assert routes() == {'tcp:8081': 'tcp:8081', 'tcp:8091': 'tcp:8131' if args.resume_created or args.resume_updated else 'tcp:8130'}
    initial = stats()
    if args.resume_updated:
        previous = json.loads(Path('.backups/mobile-vehicles-native-20261103-run2/results.json').read_text(encoding='utf-8'))
        assert previous['status']=='failed' and previous['passed']==1 and len(initial['vehicleRequests'])==2
        original_request = next(row for row in initial['vehicleRequests'].values() if row['operation']=='vehicle.create'); assert original_request['receipt']['id']==8001
        current = next(row for row in initial['vehicleProfiles'] if row['id']==8001); assert current['values']['odometer']==12125 and current['values']['color']=='RedQA'
    elif args.resume_created:
        previous = json.loads(Path('.backups/mobile-vehicles-native-20261103-run1/results.json').read_text(encoding='utf-8'))
        assert previous['status']=='failed' and 'Đã kiểm tra xác nhận lưu xe' in previous['error'] and len(initial['vehicleRequests'])==1
        original_request = next(iter(initial['vehicleRequests'].values())); assert original_request['operation']=='vehicle.create' and original_request['receipt']['id']==8001
    else: assert not initial['vehicleRequests'] and initial['activeSessions'] == 0
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0', timeout=180) as response: config = response.read().decode()
    assert 'http://127.0.0.1:8091' in config
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable', timeout=600) as response: entry = hashlib.file_digest(response, 'sha256').hexdigest()
    qa.source_files = capture(qa, entry); qa.started_epoch = int(qa.command('shell', 'date', '+%s').strip())
    (qa.output/'started-epoch.json').write_text(json.dumps({'startedEpoch': qa.started_epoch}), encoding='utf-8')
    qa.launch(); qa.wait('Lập hợp đồng', timeout=150)
    if args.resume_updated:
        switched=True; account_empty(); tabs(); qa.tap('Đội xe',bottom=True)
        search_fields=[node for node in qa.matches(qa.tree(),'Tìm đội xe') if node.get('class')=='android.widget.EditText'];assert len(search_fields)==1 and search_fields[0].get('text','') in ('','Tìm biển số, tên xe, nhãn hiệu'),'Expected the empty QA vehicle search'
        qa.text('Tìm đội xe','QA-NEW0311');qa.hide_keyboard();press('Xem QA-NEW0311, VehicleQA0311'); qa.wait('QA-NEW0311'); reveal('Sửa hồ sơ xe')
    elif args.resume_created:
        switched=True;tabs();qa.tap('Tài khoản',bottom=True);press('Tải lại danh sách đối chiếu');press('Đối chiếu thêm xe');qa.tap('Đối chiếu với máy chủ');press('Mở kết quả thêm xe');qa.wait('Đã lưu xe #8001')
    else:
        account_empty(); qa.screenshot('01-old-demo-work-ledger-empty');press('Đăng xuất'); qa.wait('Đăng nhập'); qa.command('reverse', 'tcp:8091', 'tcp:8131'); switched = True
        qa.launch(); login('qa'); qa.tap('Đội xe', bottom=True); qa.wait('Thêm xe'); qa.tap('Thêm xe'); qa.wait('Tên / dòng xe')
        edit('Tên / dòng xe', 'VehicleQA0311'); edit('Biển số', 'QA-NEW0311'); edit('Năm sản xuất', '2026'); edit('Số km', '12')
        press('Cơ sở hiện tại'); qa.tap('Cơ sở QA'); press('Rà soát và thêm xe'); qa.wait('Thêm xe vào kho?'); qa.tap('Xác nhận')
    if not args.resume_updated:
        qa.wait('Đã lưu xe #8001', timeout=60); qa.screenshot('02-original-create-receipt'); press('Đã kiểm tra xác nhận lưu xe'); qa.wait('QA-NEW0311');reveal('Sửa hồ sơ xe')
        assert len(stats()['vehicleRequests']) == 1
    qa.passed('Original vehicle8001 is retained, its earlier receipts are acknowledged and no duplicate creation occurred; failed prior runs remain preserved' if args.resume_updated else 'The original vehicle8001 creation and exact UUID confirmation were acknowledged without creating another vehicle; prior failed evidence is retained' if args.resume_created else 'Original QA work/ledger were empty before explicit dataset switch; native creation saves one exact vehicle8001 and its original UUID confirmation')

    press('Sửa hồ sơ xe'); qa.wait('Tên / dòng xe'); edit('Màu sắc', 'RedQA'); edit('Số km', '125')
    press('Rà soát và lưu xe'); qa.wait('Lưu thay đổi xe?'); qa.tap('Xác nhận'); qa.wait('Đã lưu xe #8001'); press('Đã kiểm tra xác nhận lưu xe'); reveal('RedQA')
    current = next(row for row in stats()['vehicleProfiles'] if row['id'] == 8001)
    expected_requests = 3 if args.resume_updated else 2
    assert current['values']['color'] == 'RedQA' and current['values']['odometer'] == 125 and current['ownerStoreId'] == current['values']['store_id'] == 23 and len(stats()['vehicleRequests']) == expected_requests, 'Saved vehicle does not match the verified editor values'
    press('Lịch sử xe'); qa.wait('Chỉnh sửa thông tin xe'); qa.screenshot('03-audit-timeline'); qa.back(); press('Giấy tờ xe')
    qa.wait('Chọn mục ảnh hoặc video'); qa.tap('Chọn mục ảnh hoặc video'); qa.wait('Đăng ký xe mặt trước'); qa.screenshot('04-vehicle-document-slots'); qa.back(); qa.back()
    qa.passed('Native revision update retains the same vehicle/owner/store and shows its timeline; the saved-vehicle registration/purchase gallery opens with typed slots (no camera/provider claims)')

    tabs(); qa.tap('Đội xe', bottom=True); qa.tap('Lịch sử điều chuyển'); qa.wait('Điều chuyển toàn hệ thống'); qa.wait('QA-001 · Nhận xe'); qa.screenshot('05-global-transfer-history')
    qa.tap('Bộ lọc điều chuyển'); press('Thao tác điều chuyển'); qa.tap('Chuyển xe'); press('Ẩn bộ lọc điều chuyển',True);qa.wait('Không có điều chuyển phù hợp'); qa.screenshot('06-filtered-transfer-history')
    account_empty(); qa.screenshot('07-final-work-ledger-empty'); tabs(); qa.tap('Tổng quan', bottom=True); reveal('Lập hợp đồng', True); qa.screenshot('08-vehicle-demo-ready')
    assert source_snapshot() == qa.source_files
    for name, sha in preserved.items(): assert hashlib.sha256(Path(name).read_bytes()).hexdigest() == sha
    after = json.loads(previous_path.read_text(encoding='utf-8'))['state']; assert all(old_state.get(key) == after.get(key) for key in set(old_state) | set(after) if key not in ('sessions', 'sessionSeq'))
    diagnostics = collect(qa, module.PACKAGE); assert diagnostics['newAppCrashes'] == diagnostics['newAppAnrs'] == diagnostics['newSystemUiAnrs'] == 0 and not diagnostics['errors']
    result = {'status': 'passed', 'resumedOriginalCreate':args.resume_created,'correctedQaInput':args.resume_updated,'priorRunPreserved':args.resume_created or args.resume_updated,'passed': len(qa.checks), 'checks': qa.checks, 'focusedSmokeOnly': True, 'fixtureOnly': True, 'sourceFilesMatch': len(qa.source_files), 'pendingLedgerEmpty': True, 'openWorkEmpty': True, 'vehicleRequests': expected_requests, 'vehicleId': 8001, 'priorCheckpointsPreserved': len(preserved), 'diagnostics': diagnostics, 'hostApiPort': 8131, 'fullAcceptance': False, 'completedAt': datetime.now(timezone.utc).isoformat()}
except Exception as error:
    result = {'status': 'failed', 'passed': len(qa.checks), 'checks': qa.checks, 'error': str(error), 'errorType':type(error).__name__, 'switched': switched, 'hostApiPort': 8131 if switched else 8130, 'completedAt': datetime.now(timezone.utc).isoformat()}
    try: qa.screenshot('failure')
    except Exception: pass
    raise
finally:
    # Keep the exact current server for any unresolved request after a failure.
    result['reverseMappingsKept'] = routes(); (qa.output/'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8'); print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
