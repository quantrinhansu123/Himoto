"""Additive synthetic cashbook for the preserved QA8131 demo, never a live DB.

Actual shared web domain and SQL are checked separately by check-mobile-cashbook.cjs.
"""
import math
import re
from datetime import datetime, timezone
from copy import deepcopy
from urllib.parse import parse_qs, urlparse

KEYS = ['deposit_income', 'rental_income', 'renewal_income', 'late_fee_income', 'repair_income', 'extra_income', 'other_income', 'deposit_refund_expense', 'rental_refund_expense', 'other_expense']


def ensure(state):
    if 'cashbook_workspace' not in state:
        cash = {'id': 12000, 'kind': 'cash', 'revision': '400', 'label': 'Két QA cơ sở', 'name': 'Két QA cơ sở', 'storeId': 23, 'storeName': 'Cơ sở QA', 'ownerType': '', 'status': 'active', 'bankName': '', 'ownerName': '', 'accountNumber': '', 'opening': 1000000, 'income': 0, 'expense': 0, 'balance': 1000000, 'voucherCount': 0}
        bank = {**cash, 'id': 12000, 'kind': 'bank', 'label': 'Ngân hàng QA · Công ty QA · QA000', 'name': '', 'storeId': 0, 'storeName': '', 'ownerType': 'company', 'bankName': 'Ngân hàng QA', 'ownerName': 'Công ty QA', 'accountNumber': 'QA000', 'opening': 2000000, 'balance': 2000000}
        vouchers = []
        for n, (category, amount, reason) in enumerate([('deposit_income', 500000, 'Thu tiền cọc'), ('rental_income', 200000, 'Thanh toán hợp đồng'), ('renewal_income', 100000, 'Thu tiền gia hạn'), ('late_fee_income', 50000, 'Thu phí trả muộn'), ('repair_income', 20000, 'Thu phí sửa chữa'), ('extra_income', 10000, 'Phiếu thu thêm hợp đồng'), ('other_income', 5000, 'Thu khác'), ('deposit_refund_expense', 100000, 'Trả cọc cho khách'), ('rental_refund_expense', 50000, 'Hoàn tiền thuê trả sớm'), ('other_expense', 10000, 'Chi khác')], 1):
            vouchers.append({'id': str(13000+n), 'date': '2026-11-03', 'time': f'09:{n:02}:00', 'type': 'expense' if category.endswith('_expense') else 'income', 'actorId': '7', 'actorName': 'QA Quản lý', 'reason': reason, 'content': 'Phiếu tổng hợp QA để demo sổ quỹ', 'storeId': '23', 'storeName': 'Cơ sở QA', 'amount': amount, 'contractId': '', 'contractCode': '', 'paymentMethod': 'Tiền mặt', 'account': cash['name'], '_kind': 'cash', '_accountId': 12000, '_category': category})
        state['cashbook_workspace'] = {'sequence': 12000, 'revision': 400, 'requests': {}, 'profiles': {'cash:12000': cash, 'bank:12000': bank}, 'vouchers': vouchers}
    return state['cashbook_workspace']


def current(work, kind, index):
    row = deepcopy(work['profiles'].get(f'{kind}:{index}'))
    if row:
        vouchers = [v for v in work['vouchers'] if v['_kind'] == kind and v['_accountId'] == index]
        row['income'] = sum(v['amount'] for v in vouchers if v['type'] == 'income'); row['expense'] = sum(v['amount'] for v in vouchers if v['type'] == 'expense')
        row['balance'] = row['opening']+row['income']-row['expense']; row['voucherCount'] = len(vouchers)
    return row


def filtered_rows(work, params):
    return [deepcopy(v) for v in work['vouchers'] if (not params.get('store_id') or params['store_id'] == 'all' or params['store_id'] == v['storeId']) and (not params.get('from') or v['date'] >= params['from']) and (not params.get('to') or v['date'] <= params['to']) and (not params.get('actor') or params['actor'] == 'id:'+v['actorId']) and params.get('search', '').lower() in ' '.join(str(x) for x in v.values()).lower()]


def export_csv(rows):
    headers = ['ID', 'Ngày', 'Giờ', 'Loại phiếu', 'Người thực hiện', 'Số tiền', 'Mã hợp đồng', 'Hình thức thanh toán', 'Tài khoản nhận / chi', 'Cơ sở', 'Lý do', 'Nội dung']
    def cell(value):
        value = str(value); value = "'"+value if re.match(r'^[=+\-@\t\r]', value) else value
        return '"'+value.replace('"', '""')+'"'
    def values(v):
        return [v['id'], '/'.join(reversed(v['date'].split('-'))), v['time'], 'Phiếu thu' if v['type'] == 'income' else 'Phiếu chi', v['actorName'], format(v['amount'], ',').replace(',', '.')+' ₫', v['contractCode'] or '—', v['paymentMethod'], v['account'], v['storeName'], v['reason'], v['content']]
    return '\ufeff'+'\r\n'.join(','.join(cell(value) for value in line) for line in [headers, *[values(v) for v in sorted(rows, key=lambda v: int(v['id']), reverse=True)]])


def response(path, method, body, headers, state):
    url = urlparse(path); route = url.path; work = ensure(state); params = {key: value[0] for key, value in parse_qs(url.query).items()}
    def fail(message, status=400, code='INVALID_REQUEST'): return status, {'message': message, 'code': code}, False
    if route == '/api/mobile/v1/cashbook/export' and method == 'GET':
        if set(params)-{'store_id', 'actor', 'from', 'to', 'search'}: return fail('Bộ lọc xuất QA không hợp lệ.')
        rows = filtered_rows({'vouchers': work['vouchers']+state.get('cashbook_bulk_workspace', {}).get('rows', [])}, params)
        return 200, {'filename': 'himoto-so-quy-qa-'+datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')+'.csv', 'mimeType': 'text/csv', 'content': export_csv(rows), 'rowCount': len(rows)}, False
    if route == '/api/mobile/v1/cashbook' and method == 'GET':
        rows = filtered_rows({'vouchers': work['vouchers']+state.get('cashbook_bulk_workspace', {}).get('rows', [])}, params)
        def page(kind):
            selected = [v for v in rows if v['type'] == kind]; size = int(params.get(kind+'_limit', 5)); count = len(selected); page = min(int(params.get(kind+'_page', 1)), max(1, math.ceil(count/size)))
            key = params.get(kind+'_sort', 'date'); key = {'actor_name': 'actorName', 'contract_code': 'contractCode', 'payment_method': 'paymentMethod', 'store_name': 'storeName'}.get(key, key)
            selected.sort(key=lambda v: (v[key] if key != 'date' else v['date']+' '+v['time'], int(v['id'])), reverse=params.get(kind+'_direction', 'desc') == 'desc')
            return {'rows': [{key: value for key, value in v.items() if not key.startswith('_')} for v in selected[(page-1)*size:page*size]], 'total': count, 'amount': sum(v['amount'] for v in selected), 'page': page, 'pageSize': size}
        return 200, {'total': len(work['vouchers'])+len(state.get('cashbook_bulk_workspace', {}).get('rows', [])), 'income': page('income'), 'expense': page('expense'), 'actors': [['id:7', 'QA Quản lý · #7']], 'breakdown': {key: sum(v['amount'] for v in rows if v['_category'] == key) for key in KEYS}}, False
    if route == '/api/mobile/v1/cashbook/accounts' and method == 'GET':
        rows = [current(work, v['kind'], v['id']) for v in work['profiles'].values()]
        rows = [v for v in rows if (params.get('store_id', 'all') == 'all' or str(v['storeId']) == params['store_id'] or v['ownerType'] == 'company' and not v['storeId']) and (params.get('status', 'active') == 'all' or params.get('status', 'active') == v['status'])]
        return 200, {'rows': rows}, False
    if route == '/api/mobile/v1/cashbook/accounts/options' and method == 'GET': return 200, {'stores': [{'id': 23, 'name': 'Cơ sở QA'}]}, False
    receipt = re.fullmatch(r'/api/mobile/v1/cashbook/accounts/requests/([0-9a-f-]{36})', route)
    if receipt and method == 'GET':
        saved = work['requests'].get(receipt[1])
        if not saved or saved.get('cancelled'): return fail('Chưa có xác nhận tài khoản QA.', 404)
        kind = saved['operation'].split('.')[0]; row = current(work, kind, saved['receipt']['id'])
        return 200, {'key': receipt[1], 'kind': kind, 'operation': saved['operation'], 'receipt': {**saved['receipt'], 'replayed': True}, 'current': row, 'deleted': row is None}, False
    recovery = re.fullmatch(r'/api/mobile/v1/write-requests/([0-9a-f-]{36})/resolve', route)
    if recovery and method == 'POST' and re.match(r'^(cash|bank)\.', str(body.get('operation', ''))):
        key = recovery[1]; operation = body['operation']; saved = work['requests'].get(key)
        if saved and saved['operation'] != operation: return fail('Mã QA thuộc thao tác khác.', 409)
        if not saved: saved = {'operation': operation, 'cancelled': True}; work['requests'][key] = saved
        return 200, {'key': key, 'operation': operation, 'status': 'cancelled' if saved.get('cancelled') else 'committed', 'receipt': None if saved.get('cancelled') else {**saved['receipt'], 'replayed': True}}, False
    item = re.fullmatch(r'/api/mobile/v1/cashbook/accounts/(cash|bank)(?:/([1-9][0-9]*)(?:/(status|transactions))?)?', route)
    if not item: return None
    kind = item[1]; index = int(item[2]) if item[2] else None; old = current(work, kind, index) if index is not None else None
    if method == 'GET':
        if not old: return fail('Tài khoản QA không còn tồn tại.', 404)
        if item[3] == 'transactions':
            rows = [v for v in work['vouchers'] if v['_kind'] == kind and v['_accountId'] == index and (not params.get('from') or v['date'] >= params['from']) and (not params.get('to') or v['date'] <= params['to'])]
            return 200, {'kind': kind, 'id': index, 'sourceLimit': 2000, 'rows': [{key: v[key] for key in ['id', 'date', 'time', 'type', 'amount', 'actorName', 'contractCode', 'content']} for v in reversed(rows)][:2000]}, False
        return 200, old, False
    action = 'create' if index is None and method == 'POST' else 'status' if item[3] == 'status' and method == 'PATCH' else 'update' if method == 'PATCH' else 'delete' if method == 'DELETE' else None
    if not action: return None
    key = headers.get('Idempotency-Key') or headers.get('idempotency-key')
    if not key or not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', key): return fail('Mã yêu cầu QA không hợp lệ.')
    operation = f'{kind}.{action}'+(f':{index}' if index is not None else ''); saved = work['requests'].get(key)
    if saved:
        if saved.get('cancelled'): return fail('Mã QA đã hủy.', 409, 'REQUEST_CANCELLED')
        if saved['body'] != body or saved['operation'] != operation: return fail('Mã QA đã dùng.', 409, 'REQUEST_KEY_REUSED')
        return 200, {**saved['receipt'], 'replayed': True}, False
    if index is not None and not old: return fail('Tài khoản QA không còn tồn tại.', 404)
    if old and body.get('revision') != old['revision']: return fail('Tài khoản QA đã thay đổi. Mở lại trước khi lưu.', 409, 'CONFLICT')
    if action == 'delete':
        if set(body) != {'revision'}: return fail('Phiên bản tài khoản QA không hợp lệ.')
        if old['voucherCount']: return fail('Tài khoản đã có phiếu. Chọn Ngừng sử dụng.', 409, 'CONFLICT')
        revision = old['revision']; del work['profiles'][f'{kind}:{index}']
    elif action == 'status':
        if set(body) != {'revision', 'status'} or body['status'] not in ('active', 'inactive'): return fail('Trạng thái QA không hợp lệ.')
        work['revision'] += 1; revision = str(work['revision']); work['profiles'][f'{kind}:{index}'].update(status=body['status'], revision=revision)
    else:
        if body.get('status') not in ('active', 'inactive') or not isinstance(body.get('opening_balance'), (int, float)) or not float(body['opening_balance']).is_integer() or abs(body['opening_balance']) > 1e13: return fail('Thông tin QA không hợp lệ.')
        company = kind == 'bank' and body.get('owner_type') == 'company'; store_id = int(body.get('store_id') or 0)
        if store_id != 23 and not (company and store_id == 0): return fail('Cơ sở QA không hợp lệ.')
        if kind == 'bank' and not all(isinstance(body.get(key), str) and body[key].strip() and len(body[key].strip()) <= 191 for key in ['bank_name', 'owner_name', 'account_number']): return fail('Thông tin ngân hàng QA không hợp lệ.')
        if index is None: work['sequence'] += 1; index = work['sequence']
        work['revision'] += 1; revision = str(work['revision']); name = body.get('name', '').strip() if kind == 'cash' else ''; bank_name = body.get('bank_name', '').strip() if kind == 'bank' else ''; owner_name = body.get('owner_name', '').strip() if kind == 'bank' else ''; number = body.get('account_number', '').strip() if kind == 'bank' else ''
        work['profiles'][f'{kind}:{index}'] = {'id': index, 'kind': kind, 'revision': revision, 'label': name or f'Két tiền mặt #{index}' if kind == 'cash' else ' · '.join([bank_name, owner_name, number]), 'name': name, 'storeId': store_id, 'storeName': 'Cơ sở QA' if store_id == 23 else '', 'ownerType': 'company' if company else '' if kind == 'cash' else 'unknown', 'status': body['status'], 'bankName': bank_name, 'ownerName': owner_name, 'accountNumber': number, 'opening': body['opening_balance'], 'income': 0, 'expense': 0, 'balance': body['opening_balance'], 'voucherCount': 0}
    proof = {'id': index, 'revision': revision, 'replayed': False}; work['requests'][key] = {'operation': operation, 'body': deepcopy(body), 'receipt': proof}
    return 201 if action == 'create' else 200, proof, False
