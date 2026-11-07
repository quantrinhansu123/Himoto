"""Read-only release navigation on the user-authorized Samsung/admin session."""
import argparse
import importlib.util
import json
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--apk', type=Path, required=True)
parser.add_argument('--serial', default='282a05859f3f7ece')
args = parser.parse_args()
assert args.serial == '282a05859f3f7ece'
spec = importlib.util.spec_from_file_location('nativeqa', Path(__file__).with_name('check-mobile-native.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
qa = module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'), args.serial, args.output, physical=True)
from lib.mobile_release_evidence import verify_artifact, verify_installed
proof = verify_artifact(args.apk)
verify_installed(qa, proof)
rows = []
routes = ['reports', 'fleet-inventory', 'gps', 'dashboard', 'staff-sales', 'cashbook', 'shift-reports',
          'duty-roster', 'attendance', 'guide', 'directory/staff', 'directory/stores', 'staff-organization',
          'battery-contracts', 'notifications', 'operations']
failures = ('Không kết nối được', 'Kết nối dữ liệu đang gián đoạn', 'Chưa tải được', 'Chưa mở được',
            'Máy chủ phản hồi quá lâu', 'Chưa đọc được')
try:
    for route in routes:
        started = time.monotonic()
        qa.command('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'himoto:///' + route, '-p', module.PACKAGE)
        ready = False
        error = False
        while time.monotonic() - started < 75:
            tree = qa.tree()
            labels = [n.get('text', '') or n.get('content-desc', '') for n in tree.iter('node')]
            if any(label == 'Đăng nhập' for label in labels):
                raise RuntimeError('Session was not preserved; no credentials will be entered by this script')
            error = any(label.startswith(failures) for label in labels)
            if error:
                break
            loading = any(n.get('class') == 'android.widget.ProgressBar' for n in tree.iter('node'))
            if not loading and sum(bool(label) for label in labels) >= 5:
                ready = True
                break
        qa.screenshot(route.replace('/', '-'))
        row = dict(route=route, ready=ready, error=error, observedMs=round((time.monotonic()-started)*1000))
        rows.append(row)
        print(json.dumps(row), flush=True)
        args.output.joinpath('results.json').write_text(json.dumps(dict(ok=all(r['ready'] and not r['error'] for r in rows),
            screens=rows, businessActionsSubmitted=0, credentialsEntered=False, apkSha256=proof['sha256'],
            timingLimit='Includes UI Automator polling and screenshot capture; not a controlled app/web timing comparison'), indent=2), encoding='utf-8')
    qa.command('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'himoto:///', '-p', module.PACKAGE)
finally:
    qa.screenshot('final')
if not all(r['ready'] and not r['error'] for r in rows):
    raise RuntimeError('Some production reads failed; inspect the retained screenshots and route results')
