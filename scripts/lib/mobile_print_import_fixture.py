"""Read-only native module portfolios; never accepts import/delete submissions."""
import base64
import hashlib
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse, parse_qs


def video_response(path, method):
    """Synthetic read-only playback portfolio; rejects all video submissions."""
    parsed = urlparse(path)
    prefix = '/api/mobile/v1/record-media/contracts/9301'
    if not parsed.path.startswith(prefix):
        return None
    if method != 'GET':
        return 400, {'message': 'QA chỉ xem video; không nhận ghi hoặc tải tệp.', 'code': 'QA_VIDEO_READ_ONLY'}, False
    target = {'entity': 'contracts', 'id': 9301, 'kind': 'rental', 'referenceId': 9301, 'revision': '100', 'referenceRevision': '100', 'label': 'Ảnh lập hợp đồng / giao xe'}
    target['snapshot'] = hashlib.sha256(json_bytes(target)).hexdigest()
    now = datetime.now(timezone.utc).isoformat()
    data = Path('.backups/browser-video-20261025/fixtures/silent.mp4').read_bytes()
    row = {'slot': 'rental-video-1', 'label': 'Video tình trạng xe 1', 'revision': '101', 'mimeType': 'video/mp4', 'bytes': len(data), 'updatedAt': '2026-11-04T04:00:00Z', 'kind': 'video', 'readable': True, 'blockedReason': None}
    slots = [{'slot': f'{phase}-video-{n}', 'label': f'Video {"lập hợp đồng" if phase == "rental" else "giao xe"} {n}', 'kind': 'video'} for phase in ('rental', 'handover') for n in range(1, 4)]
    if parsed.path == prefix:
        return 200, {'entity': 'contracts', 'id': 9301, 'page': 1, 'hasMore': False, 'rows': [target], 'observedAt': now}, False
    exact = prefix + '/rental/9301'
    if parsed.path == exact:
        return 200, {'target': target, 'slots': slots, 'page': 1, 'hasMore': False, 'rows': [row], 'observedAt': now}, False
    if parsed.path == exact + '/rental-video-1':
        return 200, {'target': target, 'slot': row['slot'], 'label': row['label'], 'photo': row, 'nextSlot': None, 'observedAt': now}, False
    if parsed.path == exact + '/rental-video-1/video' and parse_qs(parsed.query) == {'revision': ['101']}:
        return 200, {'_bytesBase64': base64.b64encode(data).decode(), 'mimeType': 'video/mp4'}, False
    return 404, {'message': 'QA chỉ có mục video tổng hợp đầu tiên.', 'code': 'NOT_FOUND'}, False


def json_bytes(value):
    import json
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()


def response(path, method, body, headers, state):
    w = state.get('print_import_workspace')
    token = (headers.get('Authorization') or headers.get('authorization', '')).removeprefix('Bearer ')
    if not w or token not in state['sessions']:
        return None
    video = video_response(path, method)
    if video:
        return video
    route = urlparse(path).path
    if method == 'GET' and route == '/api/mobile/v1/contracts/9301/print':
        return 200, {**deepcopy(w['print']), 'generatedAt': datetime.now(timezone.utc).isoformat()}, False
    if method == 'GET' and route == '/api/mobile/v1/contracts/9301/payment-qr':
        return 200, deepcopy(w['qr']), False
    if route.startswith('/api/mobile/v1/imports/vehicles'):
        v = w['vehicles']
        if method == 'GET':
            if route.endswith('/options'):
                return 200, deepcopy(v['options']), False
            if route.endswith('/template'):
                return 200, deepcopy(v['template']), False
            if route.endswith('/reset'):
                return 200, deepcopy(v['reset']), False
            if '/requests/' in route:
                return 200, {'receipt': None}, False
        if method == 'POST' and route.endswith('/file'):
            data = base64.b64decode(body.get('jpeg', ''), validate=True)
            if hashlib.sha256(data).hexdigest() != w['workbookSha256']:
                return 400, {'message': 'Chỉ chọn file Excel tổng hợp của lượt kiểm tra này.', 'code': 'QA_FILE_MISMATCH'}, False
            workbook = deepcopy(v['workbook'])
            workbook['filename'] = w['workbookName']
            return 200, workbook, False
        if method == 'POST' and route.endswith('/preview'):
            if body.get('mode') != 'sync' or body.get('rows') != v['workbook']['rows']:
                return 400, {'message': 'Portfolio chỉ xem các dòng từ SQL; đổi chế độ hoặc dữ liệu kiểm bằng suite riêng.', 'code': 'QA_PREVIEW_LIMIT'}, False
            return 200, deepcopy(v['filePreview']), False
        if method == 'POST' and route.endswith('/normalized'):
            return 200, deepcopy(v['normalized']), False
        return 400, {'message': 'Portfolio native chỉ xem và hủy xác nhận, không nhập hoặc xóa xe.', 'code': 'QA_IMPORT_READ_ONLY'}, False
    return None
