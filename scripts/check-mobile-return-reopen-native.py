"""Focused native regression: reopen uncertain return without form contents.

Preserves the acknowledged receipts/tombstone from the 6-group return run.
"""
import argparse
import hashlib
import importlib.util
import json
import re
import urllib.request
from datetime import datetime,timezone
from pathlib import Path
from lib.mobile_native_provenance import capture

parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
spec=importlib.util.spec_from_file_location('nativeqa',Path(__file__).with_name('check-mobile-native.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
def get(path,port=8093):
    with urllib.request.urlopen(f'http://127.0.0.1:{port}'+path,timeout=8) as response:result=json.load(response)
    assert result['fixtureOnly'] is True;return result
def enter(label,value):qa.text(label,value,replace=True);qa.hide_keyboard()
def open_editor():
    qa.tap('Hợp đồng',bottom=True)
    if qa.matches(qa.tree(),'Xóa tìm kiếm'):qa.tap('Xóa tìm kiếm')
    qa.text('Tìm hợp đồng','HD-QA-5105');qa.hide_keyboard();qa.tap('Xem HD-QA-5105, Khách hợp đồng QA');qa.wait('Chi tiết hợp đồng')
    qa.scroll_to('Trả xe và quyết toán');qa.tap('Trả xe và quyết toán')
try:
    baseline=get('/__fixture_returns')
    assert baseline['writes']==2 and [r['id'] for r in baseline['receipts']]==[5101,5104],'Reuse only the already-acknowledged return fixture'
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as response:config=response.read().decode('utf-8')
    assert re.search(r"apiOrigin[\s\S]{0,150}['\"]http://127\.0\.0\.1:8091['\"]",config) or re.search(r"['\"]EXPO_PUBLIC_API_URL['\"]:\s*\{[^}]{0,100}value:\s*['\"]http://127\.0\.0\.1:8091['\"]",config)
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
    qa.command('reverse','tcp:8081','tcp:8081');qa.command('reverse','tcp:8091','tcp:8093')
    args.output.joinpath('usb-fixture-route.json').write_text(json.dumps({'hostFixturePort':8093,'restored':False}),encoding='utf-8')
    qa.verify_device_network();qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip())
    qa.launch();tree=qa.wait_any(['Mở Đội xe','Đăng nhập'],timeout=180)
    if qa.matches(tree,'Đăng nhập'):
        qa.text('Tài khoản','qa');qa.command('shell','input','keyevent','66');qa.text('Mật khẩu','fixture-password');qa.hide_keyboard();qa.tap('Đăng nhập')
    qa.wait('Mở Đội xe',timeout=180);qa.tap('Tài khoản',bottom=True)
    qa.scroll_to('Tải lại danh sách đối chiếu');qa.tap('Tải lại danh sách đối chiếu');qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.')
    qa.tap('Tổng quan',bottom=True);open_editor();qa.wait('1. Chọn xe trả')
    qa.tap('Chọn trả xe QA-RETURN-1');qa.scroll_to('Nhập phí trả xe');qa.tap('Nhập phí trả xe')
    enter('Phí trễ đã đối chiếu (VND, tùy chọn)','0')
    qa.scroll_to('Tính phí và số dư');qa.tap('Tính phí và số dư');qa.wait('3. Tiền thực thu và hoàn')
    qa.scroll_to('Rà soát quyết toán');qa.tap('Rà soát quyết toán');qa.wait('4. Rà soát quyết toán')
    request=urllib.request.Request('http://127.0.0.1:8093/__fixture_return_mode',data=b'{"mode":"drop"}',headers={'Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(request,timeout=8) as response:assert json.load(response)['mode']=='drop'
    qa.scroll_to('Ghi trả xe và quyết toán');qa.tap('Ghi trả xe và quyết toán');qa.tap('Xác nhận trả xe và quyết toán')
    qa.wait('Trả xe đang chờ đối chiếu');assert get('/__fixture_returns')['writes']==2
    qa.launch();qa.wait('Mở Đội xe',timeout=180);open_editor();qa.wait('Trả xe đang chờ đối chiếu')
    qa.passed('An unsent return keeps its original pending UUID through process death; reopening the editor cannot edit or submit another intent before reconciliation')
    qa.tap('Đối chiếu trả xe với máy chủ');qa.tap('Đối chiếu với máy chủ');qa.wait('1. Chọn xe trả')
    nodes=qa.matches(qa.tree(),'Chọn trả xe QA-RETURN-1');assert nodes and all(n.get('checked')!='true' for n in nodes)
    qa.screenshot('01-native-reopen-cancel-selection')
    latest=get('/__fixture_returns?late=1');assert latest['lateStatus']==409 and latest['writes']==2 and latest['receipts']==baseline['receipts']
    qa.back();qa.wait('Chi tiết hợp đồng');qa.back();qa.wait('Tổng quan');qa.tap('Tài khoản',bottom=True)
    qa.scroll_to('Tải lại danh sách đối chiếu');qa.tap('Tải lại danh sách đối chiếu');qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.tap('Tổng quan',bottom=True)
    qa.passed('After cancellation of a reopened intent, native returns to an unselected vehicle list and an empty ledger; delayed retry is blocked and prior acknowledged receipts stay unchanged')
    qa.finish();result=json.loads(args.output.joinpath('results.json').read_text(encoding='utf-8'))
    assert result['newSystemUiAnrs']==0
    result.update(mode='focused-return-reopen',fixturePort=8093,scope='reopened uncertain editor cancellation and session restore/logout')
    args.output.joinpath('results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    qa.command('reverse','tcp:8091','tcp:8091')
    args.output.joinpath('usb-fixture-route.json').write_text(json.dumps({'hostFixturePort':8091,'returnFixturePort':8093,'restored':True}),encoding='utf-8')
except Exception as failure:
    result={'status':'failed','completedGroups':len(qa.checks),'checks':qa.checks,'error':str(failure),'startedEpoch':qa.started_epoch,'fixtureOnly':True,'operationalWrites':0,'completedAt':datetime.now(timezone.utc).isoformat()}
    try:result['diagnostics']=module.collect_diagnostics(qa,module.PACKAGE)
    except Exception as error:result['diagnosticsError']=type(error).__name__
    args.output.joinpath('results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    try:qa.screenshot('failure')
    except RuntimeError:pass
    raise
