"""Samsung physical-recovery acceptance; durable synthetic transport only."""
import argparse
import hashlib
import importlib.util
import json
import re
import socket
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from lib.mobile_native_provenance import capture

parser = argparse.ArgumentParser(); parser.add_argument('--serial', required=True)
parser.add_argument('--fixture-port', type=int, default=8098); parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--contract-base', type=int, default=8100)
parser.add_argument('--recover-contract', type=int, help='Acknowledge exactly one known old committed recovery before the fresh dataset suite')
args = parser.parse_args()
if args.contract_base % 100 or not 8100 <= args.contract_base <= 9900: raise ValueError('Use a synthetic dataset base')
if not 1024 <= args.fixture_port <= 65535 or args.fixture_port in (8081, 8091, 8093, 8094, 8097): raise ValueError('Use an isolated recovery fixture port')
spec = importlib.util.spec_from_file_location('nativeqa', Path(__file__).with_name('check-mobile-native.py'))
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
qa = module.NativeQA(Path('E:/Android/Sdk/platform-tools/adb.exe'), args.serial, args.output, physical=True)
origin = f'http://127.0.0.1:{args.fixture_port}'
routes_before = None

def request(path, body=None):
    query = urllib.request.Request(origin+path, data=json.dumps(body).encode() if body is not None else None, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(query, timeout=8) as response: result = json.load(response)
    assert result['fixtureOnly'] is True
    return result

def stats(): return request('/__fixture_state')
def mapped(index): return args.contract_base+index-8100
def mode(value): assert request('/__fixture_mode', {'mode': value})['mode'] == value
def scope(all_stores): request('/__fixture_scope', {'actorId': 7, 'storeId': None if all_stores else 23, 'allStores': all_stores})
def reveal(label, upward_first=False):
    for upward in (upward_first, not upward_first):
        for _ in range(8):
            root = qa.tree()
            if any(int(re.findall(r'\d+', node.get('bounds'))[3])-int(re.findall(r'\d+', node.get('bounds'))[1]) >= 25 for node in qa.matches(root, label)): return
            _, _, width, height = map(int, re.findall(r'\d+', next(root.iter('node')).get('bounds')))
            start, end = (.35, .72) if upward else (.72, .35)
            qa.command('shell', 'input', 'swipe', str(width//2), str(int(height*start)), str(width//2), str(int(height*end)), '350')
    raise AssertionError('Native text/control not visible: '+label)
def preserved():
    checkpoint = Path('.backups/mobile-transfer-fixture-20261102/state.json')
    ports = {}
    for port in (8091, 8093, 8094, 8097):
        with socket.socket() as probe:
            probe.settimeout(1); ports[str(port)] = probe.connect_ex(('127.0.0.1', port)) == 0
    return {'transferCheckpointSha256': hashlib.sha256(checkpoint.read_bytes()).hexdigest(), 'oldPortsListening': ports}

def to_tabs():
    for _ in range(5):
        if qa.matches(qa.tree(), 'Tổng quan'): qa.tap('Tổng quan', bottom=True); return
        qa.back()
    raise AssertionError('Could not return to tabs')

def login():
    qa.wait('Đăng nhập'); qa.text('Tài khoản', 'qa'); qa.command('shell', 'input', 'keyevent', '66')
    qa.text('Mật khẩu', 'fixture-password'); qa.hide_keyboard(); qa.tap('Đăng nhập'); qa.wait('Mở Đội xe', timeout=180)

def open_record(index):
    index = mapped(index)
    qa.tap('Hợp đồng', bottom=True)
    if qa.matches(qa.tree(), 'Xóa tìm kiếm'): qa.tap('Xóa tìm kiếm')
    qa.text('Tìm hợp đồng', str(index)); qa.hide_keyboard()
    assert any(node.get('text') == str(index) for node in qa.matches(qa.tree(), 'Tìm hợp đồng')), 'Contract search must contain exactly the synthetic ID'
    qa.scroll_to(f'Xem HD-QA-{index}, Khách hợp đồng QA'); qa.tap(f'Xem HD-QA-{index}, Khách hợp đồng QA'); qa.wait('Chi tiết hợp đồng')

def open_editor(index, pending=False):
    open_record(index); qa.scroll_to('Thu hồi xe nợ xấu'); qa.tap('Thu hồi xe nợ xấu')
    qa.wait('Thu hồi xe đang chờ đối chiếu' if pending else '1. Chọn xe đã thu hồi')

def select(number=1):
    qa.scroll_to(f'Chọn thu hồi xe QA-RECOVER-{number}'); qa.tap(f'Chọn thu hồi xe QA-RECOVER-{number}')
    qa.scroll_to('Nhập ngày thu hồi'); qa.tap('Nhập ngày thu hồi'); qa.wait('2. Ngày thu hồi và ghi chú')

def prepare(note='Native-Recovery-QA'):
    select(); qa.scroll_to('Ghi chú thu hồi'); qa.text('Ghi chú thu hồi', note); qa.hide_keyboard(); review()

def review():
    qa.scroll_to('Rà soát thu hồi xe'); qa.tap('Rà soát thu hồi xe'); qa.wait('3. Rà soát thu hồi xe')

def commit():
    qa.scroll_to('Ghi thu hồi xe nợ xấu'); qa.tap('Ghi thu hồi xe nợ xấu'); qa.tap('Xác nhận ghi thu hồi xe')

def acknowledge():
    qa.scroll_to('Xác nhận đã kiểm tra phiếu thu hồi'); qa.tap('Xác nhận đã kiểm tra phiếu thu hồi')
    qa.wait('Chi tiết hợp đồng'); to_tabs()

def resolve():
    qa.tap('Đối chiếu thu hồi với máy chủ'); qa.tap('Đối chiếu với máy chủ')

def reverse_routes():
    result = {}
    for line in qa.command('reverse', '--list').splitlines():
        fields = line.split()
        if len(fields) == 3 and fields[1] in ('tcp:8081', 'tcp:8091'): result[fields[1]] = fields[2]
    return result

try:
    initial = stats()
    assert not any(args.contract_base < row['id'] < args.contract_base+100 for row in initial['receipts']), 'Use an untouched dataset; do not reset native evidence'
    assert not any(args.contract_base < int(row['operation'].split(':')[1]) < args.contract_base+100 for row in initial['tombstones']), 'Keep old tombstones and select a fresh dataset'
    initial_writes = initial['writes']
    baseline = preserved(); args.output.joinpath('preserved-fixtures-before.json').write_text(json.dumps(baseline, indent=2), encoding='utf-8')
    print('Prewarming current recovery source; no UI reader yet.', flush=True)
    with urllib.request.urlopen('http://127.0.0.1:8081/src/providers/session.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0', timeout=180) as response: config = response.read().decode('utf-8')
    assert re.search(r"apiOrigin[\s\S]{0,150}['\"]http://127\.0\.0\.1:8091['\"]", config) or re.search(r"['\"]EXPO_PUBLIC_API_URL['\"]:\s*\{[^}]{0,100}value:\s*['\"]http://127\.0\.0\.1:8091['\"]", config), 'Metro must compile the existing QA loopback origin'
    with urllib.request.urlopen('http://127.0.0.1:8081/src/components/bad-debt-recovery-editor.bundle?platform=android&dev=true&lazy=true&transform.engine=hermes&transform.bytecode=0', timeout=180) as response: editor = response.read().decode('utf-8')
    assert 'recoveryFormInput' in editor and 'review_snapshot' in editor
    with urllib.request.urlopen('http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable', timeout=600) as response: entry = hashlib.file_digest(response, 'sha256').hexdigest()
    routes_before = reverse_routes(); qa.command('reverse', 'tcp:8081', 'tcp:8081'); qa.command('reverse', 'tcp:8091', f'tcp:{args.fixture_port}')
    args.output.joinpath('usb-fixture-route.json').write_text(json.dumps({'previous': routes_before, 'phoneApiPort': 8091, 'hostFixturePort': args.fixture_port, 'restored': False}), encoding='utf-8')
    qa.verify_device_network(); qa.source_files = capture(qa, entry); qa.started_epoch = int(qa.command('shell', 'date', '+%s').strip())
    qa.launch(); tree = qa.wait_any(['Mở Đội xe', 'Đăng nhập'], timeout=180)
    if qa.matches(tree, 'Đăng nhập'): login()
    if args.recover_contract:
        originals = [row for row in initial['receipts'] if row['id'] == args.recover_contract and row['actorId'] == 7]
        assert len(originals) == 1, 'Recover only one exact known original proof'
        qa.tap('Tài khoản', bottom=True)
        label = f'Đối chiếu thu hồi xe nợ xấu #{args.recover_contract}'; qa.scroll_to(label); qa.tap(label); qa.tap('Đối chiếu với máy chủ')
        label = f'Mở kết quả thu hồi xe nợ xấu #{args.recover_contract}'; qa.scroll_to(label); qa.tap(label); qa.wait('Thu hồi xe đã được ghi nhận')
        qa.screenshot('00-prior-original-acknowledgement'); acknowledge(); assert stats()['writes'] == initial_writes
        args.output.joinpath('prior-recovery.json').write_text(json.dumps({'id': args.recover_contract, 'requestId': originals[0]['requestId'], 'acknowledged': True, 'partOfFreshSuite': False}), encoding='utf-8')
        print('Known prior proof acknowledged before the fresh dataset suite; no new business write.', flush=True)
    qa.wait('Mở Đội xe'); qa.tap('Tài khoản', bottom=True); qa.scroll_to('Tải lại danh sách đối chiếu'); qa.tap('Tải lại danh sách đối chiếu')
    qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.'); qa.tap('Tổng quan', bottom=True)
    open_editor(8101); qa.scroll_to('Trang xe thu hồi tiếp'); qa.tap('Trang xe thu hồi tiếp'); select(26)
    qa.scroll_to('Ngày thu hồi thực tế'); qa.tap('Ngày thu hồi thực tế'); qa.confirm_system_picker()
    qa.scroll_to('Giờ thu hồi thực tế'); qa.tap('Giờ thu hồi thực tế'); qa.confirm_system_picker()
    qa.scroll_to('Ghi chú thu hồi'); qa.text('Ghi chú thu hồi', 'QA-8101'); qa.hide_keyboard(); review()
    qa.scroll_to('Ghi thu hồi xe nợ xấu'); qa.tap('Ghi thu hồi xe nợ xấu'); qa.tap('Tiếp tục chỉnh sửa')
    reveal('3. Rà soát thu hồi xe', upward_first=True); qa.wait('3. Rà soát thu hồi xe'); assert stats()['writes'] == initial_writes
    qa.screenshot('01-paginated-readonly-review')
    qa.passed('Native line pagination, date/time pickers and note keyboard preserve a readonly review; cancelled confirmation creates no physical write')
    commit(); qa.wait('Thu hồi xe đã được ghi nhận', timeout=60)
    first = stats()['receipts'][-1]; assert first['review']['item']['license'] == 'QA-RECOVER-26' and first['event']['note'] == 'QA-8101'
    assert first['review']['before'] == {k: first['review']['after'][k] for k in first['review']['before']} and stats()['writes'] == initial_writes+1
    qa.screenshot('02-original-recovery-proof'); acknowledge()
    qa.passed('One confirmed recovery opens the original actor/vehicle/date/note receipt with identical frozen balances; explicit acknowledgement clears its key')
    open_editor(8102); prepare('Native-Ownership-Recovery'); commit(); qa.wait('Thu hồi xe đã được ghi nhận', timeout=60)
    ownership = stats()['receipts'][-1]
    assert ownership['review']['ownership'] and ownership['review']['billingStoppedAt'] == '2026-09-16T01:00:00.000Z'
    assert ownership['review']['after']['rentalRemaining'] == 1900000 and ownership['review']['after']['status'] == 'bad_debt'
    acknowledge(); qa.passed('Ownership recovery retains the original billing cutoff and outstanding debt after the last physical vehicle is recovered')
    open_editor(8103); prepare('Native-Settled-Recovery'); commit(); qa.wait('Thu hồi xe đã được ghi nhận', timeout=60)
    settled = stats()['receipts'][-1]; assert settled['review']['after']['status'] == 'completed' and settled['review']['after']['rentalRemaining'] == 0
    acknowledge(); qa.passed('A previously settled last vehicle completes the contract without an additional collection/refund')
    open_editor(8104); prepare('Native-Lost-Recovery'); mode('lose_response'); before = stats()['writes']; commit()
    qa.wait('Thu hồi xe đang chờ đối chiếu', timeout=60); assert stats()['writes'] == before+1
    lost = stats()['receipts'][-1]; lost_key = lost['requestId']; scope(True)
    request('/__fixture_corrections', {'flags': ['historyCurrent', 'moneyCurrent']})
    qa.launch(); qa.wait('Mở Đội xe', timeout=180); open_editor(8104, pending=True)
    qa.back(); qa.tap('Rời bước thu hồi xe'); qa.wait('Chi tiết hợp đồng'); to_tabs(); qa.tap('Tài khoản', bottom=True)
    label = f'Đối chiếu thu hồi xe nợ xấu #{mapped(8104)}'; qa.scroll_to(label); qa.tap(label); qa.tap('Đối chiếu với máy chủ')
    label = f'Mở kết quả thu hồi xe nợ xấu #{mapped(8104)}'; qa.scroll_to(label); qa.tap(label); qa.wait('Thu hồi xe đã được ghi nhận')
    reveal('Lịch sử thu hồi đã thay đổi sau khi ghi.'); qa.wait('Lịch sử thu hồi đã thay đổi sau khi ghi.')
    reveal('Số dư hoặc lịch sử tiền đã thay đổi sau khi ghi.'); qa.wait('Số dư hoặc lịch sử tiền đã thay đổi sau khi ghi.')
    assert stats()['writes'] == before+1 and stats()['receipts'][-1] == lost
    qa.screenshot('03-lost-commit-scope-original'); acknowledge(); request('/__fixture_corrections', {'flags': []}); scope(False)
    qa.launch(); qa.wait('Mở Đội xe', timeout=180)
    qa.passed('Lost commit response survives force-stop and scope change; Account recovers the same SecureStore UUID and original proof with independent later-history/money warnings')
    open_editor(8105); prepare('Native-Unsent-Recovery'); mode('drop'); before = stats()['writes']; commit()
    qa.wait('Thu hồi xe đang chờ đối chiếu', timeout=60); assert stats()['writes'] == before
    qa.launch(); qa.wait('Mở Đội xe', timeout=180); open_editor(8105, pending=True); resolve(); qa.wait('1. Chọn xe đã thu hồi')
    assert request('/__fixture_deliver_late', {})['lateStatus'] == 409
    prepare('Native-After-Tombstone'); commit(); qa.wait('Thu hồi xe đã được ghi nhận', timeout=60); acknowledge()
    qa.passed('A dropped request is recovered after force-stop and tombstoned before a fresh review; late delivery is rejected and one new confirmation records one recovery')
    open_editor(8106); prepare('Native-Conflict-Recovery'); mode('conflict'); before = stats()['writes']; commit()
    qa.wait('Thu hồi xe đang chờ đối chiếu', timeout=60); assert stats()['writes'] == before
    resolve(); qa.wait('2. Ngày thu hồi và ghi chú'); qa.scroll_to('Tải lại xe cần thu hồi'); qa.tap('Tải lại xe cần thu hồi'); qa.tap('Tải lại và chọn lại xe')
    qa.wait('1. Chọn xe đã thu hồi'); select(); review(); commit(); qa.wait('Thu hồi xe đã được ghi nhận', timeout=60); acknowledge()
    qa.passed('A post-review revision conflict remains pending until server cancellation; explicit refresh/reselection commits the current revision without losing the entered note')
    open_editor(8107); prepare('Native-Cross-Return-Lock'); mode('drop'); before = stats()['writes']; commit(); qa.wait('Thu hồi xe đang chờ đối chiếu', timeout=60)
    request('/__fixture_contract_status', {'id': mapped(8107), 'status': 'renting'}); qa.launch(); qa.wait('Mở Đội xe', timeout=180); open_record(8107)
    qa.scroll_to('Trả xe và quyết toán'); qa.tap('Trả xe và quyết toán'); qa.wait('Kiểm tra thao tác trên thiết bị'); qa.wait('Mở Tài khoản để đối chiếu')
    qa.back(); qa.wait('Chi tiết hợp đồng'); qa.scroll_to('Đổi xe trong hợp đồng'); qa.tap('Đổi xe trong hợp đồng'); qa.wait('Kiểm tra thao tác trên thiết bị')
    qa.tap('Mở Tài khoản để đối chiếu'); label = f'Đối chiếu thu hồi xe nợ xấu #{mapped(8107)}'; qa.scroll_to(label); qa.tap(label); qa.tap('Đối chiếu với máy chủ')
    qa.wait('Không có thao tác chờ đối chiếu trong phạm vi này.'); assert stats()['writes'] == before and request('/__fixture_deliver_late', {})['lateStatus'] == 409
    qa.screenshot('04-cross-action-lock'); to_tabs()
    qa.passed('One unresolved recovery blocks both return and swap editors after process restart; Account reconciles its original action/UUID before another contract intent can start')
    assert stats()['writes'] == initial_writes+6 and stats()['receipts'][:len(initial['receipts'])] == initial['receipts']
    qa.finish(); result = json.loads((args.output/'results.json').read_text(encoding='utf-8'))
    after = preserved(); assert after == baseline
    args.output.joinpath('preserved-fixtures-after.json').write_text(json.dumps(after, indent=2), encoding='utf-8')
    result.update(mode='focused-bad-debt-recovery', fixturePort=args.fixture_port, contractBase=args.contract_base, priorReceiptsUnchanged=True, oldFixtureCheckpointUnchanged=True,
                  scope='recovery editor/receipt, ownership/settled, lost response/scope, tombstones, conflicts, cross-return/swap lock and session restore/logout')
    (args.output/'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
except Exception as failure:
    result = {'status': 'failed', 'completedGroups': len(qa.checks), 'checks': qa.checks, 'error': str(failure), 'mode': 'focused-bad-debt-recovery',
              'fixturePort': args.fixture_port, 'startedEpoch': qa.started_epoch, 'fixtureOnly': True, 'operationalWrites': 0, 'completedAt': datetime.now(timezone.utc).isoformat()}
    try: result['diagnostics'] = module.collect_diagnostics(qa, module.PACKAGE)
    except Exception as error: result['diagnosticsError'] = type(error).__name__
    (args.output/'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    try: qa.screenshot('failure')
    except RuntimeError: pass
    raise
finally:
    if routes_before is not None:
        for local in ('tcp:8081', 'tcp:8091'):
            if local in routes_before: qa.command('reverse', local, routes_before[local])
            else: qa.command('reverse', '--remove', local)
        args.output.joinpath('usb-fixture-route.json').write_text(json.dumps({'previous': routes_before, 'restored': reverse_routes() == routes_before}), encoding='utf-8')
