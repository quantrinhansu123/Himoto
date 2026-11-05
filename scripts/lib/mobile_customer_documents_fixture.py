"""Synthetic customer-document/OCR transport. No DB, providers or real identities."""
import base64
import hashlib
import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs, unquote
from lib.mobile_customer_matches_fixture import can_edit

MODES = ('doc-lost', 'doc-drop', 'doc-conflict', 'ocr-failure')
def now(): return datetime.now(timezone.utc).isoformat()
def summary(state):
    return {'documentWrites': state.get('document_writes', 0), 'documentReceipts': deepcopy(state.get('document_receipts', {})),
            'documentPhotos': deepcopy(state.get('document_photos', {})), 'ocrCalls': state.get('ocr_calls', 0)}


def document_response(path, method, body, headers, state):
    url = urlparse(path)
    user = state.get('user', {'id': 7, 'permissions': ['customers.read', 'customers.write'], 'storeId': 23, 'allStores': False, 'role': 'branch_manager'})
    headers = {key.lower(): value for key, value in headers.items()}
    if url.path == '/api/mobile/v1/customers/documents/ocr' and method == 'POST':
        if 'customers.write' not in user['permissions']:
            return 403, {'code': 'FORBIDDEN', 'message': 'QA OCR denied'}, False
        state['ocr_calls'] = state.get('ocr_calls', 0) + 1
        if state.get('mode') == 'ocr-failure' or state.pop('ocr_failure', False):
            state['mode'] = 'none'
            return 503, {'code': 'OCR_UNAVAILABLE', 'message': 'QA không đọc được ảnh. Ảnh được giữ để nhập tay.'}, False
        kind, expected = headers.get('x-photo-kind'), headers.get('x-expected-identity', '')
        fields = {'driver_license_number': 'QA-LICENSE', 'driver_license_issued_on': '2020-01-01'} if kind == 'driver_license' else {
            'id_card': '001234567890', 'name': 'DocumentQA', 'id_card_issued_on': '2020-01-01', 'id_card_issued_by': 'QA issuer'}
        if kind == 'cccd_back': fields.pop('name', None)
        return 200, {'requestId': headers['x-ocr-request'], 'kind': kind, 'expectedIdentity': expected,
                     'fields': state.get('ocr_fields', fields), 'warnings': []}, False
    match = re.fullmatch(r'/api/mobile/v1/record-media/customers/([1-9][0-9]*)(?:/customer/([1-9][0-9]*)(?:/([^/]+))?)?', unquote(url.path))
    if url.path.startswith('/api/mobile/v1/record-media/requests/'):
        key = url.path.rsplit('/', 1)[1]
        previous = state.get('document_receipts', {}).get(key)
        if previous:
            return 200, {'receipt': {**deepcopy(previous['receipt']), 'replayed': True}}, False
        return None
    if not match: return None
    index, reference, slot = match.groups()
    index = int(index)
    profile = {**state.get('profiles', {}), **state.get('duplicate_profiles', {})}.get(index)
    if not profile:
        return 404, {'code': 'NOT_FOUND', 'message': 'QA profile missing'}, False
    writable = can_edit(profile, user)
    target = {'entity': 'customers', 'id': index, 'kind': 'customer', 'referenceId': index,
              'revision': profile['revision'], 'referenceRevision': profile['revision'], 'label': 'Giấy tờ khách · ' + profile['name'], 'canWrite': writable}
    target['snapshot'] = hashlib.sha256(json.dumps(target, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
    slots = [{'slot': name, 'label': label, 'kind': 'image'} for name, label in (
        ('id_front', 'CCCD mặt trước / trang hộ chiếu'), ('id_back', 'CCCD mặt sau / trang bổ sung'), ('driver_license', 'Giấy phép lái xe'))]
    if reference is None:
        return 200, {'entity': 'customers', 'id': index, 'page': 1, 'hasMore': False, 'rows': [target], 'observedAt': now()}, False
    if int(reference) != index: return 400, {'code': 'INVALID_MEDIA_TARGET', 'message': 'QA wrong reference'}, False
    photos = state.setdefault('document_photos', {})
    if slot is None:
        rows = [row['photo'] for key, row in photos.items() if key.startswith(str(index) + ':')]
        return 200, {'target': target, 'slots': slots, 'rows': rows, 'page': 1, 'hasMore': False, 'observedAt': now()}, False
    if not re.fullmatch(r'(id_front|id_back|driver_license)(-extra-([2-9]|[1-9][0-9]{1,14}))?', slot):
        return 400, {'code': 'INVALID_MEDIA_TARGET', 'message': 'QA wrong slot'}, False
    existing = photos.get(f'{index}:{slot}')
    photo = existing['photo'] if existing else None
    label = next(item['label'] for item in slots if slot.startswith(item['slot']))
    if method == 'GET':
        revision = parse_qs(url.query).get('revision', [None])[0]
        if revision:
            if not photo or photo['revision'] != revision: return 409, {'code': 'MEDIA_REVIEW_REQUIRED', 'message': 'QA photo changed'}, False
            return 200, {'_bytesBase64': existing['jpeg'], 'mimeType': 'image/jpeg'}, False
        return 200, {'target': target, 'slot': slot, 'label': label, 'photo': photo, 'nextSlot': None, 'observedAt': now()}, False
    if method == 'PUT':
        if not writable: return 403, {'code': 'FORBIDDEN', 'message': 'QA hồ sơ chỉ được xem.'}, False
        key, operation = headers.get('idempotency-key'), f'media.customer:{index}'
        if key in state.get('tombstones', {}): return 409, {'code': 'REQUEST_CANCELLED', 'message': 'QA request cancelled'}, False
        content = body['jpeg']
        previous = state.setdefault('document_receipts', {}).get(key)
        if previous:
            if previous['body'] != body or previous['receipt']['slot'] != slot or previous['operation'] != operation:
                return 409, {'code': 'REQUEST_KEY_REUSED', 'message': 'QA mixed intent'}, False
            return 200, {**previous['receipt'], 'replayed': True}, False
        if state.get('mode') == 'doc-drop':
            state['mode'] = 'none'
            state['delayed_document'] = {'path': path, 'method': method, 'body': deepcopy(body), 'headers': headers}
            return 503, {'code': 'SERVICE_UNAVAILABLE', 'message': 'QA chưa nhận được ảnh.'}, False
        if state.get('mode') == 'doc-conflict':
            state['mode'] = 'none'
            return 409, {'code': 'MEDIA_REVIEW_REQUIRED', 'message': 'QA hồ sơ hoặc ảnh đã đổi. Tải lại trước khi lưu.'}, False
        if headers.get('x-record-revision') != profile['revision'] or headers.get('x-reference-revision') != profile['revision'] or headers.get('x-media-snapshot') != target['snapshot'] or headers.get('x-photo-revision') != (photo['revision'] if photo else '0'):
            return 409, {'code': 'MEDIA_REVIEW_REQUIRED', 'message': 'QA stale review'}, False
        data = base64.b64decode(content)
        assert 0 < len(data) <= 2 * 1024 * 1024 and data[:3] == b'\xff\xd8\xff'
        state['document_writes'] = state.get('document_writes', 0) + 1
        photo_revision = str(1000 + state['document_writes'])
        stored = {'slot': slot, 'label': label, 'revision': photo_revision, 'mimeType': 'image/jpeg', 'bytes': len(data),
                  'updatedAt': now(), 'kind': 'image', 'readable': True, 'blockedReason': None}
        photos[f'{index}:{slot}'] = {'photo': stored, 'jpeg': content}
        receipt = {'id': index, 'revision': profile['revision'], 'replayed': False, 'requestId': key, 'target': target, 'slot': slot,
                   'label': label, 'photoRevision': photo_revision, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
                   'actorId': user['id'], 'actorName': 'QA Quản lý', 'recordedAt': now(), 'parentCurrent': True,
                   'referenceCurrent': True, 'photoCurrent': True, 'current': True}
        state['document_receipts'][key] = {'body': deepcopy(body), 'receipt': receipt, 'operation': operation}
        lost = state.get('mode') == 'doc-lost'
        if lost: state['mode'] = 'none'
        return 200, receipt, lost
    return None
