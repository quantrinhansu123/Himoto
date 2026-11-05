"""Persistent historical-entry QA portfolio from actual isolated SQL readers.

No environment/provider/operational database. Only this explicit scenario may write.
"""
import hashlib
import json
import re
from copy import deepcopy
from datetime import datetime,timezone
from urllib.parse import urlparse,parse_qs

def response(path,method,body,headers,state):
    w=state.get('backfill_workspace');route=urlparse(path).path;token=(headers.get('Authorization')or headers.get('authorization','')).removeprefix('Bearer ')
    if not w or token not in state['sessions']:return None
    def fail(message,status=400,code='INVALID_REQUEST'):return status,{'message':message,'code':code},False
    admin=token in state['accounts_workspace']['admin_tokens'];actor=145 if admin else 7
    q={k:v[0]for k,v in parse_qs(urlparse(path).query).items()};r=w['renewal'];f=w['finance'];index=str(r['id'])
    if route=='/api/mobile/v1/operations/contracts'and method=='GET'and q.get('scope')=='backfill':
        search=q.get('search','').lower();rows=[deepcopy(w['record'])]if search in(w['record']['code']+w['record']['name']+w['record']['license']+w['record']['phone']).lower()and q.get('store','all')in('all','23')else[]
        return 200,{'rows':rows,'total':len(rows),'page':1,'pages':1,'statusCounts':[],'updatedAt':datetime.now(timezone.utc).isoformat(),'scope':'backfill'},False
    if route==f'/api/mobile/v1/catalogue/contracts/{index}'and method=='GET':return 200,deepcopy(w['record']),False
    if route==f'/api/mobile/v1/contracts/{index}/finance'and method=='GET':return 200,deepcopy(f),False
    if route==f'/api/mobile/v1/contracts/{index}/renewals'and method=='GET':
        result=deepcopy(r)
        if q.get('backfill')!='1':result.pop('backfill',None);result.update(available=False,blockedReason='Hợp đồng không còn xe đang thuê.',items={'page':1,'pages':1,'total':0,'rows':[]})
        return 200,result,False
    matched=re.fullmatch(r'/api/mobile/v1/(renewals|payments)/requests/([0-9a-f-]{36})',route)
    if matched and method=='GET':
        saved=w['requests'].get(matched[2]);prefix='renewal.record'if matched[1]=='renewals'else'payment.record';found=saved and saved['actor']==actor and saved['operation']==f'{prefix}:{index}'and saved['status']=='committed'
        if not saved:return None
        return 200,{'receipt':{**saved['receipt'],'replayed':True}if found else None},False
    matched=re.fullmatch(r'/api/mobile/v1/write-requests/([0-9a-f-]{36})/resolve',route)
    if matched and method=='POST':
        operation=body.get('operation');saved=w['requests'].get(matched[1])
        if operation not in(f'renewal.record:{index}',f'payment.record:{index}'):return None
        if saved and(saved['actor']!=actor or saved['operation']!=operation):return fail('Mã nhập bổ sung ngoài phạm vi QA.',409,'REQUEST_KEY_REUSED')
        if not saved:w['requests'][matched[1]]={'actor':actor,'operation':operation,'status':'cancelled'}
        return 200,{'key':matched[1],'operation':operation,'status':'committed'if saved and saved['status']=='committed'else'cancelled','receipt':{k:saved['receipt'][k]for k in('id','revision')}if saved and saved['status']=='committed'else None},False
    if route not in(f'/api/mobile/v1/contracts/{index}/renewals',f'/api/mobile/v1/contracts/{index}/payments')or method!='POST':return None
    if actor!=7:return fail('Portfolio này ghi bằng QA7, giữ nguyên tài khoản quản trị.',403,'FORBIDDEN')
    key=headers.get('Idempotency-Key')or headers.get('idempotency-key');operation=f'{"renewal"if route.endswith("renewals")else"payment"}.record:{index}'
    if not isinstance(key,str)or not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',key):return fail('Mã nhập bổ sung QA không hợp lệ.')
    fingerprint=hashlib.sha256(json.dumps(body,sort_keys=True,ensure_ascii=False).encode()).hexdigest();saved=w['requests'].get(key)
    if saved:
        if saved['status']=='cancelled':return fail('Mã QA đã hủy.',409,'REQUEST_CANCELLED')
        if saved['actor']!=actor or saved['operation']!=operation or saved['fingerprint']!=fingerprint:return fail('Mã QA có nội dung khác.',409,'REQUEST_KEY_REUSED')
        return 200,{**saved['receipt'],'replayed':True},False
    def past(value):
        try:return bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}',value))and datetime.fromisoformat(value+'+07:00')<=datetime.now(timezone.utc)
        except(TypeError,ValueError):return False
    if operation.startswith('renewal.'):
        item=r['items']['rows'][0]
        if w['renewals']or body.get('receipt')or body.get('amount')!='100000'or body.get('outside_amount')not in(None,'0'):return fail('Portfolio native chỉ gia hạn lịch sử chưa thu100000; bill/thu tiền kiểm bằng SQL nhúng.',400,'QA_BACKFILL_SCOPE')
        at=body.get('occurred_at','');end=body.get('return_at','')
        if not past(at)or not past(end)or not('2026-10-01T08:00'<=at<='2026-10-05T08:00')or at>end or end<='2026-10-02T08:00':return fail('Ngày lịch sử QA ngoài lượt thuê.')
        if body.get('item_id')!=item['id']or body.get('item_revision')!=item['revision']or body.get('order_revision')!=r['revision']or body.get('expected_version')!=r['nextVersion']:return fail('Lượt thuê QA đã đổi.',409,'RENEWAL_CONFLICT')
        revision=str(int(r['revision'])+1);end_iso=datetime.fromisoformat(end+'+07:00').astimezone(timezone.utc).isoformat();version=r['nextVersion'];r.update(revision=revision,status='wait_payment',totalAmount=600000,rentalRemaining=100000,nextVersion=version+1);item.update(revision=revision,returnAt=end_iso);r['evidence'].update(slot=f'renewal-{version+1}-document-1',present=False);f.update(revision=revision,status='wait_payment',totalAmount=600000,rentalRemaining=100000);f['purposes']=['debt','extra'];w['renewals']+=1
        receipt={'id':r['id'],'revision':revision,'version':version,'returnAt':end_iso,'amount':100000,'totalAmount':600000,'collected':False,'collection':None,'transactionId':None,'outsideAmount':0,'outsideTransactionId':None,'billRevision':None,'warning':None,'current':True}
    else:
        if not w['renewals']or w['payments']or body.get('purpose')!='debt'or body.get('amount')!='50000'or body.get('method')!='cash'or body.get('account_id')!=1:return fail('Portfolio native chỉ bổ sung thu nợ thực tế50000 sau gia hạn.',400,'QA_BACKFILL_SCOPE')
        if body.get('revision')!=f['revision']or body.get('expected_total')!=f['totalAmount']or body.get('expected_remaining')!=f['rentalRemaining']:return fail('Số dư QA đã đổi.',409,'PAYMENT_CONFLICT')
        if not past(body.get('paid_at','')):return fail('Ngày thu QA không hợp lệ.')
        revision=str(int(f['revision'])+1);paid_at=datetime.fromisoformat(body['paid_at']+'+07:00').astimezone(timezone.utc).isoformat();f.update(revision=revision,rentalPaid=550000,rentalRemaining=50000);r.update(revision=revision,rentalPaid=550000,rentalRemaining=50000);f['history'].update(total=1,page=1,pages=1,rows=[{'id':39001,'direction':'in','deposit':False,'amount':50000,'paidAt':paid_at,'method':'Tiền mặt','account':'Két QA','note':body.get('note',''),'noteTruncated':False,'actor':'QA Quản lý','status':'approved','renewalVersion':None}]);w['payments']+=1;receipt={'id':r['id'],'revision':revision,'transactionId':39001}
    w['record'].update(status=f['status'],totalAmount=f['totalAmount'],paidAmount=f['rentalPaid']);w['requests'][key]={'actor':actor,'operation':operation,'fingerprint':fingerprint,'status':'committed','receipt':receipt};return 200,{**receipt,'replayed':False},False
