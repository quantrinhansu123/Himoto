"""Durable synthetic document proof/restart/tombstone acceptance."""
import base64
import hashlib
import json
import uuid
from pathlib import Path
from lib.mobile_fixture_journal import FixtureJournal
from lib import mobile_contract_flow_fixture as model
from lib.mobile_customer_matches_fixture import seed_duplicates
from lib.mobile_record_media_fixture import image_blob

path=Path('.backups')/('mobile-customer-documents-journal-'+uuid.uuid4().hex)/'state.json'
journal=FixtureJournal(path,model=model)
checks=[]
try:
    journal.control(seed_duplicates)
    _,session,_=journal.transact('/api/mobile/v1/session','POST',{'email':'qa','password':'fixture-password'},{})
    headers={'Authorization':'Bearer '+session['token']}
    def call(path,method='GET',body=None,extra=None):
        return journal.transact('/api/mobile/v1/'+path,method,body or {},{**headers,**(extra or {})})
    info=call('record-media/customers/501/customer/501/id_front')[1]
    key=str(uuid.uuid4());photo=image_blob();body={'jpeg':base64.b64encode(photo).decode()}
    upload_headers={'Idempotency-Key':key,'X-Record-Revision':info['target']['revision'],'X-Reference-Revision':info['target']['referenceRevision'],'X-Media-Snapshot':info['target']['snapshot'],'X-Photo-Revision':'0'}
    journal.control(lambda state:state.update(mode='doc-lost'))
    status,proof,lost=call('record-media/customers/501/customer/501/id_front','PUT',body,upload_headers)
    assert status==200 and lost and journal.summary()['documentWrites']==1
    assert proof['sha256']==hashlib.sha256(photo).hexdigest()
    assert call('record-media/requests/'+key)[1]['receipt']=={**proof,'replayed':True}
    original=journal.summary()
    checks.append('Lost photo commit retains exact JPEG bytes/target/slot/hash and original receipt')
finally:journal.close()
journal=FixtureJournal(path,model=model)
try:
    assert journal.summary()==original
    assert call('record-media/customers/501/customer/501/id_front','PUT',body,upload_headers)[1]=={**proof,'replayed':True}
    key2=str(uuid.uuid4());info=call('record-media/customers/501/customer/501/id_back')[1]
    upload_headers={**upload_headers,'Idempotency-Key':key2,'X-Media-Snapshot':info['target']['snapshot']}
    journal.control(lambda state:state.update(mode='doc-drop'))
    assert call('record-media/customers/501/customer/501/id_back','PUT',body,upload_headers)[0]==503
    assert call('write-requests/'+key2+'/resolve','POST',{'operation':'media.customer:501'})[1]['status']=='cancelled'
    delayed=journal.state['delayed_document']
    assert journal.transact(**delayed)[0]==409 and journal.summary()['documentWrites']==1
    assert call('record-media/customers/502/customer/502/id_front','PUT',body,upload_headers)[0]==403
    assert journal.summary()['documentReceipts'][key]['receipt']==proof
    final=journal.summary()
    checks.append('Restart/retry replays one image; cancelled dropped upload rejects delayed delivery and foreign profile cannot receive photo')
finally:journal.close()
journal=FixtureJournal(path,model=model)
try:assert journal.summary()==final
finally:journal.close()
checks.append('Second restart retains the original proof, cancelled UUID and every photo byte')
print(json.dumps({'passed':len(checks),'checks':checks,'fixtureOnly':True,'operationalWrites':0,'checkpoint':str(path)}))
