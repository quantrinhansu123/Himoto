"""Samsung swap acceptance: isolated fixture; preserves prior QA and device data."""
import argparse
import hashlib
import importlib.util
import json
import re
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from lib.mobile_native_provenance import capture

parser=argparse.ArgumentParser()
parser.add_argument('--serial',required=True)
parser.add_argument('--fixture-port',type=int,default=8094)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--allow-missing-prior-fixture',action='store_true',help='Record an already-refused legacy fixture explicitly; never restart or claim it was preserved')
args=parser.parse_args()
if not 1024<=args.fixture_port<=65535 or args.fixture_port in (8081,8091,8093):
    raise ValueError('Use an isolated swap fixture port; preserve Metro and prior QA')
spec=importlib.util.spec_from_file_location('nativeqa',Path(__file__).with_name('check-mobile-native.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
origin=f'http://127.0.0.1:{args.fixture_port}'

def get(path,port=None):
    with urllib.request.urlopen((origin if port is None else f'http://127.0.0.1:{port}')+path,timeout=8) as response:result=json.load(response)
    assert result['fixtureOnly'] is True
    return result
def stats(late=False):return get('/__fixture_swaps'+('?late=1' if late else ''))
def preserved():
    returned=get('/__fixture_returns',8093)
    try:
        state,bills,collections=get('/__fixture_state',8091),get('/__fixture_bills',8091),get('/__fixture_collections',8091)
    except urllib.error.URLError as error:
        refused=isinstance(error.reason,ConnectionRefusedError) or getattr(error.reason,'winerror',None)==10061
        if not args.allow_missing_prior_fixture or not refused:raise
        return {'legacyFixtureAvailable':False,'legacyFixturePort':8091,'legacyFailure':'connection refused before native run','returns':returned}
    result={'legacyFixtureAvailable':True,'collections':collections['writes'],'billWrites':bills['writes'],'billReceipts':bills['receipts'],
            'tombstones':state['tombstones'],'resolutionCalls':state['resolutionCalls'],'returns':returned}
    assert [result[k] for k in ('collections','billWrites','billReceipts','tombstones','resolutionCalls')]==[2,2,2,1,3],'Legacy fixture state differs from last verified handoff; never reset it'
    return result
def mode(value):
    request=urllib.request.Request(origin+'/__fixture_swap_mode',data=json.dumps({'mode':value}).encode(),headers={'Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(request,timeout=8) as response:assert json.load(response)=={'fixtureOnly':True,'mode':value}
def enter(label,value):qa.text(label,value,replace=True);qa.hide_keyboard()
def reveal(label):
    try:qa.scroll_to(label,upward=True)
    except AssertionError:qa.scroll_to(label)
def to_tabs():
    for _ in range(5):
        if qa.matches(qa.tree(),'Tổng quan'):
            qa.tap('Tổng quan',bottom=True);return
        qa.back()
    raise AssertionError('Could not return to tabs after swap acknowledgement')
def open_editor(index,pending=False):
    qa.tap('Hợp đồng',bottom=True)
    if qa.matches(qa.tree(),'Xóa tìm kiếm'):qa.tap('Xóa tìm kiếm')
    qa.text('Tìm hợp đồng',f'HD-QA-{index}');qa.hide_keyboard()
    qa.tap(f'Xem HD-QA-{index}, Khách hợp đồng QA');qa.wait('Chi tiết hợp đồng')
    reveal('Đổi xe trong hợp đồng');qa.tap('Đổi xe trong hợp đồng')
    qa.wait('Đổi xe đang chờ đối chiếu' if pending else '1. Chọn xe đang thuê')
def choose(search='NEW-2',number=2):
    qa.tap('Chọn đổi xe QA-SWAP-OLD-1');qa.scroll_to('Tìm xe thay thế');qa.tap('Tìm xe thay thế');qa.wait('2. Chọn xe thay thế')
    enter('Biển số hoặc tên xe thay thế',search);qa.scroll_to('Tìm trong kho thay thế');qa.tap('Tìm trong kho thay thế')
    qa.scroll_to(f'Chọn xe thay thế QA-SWAP-NEW-{number}');qa.tap(f'Chọn xe thay thế QA-SWAP-NEW-{number}')
    qa.scroll_to('Rà soát đổi xe');qa.tap('Rà soát đổi xe');qa.wait('3. Rà soát đổi xe')
def commit():
    qa.scroll_to('Ghi đổi xe trong hợp đồng');qa.tap('Ghi đổi xe trong hợp đồng');qa.tap('Xác nhận đổi xe trong hợp đồng')
def acknowledge():
    qa.scroll_to('Xác nhận đã kiểm tra phiếu đổi xe');qa.tap('Xác nhận đã kiểm tra phiếu đổi xe');qa.wait('Chi tiết hợp đồng');to_tabs()

try:
    assert stats()['writes']==0 and not stats()['receipts'],'Use untouched isolated swap fixture; never reset prior evidence'
    baseline=preserved();args.output.joinpath('preserved-fixtures-before.json').write_text(json.dumps(baseline,indent=2),encoding='utf-8')
    print('Prewarming verified Metro configuration and swap source.',flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as response:config=response.read().decode('utf-8')
    assert re.search(r"apiOrigin[\s\S]{0,150}['\"]http://127\.0\.0\.1:8091['\"]",config) or re.search(r"['\"]EXPO_PUBLIC_API_URL['\"]:\s*\{[^}]{0,100}value:\s*['\"]http://127\.0\.0\.1:8091['\"]",config),'Metro must inline the loopback QA origin'
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
    qa.command('reverse','tcp:8081','tcp:8081');qa.command('reverse','tcp:8091',f'tcp:{args.fixture_port}')
    args.output.joinpath('usb-fixture-route.json').write_text(json.dumps({'phoneApiPort':8091,'hostFixturePort':args.fixture_port,'originalFixturePort':8091,'restored':False}),encoding='utf-8')
    qa.verify_device_network();qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip())
    qa.launch();tree=qa.wait_any(['Mở Đội xe','Đăng nhập'],timeout=180)
    if qa.matches(tree,'Đăng nhập'):
        qa.text('Tài khoản','qa');qa.command('shell','input','keyevent','66');qa.text('Mật khẩu','fixture-password');qa.hide_keyboard();qa.tap('Đăng nhập')
    qa.wait('Mở Đội xe',timeout=180);qa.tap('Tài khoản',bottom=True)
    qa.scroll_to('Tải lại danh sách đối chiếu');qa.tap('Tải lại danh sách đối chiếu');qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.')
    qa.tap('Tổng quan',bottom=True)
    qa.passed('Samsung opens the verified swap source with an empty ledger; return fixture is preserved and legacy 8091 availability is recorded without restart')
    open_editor(6101);choose()
    qa.scroll_to('Ghi đổi xe trong hợp đồng');qa.tap('Ghi đổi xe trong hợp đồng');qa.tap('Tiếp tục chỉnh sửa');qa.wait('3. Rà soát đổi xe')
    assert stats()['writes']==0;qa.screenshot('01-native-swap-review')
    commit();qa.wait('Đổi xe đã được ghi nhận',timeout=60)
    first=stats();assert first['writes']==1
    proof=first['receipts'][0];assert proof['from']['license']=='QA-SWAP-OLD-1' and proof['to']['license']=='QA-SWAP-NEW-2'
    qa.screenshot('02-native-swap-original-receipt');acknowledge()
    qa.passed('Native search keyboard, old/new vehicle review and confirmation cancellation preserve selection; one confirmed swap shows the exact original receipt and requires acknowledgement')
    open_editor(6104);choose('NEW-1',1);mode('lost');commit()
    qa.wait('Đổi xe đang chờ đối chiếu',timeout=60);assert stats()['writes']==2
    lost=stats()['receipts'][-1];lost_key=lost['requestId']
    qa.launch();qa.wait('Mở Đội xe',timeout=180);qa.tap('Tài khoản',bottom=True)
    qa.scroll_to('Đối chiếu đổi xe trong hợp đồng #6104');qa.tap('Đối chiếu đổi xe trong hợp đồng #6104');qa.tap('Đối chiếu với máy chủ')
    qa.scroll_to('Mở kết quả đổi xe trong hợp đồng #6104');qa.tap('Mở kết quả đổi xe trong hợp đồng #6104');qa.wait('Đổi xe đã được ghi nhận')
    assert stats()['writes']==2 and stats()['receipts'][-1]['requestId']==lost_key
    qa.screenshot('03-native-swap-lost-recovered');acknowledge()
    qa.passed('A committed swap with a lost response survives process death; Account recovers its exact SecureStore UUID and original vehicles without another swap')
    open_editor(6105);choose('NEW-1',1);mode('drop');commit()
    qa.wait('Đổi xe đang chờ đối chiếu',timeout=60);assert stats()['writes']==2
    qa.launch();qa.wait('Mở Đội xe',timeout=180);open_editor(6105,pending=True)
    qa.tap('Đối chiếu đổi xe với máy chủ');qa.tap('Đối chiếu với máy chủ');qa.wait('1. Chọn xe đang thuê')
    nodes=qa.matches(qa.tree(),'Chọn đổi xe QA-SWAP-OLD-1');assert nodes and all(n.get('checked')!='true' for n in nodes)
    latest=stats(late=True);assert latest['lateStatus']==409 and latest['writes']==2
    qa.screenshot('04-native-swap-reopen-cancel')
    qa.back();qa.wait('Chi tiết hợp đồng');to_tabs();qa.tap('Tài khoản',bottom=True)
    qa.scroll_to('Tải lại danh sách đối chiếu');qa.tap('Tải lại danh sách đối chiếu');qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.tap('Tổng quan',bottom=True)
    qa.passed('An unsent swap key survives process death and editor reopening; cancellation returns to an unselected first step, blocks late delivery and clears only the confirmed device key')
    qa.finish();result=json.loads(args.output.joinpath('results.json').read_text(encoding='utf-8'))
    assert preserved()==baseline and result['newSystemUiAnrs']==0
    result.update(mode='focused-swap',fixturePort=args.fixture_port,returnFixtureUnchanged=True,
        priorFixtureAvailableBeforeRun=baseline['legacyFixtureAvailable'],originalFixtureUnchanged=True if baseline['legacyFixtureAvailable'] else None,
        scope='swap editor, original receipt, lost response, process death, tombstone, session restore/logout')
    args.output.joinpath('results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    qa.command('reverse','tcp:8091','tcp:8091')
    args.output.joinpath('usb-fixture-route.json').write_text(json.dumps({'phoneApiPort':8091,'hostFixturePort':8091,'swapFixturePort':args.fixture_port,'restored':True}),encoding='utf-8')
    print('Swap native acceptance complete; original USB fixture route restored.',flush=True)
except Exception as failure:
    result={'status':'failed','completedGroups':len(qa.checks),'checks':qa.checks,'error':str(failure),'mode':'focused-swap',
        'fixturePort':args.fixture_port,'startedEpoch':qa.started_epoch,'fixtureOnly':True,'operationalWrites':0,'completedAt':datetime.now(timezone.utc).isoformat()}
    try:result['diagnostics']=module.collect_diagnostics(qa,module.PACKAGE)
    except Exception as error:result['diagnosticsError']=type(error).__name__
    args.output.joinpath('results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    try:qa.screenshot('failure')
    except RuntimeError:pass
    raise
