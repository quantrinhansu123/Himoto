"""Continue physical QA after the operator selects the uniquely named QA image.

No relaunch, fixture reset, gallery selection or application data clearing.
Earlier blocked-review checks remain separate evidence, never silently credited.
"""
import argparse,hashlib,importlib.util,json,urllib.request
from datetime import datetime,timezone
from pathlib import Path
from lib.mobile_collection_native import run_collections
from lib.mobile_native_provenance import capture

parser=argparse.ArgumentParser()
parser.add_argument('--serial',required=True)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--cancelled-form',action='store_true',help='Continue from the retained cancelled form after exactly two acknowledged QA receipts; never resets the fixture or credits earlier cases')
args=parser.parse_args()
spec=importlib.util.spec_from_file_location('nativeqa',Path(__file__).with_name('check-mobile-native.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,writes_only=True,collections=True,physical=True)
try:
    qa.verify_device_network()
    with urllib.request.urlopen('http://127.0.0.1:8091/__fixture_collections',timeout=5) as response: state=json.load(response)
    assert state['fixtureOnly'] is True and state['writes']==(2 if args.cancelled_form else 0),'The saved phase does not match the QA receipt count'
    args.output.joinpath('starting-fixture.json').write_text(json.dumps(state,indent=2)+'\n',encoding='utf-8')
    url=('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable')
    with urllib.request.urlopen(url,timeout=180) as response:
        digest=hashlib.file_digest(response,'sha256').hexdigest()
    qa.source_files=capture(qa,digest)
    qa.started_epoch=int(qa.command('shell','date','+%s').strip())
    if not args.cancelled_form:qa.wait('Xem lớn Ảnh bill đang chọn')
    run_collections(qa,selected_bill=not args.cancelled_form,cancelled_form=args.cancelled_form)
    qa.finish()
except Exception as failure:
    result={'status':'failed','completedGroups':len(qa.checks),'checks':qa.checks,'error':str(failure),
        'platform':'Android physical device','mode':'cancelled-form-continuation' if args.cancelled_form else 'selected-bill-continuation','fixtureOnly':True,'operationalWrites':0,
        'physicalDeviceTested':True,'physicalDeviceCertified':False,'startedEpoch':qa.started_epoch,'completedAt':datetime.now(timezone.utc).isoformat(),
        'diagnostics':module.collect_diagnostics(qa,module.PACKAGE)}
    args.output.joinpath('results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    try:qa.screenshot('failure')
    except RuntimeError:pass
    raise
