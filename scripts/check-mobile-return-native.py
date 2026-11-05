"""Focused Samsung return acceptance; isolated fixture, no media/real records."""
import argparse
import hashlib
import importlib.util
import json
import re
import time
import urllib.request
from datetime import datetime,timezone
from pathlib import Path
from lib.mobile_native_provenance import capture

parser=argparse.ArgumentParser()
parser.add_argument('--serial',required=True)
parser.add_argument('--fixture-port',type=int,default=8093)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
if not 1024<=args.fixture_port<=65535 or args.fixture_port in (8081,8091):
    raise ValueError('Use an isolated fixture port, preserving the existing Metro/API')
spec=importlib.util.spec_from_file_location('nativeqa',Path(__file__).with_name('check-mobile-native.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
origin=f'http://127.0.0.1:{args.fixture_port}'

def get(path,port=None):
    with urllib.request.urlopen((origin if port is None else f'http://127.0.0.1:{port}')+path,timeout=8) as response:
        result=json.load(response)
    assert result['fixtureOnly'] is True
    return result
def stats(late=False):return get('/__fixture_returns'+('?late=1' if late else ''))
def old_counts():
    state,bills,collections=get('/__fixture_state',8091),get('/__fixture_bills',8091),get('/__fixture_collections',8091)
    return {'collections':collections['writes'],'billWrites':bills['writes'],'billReceipts':bills['receipts'],
            'tombstones':state['tombstones'],'resolutionCalls':state['resolutionCalls']}
def mode(value):
    request=urllib.request.Request(origin+'/__fixture_return_mode',data=json.dumps({'mode':value}).encode(),headers={'Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(request,timeout=8) as response:assert json.load(response)=={'fixtureOnly':True,'mode':value}
def enter(label,value):
    qa.text(label,value,replace=True);qa.hide_keyboard()
def reveal(label):
    try:qa.scroll_to(label,upward=True)
    except AssertionError:qa.scroll_to(label)
def choose(label,value):
    qa.scroll_to(label);qa.tap(label);qa.tap(value)
def to_tabs():
    for _ in range(5):
        if qa.matches(qa.tree(),'Tổng quan'):
            qa.tap('Tổng quan',bottom=True);return
        qa.back()
    raise AssertionError('Could not return to tabs after return acknowledgement')
def open_editor(index):
    qa.tap('Hợp đồng',bottom=True)
    if qa.matches(qa.tree(),'Xóa tìm kiếm'):qa.tap('Xóa tìm kiếm')
    qa.text('Tìm hợp đồng',f'HD-QA-{index}');qa.hide_keyboard()
    qa.tap(f'Xem HD-QA-{index}, Khách hợp đồng QA');qa.wait('Chi tiết hợp đồng')
    reveal('Trả xe và quyết toán');qa.tap('Trả xe và quyết toán');qa.wait('1. Chọn xe trả')
    qa.tap('Chọn trả xe QA-RETURN-1');qa.scroll_to('Nhập phí trả xe');qa.tap('Nhập phí trả xe');qa.wait('2. Phí và giờ nhận xe')
def fees(repair=False):
    enter('Phí trễ đã đối chiếu (VND, tùy chọn)','0')
    if repair:
        enter('Phí sửa chữa (VND)','30000');enter('Nội dung sửa chữa','Native-Return-Repair')
    qa.scroll_to('Tính phí và số dư');qa.tap('Tính phí và số dư');qa.wait('3. Tiền thực thu và hoàn')
def income(amount):
    qa.scroll_to('Thêm khoản thực thu');qa.tap('Thêm khoản thực thu');enter('Khoản thu 1 (VND)',str(amount))
def review():
    qa.scroll_to('Rà soát quyết toán');qa.tap('Rà soát quyết toán');qa.wait('4. Rà soát quyết toán')
def commit():
    qa.scroll_to('Ghi trả xe và quyết toán');qa.tap('Ghi trả xe và quyết toán');qa.tap('Xác nhận trả xe và quyết toán')
def acknowledge():
    qa.scroll_to('Xác nhận đã kiểm tra phiếu trả xe');qa.tap('Xác nhận đã kiểm tra phiếu trả xe');qa.wait('Chi tiết hợp đồng');to_tabs()

try:
    assert stats()['writes']==0 and not stats()['receipts'],'Use an isolated untouched return fixture; never reset pending evidence'
    before_old=old_counts()
    args.output.joinpath('preserved-fixture-before.json').write_text(json.dumps(before_old,indent=2),encoding='utf-8')
    # Verify the actual transformed config; a nearby fixture alone proves nothing.
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as response:
        config=response.read().decode('utf-8')
    assert re.search(r"apiOrigin[\s\S]{0,150}['\"]http://127\.0\.0\.1:8091['\"]",config) or re.search(r"['\"]EXPO_PUBLIC_API_URL['\"]:\s*\{[^}]{0,100}value:\s*['\"]http://127\.0\.0\.1:8091['\"]",config),'Metro must inline only the loopback QA origin'
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as response:
        entry=hashlib.file_digest(response,'sha256').hexdigest()
    qa.command('reverse','tcp:8081','tcp:8081')
    qa.command('reverse','tcp:8091',f'tcp:{args.fixture_port}')
    args.output.joinpath('usb-fixture-route.json').write_text(json.dumps({'phoneApiPort':8091,'hostFixturePort':args.fixture_port,'originalFixturePort':8091,'restored':False}),encoding='utf-8')
    qa.verify_device_network();qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip())
    qa.launch()
    tree=qa.wait_any(['Mở Đội xe','Đăng nhập'],timeout=180)
    if qa.matches(tree,'Đăng nhập'):
        qa.text('Tài khoản','qa');qa.command('shell','input','keyevent','66');qa.text('Mật khẩu','fixture-password');qa.hide_keyboard();qa.tap('Đăng nhập')
    qa.wait('Mở Đội xe',timeout=180);qa.tap('Tài khoản',bottom=True)
    qa.scroll_to('Tải lại danh sách đối chiếu');qa.tap('Tải lại danh sách đối chiếu')
    qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.tap('Tổng quan',bottom=True)
    qa.passed('Samsung opens the verified loopback bundle with an empty pending ledger; original collection/bill/tombstone fixture is preserved on its own port')
    open_editor(5101)
    qa.scroll_to('Ngày nhận xe thực tế');qa.tap('Ngày nhận xe thực tế');qa.confirm_system_picker()
    qa.scroll_to('Giờ nhận xe thực tế');qa.tap('Giờ nhận xe thực tế');qa.confirm_system_picker()
    fees(repair=True);income(430000);choose('Ghi hoàn cọc','Đã thực tế hoàn cọc');enter('Hoàn cọc (VND)','100000');review()
    qa.scroll_to('Ghi trả xe và quyết toán');qa.tap('Ghi trả xe và quyết toán');qa.tap('Tiếp tục chỉnh sửa')
    qa.wait('4. Rà soát quyết toán');assert stats()['writes']==0
    qa.screenshot('01-native-return-review')
    commit();qa.wait('Trả xe đã được ghi nhận',timeout=60)
    first=stats();assert first['writes']==1
    proof=first['receipts'][0]
    assert [row['amount'] for row in proof['transactions']]==[430000,100000] and proof['review']['after']['depositHeld']==0
    qa.screenshot('02-native-return-receipt');acknowledge()
    qa.passed('Native date/time pickers, fee override, repair keyboard, actual income and deposit refund complete one return; cancelled confirmation preserves the review and explicit receipt acknowledgement clears its key')
    open_editor(5104);fees();income(10000);review();mode('lost');commit()
    qa.wait('Trả xe đang chờ đối chiếu',timeout=60);assert stats()['writes']==2
    lost=stats()['receipts'][-1];lost_key=lost['requestId']
    qa.launch();qa.wait('Mở Đội xe',timeout=180);qa.tap('Tài khoản',bottom=True)
    qa.scroll_to('Đối chiếu trả xe và quyết toán #5104');qa.tap('Đối chiếu trả xe và quyết toán #5104');qa.tap('Đối chiếu với máy chủ')
    qa.scroll_to('Mở kết quả trả xe và quyết toán #5104');qa.tap('Mở kết quả trả xe và quyết toán #5104');qa.wait('Trả xe đã được ghi nhận')
    assert stats()['writes']==2 and stats()['receipts'][-1]['requestId']==lost_key
    qa.screenshot('03-native-lost-return-recovered');acknowledge()
    qa.passed('After a committed return loses its response and the Android process dies, Account recovers its exact Keystore UUID and income receipt without another money or vehicle write')
    open_editor(5105);fees();review();mode('drop');commit()
    qa.wait('Trả xe đang chờ đối chiếu',timeout=60);assert stats()['writes']==2
    qa.launch();qa.wait('Mở Đội xe',timeout=180);qa.tap('Tài khoản',bottom=True)
    qa.scroll_to('Đối chiếu trả xe và quyết toán #5105');qa.tap('Đối chiếu trả xe và quyết toán #5105');qa.tap('Đối chiếu với máy chủ')
    qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.');assert stats(late=True)['lateStatus']==409 and stats()['writes']==2
    qa.screenshot('04-native-return-tombstone');qa.tap('Tổng quan',bottom=True)
    qa.passed('An uncommitted return UUID survives Android process death; durable cancellation blocks its delayed request and clears the device key only after server confirmation')
    qa.finish()
    result=json.loads(args.output.joinpath('results.json').read_text(encoding='utf-8'))
    result.update(mode='focused-return',fixturePort=args.fixture_port,scope='return editor, settlement receipt, lost-response recovery, tombstone, session restore/logout')
    assert old_counts()==before_old
    assert result['newSystemUiAnrs']==0
    result['originalFixtureUnchanged']=True
    args.output.joinpath('results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    qa.command('reverse','tcp:8091','tcp:8091')
    args.output.joinpath('usb-fixture-route.json').write_text(json.dumps({'phoneApiPort':8091,'hostFixturePort':8091,'returnFixturePort':args.fixture_port,'restored':True}),encoding='utf-8')
    print('Return acceptance complete; original USB fixture route restored.',flush=True)
except Exception as failure:
    result={'status':'failed','completedGroups':len(qa.checks),'checks':qa.checks,'error':str(failure),'mode':'focused-return',
            'fixturePort':args.fixture_port,'startedEpoch':qa.started_epoch,'fixtureOnly':True,'operationalWrites':0,'completedAt':datetime.now(timezone.utc).isoformat()}
    try:result['diagnostics']=module.collect_diagnostics(qa,module.PACKAGE)
    except Exception as error:result['diagnosticsError']=type(error).__name__
    args.output.joinpath('results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    try:qa.screenshot('failure')
    except RuntimeError:pass
    raise
