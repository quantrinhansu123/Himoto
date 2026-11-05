"""Samsung print/PDF and Excel previews, same durable QA, zero submissions."""
import argparse
import ast
import hashlib
import importlib.util
import json
import re
import time
import urllib.request
from copy import deepcopy
from pathlib import Path
from datetime import datetime, timezone
from lib.mobile_native_provenance import capture, source_snapshot
from lib.mobile_native_diagnostics import collect

parser = argparse.ArgumentParser()
parser.add_argument('--serial', required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
assert not args.output.exists()
spec = importlib.util.spec_from_file_location('nativeqa', Path('scripts/check-mobile-native.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
qa = module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'), args.serial, args.output, physical=True)


def helpers(file, names):
    tree = ast.parse(Path(file).read_text(encoding='utf-8'))
    nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
    assert len(nodes) == len(names)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), file, 'exec'), globals())


helpers('scripts/check-mobile-gps-native.py', {'reveal', 'press', 'tabs', 'routes'})
helpers('scripts/check-mobile-managed-accounts-native.py', {'login', 'account_empty', 'verify_preserved_business'})
state_path = Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json')
before = json.loads(state_path.read_text(encoding='utf-8'))
assert before['generation'] >= 78 and 'print_import_workspace' in before['state']
(qa.output / 'before-state.json').write_text(json.dumps(before, ensure_ascii=False), encoding='utf-8')
preserved = json.loads(Path('.backups/mobile-cashbook-delete-native-20261103-run1/preserved-checkpoints.json').read_text(encoding='utf-8'))


def wait_package(pattern, timeout=60):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = qa.command('shell', 'dumpsys', 'window', 'windows')
        if re.search(r'mCurrentFocus=Window\{[^\n}]*\s' + pattern, value):
            return
        time.sleep(1)
    raise AssertionError('Expected system module did not open: ' + pattern)


def open_record():
    account_empty()
    tabs()
    qa.tap('Hợp đồng', bottom=True)
    qa.wait('Tìm hợp đồng', timeout=90)
    if qa.matches(qa.tree(), 'Xóa tìm kiếm'):
        qa.tap('Xóa tìm kiếm')
    qa.text('Tìm hợp đồng', '9301', replace=False)
    qa.hide_keyboard()
    press('Xem EDIT9301, Khách sửa ngày QA')


try:
    assert routes() == {'tcp:8081': 'tcp:8081', 'tcp:8091': 'tcp:8131'}
    assert not re.search(r'\bshowing=true\b', qa.command('shell', 'dumpsys', 'window', 'policy'))
    print('Prewarm native print/PDF and Excel sources; no business submission.', flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0', timeout=180) as response:
        assert 'http://127.0.0.1:8091' in response.read().decode()
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable', timeout=600) as response:
        entry = hashlib.file_digest(response, 'sha256').hexdigest()
    qa.source_files = capture(qa, entry)
    assert qa.command('shell', 'sha256sum', qa.command('shell', 'pm', 'path', module.PACKAGE).strip().removeprefix('package:')).split()[0] == '47d3071c118ffba2abd66226d1a9f5f73455f363b46bdd500096d06b29aee6bf'
    qa.started_epoch = int(qa.command('shell', 'date', '+%s').strip())
    qa.launch()
    root = qa.wait_any(['Tài khoản', 'Đăng nhập'], timeout=180)
    if qa.matches(root, 'Đăng nhập'):
        login('qa')
    open_record()
    press('Xem giấy / in hợp đồng')
    qa.wait('Mở hộp thoại in', timeout=90)
    reveal('QR thanh toán trên giấy')
    qa.screenshot('01-native-web-paper-preview')
    press('Chia sẻ / lưu PDF hợp đồng')
    wait_package(r'(?:android|com\.android\.intentresolver)/', 90)
    qa.back()
    qa.wait('Mở hộp thoại in')
    reveal('PDF vừa tạo: 1 trang.')
    qa.screenshot('02-native-pdf-one-page-share-cancelled')
    press('Mở hộp thoại in')
    wait_package(r'com\.android\.printspooler/', 90)
    qa.back()
    wait_package(re.escape(module.PACKAGE) + '/', 45)
    qa.wait('Mở hộp thoại in')
    qa.screenshot('03-native-print-dialog-cancelled')
    qa.back()
    qa.wait('Chi tiết hợp đồng')
    press('QR chuyển khoản theo hợp đồng')
    qa.wait('Tạo / cập nhật mã QR')
    reveal('QA chưa chọn tài khoản nhận; portfolio chỉ xem công nợ.')
    qa.screenshot('04-qr-current-ledger-no-bank-fallback')
    qa.back()
    qa.wait('Chi tiết hợp đồng')
    tabs()
    qa.tap('Đội xe', bottom=True)
    press('Nhập và đồng bộ Excel xe')
    qa.wait('Chọn file Excel xe', timeout=60)
    qa.screenshot('05-native-excel-options-and-guards')
    press('Chọn file Excel xe')
    wait_package(r'(?:com\.android\.documentsui|com\.sec\.android\.app\.myfiles)/', 45)
    # Picker is intentionally cancelled; do not read unrelated user documents.
    qa.back()
    wait_package(re.escape(module.PACKAGE) + '/', 45)
    qa.wait('Chọn file Excel xe')
    press('Kiểm tra xóa danh sách xe có sao lưu')
    qa.wait('Kiểm tra lại xe và liên kết', timeout=60)
    qa.screenshot('06-native-reset-blocked-by-related-data')
    assert not qa.matches(qa.tree(), 'Nhập XÓA HẾT XE để xác nhận')
    qa.back()
    qa.wait('Chọn file Excel xe')
    qa.back()
    tabs()
    account_empty()
    tabs()
    qa.tap('Tổng quan', bottom=True)
    reveal('Lập hợp đồng', True)
    qa.screenshot('07-qa7-restored-empty-work-ledger')
    after = json.loads(state_path.read_text(encoding='utf-8'))
    changed, nested = verify_preserved_business(before['state'], after['state'])
    for filename, sha in preserved.items():
        assert hashlib.sha256(Path(filename).read_bytes()).hexdigest() == sha
    assert not after['state']['accounts_workspace']['admin_tokens']
    assert source_snapshot() == qa.source_files
    diagnostics = collect(qa, module.PACKAGE)
    assert not diagnostics['errors'] and diagnostics['newAppCrashes'] == diagnostics['newAppAnrs'] == diagnostics['newSystemUiAnrs'] == 0, diagnostics
    result = {'ok': True, 'groups': 4, 'screenshots': 7, 'nativePrintPdfShare': 'one-page PDF generated, system share and print opened then cancelled', 'nativeExcel': 'options, picker cancelled, reset related-data blocker; no file upload or write', 'financialSubmissions': 0, 'vehicleSubmissionsOrDeletions': 0, 'installedApk': '47d3071c118ffba2abd66226d1a9f5f73455f363b46bdd500096d06b29aee6bf', 'sourceFiles': len(qa.source_files), 'preservedCheckpoints': len(preserved), 'generation': after['generation'], 'changedAllowedAuthFields': changed, 'nestedPreservation': nested, 'diagnostics': diagnostics, 'completedAt': datetime.now(timezone.utc).isoformat()}
    (qa.output / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'ok': True, 'groups': 4, 'screenshots': 7}), flush=True)
except Exception:
    (qa.output / 'failure-source-snapshot.json').write_text(json.dumps(source_snapshot(), indent=2), encoding='utf-8')
    try:
        qa.screenshot('failure')
    except Exception:
        pass
    raise
