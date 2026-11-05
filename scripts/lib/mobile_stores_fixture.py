"""Additive synthetic store workspace for the existing vehicle demo checkpoint.

Never deletes or reseeds vehicle/contract/photo/receipt state. Production store
rules are exercised independently against the real domain in PGlite.
"""
import math
import re
from copy import deepcopy
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse


def ensure(state):
    if 'store_workspace' not in state:
        state['store_workspace'] = {'sequence': 9000, 'revision': 200, 'requests': {}, 'profiles': {
            '23': {'id': 23, 'revision': '2026-11-03 00:00:00+00', 'rowRevision': '200', 'code': 'CS-QA-23', 'kind': 'physical', 'name': 'Cơ sở QA', 'phone': '0000000000', 'address': 'Địa chỉ QA', 'status': 'active', 'managerId': 7, 'managerName': 'QA Quản lý', 'vehicleCount': 0, 'staffCount': 2}}}
    return state['store_workspace']


def current(state, index):
    row = deepcopy(ensure(state)['profiles'].get(str(index)))
    if row:
        row['vehicleCount'] = sum(v['values']['store_id'] == row['id'] for v in state['vehicle_profiles'].values())
        if 'staff_workspace' in state: row['staffCount'] = sum(v['storeId'] == row['id'] for v in state['staff_workspace']['profiles'].values())
    return row


def response(path, method, body, headers, state):
    url = urlparse(path); route = url.path; work = ensure(state)
    def fail(message, status=400, code='INVALID_REQUEST'): return status, {'message': message, 'code': code}, False
    if route == '/api/mobile/v1/stores/managers' and method == 'GET': return 200, {'managers': [{'id': 7, 'name': 'QA Quản lý'}]}, False
    if route == '/api/mobile/v1/directory/stores' and method == 'GET':
        params = parse_qs(url.query); search = params.get('search', [''])[0].lower(); status = params.get('status', [''])[0]
        rows = [current(state, index) for index in work['profiles']]
        rows = [row for row in rows if search in (row['name']+row['code']+row['address']).lower() and (not status or status == row['status'])]
        rows = [{'id': row['id'], 'code': row['code'], 'name': row['name'], 'status': row['status'], 'storeId': row['id'], 'storeName': row['name'], 'phone': row['phone'], 'email': '', 'address': row['address'], 'position': '', 'managerName': row['managerName'], 'joinedAt': '', 'notes': 'Dữ liệu tổng hợp QA', 'vehicleCount': row['vehicleCount'], 'staffCount': row['staffCount']} for row in rows]
        size = int(params.get('size', ['20'])[0]); pages = max(1, math.ceil(len(rows)/size)); page = min(int(params.get('page', ['1'])[0]), pages)
        return 200, {'rows': rows[(page-1)*size:page*size], 'total': len(rows), 'page': page, 'pages': pages}, False
    receipt = re.fullmatch(r'/api/mobile/v1/stores/requests/([0-9a-f-]{36})', route)
    if receipt and method == 'GET':
        saved = work['requests'].get(receipt[1])
        if not saved or saved.get('cancelled'): return fail('Chưa có xác nhận cơ sở QA.', 404)
        row = current(state, saved['receipt']['id'])
        return 200, {'key': receipt[1], 'operation': saved['operation'], 'receipt': {**saved['receipt'], 'replayed': True}, 'current': row, 'deleted': row is None}, False
    item = re.fullmatch(r'/api/mobile/v1/stores/([1-9][0-9]*)', route)
    if item and method == 'GET':
        row = current(state, item[1]); return (200, row, False) if row else fail('Cơ sở QA không còn tồn tại.', 404)
    recovery = re.fullmatch(r'/api/mobile/v1/write-requests/([0-9a-f-]{36})/resolve', route)
    if recovery and method == 'POST' and str(body.get('operation', '')).startswith('store.'):
        key = recovery[1]; operation = body['operation']; saved = work['requests'].get(key)
        if saved and saved['operation'] != operation: return fail('Mã QA thuộc thao tác khác.', 409)
        if not saved: saved = {'operation': operation, 'cancelled': True}; work['requests'][key] = saved
        return 200, {'key': key, 'operation': operation, 'status': 'cancelled' if saved.get('cancelled') else 'committed', 'receipt': None if saved.get('cancelled') else {**saved['receipt'], 'replayed': True}}, False
    if not (route == '/api/mobile/v1/stores' and method == 'POST' or item and method in ('PATCH', 'DELETE')): return None
    key = headers.get('Idempotency-Key') or headers.get('idempotency-key')
    if not key or not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', key): return fail('Mã yêu cầu QA không hợp lệ.')
    index = int(item[1]) if item else None; operation = 'store.create' if index is None else f'store.{"delete" if method == "DELETE" else "update"}:{index}'
    saved = work['requests'].get(key)
    if saved:
        if saved.get('cancelled'): return fail('Mã QA đã hủy.', 409, 'REQUEST_CANCELLED')
        if saved['body'] != body or saved['operation'] != operation: return fail('Mã QA đã dùng.', 409, 'REQUEST_KEY_REUSED')
        return 200, {**saved['receipt'], 'replayed': True}, False
    old = current(state, index) if index is not None else None
    if index is not None and not old: return fail('Cơ sở QA không còn tồn tại.', 404)
    if old and body.get('revision') != old['revision']: return fail('Cơ sở QA đã thay đổi. Mở lại trước khi lưu.', 409, 'CONFLICT')
    if method == 'DELETE':
        if set(body) != {'revision'}: return fail('Phiên bản cơ sở QA không hợp lệ.')
        linked = old['vehicleCount'] or old['staffCount'] or any(row.get('store_id') == index for row in state['duty_rows'].values())
        if linked: return fail('Không thể xóa cơ sở QA còn xe, nhân sự hoặc lịch trực. Có thể chọn Tạm ngừng.', 409, 'CONFLICT')
        revision = old['rowRevision']; del work['profiles'][str(index)]
    else:
        expected = {'name', 'phone', 'address', 'status', 'user_id'} | ({'code', 'kind'} if index is None else {'revision'})
        if set(body) != expected or not body['name'].strip() or body['status'] not in ('active', 'inactive') or body['user_id'] not in (None, 7): return fail('Thông tin cơ sở QA không hợp lệ.')
        if any(row['id'] != index and (row['name'].strip().lower() == body['name'].strip().lower() or index is None and body['code'] and row['code'].upper() == body['code'].strip().upper()) for row in work['profiles'].values()): return fail('Tên hoặc mã cơ sở QA đã có.', 409, 'CONFLICT')
        if index is None:
            if body['kind'] not in ('physical', 'lease_to_own'): return fail('Loại cơ sở QA không hợp lệ.')
            work['sequence'] += 1; index = work['sequence']
        work['revision'] += 1; revision = str(work['revision'])
        work['profiles'][str(index)] = {'id': index, 'rowRevision': revision, 'revision': datetime.now(timezone.utc).isoformat(), 'code': old['code'] if old else body['code'].strip().upper() or f'CS-{index:03}', 'kind': old['kind'] if old else body['kind'], 'name': body['name'].strip(), 'phone': body['phone'].strip(), 'address': body['address'].strip(), 'status': body['status'], 'managerId': body['user_id'], 'managerName': 'QA Quản lý' if body['user_id'] else '', 'vehicleCount': old['vehicleCount'] if old else 0, 'staffCount': old['staffCount'] if old else 0}
    proof = {'id': index, 'revision': revision, 'replayed': False}; work['requests'][key] = {'operation': operation, 'body': deepcopy(body), 'receipt': proof}
    return 201 if method == 'POST' else 200, proof, False
