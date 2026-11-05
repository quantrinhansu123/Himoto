"""Additive synthetic voucher-delete demo; original QA rows/receipts are retained."""
import re
from copy import deepcopy
from urllib.parse import parse_qs, urlparse
from lib import mobile_cashbook_fixture as cashbook


def ensure(state):
    if 'cashbook_bulk_workspace' not in state:
        samples = []
        for index, amount, kind in [(15001, 7000, 'income'), (15002, 11000, 'income'), (15003, 3000, 'expense')]:
            samples.append({'id': str(index), 'date': '2026-11-03', 'time': '17:00:00', 'type': kind, 'actorId': '7', 'actorName': 'QA Quản lý', 'reason': 'BulkQA0311', 'content': 'Phiếu thử riêng để demo xóa có rà soát', 'storeId': '23', 'storeName': 'Cơ sở QA', 'amount': amount, 'contractId': '', 'contractCode': '', 'paymentMethod': '', 'account': '', '_kind': '', '_accountId': 0, '_category': 'other_income' if kind == 'income' else 'other_expense'})
        state['cashbook_bulk_workspace'] = {'rows': samples, 'requests': {}}
    return state['cashbook_bulk_workspace']


def response(path, method, body, headers, state):
    url=urlparse(path);route=url.path;work=ensure(state);original=cashbook.ensure(state)
    def fail(message,status=400,code='INVALID_REQUEST'):return status,{'message':message,'code':code},False
    if route=='/api/mobile/v1/cashbook/vouchers/selection' and method=='GET':
        params={key:value[0] for key,value in parse_qs(url.query).items()}
        if params.get('type') not in ('income','expense'):return fail('Chọn loại phiếu QA.')
        rows=cashbook.filtered_rows({'vouchers':original['vouchers']+work['rows']},params)
        return 200,{'type':params['type'],'rows':[{'id':row['id'],'amount':row['amount']} for row in sorted(rows,key=lambda row:int(row['id']),reverse=True) if row['type']==params['type']]},False
    receipt=re.fullmatch(r'/api/mobile/v1/cashbook/deletions/requests/([0-9a-f-]{36})',route)
    if receipt and method=='GET':
        saved=work['requests'].get(receipt[1])
        if not saved or saved.get('cancelled'):return fail('Chưa có xác nhận xóa phiếu QA.',404)
        return 200,{**saved['result'],'replayed':True},False
    recovery=re.fullmatch(r'/api/mobile/v1/write-requests/([0-9a-f-]{36})/resolve',route)
    if recovery and method=='POST' and body.get('operation')=='cashbook.delete':
        key=recovery[1];saved=work['requests'].get(key)
        if not saved:saved={'cancelled':True,'operation':'cashbook.delete'};work['requests'][key]=saved
        return 200,{'key':key,'operation':'cashbook.delete','status':'cancelled' if saved.get('cancelled') else 'committed','receipt':None if saved.get('cancelled') else {'id':saved['result']['deletedCount'],'revision':'1','replayed':True}},False
    if route!='/api/mobile/v1/cashbook/vouchers' or method!='DELETE':return None
    key=headers.get('Idempotency-Key') or headers.get('idempotency-key');ids=body.get('ids')
    if not key or not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',key):return fail('Mã xóa QA không hợp lệ.')
    if set(body)!={'ids'} or not isinstance(ids,list) or not 1<=len(ids)<=500 or any(type(index)!=int or index<=0 for index in ids) or len(set(ids))!=len(ids):return fail('Chọn1–500phiếu hợp lệ.')
    ids=sorted(ids);saved=work['requests'].get(key)
    if saved:
        if saved.get('cancelled'):return fail('Mã QA đã hủy.',409,'REQUEST_CANCELLED')
        if saved['ids']!=ids:return fail('Mã QA đã dùng cho danh sách khác.',409,'REQUEST_KEY_REUSED')
        return 200,{**saved['result'],'replayed':True},False
    available={int(row['id']) for row in original['vouchers']+work['rows']}
    if any(index not in available for index in ids):return fail('Có phiếu QA đã thay đổi. Tải lại và chọn lại.',409,'CONFLICT')
    original['vouchers'][:]=[row for row in original['vouchers'] if int(row['id']) not in ids];work['rows'][:]=[row for row in work['rows'] if int(row['id']) not in ids]
    result={'key':key,'operation':'cashbook.delete','deletedCount':len(ids),'receiptVersion':1,'replayed':False};work['requests'][key]={'operation':'cashbook.delete','ids':ids,'result':deepcopy(result)}
    return 200,result,False
