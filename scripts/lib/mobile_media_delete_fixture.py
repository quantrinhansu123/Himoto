"""Synthetic photo deletion with durable proofs/tombstones; no operational data."""
import base64,json,re
from copy import deepcopy
from datetime import datetime,timezone
from urllib.parse import urlparse
from lib.mobile_draft_fixture import TEMPLATE
from lib.mobile_record_media_fixture import image_blob
from lib.mobile_contract_photos_fixture import response as contract_response,photo_label
from lib.mobile_customer_documents_fixture import document_response

MODES=('delete-lost','delete-drop','delete-conflict')
def now():return datetime.now(timezone.utc).isoformat()
def deletion_operation(entity,index):return 'media.delete.'+{'contracts':'contract','customers':'customer','vehicles':'vehicle'}[entity]+':'+str(index)
def seed_delete_sources(state):
    assert not state.get('media_delete_seeded') and not state['draft_profiles'] and not state.get('contract_photos'),'Never reset a written deletion dataset'
    body=deepcopy(TEMPLATE);body['draft']['contract_number']='96041';body['draft']['customer_id']=None;body['draft']['customer']['name']='MediaDeleteQA';body['revision']='100'
    state['draft_profiles'][2001]={'id':2001,'code':'NHAP-2001','revision':'100','input':body};state['draft_creates']=1;state['media_delete_seeded']=True
    photos=state.setdefault('contract_photos',{});data=image_blob();content=base64.b64encode(data).decode()
    for n,slot in enumerate(['rental-document-1','rental-document-2','rental-1','rental-video-1'],1):
        video='-video-' in slot;photo={'slot':slot,'label':photo_label(slot,state['draft_profiles'][2001]),'revision':str(9000+n),'mimeType':'video/mp4' if video else 'image/jpeg','bytes':None if video else len(data),'updatedAt':now(),'kind':'video' if video else 'image','readable':not video,'blockedReason':'Video chưa hỗ trợ xem trong ứng dụng.' if video else None}
        photos['2001:'+slot]={'photo':photo,'jpeg':content if not video else '', 'kind':'rental','referenceId':2001,'entityId':2001}
def replace_photo(state,slot):
    assert state.get('media_delete_seeded') and slot in ['rental-document-1','rental-document-2','rental-1']
    count=state.get('media_delete_replacements',0)+1;state['media_delete_replacements']=count;data=image_blob()+('QA replacement '+str(count)).encode();profile=state['draft_profiles'][2001]
    photo={'slot':slot,'label':photo_label(slot,profile),'revision':str(10000+count),'mimeType':'image/jpeg','bytes':len(data),'updatedAt':now(),'kind':'image','readable':True,'blockedReason':None}
    state.setdefault('contract_photos',{})['2001:'+slot]={'photo':photo,'jpeg':base64.b64encode(data).decode(),'kind':'rental','referenceId':2001,'entityId':2001}
def current_receipt(state,proof):
    result={**deepcopy(proof),'replayed':True};target=proof['target'];table='document_photos' if target['entity']=='customers' else 'contract_photos'
    result['slotEmpty']=f"{target['id']}:{proof['photo']['slot']}" not in state.get(table,{})
    if target['entity']=='contracts':
        parent=state['draft_profiles'].get(target['id']);result['parentCurrent']=bool(parent and parent['revision']==target['revision'])
        found=contract_response(f"/api/mobile/v1/record-media/contracts/{target['id']}/{target['kind']}/{target['referenceId']}/{proof['photo']['slot']}",'GET',{}, {},state)
        result['referenceCurrent']=bool(found and found[0]==200 and found[1]['target']['snapshot']==target['snapshot'])
    result['current']=result['parentCurrent'] and result['referenceCurrent'] and result['slotEmpty'];return result
def summary(state):return {'mediaDeletes':state.get('media_deletes',0),'mediaDeleteReceipts':deepcopy(state.get('media_delete_receipts',{}))}
def response(path,method,body,headers,state):
    url=urlparse(path);headers={k.lower():v for k,v in headers.items()}
    if method=='GET' and state.get('media_delete_image_failure') and url.path.endswith('/rental-1') and 'revision=' in url.query:
        return 503,{'code':'SERVICE_UNAVAILABLE','message':'QA synthetic image download failed'},False
    receipt=re.fullmatch(r'/api/mobile/v1/record-media/deletions/(contracts|customers|vehicles)/([1-9]\d*)/([a-f0-9-]{36})',url.path)
    if receipt:
        entity,index,key=receipt.groups();saved=state.get('media_delete_receipts',{}).get(key)
        return 200,{'receipt':current_receipt(state,saved['receipt']) if saved and saved['receipt']['target']['entity']==entity and saved['receipt']['id']==int(index) else None},False
    match=re.fullmatch(r'/api/mobile/v1/record-media/(contracts|customers)/([1-9]\d*)/([^/]+)/([1-9]\d*)/([^/]+)',url.path)
    if not match or method!='DELETE':return None
    entity,index,kind,ref,slot=match.groups();index=int(index);key=headers['idempotency-key'];op=deletion_operation(entity,index)
    if key in state.get('tombstones',{}):return 409,{'code':'REQUEST_CANCELLED','message':'QA mã xóa đã khóa'},False
    saved=state.get('media_delete_receipts',{}).get(key)
    if saved:
        assert saved['path']==path and saved['headers']==headers
        return 200,current_receipt(state,saved['receipt']),False
    if state.get('mode')=='delete-drop':state['mode']='none';state['delayed_media_delete']={'path':path,'method':method,'body':deepcopy(body),'headers':headers};return 503,{'code':'SERVICE_UNAVAILABLE','message':'QA chưa nhận yêu cầu xóa'},False
    if state.get('mode')=='delete-conflict':state['mode']='none';return 409,{'code':'MEDIA_DELETE_REVIEW_REQUIRED','message':'QA tệp đã thay đổi trước khi xóa'},False
    found=(contract_response if entity=='contracts' else document_response)(path,'GET',{},headers,state)
    if not found or found[0]!=200:return found or (404,{'message':'QA target missing'},False)
    info=found[1];photo=info['photo'];target=info['target']
    if not photo or body or headers.get('x-record-revision')!=target['revision'] or headers.get('x-reference-revision')!=target['referenceRevision'] or headers.get('x-media-snapshot')!=target['snapshot'] or headers.get('x-photo-revision')!=photo['revision']:
        return 409,{'code':'MEDIA_DELETE_REVIEW_REQUIRED','message':'QA tệp đã thay đổi trước khi xóa'},False
    table='contract_photos' if entity=='contracts' else 'document_photos';del state[table][f'{index}:{slot}'];state['media_deletes']=state.get('media_deletes',0)+1
    proof={'id':index,'revision':target['revision'],'requestId':key,'replayed':False,'target':target,'photo':deepcopy(photo),'actorId':7,'actorName':'QA Quản lý','recordedAt':now(),'parentCurrent':True,'referenceCurrent':True,'slotEmpty':True,'current':True}
    state.setdefault('media_delete_receipts',{})[key]={'path':path,'headers':headers,'receipt':proof,'operation':op}
    lost=state.get('mode')=='delete-lost'
    if lost:state['mode']='none'
    return 200,deepcopy(proof),lost
