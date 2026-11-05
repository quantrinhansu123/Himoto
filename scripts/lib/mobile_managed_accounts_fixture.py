"""Isolated administrator portfolio on QA8131. No provider/DB/env access.

Only the explicit QA admin login can mutate this portfolio. Other modules are
read-only in that session; the normal QA7 session and old business rows remain.
"""
import base64
import hashlib
import json
import math
import re
from copy import deepcopy
from datetime import datetime,timedelta,timezone
from urllib.parse import parse_qs,urlparse

def response(path,method,body,headers,state):
    w=state.get('accounts_workspace');route=urlparse(path).path
    if not w:return None
    token=(headers.get('Authorization')or headers.get('authorization','')).removeprefix('Bearer ')
    def fail(message,status=400,code='INVALID_REQUEST'):return status,{'message':message,'code':code},False
    if route=='/api/mobile/v1/session' and method=='POST' and body.get('email')=='qa-accounts':
        if body.get('password')!='fixture-password':return fail('Mật khẩu QA không hợp lệ.',401,'LOGIN_FAILED')
        state['sessionSeq']+=1;value='hm1_'+base64.urlsafe_b64encode(hashlib.sha256(f'accounts:{state["sessionSeq"]}'.encode()).digest()).decode().rstrip('=');expires=(datetime.now(timezone.utc)+timedelta(hours=8)).isoformat();state['sessions'][value]=expires;w['admin_tokens'][value]=True;return 201,{'token':value,'expiresAt':expires,'user':deepcopy(w['actor'])},False
    admin=token in w['admin_tokens'] and token in state['sessions']
    if route=='/api/mobile/v1/session' and admin:
        if method=='DELETE':del state['sessions'][token];del w['admin_tokens'][token];return 200,{'success':True},False
        return 200,{'user':deepcopy(w['actor']),'expiresAt':state['sessions'][token]},False
    if route=='/api/mobile/v1/workspace' and admin:return 200,{'user':deepcopy(w['actor']),'stores':[{'id':s['id'],'name':s['name']} for s in w['options']['stores']]},False
    resolve=route.startswith('/api/mobile/v1/write-requests/') and method=='POST' and body.get('operation','').startswith('account.')
    if not route.startswith('/api/mobile/v1/accounts') and not resolve:
        if admin and method!='GET':return fail('Phiên quản trị QA chỉ chuẩn bị thao tác tài khoản; module khác chỉ đọc.',400,'QA_ACCOUNTS_SCOPE')
        return None
    if not admin:return fail('Chỉ quản trị QA được mở danh mục tài khoản.',403,'FORBIDDEN')
    parts=route.removeprefix('/api/mobile/v1/accounts').strip('/').split('/');parts=[] if parts==[''] else parts
    if resolve:
        key=route.split('/')[-2];operation=body['operation'];old=w['requests'].get(key)
        if old and old['operation']!=operation:return fail('Mã tài khoản QA không khớp.',409,'REQUEST_KEY_REUSED')
        if old and old['status']=='committed':return 200,{'key':key,'operation':operation,'status':'committed','receipt':{**old['receipt'],'replayed':True}},False
        w['requests'][key]={'operation':operation,'status':'cancelled'};return 200,{'key':key,'operation':operation,'status':'cancelled','receipt':None},False
    def visible(row):return not row.get('deleted_at')
    def profile(row):return {k:deepcopy(v) for k,v in row.items() if k!='deleted_at'}
    if method=='GET':
        if parts==['options']:return 200,deepcopy(w['options']),False
        if not parts:
            q={k:v[0] for k,v in parse_qs(urlparse(path).query).items()};search=q.get('search','').strip().lower();store=q.get('store_id');rows=[profile(r) for r in w['rows'].values() if visible(r) and (not store or not r['scope_all']and str(r['store_id'])==store) and any(search in str(r.get(k)or'').lower() for k in ['name','login_name','email','staff_code'])];pages=max(1,math.ceil(len(rows)/20));page=min(int(q.get('page',1)),pages);return 200,{'rows':rows[(page-1)*20:page*20],'total':len(rows),'page':page,'pages':pages,'staffCount':sum(bool(r.get('staff_id')) for r in rows)},False
        if len(parts)==2 and parts[0]=='requests':
            key=parts[1];old=w['requests'].get(key)
            if not old or old['status']!='committed':return fail('Chưa có xác nhận tài khoản QA.',404,'NOT_FOUND')
            row=w['rows'][str(old['receipt']['id'])];return 200,{'key':key,'operation':old['operation'],'receipt':{**old['receipt'],'replayed':True},'current':profile(row) if visible(row)else None,'deleted':not visible(row),'ownPasswordChange':False},False
        row=w['rows'].get(parts[0])
        if row and visible(row) and len(parts)==1:return 200,profile(row),False
        return fail('Không tìm thấy tài khoản QA.',404,'NOT_FOUND')
    key=headers.get('Idempotency-Key')or headers.get('idempotency-key')
    if not isinstance(key,str)or not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',key):return fail('Mã tài khoản QA không hợp lệ.')
    action='create' if not parts and method=='POST' else 'password' if len(parts)==2 and parts[1]=='password' else 'delete' if method=='DELETE'else 'update';index=parts[0]if parts else None;operation=f'account.{action}'+(f':{index}'if index else'');fingerprint=hashlib.sha256(json.dumps(body,sort_keys=True,ensure_ascii=False).encode()).hexdigest();old=w['requests'].get(key)
    if old:
        if old['status']=='cancelled':return fail('Mã tài khoản QA đã hủy.',409,'REQUEST_CANCELLED')
        if old['operation']!=operation or old['fingerprint']!=fingerprint:return fail('Mã tài khoản QA có nội dung khác.',409,'REQUEST_KEY_REUSED')
        return 200,{**old['receipt'],'replayed':True,**({'password':None,'changedAt':None}if action=='password'else{'credentials':None})},False
    row=w['rows'].get(index)if index else None
    if action!='create' and(not row or not visible(row)):return fail('Không tìm thấy tài khoản QA.',404)
    if action in('update','delete')and body.get('revision')!=row['revision']:return fail('Tài khoản QA đã thay đổi.',409)
    if action in('update','delete')and int(index)==145:return fail('Portfolio QA không sửa/xóa tài khoản đang đăng nhập.',403)
    if action=='password':
        if body!={'action':'reveal'}or not row['password_available']:return fail('Không có bản lưu mật khẩu QA.',409)
        w['audit'].append({'actor':145,'target':int(index),'action':'password_reveal'});receipt={'id':int(index),'revision':row['revision']};result={'password':'QaGenerated0311','changedAt':datetime.now(timezone.utc).isoformat()}
    elif action=='delete':
        w['revision']+=1;row['revision']=str(w['revision']);row['enabled']=False;row['status']='inactive';row['deleted_at']=datetime.now(timezone.utc).isoformat();receipt={'id':int(index),'revision':row['revision']};result={'credentials':None};w['audit'].append({'actor':145,'target':int(index),'action':'delete'})
    elif action in('create','update'):
        allowed={'name','login_name','password','access_role','store_id','scope_all','permissions','enabled'}|({'revision'}if action=='update'else set())
        if set(body)-allowed or not isinstance(body.get('name'),str)or not body['name'].strip()or not isinstance(body.get('permissions'),list)or type(body.get('enabled'))is not bool:return fail('Thông tin tài khoản QA không hợp lệ.')
        if action=='update'and body.get('password'):return fail('Không hỗ trợ đặt lại mật khẩu.',403)
        role=body.get('access_role');scope=role=='admin'or body.get('scope_all')is True;store=None if scope else body.get('store_id');target_store=next((s for s in w['options']['stores']if s['id']==store),None)
        if store is not None and not target_store or not scope and store is None and body['enabled']:return fail('Chọn cơ sở QA trước khi cho phép đăng nhập.')
        if role in('ownership_staff','ownership_manager')and target_store and target_store['kind']!='lease_to_own':return fail('Vai trò thuê sở hữu cần cơ sở thuê sở hữu.')
        login=body.get('login_name','').strip().lower()or'qa.auto0311'
        if any(r['login_name']==login and str(r['id'])!=index for r in w['rows'].values()):return fail('Tên đăng nhập QA đã tồn tại.',409)
        if action=='create':w['sequence']+=1;index=str(w['sequence'])
        w['revision']+=1;row={**(row or{}),'id':int(index),'name':body['name'].strip(),'email':(row or{}).get('email',login+'@accounts.himoto.local'),'login_name':login,'status':'active'if body['enabled']else'inactive','access_role':role,'store_id':store,'store_name':target_store['name']if target_store else None,'scope_all':scope,'permissions':deepcopy(w['actor']['permissions']if role=='admin'else[p for p in body['permissions']if p!='accounts.manage']),'enabled':body['enabled'],'revision':str(w['revision']),'password_available':True,'password_changed_at':(row or{}).get('password_changed_at',datetime.now(timezone.utc).isoformat()),'can_edit':True,'can_delete':True};w['rows'][index]=row;receipt={'id':int(index),'revision':row['revision']};result={'credentials':{'login_name':login,'password':'QaGenerated0311','enabled':row['enabled']}if action=='create'else None};w['audit'].append({'actor':145,'target':int(index),'action':action})
    else:return fail('Thao tác ngoài portfolio tài khoản QA.',400,'QA_ACCOUNTS_SCOPE')
    w['requests'][key]={'operation':operation,'status':'committed','fingerprint':fingerprint,'receipt':receipt};return 200,{**receipt,'replayed':False,**result},False
