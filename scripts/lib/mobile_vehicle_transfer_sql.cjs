// Real scoped PostgreSQL; fixtures only, no credentials or external transport.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {NextRequest}=require('next/server');
const {randomUUID}=require('node:crypto');
module.exports=async function vehicleTransferSql({pg,load,root,user,checks,failReceipt,loseResponse}){
  const sql=name=>fs.readFileSync(path.resolve(root,'../docs/sql/'+name),'utf8');
  await pg.exec("ALTER TABLE himoto.stores ADD COLUMN status text DEFAULT 'opening';"+
    "ALTER TABLE himoto.vehicles ADD COLUMN odometer bigint;"+
    "ALTER TABLE himoto.vehicle_location_events ADD COLUMN created_by bigint,ADD COLUMN created_at timestamp,ADD COLUMN updated_at timestamp,"+
    "ADD COLUMN ref_type text,ADD COLUMN ref_id bigint,ADD COLUMN audit_snapshot jsonb,ADD COLUMN odometer bigint,ADD COLUMN notes text,"+
    "ADD COLUMN customer_name text,ADD COLUMN customer_phone text,ADD COLUMN customer_id_card text;"+
    "ALTER TABLE himoto.vehicle_location_events ENABLE ROW LEVEL SECURITY;"+
    "CREATE POLICY management_scoped_gate ON himoto.vehicle_location_events TO himoto_scoped USING(true) WITH CHECK(true);"+
    "GRANT SELECT,INSERT,UPDATE ON himoto.vehicle_location_events TO himoto_scoped;"+
    "GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA himoto TO himoto_scoped;");
  await pg.exec(sql('2026-10-30-vehicle-transfer-cancel.sql'));
  // The ownership/HQ patch is later in production migration order.
  const storePolicies=(sql('2026-11-01-ownership-hq-customer-source.sql').match(/CREATE POLICY[\s\S]*?;/g)||[]).filter(p=>p.includes('ON himoto.stores '));
  await pg.exec('DROP POLICY management_scoped_read ON himoto.stores;DROP POLICY management_scoped_update ON himoto.stores;'+storePolicies.join('\n'));
  const api=load(path.join(root,'lib/server/mobile-vehicle-transfers'));
  const domain=load(path.join(root,'lib/server/vehicle-actions'));
  const actor={...user,permissions:[]},receiver={...actor,id:8};
  let next=99000;
  async function vehicle(status='ready',store=24,deleted=false){
    const id=next++;
    await pg.query("INSERT INTO himoto.vehicles(id,name,license,brand,type,color,year,status,store_id,deleted_at) VALUES($1,$2,$3,'QA','electric','Đỏ','2026',$4,$5,$6)",
      [id,'Xe chuyển SQL QA','QA-TRANSFER-'+id,status,store,deleted?new Date().toISOString():null]);return id;
  }
  const prep=(id,who=actor)=>api.readMobileVehicleTransferPreparation(who,String(id),new NextRequest('https://fixture.invalid/transfers'));
  const input=async(id,action='transfer',who=actor)=>{
    const p=await prep(id,who);
    return action==='transfer'?{action,revision:p.vehicle.revision,to_store_id:23,note:'SQL QA'}:
      {action,revision:p.vehicle.revision,transfer_event_id:p.transfer.id,transfer_event_revision:p.transfer.revision,note:'SQL QA'};
  };
  const preview=(id,body,who=actor)=>api.readMobileVehicleTransferPreview(who,String(id),new NextRequest('https://fixture.invalid/transfers/preview',
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
  const apply=(id,body,who=actor)=>api.withMobileVehicleTransfer(who,id,body.action,true,db=>domain.applyVehicleAction(db,id,body,who.id));
  async function state(){
    const result={};
    for(const table of ['vehicles','vehicle_location_events','orders','order_vehicle_details','transactions','management_contract_payments','management_mobile_requests'])
      result[table]=(await pg.query('SELECT row_to_json(t) AS row,xmin::text AS revision FROM himoto.'+table+' t ORDER BY row_to_json(t)::text')).rows;
    return result;
  }
  const v=await vehicle(),body=await input(v),before=await state();
  const prepared=await prep(v),first=await preview(v,body),again=await preview(v,body);
  assert.deepEqual(prepared.actions.filter(a=>a.available).map(a=>a.action),['transfer']);
  assert.equal(first.effect,'awaiting_receipt');assert.deepEqual(first.after,{storeId:23,ownerStoreId:23,status:'in_transit'});assert.equal(first.snapshot,again.snapshot);
  assert.equal(first.vehicle.ownerStoreId,24);assert.equal(first.vehicle.ownerStoreName,first.fromStore.name);
  await assert.rejects(()=>preview(v,{...body,revision:'1'}),e=>e.code==='TRANSFER_REVIEW_REQUIRED');
  assert.deepEqual(await state(),before);
  await api.withMobileVehicleTransfer(actor,v,'transfer',true,async db=>{
    assert.equal((await db.query('SELECT id FROM himoto.orders WHERE id=102')).rowCount,0);
    const other=await vehicle('ready',31);
    assert.equal((await db.query('UPDATE himoto.vehicles SET status=$2 WHERE id=$1 RETURNING id',[other,'repairing'])).rowCount,0);
  });
  checks.push('Transfer preparation/preview read foreign fleet stock with the shared entitlement and stable read-only snapshot; pinned vehicle writes cannot touch unrelated foreign stock or expose another branch contract');
  await pg.exec("INSERT INTO himoto.stores(id,store_name,status) SELECT 1000+n,'Kho đến QA '||n,'opening' FROM generate_series(1,30)n;"+
    "INSERT INTO himoto.stores(id,store_name,status) VALUES(1100,'Kho QA_%','opening'),(1101,'Kho đóng QA','closed');");
  const destinations=(search='',page=1)=>api.readMobileTransferDestinations(actor,String(v),new NextRequest('https://fixture.invalid/destinations?'+
    new URLSearchParams({revision:body.revision,search,page:String(page)})));
  const p1=await destinations(),p2=await destinations('',2);
  assert.equal(p1.rows.length,25);assert(p1.hasMore);assert(p2.rows.length>0);
  assert(!p1.rows.concat(p2.rows).some(s=>[24,1101].includes(s.id)));
  assert.deepEqual((await destinations('_%')).rows.map(s=>s.id),[1100]);
  checks.push('Destinations paginate globally at 25, omit current/closed branches and keep wildcard search literal without broadening contract/money scope');
  const dispatched=await apply(v,body);
  assert.deepEqual((await pg.query('SELECT store_id,current_store_id FROM himoto.vehicles WHERE id=$1',[v])).rows.map(row=>[Number(row.store_id),Number(row.current_store_id)]),[[23,23]]);
  const pending=await prep(v),otherPrep=await prep(v,receiver);
  assert(pending.actions.find(a=>a.action==='cancel').available);assert(!pending.actions.find(a=>a.action==='receive').available);
  assert(otherPrep.actions.find(a=>a.action==='receive').available);assert(otherPrep.actions.find(a=>a.action==='reject').available);
  assert(!otherPrep.actions.find(a=>a.action==='cancel').available);
  const receiving=await input(v,'receive',receiver),receivePreview=await preview(v,receiving,receiver);
  assert.equal(receivePreview.effect,'received');
  await assert.rejects(()=>apply(v,{...receiving,revision:pending.vehicle.revision},actor),e=>e.status===403);
  await apply(v,receiving,receiver);
  assert.deepEqual((await pg.query('SELECT store_id,current_store_id FROM himoto.vehicles WHERE id=$1',[v])).rows.map(row=>[Number(row.store_id),Number(row.current_store_id)]),[[23,23]]);
  assert.equal((await prep(v)).vehicle.status,'ready');
  const row=(await pg.query('SELECT ref_id,event_type,audit_snapshot FROM himoto.vehicle_location_events WHERE vehicle_id=$1 ORDER BY id DESC LIMIT 1',[v])).rows[0];
  assert.equal(Number(row.ref_id),dispatched.event_id);assert.equal(row.event_type,'manual_transfer_receive');assert.equal(row.audit_snapshot.actor_id,8);
  checks.push('Ready-stock dispatch and another actor receipt run the shared domain under real latest RLS; sender cannot self-receive and immutable audit references the exact dispatch');
  for(const action of ['reject','cancel']){
    const id=await vehicle(),transfer=await apply(id,await input(id)),who=action==='cancel'?actor:receiver,wire=await input(id,action,who),p=await preview(id,wire,who);
    assert.equal(p.after.storeId,24);assert.equal(p.vehicle.ownerStoreId,23);assert.equal(p.after.ownerStoreId,24);await apply(id,wire,who);
    assert.deepEqual((await pg.query('SELECT store_id,current_store_id FROM himoto.vehicles WHERE id=$1',[id])).rows.map(row=>[Number(row.store_id),Number(row.current_store_id)]),[[24,24]]);
    assert.equal((await prep(id)).vehicle.storeId,24);
    assert.equal((await pg.query('SELECT event_type,ref_id FROM himoto.vehicle_location_events WHERE vehicle_id=$1 ORDER BY id DESC LIMIT 1',[id])).rows[0].event_type,'manual_transfer_'+action);
    await assert.rejects(()=>apply(id,wire,who),e=>e.status===409);
    assert(transfer.event_id>0);
  }
  checks.push('Reject by a different actor and cancel only by the sender return both warehouse and owner to the original branch, append separate events and refuse a second resolution');
  for(const status of ['using','rent','repairing','bad_debt']){
    const id=await vehicle(status),wire=await input(id),p=await preview(id,wire),beforeOrders=(await state()).orders;
    assert.equal(p.effect,'immediate_transfer');assert.equal(p.after.status,status);
    const result=await apply(id,wire);assert(result.transfer_completed);
    assert.deepEqual((await pg.query('SELECT store_id,current_store_id FROM himoto.vehicles WHERE id=$1',[id])).rows.map(row=>[Number(row.store_id),Number(row.current_store_id)]),[[23,23]]);
    const after=await prep(id);assert.equal(after.vehicle.status,status);assert.equal(after.vehicle.storeId,23);
    assert.deepEqual((await state()).orders,beforeOrders);
    const events=(await pg.query('SELECT id,event_type,ref_id FROM himoto.vehicle_location_events WHERE vehicle_id=$1 ORDER BY id',[id])).rows;
    assert.equal(events.length,2);assert.equal(events[1].event_type,'manual_transfer_receive');assert.equal(Number(events[1].ref_id),Number(events[0].id));
  }
  checks.push('Non-ready stock transfers immediately with unchanged using/rent/repair/bad-debt status and two linked audit events; no order or financial write occurs');
  const deleted=await vehicle('ready',24,true);
  await assert.rejects(()=>prep(deleted),e=>e.status===404);
  const deletedRevision=(await pg.query('SELECT xmin::text AS r FROM himoto.vehicles WHERE id=$1',[deleted])).rows[0].r;
  await assert.rejects(()=>apply(deleted,{action:'transfer',revision:deletedRevision,to_store_id:23,note:'must not move deleted stock'}),e=>e.status===404);
  checks.push('Both mobile reads and the shared web/mobile action writer reject soft-deleted stock before any audit/location change');
  const hired=await vehicle('using'),hiredOrder=180000;
  await pg.query("INSERT INTO himoto.orders(id,contract_number,order_status,store_id,order_type,total,pid,draft_payload) VALUES($1,'HIDDEN-TRANSFER-HIRE','renting',24,'rental','500000',123000,'{}')",[hiredOrder]);
  await pg.query('INSERT INTO himoto.order_vehicle_details(id,order_id,vehicle_id,hiring_fee) VALUES(180001,$1,$2,50000)',[hiredOrder,hired]);
  const hiredBefore=await state();
  await apply(hired,await input(hired));
  const hiredAfter=await state();
  for(const table of ['orders','order_vehicle_details','transactions','management_contract_payments'])assert.deepEqual(hiredAfter[table],hiredBefore[table]);
  assert.equal((await prep(hired)).vehicle.storeId,23);
  for(const [eventType,audit] of [['transfer_dispatch',null],['manual_transfer',{reconciliation:{superseded:true}}]]){
    const id=await vehicle('in_transit',23);
    await pg.query('INSERT INTO himoto.vehicle_location_events(vehicle_id,event_type,from_store_id,to_store_id,created_by,audit_snapshot) VALUES($1,$2,24,23,7,$3)',[id,eventType,audit]);
    const prepared=await prep(id,receiver);assert(prepared.actions.every(a=>!a.available));
    await assert.rejects(()=>preview(id,{action:'receive',revision:prepared.vehicle.revision,transfer_event_id:prepared.transfer.id,transfer_event_revision:prepared.transfer.revision,note:''},receiver),e=>e.code==='TRANSFER_REVIEW_REQUIRED');
  }
  const missingFrom=await vehicle('in_transit',23);
  await pg.query("INSERT INTO himoto.vehicle_location_events(vehicle_id,event_type,from_store_id,to_store_id,created_by) VALUES($1,'manual_transfer',NULL,23,7)",[missingFrom]);
  const missingPrep=await prep(missingFrom,receiver);
  assert(missingPrep.actions.find(a=>a.action==='receive').available);assert(!missingPrep.actions.find(a=>a.action==='reject').available);
  assert.equal((await prep(missingFrom)).actions.find(a=>a.action==='cancel').available,false);
  checks.push('A globally hidden open hire does not block transfer or change contract/money/line data; legacy/superseded events are unavailable and an unknown origin is never invented for cancel/reject');
  await pg.exec(sql('2026-11-02-mobile-vehicle-transfers.sql'));
  const writer=load(path.join(root,'lib/server/mobile-vehicle-transfer-write')),recovery=load(path.join(root,'lib/server/mobile-write-recovery'));
  const record=(id,body,key,who=actor)=>writer.recordMobileVehicleTransfer(who,String(id),new NextRequest('https://fixture.invalid/transfers',
    {method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)}));
  const resolve=(id,action,key,who=actor)=>recovery.resolveMobileWrite(who,key,new NextRequest('https://fixture.invalid/resolve',
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'vehicle.'+action+':'+id})}));
  const recordInput=async(id,action='transfer',who=actor)=>{
    const body=await input(id,action,who),review=await preview(id,body,who);return{...body,review_snapshot:review.snapshot};
  };
  const proofState=async()=>({...await state(),proof:(await pg.query('SELECT row_to_json(t) AS row,xmin::text AS revision FROM himoto.management_mobile_vehicle_transfers t ORDER BY request_id')).rows});
  const money=async()=>Object.fromEntries(Object.entries(await state()).filter(([table])=>['orders','order_vehicle_details','transactions','management_contract_payments'].includes(table)));
  const written=await vehicle(),wire=await recordInput(written),key=randomUUID(),beforeMoney=await money();
  const firstProof=await record(written,wire,key);assert(firstProof.current);assert(!firstProof.replayed);assert.equal(firstProof.events.length,1);
  assert.equal(firstProof.review.vehicle.ownerStoreId,24);assert.equal(firstProof.review.after.ownerStoreId,23);
  assert(Math.abs(Date.parse(firstProof.recordedAt)-Date.now())<60000,'Vietnam wall time must be converted to a real UTC instant');
  assert.deepEqual(await money(),beforeMoney);
  const committed=await proofState();
  assert.deepEqual(await record(written,wire,key),{...firstProof,replayed:true});assert.deepEqual(await proofState(),committed);
  assert.deepEqual((await writer.readMobileVehicleTransferReceipt(actor,key)).receipt,{...firstProof,replayed:true});
  assert.equal((await writer.readMobileVehicleTransferReceipt({...actor,store_id:31},key)).receipt.id,written);
  assert.equal((await writer.readMobileVehicleTransferReceipt(receiver,key)).receipt,null);
  assert.equal((await resolve(written,'transfer',key)).status,'committed');
  await assert.rejects(()=>resolve(written+1,'transfer',key),e=>e.code==='REQUEST_KEY_REUSED');
  await assert.rejects(()=>record(written,{...wire,note:'different'},key),e=>e.code==='REQUEST_KEY_REUSED');
  assert.deepEqual(await proofState(),committed);
  for(const verb of ['UPDATE','DELETE'])assert.equal((await pg.query('SELECT has_table_privilege($1,$2,$3) AS ok',['himoto_scoped','himoto.management_mobile_vehicle_transfers',verb])).rows[0].ok,false);
  checks.push('Mobile dispatch commits stock/audit/parent key and immutable actor-bound proof together; replay, scope change and fleet-only resolver retain the exact original receipt and cannot modify proof or financial rows');
  const receiptWire=await recordInput(written,'receive',receiver),receiptKey=randomUUID(),received=await record(written,receiptWire,receiptKey,receiver);
  assert(received.current);assert.equal(received.events[0].refId,firstProof.events[0].id);
  assert.equal((await resolve(written,'receive',receiptKey,receiver)).status,'committed');
  const oldProof=(await writer.readMobileVehicleTransferReceipt(actor,key)).receipt;
  assert(!oldProof.current&&!oldProof.vehicleCurrent&&!oldProof.transferCurrent&&oldProof.eventsCurrent);assert.deepEqual(oldProof.review,firstProof.review);
  const receivedState=await proofState();assert.deepEqual(await record(written,wire,key),oldProof);assert.deepEqual(await proofState(),receivedState);
  for(const action of ['reject','cancel']){
    const id=await vehicle(),transferProof=await record(id,await recordInput(id),randomUUID());
    const who=action==='cancel'?actor:receiver,result=await record(id,await recordInput(id,action,who),randomUUID(),who);
    assert(result.current);assert.equal(result.events[0].refId,transferProof.events[0].id);assert.equal(result.review.after.storeId,24);assert.equal(result.review.after.ownerStoreId,24);
  }
  const immediate=await vehicle('using'),immediateProof=await record(immediate,await recordInput(immediate),randomUUID());
  assert(immediateProof.current);assert.equal(immediateProof.events.length,2);assert.equal(immediateProof.events[1].refId,immediateProof.events[0].id);
  assert.deepEqual(await money(),beforeMoney);
  checks.push('Receipt/reject/cancel and immediate non-ready transfer all produce correctly linked immutable proofs; normal later receipt marks the sender snapshot non-current while preserving the original dispatch and every money/order row');
  for(const action of ['transfer','receive','reject','cancel']){
    const id=await vehicle();if(action!=='transfer')await record(id,await recordInput(id),randomUUID());
    const who=['receive','reject'].includes(action)?receiver:actor,body=await recordInput(id,action,who),key=randomUUID();
    assert.equal((await resolve(id,action,key,who)).status,'cancelled');const cancelled=await proofState();
    await assert.rejects(()=>record(id,body,key,who),e=>e.code==='REQUEST_CANCELLED');assert.deepEqual(await proofState(),cancelled);
  }
  const failed=await vehicle(),failedWire=await recordInput(failed),failedKey=randomUUID(),beforeFailure=await proofState();
  failReceipt();await assert.rejects(()=>record(failed,failedWire,failedKey),/QA failure/);assert.deepEqual(await proofState(),beforeFailure);
  assert.equal((await resolve(failed,'transfer',failedKey)).status,'cancelled');
  const lost=await vehicle(),lostWire=await recordInput(lost),lostKey=randomUUID();
  loseResponse();await assert.rejects(()=>record(lost,lostWire,lostKey),/lost after PostgreSQL commit/);
  const lostState=await proofState(),lostProof=(await writer.readMobileVehicleTransferReceipt(actor,lostKey)).receipt;assert(lostProof.current);
  assert.equal((await resolve(lost,'transfer',lostKey)).status,'committed');assert.deepEqual(await record(lost,lostWire,lostKey),lostProof);assert.deepEqual(await proofState(),lostState);
  checks.push('All four transfer operations support durable tombstones and late rejection; failure after stock/audit/proof rolls back every row, while a lost commit response recovers exactly one original dispatch');
  const stale=await vehicle(),staleWire=await recordInput(stale),staleBefore=await proofState();
  await assert.rejects(()=>record(stale,{...staleWire,revision:'1'},randomUUID()),e=>e.code==='TRANSFER_REVIEW_REQUIRED');
  assert.deepEqual(await proofState(),staleBefore);
  await pg.query("UPDATE himoto.stores SET store_name=store_name||' renamed' WHERE id=23");
  const renamed=await proofState();await assert.rejects(()=>record(stale,staleWire,randomUUID()),e=>e.code==='TRANSFER_REVIEW_REQUIRED');assert.deepEqual(await proofState(),renamed);
  const staleEvent=await vehicle(),staleDispatch=await record(staleEvent,await recordInput(staleEvent),randomUUID()),staleReceive=await recordInput(staleEvent,'receive',receiver);
  await pg.query("UPDATE himoto.vehicle_location_events SET notes='Corrected dispatch' WHERE id=$1",[staleDispatch.events[0].id]);
  const eventChanged=await proofState();await assert.rejects(()=>record(staleEvent,staleReceive,randomUUID(),receiver),e=>e.code==='TRANSFER_REVIEW_REQUIRED');assert.deepEqual(await proofState(),eventChanged);
  checks.push('Post-lock review rejects stale stock, renamed warehouse without a stock update and changed dispatch event; rejection leaves no parent/proof/audit/location mutation');
  await pg.query("UPDATE himoto.vehicle_location_events SET notes='Later correction' WHERE id=$1",[lostProof.events[0].id]);
  const corrected=(await writer.readMobileVehicleTransferReceipt(actor,lostKey)).receipt;
  assert(!corrected.eventsCurrent&&!corrected.transferCurrent&&corrected.vehicleCurrent);assert.deepEqual(corrected.events,lostProof.events);
  await pg.query('UPDATE himoto.vehicles SET deleted_at=now() WHERE id=$1',[lost]);
  const deletedProof=(await writer.readMobileVehicleTransferReceipt(actor,lostKey)).receipt;assert(!deletedProof.vehicleCurrent);
  assert.deepEqual(deletedProof.review,lostProof.review);assert.equal((await resolve(lost,'transfer',lostKey)).status,'committed');
  await assert.rejects(()=>prep(lost),e=>e.status===404);
  checks.push('Later event corrections and vehicle soft-delete report independent current flags without changing original proof; the actor can still reconcile a committed historical action while new stock actions stay blocked');
  const distinct=await vehicle('using',31);
  await pg.query('UPDATE himoto.vehicles SET current_store_id=24 WHERE id=$1',[distinct]);
  const distinctWire=await recordInput(distinct),distinctProof=await record(distinct,distinctWire,randomUUID());
  assert.equal(distinctProof.review.vehicle.storeId,24);assert.equal(distinctProof.review.vehicle.ownerStoreId,31);
  assert.notEqual(distinctProof.review.vehicle.ownerStoreName,distinctProof.review.fromStore.name);
  assert.deepEqual(distinctProof.review.after,{status:'using',storeId:23,ownerStoreId:23});assert(distinctProof.vehicleCurrent);
  assert.deepEqual((await pg.query('SELECT store_id,current_store_id FROM himoto.vehicles WHERE id=$1',[distinct])).rows.map(r=>[Number(r.store_id),Number(r.current_store_id)]),[[23,23]]);
  await pg.query('UPDATE himoto.vehicles SET store_id=31 WHERE id=$1',[distinct]);
  const ownerCorrected=(await writer.readMobileVehicleTransferReceipt(actor,distinctProof.requestId)).receipt;
  assert(!ownerCorrected.vehicleCurrent&&ownerCorrected.eventsCurrent&&ownerCorrected.transferCurrent);assert.deepEqual(ownerCorrected.review,distinctProof.review);
  checks.push('Distinct owner and physical warehouse are projected separately; immediate transfer commits both to the destination and later owner-only correction preserves original proof with an independent stock warning');
  const ownerStale=await vehicle('ready',31);await pg.query('UPDATE himoto.vehicles SET current_store_id=24 WHERE id=$1',[ownerStale]);
  const ownerStaleWire=await recordInput(ownerStale);
  await pg.query("UPDATE himoto.stores SET store_name=store_name||' owner renamed' WHERE id=31");
  const ownerRenamed=await proofState();await assert.rejects(()=>record(ownerStale,ownerStaleWire,randomUUID()),e=>e.code==='TRANSFER_REVIEW_REQUIRED');assert.deepEqual(await proofState(),ownerRenamed);
  const ownerChangedWire=await recordInput(ownerStale);await pg.query('UPDATE himoto.vehicles SET store_id=24 WHERE id=$1',[ownerStale]);
  const ownerChanged=await proofState();await assert.rejects(()=>record(ownerStale,ownerChangedWire,randomUUID()),e=>e.code==='TRANSFER_REVIEW_REQUIRED');assert.deepEqual(await proofState(),ownerChanged);
  checks.push('Review snapshot binds an owner label even when it differs from both route branches; renamed owner or owner-only revision change rejects writing atomically without replacing the request key');
  const legacyKey=randomUUID(),legacy=JSON.parse(JSON.stringify(firstProof));legacy.requestId=legacyKey;
  delete legacy.review.vehicle.ownerStoreId;delete legacy.review.vehicle.ownerStoreName;delete legacy.review.after.ownerStoreId;
  await pg.query('INSERT INTO himoto.management_mobile_requests(user_id,request_id,operation,fingerprint,resource_id,resource_revision) VALUES($1,$2,$3,$4,$5,$6)',
    [actor.id,legacyKey,'vehicle.transfer:'+written,'0'.repeat(64),written,legacy.revision]);
  await pg.query('INSERT INTO himoto.management_mobile_vehicle_transfers(user_id,request_id,vehicle_id,proof) VALUES($1,$2,$3,$4::jsonb)',[actor.id,legacyKey,written,JSON.stringify(legacy)]);
  const legacyBefore=await proofState(),legacyRead=(await writer.readMobileVehicleTransferReceipt(actor,legacyKey)).receipt;
  assert.deepEqual(legacyRead.review,legacy.review);assert(!('ownerStoreId' in legacyRead.review.after));assert(!('ownerStoreId' in legacyRead.review.vehicle));
  assert.equal((await resolve(written,'transfer',legacyKey)).status,'committed');assert.deepEqual(await proofState(),legacyBefore);
  checks.push('Historical ownership-free receipt remains actor-readable and resolvable under current RLS without backfill, snapshot reinterpretation or stored proof/request mutation');
};
