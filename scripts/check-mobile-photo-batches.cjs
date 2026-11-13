const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),ts=require('typescript');
const{load,root}=require('./lib/load-typescript.cjs');
const{savePhotoBatch}=load(path.join(root,'../mobile/src/lib/photo-batch.ts'));
const{mergeMobileRefundRecipient}=load(path.join(root,'../shared/mobile-refund-qr.ts'));
const key=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture(count){
  const rows=Array.from({length:count},(_,i)=>({id:key(i+1),key:key(i+101),slot:`plate-1${i?'-extra-'+(i+1):''}`,width:10,height:10,size:3,attempt:null,state:'queued',error:''}));
  return{rows,store:{
    async list(){return structuredClone(rows);},
    async update(row){Object.assign(rows.find(r=>r.id===row.id),structuredClone(row));},
    async photo(){return{bytes:async()=>new Uint8Array([255,216,255]).buffer,dispose(){}};},
  }};
}
async function main(){const checks=[];
  const{rows,store}=fixture(25),writes=new Map(),attempts=new Map();let lost=true,ledger=null,calls=0;
  const adapter={async prepare(row){assert(!attempts.has(row.id),'An uncertain request cannot be replanned');const value={slot:row.slot,revision:'1'};attempts.set(row.id,value);return value;},async upload(row,attempt){calls++;assert.deepEqual(attempt,attempts.get(row.id));writes.set(row.key,writes.get(row.key)||row.id);if(row.id===key(10)&&lost){lost=false;throw Error('Lost response after server commit');}}};
  const guard={current:()=>true,reserve:async value=>{if(ledger)assert.equal(ledger,value);ledger=value;},complete:async value=>{assert.equal(ledger,value);ledger=null;}};
  await assert.rejects(savePhotoBatch(store,adapter,guard,async()=>{}),/Lost response/);
  assert.equal(rows.filter(r=>r.state==='saved').length,9);assert.equal(rows[9].key,key(110));
  await savePhotoBatch(store,adapter,guard,async()=>{});
  assert.equal(rows.filter(r=>r.state==='saved').length,25);assert.equal(writes.size,25);assert.equal(calls,26);assert.equal(ledger,null);
  checks.push('25-image interrupted upload resumes the original immutable attempt/key; nine acknowledged files are skipped and a lost reply never creates a second image');
  const stopped=fixture(1);let current=true,uploads=0;
  await savePhotoBatch(stopped.store,{prepare:async()=>{current=false;return{};},upload:async()=>{uploads++;}},{current:()=>current,reserve:async()=>{},complete:async()=>{}},async()=>{});
  assert.equal(uploads,0);assert.equal(stopped.rows[0].state,'queued');assert.deepEqual(stopped.rows[0].attempt,{});
  checks.push('A changed actor/session stops before a request and retains the prepared image and attempt for its original owner');
  const ack=fixture(1);let sent=0;
  await assert.rejects(savePhotoBatch(ack.store,{prepare:async()=>({}),upload:async()=>{sent++;}},{current:()=>true,reserve:async()=>{},complete:async()=>{throw Error('Local acknowledgement failed');}},async()=>{}),/acknowledgement/);
  assert.equal(ack.rows[0].state,'saved');await savePhotoBatch(ack.store,{upload:async()=>{sent++;}},{current:()=>true},async()=>{});assert.equal(sent,1);
  checks.push('Failure releasing the local ledger after a durable server receipt preserves saved state and cannot upload the file again');
  let options,live=0,maximum=0;const delivered=[];
  const picker={launchImageLibraryAsync:async value=>{options=value;return{canceled:false,assets:Array.from({length:25},(_,i)=>({uri:String(i+1)}))};}};
  const module={exports:{}};const source=fs.readFileSync(path.join(root,'../mobile/src/lib/record-media-photo.ts'),'utf8');
  new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name==='expo-image-picker'?picker:name==='expo-file-system'?{File:class{async arrayBuffer(){return new Uint8Array([255,216,255]).buffer;}}}:name==='./prepare-photo'?{preparePhoto:async uri=>{if(uri==='7')throw Error('Unreadable source image');live++;maximum=Math.max(maximum,live);return{uri,size:3,width:10,height:10,mimeType:'image/jpeg',dispose(){live--;}};}}:require(name),module,module.exports);
  await assert.rejects(module.exports.selectRecordMediaPhotos(false,new AbortController().signal,async photo=>{delivered.push(photo.uri);photo.dispose();}),/Ảnh 7/);
  assert.equal(options.allowsMultipleSelection,true);assert.equal(options.allowsEditing,false);assert.equal(delivered.length,24);assert.equal(maximum,1);assert.equal(live,0);
  checks.push('The actual native picker requests an album, prepares only one decoded image at a time, retains all 24 valid files and reports the invalid seventh source explicitly');
  const before={bank:'OLD',recipientAccount:'1111',recipientName:'OLD OWNER',amount:'300000'};
  const changed=mergeMobileRefundRecipient(before,{recipient_bank:'VCB',recipient_account:'2222'},before);assert.equal(changed.recipientName,'');assert.equal(changed.amount,'300000');
  const manual={...before,recipientAccount:'3333'};assert.deepEqual(mergeMobileRefundRecipient(manual,{recipient_account:'2222'},before),manual);
  checks.push('QR reading keeps all money unchanged, clears an old owner for a new account, and preserves recipient edits made while scanning');
  const secure=new Map(),stores=new Map();let sequence=1000;
  function staging(){const module={exports:{}},source=fs.readFileSync(path.join(root,'../mobile/src/lib/staged-photo-work.ts'),'utf8');new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name==='react-native'?{Platform:{OS:'android'}}:name==='expo-secure-store'?{getItemAsync:async k=>secure.get(k)??null,setItemAsync:async(k,v)=>secure.set(k,v),deleteItemAsync:async k=>secure.delete(k)}:name==='expo'?{uuid:{v4:()=>key(++sequence)}}:name==='./photo-batch'?load(path.join(root,'../mobile/src/lib/photo-batch.ts')):name==='./photo-batch-store'?{openPhotoBatchStore:async k=>{if(!stores.has(k)){const f=fixture(2);f.store.remove=async id=>{f.rows.splice(f.rows.findIndex(r=>r.id===id),1);};stores.set(k,f);}return stores.get(k).store;}}:require(name),module,module.exports);return module.exports;}
  const staged=staging(),scope={origin:'https://fixture.invalid',userId:7,storeId:23,allStores:false},work=await staged.stagedPhotoWork(scope),original=key(9000);
  assert.equal((await staging().stagedPhotoWork(scope)).id,work.id);
  await staged.linkStagedPhotos(scope,original);
  assert.equal(await staged.bindStagedPhotos(scope,901,key(8999)),null,'Old receipts cannot adopt the current album');
  const identity=await staged.bindStagedPhotos(scope,901,original);assert.equal(identity,staged.stagedPhotoIdentity(work.id));
  await assert.rejects(staged.guardStagedPhotos(scope),/901/);await assert.rejects(staged.bindStagedPhotos(scope,902,original));
  await assert.rejects(staged.completeStagedPhotos(scope,901,original),/chưa gửi/);
  for(const f of stores.values())for(const row of f.rows)row.state='saved';await staged.completeStagedPhotos(scope,901,original);
  assert.notEqual((await staged.stagedPhotoWork(scope)).id,work.id);assert.equal(await staged.bindStagedPhotos(scope,901,original),null);
  checks.push('A new vehicle album survives a cold factory, binds only its exact metadata UUID/record, rejects another vehicle and old receipts, blocks completion with unsent images, and rotates only after saved images are acknowledged');
  const kinds=['battery-create','battery-901-renew','battery-901-collect_renewal','battery-901-return'],works=[];
  for(let i=0;i<kinds.length;i++){
    const namespace=kinds[i],work=await staged.stagedPhotoWork(scope,namespace),request=key(9100+i);works.push(work.id);
    await staged.linkStagedPhotos(scope,request,namespace);
    assert.equal(await staged.bindStagedPhotos(scope,901,request,kinds[(i+1)%kinds.length]),null);
    const identity=await staging().bindStagedPhotos(scope,901,request,namespace);assert.equal(identity,staged.stagedPhotoIdentity(work.id));
    assert.equal(await staged.bindStagedPhotos({...scope,userId:8},901,request,namespace),null);
    assert.equal(await staged.bindStagedPhotos({...scope,storeId:24},901,request,namespace),null);
    await assert.rejects(staged.guardStagedPhotos(scope,namespace));
    await assert.rejects(staged.completeStagedPhotos(scope,901,request,namespace));
  }
  assert.equal(new Set(works).size,4);
  checks.push('Rental, renewal, renewal collection and battery return keep independent durable albums; old events, other actions, actors and branches cannot adopt their images');
  const shiftModule={exports:{}},shiftSource=fs.readFileSync(path.join(root,'../mobile/src/lib/shift-photo-work.ts'),'utf8'),shiftRows=new Map();
  new Function('require','module','exports',ts.transpileModule(shiftSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name==='./photo-batch-store'?{openPhotoBatchStore:async identity=>({list:async()=>shiftRows.get(identity)??[]})}:load(path.resolve(root,'../mobile/src/lib',name)),shiftModule,shiftModule.exports);
  const shiftIdentity=(stage,category)=>JSON.stringify([scope,`shift:801:${stage}:${category}`]);
  const categories=load(path.join(root,'../shared/mobile-shift-reports')).SHIFT_PHOTOS;
  shiftRows.set(shiftIdentity('pgd',categories.at(-1)[0]),[{state:'queued'}]);
  await assert.rejects(shiftModule.exports.requireShiftPhotosSaved(scope,801,'pgd'),/chưa lưu/);
  await shiftModule.exports.requireShiftPhotosSaved(scope,801,'audit');
  shiftRows.set(shiftIdentity('pgd',categories.at(-1)[0]),[{state:'saved'}]);
  await shiftModule.exports.requireShiftPhotosSaved(scope,801,'pgd');
  shiftRows.set(shiftIdentity('audit',categories[0][0]),[{state:'queued',attempt:{}}]);
  await assert.rejects(shiftModule.exports.requireShiftPhotosSaved(scope,801,'audit'),/KTNB/);
  checks.push('PGD submission and KTNB confirmation check every durable evidence category, even a closed picker; queued/uncertain images block finalization while acknowledged images and the other stage remain independent');
  console.log(JSON.stringify({passed:checks.length,checks,fixtureOnly:true,operationalWrites:0,providerCalls:0},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
