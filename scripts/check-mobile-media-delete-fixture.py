"""Deletion checkpoint replay/replacement/cancellation persistence, synthetic only."""
import json,uuid
from pathlib import Path
from lib.mobile_fixture_journal import FixtureJournal
from lib import mobile_contract_flow_fixture as model
from lib.mobile_media_delete_fixture import seed_delete_sources,replace_photo
path=Path('.backups')/('mobile-media-delete-journal-'+uuid.uuid4().hex)/'state.json';journal=FixtureJournal(path,model=model);journal.control(seed_delete_sources);call=journal.transact
login=call('/api/mobile/v1/session','POST',{'email':'qa','password':'fixture-password'},{})[1];auth={'Authorization':'Bearer '+login['token']}
route='/api/mobile/v1/record-media/contracts/2001/rental/2001/rental-document-1';info=call(route,'GET',{},auth)[1];key=str(uuid.uuid4())
headers={**auth,'Idempotency-Key':key,'X-Record-Revision':info['target']['revision'],'X-Reference-Revision':info['target']['referenceRevision'],'X-Media-Snapshot':info['target']['snapshot'],'X-Photo-Revision':info['photo']['revision']}
assert call(route,'DELETE',{},headers)[1]['slotEmpty'];before=journal.summary();journal.close();journal=FixtureJournal(path,model=model);call=journal.transact;assert journal.summary()==before
journal.control(lambda state:replace_photo(state,'rental-document-1'));assert call(route,'DELETE',{},headers)[1]['slotEmpty'] is False;assert journal.summary()['mediaDeletes']==1
info=call(route,'GET',{},auth)[1];key=str(uuid.uuid4());headers={**headers,'Idempotency-Key':key,'X-Photo-Revision':info['photo']['revision']};journal.control(lambda state:state.update(mode='delete-drop'));assert call(route,'DELETE',{},headers)[0]==503
assert call('/api/mobile/v1/write-requests/'+key+'/resolve','POST',{'operation':'media.delete.contract:2001'},auth)[1]['status']=='cancelled';assert call(**journal.state['delayed_media_delete'])[0]==409
call('/api/mobile/v1/session','DELETE',{},auth);assert journal.summary()['activeSessions']==0;journal.close()
print(json.dumps({'passed':3,'fixtureOnly':True,'checkpoint':str(path),'checks':['Deletion proof survives exact checkpoint restart','Replay never removes a replacement and retains the original proof','Cancelled deletion blocks late delivery409; session terminal0']},indent=2))
