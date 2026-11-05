"""Durable fixture restart, actor visibility and delayed-write acceptance."""
import json
import uuid
from pathlib import Path
from lib.mobile_fixture_journal import FixtureJournal
from lib import mobile_gps_fixture as model

path=Path('.backups')/('mobile-gps-journal-'+uuid.uuid4().hex)/'state.json'
journal=FixtureJournal(path,model=model)
def call(route,method='GET',body=None,headers=None):return journal.transact(route,method,body or {},headers or {})
def login(email):
    status,session,_=call('/api/mobile/v1/session','POST',{'email':email,'password':'fixture-password'});assert status==201
    return {'Authorization':'Bearer '+session['token']}
admin=login('qa-admin');staff=login('qa-settings')
status,workspace,_=call('/api/mobile/v1/gps',headers=staff)
assert status==200 and workspace['summary']['fleet']==36 and workspace['summary']['states']['long_stopped']==1 and not workspace['canMap']
assert workspace['hasMore'] and len(workspace['rows'])==25
assert call('/api/mobile/v1/gps?page=2',headers=staff)[1]['total']==39
assert call('/api/mobile/v1/gps/devices/1/mapping',headers=staff)[0]==403
prep=call('/api/mobile/v1/gps/devices/1/mapping',headers=admin)[1]
key=str(uuid.uuid4());body={'snapshot':prep['snapshot'],'vehicleId':102,'vehicleRevision':'100'}
journal.control(lambda state:state.update(mode='mapping-lost'))
status,proof,lost=call('/api/mobile/v1/gps/devices/1/mapping','POST',body,{**admin,'Idempotency-Key':key})
assert status==200 and lost and journal.summary()['writes']==1
original=journal.summary();generation=journal.generation;journal.close();journal=FixtureJournal(path,model=model)
assert journal.summary()==original and journal.generation==generation
assert call('/api/mobile/v1/gps/mappings/requests/'+key,headers=admin)[1]['receipt']=={**proof,'replayed':True}
assert call('/api/mobile/v1/gps/devices/1/mapping','POST',body,{**admin,'Idempotency-Key':key})[1]['replayed']
assert journal.summary()['writes']==1
prep=call('/api/mobile/v1/gps/devices/1/mapping',headers=admin)[1];key=str(uuid.uuid4());body={'snapshot':prep['snapshot'],'vehicleId':None,'vehicleRevision':None}
journal.control(lambda state:state.update(mode='mapping-drop'))
assert call('/api/mobile/v1/gps/devices/1/mapping','POST',body,{**admin,'Idempotency-Key':key})[0]==503
result=call('/api/mobile/v1/write-requests/'+key+'/resolve','POST',{'operation':'gps.mapping:1'},admin)[1];assert result['status']=='cancelled'
assert journal.transact(**journal.state['delayed'])[0]==409 and journal.summary()['writes']==1
for headers in (admin,staff):call('/api/mobile/v1/session','DELETE',headers=headers)
assert journal.summary()['activeSessions']==0
saved=journal.summary();journal.close();journal=FixtureJournal(path,model=model);assert journal.summary()==saved;journal.close()
print(json.dumps({'passed':3,'fixtureOnly':True,'checkpoint':str(path),'checks':['Full fleet and settings.write visibility','Lost commit replay and restart preserve the exact original checkpoint','Dropped and delayed write stays tombstoned; terminal sessions revoked']},indent=2))

# Existing contract watch gains GPS reads without replacing its written data.
from lib import mobile_contract_flow_fixture as contract
overlay=contract.seed_state()
status,session,_=contract.response('/api/mobile/v1/session','POST',{'email':'qa','password':'fixture-password'},{},overlay)
headers={'Authorization':'Bearer '+session['token']}
before=json.loads(json.dumps(overlay));status,snapshot,_=contract.response('/api/mobile/v1/gps','GET',{},headers,overlay)
assert status==200 and snapshot['summary']['fleet']==36 and overlay['gps']['reads']==1
assert {k:v for k,v in overlay.items() if k!='gps'}==before
assert contract.valid_state(overlay) and contract.summary(overlay,1)['gps']['reads']==1
print('Contract-watch GPS overlay preserves every existing field and does not elevate its manager role.')
