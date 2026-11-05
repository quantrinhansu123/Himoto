"""Local catalogue for Samsung UI. Source SQL is checked separately; no network/env."""
import hashlib
import json
import re
from copy import deepcopy
from uuid import uuid4
from urllib.parse import urlparse

def response(path,method,body,headers,state):
    route=urlparse(path).path;w=state.get('types_workspace')
    if not w or not route.startswith('/api/mobile/v1/contract-types'):return None
    parts=route.removeprefix('/api/mobile/v1/contract-types').strip('/').split('/');parts=[] if parts==[''] else parts
    def fail(message,status=400,code='INVALID_REQUEST'):return status,{'message':message,'code':code},False
    def rows():return deepcopy(list(w['rows'].values()))
    if method=='GET':
        if not parts:return 200,rows(),False
        if len(parts)==2 and parts[0]=='requests':
            key=parts[1];old=w['requests'].get(key)
            if not old or old['status']!='committed':return fail('Chưa có xác nhận danh mục QA.',404,'NOT_FOUND')
            return 200,{'key':key,'operation':old['operation'],'receipt':{**old['receipt'],'replayed':True},'current':deepcopy(w['rows'][old['receipt']['typeId']])},False
        return fail('Đường dẫn danh mục QA chưa hỗ trợ.',404)
    if len(parts)==3 and parts[0]=='requests' and parts[2]=='resolve' and method=='POST':
        key=parts[1];operation=body.get('operation');old=w['requests'].get(key)
        if operation not in ('ctype.create','ctype.update'):return fail('Thao tác đối chiếu danh mục QA không hợp lệ.')
        if old and old['operation']!=operation:return fail('Mã danh mục QA có thao tác khác.',409,'REQUEST_KEY_REUSED')
        if not old:w['requests'][key]={'operation':operation,'status':'cancelled'}
        return 200,{'key':key,'operation':operation,'resourceKind':'contract-type',**({'status':'committed','receipt':{**old['receipt'],'replayed':True}} if old and old['status']=='committed' else {'status':'cancelled','receipt':None})},False
    if parts or method not in ('POST','PATCH'):return fail('Thao tác danh mục QA chưa hỗ trợ.')
    key=headers.get('Idempotency-Key') or headers.get('idempotency-key');operation='ctype.create' if method=='POST' else 'ctype.update'
    if not isinstance(key,str) or not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',key):return fail('Mã danh mục QA không hợp lệ.')
    fingerprint=hashlib.sha256(json.dumps(body,sort_keys=True,ensure_ascii=False).encode()).hexdigest();old=w['requests'].get(key)
    if old:
        if old['status']=='cancelled':return fail('Mã danh mục QA đã hủy.',409,'REQUEST_CANCELLED')
        if old['operation']!=operation or old['fingerprint']!=fingerprint:return fail('Mã danh mục QA có nội dung khác.',409,'REQUEST_KEY_REUSED')
        return 200,{**old['receipt'],'replayed':True},False
    allowed={'id','revision','label','active'} if method=='PATCH' else {'label','rental_type','term_months','active'};label=body.get('label')
    if set(body)-allowed or not isinstance(label,str) or not label.strip() or len(label)>80 or type(body.get('active')) is not bool:return fail('Thông tin loại hợp đồng QA không hợp lệ.')
    label=label.strip()
    if any(r['label'].strip().lower()==label.lower() and r['id']!=body.get('id') for r in w['rows'].values()):return fail('Tên danh mục QA đã tồn tại.',409)
    if method=='PATCH':
        row=w['rows'].get(body.get('id'))
        if not row or row['revision']!=body.get('revision'):return fail('Loại hợp đồng QA đã thay đổi.',409)
        next_row={**row,'label':label,'active':body['active']}
    else:
        billing=body.get('rental_type');months=body.get('term_months')
        if billing not in ('daily','monthly','ownership') or months is not None and (type(months)is not int or not 1<=months<=120) or billing=='daily' and months is not None:return fail('Cách tính/thời hạn QA không hợp lệ.')
        next_row={'id':'custom_'+str(uuid4()),'label':label,'rental_type':billing,'term_months':months,'active':body['active']}
    w['revision']+=1;next_row['revision']=str(w['revision']);w['rows'][next_row['id']]=next_row;receipt={'typeId':next_row['id'],'revision':next_row['revision']};w['requests'][key]={'operation':operation,'status':'committed','fingerprint':fingerprint,'receipt':receipt};return 200,{**receipt,'replayed':False},False
