"""Samsung transfer acceptance: two actors, durable QA checkpoint, no reset."""
import argparse
import hashlib
import importlib.util
import json
import re
import socket
import urllib.request
import urllib.error
from datetime import datetime,timezone
from pathlib import Path
from lib.mobile_native_provenance import capture

parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--fixture-port',type=int,default=8097)
parser.add_argument('--output',type=Path,required=True);parser.add_argument('--vehicle-base',type=int,default=7100)
parser.add_argument('--recover-vehicle',type=int,help='Reconcile one known previously committed fixture dispatch before the fresh dataset suite')
args=parser.parse_args()
if args.vehicle_base%100 or not 7100<=args.vehicle_base<=9900:raise ValueError('Use a synthetic dataset base')
if not 1024<=args.fixture_port<=65535 or args.fixture_port in (8081,8091,8093,8094):raise ValueError('Use an isolated transfer fixture port')
spec=importlib.util.spec_from_file_location('nativeqa',Path(__file__).with_name('check-mobile-native.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
origin=f'http://127.0.0.1:{args.fixture_port}'
routes_before=None
def request(path,body=None,port=None):
    query=urllib.request.Request((origin if port is None else f'http://127.0.0.1:{port}')+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(query,timeout=8) as response:result=json.load(response)
    assert result['fixtureOnly'] is True
    return result
def stats():return request('/__fixture_state')
def mode(value):assert request('/__fixture_mode',{'mode':value})['mode']==value
def preserved():
    result={}
    for name,port,path in [('returns',8093,'/__fixture_returns'),('swaps',8094,'/__fixture_swaps'),('legacy',8091,'/__fixture_state'),('recoveries',8098,'/__fixture_state')]:
        with socket.socket() as probe:
            probe.settimeout(1);available=probe.connect_ex(('127.0.0.1',port))==0
        result[name]=request(path,port=port) if available else None
    checkpoint=Path('.backups/mobile-recovery-fixture-20261102/state.json')
    result['recoveryCheckpointSha256']=hashlib.sha256(checkpoint.read_bytes()).hexdigest() if checkpoint.exists() else None
    return result
def reverse_routes():
    result={}
    for line in qa.command('reverse','--list').splitlines():
        fields=line.split()
        if len(fields)==3 and fields[1] in ('tcp:8081','tcp:8091'):result[fields[1]]=fields[2]
    return result
def ownership(before,after):
    for label in ('Cơ sở sở hữu trước: '+before,'Cơ sở sở hữu sau: '+after):reveal(label);qa.wait(label)
def reveal(label):
    for upward in (False,True):
        for _ in range(8):
            root=qa.tree();nodes=qa.matches(root,label)
            if any(int(re.findall(r'\d+',node.get('bounds'))[3])-int(re.findall(r'\d+',node.get('bounds'))[1])>=25 for node in nodes):return
            _,_,width,height=map(int,re.findall(r'\d+',next(root.iter('node')).get('bounds')))
            start,end=(.35,.72) if upward else (.72,.35)
            qa.command('shell','input','swipe',str(width//2),str(int(height*start)),str(width//2),str(int(height*end)),'350')
    raise AssertionError('Native control not visible: '+label)
def to_tabs():
    for _ in range(5):
        if qa.matches(qa.tree(),'Tổng quan'):qa.tap('Tổng quan',bottom=True);return
        qa.back()
    raise AssertionError('Could not return to tabs')
def login(name='qa'):
    qa.wait('Đăng nhập');qa.text('Tài khoản',name);qa.command('shell','input','keyevent','66')
    qa.text('Mật khẩu','fixture-password');qa.hide_keyboard();qa.tap('Đăng nhập');qa.wait('Mở Đội xe',timeout=180)
def logout():
    to_tabs();qa.tap('Tài khoản',bottom=True);qa.scroll_to('Đăng xuất');qa.tap('Đăng xuất');qa.wait('Đăng nhập')
def open_editor(vehicle,pending=False):
    vehicle=args.vehicle_base+(vehicle-7100)
    qa.tap('Đội xe',bottom=True)
    if qa.matches(qa.tree(),'Xóa tìm kiếm'):qa.tap('Xóa tìm kiếm')
    qa.text('Tìm đội xe',f'QA-TRANSFER-{vehicle}');qa.hide_keyboard()
    qa.tap(f'Xem QA-TRANSFER-{vehicle}, Xe điều chuyển QA {vehicle}');qa.wait('Chi tiết xe')
    reveal('Điều chuyển và nhận xe');qa.tap('Điều chuyển và nhận xe');qa.wait('Thao tác kho đang chờ đối chiếu' if pending else '1. Chọn thao tác kho')
def prepare(action='Chuyển kho'):
    reveal(action);qa.tap(action)
    if action=='Chuyển kho':
        qa.scroll_to('Tìm kho đến');qa.text('Tìm kho đến','QA');qa.hide_keyboard()
        qa.scroll_to('Tìm cơ sở nhận');qa.tap('Tìm cơ sở nhận')
        qa.scroll_to('Chọn kho đến Kho nhận QA');qa.tap('Chọn kho đến Kho nhận QA')
    qa.scroll_to('Ghi chú thao tác kho');qa.text('Ghi chú thao tác kho','Native-transfer-QA');qa.hide_keyboard()
    qa.scroll_to('Rà soát thao tác kho');qa.tap('Rà soát thao tác kho');qa.wait('3. Rà soát thao tác kho')
def commit(action='chuyển kho'):
    qa.scroll_to('Ghi thao tác kho');qa.tap('Ghi thao tác kho');qa.tap('Xác nhận '+action)
def acknowledge():
    qa.scroll_to('Xác nhận đã kiểm tra phiếu kho');qa.tap('Xác nhận đã kiểm tra phiếu kho');qa.wait('Chi tiết xe');to_tabs()
def assert_disabled(label):
    reveal(label);nodes=qa.matches(qa.tree(),label);assert nodes and any(node.get('enabled')=='false' for node in nodes)

try:
    initial=stats();assert not any(args.vehicle_base<row['id']<args.vehicle_base+100 for row in initial['receipts']),'Use an unused dataset; never reset prior evidence'
    baseline=preserved();args.output.joinpath('preserved-fixtures-before.json').write_text(json.dumps(baseline,indent=2),encoding='utf-8')
    print('Prewarming verified Metro transfer source; no UI reader yet.',flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as response:config=response.read().decode('utf-8')
    assert re.search(r"apiOrigin[\s\S]{0,150}['\"]http://127\.0\.0\.1:8091['\"]",config) or re.search(r"['\"]EXPO_PUBLIC_API_URL['\"]:\s*\{[^}]{0,100}value:\s*['\"]http://127\.0\.0\.1:8091['\"]",config),'Metro must use the existing loopback QA origin'
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
    routes_before=reverse_routes();qa.command('reverse','tcp:8081','tcp:8081');qa.command('reverse','tcp:8091',f'tcp:{args.fixture_port}')
    args.output.joinpath('usb-fixture-route.json').write_text(json.dumps({'previous':routes_before,'phoneApiPort':8091,'hostFixturePort':args.fixture_port,'restored':False}),encoding='utf-8')
    qa.verify_device_network();qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip())
    qa.launch();tree=qa.wait_any(['Mở Đội xe','Đăng nhập'],timeout=180)
    if qa.matches(tree,'Đăng nhập'):login()
    if args.recover_vehicle:
        originals=[row for row in initial['receipts'] if row['id']==args.recover_vehicle and row['action']=='transfer' and row['events'][0]['actorId']==7]
        assert len(originals)==1,'Recover only one exact previously committed fixture dispatch'
        qa.wait('Mở Đội xe');qa.tap('Tài khoản',bottom=True)
        label=f'Đối chiếu chuyển kho #{args.recover_vehicle}';qa.scroll_to(label);qa.tap(label);qa.tap('Đối chiếu với máy chủ')
        label=f'Mở kết quả chuyển kho #{args.recover_vehicle}';qa.scroll_to(label);qa.tap(label);qa.wait('Chuyển kho đã được ghi nhận')
        assert any(originals[0]['requestId'] in (node.get('text','')+node.get('content-desc','')) for node in qa.tree().iter('node'))
        qa.screenshot('00-prior-pending-original');acknowledge();assert stats()['writes']==initial['writes']
        print('Prior fixture dispatch reconciled by exact UUID, viewed and acknowledged; no business write.',flush=True)
    qa.wait('Mở Đội xe',timeout=180);qa.tap('Tài khoản',bottom=True);qa.scroll_to('Tải lại danh sách đối chiếu');qa.tap('Tải lại danh sách đối chiếu')
    qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.tap('Tổng quan',bottom=True)
    qa.passed('Verified transfer source opens with an empty device ledger; prior return/swap fixtures remain intact and old fixture availability is recorded')

    open_editor(7101);prepare();ownership('Kho đi QA','Kho nhận QA');qa.scroll_to('Ghi thao tác kho');qa.tap('Ghi thao tác kho');qa.tap('Tiếp tục chỉnh sửa');reveal('3. Rà soát thao tác kho');qa.wait('3. Rà soát thao tác kho')
    assert stats()['writes']==initial['writes'];qa.screenshot('01-transfer-review');commit();qa.wait('Chuyển kho đã được ghi nhận',timeout=60)
    assert stats()['writes']==initial['writes']+1;ownership('Kho đi QA','Kho nhận QA')
    proof=stats()['receipts'][-1];assert proof['review']['vehicle']['ownerStoreId']==23 and proof['review']['after']['ownerStoreId']==24
    qa.screenshot('02-transfer-original');acknowledge()
    open_editor(7101);assert_disabled('Nhận xe');assert_disabled('Từ chối điều chuyển');qa.back();qa.wait('Chi tiết xe');to_tabs()
    qa.passed('Native keyboard, destination/note review and cancelled confirmation create no write; one dispatch produces its original receipt and prevents creator self-receive/reject')

    logout();login('qa8');qa.tap('Tài khoản',bottom=True);qa.scroll_to('Tải lại danh sách đối chiếu');qa.tap('Tải lại danh sách đối chiếu');qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.tap('Tổng quan',bottom=True)
    open_editor(7101);assert_disabled('Hủy điều chuyển');prepare('Nhận xe');commit('nhận xe');qa.wait('Nhận xe đã được ghi nhận',timeout=60)
    proof=stats()['receipts'][-1];assert proof['action']=='receive' and proof['events'][0]['actorId']==8 and proof['review']['transfer']['actorId']==7
    ownership('Kho nhận QA','Kho nhận QA');assert proof['review']['after']['ownerStoreId']==24
    qa.screenshot('03-receiver-original');acknowledge();logout();login()
    qa.passed('A separately authenticated receiver cannot cancel the sender dispatch, can receive it, and sees a proof linked to the original actor/event')

    open_editor(7102);prepare();ownership('Cơ sở QA 01','Kho nhận QA');commit();qa.wait('Chuyển kho đã được ghi nhận',timeout=60)
    proof=stats()['receipts'][-1];assert proof['review']['after']['status']=='using' and len(proof['events'])==2
    assert proof['review']['vehicle']['storeId']==23 and proof['review']['vehicle']['ownerStoreId']==201 and proof['review']['after']['ownerStoreId']==24
    ownership('Cơ sở QA 01','Kho nhận QA');qa.screenshot('ownership-distinct-immediate')
    acknowledge();open_editor(7106);prepare();commit();qa.wait('Chuyển kho đã được ghi nhận',timeout=60);acknowledge()
    open_editor(7106);prepare('Hủy điều chuyển');commit('hủy điều chuyển');qa.wait('Hủy điều chuyển đã được ghi nhận',timeout=60)
    proof=stats()['receipts'][-1];assert proof['action']=='cancel' and proof['review']['after']['storeId']==23 and proof['review']['after']['ownerStoreId']==23
    ownership('Kho nhận QA','Kho đi QA');acknowledge()
    qa.passed('Using stock moves immediately with two linked events and unchanged status; creator cancellation of a ready dispatch restores its original warehouse')

    open_editor(7107);prepare();commit();qa.wait('Chuyển kho đã được ghi nhận',timeout=60);acknowledge();logout();login('qa8')
    open_editor(7107);prepare('Từ chối điều chuyển');commit('từ chối điều chuyển');qa.wait('Từ chối điều chuyển đã được ghi nhận',timeout=60)
    proof=stats()['receipts'][-1];assert proof['action']=='reject' and proof['review']['after']['storeId']==23 and proof['events'][0]['actorId']==8
    assert proof['review']['after']['ownerStoreId']==23;ownership('Kho nhận QA','Kho đi QA')
    qa.screenshot('04-reject-original');acknowledge();logout();login()
    qa.passed('Independent receiver rejects a later dispatch with exact linked proof and restored original ready stock')

    open_editor(7104);prepare();mode('lost');before=stats()['writes'];commit();qa.wait('Thao tác kho đang chờ đối chiếu',timeout=60)
    assert stats()['writes']==before+1;lost=stats()['receipts'][-1];lost_key=lost['requestId']
    qa.launch();qa.wait('Mở Đội xe',timeout=180);qa.tap('Tài khoản',bottom=True)
    label=f'Đối chiếu chuyển kho #{args.vehicle_base+4}';qa.scroll_to(label);qa.tap(label);qa.tap('Đối chiếu với máy chủ')
    label=f'Mở kết quả chuyển kho #{args.vehicle_base+4}';qa.scroll_to(label);qa.tap(label);qa.wait('Chuyển kho đã được ghi nhận')
    assert any(lost_key in (node.get('text','')+node.get('content-desc','')) for node in qa.tree().iter('node'))
    assert stats()['writes']==before+1 and stats()['receipts'][-1]['requestId']==lost_key
    qa.screenshot('07-lost-commit-recovered');acknowledge()
    qa.passed('Lost commit response survives force-stop; Account recovers the SecureStore UUID and exact original dispatch without another stock write')

    open_editor(7105);prepare();mode('drop');before=stats()['writes'];commit();qa.wait('Thao tác kho đang chờ đối chiếu',timeout=60)
    assert stats()['writes']==before;qa.launch();qa.wait('Mở Đội xe',timeout=180);open_editor(7105,pending=True)
    qa.tap('Đối chiếu chuyển kho');qa.tap('Đối chiếu với máy chủ');qa.wait('1. Chọn thao tác kho')
    latest=request('/__fixture_late',{});assert latest['lateStatus']==409 and stats()['writes']==before
    qa.screenshot('08-unsent-reopen-tombstone');qa.back();qa.wait('Chi tiết xe');to_tabs()
    qa.tap('Tài khoản',bottom=True);qa.scroll_to('Tải lại danh sách đối chiếu');qa.tap('Tải lại danh sách đối chiếu');qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.tap('Tổng quan',bottom=True)
    qa.passed('Unsent key survives force-stop and editor reopening; reconciliation persists a tombstone, blocks late arrival and clears only the confirmed key')

    qa.finish();result=json.loads(args.output.joinpath('results.json').read_text(encoding='utf-8'))
    assert preserved()==baseline and result['newSystemUiAnrs']==0
    final=stats();assert final['receipts'][:len(initial['receipts'])]==initial['receipts'] and final['tombstones'][:len(initial['tombstones'])]==initial['tombstones']
    result.update(mode='focused-transfer',fixturePort=args.fixture_port,vehicleBase=args.vehicle_base,recoveredPriorVehicle=args.recover_vehicle,priorTransferProofsUnchanged=True,returnFixtureUnchanged=True,swapFixtureUnchanged=True,
        priorFixtureAvailableBeforeRun=baseline['legacy'] is not None,originalFixtureUnchanged=True if baseline['legacy'] is not None else None,
        recoveryFixtureUnchanged=True,ownershipProjected=True,
        scope='four transfer actions/two actors, distinct owner/warehouse and ownership before/after, immediate movement, immutable receipt, unknown writes, process death, tombstone, session/logout')
    args.output.joinpath('results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Transfer native acceptance complete.',flush=True)
except Exception as failure:
    result={'status':'failed','completedGroups':len(qa.checks),'checks':qa.checks,'error':str(failure),'mode':'focused-transfer','fixturePort':args.fixture_port,
        'startedEpoch':qa.started_epoch,'fixtureOnly':True,'operationalWrites':0,'completedAt':datetime.now(timezone.utc).isoformat()}
    try:result['diagnostics']=module.collect_diagnostics(qa,module.PACKAGE)
    except Exception as error:result['diagnosticsError']=type(error).__name__
    args.output.joinpath('results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    try:qa.screenshot('failure')
    except RuntimeError:pass
    raise
finally:
    if routes_before is not None:
        for local in ('tcp:8081','tcp:8091'):
            if local in routes_before:qa.command('reverse',local,routes_before[local])
            else:qa.command('reverse','--remove',local)
        args.output.joinpath('usb-fixture-route.json').write_text(json.dumps({'previous':routes_before,'restored':reverse_routes()==routes_before}),encoding='utf-8')
