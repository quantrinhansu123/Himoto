"""Media journal/HTTP durability; only unique checkpoints below .backups."""
import base64,json,os,socket,subprocess,sys,time,urllib.error,urllib.request
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4
from lib.mobile_fixture_journal import FixtureJournal,ROOT
from lib import mobile_record_media_fixture as model

output=ROOT/'.backups'/('media-journal-test-'+str(uuid4()));output.mkdir(parents=True);path=output/'state.json';checks=[]
def call(j,path,method='GET',body=None,auth='',headers=None):return j.transact('/api/mobile/v1/'+path,method,body or {},{'Authorization':'Bearer '+auth,**(headers or {})})
def login(j,name='qa'):
    status,data,_=call(j,'session','POST',{'email':name,'password':'fixture-password'});assert status==200;return data['token']
def ready(j,auth,slot='return-91001-document-3'):
    status,data,_=call(j,'record-media/contracts/9101/return/91001/'+slot,auth=auth);assert status==200
    t=data['target'];return {'Content-Type':'image/jpeg','Idempotency-Key':str(uuid4()),'X-Record-Revision':t['revision'],'X-Reference-Revision':t['referenceRevision'],'X-Photo-Revision':data['photo']['revision'] if data['photo'] else '0','X-Media-Snapshot':t['snapshot']}
def put(j,auth,headers,slot='return-91001-document-3'):
    return call(j,'record-media/contracts/9101/return/91001/'+slot,'PUT',{'jpeg':base64.b64encode(model.image_blob()).decode()},auth,headers)
def resolve(j,auth,key):return call(j,'write-requests/'+key+'/resolve','POST',{'operation':'media.contract:9101'},auth)
j=FixtureJournal(path,model=model)
try:
    try:FixtureJournal(path,model=model)
    except RuntimeError:pass
    else:raise AssertionError('Second owner acquired media journal')
    sender=login(j);other=login(j,'qa8');headers=ready(j,sender);key=headers['Idempotency-Key']
    j.control(lambda s:s.update(mode='lost'));status,_,_=put(j,sender,headers);assert status==503 and j.state['writes']==1
    saved=deepcopy(j.state);generation=j.generation
finally:j.close()
j=FixtureJournal(path,model=model);assert j.state==saved and j.generation==generation
receipt=call(j,'record-media/requests/'+key,auth=sender)[1]['receipt'];assert receipt['requestId']==key and receipt['photoCurrent']
assert call(j,'record-media/requests/'+key,auth=other)[1]['receipt'] is None
assert put(j,sender,headers)[1]['replayed'] and j.state['writes']==1
assert resolve(j,sender,key)[1]['status']=='committed'
blob=j.state['blobs'][receipt['sha256']];assert len(base64.b64decode(blob))==receipt['bytes']
checks.append('Exclusive journal owner; actual synthetic JPEG bytes/hash, lost commit, actor sessions and original receipt survive exact reopen and same-key replay without another write')

replacement=ready(j,other);status,replaced,_=put(j,other,replacement);assert status==200 and j.state['writes']==2
original=call(j,'record-media/requests/'+key,auth=sender)[1]['receipt'];assert not original['photoCurrent'] and original['parentCurrent'] and original['referenceCurrent']
assert original['photoRevision']==receipt['photoRevision'] and original['target']==receipt['target']
assert call(j,'session','DELETE',auth=other)[0]==200;j.close();j=FixtureJournal(path,model=model)
assert call(j,'session',auth=other)[0]==401;other=login(j,'qa8');assert call(j,'record-media/requests/'+replacement['Idempotency-Key'],auth=other)[1]['receipt']['current']
checks.append('Different actor replacement preserves old proof with independent image-current flag; JPEG revisions and logout revocation persist across restart')

drop=ready(j,sender,'return-91001-document-4');drop_key=drop['Idempotency-Key'];j.control(lambda s:s.update(mode='drop'))
assert put(j,sender,drop,'return-91001-document-4')[0]==503 and j.state['writes']==2
j.close();j=FixtureJournal(path,model=model);assert len(j.state['delayed'])==1
assert resolve(j,sender,drop_key)[1]['status']=='cancelled';tombstone=model.digest(j.state);j.close();j=FixtureJournal(path,model=model)
assert model.digest(j.state)==tombstone and j.transact(**j.state['delayed'][-1])[0]==409 and j.state['writes']==2
checks.append('Unsent binary envelope and durable tombstone survive restart; late photo delivery cannot resurrect the cancelled request UUID')

concurrent=ready(j,sender,'return-91001-document-5')
with ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(lambda _:put(j,sender,concurrent,'return-91001-document-5'),range(4)))
assert all(r[0]==200 for r in results) and sum(not r[1]['replayed'] for r in results)==1 and j.state['writes']==3
checks.append('Concurrent equivalent retries serialize to one image revision and one original receipt, with three replay responses')

old=deepcopy(j.state);j.control(lambda s:model.seed_dataset(s,9200))
for field,value in old.items():
    if field in ('records','targets','photos','blobs'):assert all(j.state[field][k]==v for k,v in value.items())
    elif field=='photoSeq':assert j.state[field]-value==sum(k not in old['photos'] and v['mimeType']=='image/jpeg' for k,v in j.state['photos'].items())
    else:assert j.state[field]==value
before=model.digest(j.state)
try:j.control(lambda s:model.seed_dataset(s,9200))
except AssertionError:pass
else:raise AssertionError('Existing media dataset was reset')
assert model.digest(j.state)==before
checks.append('Fresh retry datasets append only unused target/record/photo rows and preserve every existing JPEG, receipt, session, tombstone and delayed envelope')

before=deepcopy(j.state);disk=path.read_bytes();generation=j.generation
with patch('lib.mobile_fixture_journal.os.replace',side_effect=OSError('Synthetic disk failure')):
    try:resolve(j,sender,str(uuid4()))
    except OSError:pass
    else:raise AssertionError('Failed disk commit returned a result')
assert j.state==before and path.read_bytes()==disk and j.generation==generation
j.close();j=FixtureJournal(path,model=model);assert j.state==before;j.close()
checks.append('Failed atomic replacement never changes authoritative RAM/disk or acknowledges an unpersisted cancellation')

corrupt=output/'corrupt.json';payload=json.loads(path.read_text(encoding='utf-8'));payload['state']['writes']+=1;corrupt.write_text(json.dumps(payload),encoding='utf-8')
unfinished=output/'unfinished.json';unfinished.with_suffix('.json.tmp').write_text('partial',encoding='utf-8')
for p in (corrupt,unfinished):
    try:FixtureJournal(p,model=model)
    except (AssertionError,ValueError):pass
    else:raise AssertionError('Corrupt/incomplete journal was accepted or reset')
checks.append('Corrupt digest and interrupted initial checkpoint fail closed without losing previous state or blank seeding')

with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
def http(path,method='GET',body=None,auth='',headers=None):
    binary=method=='PUT';data=body if binary else json.dumps(body).encode() if body is not None else None
    req=urllib.request.Request(f'http://127.0.0.1:{port}'+path,data=data,method=method,headers={'Content-Type':'image/jpeg' if binary else 'application/json','Authorization':'Bearer '+auth,**(headers or {})})
    try:
        with urllib.request.urlopen(req,timeout=6) as response:return response.status,response.read(),response.headers.get('Content-Type')
    except urllib.error.HTTPError as e:return e.code,e.read(),e.headers.get('Content-Type')
def start():
    proc=subprocess.Popen([sys.executable,str(ROOT/'scripts/mobile-media-fixture-server.py'),'--port',str(port),'--state-file',str(path)],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    for _ in range(100):
        if proc.poll() is not None:raise AssertionError('Synthetic media HTTP server stopped')
        try:
            if http('/health')[0]==200:return proc
        except urllib.error.URLError:time.sleep(.05)
    proc.terminate();proc.wait(timeout=5);raise AssertionError('Media HTTP server did not listen')
server=None
try:
    server=start();baseline=json.loads(http('/__fixture_state')[1]);assert baseline['writes']==3
    image_path='/api/mobile/v1/record-media/contracts/9101/return/91001/return-91001-document-3?revision='+replaced['photoRevision']
    status,data,mime=http(image_path,auth=other);assert status==200 and mime=='image/jpeg' and data==model.image_blob()
    server.terminate();server.wait(timeout=5);server=start();assert json.loads(http('/__fixture_state')[1])==baseline
    proof=json.loads(http('/api/mobile/v1/record-media/requests/'+key,auth=sender)[1])['receipt'];assert proof['requestId']==key and not proof['photoCurrent']
    assert json.loads(http('/__fixture_late','POST',{})[1])['lateStatus']==409
    checks.append('Real server stop/start restores exact digest/state; authenticated image endpoint returns full JPEG bytes, original proof and late409 remain intact over actual HTTP')
finally:
    if server and server.poll() is None:server.terminate();server.wait(timeout=5)
result={'passed':len(checks),'checks':checks,'fixtureOnly':True,'operationalWrites':0,'checkpointDirectory':str(output)}
(ROOT/'.backups/mobile-media-fixture-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2))
