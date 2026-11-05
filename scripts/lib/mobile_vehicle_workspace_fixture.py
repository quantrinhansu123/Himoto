"""Durable demo: coherent vehicle profiles/inventory plus existing transfer/media models.

Synthetic only. Production domain is separately exercised by check-mobile-vehicles.cjs.
"""
import hashlib
import json
import math
import re
from copy import deepcopy
from urllib.parse import parse_qs, urlparse
from lib import mobile_demo_workspace_fixture as base
from lib import mobile_vehicle_transfer_fixture as transfers
from lib import mobile_record_media_fixture as media
from lib import mobile_stores_fixture as stores
from lib import mobile_staff_fixture as staff
from lib import mobile_cashbook_fixture as cashbook
from lib import mobile_cashbook_bulk_fixture as cashbook_bulk
from lib import mobile_reports_fixture as reports
from lib import mobile_debt_reminders_fixture as reminders
from lib import mobile_shift_reports_fixture as shifts
from lib import mobile_battery_fixture as battery
from lib import mobile_contract_types_fixture as contract_types
from lib import mobile_managed_accounts_fixture as managed_accounts
from lib import mobile_integrations_fixture as integrations
from lib import mobile_backfill_fixture as backfill
from lib import mobile_renewal_parity_fixture as renewal_parity
from lib import mobile_contract_approval_fixture as contract_approval
from lib import mobile_contract_edit_fixture as contract_edit
from lib import mobile_contract_corrections_fixture as contract_corrections
from lib import mobile_contract_lifecycle_fixture as contract_lifecycle
from lib import mobile_return_corrections_fixture as return_corrections
from lib import mobile_terms_actions_fixture as terms_actions
from lib import mobile_print_import_fixture as print_import
from lib.mobile_draft_fixture import STORES, draft_vehicle

SCHEMA = base.SCHEMA
digest = base.digest
USER = {**base.USER, 'permissions': list(dict.fromkeys([*base.USER['permissions'], 'contracts.renew', 'contracts.return', 'vehicles.write', 'vehicles.transfer', 'vehicles.receive', 'settings.write', 'finance.read', 'finance.write']))}
TYPES = [{'value': key, 'label': value} for key, value in [('xega', 'Xe ga'), ('xeso', 'Xe số'), ('xecon', 'Xe côn tay'), ('xesh', 'Xe SH'), ('xe_dien', 'Xe điện')]]
STATUSES = [{'value': key, 'label': value} for key, value in [('ready', 'Lưu kho'), ('using', 'Đang thuê'), ('repairing', 'Bảo dưỡng'), ('pending', 'Đặt trước'), ('sold', 'Đã bán'), ('bad_debt', 'Nợ xấu'), ('broken', 'Hỏng'), ('in_transit', 'Chờ luân chuyển')]]


def profile(index, values, revision='100'):
    store = next(row['name'] for row in STORES if row['id'] == values['store_id'])
    return {'id': index, 'revision': revision, 'values': {**values, 'revision': revision}, 'storeName': store, 'ownerStoreId': values['store_id'], 'ownerStoreName': store,
            'typeLabel': next(row['label'] for row in TYPES if row['value'] == values['type']), 'hasOpenContract': False, 'inTransit': values['status'] == 'in_transit', 'canEdit': values['store_id'] == 23}


def sync(state, row):
    v = row['values']; index = row['id']
    state['vehicle_transfers']['vehicles'][str(index)] = {'id': index, 'revision': row['revision'], 'name': v['name'], 'license': v['license'], 'brand': v['brand'], 'type': v['type'], 'year': str(v['year'] or ''), 'color': v['color'],
        'status': v['status'], 'storeId': v['store_id'], 'storeName': row['storeName'], 'ownerStoreId': row['ownerStoreId'], 'ownerStoreName': row['ownerStoreName']}
    m = state['vehicle_media']; m['records'][f'vehicles:{index}'] = {'id': index, 'entity': 'vehicles', 'revision': row['revision'], 'storeId': v['store_id'], 'name': v['name'], 'code': v['license'], 'status': v['status']}
    target = {'entity': 'vehicles', 'id': index, 'kind': 'vehicle', 'referenceId': index, 'revision': row['revision'], 'referenceRevision': row['revision'], 'label': 'Giấy tờ xe · ' + v['license']}
    m['targets'][media.key(target)] = target
    for event in state['vehicle_transfers']['events'].values():
        if event['vehicleId'] != index or event['proof']['type'] not in ('manual_transfer', 'manual_transfer_receive'): continue
        proof = event['proof']; kind = 'transfer' if proof['type'] == 'manual_transfer' else 'receive'
        target = {'entity': 'vehicles', 'id': index, 'kind': kind, 'referenceId': proof['id'], 'revision': row['revision'], 'referenceRevision': proof['revision'], 'label': ('Chuyển xe · ' if kind == 'transfer' else 'Nhận xe · ') + v['license']}
        m['targets'][media.key(target)] = target


def seed_state():
    state = base.seed_state()
    state.update(vehicle_workspace=True, vehicle_profiles={}, vehicle_requests={}, vehicle_events=[], vehicle_sequence=8000, vehicle_delete_requests={})
    t = transfers.seed_state(); t['vehicles'] = {}; t['stores'] = [{**row, 'revision': '100'} for row in STORES]; state['vehicle_transfers'] = t
    state['vehicle_media'] = {'schema': media.SCHEMA, 'fixtureOnly': True, 'records': {}, 'targets': {}, 'photos': {}, 'blobs': {}, 'requests': {}, 'sessions': {}, 'scopes': {}, 'sessionSeq': 0, 'writes': 0, 'photoSeq': 100, 'mode': 'none', 'delayed': [], 'pageError': False}
    for n in range(1, 24):
        old = draft_vehicle(n)['vehicle']; index = int(old['id'])
        values = {'name': old['name'], 'license': old['license'], 'brand': old['brand'], 'type': 'xeso', 'year': 2026, 'store_id': 23, 'status': 'ready', 'color': old['color'], 'chassis': '', 'engine': '', 'odometer': 100, 'note': ''}
        state['vehicle_profiles'][index] = profile(index, values); sync(state, state['vehicle_profiles'][index])
    seed_history(state)
    return state


def seed_history(state):
    assert state['vehicle_transfers']['writes'] == 0 and not state['vehicle_requests']
    if '49999' in state['vehicle_transfers']['events']: return
    row = {'id': 49999, 'revision': '100', 'type': 'manual_transfer_receive', 'refId': 49998, 'fromStoreId': 24, 'toStoreId': 23, 'fromStoreName': 'Kho QA khác', 'toStoreName': 'Cơ sở QA', 'actorId': 7, 'actorName': 'QA lịch sử', 'recordedAt': media.now(), 'note': 'Lịch sử nhận kho tổng hợp để demo bộ lọc.'}
    state['vehicle_transfers']['events']['49999'] = {'vehicleId': 301, 'proof': row}
    sync(state, state['vehicle_profiles'][301])


def valid_state(state):
    base.valid_state(state); assert state['vehicle_workspace'] is True
    state['vehicle_profiles'] = {int(key): value for key, value in state['vehicle_profiles'].items()}
    transfers.valid_state(state['vehicle_transfers']); media.valid_state(state['vehicle_media'])
    assert all(key == row['id'] and row['revision'] == row['values']['revision'] for key, row in state['vehicle_profiles'].items())
    stores.ensure(state)
    staff.ensure(state)
    cashbook.ensure(state)
    cashbook_bulk.ensure(state)
    return state


def summary(state, generation):
    return {**base.summary(state, generation), 'vehicleWorkspace': True, 'vehicleProfiles': deepcopy(list(state['vehicle_profiles'].values())), 'vehicleRequests': deepcopy(state['vehicle_requests']), 'vehicleTransferWrites': state['vehicle_transfers']['writes'], 'vehicleMediaWrites': state['vehicle_media']['writes'], 'storeWorkspace':deepcopy(stores.ensure(state)), 'staffWorkspace':deepcopy(staff.ensure(state)), 'cashbookWorkspace':deepcopy(cashbook.ensure(state)), 'cashbookBulkWorkspace':deepcopy(cashbook_bulk.ensure(state))}


def record(row):
    v = row['values']
    return {'id': row['id'], 'code': v['license'], 'name': v['name'], 'status': v['status'], 'storeId': v['store_id'], 'storeName': row['storeName'], 'license': v['license'], 'vehicleName': '', 'phone': '', 'startsAt': '', 'endsAt': '', 'totalAmount': None, 'paidAmount': None, 'brand': v['brand'], 'color': v['color'], 'odometer': v['odometer']}


def events(state):
    rows = deepcopy(state['vehicle_events'])
    for event in state['vehicle_transfers']['events'].values():
        p = event['proof']; v = state['vehicle_profiles'][event['vehicleId']]['values']; action = p['type'].removeprefix('manual_transfer_') if p['type'] != 'manual_transfer' else 'transfer'
        rows.append({'id': p['id'], 'key': f'transfer-{p["id"]}', 'vehicle_id': event['vehicleId'], 'vehicle_name': v['name'], 'license': v['license'], 'action': action if action in ('transfer', 'receive', 'reject', 'cancel') else 'receive', 'label': {'transfer': 'Chuyển xe', 'receive': 'Nhận xe', 'reject': 'Từ chối', 'cancel': 'Hủy điều chuyển'}.get(action, 'Nhận xe'), 'at': p['recordedAt'], 'actor': p['actorName'], 'note': p['note'], 'changes': [], 'from_store_id': p['fromStoreId'], 'to_store_id': p['toStoreId'], 'from_store': p['fromStoreName'], 'to_store': p['toStoreName']})
    return sorted(rows, key=lambda row: row['at'], reverse=True)


def resolve(registry, key, operation):
    old = registry.get(key)
    if old and old['operation'] != operation: return base.fail('Mã thuộc thao tác khác.', 409)
    if not old:
        registry[key] = {'operation': operation, 'cancelled': True}; old = registry[key]
    return 200, {'key': key, 'operation': operation, 'status': 'cancelled' if old.get('cancelled') else 'committed', 'receipt': None if old.get('cancelled') else {**old['receipt'], 'replayed': True}}, False


def nested_headers(headers, token):
    return {**{key: value for key, value in headers.items() if key.lower() != 'authorization'}, 'Authorization': 'Bearer '+token}


def vehicle_response(path, method, body, headers, state):
    url = urlparse(path); route = url.path; params = parse_qs(url.query)
    if route == '/api/mobile/v1/vehicles/options': return 200, {'stores': STORES[:1], 'types': TYPES, 'statuses': STATUSES}, False
    if route == '/api/mobile/v1/vehicles/documents/ocr': return 200, {'requestId': headers.get('X-Ocr-Request') or headers.get('x-ocr-request'), 'fields': {'license': 'QA-OCR-0311', 'chassis': 'QA000001', 'engine': 'QA000002', 'year': '2026'}, 'warnings': ['OCR QA tổng hợp; không gọi provider thật.']}, False
    receipt_match = re.fullmatch(r'/api/mobile/v1/vehicles/requests/([0-9a-f-]{36})', route)
    if receipt_match:
        old = state['vehicle_requests'].get(receipt_match[1])
        if not old or old.get('cancelled'): return base.fail('Chưa có xác nhận xe QA.', 404)
        return 200, {'key': receipt_match[1], 'operation': old['operation'], 'receipt': {**old['receipt'], 'replayed': True}, 'current': deepcopy(state['vehicle_profiles'][old['receipt']['id']])}, False
    if route == '/api/mobile/v1/vehicles/transfers' or route.startswith('/api/mobile/v1/vehicles/') and route.endswith('/history'):
        rows = events(state); today = media.now()[:10]
        if route.endswith('/history'):
            index = int(route.split('/')[-2]); rows = [row for row in rows if row['vehicle_id'] == index]
        else:
            rows = [row for row in rows if row['action'] in ('transfer', 'receive', 'reject', 'cancel') and params.get('from', [today])[0] <= row['at'][:10] <= params.get('to', [today])[0]]
            for key, field in [('from_store', 'from_store_id'), ('to_store', 'to_store_id')]:
                if params.get(key): rows = [row for row in rows if str(row.get(field)) == params[key][0]]
            if params.get('store', ['all'])[0] != 'all': rows = [row for row in rows if int(params['store'][0]) in (row.get('from_store_id'), row.get('to_store_id'))]
        action = params.get('action', [''])[0]; search = params.get('search', [''])[0].lower()
        rows = [row for row in rows if (not action or row['action'] == action) and search in json.dumps(row, ensure_ascii=False).lower()]
        pages = max(1, math.ceil(len(rows)/25)); page = min(int(params.get('page', ['1'])[0]), pages); selected = rows[(page-1)*25:page*25]
        if route.endswith('/history'):
            selected = [{**row, 'action': 'transfer' if row['action'] in ('receive', 'reject', 'cancel') else row['action'], 'responsible_store': row.get('from_store', ''), 'beneficiary_store': row.get('to_store', ''), 'location': '', 'order_id': None} for row in selected]
            return 200, {'id': index, 'rows': selected, 'page': page, 'pages': pages, 'total': len(rows), 'sourceLimit': 'Lịch sử tổng hợp QA.'}, False
        return 200, {'rows': selected, 'page': page, 'pages': pages, 'total': len(rows), 'scopeCount': len(rows), 'size': 25, 'from': params.get('from', [today])[0], 'to': params.get('to', [today])[0]}, False
    match = re.fullmatch(r'/api/mobile/v1/vehicles/([1-9][0-9]*)', route)
    index = int(match[1]) if match else None
    if match and method == 'GET': return (200, deepcopy(state['vehicle_profiles'][index]), False) if index in state['vehicle_profiles'] else base.fail('Không có xe QA.', 404)
    if method not in ('POST', 'PATCH') or route != '/api/mobile/v1/vehicles' and not match: return None
    key = headers.get('Idempotency-Key') or headers.get('idempotency-key'); operation = 'vehicle.create' if index is None else f'vehicle.update:{index}'
    if not isinstance(key, str) or not re.fullmatch(r'[0-9a-f-]{36}', key): return base.fail('Mã QA không hợp lệ.')
    previous = state['vehicle_requests'].get(key)
    if previous:
        if previous.get('cancelled'): return base.fail('Mã QA đã hủy.', 409, 'REQUEST_CANCELLED')
        if previous['body'] != body: return base.fail('Nội dung QA khác.', 409, 'REQUEST_KEY_REUSED')
        return 200, {**previous['receipt'], 'replayed': True}, False
    old = state['vehicle_profiles'].get(index); values = deepcopy(body); values.pop('revision', None)
    if index is not None and (not old or body.get('revision') != old['revision']): return base.fail('Xe QA đã thay đổi.', 409, 'CONFLICT')
    if not all(isinstance(values.get(key), str) and values[key].strip() for key in ('name', 'license', 'brand')) or values.get('store_id') not in (23, 24) or values.get('type') not in [row['value'] for row in TYPES] or values.get('status') not in [row['value'] for row in STATUSES]: return base.fail('Thông tin xe QA không hợp lệ.')
    values['license'] = values['license'].strip().upper()
    if any(row['values']['license'] == values['license'] and row['id'] != index for row in state['vehicle_profiles'].values()): return base.fail('Biển số QA đã tồn tại.', 409, 'CONFLICT')
    if old and (old['hasOpenContract'] or old['inTransit']) and (old['values']['status'] != values['status'] or old['values']['store_id'] != values['store_id']): return base.fail('Dùng nghiệp vụ hợp đồng/nhận xe để đổi trạng thái hoặc cơ sở.', 409)
    revision = str(max([int(row['revision']) for row in state['vehicle_profiles'].values()] + [100]) + 1)
    if index is None: state['vehicle_sequence'] += 1; index = state['vehicle_sequence']
    row = profile(index, values, revision)
    if old: row.update(ownerStoreId=old['ownerStoreId'], ownerStoreName=old['ownerStoreName'])
    state['vehicle_profiles'][index] = row; sync(state, row)
    changes = [] if not old else [{'field': key, 'label': key, 'from': str(old['values'].get(key, '')), 'to': str(value)} for key, value in values.items() if key != 'note' and old['values'].get(key) != value]
    state['vehicle_events'].append({'id': len(state['vehicle_events']) + 1, 'key': f'profile-{len(state["vehicle_events"])+1}', 'vehicle_id': index, 'vehicle_name': values['name'], 'license': values['license'], 'action': 'edit' if old else 'create', 'label': 'Chỉnh sửa thông tin xe' if old else 'Nhập xe', 'at': media.now(), 'actor': USER['name'], 'note': values.get('note', ''), 'changes': changes, 'from_store': old['storeName'] if old else '', 'to_store': row['storeName']})
    saved = {'id': index, 'revision': revision, 'replayed': False}; state['vehicle_requests'][key] = {'operation': operation, 'body': deepcopy(body), 'receipt': saved}
    return 201 if old is None else 200, saved, False


def delete_photo(path, method, body, headers, state):
    route = urlparse(path).path; m = state['vehicle_media']
    receipt = re.fullmatch(r'/api/mobile/v1/record-media/deletions/vehicles/([0-9]+)/([0-9a-f-]{36})', route)
    if receipt:
        old = state['vehicle_delete_requests'].get(receipt[2]); return 200, {'receipt': deepcopy(old['receipt']) if old and not old.get('cancelled') else None}, False
    match = re.fullmatch(r'/api/mobile/v1/record-media/vehicles/([0-9]+)/(vehicle|transfer|receive)/([0-9]+)/([^/]+)', route)
    if not match or method != 'DELETE': return None
    h = {key.lower(): value for key, value in headers.items()}; request_id = h.get('idempotency-key'); old = state['vehicle_delete_requests'].get(request_id)
    if old:
        if old.get('cancelled'): return base.fail('Mã QA đã hủy.', 409, 'REQUEST_CANCELLED')
        return 200, {**deepcopy(old['receipt']), 'replayed': True}, False
    index, kind, ref, slot = match.groups(); target = m['targets'].get(f'vehicles:{index}:{kind}:{ref}'); photo_key = media.key(target)+'/'+slot if target else ''; photo = m['photos'].get(photo_key)
    if not target or not photo: return base.fail('Không có ảnh QA.', 404)
    if h.get('x-media-snapshot') != media.target_snapshot(target) or h.get('x-photo-revision') != photo['revision']: return base.fail('Ảnh QA đã thay đổi.', 409)
    proof = {'id': int(index), 'revision': target['revision'], 'requestId': request_id, 'replayed': False, 'target': media.prepared(target), 'photo': media.view_photo(target, photo), 'actorId': 7, 'actorName': USER['name'], 'recordedAt': media.now(), 'parentCurrent': True, 'referenceCurrent': True, 'slotEmpty': True, 'current': True}
    del m['photos'][photo_key]; state['vehicle_delete_requests'][request_id] = {'operation': f'media.delete.vehicle:{index}', 'receipt': proof}
    return 200, proof, False


def response(path, method, body, headers, state):
    print_response=print_import.response(path,method,body,headers,state)
    if print_response is not None:return print_response
    terms_response=terms_actions.response(path,method,body,headers,state)
    if terms_response is not None:return terms_response
    return_corrections_response=return_corrections.response(path,method,body,headers,state)
    if return_corrections_response is not None:return return_corrections_response
    lifecycle_response=contract_lifecycle.response(path,method,body,headers,state)
    if lifecycle_response is not None:return lifecycle_response
    corrections_response=contract_corrections.response(path,method,body,headers,state)
    if corrections_response is not None:return corrections_response
    edit_response=contract_edit.response(path,method,body,headers,state)
    if edit_response is not None:return edit_response
    approval_response=contract_approval.response(path,method,body,headers,state)
    if approval_response is not None:return approval_response
    renewal_parity_response=renewal_parity.response(path,method,body,headers,state)
    if renewal_parity_response is not None:return renewal_parity_response
    backfill_response=backfill.response(path,method,body,headers,state)
    if backfill_response is not None:return backfill_response
    integration_response=integrations.response(path,method,body,headers,state)
    if integration_response:return integration_response
    managed_response=managed_accounts.response(path,method,body,headers,state)
    if managed_response:return managed_response
    url = urlparse(path); route = url.path; token = (headers.get('Authorization') or headers.get('authorization', '')).removeprefix('Bearer ')
    if token in state['sessions']:
        type_response=contract_types.response(path,method,body,headers,state)
        if type_response:return type_response
        battery_response=battery.response(path,method,body,headers,state)
        if battery_response:return battery_response
        shift_response=shifts.response(path,method,body,headers,state)
        if shift_response:return shift_response
        reminder_response=reminders.response(path,method,body,headers,state)
        if reminder_response:return reminder_response
        report_response=reports.response(path,method,body,headers,state)
        if report_response:return report_response
        bulk_response=cashbook_bulk.response(path,method,body,headers,state)
        if bulk_response:return bulk_response
        cashbook_response=cashbook.response(path,method,body,headers,state)
        if cashbook_response:return cashbook_response
        staff_response=staff.response(path,method,body,headers,state)
        if staff_response:return staff_response
        store_response=stores.response(path,method,body,headers,state)
        if store_response:return store_response
        internal = {'actorId': 7, 'active': True, 'expiresAt': state['sessions'][token]}
        for name in ('vehicle_transfers', 'vehicle_media'): state[name]['sessions']['1'] = internal.copy()
        if re.fullmatch(r'/api/mobile/v1/vehicles/[1-9][0-9]*/transfers(?:/(?:destinations|preview))?', route) or route.startswith('/api/mobile/v1/vehicle-transfers/requests/'):
            own = nested_headers(headers, transfers.token('1', 7))
            result = transfers.response(path, method, body, own, state['vehicle_transfers'])
            for value in state['vehicle_transfers']['vehicles'].values():
                row = state['vehicle_profiles'][value['id']]; row['values'].update(status=value['status'], store_id=value['storeId'], revision=value['revision']); row.update(revision=value['revision'], storeName=value['storeName'], ownerStoreId=value['ownerStoreId'], ownerStoreName=value['ownerStoreName'], inTransit=value['status'] == 'in_transit', canEdit=value['storeId'] == 23); sync(state, row)
            return result
        if route.startswith('/api/mobile/v1/vehicles'):
            result = vehicle_response(path, method, body, headers, state)
            if result: return result
        if route.startswith('/api/mobile/v1/record-media/'):
            result = delete_photo(path, method, body, headers, state)
            if result: return result
        if route.startswith('/api/mobile/v1/record-media/vehicles/') or route.startswith('/api/mobile/v1/record-media/requests/') and '7:'+route.rsplit('/',1)[1] in state['vehicle_media']['requests']:
            own = nested_headers(headers, media.token('1', 7))
            return media.response(path, method, body, own, state['vehicle_media'])
        if route == '/api/mobile/v1/drafts/inventory':
            params = parse_qs(url.query); search = params.get('search', [''])[0].lower(); store = params.get('store', ['23'])[0]; rows = []
            for row in state['vehicle_profiles'].values():
                v = row['values']
                if v['status'] not in ('ready', 'using') or store != 'all' and str(v['store_id']) != store or search not in (v['name']+v['license']).lower(): continue
                vehicle = deepcopy(draft_vehicle(1)['vehicle']); vehicle.update(id=str(row['id']), name=v['name'], license=v['license'], brand=v['brand'], type_text=row['typeLabel'], year=str(v['year'] or ''), color=v['color'], stock_store_id=str(v['store_id']), stock_store_name=row['storeName'])
                rows.append({'vehicle': vehicle, 'status': v['status'], 'storeId': v['store_id'], 'storeName': row['storeName']})
            page = int(params.get('page', ['1'])[0]); return 200, {'rows': rows[(page-1)*20:page*20], 'page': page, 'hasMore': page*20 < len(rows)}, False
        if route == '/api/mobile/v1/catalogue/vehicles' or route.startswith('/api/mobile/v1/catalogue/vehicles/'):
            rows = [record(row) for row in state['vehicle_profiles'].values()]; params = parse_qs(url.query)
            if route != '/api/mobile/v1/catalogue/vehicles': return (200, next(row for row in rows if row['id'] == int(route.rsplit('/', 1)[1])), False)
            search = params.get('search', [''])[0].lower(); status = params.get('status', [''])[0]; store = params.get('store', ['all'])[0]
            rows = [row for row in rows if search in (row['name'] + row['license']).lower() and (not status or row['status'] == status) and (store == 'all' or str(row['storeId']) == store)]
            size = int(params.get('size', ['20'])[0]); pages = max(1, math.ceil(len(rows)/size)); page = min(int(params.get('page', ['1'])[0]), pages)
            return 200, {'rows': rows[(page-1)*size:page*size], 'total': len(rows), 'page': page, 'pages': pages, 'statusCounts': [], 'updatedAt': media.now()}, False
        if route.startswith('/api/mobile/v1/write-requests/') and method == 'POST':
            key = route.split('/')[-2]; operation = body.get('operation', '')
            if operation == 'vehicle.create' or operation.startswith('vehicle.update:'): return resolve(state['vehicle_requests'], key, operation)
            if re.fullmatch(r'vehicle\.(transfer|receive|reject|cancel):[1-9][0-9]*', operation): return transfers.response(path, method, body, nested_headers(headers, transfers.token('1', 7)), state['vehicle_transfers'])
            if operation.startswith('media.vehicle:'): return media.response(path, method, body, nested_headers(headers, media.token('1', 7)), state['vehicle_media'])
            if operation.startswith('media.delete.vehicle:'): return resolve(state['vehicle_delete_requests'], key, operation)
    result = base.response(path, method, body, headers, state)
    if result and route=='/api/mobile/v1/drafts/options' and method=='GET' and result[0]==200 and 'types_workspace'in state:
        result[1]['types']=[{'id':t['id'],'label':t['label'],'rentalType':t['rental_type'],'termMonths':t['term_months'],'active':t['active']} for t in state['types_workspace']['rows'].values()]
    if result and route in ('/api/mobile/v1/session', '/api/mobile/v1/workspace') and method != 'DELETE' and result[0] in (200, 201) and 'user' in result[1]: result[1]['user'] = deepcopy(USER)
    return result
