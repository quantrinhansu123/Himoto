"""Warm a lookup, reopen the signed app offline, then restore original phone networks."""
import argparse
import hashlib
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
wifi = qa.command('shell', 'settings', 'get', 'global', 'wifi_on').strip()
data = qa.command('shell', 'settings', 'get', 'global', 'mobile_data').strip()
assert wifi in ('0', '1') and data in ('0', '1'), 'Unrecognized phone network state; nothing was changed'
assert wifi == '1' or data == '1', 'Warm the lookup online before the offline test'
result = dict(ok=False, previousWifi=wifi, previousMobileData=data, businessActionsSubmitted=0,
              credentialsEntered=False, uninstallOrClear=False, apkSha256=proof['sha256'])

def cards(timeout=55):
    deadline = time.monotonic()+timeout
    while time.monotonic() < deadline:
        tree = qa.tree()
        found = [n.get('content-desc', '') for n in tree.iter('node') if n.get('content-desc', '').startswith('Xem ')]
        if found:
            return found
        if qa.matches(tree, 'Đăng nhập'):
            raise RuntimeError('A preserved authenticated session is required')
    raise RuntimeError('No lookup card became visible')

try:
    qa.command('shell', 'am', 'start', '-W', '-n', module.PACKAGE+'/.MainActivity')
    qa.tap('Đội xe', bottom=True)
    before = cards()
    # Let the successful response and the serialized SQLite snapshot finish.
    time.sleep(4)
    qa.tap('Tổng quan', bottom=True)
    qa.command('shell', 'svc', 'wifi', 'disable')
    qa.command('shell', 'svc', 'data', 'disable')
    qa.command('shell', 'am', 'force-stop', module.PACKAGE)
    started = time.monotonic()
    qa.command('shell', 'am', 'start', '-W', '-n', module.PACKAGE+'/.MainActivity')
    qa.wait_any(['Đang ngoại tuyến', 'Đang xem dữ liệu đã lưu'], timeout=40)
    qa.tap('Đội xe', bottom=True)
    offline = cards(timeout=30)
    assert set(before).intersection(offline), 'The cached records do not match the warmed lookup'
    result.update(offlineColdStart=True, lookupVisible=True, matchingCardHash=hashlib.sha256(next(iter(set(before).intersection(offline))).encode()).hexdigest(),
                  observedOfflineReadyMs=round((time.monotonic()-started)*1000),
                  timingLimit='Includes launching, UI Automator polling and a tab press; not a display latency benchmark')
    qa.screenshot('offline-lookup')
    result['ok'] = True
finally:
    qa.command('shell', 'svc', 'data', 'enable' if data == '1' else 'disable')
    qa.command('shell', 'svc', 'wifi', 'enable' if wifi == '1' else 'disable')
    result['networksRestored'] = (qa.command('shell','settings','get','global','wifi_on').strip() == wifi and
                                  qa.command('shell','settings','get','global','mobile_data').strip() == data)
    args.output.joinpath('results.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
if not result['networksRestored']:
    raise RuntimeError('Phone network restoration needs review')
print(json.dumps({k:v for k,v in result.items() if k != 'matchingCardHash'}))
