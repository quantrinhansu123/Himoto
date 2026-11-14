"""Measure the focused shift-report field above the real emulator IME; fixture API only."""
import argparse
import json
import re
import subprocess
import time
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path


def run(adb, serial, output, current_form=False):
    assert serial.startswith('emulator-') and not output.exists()
    def command(*args):
        return subprocess.check_output([str(adb), '-s', serial, *args], timeout=30)
    assert command('shell', 'getprop', 'ro.kernel.qemu').strip() == b'1'
    assert json.load(urllib.request.urlopen('http://127.0.0.1:8765/health'))['fixtureOnly']
    package = command('shell', 'dumpsys', 'package', 'vn.himoto.staff').decode('utf-8', errors='replace')
    assert 'DEBUGGABLE' in package, 'This test must never type fixture credentials into a production binary.'
    output.mkdir(parents=True)
    def tree():
        command('shell', 'uiautomator', 'dump', '/sdcard/himoto-parity-keyboard.xml')
        raw = command('exec-out', 'cat', '/sdcard/himoto-parity-keyboard.xml')
        return ET.fromstring(raw[raw.index(b'<?xml'):])
    def rect(node):
        return tuple(map(int, re.findall(r'\d+', node.get('bounds', ''))))
    def find(root, label):
        candidates = [node for node in root.iter('node') if label in [node.get('content-desc'), node.get('text')] and len(rect(node)) == 4 and rect(node)[3] > rect(node)[1]]
        candidates.sort(key=lambda node: (node.get('class') != 'android.widget.EditText', node.get('content-desc') != label))
        return candidates[0] if candidates else None
    def wait(label, scroll=False):
        for _ in range(25):
            root = tree(); node = find(root, label)
            if node is not None and (label != 'Nhân sự trực ca' or node.get('class') == 'android.widget.EditText' and rect(node)[3]-rect(node)[1] >= 80): return node
            if scroll: command('shell', 'input', 'swipe', '540', '1950', '540', '800', '350')
            time.sleep(.4)
        raise AssertionError('Missing UI: ' + label)
    def tap(label, scroll=False):
        node = wait(label, scroll); x1, y1, x2, y2 = rect(node)
        command('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2)); time.sleep(.6)
    def shot(name):
        (output / name).write_bytes(command('exec-out', 'screencap', '-p'))
    root = tree()
    if find(root, 'Continue') is not None:
        tap('Continue'); root = tree()
    if find(root, 'Close') is not None:
        tap('Close'); root = tree()
    for _ in range(0 if current_form else 40):
        if find(root, 'Mật khẩu') is not None or find(root, 'Mở danh mục quản lý') is not None: break
        time.sleep(.5); root = tree()
    if find(root, 'Tài khoản') is not None and find(root, 'Mật khẩu') is not None:
        tap('Tài khoản'); command('shell', 'input', 'keyevent', '123', *(['67'] * 80)); command('shell', 'input', 'text', 'qa')
        command('shell', 'input', 'keyevent', '111'); time.sleep(1)
        tap('Mật khẩu'); command('shell', 'input', 'keyevent', '123', *(['67'] * 80)); command('shell', 'input', 'text', 'fixture-password')
        command('shell', 'input', 'keyevent', '111'); tap('Đăng nhập')
    if not current_form:
        tap('Mở danh mục quản lý')
        tap('Báo cáo cuối ca', scroll=True)
        tap('+ Tạo báo cáo')
    else:
        command('shell', 'input', 'keyevent', '111'); time.sleep(1)
    before = rect(wait('Nhân sự trực ca', scroll=True))
    shot('before-keyboard.png')
    tap('Nhân sự trực ca')
    command('shell', 'input', 'keyevent', '123', *(['67'] * 80))
    command('shell', 'input', 'text', 'QA_keyboard_20261114')
    time.sleep(1)
    root = tree(); node = find(root, 'Nhân sự trực ca')
    assert node is not None
    field = rect(node)
    ime = [rect(item) for item in root.iter('node') if 'inputmethod' in item.get('package', '') and len(rect(item)) == 4 and rect(item)[1] > 0 and rect(item)[3]-rect(item)[1] > 30]
    if not ime:
        # UIAutomator may return only the app window on Android 15. Read the
        # actual visible IME inset, never infer it from a resized app viewport.
        insets = command('shell', 'dumpsys', 'window', 'displays').decode('utf8', errors='replace')
        ime = [tuple(map(int, match)) for match in re.findall(r'type=ime frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\][^\n]*visible=true', insets)]
        status = command('shell', 'dumpsys', 'input_method').decode('utf8', errors='replace')
        assert 'mInputShown=true' in status and 'mIsInputViewShown=true' in status
    assert ime, 'The IME must be open, not dismissed to make the screenshot pass.'
    keyboard_top = min(item[1] for item in ime)
    assert field[3] <= keyboard_top, (field, keyboard_top)
    assert field[3]-field[1] >= 80, 'A clipped field must not count as visible.'
    assert node.get('text') == 'QA_keyboard_20261114', node.attrib
    shot('field-above-keyboard.png')
    (output / 'with-keyboard.xml').write_bytes(ET.tostring(root, encoding='utf-8'))
    requests = json.load(urllib.request.urlopen('http://127.0.0.1:8765/requests'))
    assert not any(row['method'] not in ['GET', 'POST'] or row['method'] == 'POST' and row['path'] != '/session' for row in requests)
    result = dict(ok=True, fixtureOnly=True, emulator=serial, originalFieldBounds=before, focusedFieldBounds=field, keyboardTop=keyboard_top, keyboardOpen=True, textVisible=True, businessWrites=0, productionWrites=0, physicalPhoneAcceptance=False)
    (output / 'results.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--adb', type=Path, required=True); parser.add_argument('--serial', required=True); parser.add_argument('--output', type=Path, required=True); parser.add_argument('--current-form', action='store_true')
    args = parser.parse_args(); run(args.adb, args.serial, args.output.resolve(), args.current_form)
