"""Synthetic demo workspaces layered on contract/media/GPS QA. No env or DB."""
import math
import re
from copy import deepcopy
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse
from lib import mobile_contract_flow_fixture as base
from lib.mobile_draft_fixture import STORES, STAFF, draft_record
from lib import mobile_staff_fixture

SCHEMA = base.SCHEMA
digest = base.digest
USER = {**base.USER, 'permissions': [*base.USER['permissions'], 'hr.read', 'hr.write']}


def seed_state():
    return {**base.seed_state(), 'demo_workspace': True, 'duty_rows': {}, 'duty_requests': {}, 'duty_sequence': 6000, 'duty_revision': 100}


def valid_state(state):
    base.valid_state(state)
    assert state['demo_workspace'] is True and isinstance(state['duty_requests'], dict)
    state['duty_rows'] = {int(key): value for key, value in state['duty_rows'].items()}
    return state


def summary(state, generation):
    return {**base.summary(state, generation), 'demoWorkspace': True,
            'dutySchedules': deepcopy(list(state['duty_rows'].values())),
            'dutyRequests': deepcopy(state['duty_requests'])}


def fail(message, status=400, code='INVALID_REQUEST'):
    return status, {'message': message, 'code': code}, False


def directory(kind, state=None):
    if kind=='staff' and state is not None and 'staff_workspace' in state:return mobile_staff_fixture.directory(state)
    def row(index, code, name, **extra):
        return {'id': index, 'code': code, 'name': name, 'status': 'active', 'storeId': 23, 'storeName': 'Cơ sở QA',
                'phone': '0000000000', 'email': 'qa@example.invalid', 'address': 'Địa chỉ QA', 'position': '',
                'managerName': '', 'joinedAt': '', 'notes': 'Dữ liệu tổng hợp phục vụ demo', 'vehicleCount': None, 'staffCount': None, **extra}
    if kind == 'staff':
        return [row(501, 'NS-QA-501', 'QA Đại diện', position='Quản lý cơ sở'), row(504, 'NS-QA-504', 'QA Nhân viên', position='Nhân viên')]
    return [row(23, 'CS-QA-23', 'Cơ sở QA', managerName='QA Quản lý', vehicleCount=23, staffCount=2)]


def duty_response(url, method, body, headers, state):
    parts = url.path.removeprefix('/api/mobile/v1/duty-roster').strip('/').split('/')
    if parts == [''] and method == 'GET':
        params = parse_qs(url.query)
        date = datetime.fromisoformat(params.get('week', [datetime.now(timezone.utc).date().isoformat()])[0])
        from datetime import timedelta
        monday = date.date() - timedelta(days=date.weekday())
        start = datetime.fromisoformat(f'{monday}T00:00:00+07:00')
        end = start + timedelta(days=7)
        rows = [deepcopy(row) for row in state['duty_rows'].values() if not row.get('deleted') and datetime.fromisoformat(row['starts_at']) < end and datetime.fromisoformat(row['ends_at']) > start]
        if 'store_id' in params: rows = [row for row in rows if row['store_id'] == int(params['store_id'][0])]
        return 200, {'week': str(monday), 'schedules': rows}, False
    if len(parts) == 2 and parts[0] == 'requests' and method == 'GET':
        saved = state['duty_requests'].get(parts[1])
        if not saved or saved.get('cancelled'): return fail('Chưa có xác nhận ca trực QA.', 404, 'NOT_FOUND')
        row = state['duty_rows'][saved['receipt']['id']]
        return 200, {'key': parts[1], 'operation': saved['operation'], 'receipt': {**saved['receipt'], 'replayed': True}, 'current': None if row.get('deleted') else deepcopy(row), 'deleted': bool(row.get('deleted'))}, False
    if method not in ('POST', 'PATCH', 'DELETE'): return fail('Không có thao tác QA.', 404)
    key = headers.get('Idempotency-Key') or headers.get('idempotency-key')
    if not key or not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', key): return fail('Mã lần lưu QA không hợp lệ.')
    if method == 'POST' and parts != [''] or method != 'POST' and (len(parts) != 1 or not parts[0].isdigit()): return fail('Mã ca QA không hợp lệ.')
    index = None if method == 'POST' else int(parts[0])
    operation = 'duty.create' if index is None else f'duty.{"update" if method == "PATCH" else "delete"}:{index}'
    previous = state['duty_requests'].get(key)
    if previous:
        if previous.get('cancelled'): return fail('Mã QA đã hủy.', 409, 'REQUEST_CANCELLED')
        if previous['body'] != body or previous['operation'] != operation: return fail('Mã QA đã dùng.', 409, 'REQUEST_KEY_REUSED')
        return 200, {**previous['receipt'], 'replayed': True}, False
    old = state['duty_rows'].get(index)
    if index is not None and (not old or old.get('deleted')): return fail('Ca QA không còn tồn tại.', 404)
    if old and body.get('revision') != old['revision']: return fail('Ca QA đã thay đổi. Mở lại trước khi sửa.', 409, 'CONFLICT')
    if method != 'DELETE':
        expected = {'store_id', 'staff_id', 'starts_at', 'ends_at', 'shift_name', 'role_in_shift', 'notes'} | ({'revision'} if index is not None else set())
        if set(body) != expected or type(body['staff_id']) is not int or body['staff_id'] not in [row['id'] for row in directory('staff',state) if row['status']=='active'] or body['store_id'] != 23: return fail('Chọn nhân sự và cơ sở QA hợp lệ.')
        start, end = [datetime.fromisoformat(body[key] + '+07:00') for key in ('starts_at', 'ends_at')]
        if end <= start or (end-start).total_seconds() > 86400: return fail('Ca QA tối đa 24 giờ.')
        if not body['shift_name'].strip() or not body['role_in_shift'].strip(): return fail('Nhập tên ca và vai trò.')
        for row in state['duty_rows'].values():
            if row['id'] != index and not row.get('deleted') and row['staff_id'] == body['staff_id'] and datetime.fromisoformat(row['starts_at']) < end and datetime.fromisoformat(row['ends_at']) > start:
                return fail('Nhân viên đã có ca trực trùng giờ.', 409, 'CONFLICT')
    elif set(body) != {'revision'}: return fail('Phiên bản QA không hợp lệ.')
    state['duty_revision'] += 1
    if index is None:
        state['duty_sequence'] += 1
        index = state['duty_sequence']
    revision = str(state['duty_revision'])
    if method == 'DELETE': old.update(deleted=True, revision=revision)
    else:
        staff = next(row for row in directory('staff',state) if row['id'] == body['staff_id'])
        state['duty_rows'][index] = {**deepcopy(body), 'id': index, 'store_name': 'Cơ sở QA', 'staff_name': staff['name'], 'staff_phone': staff['phone'], 'duty_date': body['starts_at'][:10],
                                     'starts_at': start.astimezone(timezone.utc).isoformat(), 'ends_at': end.astimezone(timezone.utc).isoformat(), 'revision': revision}
    receipt = {'id': index, 'revision': revision, 'replayed': False}
    state['duty_requests'][key] = {'operation': operation, 'body': deepcopy(body), 'receipt': receipt}
    return 201 if method == 'POST' else 200, receipt, False


def response(path, method, body, headers, state):
    url = urlparse(path)
    token = (headers.get('Authorization') or headers.get('authorization', '')).removeprefix('Bearer ')
    authenticated = token in state['sessions']
    if authenticated:
        if url.path.startswith('/api/mobile/v1/duty-roster'): return duty_response(url, method, body, headers, state)
        if url.path.startswith('/api/mobile/v1/directory/') and method == 'GET':
            kind = url.path.rsplit('/', 1)[1]
            if kind not in ('staff', 'stores'): return fail('Không tìm thấy danh bạ.', 404)
            params = parse_qs(url.query)
            search = params.get('search', [''])[0].lower()
            rows = [row for row in directory(kind) if search in (row['name'] + row['code']).lower() and params.get('status', ['active'])[0] in ('', 'active')]
            if kind == 'staff' and params.get('store', ['all'])[0] not in ('all', '23'): rows = []
            size, page = int(params.get('size', ['20'])[0]), int(params.get('page', ['1'])[0])
            return 200, {'rows': rows[(page-1)*size:page*size], 'total': len(rows), 'page': page, 'pages': max(1, math.ceil(len(rows)/size))}, False
        if url.path == '/api/mobile/v1/catalogue/contracts' and method == 'GET':
            params = parse_qs(url.query)
            scope = params.get('scope', [''])[0]
            if scope not in ('', 'drafts', 'due', 'overdue', 'ownership', 'vat'): return fail('Nhóm hợp đồng QA không hợp lệ.')
            rows = [draft_record(index, state) for index in state['draft_profiles']]
            if scope == 'drafts': rows = [row for row in rows if row['status'] == 'draft']
            if scope == 'overdue': rows = [row for row in rows if row['status'] in ('overdue', 'bad_debt')]
            if scope in ('due', 'vat'): rows = []  # This dataset has no posted installment/company receipts.
            if scope == 'ownership': rows = [row for row in rows if state['draft_profiles'][row['id']]['input']['draft'].get('ownership')]
            search, status = params.get('search', [''])[0].lower(), params.get('status', [''])[0]
            rows = [row for row in rows if search in (row['code'] + row['name'] + row['license']).lower() and (not status or row['status'] == status)]
            store, start, end = params.get('store', ['all'])[0], params.get('from', [''])[0], params.get('to', [''])[0]
            rows = [row for row in rows if (store == 'all' or str(row['storeId']) == store) and (not start or row['startsAt'][:10] >= start) and (not end or row['startsAt'][:10] <= end)]
            size, page = int(params.get('size', ['20'])[0]), int(params.get('page', ['1'])[0])
            pages = max(1, math.ceil(len(rows)/size)); page = min(page, pages)
            return 200, {'rows': rows[(page-1)*size:page*size], 'total': len(rows), 'page': page, 'pages': pages, 'statusCounts': [], 'updatedAt': datetime.now(timezone.utc).isoformat(), 'scope': scope}, False
        if re.fullmatch(r'/api/mobile/v1/write-requests/[0-9a-f-]{36}/resolve', url.path) and method == 'POST' and str(body.get('operation', '')).startswith('duty.'):
            key = url.path.split('/')[-2]
            previous = state['duty_requests'].get(key)
            if previous and previous['operation'] != body['operation']: return fail('Mã không khớp.', 409)
            if previous and not previous.get('cancelled'):
                return 200, {'key': key, 'operation': previous['operation'], 'status': 'committed', 'receipt': {**previous['receipt'], 'replayed': True}}, False
            state['duty_requests'][key] = {'operation': body['operation'], 'cancelled': True}
            return 200, {'key': key, 'operation': body['operation'], 'status': 'cancelled', 'receipt': None}, False
    result = base.response(path, method, body, headers, state)
    if result and url.path in ('/api/mobile/v1/session', '/api/mobile/v1/workspace') and method != 'DELETE' and result[0] in (200, 201) and isinstance(result[1], dict) and 'user' in result[1]:
        result[1]['user'] = deepcopy(USER)
    return result
