"""Focused Samsung GPS acceptance, one UIAutomator reader, synthetic durable API."""
import argparse
import hashlib
import importlib.util
import json
import re
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from lib.mobile_native_provenance import capture, source_snapshot
from lib.mobile_native_diagnostics import collect

parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--fixture-port',type=int,default=8108);args=parser.parse_args()
assert 8100<=args.fixture_port<=8199
spec=importlib.util.spec_from_file_location('nativeqa',Path(__file__).with_name('check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
assert not args.output.exists(),'Use a new native evidence directory'
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
def request(path,body=None):
    req=urllib.request.Request(f'http://127.0.0.1:{args.fixture_port}'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'} if body is not None else {})
    with urllib.request.urlopen(req,timeout=12) as result:data=json.load(result)
    assert data['fixtureOnly'] is True;return data
def stats():return request('/__fixture_state')
def mode(value):return request('/__fixture_mode',{'mode':value})
def reveal(label,up=False):
    # Read-only evidence text can be shorter than the 48px control target used
    # by NativeQA.scroll_to. Require actual visible bounds, without enlarging it.
    for _ in range(14):
        root=qa.tree();viewport=list(map(int,re.findall(r'\d+',next(root.iter('node')).get('bounds'))));width,height=viewport[2:]
        for node in qa.matches(root,label):
            x1,y1,x2,y2=map(int,re.findall(r'\d+',node.get('bounds','[0,0][0,0]')))
            if x2>x1 and y2>y1 and y1>=145 and y2<=height:return
        start,end=(.35,.72) if up else (.72,.35)
        qa.command('shell','input','swipe',str(width//2),str(int(height*start)),str(width//2),str(int(height*end)),'350')
    raise AssertionError('GPS evidence/control not visible: '+label)
def press(label,up=False):reveal(label,up);qa.tap(label)
def routes():
    result={}
    for line in qa.command('reverse','--list').splitlines():
        parts=line.split()
        if len(parts)==3 and parts[1] in ('tcp:8081','tcp:8091'):result[parts[1]]=parts[2]
    return result
def preserved():
    return {str(path):hashlib.sha256(path.read_bytes()).hexdigest() for path in [Path('.backups/mobile-contract-flow-fixture-20261102/state.json'),Path('.backups/mobile-transfer-fixture-20261102/state.json'),Path('.backups/mobile-recovery-fixture-20261102/state.json'),Path('.backups/mobile-media-fixture-20261102/state.json'),Path('.backups/mobile-customer-documents-fixture-20261103-run4/state.json')] if path.is_file()}
def enter_login_field(label,value):
    qa.hide_keyboard();reveal(label)
    nodes=[n for n in qa.matches(qa.tree(),label) if n.get('class')=='android.widget.EditText'];assert len(nodes)==1
    before=nodes[0].get('text','');hint='Email hoặc tên đăng nhập' if label=='Tài khoản' else 'Nhập mật khẩu'
    if label=='Tài khoản':assert before in ('',hint,'qa','qa-admin','qa-settings'),'Unexpected non-QA account; refusing to edit'
    else:assert before in ('',hint),'Expected an empty synthetic password field'
    x1,y1,x2,y2=map(int,re.findall(r'\d+',nodes[0].get('bounds')))
    # Tap once, then wait for focus. Re-tapping cached coordinates while the IME
    # animates can hit a keyboard digit instead of the moving text field.
    qa.command('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
    focused=False
    for _ in range(6):
        all_nodes=list(qa.tree().iter('node'))
        focused=any(n.get('package')==module.PACKAGE and n.get('class')=='android.widget.EditText' and n.get('content-desc')==label and n.get('focused')=='true' for n in all_nodes)
        if focused:break
    assert focused,'Synthetic login field did not receive focus after one tap'
    if before not in ('',hint):
        qa.command('shell','input','keyevent','KEYCODE_MOVE_END')
        qa.command('shell','input','keyevent',*(['KEYCODE_DEL']*(len(before)+1)))
    qa.command('shell','input','text',value)
    qa.hide_keyboard();reveal(label)
    if label=='Tài khoản':
        nodes=[n for n in qa.matches(qa.tree(),label) if n.get('class')=='android.widget.EditText']
        assert len(nodes)==1 and nodes[0].get('text')==value,'Synthetic account readback did not match before submit'
def login(email):
    qa.wait('Đăng nhập',timeout=120)
    enter_login_field('Tài khoản',email);enter_login_field('Mật khẩu','fixture-password');reveal('Tài khoản',True)
    entered=[n for n in qa.matches(qa.tree(),'Tài khoản') if n.get('class')=='android.widget.EditText']
    assert len(entered)==1 and entered[0].get('text')==email,'QA username changed before submit'
    press('Đăng nhập');qa.wait('Định vị GPS',timeout=120)
def open_gps():qa.tap('Định vị GPS');qa.wait('Tải lại GPS',timeout=60)
def search(value):
    root=qa.tree()
    if qa.matches(root,'Bộ lọc GPS'):press('Bộ lọc GPS',True)
    elif not qa.matches(root,'Ẩn bộ lọc GPS'):
        reveal('Bộ lọc GPS',True);qa.tap('Bộ lọc GPS')
    qa.text('Tìm GPS',value);qa.hide_keyboard();press('Tìm GPS theo nội dung đã nhập');reveal('Ẩn bộ lọc GPS',True);qa.tap('Ẩn bộ lọc GPS')
def tabs():
    for _ in range(6):
        if qa.matches(qa.tree(),'Tài khoản'):return
        qa.back()
    raise AssertionError('Cannot return to Himoto tabs')
def logout():tabs();qa.tap('Tài khoản',bottom=True);press('Đăng xuất');qa.wait('Đăng nhập')
def mapping():
    press('Ghép GPS GPSQA001');qa.wait('Đang ghép: GPS-QA-101 · Cơ sở GPS QA A',timeout=45)

previous_routes=None;before_preserved=preserved()
try:
    initial=stats();assert initial['schema']=='himoto.qa.gps.v1' and initial['writes']==0 and not initial['receipts'] and not initial['tombstones'],'Use a fresh checkpoint; never reset written GPS QA'
    print('Prewarming current source before exclusive native UI acceptance.',flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as reply:config=reply.read().decode()
    assert 'http://127.0.0.1:8091' in config and 'mobile-api.example.invalid' not in config
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as reply:entry=hashlib.file_digest(reply,'sha256').hexdigest()
    previous_routes=routes();qa.command('reverse','tcp:8081','tcp:8081');qa.command('reverse','tcp:8091',f'tcp:{args.fixture_port}');qa.verify_device_network()
    qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip());qa.launch()
    qa.wait_any(['Đăng nhập','Định vị GPS'],timeout=180)
    if qa.matches(qa.tree(),'Định vị GPS'):logout()
    login('qa-settings');open_gps();reveal('Mở bản đồ GPS-QA-101');assert not qa.matches(qa.tree(),'Ghép GPS GPSQA001');qa.screenshot('01-staff-gps')
    search('GPSQA004');reveal('Chưa có tốc độ hiện tại');qa.wait('Chưa có tốc độ hiện tại');assert not qa.matches(qa.tree(),'45 km/h');qa.screenshot('02-stale-position')
    qa.passed('Native settings-only staff sees GPS without mapping controls; stale provider speed is suppressed and old position evidence stays visible')
    mode('read-error');press('Tải lại GPS',True);qa.wait('QA gián đoạn đọc GPS; giữ dữ liệu gần nhất.');reveal('Mở bản đồ GPS-QA-103');mode('sync-error');press('Đồng bộ ngay',True);qa.wait('QA chưa đồng bộ được GPS. Giữ trạng thái gần nhất.');mode('none');press('Tải lại GPS',True)
    qa.command('shell','input','keyevent','KEYCODE_HOME');time.sleep(1);before=stats()['reads'];time.sleep(6);assert stats()['reads']==before,'GPS read continued while backgrounded'
    qa.command('shell','am','start','-W','-n','vn.himoto.staff/.MainActivity');qa.wait('Tải lại GPS',timeout=90);before=stats()['reads'];time.sleep(6);assert stats()['reads']>before
    press('Lịch sử GPS');press('Nguồn lịch sử GPS');qa.tap('Nhật ký đọc bù');reveal('Tắt khóa điện');qa.wait('Tắt khóa điện');qa.screenshot('03-history-source')
    qa.passed('Native read/sync failures keep last good GPS; background stops polling, resume restarts it, and history source filtering shows provider ignition events separately')
    logout();login('qa-admin');open_gps();reveal('Ghép GPS GPSQA001');mapping()
    qa.text('Tìm xe để ghép GPS','GPS-QA-102');qa.hide_keyboard();press('Tìm xe ghép GPS');press('Chọn ghép GPS-QA-102');qa.wait('Sẽ ghép: GPS-QA-102 · Cơ sở GPS QA B')
    mode('mapping-lost');press('Lưu ghép GPS với xe đã chọn');qa.wait('Đối chiếu và kết thúc mã ghép GPS');assert stats()['writes']==1
    # Kill after commit to verify the actor-scoped device ledger and Account recovery.
    qa.launch();qa.wait('Định vị GPS',timeout=150);qa.tap('Tài khoản',bottom=True);press('Tải lại danh sách đối chiếu');reveal('Ghép GPS với xe #1')
    press('Đối chiếu ghép gps với xe #1');qa.wait('Đối chiếu và kết thúc yêu cầu?');qa.tap('Đối chiếu với máy chủ');press('Mở kết quả ghép gps với xe #1');qa.wait('Đã ghi: GPS-QA-102 · Cơ sở GPS QA B');assert stats()['writes']==1;qa.screenshot('04-killed-after-commit-original-proof')
    press('Đã kiểm tra kết quả ghép GPS');qa.wait('Tải lại GPS');qa.passed('Native administrator reviews mapping; a lost response plus process kill recovers the one original commit through Account and clears the pending key after acknowledgement')
    press('Ghép GPS GPSQA001');qa.wait('Đang ghép: GPS-QA-102 · Cơ sở GPS QA B');press('Chọn không ghép xe');mode('mapping-drop');press('Lưu bỏ ghép GPS khỏi xe');qa.wait('Đối chiếu và kết thúc mã ghép GPS');qa.tap('Đối chiếu và kết thúc mã ghép GPS');qa.wait('Lưu ghép GPS với xe đã chọn');assert stats()['writes']==1;assert request('/__fixture_late',{})['lateStatus']==409
    mode('mapping-conflict');press('Lưu ghép GPS với xe đã chọn');qa.wait('Thiết bị QA đã thay đổi. Đối chiếu và tải lại.');press('Đối chiếu và kết thúc mã ghép GPS');qa.wait('Lưu bỏ ghép GPS khỏi xe');assert stats()['writes']==1;qa.screenshot('05-stale-review-no-second-write');qa.passed('Native dropped mapping is tombstoned and late delivery returns 409; concurrent mapping change requires a new review without adding a write')
    tabs();qa.tap('Tài khoản',bottom=True);press('Tải lại danh sách đối chiếu');qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.');press('Đăng xuất');qa.wait('Đăng nhập');assert stats()['activeSessions']==0
    diagnostics=collect(qa,module.PACKAGE);assert not diagnostics['errors'] and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0
    assert source_snapshot()==qa.source_files and preserved()==before_preserved
    final=stats();qa.output.joinpath('fixture-final.json').write_text(json.dumps(final,ensure_ascii=False,indent=2),encoding='utf-8')
    result={'status':'passed','passed':len(qa.checks),'checks':qa.checks,'fixtureOnly':True,'physicalDeviceTested':True,'fullAppCertified':False,'sourceFilesVerified':len(qa.source_files),
        'newAppCrashes':0,'newAppAnrs':0,'newSystemUiAnrs':0,'operationalWrites':0,'completedAt':datetime.now(timezone.utc).isoformat()}
    qa.output.joinpath('results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
except Exception as error:
    result={'status':'failed','passed':len(qa.checks),'checks':qa.checks,'error':str(error),'fixtureOnly':True,'completedAt':datetime.now(timezone.utc).isoformat()}
    qa.output.joinpath('results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    try:qa.screenshot('failure');qa.output.joinpath('fixture-failed.json').write_text(json.dumps(stats(),ensure_ascii=False,indent=2),encoding='utf-8')
    except Exception:pass
    raise
finally:
    if previous_routes is not None:
        for port in ('tcp:8081','tcp:8091'):
            if port in previous_routes:qa.command('reverse',port,previous_routes[port])
            else:qa.command('reverse','--remove',port)
        restored=routes();qa.output.joinpath('usb-route.json').write_text(json.dumps({'before':previous_routes,'after':restored,'restored':restored==previous_routes}),encoding='utf-8');assert restored==previous_routes
