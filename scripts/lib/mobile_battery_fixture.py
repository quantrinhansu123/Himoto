"""Synthetic battery workflow on an isolated checkpoint. No network or env.

The initial contract/options come from actual PGlite domains. Native smoke
uses unpaid renewal/return/soft delete only; financial source is checked in SQL.
"""
import hashlib
import json
import math
import re
from copy import deepcopy
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import parse_qs,urlparse
ROOT=Path(__file__).resolve().parents[2]
_cache={}
def catalogue(w):
    m=w['manifest'];p=(ROOT/m['catalogue']).resolve();assert p.is_relative_to((ROOT/'.backups').resolve());key=(str(p),m['sha256'])
    if key not in _cache:
        raw=p.read_bytes();assert hashlib.sha256(raw).hexdigest()==m['sha256'];_cache[key]=json.loads(raw);assert _cache[key]['fixtureOnly']
    return _cache[key]
def stamp():return datetime.now(timezone.utc).isoformat()
def context(w,index,with_accounts=True):
    c=deepcopy(w['contracts'].get(str(index)));assert c and not c.get('deleted_at');c.pop('deleted_at',None);events=deepcopy(w['history'].get(str(index),[]));due=sum(e.get('amount',0) for e in events if e['action']=='renew');collected=sum(e.get('collected',0) for e in events if e['action']=='renew');return {'contract':c,'history':events,'accounts':deepcopy(catalogue(w)['context']['accounts']) if with_accounts else [],'renewal_amount':due,'renewal_collected':collected,'renewal_remaining':max(due-collected,0)}
def response(path,method,body,headers,state):
    url=urlparse(path);route=url.path;w=state.get('battery_workspace')
    if not w:return None
    resolve=bool(re.fullmatch(r'/api/mobile/v1/write-requests/[0-9a-f-]{36}/resolve',route)) and method=='POST' and body.get('operation','').startswith('battery.')
    if not route.startswith('/api/mobile/v1/battery-contracts') and not resolve:return None
    data=catalogue(w)
    def fail(message,status=400,code='INVALID_REQUEST'):return status,{'message':message,'code':code},False
    if resolve:
        key=route.split('/')[-2];old=w['requests'].get(key);operation=body['operation']
        if old and old['operation']!=operation:return fail('Mã thao tác QA không khớp.',409)
        if old and old['status']=='committed':return 200,{'key':key,'operation':operation,'status':'committed','receipt':{**old['receipt'],'replayed':True}},False
        w['requests'][key]={'operation':operation,'status':'cancelled'};return 200,{'key':key,'operation':operation,'status':'cancelled','receipt':None},False
    parts=route.removeprefix('/api/mobile/v1/battery-contracts').strip('/').split('/');parts=[] if parts==[''] else parts
    q={k:v[0] for k,v in parse_qs(url.query).items()}
    if method=='GET':
        if parts==['options']:return 200,deepcopy(data['options']),False
        if not parts:
            allrows=[deepcopy(c) for c in w['contracts'].values() if not c.get('deleted_at')];store=q.get('store_id');source=q.get('vehicle_contract_id')
            scope=[c for c in allrows if not store or str(c['store_id'])==store];rows=[c for c in scope if (not source or str(c.get('vehicle_contract_id'))==source) and (not q.get('status') or c['status']==q['status']) and (not q.get('search') or q['search'].lower() in ' '.join(str(c.get(k,'')) for k in ['code','customer_name','customer_phone','customer_id_card','vehicle_license','staff_name']).lower())];page=int(q.get('page',1));pages=max(1,math.ceil(len(rows)/20));page=min(page,pages)
            return 200,{'rows':rows[(page-1)*20:page*20],'scopeCount':len(scope),'total':len(rows),'page':page,'pages':pages,'statusCounts':[{'status':s,'count':sum(c['status']==s for c in scope)} for s in ['renting','returned','cancelled']]},False
        if len(parts)==2 and parts[0]=='requests':
            old=w['requests'].get(parts[1]);c=w['contracts'].get(str(old['receipt']['id'])) if old and old['status']=='committed' else None
            return (200,{'key':parts[1],'operation':old['operation'],'receipt':deepcopy(old['receipt']),'current':None if c.get('deleted_at') else deepcopy(c),'deleted':bool(c.get('deleted_at'))},False) if c else fail('Chưa có xác nhận pin QA.',404,'NOT_FOUND')
        c=w['contracts'].get(parts[0])
        if not c or c.get('deleted_at'):return fail('Hợp đồng pin QA không còn tồn tại.',404,'NOT_FOUND')
        if len(parts)==1 or parts[1:]==['actions']:return 200,context(w,parts[0]),False
        if parts[1:]==['telegram']:
            key=q.get('request_id','');return 200,{'eligible':False,'battery_contract_id':c['id'],'request_id':key,'destination_label':'Nhóm QA cục bộ','text':'Lượt trả pin QA chỉ lưu trên thiết bị thử nghiệm; không gửi tin ra ngoài.','status':None,'can_send':False,'message_count':0},False
        return fail('Bộ lọc/prefill ngoài portfolio pin QA đã chuẩn bị.',400,'QA_BATTERY_SCOPE')
    if not parts:return fail('Bài demo pin này chuẩn bị hồ sơ có sẵn; tạo/sửa được kiểm bằng SQL nhúng.',400,'QA_BATTERY_SCOPE')
    c=w['contracts'].get(parts[0])
    if not c:return fail('Không có hợp đồng pin QA này.',404)
    action=body.get('action') if len(parts)==2 and parts[1]=='actions' else 'delete' if method=='DELETE' else 'update'
    key=headers.get('Idempotency-Key') or headers.get('idempotency-key');operation=f'battery.{action}:{c["id"]}'
    if not isinstance(key,str) or not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',key):return fail('Mã thao tác pin QA không hợp lệ.')
    fingerprint=hashlib.sha256(json.dumps(body,sort_keys=True,ensure_ascii=False).encode()).hexdigest();old=w['requests'].get(key)
    if old:
        if old['status']=='cancelled':return fail('Mã pin QA đã hủy.',409,'REQUEST_CANCELLED')
        if old['operation']!=operation or old['fingerprint']!=fingerprint:return fail('Mã pin QA có nội dung khác.',409,'REQUEST_KEY_REUSED')
        return 200,{**old['receipt'],'replayed':True},False
    if c.get('deleted_at') or body.get('revision')!=c['revision']:return fail('Hợp đồng pin QA đã thay đổi.',409)
    if action=='delete':c['deleted_at']=stamp()
    elif action=='renew':
        if c['status']!='renting' or not isinstance(body.get('ends_at'),str) or body['ends_at']<=(c['ends_at'] or c['starts_at']) or type(body.get('amount')) is not int or body['amount']<0 or 'receipt'in body:return fail('Portfolio QA chỉ chuẩn bị gia hạn chưa thu đúng hạn.',409,'QA_BATTERY_SCOPE')
        w['history'].setdefault(parts[0],[]).append({'request_id':key,'request_hash':fingerprint,'action':'renew','at':stamp(),'actor_id':7,'actor_name':'QA Pin','note':body.get('note',''),'before_ends_at':c['ends_at'],'ends_at':body['ends_at'],'amount':body['amount'],'collected':0,'remaining':body['amount']});c['ends_at']=body['ends_at']
    elif action=='return':
        if c['status']!='renting' or not isinstance(body.get('returned_at'),str) or body['returned_at']<c['starts_at']:return fail('Thời điểm/trạng thái nhận lại pin QA không hợp lệ.',409)
        c['status']='returned';w['history'].setdefault(parts[0],[]).append({'request_id':key,'request_hash':fingerprint,'action':'return','at':stamp(),'actor_id':7,'actor_name':'QA Pin','note':body.get('note',''),'returned_at':body['returned_at'],'collected':0})
    else:return fail('Thao tác pin ngoài portfolio native; kiểm bằng SQL hoặc staging.',400,'QA_BATTERY_SCOPE')
    c['revision']=str(int(c['revision'])+1);receipt={'id':c['id'],'revision':c['revision']};w['requests'][key]={'operation':operation,'status':'committed','fingerprint':fingerprint,'receipt':receipt};return 200,{**receipt,'replayed':False},False
