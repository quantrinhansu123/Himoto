// Shared physical-recovery domain: actual PostgreSQL/RLS, no mobile writer yet.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {NextRequest}=require('next/server');
module.exports=async function recoverySql({pg,load,root,user,checks,failReceipt,loseResponse}) {
  await pg.exec(fs.readFileSync(path.resolve(root,'../docs/sql/2026-11-02-mobile-recoveries.sql'),'utf8'));
  const domain=load(path.join(root,'lib/server/contract-returns'));
  const payments=load(path.join(root,'lib/server/contract-payments'));
  const {withMobileData}=load(path.join(root,'lib/server/mobile-context'));
  const {himotoPool}=load(path.join(root,'lib/server/himoto-database'));
  const cutoff='2026-09-16T10:00',early='2026-08-04T10:00',late='2026-10-28T10:00';
  const plan={version:1,start:'2026-08-01T10:00',end:'2026-12-01T10:00',interval:'month',amount:1000000};
  let next=85000;
  async function fixture({billing=false,frozen=true,known=true,settled=false,paid=0,deposit=0,lines=1,store=23,legacy=false}={}) {
    const id=next++,ids=[],vehicles=[];
    const composer={lifecycle:{...(known?{bad_debt:{at:cutoff+':00+07:00'}}:{}),...(settled?{settlement:{at:cutoff+':00+07:00',actor_id:7}}:{})},
      ...(billing?{installment_plan:{...plan,...(frozen?{stopped_at:cutoff}:{})}}:{})};
    await pg.query("INSERT INTO himoto.orders(id,contract_number,order_status,store_id,order_type,total,pid,first_deposit_amount,additional_deposit_amount,total_rental_fees,rent_at,return_at,draft_payload) "+
      "VALUES($1,$2,'bad_debt',$3,$4,$5::text,$6,$8,0,$5::text::bigint,'2026-08-01T03:00:00Z','2026-12-01T03:00:00Z',$7::jsonb)",
      [id,'SQL-RECOVERY-'+id,store,legacy?'ownership':'rental',billing?'1000000':'500000',paid+deposit,JSON.stringify({management_composer:composer,...(legacy?{legacy_migration:{sourceStoreId:'29'}}:{})}),deposit]);
    for(const [name,amount] of [['order:payment',paid],['order:deposit',deposit]]){
      if(!amount)continue;
      const transactionId=(await pg.query("INSERT INTO himoto.transactions(order_id,name,type,value,status,created_at,user_id,store_id,cash_id) "+
        "VALUES($1,$2,'in',$3,'approved','2026-09-10T03:00:00Z',7,$4,1) RETURNING id",[id,name,amount,store])).rows[0].id;
      await pg.query('INSERT INTO himoto.management_contract_payments(request_id,order_id,transaction_id,actor_id,request_hash) VALUES($1,$2,$3,7,$4)',
        [randomUUID(),id,transactionId,'c'.repeat(64)]);
    }
    for(let i=0;i<lines;i++){
      const item=id*100+i;ids.push(item);vehicles.push(item);
      await pg.query("INSERT INTO himoto.vehicles(id,name,license,status,store_id,current_store_id) VALUES($1,$2,$3,'bad_debt',$4,$4)",[item,'Xe thu hoi QA '+item,'QA-RECOVERY-'+item,store]);
      await pg.query("INSERT INTO himoto.order_vehicle_details(id,order_id,vehicle_id,type,rent_at,return_at,hiring_fee,substitute_unit_price,total_renewal_amount) "+
        "VALUES($1,$2,$1,'month','2026-08-01T03:00:00Z','2026-12-01T03:00:00Z',1000000,0,0)",[item,id]);
    }
    return {id,ids,vehicles};
  }
  async function transaction(who,task){return withMobileData(who,'',async()=>{
    const db=await himotoPool.connect();
    try{await db.query('BEGIN');const result=await task(db);await db.query('COMMIT');return result;}
    catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  });}
  const money=async id=>({order:(await pg.query('SELECT total,pid,first_deposit_amount,additional_deposit_amount,total_rental_fees FROM himoto.orders WHERE id=$1',[id])).rows,
    ledger:(await pg.query('SELECT row_to_json(t) AS row,xmin::text AS revision FROM himoto.transactions t WHERE order_id=$1 ORDER BY id',[id])).rows,
    payments:(await pg.query('SELECT row_to_json(t) AS row,xmin::text AS revision FROM himoto.management_contract_payments t WHERE order_id=$1 ORDER BY transaction_id',[id])).rows});
  const balance=(f,who=user)=>transaction(who,async db=>{const p=await payments.readPaymentContext(db,f.id,{page:1,size:0});return{total:p.total_amount,paid:p.paid_amount,remaining:p.remaining,deposit:p.deposit_held,refundable:p.rental_refundable};});
  async function input(f,at=late,index=0){return{item_id:f.ids[index],item_revision:(await pg.query('SELECT xmin::text AS r FROM himoto.order_vehicle_details WHERE id=$1',[f.ids[index]])).rows[0].r,request_id:randomUUID(),recovered_at:at,note:'Actual recovery QA'};}
  const recover=(body,who=user)=>transaction(who,db=>domain.recordBadDebtRecovery(db,who.id,body));
  const payload=async f=>(await pg.query('SELECT draft_payload FROM himoto.orders WHERE id=$1',[f.id])).rows[0].draft_payload.management_composer;

  const ordinary=await fixture({paid:100000,deposit:100000}),body=await input(ordinary),before=await money(ordinary.id),beforeBalance=await balance(ordinary);
  assert.equal(before.ledger.length,2);assert.equal(before.payments.length,2);assert.equal(beforeBalance.deposit,100000);
  const recorded=await recover(body);assert.equal(recorded.order_id,ordinary.id);assert(!recorded.replayed);
  assert.deepEqual(await money(ordinary.id),before);assert.deepEqual(await balance(ordinary),beforeBalance);
  assert.equal((await pg.query('SELECT status FROM himoto.vehicles WHERE id=$1',[ordinary.vehicles[0]])).rows[0].status,'ready');
  assert.equal((await payload(ordinary)).vehicle_recoveries[0].actor_id,user.id);
  checks.push('Physical bad-debt recovery uses the real scoped return/stock helpers and preserves original amounts, debt, deposits and every ledger row');
  const saved=await payload(ordinary);assert((await recover(body)).replayed);assert.deepEqual(await payload(ordinary),saved);
  await assert.rejects(()=>recover({...body,note:'Different'}),e=>e.status===409);
  await assert.rejects(()=>recover(body,{...user,id:8}),e=>e.status===409);
  checks.push('Original physical recovery replays without another event/stock change; note or actor reuse of that UUID is rejected');

  for(const at of [early,late]){
    const f=await fixture({billing:true}),oldPlan=(await payload(f)).installment_plan,oldBalance=await balance(f),oldMoney=await money(f.id);
    assert.equal(oldBalance.total,2000000);
    await recover(await input(f,at));
    assert.deepEqual(await balance(f),oldBalance,'Actual recovery must not move the frozen bad-debt amount');
    assert.deepEqual((await payload(f)).installment_plan,oldPlan,'A physical timestamp cannot overwrite the original installment cutoff');
    assert.deepEqual(await money(f.id),oldMoney);
  }
  checks.push('Backdated and later physical recoveries preserve the original stopped installment plan and frozen bad debt');

  for(const at of [early,late]){
    const f=await fixture({billing:true,frozen:false}),old=await balance(f),oldMoney=await money(f.id);
    await recover(await input(f,at));assert.deepEqual(await balance(f),old);assert.deepEqual(await money(f.id),oldMoney);
    assert.equal((await payload(f)).installment_plan.stopped_at,cutoff);
  }
  checks.push('Legacy installment debt with a known transition time freezes at that original cutoff, not the recovery date');

  const closing=await fixture({billing:true,frozen:false,settled:true,paid:2000000}),closedBefore=await balance(closing),closedMoney=await money(closing.id);
  assert.equal(closedMoney.ledger.length,1);assert.equal(closedMoney.payments.length,1);
  await recover(await input(closing,late));
  assert.equal((await pg.query('SELECT order_status FROM himoto.orders WHERE id=$1',[closing.id])).rows[0].order_status,'bad_debt','Physical-recovery permission alone cannot settle debt');
  const settlementActor={...user,access_role:'ownership_manager',store_kind:'lease_to_own'};
  const resolution=load(path.join(root,'lib/server/contract-resolution'));
  assert.equal(await transaction(settlementActor,db=>resolution.closeResolvedBadDebt(db,closing.id,settlementActor.id)),true);
  assert.equal((await pg.query('SELECT order_status FROM himoto.orders WHERE id=$1',[closing.id])).rows[0].order_status,'completed');
  assert.deepEqual(await balance(closing),closedBefore);assert.deepEqual(await money(closing.id),closedMoney);
  assert.equal((await payload(closing)).installment_plan.stopped_at,cutoff);
  checks.push('Physical recovery alone cannot settle debt; the verified ownership manager closes an already-settled debt without recreating future installments after status becomes completed');

  const missing=await fixture({billing:true,frozen:false,known:false}),missingBefore=await payload(missing);
  const missingInput=await input(missing);
  await assert.rejects(()=>recover(missingInput),e=>e.status===409);
  assert.deepEqual(await payload(missing),missingBefore);
  assert.equal((await pg.query('SELECT completed_at FROM himoto.order_vehicle_details WHERE id=$1',[missing.ids[0]])).rows[0].completed_at,null);
  checks.push('Missing installment debt cutoff fails closed before changing the rental line or composer instead of inventing a debt baseline');

  const partial=await fixture({billing:true,lines:2}),partialBefore=await balance(partial),partialPlan=(await payload(partial)).installment_plan;
  await recover(await input(partial,late,0));await recover(await input(partial,early,1));
  assert.deepEqual(await balance(partial),partialBefore);assert.deepEqual((await payload(partial)).installment_plan,partialPlan);
  checks.push('Multiple physical recoveries, including a backdated last entry, retain the same frozen plan and old balance');

  const hq=await fixture({billing:true,store:31,legacy:true}),lease={...user,store_id:29},hqBefore=await balance(hq,lease);
  const hqInput=await input(hq);
  await assert.rejects(()=>recover(hqInput,user),e=>e.status===404);
  await recover(hqInput,lease);assert.deepEqual(await balance(hq,lease),hqBefore);
  const stock=(await pg.query('SELECT status,current_store_id FROM himoto.vehicles WHERE id=$1',[hq.vehicles[0]])).rows[0];
  assert.equal(stock.status,'ready');assert.equal(Number(stock.current_store_id),31);
  checks.push('HQ legacy-29 ownership recovery follows the real scoped helper, preserves the debt and leaves stock location unchanged');

  const occupied=await fixture(),hidden=await fixture({store:24});
  await pg.query('UPDATE himoto.order_vehicle_details SET vehicle_id=$1 WHERE id=$2',[occupied.vehicles[0],hidden.ids[0]]);
  assert.equal(await transaction(user,async db=>(await db.query('SELECT id FROM himoto.orders WHERE id=$1',[hidden.id])).rowCount),0);
  await recover(await input(occupied));
  assert.equal((await pg.query('SELECT status FROM himoto.vehicles WHERE id=$1',[occupied.vehicles[0]])).rows[0].status,'bad_debt');
  assert.equal((await pg.query('SELECT completed_at FROM himoto.order_vehicle_details WHERE id=$1',[hidden.ids[0]])).rows[0].completed_at,null);
  checks.push('A globally open hire hidden by branch RLS keeps stock occupied after physical recovery of the visible old debt');

  const invalid=await fixture({billing:true}),invalidPayload=await payload(invalid);
  invalidPayload.installment_plan.amount='invalid';
  await pg.query('UPDATE himoto.orders SET draft_payload=jsonb_set(draft_payload::jsonb,\'{management_composer}\',$2::jsonb) WHERE id=$1',[invalid.id,JSON.stringify(invalidPayload)]);
  const invalidInput=await input(invalid);
  await assert.rejects(()=>recover(invalidInput),e=>e.status===409);
  assert.deepEqual(await payload(invalid),invalidPayload);
  assert.equal((await pg.query('SELECT completed_at FROM himoto.order_vehicle_details WHERE id=$1',[invalid.ids[0]])).rows[0].completed_at,null);
  checks.push('An invalid legacy installment plan rolls back the complete physical operation without losing the original payload or closing the rental line');

  const api=load(path.join(root,'lib/server/mobile-bad-debt-recovery'));
  const prep=(f,page=1,who=user)=>api.readMobileRecoveryPreparation(who,String(f.id),new NextRequest('https://fixture.invalid/recoveries?page='+page));
  const review=(f,body,who=user)=>api.readMobileRecoveryPreview(who,String(f.id),new NextRequest('https://fixture.invalid/recoveries/preview',
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
  async function reviewInput(f,at=late,who=user){const p=await prep(f,1,who);const item=p.items.rows.find(i=>i.available);return{revision:p.revision,item_id:item.id,item_revision:item.revision,recovered_at:at,note:'  Readonly recovery QA  '};}
  async function databaseStamp(){
    const result={};
    for(const table of ['orders','order_vehicle_details','vehicles','transactions','management_contract_payments','management_mobile_requests','management_mobile_returns','management_mobile_swaps','management_mobile_vehicle_transfers','management_mobile_recoveries'])
      result[table]=(await pg.query("SELECT md5(COALESCE(string_agg(row_to_json(t)::text||':'||xmin::text,'|' ORDER BY row_to_json(t)::text),'')) AS hash FROM himoto."+table+' t')).rows[0].hash;
    result.transactionSequence=(await pg.query('SELECT last_value,is_called FROM himoto.transactions_id_seq')).rows;
    return result;
  }
  const paged=await fixture({lines:26,billing:true,paid:100000,deposit:200000});
  await pg.query('UPDATE himoto.order_vehicle_details SET completed_at=$2 WHERE id=$1',[paged.ids[0],late+':00+07:00']);
  const pagedPayload=await payload(paged);pagedPayload.private_customer_id='PRIVATE-RECOVERY-MUST-NOT-PROJECT';
  await pg.query('UPDATE himoto.orders SET draft_payload=jsonb_set(draft_payload::jsonb,\'{management_composer}\',$2::jsonb) WHERE id=$1',[paged.id,JSON.stringify(pagedPayload)]);
  const stamp=await databaseStamp(),p1=await prep(paged),p2=await prep(paged,2);
  assert.equal(p1.items.rows.length,25);assert(p1.items.rows.every(i=>i.available));assert.equal(p1.remainingItems,25);
  assert.equal(p2.items.rows.length,1);assert.equal(p2.items.rows[0].id,paged.ids[0]);assert(!p2.items.rows[0].available);
  assert.equal(p1.amounts.depositHeld,200000);assert.equal(p1.billingStoppedAt,'2026-09-16T03:00:00.000Z');
  assert(!JSON.stringify(p1).includes('PRIVATE-RECOVERY-MUST-NOT-PROJECT'));
  await assert.rejects(()=>prep(paged,1,{...user,store_id:24}),e=>e.status===404);
  await assert.rejects(()=>prep(paged,3),e=>e.status===400);
  await assert.rejects(()=>api.withMobileRecovery(user,db=>db.query('UPDATE himoto.orders SET updated_at=now() WHERE id=$1',[paged.id])),e=>e.code==='25006');
  assert.deepEqual(await databaseStamp(),stamp);
  checks.push('Recovery preparation executes repeatable-read/readonly RLS with 25 active lines before returned history, exact debt/cutoff, branch isolation and no raw composer/customer or ledger exposure');

  for(const f of [missing,invalid]){const p=await prep(f);assert(!p.available&&p.items.rows.every(i=>!i.available)&&p.blockedReason);}
  const done=await prep(ordinary);assert(!done.available);
  await pg.query("UPDATE himoto.orders SET order_status='renting' WHERE id=$1",[invalid.id]);assert(!(await prep(invalid)).available);
  await pg.query("UPDATE himoto.orders SET order_status='bad_debt' WHERE id=$1",[invalid.id]);
  const withoutEnd=await fixture();await pg.query('UPDATE himoto.order_vehicle_details SET return_at=NULL WHERE id=$1',[withoutEnd.ids[0]]);
  assert((await prep(withoutEnd)).items.rows[0].available,'Physical recovery requires the actual date, not a scheduled return date');
  const foreign=await fixture();await pg.query('UPDATE himoto.vehicles SET store_id=24,current_store_id=24 WHERE id=$1',[foreign.vehicles[0]]);
  assert.equal((await prep(foreign)).items.rows[0].license,'QA-RECOVERY-'+foreign.vehicles[0]);
  await pg.query('DELETE FROM himoto.vehicles WHERE id=$1',[foreign.vehicles[0]]);
  const noLabel=(await prep(foreign)).items.rows[0];assert(noLabel.available&&noLabel.name===''&&noLabel.vehicleId===foreign.vehicles[0]);
  checks.push('Preparation keeps physical recovery distinct from ordinary returns: missing end/archived or foreign stock labels do not erase scoped lines; invalid/missing cutoff and completed/non-debt contracts remain explicitly blocked');

  async function previewParity(options,at=late,who=user){
    const f=await fixture(options),beforeStamp=await databaseStamp(),body=await reviewInput(f,at,who),view=await review(f,body,who),again=await review(f,body,who);
    assert.equal(view.snapshot,again.snapshot);assert.equal(view.note,'Readonly recovery QA');assert.deepEqual(await databaseStamp(),beforeStamp);
    const oldMoney=await money(f.id);
    await transaction(who,async db=>{
      const result=await domain.recordBadDebtRecovery(db,who.id,{item_id:body.item_id,item_revision:body.item_revision,recovered_at:body.recovered_at,note:body.note,request_id:randomUUID()});
      const state=await payments.readPaymentContext(db,f.id,{page:1,size:0});
      assert.equal(result.order_id,f.id);assert.equal(Date.parse(result.recovered_at),Date.parse(view.recoveredAt));
      assert.equal(state.total_amount,view.after.totalAmount);assert.equal(state.paid_amount,view.after.rentalPaid);assert.equal(state.remaining,view.after.rentalRemaining);
      assert.equal(state.deposit_held,view.after.depositHeld);assert.equal(state.status,view.after.status);assert.equal(state.items.length,view.after.remainingItems);
    });
    assert.deepEqual(await money(f.id),oldMoney);return{f,body,view};
  }
  await previewParity({paid:100000,deposit:100000});
  await previewParity({billing:true},early);await previewParity({billing:true},late);
  await previewParity({billing:true,frozen:false,settled:true,paid:2000000});
  const closePreview=await previewParity({billing:true,frozen:false,settled:true,paid:2000000},late,settlementActor);
  assert.equal(closePreview.view.after.status,'completed');
  await previewParity({billing:true,lines:2});
  const ownershipReview=await previewParity({billing:true,store:31,legacy:true},early,lease);
  assert(ownershipReview.view.ownership);assert.equal(ownershipReview.view.item.license,'QA-RECOVERY-'+ownershipReview.f.vehicles[0]);
  checks.push('Readonly recovery preview has stable no-write snapshots and matches the shared writer for ordinary/early/late frozen debt, multiple lines and already-settled automatic completion; money and original ledger stay identical');

  const stale=await fixture({billing:true,paid:100000}),staleInput=await reviewInput(stale),original=await review(stale,staleInput),originalStamp=await databaseStamp();
  const changedNote=await review(stale,{...staleInput,note:'Different'}),changedDate=await review(stale,{...staleInput,recovered_at:early});
  assert.notEqual(changedNote.snapshot,original.snapshot);assert.notEqual(changedDate.snapshot,original.snapshot);
  await assert.rejects(()=>review(stale,{...staleInput,revision:'1'}),e=>e.status===409);
  await assert.rejects(()=>review(stale,{...staleInput,item_revision:'1'}),e=>e.status===409);
  await assert.rejects(()=>review(stale,{...staleInput,item_id:paged.ids[1]}),e=>e.status===409);
  await assert.rejects(()=>review(stale,{...staleInput,recovered_at:'2026-07-31T10:00'}),e=>e.status===409);
  assert.deepEqual(await databaseStamp(),originalStamp);
  await pg.query('UPDATE himoto.transactions SET value=value+1 WHERE order_id=$1',[stale.id]);
  assert.equal((await prep(stale)).revision,staleInput.revision);
  assert.notEqual((await review(stale,staleInput)).snapshot,original.snapshot,'A corrected ledger row must invalidate the old review even if order xmin did not change');
  checks.push('Review binds note/date, contract/item revisions and transaction row revisions; foreign/wrong/stale/pre-rental inputs fail without mutation and later ledger correction invalidates its snapshot');

  const writer=load(path.join(root,'lib/server/mobile-recovery-write')),resolver=load(path.join(root,'lib/server/mobile-write-recovery'));
  const record=(f,body,key,who=user)=>writer.recordMobileRecovery(who,String(f.id),new NextRequest('https://fixture.invalid/recoveries',
    {method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)}));
  const resolve=(f,key,who=user)=>resolver.resolveMobileWrite(who,key,new NextRequest('https://fixture.invalid/write/'+key,
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'return.recover:'+f.id})}));
  async function recordInput(f,at=late,who=user){const details=await reviewInput(f,at,who),view=await review(f,details,who);return{...details,review_snapshot:view.snapshot};}
  const firstFixture=await fixture({billing:true,paid:100000,deposit:200000}),firstBody=await recordInput(firstFixture),key=randomUUID(),beforeMoney=await money(firstFixture.id);
  const first=await record(firstFixture,firstBody,key);assert(first.current&&!first.replayed,JSON.stringify({item:first.itemCurrent,history:first.historyCurrent,money:first.moneyCurrent,contract:first.contractCurrent,replayed:first.replayed}));assert.equal(first.actorId,user.id);assert.equal(first.event.itemId,firstFixture.ids[0]);
  assert.equal(first.review.after.rentalRemaining,1900000);assert.deepEqual(await money(firstFixture.id),beforeMoney);
  const committed=await databaseStamp(),originalProof=(await pg.query('SELECT proof FROM himoto.management_mobile_recoveries WHERE user_id=$1 AND request_id=$2',[user.id,key])).rows[0].proof;
  assert.deepEqual(await record(firstFixture,firstBody,key),{...first,replayed:true});
  assert.deepEqual((await writer.readMobileRecoveryReceipt(user,key)).receipt,{...first,replayed:true});assert.equal((await resolve(firstFixture,key)).status,'committed');
  assert.equal((await writer.readMobileRecoveryReceipt({...user,id:8},key)).receipt,null);
  await assert.rejects(()=>writer.readMobileRecoveryReceipt({...user,store_id:24},key),e=>e.code==='FORBIDDEN');
  await assert.rejects(()=>record(firstFixture,{...firstBody,note:'different'},key),e=>e.code==='REQUEST_KEY_REUSED');
  assert.deepEqual(await databaseStamp(),committed);
  for(const verb of ['UPDATE','DELETE'])assert.equal((await pg.query('SELECT has_table_privilege($1,$2,$3) AS allowed',['himoto_scoped','himoto.management_mobile_recoveries',verb])).rows[0].allowed,false);
  checks.push('Mobile recovery atomically records physical line/stock/domain history and append-only actor proof with unchanged money/ledger; exact replay/lookup/resolve preserve the original and isolate actor/scope');

  const cancelled=await fixture(),cancelBody=await recordInput(cancelled),cancelKey=randomUUID();
  assert.equal((await resolve(cancelled,cancelKey)).status,'cancelled');const cancelledState=await databaseStamp();
  await assert.rejects(()=>record(cancelled,cancelBody,cancelKey),e=>e.code==='REQUEST_CANCELLED');assert.deepEqual(await databaseStamp(),cancelledState);
  const failed=await fixture({paid:100000}),failedBody=await recordInput(failed),failedKey=randomUUID(),failedBefore=await databaseStamp();
  failReceipt();await assert.rejects(()=>record(failed,failedBody,failedKey),/QA failure/);assert.deepEqual(await databaseStamp(),failedBefore);
  assert.equal((await resolve(failed,failedKey)).status,'cancelled');
  const lost=await fixture(),lostBody=await recordInput(lost),lostKey=randomUUID();loseResponse();
  await assert.rejects(()=>record(lost,lostBody,lostKey),/lost after PostgreSQL commit/);
  const lostState=await databaseStamp(),lostReceipt=(await writer.readMobileRecoveryReceipt(user,lostKey)).receipt;assert(lostReceipt.current);
  assert.equal((await resolve(lost,lostKey)).status,'committed');assert.deepEqual(await record(lost,lostBody,lostKey),lostReceipt);assert.deepEqual(await databaseStamp(),lostState);
  checks.push('Recovery tombstones reject late delivery; failure after physical stock/history/proof rolls everything back; lost commit response resolves to exactly one immutable original recovery');

  for(const field of ['revision','item_revision','review_snapshot']){
    const f=await fixture(),body=await recordInput(f),before=await databaseStamp();
    await assert.rejects(()=>record(f,{...body,[field]:field==='review_snapshot'?'a'.repeat(64):'1'},randomUUID()),e=>e.code==='RECOVERY_REVIEW_REQUIRED');
    assert.deepEqual(await databaseStamp(),before);
  }
  const correctedLedger=await fixture({paid:100000}),staleLedgerBody=await recordInput(correctedLedger);
  await pg.query('UPDATE himoto.transactions SET value=value+1 WHERE order_id=$1',[correctedLedger.id]);const ledgerChanged=await databaseStamp();
  await assert.rejects(()=>record(correctedLedger,staleLedgerBody,randomUUID()),e=>e.code==='RECOVERY_REVIEW_REQUIRED');assert.deepEqual(await databaseStamp(),ledgerChanged);
  const another=await fixture(),anotherInput=await recordInput(another),wrongLineBefore=await databaseStamp();
  await assert.rejects(()=>record(correctedLedger,{...staleLedgerBody,item_id:anotherInput.item_id,item_revision:anotherInput.item_revision},randomUUID()),e=>e.code==='RECOVERY_REVIEW_REQUIRED');
  assert.deepEqual(await databaseStamp(),wrongLineBefore);
  checks.push('Locked mobile recovery recomputes the review and rejects stale order/line/snapshot/ledger or another contract line without leaving any key, history, stock or money mutation');

  const owned=await fixture({billing:true,store:31,legacy:true}),ownedMoney=await money(owned.id),ownedBody=await recordInput(owned,early,lease);
  const ownedProof=await record(owned,ownedBody,randomUUID(),lease);assert(ownedProof.current&&ownedProof.review.ownership);assert.deepEqual(await money(owned.id),ownedMoney);
  const closingMobile=await fixture({billing:true,frozen:false,settled:true,paid:2000000}),closingInput=await recordInput(closingMobile);
  assert.equal((await record(closingMobile,closingInput,randomUUID())).review.after.status,'bad_debt');
  const permittedClosing=await fixture({billing:true,frozen:false,settled:true,paid:2000000}),permittedInput=await recordInput(permittedClosing,late,settlementActor);
  const beforePermissionChange=await databaseStamp();
  await assert.rejects(()=>record(permittedClosing,permittedInput,randomUUID(),user),error=>error.code==='RECOVERY_REVIEW_REQUIRED');
  assert.deepEqual(await databaseStamp(),beforePermissionChange,'Losing settlement authority invalidates the old closing review without writes');
  assert.equal((await record(permittedClosing,permittedInput,randomUUID(),settlementActor)).review.after.status,'completed');
  const taken=await fixture(),hiddenHire=await fixture({store:24});await pg.query('UPDATE himoto.order_vehicle_details SET vehicle_id=$1 WHERE id=$2',[taken.vehicles[0],hiddenHire.ids[0]]);
  await record(taken,await recordInput(taken),randomUUID());assert.equal((await pg.query('SELECT status FROM himoto.vehicles WHERE id=$1',[taken.vehicles[0]])).rows[0].status,'bad_debt');
  checks.push('Mobile writer handles HQ/legacy-29, backdated frozen debt, privileged settled completion and hidden foreign occupancy; ordinary return staff recover the vehicle while retaining bad debt, with no location or financial changes');

  await pg.query('UPDATE himoto.transactions SET value=value+1 WHERE order_id=$1',[firstFixture.id]);
  let corrected=(await writer.readMobileRecoveryReceipt(user,key)).receipt;assert(!corrected.moneyCurrent&&corrected.itemCurrent&&corrected.historyCurrent&&corrected.contractCurrent);
  await pg.query("UPDATE himoto.order_vehicle_details SET completed_at=completed_at+interval '1 minute' WHERE id=$1",[firstFixture.ids[0]]);
  corrected=(await writer.readMobileRecoveryReceipt(user,key)).receipt;assert(!corrected.itemCurrent&&corrected.historyCurrent);
  await pg.query("UPDATE himoto.orders SET draft_payload=jsonb_set(draft_payload::jsonb,'{management_composer,vehicle_recoveries,0,note}','\"Corrected note\"'::jsonb) WHERE id=$1",[firstFixture.id]);
  corrected=(await writer.readMobileRecoveryReceipt(user,key)).receipt;assert(!corrected.historyCurrent&&!corrected.contractCurrent);
  assert.deepEqual(corrected.review,first.review);assert.deepEqual(corrected.event,first.event);
  assert.deepEqual((await pg.query('SELECT proof FROM himoto.management_mobile_recoveries WHERE user_id=$1 AND request_id=$2',[user.id,key])).rows[0].proof,originalProof);
  await pg.query('UPDATE himoto.orders SET deleted_at=now() WHERE id=$1',[firstFixture.id]);
  assert((await writer.readMobileRecoveryReceipt(user,key)).receipt&&!((await writer.readMobileRecoveryReceipt(user,key)).receipt.current));
  assert.equal((await resolve(firstFixture,key)).status,'committed');await assert.rejects(()=>prep(firstFixture),e=>e.code==='NOT_FOUND');
  checks.push('Later money/line/history corrections have independent current flags while original proof stays immutable; archived in-scope orders still permit actor receipt/resolution and block new preparation');
};
