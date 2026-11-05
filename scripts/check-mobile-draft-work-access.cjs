// Exercise the actual journal/controller/resume helper with synthetic actor scopes.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{randomUUID,createHash}=require('node:crypto');
const {load,root}=require('./lib/load-typescript.cjs');
const {createContractWorkJournal}=load(path.resolve(root,'../mobile/src/lib/contract-work-journal'));
const {createDraftWorkController}=load(path.resolve(root,'../mobile/src/lib/draft-work-controller'));
const {draftWorkDestination}=load(path.resolve(root,'../mobile/src/lib/draft-work-access'));
const {ContractWorkRuleError}=load(path.resolve(root,'../shared/mobile-contract-work'));
const clone=v=>JSON.parse(JSON.stringify(v)),sha=v=>createHash('sha256').update(v).digest('hex');
const scope={origin:'https://access-qa.example.invalid',userId:7,storeId:23,allStores:false},changedScope={...scope,storeId:null,allStores:true};
function fixture(){
  const dirs=new Set(['']),files=new Map(),entries=new Map(),events=[];let originalCompletions=0;
  const disk={lockKey:randomUUID(),async list(p){assert(dirs.has(p));const prefix=p?p+'/':'';return[...dirs].filter(n=>n!==p&&n.startsWith(prefix)&&!n.slice(prefix.length).includes('/')).map(n=>({name:n.slice(prefix.length),directory:true})).concat([...files.keys()].filter(n=>n.startsWith(prefix)&&!n.slice(prefix.length).includes('/')).map(n=>({name:n.slice(prefix.length),directory:false})));},async mkdir(p){const parts=p.split('/');for(let n=1;n<=parts.length;n++)dirs.add(parts.slice(0,n).join('/'));},async read(p,max){assert(files.has(p)&&files.get(p).length<=max);return files.get(p).toString('utf8');},async writeNew(p,text){assert(!files.has(p));files.set(p,Buffer.from(text));},async digest(p){assert(files.has(p));return sha(files.get(p));},async photoSize(p){assert(files.has(p));return files.get(p).length;}};
  const journal=createContractWorkJournal(disk,scope,randomUUID),workId=randomUUID();
  const store={...journal,async importPreparedPhoto(id,photoId,slot,source){const bytes=Buffer.from(await source.bytes());files.set(`${id}/photos/${photoId}.jpg`,bytes);return{id:photoId,fileId:photoId,slot,sha256:sha(bytes),bytes:bytes.length,width:640,height:420,mimeType:'image/jpeg',discarded:false};},async readPhoto(id,photoId){events.push('read-owned-photo');const h=await journal.load(id),photo=h.work.photos.find(row=>row.id===photoId);assert(photo);return{uri:'file:///owned/'+photoId+'.jpg',width:640,height:420,size:photo.bytes,mimeType:'image/jpeg',dispose(){},bytes:async()=>files.get(`${id}/photos/${photoId}.jpg`)};}};
  const ledger={async reserveExclusive(current,operation,conflicts,makeKey){assert.equal(current.userId,7);const prior=[...entries.values()].find(row=>conflicts.includes(row.operation));if(prior)return{...prior,created:false};const key=makeKey();entries.set(key,{operation,key});return{operation,key,created:true};},async lookup(_scope,operation){return [...entries.values()].find(row=>row.operation===operation)?.key??null;},async complete(current,operation,key){events.push('complete:'+operation);const head=await journal.load(workId),attempt=head.work.attempts.find(row=>row.key===key);assert(attempt?.acknowledged&&attempt.state!=='planned');if(operation==='draft.create'){assert.deepEqual(current,scope);originalCompletions++;}entries.delete(key);}};
  const input=clone(require('./fixtures/mobile-draft.json'));input.notes='ActorPrivateMemoQA';input.draft.customer_id=1;input.draft.vehicles[0].id='303';
  const makeController=(current,initialHead=null)=>{const work=createDraftWorkController({store,scope:current,workId,baseDraftId:null,initialHead,ledger,makeUuid:randomUUID});work.setReader(()=>({input,step:4}));return work;};
  const compile=(code,requireFn)=>{const module={exports:{}};new Function('require','module','exports',ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(requireFn,module,module.exports);return module.exports;};
  const resume=compile(fs.readFileSync(path.resolve(root,'../mobile/src/lib/draft-work-media-resume.ts'),'utf8'),name=>{
    if(name==='expo')return{uuid:{v4:randomUUID}};
    if(name==='./contract-work-files')return{openNativeContractWorkStore:async current=>{events.push('open-store');if(current.origin!==scope.origin||current.userId!==scope.userId)throw Error('QA wrong actor store');return store;}};
    if(name==='./draft-work-controller')return{createDraftWorkController};
    if(name==='./pending-writes')return{pendingWrites:ledger};
    throw Error('Unexpected dependency '+name);
  }).resumeDraftWorkMedia;
  return{journal,store,workId,input,ledger,entries,events,makeController,resume,completions:()=>originalCompletions};
}
const bytes=Buffer.from([255,216,255,224,1,2,3]);
const photo=()=>({id:randomUUID(),slot:'rental-document-1',photo:{uri:'file:///cache/qa.jpg',width:640,height:420,size:bytes.length,mimeType:'image/jpeg',dispose(){},bytes:async()=>bytes}});
const review={id:2001,revision:'11',customerId:1,sourceCount:1,missingCount:1,presentCount:0,snapshot:'a'.repeat(64),observedAt:'2026-11-03T04:20:00Z'};
const imageReview={target:{entity:'contracts',id:2001,kind:'rental',referenceId:2001,revision:'11',referenceRevision:'11',snapshot:'b'.repeat(64),label:'QA'},slot:'rental-document-1',label:'QA',photo:null,nextSlot:null,observedAt:'2026-11-03T04:20:00Z'};
async function saved(f,withPhoto=false,ack=true){const work=f.makeController(scope,(await f.store.list())[0]??null);if(withPhoto)await work.importPhoto(photo());const planned=await work.reserveMetadata(f.input),proof={id:2001,revision:'11',replayed:false};await work.observeMetadata(planned.key,proof);if(ack)await work.settleMetadata(planned.key,proof);return work;}
async function run(){const checks=[];
  {
    const f=fixture(),work=f.makeController(scope);await work.flush();const h=work.getHead();assert.equal(draftWorkDestination([],h.work,scope),'held');assert.equal(draftWorkDestination(['contracts.read','contracts.draft'],h.work,scope),'form');assert.equal(draftWorkDestination(['contracts.read','contracts.draft'],h.work,changedScope),'held');
    await saved(f);const head=await f.store.load(f.workId);assert.equal(draftWorkDestination([],head.work,scope),'media');assert.equal(draftWorkDestination(['contracts.read','contracts.draft'],head.work,changedScope),'media');
    checks.push('Uncommitted metadata requires its original grants/destination; a saved contract exposes a separate media route when draft grants or store scope change');
  }
  {
    const f=fixture(),work=await saved(f,true,false),before=clone(work.getHead());f.events.length=0;let authorized=false;
    const ready=await f.resume(changedScope,f.workId,{customerPhotoCopyReview:async id=>{assert.equal(id,2001);authorized=true;f.events.push('authorized-original-record');return review;}},()=>true);
    assert(authorized);assert.equal(ready.work.metadataReceipt().id,2001);assert.equal(ready.photos.length,1);assert.equal(f.completions(),1);assert.equal(f.entries.size,0);
    assert(f.events.indexOf('authorized-original-record')<f.events.indexOf('complete:draft.create'));assert(f.events.indexOf('authorized-original-record')<f.events.indexOf('read-owned-photo'));
    const head=ready.work.getHead();assert.deepEqual(head.work.scope,before.work.scope);assert.deepEqual(head.work.input,before.work.input);
    const planned=await ready.work.reservePhoto(ready.photos[0].id,imageReview);assert(planned.created);await ready.work.cancel(planned.key);
    await assert.rejects(()=>ready.work.flush({...f.input,notes:'ChangedAtNewStoreQA'},4),ContractWorkRuleError);
    await assert.rejects(()=>ready.work.bindPhoto(ready.photos[0].id,'plate-303'),ContractWorkRuleError);
    const wrong=clone(review);wrong.id=2002;await assert.rejects(()=>ready.work.reserveCopy(wrong),ContractWorkRuleError);
    checks.push('The real resume helper authorizes original ID before photo exposure/metadata acknowledgement; current scope can plan exact saved media but cannot edit metadata, rebind photos or copy to another contract');
  }
  {
    const f=fixture();await saved(f);const ready=await f.resume(changedScope,f.workId,{customerPhotoCopyReview:async()=>review},()=>true);
    const reservation=await ready.work.reserveCopy(review);assert(reservation.created);const old=await f.store.load(f.workId);
    const restarted=f.makeController(changedScope,old),again=await restarted.reserveCopy(review);assert(!again.created&&again.key===reservation.key);
    const copyProof={id:2001,revision:'11',replayed:true,requestId:reservation.key,customerId:1,copied:1,sourceCount:1,presentCount:0,resultSnapshot:'c'.repeat(64),actorId:7,actorName:'QA',recordedAt:'2026-11-03T04:20:00Z',parentCurrent:true,photosCurrent:true,current:true};
    await assert.rejects(()=>restarted.settleCopy(reservation.key,{...copyProof,actorId:8}),ContractWorkRuleError);await restarted.settleCopy(reservation.key,copyProof);await restarted.finish();assert.equal((await f.store.load(f.workId)).work.status,'finished');assert.equal(f.entries.size,0);assert.deepEqual(restarted.getHead().work.scope,scope);
    checks.push('Copy restart under a changed scope retains its exact planned UUID; proof actor/target checks and ack precede ledger removal, then finish preserves the original store/input');
  }
  {
    const f=fixture();await saved(f,true,false);f.events.length=0;const before=(await f.store.load(f.workId)).commitId;let current=true;
    await assert.rejects(()=>f.resume(changedScope,f.workId,{customerPhotoCopyReview:async()=>{throw Error('QA outside RLS');}},()=>true),/outside RLS/);
    assert.equal((await f.store.load(f.workId)).commitId,before);assert.equal(f.completions(),0);assert(!f.events.includes('read-owned-photo'));
    await assert.rejects(()=>f.resume({...changedScope,userId:8},f.workId,{customerPhotoCopyReview:async()=>{throw Error('must not call API');}},()=>true),/wrong actor/);
    await assert.rejects(()=>f.resume({...changedScope,origin:'https://elsewhere.example.invalid'},f.workId,{customerPhotoCopyReview:async()=>{throw Error('must not call API');}},()=>true),/wrong actor/);
    await assert.rejects(()=>f.resume(changedScope,f.workId,{customerPhotoCopyReview:async()=>{current=false;return review;}},()=>current),/Phiên/);
    assert.equal((await f.store.load(f.workId)).commitId,before);assert.equal(f.completions(),0);
    checks.push('RLS denial, another actor/origin and session replacement stop hydration before proof acknowledgement, photo exposure or ledger removal and leave the exact old generation/key intact');
  }
  console.log(JSON.stringify({passed:checks.length,checks,fixtureOnly:true,operationalWrites:0,nativeAccessMatrixTested:false},null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
