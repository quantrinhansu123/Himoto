require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),ts=require('typescript'),{randomUUID,createHash}=require('node:crypto');
const {load,root}=require('./lib/load-typescript.cjs');
const {createContractWorkJournal}=load(path.resolve(root,'../mobile/src/lib/contract-work-journal'));
const {createDraftWorkController}=load(path.resolve(root,'../mobile/src/lib/draft-work-controller'));
const {ContractWorkRuleError}=load(path.resolve(root,'../shared/mobile-contract-work'));
const template=require('./fixtures/mobile-draft.json'),clone=v=>JSON.parse(JSON.stringify(v));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const scope={origin:'https://controller-qa.example.invalid',userId:7,storeId:23,allStores:false};
function fixture(){
  const dirs=new Set(['']),files=new Map(),lockKey=randomUUID();let failLedger=false,reserves=0,completions=0;const ledgerEntries=new Map();
  const disk={lockKey,async list(p){assert(dirs.has(p));const prefix=p?p+'/':'';return[...dirs].filter(n=>n!==p&&n.startsWith(prefix)&&!n.slice(prefix.length).includes('/')).map(n=>({name:n.slice(prefix.length),directory:true})).concat([...files.keys()].filter(n=>n.startsWith(prefix)&&!n.slice(prefix.length).includes('/')).map(n=>({name:n.slice(prefix.length),directory:false})));},async mkdir(p){const parts=p.split('/');for(let i=1;i<=parts.length;i++)dirs.add(parts.slice(0,i).join('/'));},async read(p,max){assert(files.has(p)&&files.get(p).length<=max);return files.get(p).toString('utf8');},async writeNew(p,text){assert(!files.has(p));files.set(p,Buffer.from(text));},async digest(p){assert(files.has(p));return sha(files.get(p));},async photoSize(p){assert(files.has(p));return files.get(p).length;}};
  const journal=createContractWorkJournal(disk,scope,randomUUID),store={...journal,async importPreparedPhoto(id,photoId,slot,source){const bytes=Buffer.from(await source.bytes());files.set(`${id}/photos/${photoId}.jpg`,bytes);return{id:photoId,fileId:photoId,slot,sha256:sha(bytes),bytes:bytes.length,width:640,height:420,mimeType:'image/jpeg',discarded:false};},async readPhoto(id,photoId){const h=await journal.load(id),p=h.work.photos.find(p=>p.id===photoId);assert(p);const bytes=files.get(`${id}/photos/${photoId}.jpg`);return{uri:'file:///owned/'+photoId+'.jpg',width:640,height:420,size:p.bytes,mimeType:'image/jpeg',dispose(){},async bytes(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}};}};
  store.recoverPreparedPhoto=async(id,photoId,slot,source)=>{const head=await journal.load(id),photo=head.work.photos.find(p=>p.id===photoId);assert(photo&&photo.slot===slot&&photo.sha256===sha(Buffer.from(await source.bytes())));return photo;};
  const workId=randomUUID(),ledger={async reserveExclusive(_scope,operation,conflicts,makeKey){reserves++;const head=await store.load(workId),planned=head.work.attempts.find(a=>a.state==='planned');assert(planned);assert(conflicts.includes(operation));const previous=[...ledgerEntries.values()].find(a=>conflicts.includes(a.operation));if(previous)return{...previous,created:false};const key=makeKey();assert.equal(key,planned.key);const entry={operation,key};ledgerEntries.set(key,entry);return{...entry,created:true};},async complete(_scope,operation,key){const h=await store.load(workId),a=h.work.attempts.find(a=>a.key===key);assert(a?.acknowledged&&a.state!=='planned');if(failLedger)throw Error('QA ledger removal unavailable');ledgerEntries.delete(key);completions++;}};
  const options={store,scope,workId,baseDraftId:null,ledger,makeUuid:randomUUID};
  let current=clone(template),step=0;current.draft.vehicles[0].id='303';current.draft.total_amount='1250000';current.draft.vehicles[0].driver_name='ManualControllerQA';
  const controller=createDraftWorkController(options);controller.setReader(()=>({input:current,step}));
  return{controller,store,options,ledgerEntries,setForm(input,page){current=input;step=page;},input:()=>clone(current),setLedgerFail(value){failLedger=value;},counts:()=>({reserves,completions})};
}
function photo(slot){const b=Buffer.from([255,216,255,224,1,2,3]);let disposed=0;return{row:{id:randomUUID(),slot,photo:{uri:'file:///cache/qa.jpg',width:640,height:420,size:b.length,mimeType:'image/jpeg',dispose(){disposed++;},async bytes(){return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}}},disposed:()=>disposed};}
function review(row){return{target:{entity:'contracts',id:2001,kind:row.slot.startsWith('plate-')?'plate':'rental',referenceId:row.slot.startsWith('plate-')?303:2001,revision:'11',referenceRevision:'11',snapshot:'a'.repeat(64),label:'QA'},slot:row.slot,label:'QA',photo:null,nextSlot:null,observedAt:'2026-11-03T02:00:00Z'};}
function proof(a,p){return{id:2001,revision:'11',replayed:false,requestId:a.key,target:a.review.target,slot:p.slot,label:'QA',photoRevision:'51',sha256:p.sha256,bytes:p.bytes,actorId:7,actorName:'QA',recordedAt:'2026-11-03T02:00:00Z',parentCurrent:true,referenceCurrent:true,photoCurrent:true,current:true};}
async function run(){const checks=[];
  {
    const f=fixture();assert.equal(f.controller.getHead(),null);const next=f.input();next.notes='Tiếng Việt chưa gửi';f.setForm(next,3);f.controller.schedule();f.controller.schedule();await f.controller.flush();assert.deepEqual((await f.store.load(f.options.workId)).work.input,next);assert.equal(f.controller.getHead().work.step,3);assert(!f.controller.getState().saving);assert.equal(f.counts().reserves,0);await f.controller.detach();checks.push('Untouched form creates no work; coalesced edits flush full Vietnamese input/page before writes and detach retains the original owner without reserving an API UUID');
  }
  {
    const f=fixture(),signed=photo('rental-document-1'),plate=photo('scan_plate');const held=await f.controller.importPhoto(signed.row);assert(held.durable&&held.photo.uri.startsWith('file:///owned/'));assert.equal(signed.disposed(),1);await f.controller.importPhoto(plate.row);await assert.rejects(()=>f.controller.reserveMetadata(f.input()),ContractWorkRuleError);
    await f.controller.bindPhoto(plate.row.id,'plate-303');const reservation=await f.controller.reserveMetadata(f.input());assert(reservation.created);const key=reservation.key;assert.equal(f.controller.pending('metadata'),key);
    const restarted=createDraftWorkController({...f.options,initialHead:await f.store.load(f.options.workId)});restarted.setReader(()=>({input:f.input(),step:0}));const recovered=await restarted.reserveMetadata(f.input());assert(!recovered.created&&recovered.key===key);assert.equal((await restarted.restorePhotos()).length,2);
    f.setLedgerFail(true);await assert.rejects(()=>restarted.settleMetadata(key,{id:2001,revision:'11',replayed:false}),/QA ledger removal/);assert.equal(restarted.metadataReceipt().id,2001);assert(restarted.getHead().work.attempts[0].acknowledged);assert(f.ledgerEntries.has(key));f.setLedgerFail(false);await restarted.settleMetadata(key,{id:2001,revision:'11',replayed:true});assert(!f.ledgerEntries.has(key));
    const rows=await restarted.restorePhotos(),bound=rows.find(p=>p.slot==='plate-303'),saved=await restarted.reservePhoto(bound.id,review(bound));assert(saved.created);const attempt=restarted.getHead().work.attempts.at(-1),description=restarted.getHead().work.photos.find(p=>p.id===bound.id);const original=proof(attempt,description);await assert.rejects(()=>restarted.reservePhoto(held.id,review(held)),ContractWorkRuleError);const acknowledged=await restarted.settlePhoto(saved.key,original);assert.equal(acknowledged,bound.id);
    const afterKill=createDraftWorkController({...f.options,initialHead:await f.store.load(f.options.workId)});const remaining=await afterKill.restorePhotos();assert.equal(remaining.find(p=>p.id===bound.id).savedTo,2001);assert.equal(remaining.find(p=>p.id===held.id).savedTo,undefined);
    const drop=await afterKill.reservePhoto(held.id,review(held));await afterKill.cancel(drop.key);assert(!f.ledgerEntries.has(drop.key));await afterKill.discardUnsentPhotos();await afterKill.finish();assert.equal((await f.store.load(f.options.workId)).work.status,'finished');checks.push('Owned photo import/binding precedes metadata; restart keeps exact planned key, ledger-removal failure restores committed ID/ack, photo receipt marks only its original image and cancellation permits explicit discard without replaying saved photos');
  }
  {
    const f=fixture();await f.controller.flush();const next=f.input();next.notes='QA ordered edit';const writes=[f.controller.flush(next,2),f.controller.flush({...next,notes:'QA last edit'},4)];await Promise.all(writes);assert.equal(f.controller.getHead().work.input.notes,'QA last edit');assert.equal(f.controller.getHead().work.step,4);
    const other=createDraftWorkController({...f.options,initialHead:await f.store.load(f.options.workId),scope:{...scope,userId:8}});await assert.rejects(()=>other.flush(next,1),ContractWorkRuleError);
    checks.push('Concurrent queued edits use one current head and retain the last full input/page; a controller under another actor cannot mutate the original work');
  }
  {
    const f=fixture(),reserved=await f.controller.reserveMetadata(f.input());let installed,storageFault=false;
    const source=fs.readFileSync(path.resolve(root,'../mobile/src/lib/draft-work-links.ts'),'utf8'),module={exports:{}};
    new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{
      if(name==='react-native')return{Platform:{OS:'android'}};
      if(name==='./draft-work-feature')return{DRAFT_WORK_RECOVERY_ENABLED:true};
      if(name==='./contract-work-files')return{openNativeContractWorkStore:async current=>{if(storageFault)throw Error('QA unreadable work store');return current.userId===scope.userId&&current.origin===scope.origin?f.store:{list:async()=>[]};}};
      if(name==='../../../shared/mobile-contract-work')return load(path.resolve(root,'../shared/mobile-contract-work'));
      throw Error('Unexpected guard dependency '+name);
    },module,module.exports);
    const links=module.exports;links.installDraftWorkLedgerGuard({configureWorkGuard(value){installed=value;}});assert(installed);
    await assert.rejects(()=>installed.reserve(scope,'draft.create',['draft.create'],randomUUID()),ContractWorkRuleError);
    await installed.reserve(scope,'draft.create',['draft.create'],reserved.key);
    await installed.reserve({...scope,storeId:24},'draft.create',['draft.create'],randomUUID());
    await assert.rejects(()=>installed.complete(scope,'draft.create',reserved.key),ContractWorkRuleError);
    assert.equal((await links.findDraftWorkRequest(scope,'draft.create',reserved.key)).head.work.id,f.options.workId);
    assert.equal(await links.findDraftWorkRequest({...scope,userId:8},'draft.create',reserved.key),null);
    assert.equal(await links.findDraftWorkRequest(scope,'draft.create',randomUUID()),null);
    await f.controller.settleMetadata(reserved.key,{id:2001,revision:'11',replayed:false});await installed.complete(scope,'draft.create',reserved.key);
    const p=await f.controller.importPhoto(photo('rental-document-1').row),r=await f.controller.reservePhoto(p.id,review(p));
    await assert.rejects(()=>installed.reserve({...scope,storeId:24},'media.delete.contract:2001',['media.contract:2001','media.copy:2001','media.delete.contract:2001'],randomUUID()),ContractWorkRuleError);
    await assert.rejects(()=>installed.complete(scope,'media.contract:2001',r.key),ContractWorkRuleError);
    storageFault=true;await assert.rejects(()=>installed.complete(scope,'draft.create',randomUUID()),/QA unreadable/);storageFault=false;
    checks.push('Actual Account/work-link guard logic finds exact actor/action/UUID, blocks generic completion before durable acknowledgement and conflicts even before SecureStore reservation, while keeping create destinations separate and failing closed on unreadable storage');
  }
  {
    const f=fixture(),selected=photo('rental-document-1'),real=f.store.readPhoto;let fail=true,imports=0;const originalImport=f.store.importPreparedPhoto;
    f.store.importPreparedPhoto=async(...args)=>{imports++;return originalImport(...args);};f.store.readPhoto=async(...args)=>{if(fail){fail=false;throw Error('QA local readback failure');}return real(...args);};
    await assert.rejects(()=>f.controller.importPhoto(selected.row),/QA local readback/);assert.equal(selected.disposed(),0);assert.equal(f.controller.getHead().work.photos.length,1);
    const restored=await f.controller.importPhoto(selected.row);assert(restored.durable);assert.equal(selected.disposed(),1);assert.equal(imports,1);assert.equal(f.controller.getHead().work.photos.length,1);assert.equal(f.controller.hasLocalChanges(),true);
    const untouched=fixture();assert.equal(untouched.controller.hasLocalChanges(),false);const edit=untouched.input();edit.notes='UnscheduledQA';untouched.setForm(edit,1);assert.equal(untouched.controller.hasLocalChanges(),true);await untouched.controller.flush();
    checks.push('Readback failure after local photo commit preserves the cache and recovers the exact existing association without another copy; dirty input is detected before debounce while untouched input creates no work');
  }
  console.log(JSON.stringify({passed:checks.length,checks,fixtureOnly:true,operationalWrites:0,formUIExecuted:false},null,2));}
run().catch(error=>{console.error(error);process.exitCode=1;});
