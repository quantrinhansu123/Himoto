"""Offline guard checks: no ADB command, real account or device is touched."""
import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('nativeqa',Path(__file__).with_name('check-mobile-native.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
output=Path('.backups/mobile-native-target-check')
for serial,physical in [('usb-test-device',False),('emulator-5554',True),('bad;command',True),('127.0.0.1:5555',True)]:
    try:
        module.NativeQA(Path('unused-adb'),serial,output,physical=physical)
        raise AssertionError('An implicit physical/network/shell target must fail closed')
    except ValueError:
        pass
for options in ({'bills':True},{'renewals':True}):
    try:
        module.NativeQA(Path('unused-adb'),'A123456789',output,physical=True,**options)
        raise AssertionError('An unaudited personal-gallery selector must not run on a phone')
    except ValueError:
        pass
emulator=module.NativeQA(Path('unused-adb'),'emulator-5554',output)
physical=module.NativeQA(Path('unused-adb'),'A123456789',output,physical=True)
assert emulator.api_origin=='http://10.0.2.2:8091' and '10.0.2.2' in emulator.launch_url
assert physical.api_origin=='http://127.0.0.1:8091' and physical.device_host=='127.0.0.1' and '10.0.2.2' not in physical.launch_url
assert '127.0.0.1' in physical.launch_url and physical.physical is True
calls=[]
def personal_window(*args,**_kwargs):
    calls.append(args)
    assert args==('shell','dumpsys','window','windows'),'Never capture a personal app screen'
    return 'mCurrentFocus=Window{123 u0 unrelated.private.app/PrivateActivity}'
physical.command=personal_window
try:
    physical.screenshot('must-not-exist')
    raise AssertionError('Foreign physical screen must not be saved')
except RuntimeError:
    pass
assert len(calls)==1
print('PASS: 3 native target guard groups (explicit USB opt-in, isolated origins and refusal to capture unrelated personal apps)')
