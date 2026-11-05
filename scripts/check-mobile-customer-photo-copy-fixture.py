"""Exact restart/replay/cancel copy model check; synthetic only."""
import json,uuid
from pathlib import Path
from copy import deepcopy
from lib.mobile_fixture_journal import FixtureJournal
from lib import mobile_contract_flow_fixture as model
from lib.mobile_customer_photo_copy_fixture import seed_copy_sources
from lib.mobile_draft_fixture import TEMPLATE
path=Path('.backups')/('mobile-customer-photo-copy-journal-'+uuid.uuid4().hex)/'state.json'
journal=FixtureJournal(path,model=model);journal.control(seed_copy_sources)
call=journal.transact
login=call('/api/mobile/v1/session','POST',{'email':'qa','password':'fixture-password'},{})[1];auth={'Authorization':'Bearer '+login['token']}
body=deepcopy(TEMPLATE);body['draft']['customer_id']=1;key=str(uuid.uuid4());draft=call('/api/mobile/v1/drafts','POST',body,{**auth,'Idempotency-Key':key})[1];index=draft['id']
route=f'/api/mobile/v1/record-media/contracts/{index}/copy-customer';review=call(route,'GET',{},auth)[1]
key=str(uuid.uuid4());headers={**auth,'Idempotency-Key':key,'X-Record-Revision':review['revision'],'X-Customer-Photo-Snapshot':review['snapshot']}
receipt=call(route,'POST',{},headers)[1];assert receipt['copied']==4
before=journal.summary();journal.close();journal=FixtureJournal(path,model=model);call=journal.transact;assert journal.summary()==before
assert call(route,'POST',{},headers)[1]['replayed'];assert journal.summary()['customerPhotoCopyWrites']==1
cancel=str(uuid.uuid4());review=call(route,'GET',{},auth)[1];headers={**headers,'Idempotency-Key':cancel,'X-Customer-Photo-Snapshot':review['snapshot']}
journal.control(lambda state:state.update(mode='copy-drop'));assert call(route,'POST',{},headers)[0]==503
assert call(f'/api/mobile/v1/write-requests/{cancel}/resolve','POST',{'operation':f'media.copy:{index}'},auth)[1]['status']=='cancelled'
assert call(**journal.state['delayed_customer_photo_copy'])[0]==409
call('/api/mobile/v1/session','DELETE',{},auth);assert journal.summary()['activeSessions']==0;journal.close()
print(json.dumps({'passed':3,'fixtureOnly':True,'checkpoint':str(path),'checks':['Original draft/copy survives exact restart','Replay keeps one immutable copy proof','Dropped copy is durably cancelled and late delivery409, logout0']},indent=2))
