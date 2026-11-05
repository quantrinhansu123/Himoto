"""Durable contract-photo journal replay, restart and delayed-delivery acceptance."""
import base64
import json
import uuid
from copy import deepcopy
from pathlib import Path
from lib.mobile_fixture_journal import FixtureJournal
from lib import mobile_contract_flow_fixture as model
from lib.mobile_draft_fixture import TEMPLATE
from lib.mobile_contract_photos_fixture import vehicle
from lib.mobile_record_media_fixture import image_blob
path=Path('.backups')/('mobile-contract-photos-journal-'+uuid.uuid4().hex)/'state.json'
journal=FixtureJournal(path,model=model)
def call(path,method='GET',body=None,headers=None):return journal.transact(path,method,body or {},headers or {})
status,session,_=call('/api/mobile/v1/session','POST',{'email':'qa','password':'fixture-password'});auth={'Authorization':'Bearer '+session['token']}
value=deepcopy(TEMPLATE);value['draft']['contract_number']='96003';value['draft']['vehicles']=[vehicle(3)['vehicle']]
status,receipt,_=call('/api/mobile/v1/drafts','POST',value,{**auth,'Idempotency-Key':str(uuid.uuid4())});assert status==201
index=receipt['id'];route=f'/api/mobile/v1/record-media/contracts/{index}/plate/303/plate-303';info=call(route,headers=auth)[1]
key=str(uuid.uuid4());headers={**auth,'Idempotency-Key':key,'X-Record-Revision':info['target']['revision'],'X-Reference-Revision':info['target']['referenceRevision'],'X-Media-Snapshot':info['target']['snapshot'],'X-Photo-Revision':'0'};body={'jpeg':base64.b64encode(image_blob()).decode()}
journal.control(lambda state:state.update(mode='contract-photo-lost'));status,photo,lost=call(route,'PUT',body,headers);assert status==200 and lost
before=journal.summary();journal.close();journal=FixtureJournal(path,model=model);assert journal.summary()==before
assert call(route,'PUT',body,headers)[1]['replayed'];assert journal.summary()['draftCreates']==journal.summary()['contractPhotoWrites']==1
result=call('/api/mobile/v1/write-requests/'+key+'/resolve','POST',{'operation':f'media.contract:{index}'},auth)[1];assert result['status']=='committed'
key2=str(uuid.uuid4());info=call(route,headers=auth)[1];headers={**headers,'Idempotency-Key':key2,'X-Photo-Revision':info['photo']['revision']};journal.control(lambda state:state.update(mode='contract-photo-drop'));assert call(route,'PUT',body,headers)[0]==503
assert call('/api/mobile/v1/write-requests/'+key2+'/resolve','POST',{'operation':f'media.contract:{index}'},auth)[1]['status']=='cancelled';assert journal.transact(**journal.state['delayed_contract_photo'])[0]==409
call('/api/mobile/v1/session','DELETE',headers=auth);terminal=journal.summary();assert terminal['activeSessions']==0 and terminal['contractPhotoWrites']==1
journal.close();journal=FixtureJournal(path,model=model);assert journal.summary()==terminal;journal.close()
print(json.dumps({'passed':3,'fixtureOnly':True,'checkpoint':str(path),'checks':['One original draft/image survives exact restart and replay','Committed photo resolves to original proof; actor key remains bound to its operation','Dropped photo key is durably tombstoned; late delivery rejects and terminal sessions revoke']},indent=2))
