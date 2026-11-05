"""Focused Samsung deletion/replacement/kill/recovery, synthetic seeded records only."""
import argparse,ast,hashlib,importlib.util,json,re,time,urllib.request
from pathlib import Path
from datetime import datetime,timezone
from lib.mobile_native_provenance import capture,source_snapshot
from lib.mobile_native_diagnostics import collect
parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--fixture-port',type=int,default=8123);parser.add_argument('--state-file',type=Path,required=True);args=parser.parse_args()
assert 8100<=args.fixture_port<=8199 and not args.output.exists()
spec=importlib.util.spec_from_file_location('nativeqa',Path(__file__).with_name('check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
tree=ast.parse(Path('scripts/check-mobile-gps-native.py').read_text(encoding='utf-8'));names={'reveal','press','enter_login_field','login','tabs','routes'};exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[]),'gps_helpers','exec'))
def request(path,body=None):
    req=urllib.request.Request(f'http://127.0.0.1:{args.fixture_port}'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'} if body is not None else {})
    with urllib.request.urlopen(req,timeout=12) as r:data=json.load(r)
    assert data['fixtureOnly'];return data
def stats():return request('/__fixture_state')
def mode(value):request('/__fixture_mode',{'mode':value})
def preserved():
    names=['mobile-contract-flow-fixture-20261102','mobile-media-delete-fixture-20261103-run1','mobile-customer-photo-copy-fixture-20261103-run1','mobile-contract-photos-fixture-20261103-run2','mobile-customer-documents-fixture-20261103-run4','mobile-gps-fixture-20261103-run5']
    return {name:hashlib.sha256(Path('.backups',name,'state.json').read_bytes()).hexdigest() for name in names if Path('.backups',name,'state.json').is_file()}
def account():tabs();qa.tap('Tài khoản',bottom=True);press('Tải lại danh sách đối chiếu')
def gallery():press('Ảnh lập hợp đồng / giao xe · #2001')
def open_delete(label):press('Mở mục '+label);press('Xóa tệp khỏi hồ sơ');qa.wait('Rà soát tệp trước khi xóa');reveal('Xóa tệp đã rà soát')
def remove():press('Xóa tệp đã rà soát');qa.wait('Xóa tệp khỏi hồ sơ?');qa.tap('Xác nhận xóa tệp')
def acknowledge():press('Đã kiểm tra phiếu xóa ảnh');qa.wait('Ảnh và hồ sơ nghiệp vụ')
def cancelled():
    deadline=time.monotonic()+30
    while time.monotonic()<deadline:
        state=json.loads(args.state_file.read_text(encoding='utf-8'))['state'];delayed=state.get('delayed_media_delete')
        if delayed and delayed['headers']['idempotency-key'] in state.get('tombstones',{}):return
        time.sleep(.2)
    raise AssertionError('Deletion not durably tombstoned before late delivery')
previous=None;before=None
try:
    initial=stats();assert initial['draftCreates']==initial['mediaDeletes']==initial['activeSessions']==0,'Use a fresh checkpoint, never reset acceptance data'
    request('/__fixture_media_delete_sources',{});qa.command('shell','am','force-stop',module.PACKAGE);time.sleep(1);before=preserved()
    print('Prewarming frozen deletion source before exclusive Samsung UI.',flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as r:config=r.read().decode()
    assert 'http://127.0.0.1:8091' in config and 'mobile-api.example.invalid' not in config
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as r:entry=hashlib.file_digest(r,'sha256').hexdigest()
    previous=routes();qa.command('reverse','tcp:8081','tcp:8081');qa.command('reverse','tcp:8091',f'tcp:{args.fixture_port}');qa.verify_device_network();qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip())
    qa.launch();login('qa');account();qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.tap('Hợp đồng',bottom=True);qa.tap('NHAP-2001');press('Ảnh và hồ sơ nghiệp vụ');gallery();open_delete('Khi thuê · Hợp đồng đã ký')
    press('Xóa tệp đã rà soát');qa.wait('Xóa tệp khỏi hồ sơ?');qa.tap('Tiếp tục chỉnh sửa');assert stats()['mediaDeletes']==0;qa.screenshot('01-native-delete-reviewed-cancel')
    mode('delete-lost');remove();qa.wait('Đối chiếu xóa ảnh với máy chủ');assert stats()['mediaDeletes']==1
    qa.launch();qa.wait('Định vị GPS',timeout=150);account();press('Đối chiếu xóa tệp hợp đồng #2001');qa.wait('Đối chiếu và kết thúc yêu cầu?');qa.tap('Đối chiếu với máy chủ');request('/__fixture_media_delete_replace',{'slot':'rental-document-1'});press('Mở kết quả xóa tệp hợp đồng #2001');qa.wait('Phiếu xóa ảnh đã ghi');reveal('Mục này đã có tệp khác sau lần xóa. Phiếu gốc được giữ; tệp mới không bị xóa lại.');qa.screenshot('02-native-original-delete-replacement-after-kill');acknowledge()
    qa.passed('Samsung reviews the saved synthetic image and cancellation leaves it intact; lost delete commit plus process kill recovers the original Account proof while preserving a replacement image')
    gallery();open_delete('Khi thuê · Bill chuyển khoản / tổng tiền mặt');request('/__fixture_media_delete_replace',{'slot':'rental-document-2'});remove();qa.wait('Đối chiếu xóa ảnh với máy chủ');assert stats()['mediaDeletes']==1;press('Đối chiếu xóa ảnh với máy chủ');press('Tải lại kết quả xóa ảnh');mode('delete-drop');remove();qa.wait('Đối chiếu xóa ảnh với máy chủ');press('Đối chiếu xóa ảnh với máy chủ');cancelled();assert request('/__fixture_media_delete_late',{})['lateStatus']==409
    press('Tải lại kết quả xóa ảnh');remove();qa.wait('Phiếu xóa ảnh đã ghi');qa.screenshot('03-native-delete-stale-drop-recovery');acknowledge();assert stats()['mediaDeletes']==2
    qa.passed('A concurrent image replacement rejects the stale review; stale/drop requests reconcile before reloading, late delivery409 cannot remove the file, then the fresh reviewed image deletes once')
    gallery();press('Mở mục Khi thuê · Video 1');press('Xóa tệp khỏi hồ sơ');reveal('Xóa tệp đã rà soát');root=qa.tree();buttons=[n for n in qa.matches(root,'Xóa tệp đã rà soát') if n.get('class')=='android.widget.Button'];assert buttons and all(n.get('enabled')=='false' for n in buttons)
    press('Xác nhận xóa tệp theo thông tin hồ sơ',True);remove();qa.wait('Phiếu xóa ảnh đã ghi');qa.screenshot('04-native-video-delete-proof');acknowledge();assert stats()['mediaDeletes']==3
    qa.passed('Saved video deletion requires explicit metadata acknowledgement; no video upload or extra metadata is created')
    request('/__fixture_media_delete_image_failure',{'failed':True});gallery();open_delete('Khi thuê · Ảnh tổng thể xe');reveal('Xác nhận xóa tệp theo thông tin hồ sơ');qa.wait('Xác nhận xóa tệp theo thông tin hồ sơ');reveal('Xóa tệp đã rà soát');nodes=[n for n in qa.matches(qa.tree(),'Xóa tệp đã rà soát') if n.get('class')=='android.widget.Button'];assert nodes and all(n.get('enabled')=='false' for n in nodes)
    press('Xác nhận xóa tệp theo thông tin hồ sơ',True);request('/__fixture_media_delete_image_failure',{'failed':False});press('Tải lại ảnh cần xóa');press('Xóa tệp đã rà soát');qa.wait('Xóa tệp khỏi hồ sơ?');qa.tap('Tiếp tục chỉnh sửa');assert stats()['mediaDeletes']==3
    request('/__fixture_media_delete_image_failure',{'failed':True});press('Tải lại ảnh cần xóa');reveal('Xác nhận xóa tệp theo thông tin hồ sơ');qa.wait('Xác nhận xóa tệp theo thông tin hồ sơ');reveal('Xóa tệp đã rà soát');nodes=[n for n in qa.matches(qa.tree(),'Xóa tệp đã rà soát') if n.get('class')=='android.widget.Button'];assert nodes and all(n.get('enabled')=='false' for n in nodes);press('Xác nhận xóa tệp theo thông tin hồ sơ',True);qa.screenshot('05-native-image-error-explicit-metadata');remove();qa.wait('Phiếu xóa ảnh đã ghi');acknowledge();assert stats()['mediaDeletes']==4
    account();qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.screenshot('06-native-delete-ledger-empty');press('Đăng xuất');qa.wait('Đăng nhập');assert stats()['activeSessions']==0
    state=json.loads(args.state_file.read_text(encoding='utf-8'))['state'];assert '2001:rental-document-1' in state['contract_photos'] and '2001:rental-1' not in state['contract_photos'] and '2001:rental-video-1' not in state['contract_photos'] and state['draft_creates']==1
    qa.passed('Actual native image-download failure permits only explicit metadata confirmation; retry clears old consent, success/cancel writes nothing, then failed-image deletion keeps exact revision; four original proofs end with empty ledger/logout0')
    diagnostics=collect(qa,module.PACKAGE);assert not diagnostics['errors'] and diagnostics['newAppCrashes']==diagnostics['newAppAnrs']==diagnostics['newSystemUiAnrs']==0;assert source_snapshot()==qa.source_files and preserved()==before
    qa.output.joinpath('fixture-final.json').write_text(json.dumps(stats(),ensure_ascii=False,indent=2),encoding='utf-8')
    result={'status':'passed','passed':len(qa.checks),'checks':qa.checks,'fixtureOnly':True,'physicalDeviceTested':True,'fullAppCertified':False,'sourceFilesVerified':len(qa.source_files),'newAppCrashes':0,'newAppAnrs':0,'newSystemUiAnrs':0,'operationalWrites':0,'completedAt':datetime.now(timezone.utc).isoformat()};qa.output.joinpath('results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
except Exception as error:
    qa.output.joinpath('results.json').write_text(json.dumps({'status':'failed','passed':len(qa.checks),'checks':qa.checks,'error':str(error),'fixtureOnly':True,'completedAt':datetime.now(timezone.utc).isoformat()},ensure_ascii=False,indent=2),encoding='utf-8')
    try:qa.screenshot('failure');qa.output.joinpath('fixture-failed.json').write_text(json.dumps(stats(),ensure_ascii=False,indent=2),encoding='utf-8')
    except Exception:pass
    raise
finally:
    if previous is not None:
        for port in ('tcp:8081','tcp:8091'):
            qa.command('reverse',port,previous[port]) if port in previous else qa.command('reverse','--remove',port)
        after=routes();qa.output.joinpath('usb-route.json').write_text(json.dumps({'before':previous,'after':after,'restored':after==previous}),encoding='utf-8');assert after==previous
