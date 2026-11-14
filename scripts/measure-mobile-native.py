"""Read-only Samsung navigation/scroll sample. UI Automator timings include its polling cost."""
import argparse
import importlib.util
import json
import re
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--serial', default='282a05859f3f7ece')
parser.add_argument('--cycles', type=int, default=2)
args = parser.parse_args()
spec = importlib.util.spec_from_file_location('nativeqa', Path(__file__).with_name('check-mobile-native.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
qa = module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'), args.serial, args.output, physical=True)
results = []
try:
    for cycle in range(args.cycles):
        for label in ['Đội xe', 'Khách hàng', 'Hợp đồng']:
            qa.command('shell', 'dumpsys', 'gfxinfo', 'vn.himoto.staff', 'reset')
            started = time.monotonic()
            qa.tap(label, bottom=True)
            ready = False
            while time.monotonic() - started < 45:
                tree = qa.tree()
                if any(n.get('content-desc', '').startswith('Xem ') for n in tree.iter('node')):
                    ready = True
                    break
            elapsed = round((time.monotonic() - started) * 1000)
            if not ready:
                qa.screenshot(f'not-ready-{cycle}-{len(results)}')
                raise RuntimeError('No visible list card; refusing to continue on an unexpected screen')
            bounds = list(map(int, re.findall(r'\d+', next(tree.iter('node')).get('bounds'))))
            width, height = bounds[2:]
            for direction in range(6):
                start, end = (.75, .4) if direction % 2 == 0 else (.4, .75)
                qa.command('shell', 'input', 'swipe', str(width//2), str(int(height*start)), str(width//2), str(int(height*end)), '300')
            stats = qa.command('shell', 'dumpsys', 'gfxinfo', 'vn.himoto.staff')
            args.output.joinpath(f'gfx-{cycle}-{len(results)}.txt').write_text(stats, encoding='utf-8')
            metrics = {}
            for name, pattern in [('frames', r'Total frames rendered:\s*(\d+)'), ('jankPercent', r'Janky frames:\s*\d+\s*\(([\d.]+)%\)'), ('p95FrameMs', r'95th percentile:\s*(\d+)ms')]:
                matches = re.findall(pattern, stats)
                if matches: metrics[name] = float(matches[0])
            row = dict(screen=label, cycle=cycle+1, observedReadyMs=elapsed, **metrics)
            results.append(row)
            print(json.dumps(row, ensure_ascii=False), flush=True)
            args.output.joinpath('results.json').write_text(json.dumps(dict(results=results, operationalWrites=0,
                timingLimit='observedReadyMs includes UI Automator capture/polling overhead; not TTID or a controlled app/web benchmark'), ensure_ascii=False, indent=2), encoding='utf-8')
    qa.tap('Tổng quan', bottom=True)
finally:
    qa.screenshot('final')
