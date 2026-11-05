"""Focused physical QA from an existing uncertain synthetic finance bill.

No fixture reset, second bill upload or credit for earlier cases. Reads the
retained pending-bill guard, recovers through process death/Account, then checks
an empty pending ledger, session restoration and logout.
"""
import argparse,hashlib,importlib.util,json,re,urllib.request
from datetime import datetime,timezone
from pathlib import Path
from lib.mobile_native_provenance import capture

parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
spec=importlib.util.spec_from_file_location('nativeqa',Path(__file__).with_name('check-mobile-native.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True,collections=True,writes_only=True)
def fixture(path):
    with urllib.request.urlopen('http://127.0.0.1:8091'+path,timeout=5) as response: result=json.load(response)
    assert result['fixtureOnly'] is True;return result
try:
    qa.verify_device_network()
    money=fixture('/__fixture_state');bills=fixture('/__fixture_bills');collections=fixture('/__fixture_collections')
    assert money['financeWrites']==2 and bills['writes']==2 and collections['writes']==2
    assert [(r['id'],r['version'],r['amount']) for r in collections['receipts']]==[(4003,2,10000),(4003,2,5000)]
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=180) as response:
        digest=hashlib.file_digest(response,'sha256').hexdigest()
    qa.source_files=capture(qa,digest);qa.started_epoch=int(qa.command('shell','date','+%s').strip())
    warning='Có lần lưu bill chưa được xác nhận. Mở bước bill và kiểm tra kết quả trước khi ghi khoản thu.'
    for _ in range(8):
        tree=qa.tree()
        if qa.matches(tree,warning):break
        _,_,width,height=map(int,re.findall(r'\d+',next(tree.iter('node')).get('bounds')))
        qa.command('shell','input','swipe',str(width//2),str(int(height*.35)),str(width//2),str(int(height*.72)),'350')
    else:raise AssertionError('The retained collection form did not explain its unresolved bill')
    buttons=[node for node in qa.matches(tree,'Rà soát khoản thu theo kỳ') if node.get('class')=='android.widget.Button']
    assert buttons and all(node.get('enabled')=='false' for node in buttons),'Pending bill must block collection review'
    qa.screenshot('46-pending-bill-blocks-collection')
    qa.passed('An uncertain historical bill remains in the device ledger, explains the next action and disables collection review without another money write')
    qa.launch();qa.wait('Mở Đội xe',timeout=180);qa.tap('Tài khoản',bottom=True)
    qa.scroll_to('Đối chiếu lưu bill khoản thu theo kỳ #4003');qa.tap('Đối chiếu lưu bill khoản thu theo kỳ #4003');qa.tap('Đối chiếu với máy chủ')
    qa.scroll_to('Mở kết quả lưu bill khoản thu theo kỳ #4003');qa.tap('Mở kết quả lưu bill khoản thu theo kỳ #4003')
    qa.wait('Bill đã được lưu',timeout=60);qa.wait('Phiên bản gia hạn #2');qa.screenshot('47-exact-bill-recovered')
    qa.tap('Xác nhận đã kiểm tra bill');qa.wait('Ghi nhận thu/chi')
    assert fixture('/__fixture_state')['financeWrites']==2 and fixture('/__fixture_bills')['writes']==2
    for _ in range(6):
        if qa.matches(qa.tree(),'Tổng quan'):break
        qa.back()
    else:raise AssertionError('Could not return to Account after bill acknowledgement')
    qa.tap('Tài khoản',bottom=True);qa.scroll_to('Tải lại danh sách đối chiếu');qa.tap('Tải lại danh sách đối chiếu')
    qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.screenshot('48-bill-ledger-acknowledged');qa.tap('Tổng quan',bottom=True)
    qa.passed('After process death, Account returns the exact historical bill/version through the finance receipt route; acknowledgement clears the original UUID without recording income or uploading again')
    qa.finish()
except Exception as failure:
    result={'status':'failed','completedGroups':len(qa.checks),'checks':qa.checks,'error':str(failure),'mode':'pending-bill-continuation','platform':'Android physical device','fixtureOnly':True,'operationalWrites':0,
        'physicalDeviceTested':True,'physicalDeviceCertified':False,'startedEpoch':qa.started_epoch,'completedAt':datetime.now(timezone.utc).isoformat(),'diagnostics':module.collect_diagnostics(qa,module.PACKAGE)}
    args.output.joinpath('results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    try:qa.screenshot('failure')
    except RuntimeError:pass
    raise
