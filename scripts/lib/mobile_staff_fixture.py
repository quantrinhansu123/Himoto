"""Synthetic staff/account happy paths layered onto the preserved demo state."""
import math
import re
from copy import deepcopy
from urllib.parse import parse_qs, urlparse
from lib.mobile_draft_fixture import STAFF


def ensure(state):
    if 'staff_workspace' not in state:
        profiles = {str(index): {'id': index, 'revision': '300', 'code': f'NS-QA-{index}', 'name': name, 'phone': '0000000000', 'email': 'qa@example.invalid', 'position': position, 'storeId': 23, 'storeName': 'Cơ sở QA', 'status': 'active', 'joinedAt': '', 'notes': 'Dữ liệu nhân sự tổng hợp QA', 'userId': None} for index, name, position in [(501, 'QA Đại diện', 'Quản lý cơ sở'), (504, 'QA Nhân viên', 'NVKD')]}
        state['staff_workspace'] = {'sequence': 10000, 'revision': 300, 'profiles': profiles, 'requests': {}, 'accounts': {}}
    return state['staff_workspace']


def directory(state):
    return [{**deepcopy(row), 'storeId': row['storeId'], 'position': row['position'], 'joinedAt': row['joinedAt'], 'managerName': '', 'address': '', 'vehicleCount': None, 'staffCount': None} for row in ensure(state)['profiles'].values()]


def response(path, method, body, headers, state):
    url = urlparse(path); route = url.path; work = ensure(state)
    def fail(message, status=400, code='INVALID_REQUEST'): return status, {'message': message, 'code': code}, False
    if route == '/api/mobile/v1/directory/staff' and method == 'GET':
        params = parse_qs(url.query); search = params.get('search', [''])[0].lower(); status = params.get('status', [''])[0]; store = params.get('store', ['all'])[0]; position = params.get('position', [''])[0]
        rows = [row for row in directory(state) if search in (row['name']+row['code']+row['phone']).lower() and (not status or row['status'] == status) and (store == 'all' or str(row['storeId']) == store) and (not position or row['position'] == position)]
        size = int(params.get('size', ['20'])[0]); pages = max(1, math.ceil(len(rows)/size)); page = min(int(params.get('page', ['1'])[0]), pages)
        return 200, {'rows': rows[(page-1)*size:page*size], 'total': len(rows), 'page': page, 'pages': pages}, False
    if route == '/api/mobile/v1/drafts/staff' and method == 'GET':
        rows = [deepcopy(row) for row in STAFF if str(row['id']) not in work['profiles']]
        for row in work['profiles'].values():
            if row['status'] != 'active': continue
            roles = ['representative']; titles = row['position'].split(' / ')
            if any(title in ('NVKD', 'TPKD') for title in titles): roles.append('sales')
            if 'TLS' in titles: roles.append('telesales')
            rows.append({'id': row['id'], 'name': row['name'], 'storeId': row['storeId'], 'roles': roles})
        return 200, {'rows': rows}, False
    if route == '/api/mobile/v1/staff/options' and method == 'GET':
        return 200, {'stores': [{'id': 23, 'name': 'Cơ sở QA'}], 'positions': sorted(set(['HCNS', 'NVKD', 'TPKD', 'TLS', 'PT', 'Quản lý cơ sở']+[row['position'] for row in work['profiles'].values() if row['position']]))}, False
    receipt = re.fullmatch(r'/api/mobile/v1/staff/requests/([0-9a-f-]{36})', route)
    if receipt and method == 'GET':
        saved = work['requests'].get(receipt[1])
        if not saved or saved.get('cancelled'): return fail('Chưa có xác nhận nhân sự QA.', 404)
        row = deepcopy(work['profiles'].get(str(saved['receipt']['id'])))
        return 200, {'key': receipt[1], 'operation': saved['operation'], 'receipt': {**saved['receipt'], 'replayed': True}, 'current': row, 'deleted': row is None}, False
    item = re.fullmatch(r'/api/mobile/v1/staff/([1-9][0-9]*)', route)
    if item and method == 'GET':
        row = work['profiles'].get(item[1]); return (200, deepcopy(row), False) if row else fail('Nhân sự QA không còn tồn tại.', 404)
    recovery = re.fullmatch(r'/api/mobile/v1/write-requests/([0-9a-f-]{36})/resolve', route)
    if recovery and method == 'POST' and str(body.get('operation', '')).startswith('staff.'):
        key = recovery[1]; operation = body['operation']; saved = work['requests'].get(key)
        if saved and saved['operation'] != operation: return fail('Mã QA thuộc thao tác khác.', 409)
        if not saved: saved = {'operation': operation, 'cancelled': True}; work['requests'][key] = saved
        return 200, {'key': key, 'operation': operation, 'status': 'cancelled' if saved.get('cancelled') else 'committed', 'receipt': None if saved.get('cancelled') else {**saved['receipt'], 'replayed': True}}, False
    if not (route == '/api/mobile/v1/staff' and method == 'POST' or item and method in ('PATCH', 'DELETE')): return None
    key = headers.get('Idempotency-Key') or headers.get('idempotency-key')
    if not key or not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', key): return fail('Mã yêu cầu QA không hợp lệ.')
    index = int(item[1]) if item else None; operation = 'staff.create' if index is None else f'staff.{"delete" if method == "DELETE" else "update"}:{index}'
    saved = work['requests'].get(key)
    if saved:
        if saved.get('cancelled'): return fail('Mã QA đã hủy.', 409, 'REQUEST_CANCELLED')
        if saved['body'] != body or saved['operation'] != operation: return fail('Mã QA đã dùng.', 409, 'REQUEST_KEY_REUSED')
        return 200, {**saved['receipt'], 'replayed': True, 'credentials': None}, False
    old = work['profiles'].get(str(index)) if index is not None else None
    if index is not None and not old: return fail('Nhân sự QA không còn tồn tại.', 404)
    if old and body.get('revision') != old['revision']: return fail('Nhân sự QA đã thay đổi. Mở lại trước khi lưu.', 409, 'CONFLICT')
    credentials = None
    if method == 'DELETE':
        if set(body) != {'revision'}: return fail('Phiên bản nhân sự QA không hợp lệ.')
        if index in (501, 504) or any(row.get('staff_id') == index for row in state['duty_rows'].values()): return fail('Nhân sự QA còn lịch trực hoặc dữ liệu liên quan.', 409, 'CONFLICT')
        revision = old['revision']; del work['profiles'][str(index)]
    else:
        expected = {'name', 'phone', 'email', 'position', 'status', 'store_id'} | ({'joined_at'} if index is None else {'revision'})
        if set(body) != expected or not body['name'].strip() or not re.fullmatch(r'\+?\d{9,13}', body['phone']) or body['store_id'] != 23 or body['status'] not in ('active', 'inactive', 'leave'): return fail('Thông tin nhân sự QA không hợp lệ.')
        if index is None:
            work['sequence'] += 1; index = work['sequence']
        work['revision'] += 1; revision = str(work['revision']); user_id = old['userId'] if old else None
        if user_id is None and body['status']!='leave': user_id=100000+index
        work['profiles'][str(index)] = {'id': index, 'revision': revision, 'code': old['code'] if old else f'NV{index:04}', 'name': body['name'].strip(), 'phone': body['phone'].strip(), 'email': body['email'].strip(), 'position': body['position'].strip(), 'storeId': 23, 'storeName': 'Cơ sở QA', 'status': body['status'], 'joinedAt': old['joinedAt'] if old else body['joined_at'], 'notes': old['notes'] if old else '', 'userId': user_id}
        if user_id is not None:
            previous = work['accounts'].get(str(user_id)); enabled = body['status'] == 'active' and (not previous or previous['enabled'] or old['status'] != 'active')
            work['accounts'][str(user_id)] = {'id': user_id, 'login_name': f'nv{index:04}', 'enabled': enabled, 'deleted': body['status'] == 'leave', 'storeId': 23}
            if not previous and body['status'] != 'leave': credentials = {'login_name': f'nv{index:04}', 'password': 'FixtureStaff0311Only', 'enabled': enabled}
    proof = {'id': index, 'revision': revision, 'replayed': False}; work['requests'][key] = {'operation': operation, 'body': deepcopy(body), 'receipt': proof}
    return 201 if method == 'POST' else 200, {**proof, 'credentials': credentials}, False
