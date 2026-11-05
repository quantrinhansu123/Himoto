"""Samsung authenticated video playback and picker cancellation; zero submits."""
import argparse
import ast
import hashlib
import importlib.util
import json
import re
import time
import urllib.request
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
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
class VideoQA(module.NativeQA):
    def tree(self):
        # Android 9 player controls can briefly prevent accessibility idle.
        # Retry only this read; never reuse an XML file or repeat a UI action.
        for attempt in range(2):
            try:
                return super().tree()
            except RuntimeError as error:
                if attempt or 'did not produce a fresh hierarchy' not in str(error):
                    raise
                time.sleep(3)


qa = VideoQA(Path('E:/Android/Sdk/platform-tools/adb.exe'), args.serial, args.output, physical=True)


def helpers(file, names):
    tree = ast.parse(Path(file).read_text(encoding='utf-8'))
    nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
    assert len(nodes) == len(names)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), file, 'exec'), globals())


helpers('scripts/check-mobile-gps-native.py', {'reveal', 'press', 'tabs', 'routes'})
helpers('scripts/check-mobile-managed-accounts-native.py', {'login', 'account_empty', 'verify_preserved_business'})
helpers('scripts/check-mobile-print-import-native.py', {'wait_package', 'open_record'})
state_path = Path('.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json')
before = json.loads(state_path.read_text(encoding='utf-8'))
(qa.output / 'before-state.json').write_text(json.dumps(before, ensure_ascii=False), encoding='utf-8')
preserved = json.loads(Path('.backups/mobile-cashbook-delete-native-20261103-run1/preserved-checkpoints.json').read_text(encoding='utf-8'))
try:
    assert routes() == {'tcp:8081': 'tcp:8081', 'tcp:8091': 'tcp:8131'}
    assert not re.search(r'\bshowing=true\b', qa.command('shell', 'dumpsys', 'window', 'policy'))
    print('Prewarm video source; no native upload or write.', flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0', timeout=180) as response:
        assert 'http://127.0.0.1:8091' in response.read().decode()
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable', timeout=240) as response:
        entry = hashlib.file_digest(response, 'sha256').hexdigest()
    qa.source_files = capture(qa, entry)
    assert qa.command('shell', 'sha256sum', qa.command('shell', 'pm', 'path', module.PACKAGE).strip().removeprefix('package:')).split()[0] == '47d3071c118ffba2abd66226d1a9f5f73455f363b46bdd500096d06b29aee6bf'
    qa.started_epoch = int(qa.command('shell', 'date', '+%s').strip())
    qa.launch()
    root = qa.wait_any(['Tài khoản', 'Đăng nhập'], timeout=180)
    if qa.matches(root, 'Đăng nhập'):
        login('qa')
    open_record()
    press('Ảnh và hồ sơ nghiệp vụ')
    press('Ảnh lập hợp đồng / giao xe · #9301')
    press('Mở mục Video tình trạng xe 1')
    qa.wait('Phát video để kiểm tra', timeout=90)
    reveal('Phát video để kiểm tra')
    press('Phát video để kiểm tra')
    qa.wait('Phát lại video', timeout=45)
    qa.screenshot('01-authenticated-native-video-player')
    press('Chọn video')
    wait_package(r'(?:com\.android\.providers\.media\.module|com\.google\.android\.providers\.media\.module|com\.google\.android\.gms|com\.sec\.android\.app\.myfiles|com\.android\.documentsui|com\.samsung\.android\.providers\.media|com\.sec\.android\.gallery3d)/', 60)
    qa.screenshot('02-native-video-picker-before-cancel')
    qa.back()
    wait_package(re.escape(module.PACKAGE) + '/', 45)
    qa.wait('Chọn video')
    reveal('Rà soát và thay video')
    qa.screenshot('03-video-picker-cancel-keeps-current-file')
    assert not qa.matches(qa.tree(), 'Xác nhận lưu video')
    qa.back()
    tabs()
    account_empty()
    tabs()
    qa.tap('Tổng quan', bottom=True)
    reveal('Lập hợp đồng', True)
    qa.screenshot('04-qa7-empty-work-ledger-restored')
    after = json.loads(state_path.read_text(encoding='utf-8'))
    changed, nested = verify_preserved_business(before['state'], after['state'])
    for filename, sha in preserved.items():
        assert hashlib.sha256(Path(filename).read_bytes()).hexdigest() == sha
    assert not after['state']['accounts_workspace']['admin_tokens']
    assert source_snapshot() == qa.source_files
    diagnostics = collect(qa, module.PACKAGE)
    assert not diagnostics['errors'] and diagnostics['newAppCrashes'] == diagnostics['newAppAnrs'] == diagnostics['newSystemUiAnrs'] == 0, diagnostics
    result = {'ok': True, 'screenshots': 4, 'nativeVideo': 'authenticated playback, native picker opened then cancelled', 'nativeUploadsOrSubmissions': 0, 'sourceFiles': len(qa.source_files), 'preservedCheckpoints': len(preserved), 'generation': after['generation'], 'changedAllowedAuthFields': changed, 'nestedPreservation': nested, 'diagnostics': diagnostics, 'completedAt': datetime.now(timezone.utc).isoformat()}
    (qa.output / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'ok': True, 'screenshots': 4}), flush=True)
except Exception:
    (qa.output / 'failure-source-snapshot.json').write_text(json.dumps(source_snapshot(), indent=2), encoding='utf-8')
    try:
        qa.screenshot('failure')
    except Exception:
        pass
    raise
