"""Durable synthetic customer-paper copy. No providers, env or operational data."""
import hashlib,json,re
from copy import deepcopy
from datetime import datetime,timezone
from urllib.parse import urlparse
from lib.mobile_contract_photos_fixture import photo_label
from lib.mobile_record_media_fixture import image_blob
import base64

MODES=('copy-lost','copy-drop','copy-conflict')
SOURCE=re.compile(r'^(id_front|id_back|driver_license)(-extra-[1-9][0-9]{0,14})?$')
def now():return datetime.now(timezone.utc).isoformat()
def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
def mapped(slot):return re.sub(r'^(id_front|id_back|driver_license)',lambda m:{'id_front':'customer-id-front','id_back':'customer-id-back','driver_license':'customer-driver-license'}[m[1]],slot)
def seed_copy_sources(state):
    assert not state.get('customer_photo_copy_seeded') and not state.get('document_photos'),'Never reseed existing customer papers'
    payload=base64.b64encode(image_blob()).decode();rows={}
    for index,slot in enumerate(['id_front','id_back','driver_license','id_front-extra-2'],1):
        rows[f'1:{slot}']={'photo':{'slot':slot,'label':'Giấy tờ khách QA','revision':str(8000+index),'mimeType':'image/jpeg','bytes':len(base64.b64decode(payload)),'updatedAt':now(),'kind':'image','readable':True,'blockedReason':None},'jpeg':payload}
    state['document_photos']=rows;state['customer_photo_copy_seeded']=True
def destinations(state,index):return {k:v for k,v in state.get('contract_photos',{}).items() if k.startswith(str(index)+':') and v['photo']['slot'].startswith(('customer-id-front','customer-id-back','customer-driver-license'))}
def review(state,profile):
    index=profile['id'];customer=profile['input']['draft']['customer_id']
    if customer is not None:customer=int(customer)
    sources={k:v for k,v in state.get('document_photos',{}).items() if customer is not None and k.startswith(str(customer)+':') and SOURCE.fullmatch(v['photo']['slot'])}
    existing=destinations(state,index);present=sum(f"{index}:{mapped(v['photo']['slot'])}" in existing for v in sources.values())
    return {'id':index,'revision':profile['revision'],'customerId':customer,'sourceCount':len(sources),'missingCount':len(sources)-present,'presentCount':present,
        'snapshot':digest({'revision':profile['revision'],'customer':customer,'sources':sources,'existing':existing}),'observedAt':now()},sources
def current_receipt(state,receipt):
    result={**deepcopy(receipt),'replayed':True};profile=state['draft_profiles'].get(receipt['id'])
    result['parentCurrent']=bool(profile and profile['revision']==receipt['revision'] and profile['input']['draft']['customer_id']==receipt['customerId'])
    result['photosCurrent']=digest(destinations(state,receipt['id']))==receipt['resultSnapshot'];result['current']=result['parentCurrent'] and result['photosCurrent'];return result
def summary(state):return {'customerPhotoCopyWrites':state.get('customer_photo_copy_writes',0),'customerPhotoCopyRows':deepcopy(state.get('customer_photo_copy_receipts',{}))}
def response(path,method,body,headers,state):
    match=re.fullmatch(r'/api/mobile/v1/record-media/contracts/([1-9]\d*)/copy-customer(?:/([a-f0-9-]{36}))?',urlparse(path).path)
    if not match:return None
    index,key=match.groups();index=int(index);profile=state['draft_profiles'].get(index)
    if not profile:return 404,{'code':'NOT_FOUND','message':'QA chưa có hợp đồng'},False
    headers={k.lower():v for k,v in headers.items()}
    if key:
        saved=state.get('customer_photo_copy_receipts',{}).get(key);receipt=current_receipt(state,saved['receipt']) if saved and saved['receipt']['id']==index else None
        return 200,{'receipt':receipt},False
    prepared,sources=review(state,profile)
    if method=='GET':return 200,prepared,False
    if method!='POST' or body:return 400,{'code':'INVALID_CUSTOMER_PHOTO_COPY','message':'QA invalid copy'},False
    key=headers['idempotency-key'];operation=f'media.copy:{index}'
    if key in state.get('tombstones',{}):return 409,{'code':'REQUEST_CANCELLED','message':'QA mã lấy giấy tờ đã khóa'},False
    saved=state.get('customer_photo_copy_receipts',{}).get(key)
    if saved:
        assert saved['id']==index and saved['revision']==headers['x-record-revision'] and saved['snapshot']==headers['x-customer-photo-snapshot']
        return 200,current_receipt(state,saved['receipt']),False
    if state.get('mode')=='copy-drop':state['mode']='none';state['delayed_customer_photo_copy']={'path':path,'method':method,'body':deepcopy(body),'headers':headers};return 503,{'code':'SERVICE_UNAVAILABLE','message':'QA chưa nhận yêu cầu lấy giấy tờ.'},False
    if state.get('mode')=='copy-conflict':state['mode']='none';return 409,{'code':'CUSTOMER_PHOTO_COPY_REVIEW_REQUIRED','message':'QA hợp đồng hoặc giấy tờ đã thay đổi.'},False
    if prepared['revision']!=headers.get('x-record-revision') or prepared['snapshot']!=headers.get('x-customer-photo-snapshot'):return 409,{'code':'CUSTOMER_PHOTO_COPY_REVIEW_REQUIRED','message':'QA bản rà soát đã cũ'},False
    state.setdefault('customer_photo_copy_events',[]).append({'kind':'copy','id':index,'photosBeforeCopy':state.get('contract_photo_writes',0),'draftCreates':state['draft_creates']})
    photos=state.setdefault('contract_photos',{});copied=0
    for source in sources.values():
        slot=mapped(source['photo']['slot']);identity=f'{index}:{slot}'
        if identity in photos:continue
        copied+=1;photo={**deepcopy(source['photo']),'slot':slot,'label':photo_label(slot,profile),'revision':str(4000+len(photos)),'updatedAt':now()}
        photos[identity]={'photo':photo,'jpeg':source['jpeg'],'kind':'rental','referenceId':index,'entityId':index}
    assert copied==prepared['missingCount'];state['customer_photo_copy_writes']=state.get('customer_photo_copy_writes',0)+1
    receipt={'id':index,'revision':prepared['revision'],'requestId':key,'replayed':False,'customerId':prepared['customerId'],'copied':copied,'sourceCount':prepared['sourceCount'],'presentCount':prepared['presentCount'],
        'resultSnapshot':digest(destinations(state,index)),'actorId':7,'actorName':'QA Quản lý','recordedAt':now(),'parentCurrent':True,'photosCurrent':True,'current':True}
    state.setdefault('customer_photo_copy_receipts',{})[key]={'id':index,'revision':prepared['revision'],'snapshot':prepared['snapshot'],'receipt':receipt,'operation':operation}
    lost=state.get('mode')=='copy-lost'
    if lost:state['mode']='none'
    return 200,deepcopy(receipt),lost
