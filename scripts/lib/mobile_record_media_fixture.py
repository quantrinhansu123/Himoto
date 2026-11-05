"""Actor-bound media QA model. Synthetic JPEGs, no accounts/storage/DB outside QA."""
import base64
import hashlib
import io
import json
import re
from copy import deepcopy
from datetime import datetime,timedelta,timezone
from urllib.parse import parse_qs,urlparse,unquote
from PIL import Image,ImageDraw

SCHEMA='himoto.qa.record-media.v1'
MODES=('none','drop','lost','conflict')
def now():return datetime.now(timezone.utc).isoformat()
def digest(v):return hashlib.sha256(json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def key(t):return f"{t['entity']}:{t['id']}:{t['kind']}:{t['referenceId']}"
def target_snapshot(t):return hashlib.sha256(json.dumps({k:t[k] for k in ('entity','id','kind','referenceId','revision','referenceRevision','label')},ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
def prepared(t):return {**deepcopy(t),'snapshot':target_snapshot(t)}
def operation(t):return f"media.{'contract' if t['entity']=='contracts' else 'vehicle'}:{t['id']}"
def slot_pattern(t):
    suffix=r'(?:-extra-([2-9]|[1-9][0-9]{1,14}))?'
    if t['kind']=='vehicle':return r'(?:registration-front|registration-back|purchase-document-[12])'+suffix
    if t['kind']=='return':return f"return-{t['referenceId']}-(?:([1-9][0-9]{{0,14}}|document-[1-9][0-9]{{0,14}}){suffix}|video-[1-3])"
    return f"{'vehicle-swap' if t['kind']=='swap' else t['kind']}-{t['referenceId']}-"+(r'[1-9][0-9]{0,14}' if t['kind']=='swap' else '1')+suffix
def label(t,slot):
    if t['kind']=='vehicle':
        base=re.sub(r'-extra-[0-9]+$','',slot);extra=re.search(r'-extra-([0-9]+)$',slot)
        return {'registration-front':'Đăng ký xe mặt trước','registration-back':'Đăng ký xe mặt sau','purchase-document-1':'Giấy mua bán trang 1','purchase-document-2':'Giấy mua bán trang 2'}[base]+(f' · Ảnh {extra[1]}' if extra else '')
    extra=re.search(r'-extra-([0-9]+)$',slot);base=slot[:extra.start()] if extra else slot;n=int(base.rsplit('-',1)[1])
    names=['Toàn cảnh xe','Đầu xe','Đuôi xe','Bên trái','Bên phải','Đồng hồ / phụ kiện']
    result=('Ảnh chuyển xe' if t['kind']=='transfer' else 'Ảnh nhận xe') if t['kind'] in ('transfer','receive') else f'Ảnh đổi xe {n}' if t['kind']=='swap' else f'Video tình trạng xe {n}' if '-video-' in base else ['Ảnh hợp đồng khi trả xe','QR / Số tài khoản khách nhận hoàn','Biên nhận thu phí / hoàn tiền'][n-1] if '-document-' in base and n<=3 else f'Ảnh hồ sơ bổ sung {n}' if '-document-' in base else names[n-1] if n<=6 else f'Ảnh hồ sơ {n}'
    return result+(f' · Ảnh {extra[1]}' if extra else '')
def slots(t):
    if t['kind']=='vehicle':return [{'slot':s,'label':label(t,s),'kind':'image'} for s in ('registration-front','registration-back','purchase-document-1','purchase-document-2')]
    prefix=f"{'vehicle-swap' if t['kind']=='swap' else t['kind']}-{t['referenceId']}"
    values=[prefix+f'-{n}' for n in range(1,16)] if t['kind'] in ('return','swap') else [prefix+'-1']
    if t['kind']=='return':values += [prefix+f'-video-{n}' for n in range(1,4)]+[prefix+f'-document-{n}' for n in range(1,16)]
    return [{'slot':s,'label':label(t,s),'kind':'video' if '-video-' in s else 'image'} for s in values]
def image_blob():
    canvas=Image.new('RGB',(640,420),'#f3f5f8');ImageDraw.Draw(canvas).text((40,190),'HIMOTO MEDIA QA - SYNTHETIC',fill='#17212d')
    output=io.BytesIO();canvas.save(output,format='JPEG',quality=85);return output.getvalue()
def seed_state():
    s={'schema':SCHEMA,'fixtureOnly':True,'records':{},'targets':{},'photos':{},'blobs':{},'requests':{},'sessions':{},'scopes':{},'sessionSeq':0,'writes':0,'photoSeq':100,'mode':'none','delayed':[],'pageError':False}
    seed_dataset(s,9100);return s
def seed_dataset(s,base):
    assert type(base) is int and 9000<=base<=9900 and base%100==0
    assert f'contracts:{base+1}' not in s['records'],'Never reset a media dataset'
    for entity,index in [('contracts',base+1),('vehicles',base+2)]:s['records'][f'{entity}:{index}']={'id':index,'entity':entity,'revision':'100','storeId':23,'code':f'HD-MEDIA-{index}' if entity=='contracts' else f'QA-MEDIA-{index}','name':'Khách media QA' if entity=='contracts' else 'Xe media QA','status':'renting' if entity=='contracts' else 'ready'}
    for n in range(1,28):
        t={'entity':'contracts','id':base+1,'kind':'return','referenceId':base*10+n,'revision':'100','referenceRevision':'100','label':f'Trả xe · QA-MEDIA-{n}'};s['targets'][key(t)]=t
    for entity,index,kind,ref,title in [('contracts',base+1,'swap',base+30,'Đổi xe · QA-CŨ → QA-MỚI'),('vehicles',base+2,'transfer',base+40,'Chuyển xe · QA-MEDIA'),('vehicles',base+2,'receive',base+41,'Nhận xe · QA-MEDIA')]:
        t={'entity':entity,'id':index,'kind':kind,'referenceId':ref,'revision':'100','referenceRevision':'100','label':title};s['targets'][key(t)]=t
    jpeg=image_blob();sha=hashlib.sha256(jpeg).hexdigest();s['blobs'][sha]=base64.b64encode(jpeg).decode()
    first=s['targets'][f'contracts:{base+1}:return:{base*10+1}']
    for n in range(1,29):save_photo(s,first,f"return-{first['referenceId']}-{n}",sha)
    save_photo(s,first,f"return-{first['referenceId']}-1-extra-12",sha)
    video=f"return-{first['referenceId']}-video-1";s['photos'][key(first)+'/'+video]={'slot':video,'revision':'100','mimeType':'video/mp4','bytes':None,'updatedAt':now(),'blobHash':None}
def save_photo(s,t,slot,sha):
    s['photoSeq']+=1;s['photos'][key(t)+'/'+slot]={'slot':slot,'revision':str(s['photoSeq']),'mimeType':'image/jpeg','bytes':len(base64.b64decode(s['blobs'][sha])),'updatedAt':now(),'blobHash':sha}
def valid_state(s):
    assert s['schema']==SCHEMA and s['fixtureOnly'] is True and s['mode'] in MODES
    for sha,data in s['blobs'].items():assert hashlib.sha256(base64.b64decode(data)).hexdigest()==sha
    for k,t in s['targets'].items():assert key(t)==k and f"{t['entity']}:{t['id']}" in s['records']
    for k,r in s['requests'].items():
        assert k==f"{r['actorId']}:{r['key']}" and r['actorId'] in (7,8) and r['status'] in ('cancelled','committed')
        assert re.fullmatch(r'media\.(contract|vehicle):[1-9][0-9]{0,14}',r['operation'])
        if r['status']=='committed':assert r['receipt']['requestId']==r['key'] and r['receipt']['actorId']==r['actorId'] and r['operation']==operation(r['receipt']['target'])
    assert s['writes']==sum(r['status']=='committed' for r in s['requests'].values());return s
def summary(s,generation):return {'fixtureOnly':True,'schema':SCHEMA,'generation':generation,'digest':digest(s),'writes':s['writes'],'receipts':[deepcopy(r['receipt']) for r in s['requests'].values() if r['status']=='committed'],'tombstones':[{'actorId':r['actorId'],'key':r['key'],'operation':r['operation']} for r in s['requests'].values() if r['status']=='cancelled'],'activeSessions':sum(v['active'] for v in s['sessions'].values())}
def token(sid,actor):return 'hm1_'+hashlib.sha256(f'media:{sid}:{actor}'.encode()).hexdigest()[:43]
def user(s,actor):return {'id':actor,'name':'QA Quản lý' if actor==7 else 'QA Đồng nghiệp','role':'staff','email':f'qa{actor}@example.invalid','permissions':['contracts.read','contracts.return','vehicles.read'],'storeId':23,'allStores':s['scopes'].get(str(actor),False)}
def view_photo(t,p):
    v={k:p[k] for k in ('slot','revision','mimeType','bytes','updatedAt')};video=p['mimeType'].startswith('video/');v.update(label=label(t,p['slot']),kind='video' if video else 'image',readable=not video,blockedReason='Video chưa hỗ trợ xem trong ứng dụng.' if video else None);return v
def current(s,proof):
    v=deepcopy(proof);t=s['targets'].get(key(proof['target']));p=s['photos'].get(key(proof['target'])+'/'+proof['slot']);r=s['records'].get(f"{proof['target']['entity']}:{proof['id']}")
    v['parentCurrent']=bool(r and r['revision']==proof['revision']);v['referenceCurrent']=bool(t and target_snapshot(t)==proof['target']['snapshot']);v['photoCurrent']=bool(p and p['revision']==proof['photoRevision'] and p['blobHash']==proof['sha256']);v['current']=all(v[k] for k in ('parentCurrent','referenceCurrent','photoCurrent'));v['replayed']=True;return v
def response(path,method,body,headers,s):
    u=urlparse(path);route=unquote(u.path);params=parse_qs(u.query);headers={k.lower():v for k,v in headers.items()}
    if route=='/api/mobile/v1/session' and method=='POST':
        actor={'qa':7,'qa8':8,'qa-receiver':8}.get(body.get('email'))
        if not actor or body.get('password')!='fixture-password':return 401,{'message':'Sai tài khoản QA.'},False
        s['sessionSeq']+=1;sid=str(s['sessionSeq']);s['sessions'][sid]={'actorId':actor,'active':True,'expiresAt':(datetime.now(timezone.utc)+timedelta(hours=8)).isoformat()}
        return 200,{'token':token(sid,actor),'user':user(s,actor),'expiresAt':s['sessions'][sid]['expiresAt']},False
    found=next(((sid,v) for sid,v in s['sessions'].items() if v['active'] and datetime.fromisoformat(v['expiresAt'])>datetime.now(timezone.utc) and headers.get('authorization')=='Bearer '+token(sid,v['actorId'])),None)
    if not found:return 401,{'message':'Phiên QA hết hạn.','code':'SESSION_EXPIRED'},False
    sid,session=found;actor=session['actorId'];profile=user(s,actor)
    if route=='/api/mobile/v1/session':
        if method=='DELETE':session['active']=False;return 200,{'success':True},False
        return 200,{'user':profile,'expiresAt':session['expiresAt']},False
    if route=='/api/mobile/v1/workspace':return 200,{'user':profile,'stores':[{'id':23,'name':'Cơ sở QA'}]},False
    if '/catalogue/' in route:
        parts=route.split('/catalogue/')[1].split('/');kind=parts[0];rows=[]
        for r in s['records'].values():
            if r['entity']!=kind:continue
            rows.append({**{k:v for k,v in r.items() if k!='entity'},'storeName':'Cơ sở QA','license':r['code'] if kind=='vehicles' else 'QA-MEDIA','vehicleName':'Xe media QA','phone':'0900000000','startsAt':'2026-11-01T01:00:00Z','endsAt':'2026-11-03T01:00:00Z','totalAmount':500000,'paidAmount':100000,'brand':'QA','color':'Đỏ','odometer':1234})
        if len(parts)==2:return (200,next(r for r in rows if str(r['id'])==parts[1]),False) if any(str(r['id'])==parts[1] for r in rows) else (404,{'message':'Không có hồ sơ QA.'},False)
        search=params.get('search',[''])[0].lower();rows=[r for r in rows if search in (r['name']+r['code']).lower()];size=int(params.get('size',['20'])[0]);page=int(params.get('page',['1'])[0])
        return 200,{'rows':rows[(page-1)*size:page*size],'page':page,'pages':max(1,(len(rows)+size-1)//size),'total':len(rows),'statusCounts':[],'updatedAt':now()},False
    resolve=re.fullmatch(r'/api/mobile/v1/write-requests/([a-f0-9-]+)/resolve',route)
    if resolve:
        k=resolve[1];op=body['operation'];saved=s['requests'].get(f'{actor}:{k}')
        if saved and saved['operation']!=op:return 409,{'message':'Mã thuộc thao tác khác.','code':'REQUEST_KEY_REUSED'},False
        if not saved:saved={'actorId':actor,'key':k,'operation':op,'status':'cancelled','receipt':None};s['requests'][f'{actor}:{k}']=saved
        proof=saved['receipt'];return 200,{'key':k,'operation':op,'status':saved['status'],'receipt':{'id':proof['id'],'revision':proof['revision'],'replayed':True} if proof else None},False
    if route.startswith('/api/mobile/v1/record-media/requests/'):
        saved=s['requests'].get(f"{actor}:{route.rsplit('/',1)[1]}");return 200,{'receipt':current(s,saved['receipt']) if saved and saved['status']=='committed' else None},False
    match=re.fullmatch(r'/api/mobile/v1/record-media/(contracts|vehicles)/([1-9][0-9]*)(?:/(return|swap|transfer|receive|vehicle)/([1-9][0-9]*)(?:/([^/]+))?)?',route)
    if not match:return 404,{'message':'Endpoint ngoài media fixture.'},False
    entity,index,kind,ref,slot=match.groups();index=int(index);record=s['records'].get(f'{entity}:{index}')
    if not record:return 404,{'message':'Không có hồ sơ QA.','code':'NOT_FOUND'},False
    page=int(params.get('page',['1'])[0])
    if s['pageError'] and page>1:return 503,{'message':'Lỗi tải trang ảnh QA.','code':'SERVICE_UNAVAILABLE'},False
    if not kind:
        ts=[v for v in s['targets'].values() if v['entity']==entity and v['id']==index];ts.sort(key=lambda t:(t['kind'],t['referenceId']),reverse=True)
        return 200,{'entity':entity,'id':index,'page':page,'hasMore':len(ts)>page*25,'rows':[prepared(t) for t in ts[(page-1)*25:page*25]],'observedAt':now()},False
    t=s['targets'].get(f'{entity}:{index}:{kind}:{ref}')
    if not t:return 404,{'message':'Lượt ghi nhận không thuộc hồ sơ.','code':'NOT_FOUND'},False
    ps=sorted([p for name,p in s['photos'].items() if name.startswith(key(t)+'/')],key=lambda p:p['slot']);photo=s['photos'].get(key(t)+'/'+str(slot))
    if not slot:return 200,{'target':prepared(t),'slots':slots(t),'page':page,'hasMore':len(ps)>page*25,'rows':[view_photo(t,p) for p in ps[(page-1)*25:page*25]],'observedAt':now()},False
    if not re.fullmatch(slot_pattern(t),slot):return 400,{'message':'Ô ảnh không đúng lượt.','code':'INVALID_MEDIA_TARGET'},False
    if method=='GET':
        if 'revision' in params:
            if not photo:return 404,{'message':'Không có ảnh.','code':'NOT_FOUND'},False
            if params['revision'][0]!=photo['revision']:return 409,{'message':'Ảnh đã thay đổi.','code':'MEDIA_REVIEW_REQUIRED'},False
            return 200,{'_bytesBase64':s['blobs'][photo['blobHash']],'mimeType':photo['mimeType']},False
        base=re.sub(r'-extra-[0-9]+$','',slot);largest=max([int(p['slot'].split('-extra-')[1]) for p in ps if p['slot'].startswith(base+'-extra-')]+[1]);next_slot=base+'-extra-'+str(largest+1) if '-video-' not in base else None
        return 200,{'target':prepared(t),'slot':slot,'label':label(t,slot),'photo':view_photo(t,photo) if photo else None,'nextSlot':next_slot if next_slot!=slot else None,'observedAt':now()},False
    k=headers.get('idempotency-key');assert k and re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}',k)
    old=s['requests'].get(f'{actor}:{k}');fingerprint=digest({'body':body,'target':key(t),'slot':slot,'headers':{k:v for k,v in headers.items() if k.startswith('x-')}})
    if old:
        if old['status']=='cancelled':return 409,{'message':'Mã đã hủy.','code':'REQUEST_CANCELLED'},False
        if old['fingerprint']!=fingerprint:return 409,{'message':'Nội dung mã cũ khác.','code':'REQUEST_KEY_REUSED'},False
        return 200,current(s,old['receipt']),False
    mode=s['mode'];s['mode']='none'
    if mode=='drop':s['delayed'].append({'path':path,'method':method,'body':deepcopy(body),'headers':deepcopy(headers)});return 503,{'message':'Chưa xác nhận được ảnh QA.','code':'SERVICE_UNAVAILABLE'},False
    if mode=='conflict':t['referenceRevision']=str(int(t['referenceRevision'])+1)
    if headers.get('x-record-revision')!=t['revision'] or headers.get('x-reference-revision')!=t['referenceRevision'] or headers.get('x-media-snapshot')!=target_snapshot(t) or headers.get('x-photo-revision')!=(photo['revision'] if photo else '0'):
        return 409,{'message':'Hồ sơ/lượt/ảnh đã thay đổi. Tải lại trước khi lưu.','code':'MEDIA_REVIEW_REQUIRED'},False
    data=base64.b64decode(body['jpeg']);assert 0<len(data)<=2*1024*1024 and data.startswith(b'\xff\xd8\xff')
    sha=hashlib.sha256(data).hexdigest();s['blobs'][sha]=body['jpeg'];save_photo(s,t,slot,sha);p=s['photos'][key(t)+'/'+slot]
    proof={'id':index,'revision':t['revision'],'requestId':k,'replayed':False,'target':prepared(t),'slot':slot,'label':label(t,slot),'photoRevision':p['revision'],'sha256':sha,'bytes':len(data),'actorId':actor,'actorName':profile['name'],'recordedAt':p['updatedAt'],'parentCurrent':True,'referenceCurrent':True,'photoCurrent':True,'current':True}
    s['requests'][f'{actor}:{k}']={'actorId':actor,'key':k,'operation':operation(t),'fingerprint':fingerprint,'status':'committed','receipt':deepcopy(proof)};s['writes']+=1
    return (503,{'message':'Phản hồi ảnh QA bị mất sau commit.','code':'SERVICE_UNAVAILABLE'},False) if mode=='lost' else (200,proof,False)
