"""QA-only reminder workspace: saved SQL context, local fake delivery, no network.

This small portfolio supports reminder and linked record smoke, not other
financial/vehicle actions of that contract. It never changes previous QA fields.
"""
import hashlib
import json
import math
import re
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT=Path(__file__).resolve().parents[2]
_cache={}

def data(workspace):
    meta=workspace['manifest'];path=(ROOT/meta['catalogue']).resolve();assert path.is_relative_to((ROOT/'.backups').resolve())
    key=(str(path),meta['sha256'])
    if key not in _cache:
        raw=path.read_bytes();assert hashlib.sha256(raw).hexdigest()==meta['sha256'];value=json.loads(raw);assert value['fixtureOnly'];_cache[key]=value
    return _cache[key]

def now():return datetime.now(timezone.utc).isoformat()

def response(path,method,body,headers,state):
    url=urlparse(path);route=url.path;workspace=state.get('reminders_workspace')
    if not workspace:return None
    fixture=data(workspace);context=fixture['context'];index=context['id'];operation=f'reminder.send:{index}'
    is_resolve=bool(re.fullmatch(r'/api/mobile/v1/write-requests/[0-9a-f-]{36}/resolve',route)) and method=='POST' and body.get('operation','').startswith('reminder.send:')
    if not route.startswith('/api/mobile/v1/debt-reminders') and not is_resolve and route!=f'/api/mobile/v1/catalogue/contracts/{index}':return None
    def fail(message,status=400,code='INVALID_REQUEST'):return status,{'message':message,'code':code},False
    params=parse_qs(url.query,keep_blank_values=True)
    if any(len(v)!=1 for v in params.values()):return fail('Bộ lọc QA trùng lặp.')
    if is_resolve:
        key=route.split('/')[-2];previous=workspace['requests'].get(key)
        if body.get('operation')!=operation:return fail('Hợp đồng QA không khớp.',409)
        if previous and previous['status']=='committed':return 200,{'key':key,'operation':operation,'status':'committed','receipt':{'id':index,'revision':context['revision'],'replayed':True}},False
        workspace['requests'][key]={'status':'cancelled','operation':operation};return 200,{'key':key,'operation':operation,'status':'cancelled','receipt':None},False
    if method=='GET':
        if route==f'/api/mobile/v1/catalogue/contracts/{index}':return 200,deepcopy(fixture['record']),False
        if route=='/api/mobile/v1/debt-reminders/options':return 200,deepcopy(fixture['options']),False
        if route==f'/api/mobile/v1/debt-reminders/context/{index}':return 200,deepcopy(context),False
        if route.startswith('/api/mobile/v1/debt-reminders/requests/'):
            key=route.split('/')[-1];row=workspace['rows'].get(key)
            return (200,{'key':key,'receipt':deepcopy(row)},False) if row else fail('Chưa có lịch sử gửi trong phạm vi QA.',404,'NOT_FOUND')
        if route in ('/api/mobile/v1/debt-reminders','/api/mobile/v1/debt-reminders/contracts'):
            if set(params)-{'store','page',*(['search'] if route.endswith('/contracts') else [])}:return fail('Bộ lọc QA không hợp lệ.')
            store=params.get('store',['all'])[0];page=params.get('page',['1'])[0]
            if store not in ('all',str(context['store_id'])) or not re.fullmatch(r'[1-9]\d{0,5}',page):return fail('Cơ sở/trang QA không hợp lệ.')
            if route.endswith('/contracts'):
                term=params.get('search',[''])[0].strip().lower();row=deepcopy(fixture['record']);rows=[row] if not term or term in ' '.join([row['code'],row['name'],row['phone']]).lower() else []
                return 200,{'rows':rows if page=='1' else [],'total':len(rows),'page':int(page),'pages':1,'statusCounts':[],'updatedAt':now()},False
            rows=sorted(workspace['rows'].values(),key=lambda r:(r['created_at'],r['request_id']),reverse=True);start=(int(page)-1)*20
            return 200,{'rows':deepcopy(rows[start:start+20]),'total':len(rows),'page':int(page),'pages':max(1,math.ceil(len(rows)/20))},False
        return fail('Không có hợp đồng nhắc nợ QA này.',404,'NOT_FOUND')
    if method=='POST' and route=='/api/mobile/v1/debt-reminders':
        key=headers.get('Idempotency-Key') or headers.get('idempotency-key');expected={'order_id':index,'revision':context['revision'],'amount':context['amount'],'phone':context['phone']}
        if not isinstance(key,str) or not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',key):return fail('Mã lần gửi QA không hợp lệ.')
        if set(body)!={*expected,'message'} or not all(body.get(k)==v for k,v in expected.items()) or not isinstance(body.get('message'),str) or not 1<=len(body['message'].strip())<=4000:return fail('Kiểm tra công nợ, phiên bản, số điện thoại và nội dung QA.',409)
        normalized={**body,'message':body['message'].strip()};fingerprint=hashlib.sha256(json.dumps(normalized,sort_keys=True).encode()).hexdigest();previous=workspace['requests'].get(key)
        if previous:
            if previous['status']=='cancelled':return fail('Mã thao tác QA đã hủy.',409,'REQUEST_CANCELLED')
            if previous['fingerprint']!=fingerprint:return fail('Mã lần gửi có nội dung khác.',409,'REQUEST_KEY_REUSED')
            return 200,{'request_id':key,'status':workspace['rows'][key]['status'],'replayed':True},False
        if any((datetime.now(timezone.utc)-datetime.fromisoformat(r['created_at'])).total_seconds()<60 and r['status'] in ('pending','accepted','unknown') for r in workspace['rows'].values()):return fail('Hợp đồng QA vừa được nhắc trong vòng60giây.',429)
        # Local accepted result only. This module deliberately has no HTTP client.
        workspace['rows'][key]={'request_id':key,'order_id':index,'store_id':context['store_id'],'contract_code':context['code'],'store_name':context['store_name'],'customer_name':context['customer_name'],'phone':context['phone'],'message':normalized['message'],'amount':context['amount'],'status':'accepted','created_at':now(),'actor_name':'Người gửi QA'}
        workspace['requests'][key]={'status':'committed','operation':operation,'fingerprint':fingerprint};return 200,{'request_id':key,'status':'accepted','replayed':False},False
    return fail('Thao tác không hỗ trợ trong portfolio nhắc nợ QA.',405)
