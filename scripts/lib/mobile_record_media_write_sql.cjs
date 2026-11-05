const assert=require('node:assert/strict'),path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {NextRequest}=require('next/server');
module.exports=async function mediaWriteSql({pg,load,root,who,checks,read,raw,state,failReceipt,loseResponse}) {
  const writer=load(path.join(root,'lib/server/mobile-record-media-write')),resolver=load(path.join(root,'lib/server/mobile-write-recovery'));
  const image=Buffer.from([255,216,255,8]),digest=createHash('sha256').update(image).digest('hex');
  const parent=raw('contracts',290001,'return',290021),slot='return-290021-document-2';
  const prep=await read(parent),revision=prep.target.revision,referenceRevision=prep.target.referenceRevision;
  const existing=(await pg.query("SELECT xmin::text AS revision FROM himoto.management_record_photos WHERE entity_type='contracts' AND entity_id=290001 AND slot=$1",[slot])).rows[0].revision;
  const input={target:parent,slot,revision,referenceRevision,snapshot:prep.target.snapshot,expected:existing};
  function request(body,key,data=image){return new NextRequest('https://fixture.invalid/media',{method:'PUT',headers:{'Content-Type':'image/jpeg','Idempotency-Key':key,
    'X-Record-Revision':body.revision,'X-Reference-Revision':body.referenceRevision,'X-Photo-Revision':body.expected,'X-Media-Snapshot':body.snapshot},body:data});}
  const write=(body,key=randomUUID(),actor=who,data=image)=>writer.uploadMobileRecordMedia(actor,body.target,body.slot,request(body,key,data));
  const resolve=(key,operation,actor=who)=>resolver.resolveMobileWrite(actor,key,new NextRequest('https://fixture.invalid/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation})}));
  const key=randomUUID(),before=await state(),proof=await write(input,key);assert(proof.current&&!proof.replayed);
  assert.equal(proof.sha256,digest);assert.equal(proof.slot,slot);assert.equal(proof.target.referenceId,290021);assert.equal(proof.photoRevision,(await pg.query("SELECT xmin::text AS r FROM himoto.management_record_photos WHERE entity_type='contracts' AND entity_id=290001 AND slot=$1",[slot])).rows[0].r);
  const after=await state();
  for(const table of Object.keys(before).filter(k=>!['photos','management_mobile_requests','management_mobile_record_media'].includes(k)))assert.deepEqual(after[table],before[table]);
  assert.deepEqual(await write(input,key),{...proof,replayed:true});assert.deepEqual(await state(),after);
  assert.deepEqual((await writer.readMobileMediaReceipt(who,key)).receipt,{...proof,replayed:true});
  assert.equal((await writer.readMobileMediaReceipt({...who,id:8},key)).receipt,null);
  assert.equal((await resolve(key,'media.contract:290001')).status,'committed');
  await assert.rejects(()=>write({...input,slot:'return-290021-document-3'},key),e=>e.code==='REQUEST_KEY_REUSED');
  await assert.rejects(()=>write(input,key,who,Buffer.from([255,216,255,9])),e=>e.code==='REQUEST_KEY_REUSED');
  for(const verb of ['UPDATE','DELETE'])assert.equal((await pg.query('SELECT has_table_privilege($1,$2,$3) AS ok',['himoto_scoped','himoto.management_mobile_record_media',verb])).rows[0].ok,false);
  assert.deepEqual(await state(),after);
  checks.push('Media replacement atomically commits shared photo bytes, exact slot/target/hash and append-only actor receipt before parent ack; same-key retry returns the original, mixed bytes/slot conflict, no contract/stock/money/sequence change, no proof UPDATE/DELETE grants');
  const cancelKey=randomUUID();assert.equal((await resolve(cancelKey,'media.contract:290001')).status,'cancelled');const cancelled=await state();
  await assert.rejects(()=>write({...input,expected:proof.photoRevision},cancelKey),e=>e.code==='REQUEST_CANCELLED');assert.deepEqual(await state(),cancelled);
  const failedKey=randomUUID(),failedInput={...input,expected:proof.photoRevision},beforeFailure=await state();
  failReceipt();await assert.rejects(()=>write(failedInput,failedKey),/QA failure/);assert.deepEqual(await state(),beforeFailure);
  assert.equal((await resolve(failedKey,'media.contract:290001')).status,'cancelled');
  const lostKey=randomUUID();loseResponse();await assert.rejects(()=>write(failedInput,lostKey),/lost after PostgreSQL commit/);
  const lost=(await writer.readMobileMediaReceipt(who,lostKey)).receipt;assert(lost.current&&lost.sha256===digest);const committed=await state();
  assert.equal((await resolve(lostKey,'media.contract:290001')).status,'committed');assert.deepEqual(await write(failedInput,lostKey),lost);assert.deepEqual(await state(),committed);
  const old=(await writer.readMobileMediaReceipt(who,key)).receipt;assert(!old.photoCurrent&&old.parentCurrent&&old.referenceCurrent&&!old.current);assert.deepEqual(old.target,proof.target);assert.equal(old.photoRevision,proof.photoRevision);
  checks.push('Media tombstone blocks late image writes; failure after photo/proof but before ack rolls every row back, lost commit recovers exactly one same-UUID proof and later replacement marks only photoCurrent false while preserving original metadata');
  for(const invalid of [{...input,revision:'1'},{...input,referenceRevision:'1'},{...input,expected:proof.photoRevision},
    {...input,target:raw('contracts',290001,'return',290023),slot:'return-290023-1'},
    {...input,target:raw('contracts',290001,'swap',290032),slot:'vehicle-swap-290032-1'}]){
    const beforeInvalid=await state();await assert.rejects(()=>write(invalid),e=>['MEDIA_REVIEW_REQUIRED','NOT_FOUND'].includes(e.code));assert.deepEqual(await state(),beforeInvalid);
  }
  await assert.rejects(()=>writer.readMobileMediaReceipt({...who,store_id:24},key),e=>e.code==='FORBIDDEN');
  await assert.rejects(()=>resolve(key,'media.contract:290001',{...who,permissions:[]}),e=>e.code==='FORBIDDEN');
  const noFinance={...who,id:8,permissions:['contracts.read']};
  const other=await write({...input,slot:'return-290021-document-3',expected:'0'},randomUUID(),noFinance);assert(other.current&&other.actorId===8);
  assert.equal((await writer.readMobileMediaReceipt(who,other.requestId)).receipt,null);
  checks.push('Post-lock stale parent/reference/photo and cross-contract line/swap reject without key/proof/media mutation; receipt visibility and resolver recheck current grants/branch while shared web media entitlement allows a separate non-finance actor');
  const roleBefore=await state();
  assert.equal((await resolve(other.requestId,'media.contract:290001',noFinance)).status,'committed');
  await assert.rejects(()=>resolve(other.requestId,'media.contract:290001',{...noFinance,permissions:[]}),e=>e.code==='FORBIDDEN');
  await assert.rejects(()=>resolve(other.requestId,'media.contract:290001',{...noFinance,store_id:24}),e=>e.code==='FORBIDDEN');
  assert.deepEqual(await state(),roleBefore);
  checks.push('A contract-read actor without finance permissions can reconcile its own saved media under the shared fleet entitlement; revoking contract access or changing branch blocks resolution and leaves original proof, photo and ledger rows unchanged');
  for(const [target,newSlot] of [[raw('contracts',290001,'swap',290031),'vehicle-swap-290031-19-extra-2'],[raw('vehicles',290011,'transfer',290041),'transfer-290041-1-extra-3'],[raw('vehicles',290011,'receive',290042),'receive-290042-1-extra-2']]){
    const preparation=await read(target),wire={target,slot:newSlot,revision:preparation.target.revision,referenceRevision:preparation.target.referenceRevision,snapshot:preparation.target.snapshot,expected:'0'};
    const saved=await write(wire);assert(saved.current);assert.equal(saved.slot,newSlot);
    assert.equal((await resolve(saved.requestId,`media.${target.entity==='vehicles'?'vehicle':'contract'}:${target.id}`)).status,'committed');
    assert.equal((await writer.readMobileMediaReceipt(who,saved.requestId)).receipt.requestId,saved.requestId);
  }
  const afterNew=await state();for(const table of ['orders','order_vehicle_details','vehicles','vehicle_location_events','management_contract_vehicle_swaps','transactions','management_contract_payments','sequences'])assert.deepEqual(afterNew[table],before[table]);
  checks.push('Saved swap and both foreign transfer/receive supplemental images use actual shared photo writer under pinned RLS and recover/resolve by actor without changing any operational row, event, money or sequence');
  const named=await read(parent),namedInput={...input,slot:'return-290021-document-5',expected:'0',snapshot:named.target.snapshot};
  await pg.query("UPDATE himoto.vehicles SET license='QA-RENAMED-MEDIA' WHERE id=290011");
  const renamed=await state();await assert.rejects(()=>write(namedInput),e=>e.code==='MEDIA_REVIEW_REQUIRED');assert.deepEqual(await state(),renamed);
  const renamedProof=(await writer.readMobileMediaReceipt(who,lostKey)).receipt;assert(!renamedProof.referenceCurrent&&renamedProof.parentCurrent&&renamedProof.photoCurrent);assert.deepEqual(renamedProof.target,lost.target);
  await pg.query("UPDATE himoto.vehicles SET license='QA-MEDIA-OLD' WHERE id=290011");
  checks.push('A label-only change to referenced stock invalidates the reviewed target snapshot even without parent/line revisions changing; original media proof stays immutable and reference warning is independent of image bytes');
  await pg.query('UPDATE himoto.order_vehicle_details SET completed_at=now() WHERE id=290021');
  let current=(await writer.readMobileMediaReceipt(who,lostKey)).receipt;assert(!current.referenceCurrent&&current.photoCurrent&&current.parentCurrent);assert.deepEqual(current.target,lost.target);
  await pg.query("UPDATE himoto.orders SET deleted_at=now() WHERE id=290001");
  current=(await writer.readMobileMediaReceipt(who,lostKey)).receipt;assert(!current.parentCurrent&&!current.referenceCurrent&&current.photoCurrent);assert.deepEqual(current.target,lost.target);
  assert.equal((await resolve(lostKey,'media.contract:290001')).status,'committed');
  const archived=await state();await assert.rejects(()=>write({...input,slot:'return-290021-document-4',expected:'0'}),e=>e.code==='NOT_FOUND');assert.deepEqual(await state(),archived);
  await pg.query('UPDATE himoto.orders SET deleted_at=NULL WHERE id=290001');
  // Restore only explicit SQL fixture setup for the following read tests. Never
  // used on the native checkpoint or any operational database.
  await pg.query('UPDATE himoto.order_vehicle_details SET completed_at=NULL WHERE id=290021');
  checks.push('Later reference edits and archived contracts have independent current flags without replacing original media proof; actor reconciliation survives soft-delete and new writes stay blocked');
};
