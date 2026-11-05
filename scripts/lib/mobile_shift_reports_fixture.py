"""Durable synthetic shift workspace. No environment, network or messaging.

The initial report/options come from the actual shared SQL domain. This local
writer supports a focused PGD demo; it is not a deployed RLS/KTNB/media model.
"""
import hashlib
import json
import re
from copy import deepcopy
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import parse_qs,urlparse
ROOT=Path(__file__).resolve().parents[2]
_cache={}
def catalogue(workspace):
    meta=workspace['manifest'];path=(ROOT/meta['catalogue']).resolve();assert path.is_relative_to((ROOT/'.backups').resolve());key=(str(path),meta['sha256'])
    if key not in _cache:
        raw=path.read_bytes();assert hashlib.sha256(raw).hexdigest()==meta['sha256'];_cache[key]=json.loads(raw);assert _cache[key]['fixtureOnly']
    return _cache[key]
def stamp():return datetime.now(timezone.utc).isoformat()
def response(path,method,body,headers,state):
    url=urlparse(path);route=url.path;w=state.get('shifts_workspace')
    if not w:return None
    resolve=bool(re.fullmatch(r'/api/mobile/v1/write-requests/[0-9a-f-]{36}/resolve',route)) and method=='POST' and body.get('operation','').startswith('shift.')
    if not route.startswith('/api/mobile/v1/shift-reports') and not resolve:return None
    data=catalogue(w)
    def fail(message,status=400,code='INVALID_REQUEST'):return status,{'message':message,'code':code},False
    if resolve:
        key=route.split('/')[-2];operation=body['operation'];old=w['requests'].get(key)
        if old and old['operation']!=operation:return fail('Mã thao tác QA không khớp.',409)
        if old and old['status']=='committed':return 200,{'key':key,'operation':operation,'status':'committed','receipt':{**old['receipt'],'replayed':True}},False
        w['requests'][key]={'operation':operation,'status':'cancelled'};return 200,{'key':key,'operation':operation,'status':'cancelled','receipt':None},False
    suffix=route.removeprefix('/api/mobile/v1/shift-reports');parts=suffix.strip('/').split('/') if suffix.strip('/') else []
    if method=='GET':
        if parts==['options']:return 200,deepcopy(data['options']),False
        if not parts:
            params=parse_qs(url.query);rows=list(w['rows'].values());store=params.get('store_id',[''])[0];date=params.get('date',[''])[0]
            if store:rows=[r for r in rows if str(r['payload']['store_id'])==store]
            if date:rows=[r for r in rows if r['payload']['date']==date]
            return 200,{'rows':deepcopy(sorted(rows,key=lambda r:(r['payload']['date'],r['id']),reverse=True)[:100])},False
        if len(parts)==2 and parts[0]=='requests':
            old=w['requests'].get(parts[1]);return (200,{'key':parts[1],'operation':old['operation'],'receipt':deepcopy(old['receipt']),'current':deepcopy(w['rows'][str(old['receipt']['id'])])},False) if old and old['status']=='committed' else fail('Chưa có xác nhận báo cáo ca QA.',404,'NOT_FOUND')
        if parts==['autofill']:return fail('Portfolio QA này chuẩn bị kiểm kê đã lưu; tự điền trực tiếp từ DB cần staging hoặc bộ dữ liệu phù hợp.',503,'QA_SHIFT_SCOPE')
        row=w['rows'].get(parts[0])
        if not row:return fail('Không có báo cáo ca QA này.',404,'NOT_FOUND')
        if len(parts)==1:return 200,deepcopy(row),False
        if parts[1:] == ['telegram']:return 200,None,False
        if parts[1:] == ['audit']:
            if row['status']!='submitted':return fail('PGD cần chốt trước khi đối soát.',409)
            result=deepcopy(data['snapshot']);result['date']=row['payload']['date'];return 200,result,False
        return fail('Minh chứng chưa có trong portfolio QA này.',404,'NOT_FOUND')
    if method!='POST' or parts:return fail('Bài kiểm KTNB/media thực hiện bằng SQL nhúng; portfolio Samsung chỉ chuẩn bị PGD.',403,'QA_SHIFT_SCOPE')
    if not isinstance(body,dict) or set(body)-{'payload','id','revision','status'} or body.get('status') not in ('draft','submitted'):return fail('Thông tin báo cáo QA không hợp lệ.')
    p=body.get('payload');key=headers.get('Idempotency-Key') or headers.get('idempotency-key')
    if not isinstance(key,str) or not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',key):return fail('Mã lần lưu QA không hợp lệ.')
    if not isinstance(p,dict) or p.get('store_id')!=23 or not isinstance(p.get('staff'),str) or not p['staff'].strip() or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',p.get('date','')):return fail('Kiểm tra cơ sở, ngày và nhân sự QA.')
    numeric=['vehicles','batteries','charged','transfers','cash','personal','company','daily_vehicles','monthly_vehicles','other_vehicles','rented_batteries']
    if any(k in p and (type(p[k]) is not int or p[k]<0) for k in numeric) or p.get('charged',0)>p.get('batteries',0):return fail('Số lượng và tiền QA không hợp lệ.')
    if type(p.get('electricity_off')) is not bool or body['status']=='submitted' and not p['electricity_off']:return fail('Xác nhận tắt thiết bị điện trước khi chốt.')
    if p.get('ownership_report') is not None:return fail('Portfolio này không gửi báo cáo thuê sở hữu hoặc Telegram.',400,'QA_SHIFT_SCOPE')
    index=body.get('id');operation=f'shift.update:{index}' if index is not None else 'shift.create';fingerprint=hashlib.sha256(json.dumps(body,sort_keys=True,ensure_ascii=False).encode()).hexdigest();old=w['requests'].get(key)
    if old:
        if old['status']=='cancelled':return fail('Mã QA đã hủy.',409,'REQUEST_CANCELLED')
        if old['operation']!=operation or old['fingerprint']!=fingerprint:return fail('Mã QA có nội dung khác.',409,'REQUEST_KEY_REUSED')
        return 200,{**old['receipt'],'replayed':True},False
    if index is None:
        if any(r['payload']['date']==p['date'] for r in w['rows'].values()):return fail('Cơ sở QA đã có báo cáo ngày này.',409)
        index=w['sequence']+1;w['sequence']=index;row=deepcopy(data['record']);row.update(id=index,revision=1)
    else:
        row=w['rows'].get(str(index))
        if not row or row['status']!='draft' or row['revision']!=body.get('revision') or row['payload']['date']!=p['date']:return fail('Báo cáo đã thay đổi hoặc đã chốt.',409)
        row=deepcopy(row);row['revision']+=1
    row.update(payload=deepcopy(p),status=body['status'],updated_at=stamp());w['rows'][str(index)]=row
    receipt={'id':index,'revision':str(row['revision'])};w['requests'][key]={'operation':operation,'status':'committed','fingerprint':fingerprint,'receipt':receipt};return 200,{**receipt,'replayed':False},False
