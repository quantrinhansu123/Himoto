"""Focused Samsung customer-document acceptance. Synthetic API, no real writes."""
import argparse
import hashlib
import base64
import io
import time
from PIL import Image, ImageDraw, ImageFont
import importlib.util
import json
import re
import urllib.request
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from pathlib import Path
from lib.mobile_native_diagnostics import collect
from lib.mobile_native_provenance import capture, source_snapshot

parser = argparse.ArgumentParser()
parser.add_argument("--serial", required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--fixture-port", type=int, default=8104)
args = parser.parse_args()
if not 8100 <= args.fixture_port <= 8199: raise ValueError("Use the separate contract-flow QA fixture")
spec = importlib.util.spec_from_file_location("nativeqa", Path(__file__).with_name("check-mobile-native.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
qa = module.NativeQA(Path("E:/Android/Sdk/platform-tools/adb.exe"), args.serial, args.output, physical=True)


def request(path, body=None):
    req = urllib.request.Request(f"http://127.0.0.1:{args.fixture_port}" + path,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"} if body is not None else {})
    with urllib.request.urlopen(req, timeout=10) as reply: result = json.load(reply)
    assert result["fixtureOnly"] is True
    return result


def stats(): return request("/__fixture_state")
def mode(value): return request("/__fixture_mode", {"mode": value})
def reveal(label):
    try: qa.scroll_to(label)
    except AssertionError: qa.scroll_to(label,upward=True)
def tap(label): reveal(label);qa.tap(label)


def routes():
    result = {}
    for line in qa.command("reverse", "--list").splitlines():
        parts = line.split()
        if len(parts) == 3 and parts[1] in ("tcp:8081", "tcp:8091"): result[parts[1]] = parts[2]
    return result


def preserved():
    return {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in [
        Path(".backups/mobile-contract-flow-fixture-20261102/state.json"),
        Path(".backups/mobile-transfer-fixture-20261102/state.json"),
        Path(".backups/mobile-recovery-fixture-20261102/state.json"),
        Path(".backups/mobile-media-fixture-20261102/state.json")] if path.is_file()}


def incomplete():
    reveal("Trạng thái hồ sơ")
    qa.tap("Trạng thái hồ sơ")
    qa.tap("Chưa hoàn tất")


def return_tabs():
    for _ in range(5):
        root = qa.tree()
        if qa.matches(root, "Tổng quan"):
            qa.tap("Tổng quan", bottom=True)
            return
        qa.back()
    raise AssertionError("Could not return to tabs")


def bounds(node):return list(map(int,re.findall(r'-?\d+',node.get('bounds',''))))
def tap_node(node):
    x1,y1,x2,y2=bounds(node);assert x2>x1 and y2>y1;qa.command('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
photo_name='Himoto-Media-QA-'+str(time.time_ns())+'.jpg';phone_path='/sdcard/Download/'+photo_name;photo_path=args.output/'synthetic-native-picker.jpg'
picker_identity=None
def create_photo():
    image=Image.new('RGB',(4200,2800),'#f2f5f8');draw=ImageDraw.Draw(image);font=ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf',145)
    draw.rectangle((180,500,4020,2300),outline='#bb1730',width=32)
    for y,line in [(900,'HIMOTO MEDIA QA'),(1250,'SYNTHETIC PHOTO ONLY'),(1600,str(args.fixture_port))]:draw.text((360,y),line,fill='#bb1730',font=font)
    image.save(photo_path,format='JPEG',quality=92);qa.command('push',str(photo_path),phone_path)
    qa.command('shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file://'+phone_path)
    args.output.joinpath('created-qa-media.json').write_text(json.dumps({'path':phone_path,'local':str(photo_path),'synthetic':True,'originalDimensions':[4200,2800]}),encoding='utf-8')
def exact_picker_timestamp(root):
    global picker_identity
    if not any(n.get('package')=='com.google.android.gms' for n in root.iter('node')):return None
    if picker_identity is None:
        assert re.fullmatch(r'Himoto-Media-QA-[0-9]+\.jpg',photo_name)
        metadata=qa.command('shell','content','query','--uri','content://media/external/images/media',
            '--projection','_id:_display_name:datetaken','--where',"\"_display_name='"+photo_name+"'\"")
        rows=[line for line in metadata.splitlines() if line.startswith('Row:')]
        if len(rows)!=1:return None
        taken=re.search(r'\bdatetaken=(\d+)',rows[0]);identity=re.search(r'\b_id=(\d+)',rows[0])
        if not taken or not identity:return None
        millis=int(taken[1]);second=millis//1000
        unique=qa.command('shell','content','query','--uri','content://media/external/images/media','--projection','_id',
            '--where',f'"datetaken>={second*1000} AND datetaken<{(second+1)*1000}"')
        found=[line for line in unique.splitlines() if line.startswith('Row:')]
        if len(found)!=1 or not re.search(r'\b_id='+identity[1]+r'\b',found[0]):return None
        assert qa.command('shell','sha256sum',phone_path).split()[0]==hashlib.sha256(photo_path.read_bytes()).hexdigest()
        zone=qa.command('shell','getprop','persist.sys.timezone').strip()
        stamp=datetime.fromtimestamp(second,timezone.utc).astimezone(ZoneInfo(zone)).strftime('%Y-%m-%d %H:%M:%S')
        assert re.fullmatch(r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}',stamp)
        picker_identity={'file':photo_name,'mediaId':int(identity[1]),'takenAtMs':millis,'accessibilityTimestamp':stamp,
            'singleImageAtThisSecond':True,'phoneFileMatchesGeneratedSha256':True,'synthetic':True}
    candidates=[n for n in root.iter('node') if n.get('package')=='com.google.android.gms' and n.get('clickable')=='true' and
        picker_identity['accessibilityTimestamp'] in n.get('content-desc','')]
    if len(candidates)!=1:return None
    args.output.joinpath('exact-picker-identity.json').write_text(json.dumps(picker_identity,indent=2),encoding='utf-8')
    return candidates[0]

def pick_photo():
    tap('Chọn ảnh CCCD mặt trước');deadline=time.monotonic()+180;searched=False;drawer=False;warned=False;started=time.monotonic();external_seen=False
    while time.monotonic()<deadline:
        root=qa.tree()
        if qa.matches(root,'Xem lớn Giấy tờ đang chọn id_front'):
            # A cancelled picker must not be mistaken for a new selection.
            if not any(n.get('package') not in (module.PACKAGE,'com.android.systemui') for n in root.iter('node')):return
        if external_seen and any(n.get('package')==module.PACKAGE for n in root.iter('node')) and not any(n.get('package') not in (module.PACKAGE,'com.android.systemui') for n in root.iter('node')):
            reveal('Xem lớn Giấy tờ đang chọn id_front');return
        external=[n for n in root.iter('node') if n.get('package') not in (module.PACKAGE,'com.android.systemui') and len(bounds(n))==4 and bounds(n)[3]>bounds(n)[1]]
        if external:external_seen=True
        exact=[n for n in external if photo_name in n.get('text','')+n.get('content-desc','') or photo_name.removesuffix('.jpg')==n.get('text','')]
        if exact:tap_node(exact[0]);qa.wait('Thêm khách trong hợp đồng',timeout=90);reveal('Xem lớn Giấy tờ đang chọn id_front');return
        timestamp=exact_picker_timestamp(root)
        if timestamp is not None:tap_node(timestamp);qa.wait('Thêm khách trong hợp đồng',timeout=90);reveal('Xem lớn Giấy tờ đang chọn id_front');return
        files=[n for n in external if n.get('text') in ('Tệp','Files','Tệp của bạn','My Files')]
        if files and any(n.get('text') in ('Chỉ một lần','Just once') for n in external):
            tap_node(files[0]);root=qa.tree();once=[n for n in root.iter('node') if n.get('text') in ('Chỉ một lần','Just once')];
            if once:tap_node(once[0])
            continue
        documents=[n for n in external if 'documentsui' in n.get('package','') or 'myfiles' in n.get('package','')]
        search=[n for n in documents if n.get('content-desc') in ('Tìm kiếm','Search') or n.get('resource-id','').endswith('/menu_search')]
        if search and not searched:
            tap_node(search[0]);focus=qa.tree();fields=[n for n in focus.iter('node') if n.get('class')=='android.widget.EditText' and n.get('focused')=='true' and ('documentsui' in n.get('package','') or 'myfiles' in n.get('package',''))]
            if fields:
                qa.command('shell','input','text',photo_name.removesuffix('.jpg'));qa.command('shell','input','keyevent','66');searched=True
            continue
        roots=[n for n in documents if n.get('content-desc') in ('Show roots','Hiển thị thư mục','Mở từ')]
        if roots and not drawer:tap_node(roots[0]);drawer=True;continue
        downloads=[n for n in documents if n.get('text') in ('Downloads','Tải xuống','Bản tải xuống')]
        if drawer and downloads:tap_node(downloads[0]);drawer=False;continue
        if not warned and time.monotonic()-started>45:
            print('PICKER_NEEDS_EXACT_QA_SELECTION: '+photo_name+' — only this synthetic filename may be selected; no personal thumbnail is auto-tapped.',flush=True);warned=True
        time.sleep(.5)
    raise AssertionError('Native picker did not return the exact synthetic file '+photo_name+'; no unidentified thumbnail was selected')
def prepare_contract(number):
    qa.text("Số hợp đồng giấy",number);qa.hide_keyboard()
    qa.tap("Bước 3: Phương tiện");qa.wait("3. Phương tiện")
    tap("Thêm xe vào bản nháp");qa.tap("Chọn xe QA-003")
    qa.tap("Bước 4: Chi phí");qa.wait("4. Chi phí")
    qa.text("Tổng giá trị hợp đồng (VND)","1250000");qa.hide_keyboard()
    qa.tap("Bước 2: Khách hàng");qa.wait("2. Khách hàng");qa.tap("Thêm khách trong hợp đồng")
    reveal("Số CCCD/CMND")

def stage_save():
    qa.tap("Lưu ảnh vào đúng hồ sơ");qa.tap("Xác nhận lưu ảnh")

def codec(proof):
    raw=base64.b64decode(stats()['documentPhotos'][str(proof['id'])+':'+proof['slot']]['jpeg'])
    assert hashlib.sha256(raw).hexdigest()==proof['sha256'] and len(raw)==proof['bytes']<=2*1024*1024
    with Image.open(io.BytesIO(raw)) as image:
        image.load();assert image.format=='JPEG' and max(image.size)<=2200
        dimensions=list(image.size)
    qa.output.joinpath('native-jpeg-proof.json').write_text(json.dumps({'bytes':len(raw),'sha256':proof['sha256'],'decodedDimensions':dimensions,'sourceDimensions':[4200,2800],'fixtureOnly':True},indent=2),encoding='utf-8')

previous_routes = None
before_preserved = preserved()
try:
    initial = stats()
    assert initial["schema"] == "himoto.qa.contract-flow.v1"
    assert initial["customerCreates"] == 0 and initial["draftCreates"] == 0, "Use an unused QA checkpoint; do not reset written fixtures"
    assert not initial["duplicateProfiles"] and initial["documentWrites"] == 0
    print("Preparing verified Metro source before reading native UI.", flush=True)
    with urllib.request.urlopen("http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0", timeout=180) as reply:
        config = reply.read().decode()
    assert "http://127.0.0.1:8091" in config and "mobile-api.example.invalid" not in config
    with urllib.request.urlopen("http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable", timeout=600) as reply:
        entry = hashlib.file_digest(reply, "sha256").hexdigest()
    previous_routes = routes()
    qa.output.joinpath("usb-route.json").write_text(json.dumps({"before": previous_routes, "hostApiPort": args.fixture_port, "restored": False}), encoding="utf-8")
    qa.command("reverse", "tcp:8081", "tcp:8081")
    qa.command("reverse", "tcp:8091", f"tcp:{args.fixture_port}")
    qa.verify_device_network()
    qa.source_files = capture(qa, entry)
    qa.started_epoch = int(qa.command("shell", "date", "+%s").strip())
    qa.launch()
    root = qa.wait_any(["Đăng nhập", "Mở Đội xe"], timeout=180)
    if qa.matches(root, "Đăng nhập"):
        qa.text("Tài khoản", "qa")
        qa.command("shell", "input", "keyevent", "66")
        qa.text("Mật khẩu", "fixture-password")
        qa.hide_keyboard()
        qa.tap("Đăng nhập")
    qa.wait("Mở Đội xe", timeout=120)
    qa.tap("Tài khoản", bottom=True)
    reveal("Tải lại danh sách đối chiếu")
    qa.tap("Tải lại danh sách đối chiếu")
    qa.wait("Không có thao tác chờ đối chiếu trong phạm vi này.")
    qa.tap("Hợp đồng", bottom=True)
    qa.tap("Thêm bản nháp")
    qa.wait("1. Hợp đồng & pháp lý")
    create_photo()
    prepare_contract("93011")
    pick_photo()
    reveal("Họ và tên")
    qa.wait("DocumentQA",timeout=90)
    qa.text("Họ và tên","DocNativeQA",replace=True)
    qa.text("Số điện thoại","0901111111");qa.hide_keyboard();incomplete()
    mode("doc-lost");qa.tap("Lưu khách hàng")
    qa.wait("Hoàn tất ảnh khách hàng",timeout=90)
    assert stats()["customerCreates"]==1
    qa.tap("Quay lại biểu mẫu khách")
    qa.wait("Hoàn tất ảnh vào khách #100")
    tap("Tiếp tục lưu ảnh khách hàng")
    qa.wait("Hoàn tất ảnh khách hàng")
    stage_save()
    qa.wait("Ảnh đang chờ đối chiếu",timeout=90)
    qa.wait("QA mất phản hồi sau commit.",timeout=90)
    assert stats()["documentWrites"]==1
    tap("Đối chiếu ảnh với máy chủ")
    qa.wait("Xem lớn Giấy tờ đã lưu",timeout=90)
    qa.screenshot("01-original-document-receipt")
    tap("Đã kiểm tra phiếu ảnh")
    tap("Tải lại ô ảnh, giữ ảnh đang chọn")
    qa.tap("Tiếp tục với hồ sơ đã lưu")
    qa.wait("DocNativeQA")
    proof=next(iter(stats()["documentReceipts"].values()))["receipt"]
    codec(proof)
    qa.passed("Native exact synthetic picker downsamples/decode JPEG; OCR fills identity, profile locks before upload, and lost commit recovers one original document without recreating customer")
    qa.tap("Bước 1: Hợp đồng & pháp lý");reveal("Số hợp đồng giấy");qa.wait("93011")
    qa.tap("Bước 4: Chi phí");reveal("Tổng giá trị hợp đồng (VND)");qa.wait("1250000")
    qa.tap("Lưu nháp");qa.wait("Tiếp tục soạn hợp đồng",timeout=90)
    saved=stats()["drafts"][0]["input"]["draft"]
    assert saved["customer_id"]==100 and saved["customer"]["name"]=="DocNativeQA" and saved["vehicles"][0]["id"]=="303"
    assert saved["contract_number"]=="93011" and saved["total_amount"]=="1250000"
    qa.passed("Completing customer documents returns the exact saved customer to the unchanged native contract and saves one draft with the selected vehicle/money")
    request("/__fixture_duplicates",{})
    return_tabs();qa.tap("Hợp đồng",bottom=True);qa.tap("Thêm bản nháp");qa.wait("1. Hợp đồng & pháp lý")
    prepare_contract("93012")
    mode("ocr-failure");pick_photo()
    reveal("Chọn nhiều ảnh · AI đọc cùng lúc")
    qa.wait("QA không đọc được ảnh. Ảnh được giữ để nhập tay.",timeout=90)
    qa.text("Số CCCD/CMND","001234567890")
    qa.text("Họ và tên","DupDocNativeQA");qa.text("Số điện thoại","0901111111");qa.hide_keyboard();incomplete()
    qa.tap("Lưu khách hàng");qa.wait("Khách hàng đã tồn tại")
    tap("Dùng khách hàng #501");qa.wait("Hoàn tất ảnh khách hàng")
    mode("doc-drop");stage_save();qa.wait("Ảnh đang chờ đối chiếu",timeout=90)
    assert stats()["documentWrites"]==1
    tap("Đối chiếu ảnh với máy chủ");tap("Tải lại ô ảnh, giữ ảnh đang chọn")
    assert request("/__fixture_document_late",{})["lateStatus"]==409
    stage_save();qa.wait("LocalQA",timeout=90)
    qa.tap("Bước 4: Chi phí");qa.wait("4. Chi phí");qa.tap("Lưu nháp");qa.wait("Tiếp tục soạn hợp đồng",timeout=90)
    final=stats();saved=final["drafts"][1]["input"]["draft"]
    assert final["customerCreates"]==1 and final["documentWrites"]==2 and final["draftCreates"]==2
    assert saved["customer_id"]==501 and saved["vehicles"][0]["id"]=="303" and saved["total_amount"]=="1250000"
    assert final["documentReceipts"][proof["requestId"]]["receipt"]==proof
    qa.screenshot("02-duplicate-documents-returned")
    qa.passed("OCR failure preserves native photo/manual entry; duplicate choice retains image for exact existing profile, tombstones dropped upload before late409, and saves one intended replacement")
    return_tabs()
    qa.tap("Tài khoản", bottom=True)
    reveal("Tải lại danh sách đối chiếu")
    qa.tap("Tải lại danh sách đối chiếu")
    qa.wait("Không có thao tác chờ đối chiếu trong phạm vi này.")
    reveal("Đăng xuất")
    qa.tap("Đăng xuất")
    qa.wait("Đăng nhập")
    diagnostics = collect(qa, module.PACKAGE)
    assert not diagnostics["errors"] and diagnostics["newAppCrashes"] == diagnostics["newAppAnrs"] == diagnostics["newSystemUiAnrs"] == 0
    assert source_snapshot() == qa.source_files, "Source changed during native run"
    assert preserved() == before_preserved
    qa.output.joinpath("fixture-final.json").write_text(json.dumps(stats(), ensure_ascii=False, indent=2), encoding="utf-8")
    result = {"status": "passed", "passed": len(qa.checks), "checks": qa.checks, "fixtureOnly": True, "mode": "focused-customer-documents",
              "newAppCrashes": 0, "newAppAnrs": 0, "newSystemUiAnrs": 0, "operationalWrites": 0, "physicalDeviceTested": True,
              "fullAppCertified": False, "sourceFilesVerified": len(qa.source_files), "completedAt": datetime.now(timezone.utc).isoformat()}
    qa.output.joinpath("results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
except Exception as failure:
    result = {"status": "failed", "checks": qa.checks, "error": str(failure), "fixtureOnly": True, "completedAt": datetime.now(timezone.utc).isoformat()}
    qa.output.joinpath("results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        qa.screenshot("failure")
        qa.output.joinpath("fixture-failed.json").write_text(json.dumps(stats(), ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception: pass
    raise
finally:
    if previous_routes is not None:
        for port in ("tcp:8081", "tcp:8091"):
            if port in previous_routes: qa.command("reverse", port, previous_routes[port])
            else: qa.command("reverse", "--remove", port)
        restored = routes()
        qa.output.joinpath("usb-route.json").write_text(json.dumps({"before": previous_routes, "after": restored, "restored": restored == previous_routes}), encoding="utf-8")
        assert restored == previous_routes
