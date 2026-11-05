"""Focused demo smoke on Samsung; preserves old datasets and keeps new QA running.

This is not full native, role/scope, network or release acceptance.
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

parser = argparse.ArgumentParser()
parser.add_argument('--serial', required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--fixture-port', type=int, default=8130)
parser.add_argument('--state-file', type=Path, required=True)
args = parser.parse_args()
assert 8100 <= args.fixture_port <= 8199 and not args.output.exists()
spec = importlib.util.spec_from_file_location('nativeqa', Path(__file__).with_name('check-mobile-native.py'))
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
qa = module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'), args.serial, args.output, physical=True)
tree = ast.parse(Path('scripts/check-mobile-gps-native.py').read_text(encoding='utf-8'))
names = {'reveal', 'press', 'enter_login_field', 'login', 'tabs', 'routes'}
nodes = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
assert len(nodes) == len(names)
exec(compile(ast.Module(body=nodes, type_ignores=[]), 'demo-native-helpers', 'exec'), globals())


def stats():
    with urllib.request.urlopen(f'http://127.0.0.1:{args.fixture_port}/__fixture_state', timeout=12) as response:
        result = json.load(response)
    assert result['fixtureOnly'] and result['demoWorkspace']
    return result


def account_empty():
    tabs(); qa.tap('Tài khoản', bottom=True)
    press('Tải lại bản đang soạn trên thiết bị'); reveal('Không có bản đang soạn được giữ trên thiết bị.')
    press('Tải lại danh sách đối chiếu'); reveal('Không có thao tác chờ đối chiếu trong phạm vi này.')


def home():
    tabs(); qa.tap('Tổng quan', bottom=True); reveal('Lập hợp đồng', True)


def edit(label, value):
    assert re.fullmatch(r'[A-Za-z0-9-]+', value)
    qa.hide_keyboard(); reveal(label); qa.text(label, value); qa.hide_keyboard()


original_route = None
switched = False
original_watch = Path('.backups/mobile-contract-flow-fixture-20261102/state.json')
watch_before = json.loads(original_watch.read_text(encoding='utf-8'))['state']
preserved = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in Path('.backups').glob('mobile-*/state.json') if '-fixture-' in path.parent.name and path.resolve() not in (args.state_file.resolve(), original_watch.resolve())}
try:
    original_route = routes()
    assert original_route == {'tcp:8081': 'tcp:8081', 'tcp:8091': 'tcp:8101'}
    assert stats()['activeSessions'] == 0 and not stats()['dutyRequests']
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0', timeout=180) as response:
        config = response.read().decode()
    assert 'http://127.0.0.1:8091' in config, 'Keep the existing Metro API origin'
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable', timeout=600) as response:
        entry = hashlib.file_digest(response, 'sha256').hexdigest()
    qa.source_files = capture(qa, entry)
    qa.started_epoch = int(qa.command('shell', 'date', '+%s').strip())
    qa.launch()
    screen = qa.wait_any(['Định vị GPS', 'Đăng nhập'], timeout=150)
    if qa.matches(screen, 'Đăng nhập'): login('qa')
    account_empty(); qa.screenshot('01-original-qa-no-pending-work')
    press('Đăng xuất'); qa.wait('Đăng nhập')
    qa.command('reverse', 'tcp:8091', f'tcp:{args.fixture_port}'); switched = True
    qa.launch(); login('qa'); home(); qa.screenshot('02-demo-overview')
    qa.passed('Original QA work/ledger confirmed empty before logout and explicit switch to an isolated durable demo dataset; existing Metro origin unchanged')

    qa.tap('Lập hợp đồng'); qa.wait('Bước 1: Hợp đồng & pháp lý')
    edit('Số hợp đồng giấy', '96103')
    press('Bước 2: Khách hàng'); press('Chọn hồ sơ khách')
    qa.tap('Chọn khách Khách hợp đồng QA, QA-001'); qa.tap('Dùng hồ sơ đã chọn')
    press('Bước 3: Phương tiện'); qa.screenshot('03-contract-vehicles')
    press('Bước 4: Chi phí'); qa.screenshot('04-contract-costs')
    press('Bước 5: Ký kết & ghi chú'); edit('Ghi chú bản nháp', 'DemoQA0311')
    press('Lưu nháp'); qa.wait('Ảnh và hồ sơ nghiệp vụ', timeout=100)
    assert stats()['draftCreates'] == 1
    qa.screenshot('05-saved-contract')
    press('Tiếp tục soạn hợp đồng'); qa.wait('Bước 1: Hợp đồng & pháp lý')
    press('Bước 5: Ký kết & ghi chú'); reveal('Ghi chú bản nháp')
    assert any(node.get('text') == 'DemoQA0311' for node in qa.matches(qa.tree(), 'Ghi chú bản nháp'))
    qa.back(); qa.wait_any(['Ảnh và hồ sơ nghiệp vụ', 'Rời bản nháp?'], timeout=30)
    home(); qa.tap('Định vị GPS'); qa.wait('Tải lại GPS', timeout=60); qa.screenshot('06-gps')
    qa.passed('Five contract sections save one QA draft and reopen the original note; GPS workspace opens from overview (no camera/provider acceptance)')

    home(); press('Mở Đến hạn đóng tiền'); qa.wait('Nhóm hợp đồng'); qa.wait('Không có kết quả')
    qa.screenshot('07-empty-due-workspace'); home(); press('Mở Nhân sự'); qa.wait('QA Đại diện'); qa.tap('Xem QA Đại diện'); qa.wait('Hồ sơ nhân sự'); qa.screenshot('08-staff'); qa.back()
    home(); press('Mở Cơ sở'); qa.wait('Cơ sở QA'); qa.tap('Xem Cơ sở QA'); qa.wait('Thông tin cơ sở'); qa.screenshot('09-store'); qa.back()
    qa.passed('Due workspace returns an honest empty installment list; HR and store directories open real typed QA profiles')

    home(); press('Mở Lịch trực'); qa.wait('Tạo ca trực'); qa.tap('Tạo ca trực')
    qa.wait('Nhân sự trực'); qa.tap('Nhân sự trực'); qa.tap('QA Đại diện · NS-QA-501 · Cơ sở QA')
    press('Rà soát và lưu ca trực'); qa.wait('Lưu ca trực?'); qa.tap('Xác nhận')
    qa.wait('Đã ghi nhận ca trực #6001', timeout=60); qa.screenshot('10-duty-create-confirmation')
    qa.tap('Đã kiểm tra xác nhận ca trực'); qa.wait('Sửa ca #6001'); qa.tap('Sửa ca #6001')
    edit('Ghi chú ca trực', 'NoteQA0311'); press('Rà soát và lưu ca trực'); qa.tap('Xác nhận')
    qa.wait('Đã ghi nhận ca trực #6001'); qa.tap('Đã kiểm tra xác nhận ca trực'); qa.wait('NoteQA0311')
    press('Xóa ca #6001'); qa.wait('Xóa ca trực?'); qa.tap('Xác nhận xóa ca'); qa.wait('Đã ghi nhận ca trực #6001')
    qa.screenshot('11-duty-soft-delete'); qa.tap('Đã kiểm tra xác nhận ca trực'); qa.wait('Chưa có ca trực')
    assert len(stats()['dutyRequests']) == 3 and stats()['dutySchedules'][0]['deleted'] is True
    qa.passed('Duty create/update/soft-delete keep one schedule ID and three exact request receipts; each is acknowledged through its confirmation screen')
    account_empty(); home(); qa.screenshot('12-demo-ready-overview')
    assert source_snapshot() == qa.source_files
    for name, digest in preserved.items(): assert hashlib.sha256(Path(name).read_bytes()).hexdigest() == digest
    after = json.loads(original_watch.read_text(encoding='utf-8'))['state']
    assert all(watch_before.get(key) == after.get(key) for key in set(watch_before) | set(after) if key not in ('sessions', 'sessionSeq'))
    diagnostics = collect(qa, module.PACKAGE)
    assert diagnostics['newAppCrashes'] == diagnostics['newAppAnrs'] == 0 and not diagnostics['errors']
    result = {'status': 'passed', 'passed': len(qa.checks), 'checks': qa.checks, 'focusedSmokeOnly': True, 'fixtureOnly': True,
              'sourceFilesMatch': len(qa.source_files), 'pendingLedgerEmpty': True, 'openWorkEmpty': True, 'hostApiPort': args.fixture_port,
              'previousCheckpointsPreserved': len(preserved), 'oldWatchChangedKeys': ['sessions', 'sessionSeq'], 'diagnostics': diagnostics,
              'completedAt': datetime.now(timezone.utc).isoformat()}
except Exception as error:
    result = {'status': 'failed', 'passed': len(qa.checks), 'checks': qa.checks, 'error': str(error), 'fixtureOnly': True, 'switched': switched, 'hostApiPort': args.fixture_port if switched else 8101, 'completedAt': datetime.now(timezone.utc).isoformat()}
    try: qa.screenshot('failure')
    except Exception: pass
    raise
finally:
    # A partial run can own pending writes/work. Never silently switch it away.
    result['reverseMappingsKept'] = routes()
    (qa.output/'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
