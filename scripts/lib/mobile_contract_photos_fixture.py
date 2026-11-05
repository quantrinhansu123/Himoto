"""Synthetic plate recognition and contract photo receipts; no providers or DB."""
import base64
import hashlib
import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse
from lib.mobile_draft_fixture import draft_vehicle

MODES=('contract-photo-lost','contract-photo-drop','contract-photo-conflict','contract-photo-license-lost','contract-photo-transaction-drop','plate-ocr-failure','plate-ambiguous','plate-mismatch')
def now():return datetime.now(timezone.utc).isoformat()

def photo_label(slot,profile):
    extra=re.search(r'-extra-([2-9]|[1-9]\d{1,14})$',slot)
    if extra:return photo_label(slot[:extra.start()],profile)+' · Ảnh '+extra[1]
    if slot.startswith('plate-'):
        row=next((v for v in profile['input']['draft']['vehicles'] if v['id']==slot[6:]),None)
        return 'Ảnh biển số '+(row['license'] if row else 'xe đã chọn')
    if slot.startswith('rental-signed-'):return 'Khi thuê · Hợp đồng đã ký · Trang '+slot.rsplit('-',1)[1]
    if slot.startswith('rental-video-'):return 'Khi thuê · Video '+slot.rsplit('-',1)[1]
    return {'rental-document-1':'Khi thuê · Hợp đồng đã ký','rental-document-2':'Khi thuê · Bill chuyển khoản / tổng tiền mặt','driver-license':'Giấy phép lái xe','rental-1':'Khi thuê · Ảnh tổng thể xe','handover-1':'Giao xe · Ảnh tổng thể xe','customer-id-front':'CCCD mặt trước / Hộ chiếu','customer-id-back':'CCCD mặt sau / Trang bổ sung','customer-driver-license':'Giấy phép lái xe'}.get(slot,'Ảnh hồ sơ bổ sung')
def vehicle(index):
    row=draft_vehicle(index);row['vehicle']['license']={3:'50A-123.45',4:'51B-678.90'}.get(index,f'59C-{10000+index}')
    return row
def summary(state):
    return {'contractPhotoWrites':state.get('contract_photo_writes',0),'plateOcrCalls':state.get('plate_ocr_calls',0),
        'contractPhotoRows':[{k:v for k,v in row.items() if k!='jpeg'} for row in state.get('contract_photos',{}).values()],
        'contractPhotoReceipts':deepcopy(state.get('contract_photo_receipts',{})),'contractPhotoKeys':state.get('contract_photo_keys',[])}
def target(profile,kind,reference):
    index=profile['id'];label='Ảnh lập hợp đồng / giao xe'
    if kind=='plate':
        row=next((v for v in profile['input']['draft']['vehicles'] if v['id']==str(reference)),None)
        if not row:return None
        label='Biển số · '+row['license']
    elif kind!='rental' or reference!=index:return None
    result={'entity':'contracts','id':index,'kind':kind,'referenceId':reference,'revision':profile['revision'],'referenceRevision':profile['revision'],'label':label}
    result['snapshot']=hashlib.sha256(json.dumps(result,ensure_ascii=False,separators=(',',':')).encode()).hexdigest();return result
def response(path,method,body,headers,state):
    url=urlparse(path);headers={k.lower():v for k,v in headers.items()};query=parse_qs(url.query)
    if state.get('contract_photo_inventory') and url.path=='/api/mobile/v1/drafts/inventory':
        search=query.get('search',[''])[0].lower();page=int(query.get('page',['1'])[0]);rows=[vehicle(i) for i in range(1,24)]
        rows=[row for row in rows if search in (row['vehicle']['license']+' '+row['vehicle']['name']).lower()]
        return 200,{'page':page,'hasMore':page*20<len(rows),'rows':rows[(page-1)*20:page*20]},False
    if url.path=='/api/mobile/v1/drafts/plate-ocr':
        state['plate_ocr_calls']=state.get('plate_ocr_calls',0)+1
        if state.get('mode')=='plate-ocr-failure':state['mode']='none';return 503,{'code':'OCR_UNAVAILABLE','message':'QA chưa đọc được biển số. Ảnh được giữ.'},False
        license='51B-678.90' if state.get('mode')=='plate-mismatch' else '50A-123.45'
        if state.get('mode')=='plate-mismatch':state['mode']='none'
        return 200,{'requestId':headers['x-ocr-request'],'kind':'plate','fields':{'license':license},'warnings':[]},False
    if url.path=='/api/mobile/v1/drafts/plate-lookup':
        license=query.get('license',[''])[0];ambiguous=state.get('mode')=='plate-ambiguous'
        if ambiguous:state['mode']='none'
        index=4 if re.sub(r'[^A-Z0-9]','',license.upper())=='51B67890' else 3
        return 200,{'license':license,'match':'ambiguous' if ambiguous else 'unique','vehicle':None if ambiguous else vehicle(index),'observedAt':now()},False
    if url.path.startswith('/api/mobile/v1/record-media/requests/'):
        saved=state.get('contract_photo_receipts',{}).get(url.path.rsplit('/',1)[1])
        if saved:return 200,{'receipt':{**deepcopy(saved['receipt']),'replayed':True}},False
        return None
    match=re.fullmatch(r'/api/mobile/v1/record-media/contracts/([1-9]\d*)(?:/(rental|plate)/([1-9]\d*)(?:/([^/]+))?)?',url.path)
    if not match:return None
    index,kind,reference,slot=match.groups();index=int(index);profile=state.get('draft_profiles',{}).get(index)
    if not profile:return 404,{'code':'NOT_FOUND','message':'QA draft missing'},False
    if not kind:
        rows=[target(profile,'rental',index)]+[target(profile,'plate',int(v['id'])) for v in profile['input']['draft']['vehicles'] if v['id']]
        return 200,{'entity':'contracts','id':index,'page':1,'hasMore':False,'rows':rows,'observedAt':now()},False
    reference=int(reference);prepared=target(profile,kind,reference)
    if not prepared:return 404,{'code':'NOT_FOUND','message':'QA wrong vehicle'},False
    slots=[{'slot':f'plate-{reference}','label':'Ảnh biển số xe','kind':'image'}] if kind=='plate' else [
        {'slot':s,'label':photo_label(s,profile),'kind':'image'} for s in ['rental-document-1','rental-document-2','driver-license','rental-1','rental-signed-2','handover-1']]
    photos=state.setdefault('contract_photos',{})
    if slot is None:
        rows=[v['photo'] for k,v in photos.items() if k.startswith(str(index)+':') and (v['kind']==kind and v['referenceId']==reference)]
        return 200,{'target':prepared,'slots':slots,'rows':rows,'page':1,'hasMore':False,'observedAt':now()},False
    valid=bool(re.fullmatch(fr'plate-{reference}(?:-extra-[2-9]\d*)?',slot)) if kind=='plate' else bool(re.fullmatch(r'(?:(?:rental-(?:document-|signed-)?[1-9]\d*|handover-[1-9]\d*|driver-license)(?:-extra-[2-9]\d*)?|(?:rental|handover)-video-[1-3])',slot))
    if not valid:return 400,{'code':'INVALID_MEDIA_TARGET','message':'QA wrong slot'},False
    old=photos.get(f'{index}:{slot}');photo=old['photo'] if old else None
    if method=='GET':
        revision=query.get('revision',[None])[0]
        if revision:
            if not old or revision!=photo['revision']:return 409,{'code':'MEDIA_REVIEW_REQUIRED','message':'QA photo changed'},False
            return 200,{'_bytesBase64':old['jpeg'],'mimeType':'image/jpeg'},False
        return 200,{'target':prepared,'slot':slot,'label':photo_label(slot,profile),'photo':photo,'nextSlot':None,'observedAt':now()},False
    if method!='PUT':return 405,{'message':'QA unsupported'},False
    key=headers['idempotency-key'];operation=f'media.contract:{index}'
    state.setdefault('contract_photo_keys',[]).append(key)
    if key in state.get('tombstones',{}):return 409,{'code':'REQUEST_CANCELLED','message':'QA photo key cancelled'},False
    saved=state.setdefault('contract_photo_receipts',{}).get(key)
    if saved:
        assert saved['body']==body and saved['receipt']['slot']==slot
        return 200,{**deepcopy(saved['receipt']),'replayed':True},False
    if state.get('mode')=='contract-photo-drop' or state.get('mode')=='contract-photo-transaction-drop' and slot=='rental-document-1':
        state['mode']='none';state['delayed_contract_photo']={'path':path,'method':method,'body':deepcopy(body),'headers':headers};return 503,{'code':'SERVICE_UNAVAILABLE','message':'QA chưa nhận được ảnh hợp đồng.'},False
    if state.get('mode')=='contract-photo-conflict':state['mode']='none';return 409,{'code':'MEDIA_REVIEW_REQUIRED','message':'QA ảnh hoặc hợp đồng đã đổi. Giữ ảnh để rà soát lại.'},False
    if headers.get('x-record-revision')!=profile['revision'] or headers.get('x-reference-revision')!=profile['revision'] or headers.get('x-media-snapshot')!=prepared['snapshot'] or headers.get('x-photo-revision')!=(photo['revision'] if photo else '0'):
        return 409,{'code':'MEDIA_REVIEW_REQUIRED','message':'QA stale contract photo'},False
    data=base64.b64decode(body['jpeg']);assert 0<len(data)<=2*1024*1024 and data[:3]==b'\xff\xd8\xff'
    state['contract_photo_writes']=state.get('contract_photo_writes',0)+1;revision=str(2000+state['contract_photo_writes'])
    stored={'slot':slot,'label':photo_label(slot,profile),'revision':revision,'mimeType':'image/jpeg','bytes':len(data),'updatedAt':now(),'kind':'image','readable':True,'blockedReason':None}
    photos[f'{index}:{slot}']={'photo':stored,'jpeg':body['jpeg'],'kind':kind,'referenceId':reference,'entityId':index}
    receipt={'id':index,'revision':profile['revision'],'replayed':False,'requestId':key,'target':prepared,'slot':slot,'label':photo_label(slot,profile),'photoRevision':revision,
        'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'actorId':7,'actorName':'QA Quản lý','recordedAt':now(),'parentCurrent':True,'referenceCurrent':True,'photoCurrent':True,'current':True}
    state['contract_photo_receipts'][key]={'body':deepcopy(body),'receipt':receipt,'operation':operation}
    lost=state.get('mode')=='contract-photo-lost' or state.get('mode')=='contract-photo-license-lost' and slot=='driver-license'
    if lost:state['mode']='none'
    return 200,deepcopy(receipt),lost
