// Local synthetic persistence tests. No environment, provider, account or database access.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const {load,root}=require('./lib/load-typescript.cjs');
const rules=load(path.resolve(root,'../shared/mobile-contract-work'));
const {createContractWorkJournal,ContractWorkStorageError}=load(path.resolve(root,'../mobile/src/lib/contract-work-journal'));
const {reserveContractWorkIntent,settleContractWorkIntent}=load(path.resolve(root,'../mobile/src/lib/contract-work-intent'));
const template=require('./fixtures/mobile-draft.json'),copy=v=>JSON.parse(JSON.stringify(v)),digest=v=>createHash('sha256').update(v).digest('hex');
const scope={origin:'https://work-qa.example.invalid',userId:7,storeId:23,allStores:false},time=1793669400000;
const checks=[];
class Disk{
  constructor(){this.lockKey=randomUUID();this.dirs=new Set(['']);this.files=new Map();this.calls=[];this.cut=null;}
  snapshot(){const d=new Disk();d.dirs=new Set(this.dirs);d.files=new Map([...this.files].map(([p,b])=>[p,Buffer.from(b)]));return d;}
  async op(name,p,fn){this.calls.push([name,p]);const cut=this.cut?.at===this.calls.length?this.cut:null;if(cut?.when==='before')throw Error('QA disk full before '+name);if(cut?.when==='partial'){if(name==='write'){this.files.set(p,Buffer.from('{"partial":'));throw Error('QA partial write');}throw Error('QA stop at non-write '+name);}const result=fn();if(cut?.when==='after')throw Error('QA process stopped after '+name);return result;}
  async list(p){return this.op('list',p,()=>{assert(this.dirs.has(p));const prefix=p?p+'/':'';return [...this.dirs].filter(n=>n!==p&&n.startsWith(prefix)&&!n.slice(prefix.length).includes('/')).map(n=>({name:n.slice(prefix.length),directory:true})).concat([...this.files.keys()].filter(n=>n.startsWith(prefix)&&!n.slice(prefix.length).includes('/')).map(n=>({name:n.slice(prefix.length),directory:false})));});}
  async mkdir(p){return this.op('mkdir',p,()=>{const parts=p.split('/');for(let n=1;n<=parts.length;n++)this.dirs.add(parts.slice(0,n).join('/'));});}
  async read(p,max){return this.op('read',p,()=>{const b=this.files.get(p);assert(b&&b.length<=max);return b.toString('utf8');});}
  async writeNew(p,text){return this.op('write',p,()=>{assert(!this.files.has(p));this.files.set(p,Buffer.from(text));});}
  async digest(p){return this.op('digest',p,()=>{assert(this.files.has(p));return digest(this.files.get(p));});}
  async photoSize(p){return this.op('size',p,()=>{assert(this.files.has(p));return this.files.get(p).length;});}
}
const journal=d=>createContractWorkJournal(d,scope,randomUUID,()=>time);
function input(){const v=copy(template);v.draft.vehicles[0].id='303';v.draft.vehicles[0].driver_name='QA Driver';v.draft.vehicles[0].borrow_hats='2';v.draft.total_amount='1250000';v.draft.customer.name='Khách QA tiếng Việt';v.draft.extra_charges=[{name:'QA phí',amount:'25000',method:'cash'}];v.draft.custom_installments=[{due_at:'2026-11-05T08:00',amount:'100000'}];return v;}
async function start(){const d=new Disk(),j=journal(d),id=randomUUID(),head=await j.create(id,input(),null);return{d,j,id,head};}
function photo(slot){const bytes=Buffer.from([255,216,255,224,1,2,3,4]);const id=randomUUID();return {row:{id,fileId:id,slot,sha256:digest(bytes),bytes:bytes.length,width:640,height:420,mimeType:'image/jpeg',discarded:false},bytes};}
async function add(ctx,slot){const p=photo(slot);ctx.d.files.set(`${ctx.id}/photos/${p.row.fileId}.jpg`,p.bytes);ctx.head=await ctx.j.change(ctx.head,scope,{type:'add-photo',photo:p.row});return p.row;}
function review(p){const plate=/^plate-([1-9]\d*)/.exec(p.slot);return{target:{entity:'contracts',id:2001,kind:plate?'plate':'rental',referenceId:plate?Number(plate[1]):2001,revision:'11',referenceRevision:'11',snapshot:'a'.repeat(64),label:'Hợp đồng QA'},slot:p.slot,label:'Ảnh QA',photo:null,nextSlot:null,observedAt:'2026-11-03T01:30:00Z'};}
function proof(a,p){return{id:2001,revision:'11',replayed:false,requestId:a.key,target:a.review.target,slot:p.slot,label:'Ảnh QA',photoRevision:'51',sha256:p.sha256,bytes:p.bytes,actorId:7,actorName:'QA',recordedAt:'2026-11-03T01:30:00Z',parentCurrent:true,referenceCurrent:true,photoCurrent:true,current:true};}
const committed={id:2001,revision:'11',replayed:false};
async function metadata(ctx){const key=randomUUID();ctx.head=await ctx.j.change(ctx.head,scope,{type:'plan-metadata',key});ctx.head=await ctx.j.change(ctx.head,scope,{type:'committed',key,receipt:committed});ctx.head=await ctx.j.change(ctx.head,scope,{type:'acknowledge',key});return key;}
async function run(){
  {
    const ctx=await start();assert.deepEqual((await journal(ctx.d).load(ctx.id)).work.input,input());
    const edited=copy(ctx.head.work.input);edited.draft.vehicles[0].driver_name='Sửa tay QA';edited.draft.customer.address='Địa chỉ chưa hoàn tất';edited.draft.signed_on='';
    ctx.head=await ctx.j.change(ctx.head,scope,{type:'edit',input:edited,step:4});
    assert.deepEqual((await journal(ctx.d).load(ctx.id)).work.input,edited);assert.equal(ctx.head.work.step,4);
    for(const bad of [{...scope,origin:scope.origin+'/'},{...scope,origin:'https://user:password@example.invalid'},{...scope,token:'must-not-persist'}])assert(!rules.isContractWorkScope(bad));
    for(const bad of [{...scope,userId:8},{...scope,origin:'https://another.example.invalid'}])await assert.rejects(()=>createContractWorkJournal(ctx.d,bad,randomUUID).load(ctx.id),ContractWorkStorageError);
    assert(rules.sameWorkActor(scope,{...scope,storeId:24}));await assert.rejects(()=>ctx.j.change(ctx.head,{...scope,storeId:24},{type:'edit',input:edited,step:1}),rules.ContractWorkRuleError);
    for(const bad of ['../x','file:///personal.jpg',randomUUID()+'/../x'])await assert.rejects(()=>ctx.j.load(bad),ContractWorkStorageError);
    checks.push('Cold load preserves every incomplete form field, customer/vehicle/manual driver/accessories/money/installments and step; foreign origin/actor payloads are never returned and scope changes do not migrate the draft');
  }
  {
    const ctx=await start(),signed=await add(ctx,'rental-document-1'),license=await add(ctx,'driver-license'),plate=await add(ctx,'plate-303');
    await metadata(ctx);assert.deepEqual(rules.remainingWorkPhotos(ctx.head.work).map(p=>p.id),[plate.id,license.id,signed.id]);
    await assert.rejects(()=>ctx.j.change(ctx.head,scope,{type:'plan-photo',key:randomUUID(),photoId:signed.id,review:review(signed)}),rules.ContractWorkRuleError);
    const key=randomUUID();ctx.head=await ctx.j.change(ctx.head,scope,{type:'plan-photo',key,photoId:plate.id,review:review(plate)});
    const frozen=copy(ctx.head.work);await assert.rejects(()=>ctx.j.change(ctx.head,scope,{type:'remove-photo',photoId:plate.id}),rules.ContractWorkRuleError);
    for(const changes of [{requestId:randomUUID()},{actorId:8},{bytes:plate.bytes+1},{sha256:'b'.repeat(64)},{slot:'plate-304'},{token:'must-not-persist'}])await assert.rejects(()=>ctx.j.change(ctx.head,scope,{type:'committed',key,receipt:{...proof(ctx.head.work.attempts.at(-1),plate),...changes}}),rules.ContractWorkRuleError);
    assert.deepEqual((await ctx.j.load(ctx.id)).work,frozen);
    ctx.head=await ctx.j.change(ctx.head,{...scope,storeId:24},{type:'committed',key,receipt:proof(ctx.head.work.attempts.at(-1),plate)});
    ctx.head=await ctx.j.change(ctx.head,{...scope,storeId:24},{type:'acknowledge',key});
    assert.equal(ctx.head.work.scope.storeId,23);assert.deepEqual(rules.remainingWorkPhotos(ctx.head.work).map(p=>p.id),[license.id,signed.id]);
    await assert.rejects(()=>ctx.j.change(ctx.head,scope,{type:'cancelled',key}),rules.ContractWorkRuleError);
    const dropped=randomUUID();ctx.head=await ctx.j.change(ctx.head,scope,{type:'plan-photo',key:dropped,photoId:license.id,review:review(license)});
    ctx.head=await ctx.j.change(ctx.head,scope,{type:'cancelled',key:dropped});ctx.head=await ctx.j.change(ctx.head,scope,{type:'acknowledge',key:dropped});
    ctx.head=await ctx.j.change(ctx.head,scope,{type:'remove-photo',photoId:license.id});assert(ctx.head.work.photos.find(p=>p.id===license.id).discarded);assert.equal(ctx.head.work.attempts.find(a=>a.key===dropped).state,'cancelled');
    await assert.rejects(()=>ctx.j.change(ctx.head,scope,{type:'plan-copy',key:randomUUID(),review:{}}),rules.ContractWorkRuleError);
    await assert.rejects(()=>ctx.j.change(ctx.head,scope,{type:'finish'}),rules.ContractWorkRuleError);
    checks.push('Canonical photo phases survive restart; wrong-key/actor/slot/digest/size receipts and early copy/finish reject, original proof skips only its exact image, acknowledged cancellation permits explicit unsent discard while retaining attempt history');
  }
  {
    const ctx=await start(),p=await add(ctx,'scan_plate');await assert.rejects(()=>ctx.j.change(ctx.head,scope,{type:'plan-metadata',key:randomUUID()}),rules.ContractWorkRuleError);
    ctx.head=await ctx.j.change(ctx.head,scope,{type:'bind-photo',photoId:p.id,slot:'plate-303'});
    const planned=randomUUID();ctx.head=await ctx.j.change(ctx.head,scope,{type:'plan-metadata',key:planned});
    let reserveCalls=0,completed=0,entry=null;
    const ledger={reserveExclusive:async(s,operation,conflicts,makeKey)=>{reserveCalls++;const disk=await journal(ctx.d).load(ctx.id);assert.equal(disk.work.attempts.at(-1).key,planned);assert.deepEqual(disk.work.attempts.at(-1).input,input());if(entry)return{...entry,created:false};entry={operation,key:makeKey()};return{...entry,created:true};},complete:async(s,operation,key)=>{const work=(await journal(ctx.d).load(ctx.id)).work,a=work.attempts.find(a=>a.key===key);assert(a.acknowledged&&a.state==='committed');assert.equal(work.contractId,2001);completed++;entry=null;}};
    const reserved=await reserveContractWorkIntent(ctx.j,ctx.id,scope,ledger);assert(reserved.sendAllowed&&!reserved.recoveryRequired);
    const restarted=await reserveContractWorkIntent(journal(ctx.d),ctx.id,scope,ledger);assert(!restarted.sendAllowed&&restarted.recoveryRequired&&restarted.attempt.key===planned);
    await assert.rejects(()=>reserveContractWorkIntent(ctx.j,ctx.id,scope,{reserveExclusive:async()=>({operation:'draft.create',key:randomUUID(),created:false})}),rules.ContractWorkRuleError);
    await assert.rejects(()=>reserveContractWorkIntent(ctx.j,ctx.id,{...scope,storeId:24},ledger),rules.ContractWorkRuleError);assert.equal(reserveCalls,2);
    const result=await settleContractWorkIntent(ctx.j,ctx.id,scope,{type:'committed',key:planned,receipt:committed},ledger);assert.equal(completed,1);assert.equal(result.work.contractId,2001);assert.equal(result.work.photos.length,1);assert.equal(result.work.attempts.length,1);
    const otherId=randomUUID(),other=await ctx.j.create(otherId,input(),null);await assert.rejects(()=>ctx.j.change(other,scope,{type:'plan-metadata',key:planned}),rules.ContractWorkRuleError);
    checks.push('Planned UUID and full input are cold-readable before ledger reservation; restart requires original resolver, a foreign pending UUID blocks, Account-style settlement saves exact metadata linkage/ack before clearing ledger and keys cannot belong to another work');
  }
  {
    const ctx=await start(),baseline=ctx.d.snapshot(),edited=input();edited.notes='Đã sửa QA';
    const probe=baseline.snapshot(),probeJ=journal(probe);await probeJ.change(ctx.head,scope,{type:'edit',input:edited,step:2});const steps=probe.calls.length;
    let cuts=0,blocked=0,oldHeads=0,newHeads=0;
    for(const when of ['before','after','partial'])for(let at=1;at<=steps;at++){
      const d=baseline.snapshot(),j=journal(d);d.cut={at,when};let success=false;
      try{await j.change(ctx.head,scope,{type:'edit',input:edited,step:2});success=true;}catch(error){assert(error instanceof ContractWorkStorageError);}
      d.cut=null;
      for(const [name,bytes] of baseline.files)assert.deepEqual(d.files.get(name),bytes,'A failed publish overwrote the last valid generation');
      try{const loaded=await journal(d).load(ctx.id);if(loaded.commitId===ctx.head.commitId){oldHeads++;assert(!success);}else{newHeads++;assert.deepEqual(loaded.work.input,edited);}}
      catch(error){assert(error instanceof ContractWorkStorageError);blocked++;assert(!success);}
      cuts++;
    }
    assert(blocked>0&&oldHeads>0&&newHeads>0);checks.push(`Fault injection at ${cuts} read/mkdir/write/hash/seal/cold-read boundaries keeps all previous bytes; incomplete generation blocks, committed generation recovers and no false successful publish (${blocked} blocked/${oldHeads} old/${newHeads} committed)`);
  }
  {
    const ctx=await start(),p=await add(ctx,'rental-document-1'),original=ctx.d.files.get(`${ctx.id}/photos/${p.id}.jpg`);
    const baseline=ctx.d.snapshot(),bad=baseline.snapshot();bad.files.set(`${ctx.id}/photos/${p.id}.jpg`,Buffer.from([255,216]));await assert.rejects(()=>journal(bad).load(ctx.id),ContractWorkStorageError);
    const missing=baseline.snapshot();missing.files.delete(`${ctx.id}/photos/${p.id}.jpg`);await assert.rejects(()=>journal(missing).load(ctx.id),ContractWorkStorageError);
    const corrupt=baseline.snapshot(),statePath=[...corrupt.files.keys()].find(n=>n.endsWith('/state.json'));corrupt.files.set(statePath,Buffer.from('corrupt'));await assert.rejects(()=>journal(corrupt).load(ctx.id),ContractWorkStorageError);
    const dangling=baseline.snapshot();dangling.dirs.add(ctx.id+'/generations/'+randomUUID());await assert.rejects(()=>journal(dangling).load(ctx.id),ContractWorkStorageError);
    const stale=await ctx.j.load(ctx.id);ctx.head=await ctx.j.change(ctx.head,scope,{type:'edit',input:input(),step:1});await assert.rejects(()=>ctx.j.change(stale,scope,{type:'edit',input:input(),step:3}),rules.ContractWorkRuleError);
    assert.deepEqual(ctx.d.files.get(`${ctx.id}/photos/${p.id}.jpg`),original);
    const missingNew=photo('driver-license');const before=ctx.d.files.size;await assert.rejects(()=>ctx.j.change(ctx.head,scope,{type:'add-photo',photo:missingNew.row}),ContractWorkStorageError);assert.equal(ctx.d.files.size,before);await ctx.j.load(ctx.id);
    checks.push('Missing/corrupt/changed image and malformed/incomplete manifests block instead of returning an empty or older queue; stale editors reject, missing new image fails before publishing and owned bytes remain untouched');
  }
  {
    const ctx=await start(),key=randomUUID();ctx.head=await ctx.j.change(ctx.head,scope,{type:'plan-metadata',key});
    const baseline=ctx.d.snapshot(),probe=baseline.snapshot();let clearCalls=0;
    await settleContractWorkIntent(journal(probe),ctx.id,scope,{type:'committed',key,receipt:committed},{complete:async()=>{clearCalls++;}});assert.equal(clearCalls,1);
    const steps=probe.calls.length;let cuts=0,retained=0;
    for(const when of ['before','after','partial'])for(let at=1;at<=steps;at++){
      const d=baseline.snapshot();d.cut={at,when};let cleared=false;
      const ledger={complete:async()=>{const head=await journal(d).load(ctx.id),attempt=head.work.attempts.find(a=>a.key===key);assert(attempt.acknowledged&&attempt.state==='committed');assert.equal(head.work.contractId,2001);cleared=true;}};
      try{await settleContractWorkIntent(journal(d),ctx.id,scope,{type:'committed',key,receipt:committed},ledger);}catch(error){assert(error instanceof ContractWorkStorageError);}
      d.cut=null;
      if(!cleared)retained++;
      for(const [p,b] of baseline.files)assert.deepEqual(d.files.get(p),b);
      try{const head=await journal(d).load(ctx.id),attempt=head.work.attempts.find(a=>a.key===key);assert(attempt&&attempt.key===key);if(cleared)assert(attempt.acknowledged&&head.work.contractId===2001);}catch(error){assert(error instanceof ContractWorkStorageError);assert(!cleared);}
      cuts++;
    }
    const d=baseline.snapshot();await assert.rejects(()=>settleContractWorkIntent(journal(d),ctx.id,scope,{type:'committed',key,receipt:committed},{complete:async()=>{throw Error('QA ledger write failure');}}),/QA ledger/);
    const persisted=await journal(d).load(ctx.id);assert.equal(persisted.work.contractId,2001);assert(persisted.work.attempts[0].acknowledged);
    checks.push(`Receipt/ack/ledger fault injection at ${cuts} boundaries never clears the original UUID ahead of a cold-readable exact acknowledgement (${retained} retained); failed ledger removal keeps metadata proof and original ID`);
  }
  {
    const ctx=await start();ctx.head=await ctx.j.change(ctx.head,scope,{type:'edit',input:{...input(),draft:{...input().draft,customer_id:101}},step:1});await metadata(ctx);
    const key=randomUUID(),review={id:2001,revision:'11',customerId:101,sourceCount:4,missingCount:3,presentCount:1,snapshot:'a'.repeat(64),observedAt:'2026-11-03T01:30:00Z'};
    ctx.head=await ctx.j.change(ctx.head,scope,{type:'plan-copy',key,review});
    const receipt={...committed,requestId:key,customerId:101,copied:3,sourceCount:4,presentCount:1,resultSnapshot:'b'.repeat(64),actorId:7,actorName:'QA',recordedAt:review.observedAt,parentCurrent:true,photosCurrent:true,current:true};
    for(const changes of [{customerId:102},{requestId:randomUUID()},{actorId:8},{copied:4},{sourceCount:5},{token:'must-not-persist'}])await assert.rejects(()=>ctx.j.change(ctx.head,scope,{type:'committed',key,receipt:{...receipt,...changes}}),rules.ContractWorkRuleError);
    await assert.rejects(()=>ctx.j.change(ctx.head,scope,{type:'discard'}),rules.ContractWorkRuleError);
    ctx.head=await ctx.j.change(ctx.head,scope,{type:'committed',key,receipt});ctx.head=await ctx.j.change(ctx.head,scope,{type:'acknowledge',key});ctx.head=await ctx.j.change(ctx.head,scope,{type:'finish'});assert.equal((await journal(ctx.d).load(ctx.id)).work.status,'finished');
    const discarded=await start();discarded.head=await discarded.j.change(discarded.head,scope,{type:'discard'});assert.equal((await discarded.j.load(discarded.id)).work.status,'discarded');
    const fork=ctx.d.snapshot(),generations=[...fork.files.keys()].filter(p=>p.endsWith('/state.json')),headPath=generations.at(-1),payload=JSON.parse(fork.files.get(headPath).toString()),newId=randomUUID(),forkDir=ctx.id+'/generations/'+newId;fork.dirs.add(forkDir);payload.commitId=newId;const bytes=Buffer.from(JSON.stringify(payload));fork.files.set(forkDir+'/state.json',bytes);fork.files.set(forkDir+'/seal.json',Buffer.from(JSON.stringify({schema:1,commitId:newId,parent:payload.parent,generation:payload.generation,sha256:digest(bytes)})));await assert.rejects(()=>journal(fork).load(ctx.id),ContractWorkStorageError);
    checks.push('Copy settlement binds original customer/counts/actor/UUID; unresolved intent blocks discard, valid completion/discard survive restart and competing sealed generation forks fail closed');
  }
  console.log(JSON.stringify({passed:checks.length,checks,fixtureOnly:true,operationalWrites:0,nativeAdapterExecuted:false,formIntegrationEnabled:false},null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
