"""Samsung media editor/picker/recovery acceptance; durable synthetic API only."""
import argparse,base64,hashlib,importlib.util,io,json,re,socket,time,urllib.request,xml.etree.ElementTree as ET
from datetime import datetime,timezone
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from lib.mobile_native_provenance import capture

parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);parser.add_argument('--fixture-port',type=int,default=8099)
parser.add_argument('--output',type=Path,required=True);parser.add_argument('--dataset-base',type=int,default=9100);parser.add_argument('--picker-timeout',type=int,default=600)
parser.add_argument('--recover-contract',type=int,help='Reconcile only a known original QA contract receipt before starting the untouched dataset')
parser.add_argument('--ledger-only',action='store_true',help='Read Account pending ledger on an existing dataset; never pick/upload/resolve an image')
args=parser.parse_args()
if args.dataset_base%100 or not 9000<=args.dataset_base<=9900:raise ValueError('Use an unused synthetic dataset base')
if args.fixture_port in (8081,8091,8093,8094,8097,8098) or not 1024<=args.fixture_port<=65535:raise ValueError('Use an isolated media fixture port')
if args.ledger_only and args.recover_contract:raise ValueError('Ledger verification must not acknowledge or reconcile existing requests')
spec=importlib.util.spec_from_file_location('nativeqa',Path(__file__).with_name('check-mobile-native.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
qa=module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'),args.serial,args.output,physical=True)
original_tree=qa.tree
def checked_tree():
    root=original_tree()
    fatal=[n.get('text') for n in root.iter('node') if n.get('package')==module.PACKAGE and n.get('text') in ('Console Error','Render Error','Uncaught Error','Text strings must be rendered within a <Text> component.')]
    if fatal:
        args.output.joinpath('native-error-overlay.xml').write_text(ET.tostring(root,encoding='unicode'),encoding='utf-8')
        raise AssertionError('Native runtime error overlay; no further UI action is allowed: '+'; '.join(fatal))
    return root
qa.tree=checked_tree
origin=f'http://127.0.0.1:{args.fixture_port}';routes_before=None;contract=args.dataset_base+1;vehicle=args.dataset_base+2
def request(path,body=None):
    req=urllib.request.Request(origin+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=8) as response:result=json.load(response)
    assert result['fixtureOnly'];return result
def stats():return request('/__fixture_state')
def mode(value):assert request('/__fixture_mode',{'mode':value})['mode']==value
def scope(value):request('/__fixture_scope',{'actorId':7,'allStores':value})
def preserved():
    result={'ports':{},'checkpoints':{}}
    for port in (8091,8093,8094,8097,8098):
        with socket.socket() as s:s.settimeout(1);result['ports'][str(port)]=s.connect_ex(('127.0.0.1',port))==0
    for name in ('mobile-transfer-fixture-20261102','mobile-recovery-fixture-20261102'):
        p=Path('.backups')/name/'state.json';assert p.is_file();result['checkpoints'][name]=hashlib.sha256(p.read_bytes()).hexdigest()
    return result
def reverse_routes():
    result={}
    for line in qa.command('reverse','--list').splitlines():
        fields=line.split()
        if len(fields)==3 and fields[1] in ('tcp:8081','tcp:8091'):result[fields[1]]=fields[2]
    return result
def bounds(node):return list(map(int,re.findall(r'-?\d+',node.get('bounds',''))))
def tap_node(node):
    x1,y1,x2,y2=bounds(node);assert x2>x1 and y2>y1;qa.command('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
def reveal(label,upward_first=False):
    for upward in (upward_first,not upward_first):
        for _ in range(16):
            root=qa.tree()
            if any(bounds(n)[3]-bounds(n)[1]>=25 for n in qa.matches(root,label)):return
            _,_,w,h=bounds(next(root.iter('node')));start,end=(.35,.72) if upward else (.72,.35)
            qa.command('shell','input','swipe',str(w//2),str(int(h*start)),str(w//2),str(int(h*end)),'350')
    raise AssertionError('Native media text/control not visible: '+label)
def tap(label):reveal(label);qa.tap(label)
def to_tabs():
    for _ in range(5):
        if qa.matches(qa.tree(),'Tổng quan'):qa.tap('Tổng quan',bottom=True);return
        qa.back()
    raise AssertionError('Could not return to tabs')
def login():
    qa.wait('Đăng nhập');qa.text('Tài khoản','qa');qa.command('shell','input','keyevent','66');qa.text('Mật khẩu','fixture-password');qa.hide_keyboard();qa.tap('Đăng nhập');qa.wait('Mở Đội xe',timeout=180)
def open_record(entity='contracts'):
    index=contract if entity=='contracts' else vehicle;qa.tap('Hợp đồng' if entity=='contracts' else 'Đội xe',bottom=True)
    if qa.matches(qa.tree(),'Xóa tìm kiếm'):qa.tap('Xóa tìm kiếm')
    qa.text('Tìm hợp đồng' if entity=='contracts' else 'Tìm đội xe',str(index) if entity=='contracts' else f'QA-MEDIA-{index}');qa.hide_keyboard()
    tap(f'Xem HD-MEDIA-{index}, Khách media QA' if entity=='contracts' else f'Xem QA-MEDIA-{index}, Xe media QA')
    qa.wait('Chi tiết hợp đồng' if entity=='contracts' else 'Chi tiết xe');tap('Ảnh và hồ sơ nghiệp vụ')
def open_target(kind):
    open_record('vehicles' if kind in ('transfer','receive') else 'contracts');qa.wait('Ảnh và hồ sơ nghiệp vụ')
    if kind=='return':tap('Trang hồ sơ ảnh tiếp');tap(f'Trả xe · QA-MEDIA-1 · #{args.dataset_base*10+1}')
    else:tap({'swap':f'Đổi xe · QA-CŨ → QA-MỚI · #{args.dataset_base+30}','transfer':f'Chuyển xe · QA-MEDIA · #{args.dataset_base+40}','receive':f'Nhận xe · QA-MEDIA · #{args.dataset_base+41}'}[kind])
def choose(label):tap('Chọn mục ảnh hoặc video');tap('Chọn mục '+label)
def leave():qa.back();qa.tap('Rời ảnh hồ sơ');qa.wait_any(['Chi tiết hợp đồng','Chi tiết xe']);to_tabs()
def prepare():tap('Rà soát ảnh hồ sơ');qa.wait('Rà soát ảnh trước khi lưu')
def commit():tap('Lưu ảnh hồ sơ');qa.tap('Xác nhận lưu ảnh hồ sơ')
def acknowledge():tap('Xác nhận đã kiểm tra phiếu lưu ảnh');qa.wait_any(['Chi tiết hợp đồng','Chi tiết xe']);to_tabs()

photo_name='Himoto-Media-QA-'+str(time.time_ns())+'.jpg';phone_path='/sdcard/Download/'+photo_name;photo_path=args.output/'synthetic-native-picker.jpg'
def create_photo():
    image=Image.new('RGB',(4200,2800),'#f2f5f8');draw=ImageDraw.Draw(image);font=ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf',145)
    draw.rectangle((180,500,4020,2300),outline='#bb1730',width=32)
    for y,line in [(900,'HIMOTO MEDIA QA'),(1250,'SYNTHETIC PHOTO ONLY'),(1600,str(args.dataset_base))]:draw.text((360,y),line,fill='#bb1730',font=font)
    image.save(photo_path,format='JPEG',quality=92);qa.command('push',str(photo_path),phone_path)
    qa.command('shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file://'+phone_path)
    args.output.joinpath('created-qa-media.json').write_text(json.dumps({'path':phone_path,'local':str(photo_path),'synthetic':True,'originalDimensions':[4200,2800]}),encoding='utf-8')
def pick_photo():
    tap('Chọn ảnh hồ sơ');deadline=time.monotonic()+args.picker_timeout;searched=False;drawer=False;warned=False;started=time.monotonic()
    while time.monotonic()<deadline:
        root=qa.tree()
        if qa.matches(root,'Xem lớn Ảnh hồ sơ đang chọn'):
            # A cancelled picker must not be mistaken for a new selection.
            if not any(n.get('package') not in (module.PACKAGE,'com.android.systemui') for n in root.iter('node')):return
        external=[n for n in root.iter('node') if n.get('package') not in (module.PACKAGE,'com.android.systemui') and len(bounds(n))==4 and bounds(n)[3]>bounds(n)[1]]
        exact=[n for n in external if photo_name in n.get('text','')+n.get('content-desc','') or photo_name.removesuffix('.jpg')==n.get('text','')]
        if exact:tap_node(exact[0]);qa.wait('Xem lớn Ảnh hồ sơ đang chọn',timeout=90);return
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
def assert_codec(proof):
    state_file=Path('.backups/mobile-media-fixture-20261102/state.json');state=json.loads(state_file.read_text(encoding='utf-8'))['state']
    blob=base64.b64decode(state['blobs'][proof['sha256']]);assert hashlib.sha256(blob).hexdigest()==proof['sha256'] and len(blob)==proof['bytes']<=2*1024*1024
    image=Image.open(io.BytesIO(blob));image.load();assert image.format=='JPEG' and max(image.size)<=2200 and min(image.size)>0
    return{'sha256':proof['sha256'],'bytes':len(blob),'width':image.width,'height':image.height,'fullPixelDecode':True}

def finish(additional_writes,ledger_only=False):
    final=stats();assert final['writes']==initial['writes']+additional_writes and final['receipts'][:len(initial['receipts'])]==initial['receipts'] and final['tombstones'][:len(initial['tombstones'])]==initial['tombstones']
    qa.finish();result=json.loads((args.output/'results.json').read_text(encoding='utf-8'));assert result['newSystemUiAnrs']==0 and preserved()==baseline
    args.output.joinpath('preserved-fixtures-after.json').write_text(json.dumps(preserved(),indent=2),encoding='utf-8');args.output.joinpath('fixture-final.json').write_text(json.dumps(stats(),ensure_ascii=False,indent=2),encoding='utf-8')
    result.update(mode='focused-record-media-ledger' if ledger_only else 'focused-record-media',fixturePort=args.fixture_port,datasetBase=args.dataset_base,priorFixturesUnchanged=True,priorMediaProofsUnchanged=True,nativeErrorOverlayObserved=False,
      scope='native Account empty pending ledger, Keystore session/relaunch/logout; no media mutation' if ledger_only else 'native system picker/prepared JPEG, exact return/swap/transfer/receive images, original receipt, scope/process recovery, tombstone/late409, empty ledger/session/logout; camera/iPhone not certified')
    (args.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print('Media native acceptance complete.',flush=True)

try:
    initial=stats()
    if not args.ledger_only:assert not any(r['id'] in (contract,vehicle) for r in initial['receipts']) and not any(r['operation'].endswith(':'+str(contract)) or r['operation'].endswith(':'+str(vehicle)) for r in initial['tombstones']),'Use an untouched media dataset; never reset old proof'
    baseline=preserved();args.output.joinpath('preserved-fixtures-before.json').write_text(json.dumps(baseline,indent=2),encoding='utf-8')
    print('Prewarming verified Metro media source; no UI reader yet.',flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0',timeout=180) as response:config=response.read().decode()
    assert re.search(r"apiOrigin[\s\S]{0,150}['\"]http://127\.0\.0\.1:8091['\"]",config) or re.search(r"['\"]EXPO_PUBLIC_API_URL['\"]:\s*\{[^}]{0,100}value:\s*['\"]http://127\.0\.0\.1:8091['\"]",config)
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable',timeout=600) as response:entry=hashlib.file_digest(response,'sha256').hexdigest()
    routes_before=reverse_routes();qa.command('reverse','tcp:8081','tcp:8081');qa.command('reverse','tcp:8091',f'tcp:{args.fixture_port}')
    args.output.joinpath('usb-fixture-route.json').write_text(json.dumps({'previous':routes_before,'phoneApiPort':8091,'hostFixturePort':args.fixture_port,'restored':False}),encoding='utf-8')
    qa.verify_device_network();qa.source_files=capture(qa,entry);qa.started_epoch=int(qa.command('shell','date','+%s').strip())
    if not args.ledger_only:create_photo()
    qa.launch();root=qa.wait_any(['Mở Đội xe','Đăng nhập'],timeout=180)
    if qa.matches(root,'Đăng nhập'):login()
    qa.tap('Tài khoản',bottom=True);tap('Tải lại danh sách đối chiếu')
    if args.recover_contract:
        old=[r for r in initial['receipts'] if r['actorId']==7 and r['target']['entity']=='contracts' and r['id']==args.recover_contract];assert len(old)==1,'Recovery requires one exact original QA receipt'
        label=f'lưu ảnh hợp đồng #{args.recover_contract}';root=qa.tree()
        if qa.matches(root,'Đối chiếu '+label):
            tap('Đối chiếu '+label);qa.tap('Đối chiếu với máy chủ');tap('Mở kết quả '+label);qa.wait('Ảnh đã được lưu vào hồ sơ');reveal('Mã '+old[0]['requestId']);qa.screenshot('00-preserved-original-receipt');acknowledge();qa.tap('Tài khoản',bottom=True);tap('Tải lại danh sách đối chiếu')
        assert stats()['writes']==initial['writes'] and stats()['receipts']==initial['receipts'],'Original proof must remain unchanged during ledger acknowledgement'
        qa.passed('Any retained prior QA contract key resolves through Account to its exact original receipt before acknowledgement; every old receipt remains unchanged and no image is uploaded')
    qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.')
    if args.ledger_only:
        qa.screenshot('01-empty-native-ledger');qa.passed('Native Account explicitly confirms the durable pending ledger is empty; all old media receipts/tombstones remain intact with zero media writes')
        finish(0,True);raise SystemExit(0)
    qa.tap('Tổng quan',bottom=True)
    open_target('return');tap('Mở mục Toàn cảnh xe');tap('Thêm ảnh cùng mục, giữ ảnh hiện tại');reveal('Toàn cảnh xe · Ảnh 13');qa.wait('Toàn cảnh xe · Ảnh 13')
    pick_photo();prepare();tap('Lưu ảnh hồ sơ');qa.tap('Tiếp tục chỉnh sửa');reveal('Rà soát ảnh trước khi lưu',upward_first=True);assert stats()['writes']==initial['writes'];qa.screenshot('01-native-readonly-review')
    qa.passed('Native discovery chooses exact line/group supplemental slot13; system picker and prepared image review with cancelled confirmation create no request/photo write')
    commit();qa.wait('Ảnh đã được lưu vào hồ sơ',timeout=90);first=stats()['receipts'][-1];assert first['slot']==f'return-{args.dataset_base*10+1}-1-extra-13';codec=assert_codec(first)
    args.output.joinpath('native-prepared-codec.json').write_text(json.dumps(codec,indent=2),encoding='utf-8');qa.screenshot('02-native-photo-original');acknowledge()
    qa.passed('One confirmed native JPEG is downsampled to bounded dimensions/bytes, fully decoded from committed transport bytes and displayed from its exact server revision before acknowledgement')
    open_target('swap');choose('Ảnh đổi xe 1');pick_photo();prepare();mode('lost');before=stats()['writes'];commit();qa.wait('Ảnh đang chờ đối chiếu',timeout=90);assert stats()['writes']==before+1;lost=stats()['receipts'][-1];scope(True)
    qa.launch();qa.wait('Mở Đội xe',timeout=180);open_record();qa.wait('Ảnh đang chờ đối chiếu');leave();qa.tap('Tài khoản',bottom=True)
    tap(f'Đối chiếu lưu ảnh hợp đồng #{contract}');qa.tap('Đối chiếu với máy chủ');tap(f'Mở kết quả lưu ảnh hợp đồng #{contract}');qa.wait('Ảnh đã được lưu vào hồ sơ');assert stats()['writes']==before+1 and stats()['receipts'][-1]==lost
    qa.screenshot('03-native-swap-lost-original');acknowledge();scope(False);qa.launch();qa.wait('Mở Đội xe',timeout=180)
    qa.passed('Lost swap-image commit locks every media target on the contract through force-stop/scope change; Account restores the same SecureStore UUID and original receipt without uploading twice')
    open_target('transfer');choose('Ảnh chuyển xe');pick_photo();prepare();mode('drop');before=stats()['writes'];commit();qa.wait('Ảnh đang chờ đối chiếu',timeout=90);assert stats()['writes']==before
    qa.launch();qa.wait('Mở Đội xe',timeout=180);open_record('vehicles');qa.wait('Ảnh đang chờ đối chiếu');tap('Đối chiếu lưu ảnh với máy chủ');qa.tap('Đối chiếu với máy chủ');qa.wait('Ảnh và hồ sơ nghiệp vụ');assert request('/__fixture_late',{})['lateStatus']==409
    tap(f'Chuyển xe · QA-MEDIA · #{args.dataset_base+40}');choose('Ảnh chuyển xe');pick_photo();prepare();commit();qa.wait('Ảnh đã được lưu vào hồ sơ',timeout=90);assert stats()['receipts'][-1]['target']['kind']=='transfer' and stats()['writes']==before+1;acknowledge()
    qa.passed('Unsent vehicle image survives force-stop as the original pending UUID; durable cancellation blocks late delivery before a fresh native review records one exact transfer image')
    open_target('receive');choose('Ảnh nhận xe');pick_photo();prepare();commit();qa.wait('Ảnh đã được lưu vào hồ sơ',timeout=90);last=stats()['receipts'][-1];assert last['target']['kind']=='receive' and last['slot']==f'receive-{args.dataset_base+41}-1';assert_codec(last);qa.screenshot('04-native-receive-original');acknowledge()
    qa.passed('A separately saved receive event has its own native picker/review/image/receipt and correct vehicle ledger operation, distinct from the transfer image')
    qa.tap('Tài khoản',bottom=True);tap('Tải lại danh sách đối chiếu');qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.');qa.screenshot('04-empty-native-ledger')
    qa.passed('Native Account pending ledger is empty after all four acknowledged media targets')
    finish(4)
except Exception as failure:
    result={'status':'failed','completedGroups':len(qa.checks),'checks':qa.checks,'error':str(failure),'mode':'focused-record-media-ledger' if args.ledger_only else 'focused-record-media','fixturePort':args.fixture_port,'datasetBase':args.dataset_base,'startedEpoch':qa.started_epoch,'fixtureOnly':True,'operationalWrites':0,'completedAt':datetime.now(timezone.utc).isoformat()}
    try:result['diagnostics']=module.collect_diagnostics(qa,module.PACKAGE)
    except Exception as error:result['diagnosticsError']=type(error).__name__
    (args.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    try:qa.screenshot('failure')
    except RuntimeError:pass
    raise
finally:
    if routes_before is not None:
        for local in ('tcp:8081','tcp:8091'):
            if local in routes_before:qa.command('reverse',local,routes_before[local])
            else:qa.command('reverse','--remove',local)
        args.output.joinpath('usb-fixture-route.json').write_text(json.dumps({'previous':routes_before,'restored':reverse_routes()==routes_before}),encoding='utf-8')
