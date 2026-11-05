"""Reproduce signed production cold starts; keep prior ANR evidence intact."""
import argparse
import hashlib
import importlib.util
import json
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from lib.mobile_native_diagnostics import collect

parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);parser.add_argument('--serial',required=True);parser.add_argument('--release-apk',type=Path,required=True);args=parser.parse_args();assert not args.output.exists()
spec=importlib.util.spec_from_file_location('nativeqa',Path('scripts/check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
assert args.serial=='282a05859f3f7ece','Use the authorized Samsung; no emulator is started'
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
qa.started_epoch=int(qa.command('shell','date','+%s').strip());runs=[]
try:
    from lib.mobile_release_evidence import verify_artifact,verify_installed
    proof=verify_artifact(args.release_apk);verify_installed(qa,proof)
    for index in range(5):
        qa.command('shell','am','force-stop',module.PACKAGE);start=time.monotonic()
        qa.command('shell','am','start','-W','-n',module.PACKAGE+'/.MainActivity')
        until=time.monotonic()+60
        while time.monotonic()<until:
            tree=qa.tree()
            if qa.matches(tree,'Đăng nhập'):break
        else:raise AssertionError('Login screen not ready')
        elapsed=round(time.monotonic()-start,3)
        assert not qa.matches(tree,'BẢN PHÁT TRIỂN · CHƯA XÁC NHẬN DỮ LIỆU THẬT')
        focus=qa.command('shell','dumpsys','window','windows')
        assert'Application Not Responding: vn.himoto.staff'not in focus
        runs.append(dict(index=index+1,loginReady=True,observedSeconds=elapsed))
        qa.screenshot('cold-start-'+str(index+1))
        print(json.dumps(runs[-1]),flush=True)
    diagnostics=collect(qa,module.PACKAGE)
    assert not diagnostics['errors']and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
    result=dict(ok=True,coldStarts=runs,signedRelease=True,serial=args.serial,apkSha256=proof['sha256'],credentialsEntered=False,priorAnrResolved=False,diagnostics=diagnostics,completedAt=datetime.now(timezone.utc).isoformat())
    (qa.output/'results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
except Exception as error:
    diagnostics=collect(qa,module.PACKAGE)
    (qa.output/'failure.json').write_text(json.dumps(dict(ok=False,coldStarts=runs,error=type(error).__name__,diagnostics=diagnostics),indent=2),encoding='utf-8');raise
