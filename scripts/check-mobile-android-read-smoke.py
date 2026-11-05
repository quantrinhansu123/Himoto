"""Samsung read/picker smoke on an isolated read-only fork; restore original routing."""
import argparse
import ast
import hashlib
import importlib.util
import json
import re
import urllib.request
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from lib.mobile_native_provenance import capture, source_snapshot
from lib.mobile_native_diagnostics import collect

parser = argparse.ArgumentParser()
parser.add_argument('--serial', required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--fork-state', type=Path, required=True)
parser.add_argument('--fixture-port', type=int, default=8135)
parser.add_argument('--only-battery', action='store_true')
parser.add_argument('--only-inventory', action='store_true')
args = parser.parse_args()
assert not args.output.exists() and args.fixture_port in [8135, 8136]
assert not (args.only_battery and args.only_inventory)
spec = importlib.util.spec_from_file_location('nativeqa', Path('scripts/check-mobile-native.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
qa = module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'), args.serial, args.output, physical=True)
tree = ast.parse(Path('scripts/check-mobile-gps-native.py').read_text(encoding='utf-8'))
names = {'reveal', 'press', 'tabs', 'routes', 'enter_login_field'}
nodes = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
assert len(nodes) == len(names)
exec(compile(ast.Module(body=nodes, type_ignores=[]), 'android-read-smoke-helpers', 'exec'), globals())
original = Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json')
original_sha = hashlib.sha256(original.read_bytes()).hexdigest()
fork_before = deepcopy(json.loads(args.fork_state.read_text(encoding='utf-8'))['state'])
before_routes = routes()
assert before_routes == {'tcp:8081': 'tcp:8081', 'tcp:8091': 'tcp:8131'}
assert not re.search(r'\bshowing=true\b', qa.command('shell', 'dumpsys', 'window', 'policy')), 'Wait for user unlock'
groups, restored = [], False
try:
    print('Warming Android source and preserving original Samsung checkpoint.', flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0', timeout=240) as response:
        assert 'http://127.0.0.1:8091' in response.read().decode()
    url = 'http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable'
    with urllib.request.urlopen(url, timeout=240) as response:
        entry = hashlib.file_digest(response, 'sha256').hexdigest()
    qa.source_files = capture(qa, entry)
    qa.started_epoch = int(qa.command('shell', 'date', '+%s').strip())
    qa.command('reverse', 'tcp:8091', f'tcp:{args.fixture_port}')
    assert routes() == {'tcp:8081': 'tcp:8081', 'tcp:8091': f'tcp:{args.fixture_port}'}
    qa.launch()
    print('Opening upgraded Android app on the isolated read-only API.', flush=True)
    initial = qa.wait_any(['Lập hợp đồng', 'Đăng nhập'], timeout=150)
    if qa.matches(initial, 'Đăng nhập'):
        # Only the preserved synthetic fork accepts these fixture credentials.
        enter_login_field('Tài khoản', 'qa')
        enter_login_field('Mật khẩu', 'fixture-password')
        press('Đăng nhập')
        qa.wait('Lập hợp đồng', timeout=90)
    if not args.only_battery and not args.only_inventory:
        print('Native workspace opened; checking dashboard.', flush=True)
        press('Mở Tổng quan giao dịch')
        qa.wait('Tổng quan giao dịch')
        reveal('Tổng hợp theo cơ sở')
        qa.screenshot('01-dashboard')
        assert any('1.700' in (node.get('text', '') + node.get('content-desc', '')) for node in qa.tree().iter('node'))
        groups.append('Native dashboard renders actual SQL synthetic metrics; no financial write')
        print('Dashboard rendered; checking staff organization.', flush=True)
        tabs()
        qa.tap('Tổng quan', bottom=True)
        press('Mở Nhân sự')
        press('Sơ đồ nhân sự')
        qa.wait('Sơ đồ nhân sự')
        reveal('Cơ sở QA')
        qa.screenshot('02-organization')
        groups.append('Native organization renders shared department/store projection')
    if args.only_inventory:
        print('Checking native fleet inventory.', flush=True)
        press('Mở Kho xe toàn hệ thống')
        reveal('28 / 28 xe toàn hệ thống · Trang 1/2')
        qa.screenshot('01-fleet-inventory')
        press('Khả năng điều chuyển', up=True)
        press('Chưa thể điều chuyển')
        reveal('2 / 28 xe toàn hệ thống · Trang 1/1')
        qa.screenshot('02-blocked-inventory')
        press('Khả năng điều chuyển', up=True)
        press('Tất cả xe')
        reveal('Tìm trong kho xe chung', up=True)
        qa.text('Tìm trong kho xe chung', '29X100001')
        qa.hide_keyboard()
        press('Tìm xe trong kho chung')
        reveal('1 / 28 xe toàn hệ thống · Trang 1/1')
        reveal('29-X1.00001')
        qa.screenshot('03-plate-search')
        groups.append('Native global inventory opens from workspace; availability and punctuation-free plate search render matching fixtures with zero submit')
    else:
        print('Checking battery people pickers.', flush=True)
        tabs()
        qa.tap('Tổng quan', bottom=True)
        press('Mở Hợp đồng pin / sạc', up=not args.only_battery)
        print('Battery list opened.', flush=True)
        press('Lập hợp đồng pin / sạc', up=True)
        qa.wait('Lập hợp đồng pin / sạc')
        print('Battery form opened.', flush=True)
        press('Gợi ý nhân viên ký hợp đồng pin')
        qa.wait('QA Đại diện')
        qa.screenshot('03-battery-staff-options')
        press('QA Đại diện')
        assert any(node.get('text') == 'QA Đại diện' for node in qa.matches(qa.tree(), 'Nhân viên ký hợp đồng pin'))
        press('Phần hợp đồng pin / sạc', up=True)
        qa.tap('Bên thuê')
        qa.wait('Tra cứu CCCD hoặc SĐT khách thuê pin')
        qa.screenshot('04-battery-customer-picker')
        qa.back()
        qa.wait('Rời hợp đồng pin?')
        press('Rời biểu mẫu pin')
        groups.append('Native active staff picker selects a name and tenant lookup opens; unsaved form is explicitly discarded with zero submit')
    print('Checking pending work and preservation.', flush=True)
    tabs()
    qa.tap('Tài khoản', bottom=True)
    press('Tải lại danh sách đối chiếu')
    reveal('Không có thao tác chờ đối chiếu trong phạm vi này.')
    qa.screenshot('05-pending-empty')
    press('Đăng xuất')
    qa.wait('Đăng nhập')
    assert source_snapshot() == qa.source_files
    fork_after = deepcopy(json.loads(args.fork_state.read_text(encoding='utf-8'))['state'])
    # Ordinary reads may refresh nested fixture session mirrors; every other
    # field, including original business requests/history/ledger, must match.
    for state in [fork_before, fork_after]:
        state.pop('sessions', None)
        state.pop('sessionSeq', None)
        for key in ['vehicle_transfers', 'vehicle_media']:
            state[key].pop('sessions', None)
    assert fork_after == fork_before
    assert hashlib.sha256(original.read_bytes()).hexdigest() == original_sha
    diagnostics = collect(qa, module.PACKAGE)
    assert not diagnostics['errors'] and diagnostics['newAppCrashes'] == diagnostics['newAppAnrs'] == diagnostics['newSystemUiAnrs'] == 0
    result = {'ok': True, 'fixtureOnly': True, 'fixturePort': args.fixture_port, 'groups': groups, 'sourceFilesMatch': len(qa.source_files), 'originalCheckpointUnchanged': True, 'forkBusinessUnchanged': True, 'serverBusinessWrites': 0, 'diagnostics': diagnostics, 'fullAcceptance': False, 'completedAt': datetime.now(timezone.utc).isoformat()}
    (qa.output / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False), flush=True)
except Exception:
    try:
        qa.screenshot('failure')
        collect(qa, module.PACKAGE)
        (qa.output / 'failure-observed.json').write_text(json.dumps({'originalCheckpointUnchanged': hashlib.sha256(original.read_bytes()).hexdigest() == original_sha, 'groupsCompleted': groups}), encoding='utf-8')
    except Exception:
        pass
    raise
finally:
    qa.command('reverse', 'tcp:8091', 'tcp:8131')
    restored = routes() == before_routes
    (qa.output / 'restore.json').write_text(json.dumps({'reverseRestored': restored, 'originalCheckpointUnchanged': hashlib.sha256(original.read_bytes()).hexdigest() == original_sha}), encoding='utf-8')
    assert restored
