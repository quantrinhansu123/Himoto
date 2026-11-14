// Real PostgreSQL/RLS execution; synthetic data and no external transport.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {NextRequest}=require('next/server');
const {randomUUID}=require('node:crypto');
module.exports=async function swapSql({pg,load,root,user,checks,failReceipt,loseResponse}) {
  await pg.exec("SET max_stack_depth='100kB';");
  const sql=name=>fs.readFileSync(path.resolve(root,'../docs/sql/'+name),'utf8');
  const functions=name=>sql(name).match(/CREATE OR REPLACE FUNCTION[\s\S]*?AS (\$\w*\$)[\s\S]*?\1\s*;/gi)||[];
  await pg.exec("ALTER TABLE himoto.orders ADD COLUMN IF NOT EXISTS order_type text;"+
    "ALTER TABLE himoto.stores ADD COLUMN kind text;"+
    "ALTER TABLE himoto.vehicles ADD COLUMN brand text,ADD COLUMN type text,ADD COLUMN color text,ADD COLUMN year text,"+
    "ADD COLUMN store_id bigint,ADD COLUMN current_store_id bigint,ADD COLUMN IF NOT EXISTS deleted_at timestamptz;"+
    "CREATE TABLE IF NOT EXISTS himoto.vehicle_location_events(id bigserial,vehicle_id bigint,event_type text,from_store_id bigint,to_store_id bigint);"+
    "INSERT INTO himoto.stores VALUES(29,'Kho Thuê sở hữu QA','lease_to_own'),(31,'Trụ sở chính QA','branch');"+
    "UPDATE himoto.stores SET kind='branch' WHERE id IN(23,24);"+
    "CREATE ROLE service_role;");
  await pg.exec(sql('2026-10-09-contract-vehicle-swaps.sql'));
  await pg.exec(functions('2026-10-17-account-access.sql').filter(x=>x.includes('himoto.access_operation(')).join('\n'));
  await pg.exec(functions('2026-10-23-ownership-hq-vehicles.sql').join('\n'));
  await pg.exec(functions('2026-11-01-ownership-hq-customer-source.sql').join('\n'));
  await pg.exec(functions('2026-10-19-contract-classification-availability.sql').filter(x=>x.includes('himoto.vehicle_has_open_rental(')).join('\n'));
  await pg.exec("DROP FUNCTION himoto.vehicle_inventory();");
  await pg.exec(functions('2026-10-20-returned-vehicle-availability.sql').filter(x=>x.includes('himoto.vehicle_inventory(')).join('\n'));
  // Existing permissive gates + the actual deployed restrictive expressions.
  for(const table of ['vehicles','stores','management_contract_vehicle_swaps','order_vehicle_details']){
    await pg.exec('ALTER TABLE himoto.'+table+' ENABLE ROW LEVEL SECURITY;'+
      'GRANT SELECT,INSERT,UPDATE ON himoto.'+table+' TO himoto_scoped;'+
      'CREATE POLICY management_scoped_gate ON himoto.'+table+' TO himoto_scoped USING(true) WITH CHECK(true);');
  }
  await pg.exec("GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA himoto TO himoto_scoped;"+
    "CREATE POLICY scoped_lines ON himoto.order_vehicle_details AS RESTRICTIVE TO himoto_scoped "+
    "USING(EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=order_id)) WITH CHECK(EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=order_id));"+
    "CREATE POLICY scoped_swaps ON himoto.management_contract_vehicle_swaps AS RESTRICTIVE TO himoto_scoped "+
    "USING(EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=order_id)) WITH CHECK(EXISTS(SELECT 1 FROM himoto.orders o WHERE o.id=order_id));"+
    "DROP POLICY branch_orders ON himoto.orders;"+
    "CREATE POLICY management_scoped_gate ON himoto.orders TO himoto_scoped USING(true) WITH CHECK(true);");
  await pg.exec(functions('2026-10-24-global-vehicle-transfers.sql').join('\n'));
  const policies=(name,tables)=>(sql(name).match(/CREATE POLICY[\s\S]*?;/g)||[]).filter(p=>tables.some(t=>p.includes('ON himoto.'+t+' '))).join('\n');
  await pg.exec(policies('2026-10-24-global-vehicle-transfers.sql',['vehicles']));
  await pg.exec(policies('2026-11-01-ownership-hq-customer-source.sql',['orders','stores']));
  await pg.exec(sql('2026-11-12-bounded-contract-vehicles.sql').split('-- List filters need')[0]+'COMMIT;');
  const api=load(path.join(root,'lib/server/mobile-swaps'));
  const who={...user,permissions:['contracts.read','contracts.return','vehicles.read']};
  const prep=(id,page=1,actor=who)=>api.readMobileSwapPreparation(actor,String(id),new NextRequest('https://fixture.invalid/swaps?page='+page));
  const candidates=(p,item,search='',page=1,actor=who)=>api.readMobileSwapCandidates(actor,String(p.id),new NextRequest('https://fixture.invalid/swaps/candidates?'+new URLSearchParams({
    revision:p.revision,item_id:String(item.id),item_revision:item.revision,search,page:String(page)})));
  let next=6000;
  async function vehicle(store=23,status='ready',extra={}) {
    const id=next++;
    await pg.query("INSERT INTO himoto.vehicles(id,name,license,status,store_id,brand,type,color,year,deleted_at) VALUES($1,$2,$3,$4,$5,'QA','electric','Đỏ','2026',$6)",
      [id,'Xe đổi QA '+id,extra.license??'QA-'+id,status,store,extra.deleted?new Date().toISOString():null]);
    return id;
  }
  async function fixture({store=23,stock=23,status='renting',payload={},type='rental',lines=1}={}) {
    const id=next++,ids=[],vehicles=[];
    await pg.query("INSERT INTO himoto.orders(id,contract_number,order_status,store_id,order_type,total,pid,first_deposit_amount,additional_deposit_amount,total_rental_fees,rent_at,return_at,draft_payload) "+
      "VALUES($1,$2,$3,$4,$5,'500000',100000,100000,0,500000,now()-interval '1 day',now()+interval '10 days',$6)",[id,'SQL-SWAP-'+id,status,store,type,JSON.stringify(payload)]);
    for(let i=0;i<lines;i++){
      const v=await vehicle(stock,'using'),item=next++;ids.push(item);vehicles.push(v);
      await pg.query("INSERT INTO himoto.order_vehicle_details(id,order_id,vehicle_id,type,rent_at,return_at,hiring_fee,substitute_unit_price,total_renewal_amount) VALUES($1,$2,$3,'day',now()-interval '1 day',now()+interval '10 days',50000,0,0)",[item,id,v]);
    }
    return{id,ids,vehicles};
  }
  const f=await fixture({lines:26}),a=await vehicle(),b=await vehicle(24),deleted=await vehicle(23,'ready',{deleted:true});
  const p=await prep(f.id),p2=await prep(f.id,2);
  assert.equal(p.items.rows.length,25);assert.equal(p2.items.rows.length,1);assert(p.available);
  const c=await candidates(p,p.items.rows[0]);
  assert(c.rows.some(v=>v.id===a));assert(!c.rows.some(v=>[b,deleted,...f.vehicles].includes(v.id)));
  const soft=await fixture({status:'draft',payload:{management_composer:{draft:{vehicles:[{id:String(a)}]}}}});
  const held=(await candidates(p,p.items.rows[0])).rows.find(row=>row.id===a);assert(held);assert(held.draftHolds.some(hold=>hold.id===soft.id));
  await assert.rejects(()=>prep(f.id,1,{...who,store_id:24}),e=>e.status===404);
  checks.push('Swap preparation and stock candidates execute scoped PostgreSQL with bounded 25-row pages; foreign, deleted and already-used stock are excluded');
  const hidden=await fixture({store:24,status:'bad_debt'});
  await pg.query("UPDATE himoto.order_vehicle_details SET vehicle_id=$1 WHERE id=$2",[a,hidden.ids[0]]);
  assert(!(await candidates(p,p.items.rows[0])).rows.some(v=>v.id===a));
  await pg.query("UPDATE himoto.order_vehicle_details SET completed_at=now() WHERE id=$1",[hidden.ids[0]]);
  assert((await candidates(p,p.items.rows[0])).rows.some(v=>v.id===a));
  const literal=await vehicle(23,'ready',{license:'QA_%literal'});
  assert.deepEqual((await candidates(p,p.items.rows[0],'_%')).rows.map(v=>v.id),[literal]);
  const lease={...who,store_id:29},ownership=await fixture({store:31,stock:31,payload:{legacy_migration:{sourceStoreId:'29'}}});
  const leaseStock=await vehicle(29),hqStock=await vehicle(31);
  await assert.rejects(()=>prep(ownership.id,1,lease),e=>e.code==='54001');
  await pg.exec(sql('2026-11-02-ownership-scope-helpers.sql'));
  checks.push('Real ownership/HQ policy functions reproduce recursive stores RLS (54001); narrowly scoped metadata-definer migration fixes recursion without changing policy expressions');
  const op=await prep(ownership.id,1,lease);assert(op.ownership);
  const oc=await candidates(op,op.items.rows[0],'',1,lease);
  assert(oc.rows.some(v=>v.id===leaseStock));assert(!oc.rows.some(v=>v.id===hqStock));
  checks.push('Cross-branch bad-debt occupancy blocks replacement even when hidden by order RLS; completed hire releases it; wildcard searches are literal and legacy-29/HQ ownership uses only received lease stock');
  await pg.exec('DROP FUNCTION himoto.contract_vehicle_labels();');
  await pg.exec(sql('2026-10-21-contract-vehicle-labels.sql'));
  assert.equal((await prep(ownership.id,1,lease)).items.rows[0].license,'QA-'+ownership.vehicles[0]);
  await assert.rejects(()=>api.withMobileSwap(lease,true,db=>db.query('SELECT himoto.complete_contract_vehicle_return($1,now())',[ownership.ids[0]])),e=>e.code==='42501');
  await pg.exec(sql('2026-11-02-contract-vehicle-scope.sql'));
  assert.equal((await prep(ownership.id,1,lease)).items.rows[0].license,'QA-'+ownership.vehicles[0]);
  await api.withMobileSwap(lease,true,async db=>{
    await db.query('SAVEPOINT probe');
    await db.query('SELECT himoto.complete_contract_vehicle_return($1,now())',[ownership.ids[0]]);
    await db.query('SELECT himoto.release_returned_contract_vehicle($1)',[ownership.ids[0]]);
    await db.query('ROLLBACK TO SAVEPOINT probe');
  });
  checks.push('Actual contract-label and physical-return helpers reproduce missing HQ ownership scope; guarded predicate migration aligns them with access_order_store and retains rollback-only physical recovery');
  await pg.exec(sql('2026-11-02-contract-vehicle-swaps.sql'));
  const domain=load(path.join(root,'lib/server/contract-returns'));
  const swap=async(f,target,actor=who)=>{
    const prepared=await prep(f.id,1,actor),line=prepared.items.rows.find(row=>row.id===f.ids[0]);
    return api.withMobileSwap(actor,true,db=>domain.replaceContractVehicle(db,actor.id,{item_id:line.id,item_revision:line.revision,vehicle_id:target}));
  };
  const ownResult=await swap(ownership,leaseStock,lease);
  assert.equal(ownResult.old_license,'QA-'+ownership.vehicles[0]);
  assert.equal(ownResult.new_license,'QA-'+leaseStock);
  const stockRows=(await pg.query('SELECT id,status,store_id,current_store_id FROM himoto.vehicles WHERE id=ANY($1::bigint[])',[ownership.vehicles.concat(leaseStock)])).rows;
  assert.equal(stockRows.find(v=>Number(v.id)===leaseStock).status,'using');
  assert.equal(stockRows.find(v=>Number(v.id)===ownership.vehicles[0]).status,'ready');
  assert(stockRows.every(v=>v.current_store_id==null));
  await assert.rejects(()=>api.withMobileSwap(who,true,db=>db.query('SELECT himoto.release_swapped_contract_vehicle($1)',[ownResult.swap_id])),e=>e.code==='42501');
  await assert.rejects(()=>api.withMobileSwap({...lease,id:8},true,db=>db.query('SELECT himoto.release_swapped_contract_vehicle($1)',[ownResult.swap_id])),e=>e.code==='42501');
  const foreign=await fixture({stock:24}),foreignNew=await vehicle();
  const foreignResult=await swap(foreign,foreignNew);
  assert.equal(foreignResult.old_license,'QA-'+foreign.vehicles[0]);
  assert.equal((await pg.query('SELECT status FROM himoto.vehicles WHERE id=$1',[foreign.vehicles[0]])).rows[0].status,'ready');
  const occupied=await fixture({stock:24}),blocker=await fixture({store:24,status:'bad_debt'}),occupiedNew=await vehicle();
  await pg.query('UPDATE himoto.order_vehicle_details SET vehicle_id=$1 WHERE id=$2',[occupied.vehicles[0],blocker.ids[0]]);
  await swap(occupied,occupiedNew);
  assert.equal((await pg.query('SELECT status FROM himoto.vehicles WHERE id=$1',[occupied.vehicles[0]])).rows[0].status,'using');
  checks.push('Shared web/mobile swap domain recognizes legacy-29 ownership, captures old foreign labels and releases only unoccupied old stock through actor/order/history-bound SQL; hidden bad debt keeps stock occupied and locations never move');
  const badCandidate=await vehicle(),badHire=await fixture({store:24,status:'bad_debt'});
  await pg.query('UPDATE himoto.order_vehicle_details SET vehicle_id=$1 WHERE id=$2',[badCandidate,badHire.ids[0]]);
  await assert.rejects(()=>swap(f,badCandidate),e=>e.status===409);
  await assert.rejects(()=>swap(f,deleted),e=>e.status===409);
  await assert.rejects(()=>swap(f,b),e=>e.status===409);
  await assert.rejects(()=>swap(ownership,hqStock,lease),e=>e.status===409);
  checks.push('Shared swap writer rechecks deleted stock, foreign branch, ownership warehouse and globally hidden bad-debt occupancy rather than trusting a prior candidate page');
  await pg.exec("INSERT INTO himoto.stores VALUES(32,'Kho Thuê sở hữu dự phòng QA',NULL);");
  const fallbackStock=await vehicle(32),allLease={...lease,scope_all:true};
  const allOwnership=await prep(ownership.id,1,allLease),fallbackList=await candidates(allOwnership,allOwnership.items.rows[0],'',1,allLease);
  assert(fallbackList.rows.some(v=>v.id===fallbackStock));
  await pg.exec("UPDATE himoto.stores SET kind='branch' WHERE id=32;");
  assert(!(await candidates(allOwnership,allOwnership.items.rows[0],'',1,allLease)).rows.some(v=>v.id===fallbackStock));
  const explicit=await fixture({payload:{legacy_migration:{sourceStoreId:'29'},management_composer:{rental_type:'rental'}}}),explicitTarget=await vehicle();
  assert.equal((await prep(explicit.id)).ownership,false);await swap(explicit,explicitTarget);
  const returned=await fixture(),returnedTarget=await vehicle();
  await pg.query('UPDATE himoto.order_vehicle_details SET completed_at=now() WHERE id=$1',[returned.ids[0]]);
  assert.equal((await prep(returned.id)).available,false);await assert.rejects(()=>swap(returned,returnedTarget),e=>e.status===404);
  const battery=await fixture({payload:{legacy_migration:{sourceStoreId:'30'}}});
  await assert.rejects(()=>prep(battery.id),e=>e.status===404);
  // Idempotent function-only migrations preserve both behaviour and grants.
  await pg.exec(sql('2026-11-02-ownership-scope-helpers.sql'));
  await pg.exec(sql('2026-11-02-contract-vehicle-scope.sql'));
  await pg.exec(sql('2026-11-02-contract-vehicle-swaps.sql'));
  checks.push('Ownership kind overrides name fallback, accent-folded legacy stock names still work, an explicit ordinary rental overrides legacy-29 provenance, returned/battery lines stay unavailable and helper migrations are idempotent');
  await pg.exec(sql('2026-11-02-mobile-swaps.sql'));
  const writer=load(path.join(root,'lib/server/mobile-swap-write')),recovery=load(path.join(root,'lib/server/mobile-write-recovery'));
  const input=async(f,target,actor=who)=>{
    const p=await prep(f.id,1,actor),item=p.items.rows.find(row=>row.id===f.ids[0]);
    const revision=(await pg.query('SELECT xmin::text AS r FROM himoto.vehicles WHERE id=$1',[target])).rows[0].r;
    return{revision:p.revision,item_id:item.id,item_revision:item.revision,vehicle_id:target,vehicle_revision:revision};
  };
  const record=(f,body,key,actor=who)=>writer.recordMobileSwap(actor,String(f.id),new NextRequest('https://fixture.invalid/contracts/'+f.id+'/swaps',
    {method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)}));
  const resolve=(f,key,actor=who)=>recovery.resolveMobileWrite(actor,key,new NextRequest('https://fixture.invalid/write/'+key,
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'return.swap:'+f.id})}));
  const state=async()=>{
    const data={};
    for(const table of ['orders','order_vehicle_details','vehicles','management_contract_vehicle_swaps','transactions','management_contract_payments','management_mobile_requests','management_mobile_swaps'])
      data[table]=(await pg.query('SELECT row_to_json(t) AS row,xmin::text AS revision FROM himoto.'+table+' t ORDER BY row_to_json(t)::text')).rows;
    return data;
  };
  const money=async(id)=>({
    order:(await pg.query("SELECT total,pid,first_deposit_amount,additional_deposit_amount,total_rental_fees,rent_at,return_at,order_status,"+
      "draft_payload #> '{management_composer,installment_plan}' AS plan FROM himoto.orders WHERE id=$1",[id])).rows,
    transactions:(await pg.query('SELECT row_to_json(t) AS row,xmin::text AS revision FROM himoto.transactions t ORDER BY id')).rows,
    payments:(await pg.query('SELECT row_to_json(t) AS row,xmin::text AS revision FROM himoto.management_contract_payments t ORDER BY request_id')).rows,
  });
  const w=await fixture({stock:24}),target=await vehicle(),key=randomUUID();
  const payload={order_items:[{vehicle_id:w.vehicles[0],hiring_fee:'50000',qa:'keep'}],
    management_composer:{rental_type:'rental',draft:{vehicles:[{id:String(w.vehicles[0]),license:'old',qa:'keep'}],qa:'keep'},qa:'keep'}};
  await pg.query('UPDATE himoto.orders SET draft_payload=$2 WHERE id=$1',[w.id,JSON.stringify(payload)]);
  const body=await input(w,target),beforeMoney=await money(w.id);
  const readPreview=(f,body,actor=who)=>api.readMobileSwapPreview(actor,String(f.id),new NextRequest('https://fixture.invalid/contracts/'+f.id+'/swaps/preview',
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
  const previewState=await state(),previewSequence=(await pg.query('SELECT last_value,is_called FROM himoto.management_contract_vehicle_swaps_id_seq')).rows;
  const preview=await readPreview(w,body);assert.equal(preview.item.vehicleId,w.vehicles[0]);assert.equal(preview.vehicle.id,target);
  await assert.rejects(()=>readPreview(w,{...body,vehicle_revision:'1'}),e=>e.code==='SWAP_REVIEW_REQUIRED');
  await assert.rejects(()=>readPreview(w,{...body,item_revision:'1'}),e=>e.code==='SWAP_REVIEW_REQUIRED');
  await assert.rejects(()=>readPreview(w,body,{...who,store_id:24}),e=>e.code==='NOT_FOUND');
  assert.deepEqual(await state(),previewState);assert.deepEqual((await pg.query('SELECT last_value,is_called FROM himoto.management_contract_vehicle_swaps_id_seq')).rows,previewSequence);
  checks.push('Read-only swap preview checks exact scoped order/line/candidate revisions, returns original selected metadata and cannot change any row/xmin, money, key/history/proof or swap sequence');
  const beforeLine=(await pg.query('SELECT row_to_json(d) AS row FROM himoto.order_vehicle_details d WHERE id=$1',[w.ids[0]])).rows[0].row;
  const first=await record(w,body,key);assert(first.current);assert(!first.replayed);assert.equal(first.from.id,w.vehicles[0]);assert.equal(first.to.id,target);
  assert.equal(first.from.license,'QA-'+w.vehicles[0]);assert.equal(first.reviewedVehicleRevision,body.vehicle_revision);
  assert.deepEqual(await money(w.id),beforeMoney);
  const afterLine=(await pg.query('SELECT row_to_json(d) AS row FROM himoto.order_vehicle_details d WHERE id=$1',[w.ids[0]])).rows[0].row;
  assert.deepEqual({...afterLine,vehicle_id:beforeLine.vehicle_id,updated_at:beforeLine.updated_at},beforeLine);
  const savedPayload=(await pg.query('SELECT draft_payload FROM himoto.orders WHERE id=$1',[w.id])).rows[0].draft_payload;
  assert.equal(savedPayload.order_items[0].vehicle_id,target);assert.equal(savedPayload.order_items[0].qa,'keep');
  assert.equal(savedPayload.management_composer.draft.vehicles[0].id,String(target));assert.equal(savedPayload.management_composer.draft.vehicles[0].qa,'keep');
  const committed=await state(),again=await record(w,body,key);
  assert.deepEqual(again,{...first,replayed:true});assert.deepEqual(await state(),committed);
  assert.deepEqual((await writer.readMobileSwapReceipt(who,key)).receipt,again);
  assert.equal((await resolve(w,key)).status,'committed');
  assert.equal((await writer.readMobileSwapReceipt({...who,id:8},key)).receipt,null);
  await assert.rejects(()=>writer.readMobileSwapReceipt({...who,store_id:24},key),e=>e.code==='FORBIDDEN');
  await assert.rejects(()=>record(w,{...body,vehicle_id:target+1},key),e=>e.code==='REQUEST_KEY_REUSED');
  assert.deepEqual(await state(),committed);
  for(const verb of ['UPDATE','DELETE'])assert.equal((await pg.query('SELECT has_table_privilege($1,$2,$3) AS allowed',['himoto_scoped','himoto.management_mobile_swaps',verb])).rows[0].allowed,false);
  checks.push('Mobile swap atomically updates line, stock, printed/composer snapshot and immutable actor-bound proof while preserving dates, prices, totals, deposits and every money row; exact replay/lookup/resolve do not duplicate history or rewrite proof');
  const cancelFixture=await fixture(),cancelTarget=await vehicle(),cancelBody=await input(cancelFixture,cancelTarget),cancelKey=randomUUID();
  assert.equal((await resolve(cancelFixture,cancelKey)).status,'cancelled');const cancelled=await state();
  await assert.rejects(()=>record(cancelFixture,cancelBody,cancelKey),e=>e.code==='REQUEST_CANCELLED');assert.deepEqual(await state(),cancelled);
  const failed=await fixture({stock:24}),failedTarget=await vehicle(),failedBody=await input(failed,failedTarget),failedKey=randomUUID();
  const beforeFailure=await state();failReceipt();await assert.rejects(()=>record(failed,failedBody,failedKey),/QA failure/);
  assert.deepEqual(await state(),beforeFailure);assert.equal((await resolve(failed,failedKey)).status,'cancelled');
  const lost=await fixture(),lostTarget=await vehicle(),lostBody=await input(lost,lostTarget),lostKey=randomUUID();
  loseResponse();await assert.rejects(()=>record(lost,lostBody,lostKey),/lost after PostgreSQL commit/);
  const lostState=await state(),lostReceipt=(await writer.readMobileSwapReceipt(who,lostKey)).receipt;assert(lostReceipt.current);
  assert.equal((await resolve(lost,lostKey)).status,'committed');assert.deepEqual(await record(lost,lostBody,lostKey),lostReceipt);assert.deepEqual(await state(),lostState);
  checks.push('Durable swap tombstones reject late writes; injected failure after stock/history/proof rolls back all rows; a lost commit response recovers exactly one original swap and key');
  for(const field of ['revision','item_revision','vehicle_revision']){
    const stale=await fixture(),staleTarget=await vehicle(),staleBody=await input(stale,staleTarget),before=await state();
    await assert.rejects(()=>record(stale,{...staleBody,[field]:'1'},randomUUID()),e=>e.code==='SWAP_REVIEW_REQUIRED');
    assert.deepEqual(await state(),before);
  }
  const late=await fixture(),lateTarget=await vehicle(),lateBody=await input(late,lateTarget),lateHire=await fixture({store:24,status:'bad_debt'});
  await pg.query('UPDATE himoto.order_vehicle_details SET vehicle_id=$1 WHERE id=$2',[lateTarget,lateHire.ids[0]]);
  const lateState=await state();await assert.rejects(()=>record(late,lateBody,randomUUID()),e=>e.code==='SWAP_REVIEW_REQUIRED');assert.deepEqual(await state(),lateState);
  checks.push('Mobile swap checks order, line and vehicle revisions after locks and rechecks globally hidden occupancy added since selection; rejected reviews leave no parent key, proof, history, stock or money changes');
  const mobileOwnership=await fixture({store:31,stock:31,payload:{legacy_migration:{sourceStoreId:'29'}}}),mobileLeaseTarget=await vehicle(29);
  const mobileOwnershipMoney=await money(mobileOwnership.id),ownershipBody=await input(mobileOwnership,mobileLeaseTarget,lease);
  const ownershipProof=await record(mobileOwnership,ownershipBody,randomUUID(),lease);
  assert(ownershipProof.current);assert.equal(ownershipProof.to.storeId,29);assert.equal(ownershipProof.from.license,'QA-'+mobileOwnership.vehicles[0]);
  assert.deepEqual(await money(mobileOwnership.id),mobileOwnershipMoney);
  const otherLine=await fixture(),foreignBody=await input(otherLine,await vehicle()),beforeForeignLine=await state();
  await assert.rejects(()=>record(late,{...lateBody,item_id:foreignBody.item_id,item_revision:foreignBody.item_revision},randomUUID()),e=>e.code==='SWAP_REVIEW_REQUIRED');
  assert.deepEqual(await state(),beforeForeignLine);
  checks.push('Mobile ownership staff can swap an HQ-sourced legacy agreement into received lease stock with original labels and unchanged finances; a line from another in-scope contract cannot be substituted');
  await pg.query("UPDATE himoto.vehicles SET license='Corrected QA' WHERE id=$1",[first.to.id]);
  let corrected=(await writer.readMobileSwapReceipt(who,key)).receipt;assert(!corrected.vehicleCurrent);assert(corrected.itemCurrent&&corrected.historyCurrent&&corrected.contractCurrent);
  await pg.query('UPDATE himoto.order_vehicle_details SET hiring_fee=hiring_fee+1 WHERE id=$1',[first.itemId]);
  corrected=(await writer.readMobileSwapReceipt(who,key)).receipt;assert(!corrected.itemCurrent);assert(corrected.historyCurrent&&corrected.contractCurrent);
  await pg.query("UPDATE himoto.management_contract_vehicle_swaps SET created_at=created_at+interval '1 second' WHERE id=$1",[first.swapId]);
  corrected=(await writer.readMobileSwapReceipt(who,key)).receipt;assert(!corrected.historyCurrent);assert(corrected.contractCurrent);
  await pg.query('UPDATE himoto.orders SET updated_at=now() WHERE id=$1',[first.id]);
  corrected=(await writer.readMobileSwapReceipt(who,key)).receipt;assert(!corrected.current);assert(!corrected.contractCurrent);
  assert.deepEqual(corrected.from,first.from);assert.deepEqual(corrected.to,first.to);assert.equal(corrected.recordedAt,first.recordedAt);
  assert.deepEqual(await record(w,body,key),corrected);
  checks.push('Later stock, rental line, swap-history and contract corrections are reported independently while receipt retains the original vehicles/revisions/time; replay never overwrites corrected business data');
};
