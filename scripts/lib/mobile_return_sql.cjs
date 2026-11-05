// Called only by the air-gapped, in-memory PostgreSQL suite.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {NextRequest}=require('next/server');

module.exports=async function returnSql({pg,load,root,user,checks,failReceipt,loseResponse}) {
  const preview=load(path.join(root,'lib/server/mobile-return-preview'));
  const settlementApi=load(path.join(root,'lib/server/mobile-return-settlement'));
  const returns=load(path.join(root,'lib/server/return-settlements'));
  const payments=load(path.join(root,'lib/server/contract-payments'));
  const {withMobileData}=load(path.join(root,'lib/server/mobile-context'));
  const {himotoPool}=load(path.join(root,'lib/server/himoto-database'));
  const local=ms=>new Date(ms+7*3600000).toISOString().slice(0,16);
  const anchor=Date.parse('2026-10-15T03:00:00Z'),minute=60000,hour=60*minute;
  let nextOrder=2000;
  // Execute repository SQL definitions for the scope functions and return/stock
  // helpers, including SECURITY DEFINER's cross-branch open-rental protection.
  await pg.exec(`ALTER TABLE himoto.order_vehicle_details ADD COLUMN updated_at timestamptz;
    ALTER TABLE himoto.vehicles ADD COLUMN status text DEFAULT 'using',ADD COLUMN updated_at timestamptz;`);
  const accessSql=fs.readFileSync(path.resolve(root,'../docs/sql/2026-10-17-account-access.sql'),'utf8');
  const helpers=accessSql.match(/CREATE OR REPLACE FUNCTION himoto\.access_(?:actor|store)\([\s\S]*?\$\$;/g);
  assert.equal(helpers.length,2);await pg.exec(helpers.join('\n'));
  await pg.exec(fs.readFileSync(path.resolve(root,'../docs/sql/2026-10-24-bad-debt-recovery.sql'),'utf8'));
  await pg.exec(fs.readFileSync(path.resolve(root,'../docs/sql/2026-11-02-mobile-returns.sql'),'utf8'));
  async function fixture({total=500000,paid=0,deposit=0,lines=1,plan,adjustments=[],end=anchor,start=anchor-5*24*hour}={}) {
    const id=nextOrder++,ids=Array.from({length:lines},(_,i)=>id*100+i);
    await pg.query(`INSERT INTO himoto.orders(id,contract_number,order_status,store_id,total,pid,first_deposit_amount,
      additional_deposit_amount,total_rental_fees,rent_at,return_at,draft_payload)
      VALUES($1,$2,'renting',23,$3::text,$4,$5,0,$3::text::bigint,$6,$7,$8::jsonb)`,
    [id,`SQL-RETURN-${id}`,String(total),paid+deposit,deposit,new Date(start).toISOString(),new Date(end).toISOString(),
      JSON.stringify({management_composer:{return_adjustments:adjustments,...(plan?{installment_plan:plan}:{})}})]);
    for(const itemId of ids){
      await pg.query('INSERT INTO himoto.vehicles(id,name,license) VALUES($1,$2,$3)',[itemId,`Xe trả QA ${itemId}`,`QA-${itemId}`]);
      await pg.query(`INSERT INTO himoto.order_vehicle_details(id,order_id,vehicle_id,type,rent_at,return_at,hiring_fee,substitute_unit_price,total_renewal_amount)
        VALUES($1,$2,$1,'day',$3,$4,100000,0,0)`,[itemId,id,new Date(start).toISOString(),new Date(end).toISOString()]);
    }
    if(deposit)await pg.query(`INSERT INTO himoto.transactions(order_id,name,type,value,status,created_at,user_id,store_id,cash_id)
      VALUES($1,'order:deposit','in',$2,'approved',now(),7,23,1)`,[id,deposit]);
    return{id,ids};
  }
  async function input(f,patch={},selected=f.ids){
    const revision=(await pg.query('SELECT xmin::text AS r FROM himoto.orders WHERE id=$1',[f.id])).rows[0].r;
    const rows=(await pg.query('SELECT id,xmin::text AS r FROM himoto.order_vehicle_details WHERE order_id=$1 ORDER BY id',[f.id])).rows;
    return{revision,items:selected.map(id=>({item_id:id,item_revision:rows.find(row=>Number(row.id)===id).r,returned_at:local(anchor),hourly_rate:'20000',...patch}))};
  }
  const review=(f,body,who=user)=>preview.readMobileReturnPreview(who,String(f.id),new NextRequest(`https://fixture.invalid/api/mobile/v1/contracts/${f.id}/returns/preview`,
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
  const state=async()=>{
    const result={};
    for(const table of ['orders','order_vehicle_details','vehicles','transactions','management_contract_payments','management_mobile_requests','management_mobile_returns'])
      result[table]=(await pg.query(`SELECT row_to_json(t) AS row,xmin::text AS revision FROM himoto.${table} t ORDER BY row_to_json(t)::text`)).rows;
    result.sequence=(await pg.query('SELECT last_value,is_called FROM himoto.transactions_id_seq')).rows;
    return result;
  };
  async function parity(f,body,expected,settlement={receipts:[]}){
    return withMobileData(user,'',async()=>{
      const db=await himotoPool.connect();
      try{
        await db.query('BEGIN');
        const wire={...settlement,order_id:f.id,revision:body.revision,receipts:settlement.receipts.map(p=>({...p,request_id:randomUUID()})),
          ...(settlement.refund?{refund:{...settlement.refund,request_id:randomUUID()}}:{}),
          ...(settlement.rental_refund?{rental_refund:{...settlement.rental_refund,request_id:randomUUID()}}:{})};
        const result=await returns.completeReturnBatch(db,user.id,body.items,returns.parseReturnSettlements([wire]));
        const after=await payments.readPaymentContext(db,f.id,{page:1,size:0});
        assert.equal(after.total_amount,expected.after.totalAmount);
        assert.equal(after.paid_amount,expected.after.rentalPaid);
        assert.equal(after.remaining,expected.after.rentalRemaining);
        assert.equal(after.deposit_held,expected.after.depositHeld);
        assert.equal(after.rental_refundable,expected.after.rentalRefundable);
        assert.equal(after.items.length,expected.after.remainingItems);
        assert.equal(after.status,expected.after.status);
        const saved=(await db.query("SELECT draft_payload #> '{management_composer,return_settlements}' AS rows FROM himoto.orders WHERE id=$1",[f.id])).rows[0].rows.at(-1);
        const ids=[...saved.transaction_ids,...(saved.rental_refund_transaction_id?[saved.rental_refund_transaction_id]:[]),...(saved.refund_transaction_id?[saved.refund_transaction_id]:[])];
        const expectedMoney=[...wire.receipts,...(wire.rental_refund?[{...wire.rental_refund,kind:'rental_refund'}]:[]),...(wire.refund?[{...wire.refund,kind:'deposit_refund'}]:[])];
        assert.equal(ids.length,expectedMoney.length);
        const transactions=(await db.query('SELECT * FROM himoto.transactions WHERE order_id=$1 AND id=ANY($2::bigint[])',[f.id,ids])).rows;
        for(let i=0;i<ids.length;i++){
          const row=transactions.find(t=>Number(t.id)===ids[i]),intent=expectedMoney[i];assert(row);
          assert.equal(Number(row.value),Number(intent.amount));assert.equal(row.status,'approved');
          assert.equal(row.type,intent.kind.endsWith('refund')?'out':'in');
          assert.equal(row.name,({late_fee:'order:return_late',repair_fee:'order:return_repair',rental_debt:'order:payment',rental_refund:'order:rental_refund',deposit_refund:'order:deposit_refund'})[intent.kind]);
          assert.equal(Number(intent.method==='cash'?row.cash_id:row.bank_id),intent.account_id);
          assert.equal(intent.method==='cash'?row.bank_id:row.cash_id,null);
          assert.equal(Date.parse(row.created_at),Date.parse(`${intent.paid_at}:00+07:00`));
        }
        for(const row of expected.items){
          const actual=result.find(line=>line.item_id===row.id);
          assert.equal(actual.fee,row.fee);assert.equal(actual.late_fee,row.lateFee);assert.equal(actual.repair_fee,row.repairFee);
          assert.equal(actual.late_minutes,row.lateMinutes);assert.equal(actual.chargeable_hours,row.chargeableHours);
          assert.equal(Date.parse(actual.returned_at),Date.parse(row.returnedAt));
        }
        return after;
      }finally{await db.query('ROLLBACK');db.release();}
    });
  }
  const f=await fixture({deposit:200000}),body=await input(f);
  const before=await state(),first=await review(f,body),second=await review(f,body);
  assert.equal(first.snapshot,second.snapshot);assert.deepEqual(await state(),before);
  await assert.rejects(()=>review(f,body,{...user,store_id:24}),e=>e.status===404);
  await assert.rejects(()=>review(f,body,{...user,permissions:['contracts.read','finance.write']}),e=>e.code==='FORBIDDEN');
  assert.deepEqual(await state(),before);
  checks.push('SQL return preview is scoped/read-only: stable hash, cross-branch RLS and explicit return permission; no row/xmin, stock, money, receipt or sequence changes');

  await assert.rejects(()=>review(f,{...body,revision:'1'}),e=>e.code==='RETURN_REVIEW_REQUIRED');
  await assert.rejects(()=>review(f,{...body,items:body.items.map(row=>({...row,item_revision:'1'}))}),e=>e.code==='RETURN_REVIEW_REQUIRED');
  const other=await fixture(),foreign=await input(other);
  await assert.rejects(()=>review(f,{...body,items:foreign.items}),e=>e.code==='RETURN_REVIEW_REQUIRED');
  for(const sql of ["completed_at=now()","return_at=NULL"]){
    await pg.query(`UPDATE himoto.order_vehicle_details SET ${sql} WHERE id=$1`,[f.ids[0]]);
    const changed=await input(f);await assert.rejects(()=>review(f,changed),e=>e.code==='RETURN_REVIEW_REQUIRED');
    await pg.query('UPDATE himoto.order_vehicle_details SET completed_at=NULL,return_at=$2 WHERE id=$1',[f.ids[0],new Date(anchor).toISOString()]);
  }
  await pg.query(`UPDATE himoto.orders SET draft_payload=jsonb_set(draft_payload,'{management_composer,vehicle_reconciliations}',$2::jsonb) WHERE id=$1`,
    [f.id,JSON.stringify([{item_id:f.ids[0],actual_recovery_at:null}])]);
  await assert.rejects(async()=>review(f,await input(f)),e=>e.code==='RETURN_REVIEW_REQUIRED');
  await pg.query("UPDATE himoto.orders SET order_status='bad_debt' WHERE id=$1",[f.id]);
  await assert.rejects(async()=>review(f,await input(f)),e=>e.code==='RETURN_REVIEW_REQUIRED');
  checks.push('SQL preview rejects stale order/line revisions, another contract line, returned/reconciled/missing-date lines and bad debt before any return');

  const many=await fixture({lines:26,end:anchor+hour}),manyBody=await input(many,{},[many.ids[25],many.ids[0]]);
  const manyPreview=await review(many,manyBody);
  assert.deepEqual(manyPreview.items.map(row=>row.id),[many.ids[0],many.ids[25]]);assert.equal(manyPreview.after.remainingItems,24);
  assert.equal(manyPreview.after.closesRental,false);assert.equal(manyPreview.after.depositRefundEligible,false);
  assert.equal(manyPreview.snapshot,(await review(many,{...manyBody,items:[...manyBody.items].reverse()})).snapshot);
  await parity(many,manyBody,manyPreview);
  checks.push('Selections cross the 25-line page boundary, hash independently of request ordering and retain partial-return status/balances matching completeReturnBatch');

  for(const [late,fee] of [[1,20000],[480,160000],[481,100000],[1440,100000],[1441,120000],[1921,200000]]){
    const timed=await fixture(),timedBody=await input(timed,{returned_at:local(anchor+late*minute)}),p=await review(timed,timedBody);
    assert.equal(p.items[0].lateFee,fee);assert.equal(p.after.totalAmount,500000+fee);
    await parity(timed,timedBody,p);
  }
  const repaired=await fixture(),repairBody=await input(repaired,{returned_at:local(anchor+481*minute),fee_override:'45000',repair_fee:'70000',repair_note:'Thay phụ tùng QA'});
  const repair=await review(repaired,repairBody);assert.equal(repair.items[0].suggestedLateFee,100000);assert.equal(repair.totals.fee,115000);
  assert.equal(repair.items[0].repairNote,'Thay phụ tùng QA');await parity(repaired,repairBody,repair);
  checks.push('Actual SQL/writer parity covers 8h/24h rounding boundaries, explicit late-fee override, repair amount/note and final unpaid status');

  const early=await fixture({paid:500000,deposit:200000,end:anchor+hour}),earlyBody=await input(early,{early_discount:'150000'}),earlyPreview=await review(early,earlyBody);
  assert.equal(earlyPreview.after.rentalRefundable,150000);assert.equal(earlyPreview.after.depositRefundEligible,true);
  await parity(early,earlyBody,earlyPreview);
  // Prior eligible credit is net of every approved refund, never one history page.
  const credited=await fixture({total:400000,paid:480000,deposit:200000,end:anchor+hour,adjustments:[{early_discount:120000}]});
  await pg.query(`INSERT INTO himoto.transactions(order_id,name,type,value,status,created_at,user_id,store_id,cash_id)
    SELECT $1,'order:rental_refund','out',1000,'approved',now(),7,23,1 FROM generate_series(1,30)`,[credited.id]);
  const creditedBody=await input(credited,{early_discount:'10000'}),creditedPreview=await review(credited,creditedBody);
  assert.equal(creditedPreview.before.rentalRefundable,80000);assert.equal(creditedPreview.after.rentalRefundable,90000);
  await parity(credited,creditedBody,creditedPreview);
  checks.push('Early-discount/refund/deposit projections match the real settlement domain, including approved rental refunds spanning more than one history page');

  const cash=await fixture({paid:500000,end:anchor+hour}),cashBody=await input(cash),cashBefore=await review(cash,cashBody);
  const stamp=(await pg.query('SELECT xmin::text AS r FROM himoto.orders WHERE id=$1',[cash.id])).rows[0].r;
  const tx=(await pg.query(`INSERT INTO himoto.transactions(order_id,name,type,value,status,created_at,user_id,store_id,cash_id)
    VALUES($1,'order:payment','in',1000,'pending',now(),7,23,1) RETURNING id`,[cash.id])).rows[0].id;
  const cashAdded=await review(cash,cashBody);assert.notEqual(cashAdded.snapshot,cashBefore.snapshot);
  assert.deepEqual(cashAdded.before,cashBefore.before);
  await pg.query("UPDATE himoto.transactions SET note='Cashbook corrected QA' WHERE id=$1",[tx]);
  assert.notEqual((await review(cash,cashBody)).snapshot,cashAdded.snapshot);
  assert.equal((await pg.query('SELECT xmin::text AS r FROM himoto.orders WHERE id=$1',[cash.id])).rows[0].r,stamp);
  checks.push('Cashbook insert and xmin-only correction invalidate the review hash even with unchanged order revision and financial aggregates');

  const plan={version:1,start:'2026-10-01T10:00',end:'2026-11-01T10:00',interval:'custom',amount:100000,
    periods:[{due_at:'2026-10-01T10:00',amount:100000},{due_at:'2026-10-16T10:00',amount:200000},{due_at:'2026-10-25T10:00',amount:300000}]};
  const owned=await fixture({total:100000,paid:100000,lines:2,plan,start:Date.parse(`${plan.start}+07:00`),end:Date.parse(`${plan.end}+07:00`)});
  const ownedBody=await input(owned,{},[owned.ids[0]]),realNow=Date.now;
  try{
    Date.now=()=>Date.parse('2026-10-16T02:59:59Z');
    const prior=await review(owned,ownedBody);assert.equal(prior.before.totalAmount,100000);
    assert.equal((await review(owned,ownedBody)).snapshot,prior.snapshot);
    Date.now=()=>Date.parse('2026-10-16T03:00:00Z');
    const due=await review(owned,ownedBody);assert.equal(due.before.totalAmount,300000);assert.notEqual(due.snapshot,prior.snapshot);
    assert.equal(due.revision,prior.revision);await parity(owned,ownedBody,due);
  }finally{Date.now=realNow;}
  const allOwnedBody=await input(owned),closedOwned=await review(owned,allOwnedBody);
  assert.equal(closedOwned.after.totalAmount,100000);assert.equal(closedOwned.after.status,'completed');
  const ownedBefore=await state();await parity(owned,allOwnedBody,closedOwned);assert.deepEqual(await state(),ownedBefore);
  await assert.rejects(()=>review(owned,{...allOwnedBody,items:allOwnedBody.items.map(row=>({...row,early_discount:'1'}))}),e=>e.code==='RETURN_REVIEW_REQUIRED');
  checks.push('Ownership preview uses accrued totals independently of stored base, invalidates at a due boundary without xmin changes, and stops billing on final return with settlement parity');

  const paused=await fixture({total:100000,plan:{...plan,stopped_at:'2026-10-10T10:00',paused_at:'2026-10-10T10:00'},
    start:Date.parse(`${plan.start}+07:00`),end:Date.parse(`${plan.end}+07:00`)});
  const pausedBody=await input(paused),pausedBefore=await state();
  await assert.rejects(()=>review(paused,pausedBody),e=>e.code==='RETURN_REVIEW_REQUIRED');assert.deepEqual(await state(),pausedBefore);
  // The writer also refuses this stopped_at/paused_at mismatch and rolls back.
  await assert.rejects(()=>parity(paused,pausedBody,{}),e=>/Lịch đóng tiền/.test(e.message));
  assert.deepEqual(await state(),pausedBefore);
  checks.push('An active paused_at schedule cannot be silently rewritten by a final return: preview gates it and the actual settlement rolls back the invalid stop change');

  const settlementReview=(f,body,who=user)=>settlementApi.readMobileReturnSettlementPreview(who,String(f.id),new NextRequest(
    `https://fixture.invalid/api/mobile/v1/contracts/${f.id}/returns/settlement-preview`,
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
  const receipt=(amount,kind='rental_debt',method='cash',account_id=1)=>({kind,amount:String(amount),method,account_id,paid_at:local(anchor)});
  const refund=amount=>({amount:String(amount),method:'cash',account_id:1,paid_at:local(anchor)});
  async function settlementInput(f,settlement,patch={}){
    const body=await input(f,patch),fees=await review(f,body);return{...body,fee_snapshot:fees.snapshot,settlement};
  }
  async function settlementParity(f,body,expected){
    await parity(f,body,{...expected.fees,after:expected.after},body.settlement);
  }
  for(const [income,increase,overpayment] of [[50000,0,false],[100000,0,false],[120000,20000,true]]){
    const settled=await fixture({total:500000,paid:400000,deposit:200000,end:anchor+hour});
    const body=await settlementInput(settled,{receipts:[receipt(income)],...(income>=100000?{refund:refund(200000)}:{refund_deferred:true})});
    const before=await state(),p=await settlementReview(settled,body);
    assert.deepEqual(await state(),before);assert.equal(p.totals.income,income);assert.equal(p.totals.totalIncrease,increase);assert.equal(p.overpayment,overpayment);
    assert.equal(p.snapshot,(await settlementReview(settled,body)).snapshot);await settlementParity(settled,body,p);
  }
  const overpaid=await fixture({paid:600000,deposit:200000,end:anchor+hour});
  const overpaidBody=await settlementInput(overpaid,{receipts:[receipt(10000,'late_fee'),receipt(20000,'repair_fee','company_transfer',2)],refund_deferred:true});
  const overpaidPreview=await settlementReview(overpaid,overpaidBody);assert.equal(overpaidPreview.overpayment,true);assert.equal(overpaidPreview.totals.totalIncrease,0);
  await settlementParity(overpaid,overpaidBody,overpaidPreview);
  checks.push('Read-only settlement preview and completeReturnBatch agree for partial/full actual receipts, overpayment with positive debt (total grows) and already-paid receipts (total unchanged), with deferred/actual deposit refunds');

  const refunded=await fixture({paid:500000,deposit:200000,end:anchor+hour});
  const refundBody=await settlementInput(refunded,{receipts:[],rental_refund:{...refund(150000),method:'transfer',recipient_account:'000.123 456',recipient_bank:' QA bank '},refund:refund(200000)},{early_discount:'150000'});
  const refundPreview=await settlementReview(refunded,refundBody);assert.equal(refundPreview.settlement.rental_refund.recipient_account,'000123456');
  assert.equal(refundPreview.after.rentalPaid,350000);assert.equal(refundPreview.after.depositHeld,0);assert.equal(refundPreview.after.rentalRefundable,0);
  await settlementParity(refunded,{...refundBody,settlement:refundPreview.settlement},refundPreview);
  const partial=await fixture({paid:500000,deposit:200000,lines:2,end:anchor+hour});
  const partialBody=await settlementInput(partial,{receipts:[],rental_refund:refund(100000)},{early_discount:'50000'});
  const partialFees=await review(partial,{revision:partialBody.revision,items:[partialBody.items[0]]});
  const oneBody={...partialBody,items:[partialBody.items[0]],fee_snapshot:partialFees.snapshot,settlement:{receipts:[],rental_refund:refund(50000)}};
  const onePreview=await settlementReview(partial,oneBody);assert.equal(onePreview.after.remainingItems,1);await settlementParity(partial,oneBody,onePreview);
  checks.push('Settlement preview normalizes recipient data, refunds only earned early-discount credit, permits eligible partial-return rental refunds and preserves deposit until all vehicles/debt are settled');

  const invalidSettlement=await fixture({paid:400000,deposit:200000,end:anchor+hour});
  const clean=await settlementInput(invalidSettlement,{receipts:[]}),invalidBefore=await state();
  for(const settlement of [{receipts:[],refund:refund(1)},{receipts:[],rental_refund:refund(1)},
    {receipts:[receipt(100000)],refund:refund(200001)},{receipts:[receipt(100000,'late_fee','company_transfer',1)]},
    {receipts:[receipt(100000,'repair_fee','cash',2)]}])
    await assert.rejects(()=>settlementReview(invalidSettlement,{...clean,settlement}),e=>e.code==='RETURN_REVIEW_REQUIRED');
  await assert.rejects(()=>settlementReview(invalidSettlement,{...clean,fee_snapshot:'f'.repeat(64)}),e=>e.code==='RETURN_REVIEW_REQUIRED');
  await assert.rejects(()=>settlementReview(invalidSettlement,clean,{...user,store_id:24}),e=>e.status===404);
  await assert.rejects(()=>settlementReview(invalidSettlement,clean,{...user,permissions:['contracts.read','finance.write']}),e=>e.status===403);
  assert.deepEqual(await state(),invalidBefore);
  const defer={...clean,settlement:{receipts:[],refund_deferred:true,refund_recipient:{account:'000.123 456'}}};
  const deferred=await settlementReview(invalidSettlement,defer);assert.equal(deferred.settlement.refund_recipient.account,'000123456');assert.equal(deferred.after.depositHeld,200000);
  assert.notEqual(deferred.snapshot,(await settlementReview(invalidSettlement,{...defer,settlement:{...defer.settlement,refund_recipient:{account:'000999999'}}})).snapshot);
  checks.push('Settlement review blocks debt/partial-return deposit refund, excess/unearned refunds, wrong method/account/store, stale fee snapshot and missing return grants without money/stock/sequence changes; pending recipient participates in the hash');

  for(const selected of [[owned.ids[0]],owned.ids]){
    const body=await input(owned,{},selected),fees=await review(owned,body);
    const intent={...body,fee_snapshot:fees.snapshot,settlement:{receipts:[receipt(700000)],refund_deferred:true},acknowledge_overpayment:true};
    const p=await settlementReview(owned,intent);assert.equal(p.overpayment,true);await settlementParity(owned,intent,p);
  }
  const unknown=await fixture();await pg.query('UPDATE himoto.order_vehicle_details SET hiring_fee=0 WHERE order_id=$1',[unknown.id]);
  const unknownBody=await input(unknown,{returned_at:local(anchor+481*minute)});
  await assert.rejects(()=>review(unknown,unknownBody),e=>e.code==='RETURN_REVIEW_REQUIRED');
  const explicit={...unknownBody,items:unknownBody.items.map(row=>({...row,fee_override:'45000'}))},explicitPreview=await review(unknown,explicit);
  assert.equal(explicitPreview.items[0].dailyPrice,null);assert.equal(explicitPreview.items[0].suggestedLateFee,null);await parity(unknown,explicit,explicitPreview);
  checks.push('Ownership settlement parity covers partial/final returns and overpayment against accrued/base totals; unknown daily pricing blocks SQL preview unless the reviewed late fee is explicitly supplied');

  const ownedStock=await fixture(),foreignStock=await fixture();
  await pg.query('UPDATE himoto.orders SET store_id=24 WHERE id=$1',[foreignStock.id]);
  await pg.query('UPDATE himoto.order_vehicle_details SET vehicle_id=$2 WHERE order_id=$1',[foreignStock.id,ownedStock.ids[0]]);
  const stockBody=await input(ownedStock),stockBefore=await state();
  await withMobileData(user,'',async()=>{
    const db=await himotoPool.connect();
    try{
      await db.query('BEGIN');await returns.completeReturnBatch(db,user.id,stockBody.items,[]);
      assert.equal((await db.query('SELECT status FROM himoto.vehicles WHERE id=$1',[ownedStock.ids[0]])).rows[0].status,'using');
      assert.equal((await db.query('SELECT id FROM himoto.orders WHERE id=$1',[foreignStock.id])).rowCount,0);
    }finally{await db.query('ROLLBACK');db.release();}
  });
  await withMobileData(user,'',async()=>{
    const db=await himotoPool.connect();
    try{
      await db.query('BEGIN');
      await assert.rejects(()=>db.query('SELECT himoto.complete_contract_vehicle_return($1,$2::timestamptz)',
        [foreignStock.ids[0],new Date(anchor).toISOString()]),e=>e.code==='42501');
    }finally{await db.query('ROLLBACK');db.release();}
  });
  assert.deepEqual(await state(),stockBefore);
  checks.push('Repository SECURITY DEFINER return/stock SQL runs unchanged: a hidden cross-branch open hire prevents stock release, and the actor cannot complete that branch\'s line');

  const writer=load(path.join(root,'lib/server/mobile-return-write'));
  const recovery=load(path.join(root,'lib/server/mobile-write-recovery'));
  const record=(f,body,key,who=user)=>writer.recordMobileReturn(who,String(f.id),new NextRequest(`https://fixture.invalid/api/mobile/v1/contracts/${f.id}/returns`,
    {method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)}));
  const resolve=(f,key,who=user)=>recovery.resolveMobileWrite(who,key,new NextRequest('https://fixture.invalid/api/mobile/v1/write-requests/'+key+'/resolve',
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:`return.record:${f.id}`})}));
  async function recordInput(f,settlement,patch={},ack=false){
    const body=await settlementInput(f,settlement,patch),intent={...body,...(ack?{acknowledge_overpayment:true}:{})};
    const reviewed=await settlementReview(f,intent);return{...intent,settlement_snapshot:reviewed.snapshot};
  }
  const recorded=await fixture({total:500000,paid:400000,deposit:200000,end:anchor});
  const recordedBody=await recordInput(recorded,{receipts:[receipt(50000,'late_fee'),receipt(100000,'rental_debt','company_transfer',2)],refund:refund(200000)},
    {returned_at:local(anchor+hour),repair_fee:'30000',repair_note:'Sửa chữa QA'},true);
  const recordedKey=randomUUID(),writeBefore=await state(),saved=await record(recorded,recordedBody,recordedKey);
  assert.equal(saved.replayed,false);assert.equal(saved.current,true);assert.equal(saved.transactions.length,3);
  assert.equal(saved.review.totals.income,150000);assert.equal(saved.review.totals.totalIncrease,0);assert.equal(saved.review.after.totalAmount,550000);
  assert.equal(saved.review.after.depositHeld,0);assert.equal(saved.review.after.status,'completed');
  assert.equal(saved.returnedItems[0].id,recorded.ids[0]);assert(saved.transactions.every(p=>p.requestId!==recordedKey));
  const stored=(await pg.query('SELECT proof FROM himoto.management_mobile_returns WHERE request_id=$1',[recordedKey])).rows[0].proof;
  assert.deepEqual(stored,saved);
  const writeAfter=await state();assert.equal(writeAfter.transactions.length,writeBefore.transactions.length+3);
  assert.equal(writeAfter.management_contract_payments.length,writeBefore.management_contract_payments.length+3);
  assert.equal((await record(recorded,recordedBody,recordedKey)).replayed,true);assert.deepEqual(await state(),writeAfter);
  assert.deepEqual((await writer.readMobileReturnReceipt(user,recordedKey)).receipt,{...saved,replayed:true});
  assert.equal((await resolve(recorded,recordedKey)).status,'committed');
  await assert.rejects(()=>record(recorded,{...recordedBody,acknowledge_overpayment:undefined},recordedKey),e=>e.code==='REQUEST_KEY_REUSED');
  assert.equal((await writer.readMobileReturnReceipt({...user,id:8},recordedKey)).receipt,null);
  await assert.rejects(()=>writer.readMobileReturnReceipt({...user,store_id:24},recordedKey),e=>e.code==='FORBIDDEN');
  assert.equal((await writer.readMobileReturnReceipt({...user,store_id:24,scope_all:true},recordedKey)).receipt.id,recorded.id);
  assert.equal((await pg.query("SELECT has_table_privilege('himoto_scoped','himoto.management_mobile_returns','UPDATE') AS allowed")).rows[0].allowed,false);
  assert.equal((await pg.query("SELECT has_table_privilege('himoto_scoped','himoto.management_mobile_returns','DELETE') AS allowed")).rows[0].allowed,false);
  checks.push('Mobile return writer atomically commits vehicles, scoped stock helpers, actual receipts/refund and immutable actor-bound proof; replay/recovery retain exact child UUIDs/transactions, enforce scope and cannot update/delete proof');

  const cancelled=await fixture(),cancelBody=await recordInput(cancelled,{receipts:[],refund_deferred:true}),cancelKey=randomUUID();
  assert.equal((await resolve(cancelled,cancelKey)).status,'cancelled');
  const cancelledBefore=await state();await assert.rejects(()=>record(cancelled,cancelBody,cancelKey),e=>e.code==='REQUEST_CANCELLED');assert.deepEqual(await state(),cancelledBefore);
  await assert.rejects(()=>resolve(cancelled,randomUUID(),{...user,permissions:['contracts.read','contracts.finalize','finance.write']}),e=>e.code==='FORBIDDEN');
  const rollback=await fixture({paid:400000,deposit:200000,end:anchor}),rollbackBody=await recordInput(rollback,{receipts:[receipt(100000)],refund:refund(200000)}),rollbackKey=randomUUID();
  const rollbackBefore=await state();failReceipt();await assert.rejects(()=>record(rollback,rollbackBody,rollbackKey),/QA failure after business writes/);
  const rollbackAfter=await state();delete rollbackBefore.sequence;delete rollbackAfter.sequence;assert.deepEqual(rollbackAfter,rollbackBefore);
  assert.equal((await writer.readMobileReturnReceipt(user,rollbackKey)).receipt,null);
  assert.equal((await resolve(rollback,rollbackKey)).status,'cancelled');
  checks.push('Durable return tombstones block late writers with no vehicle/money effects; failure after all business writes and immutable proof but before parent acknowledgement rolls back every row, then permits safe cancellation');

  const lost=await fixture({paid:500000,deposit:200000,end:anchor+hour}),lostBody=await recordInput(lost,{receipts:[],rental_refund:refund(100000),refund:refund(200000)},{early_discount:'100000'}),lostKey=randomUUID();
  loseResponse();await assert.rejects(()=>record(lost,lostBody,lostKey),/QA connection lost after PostgreSQL commit/);
  const lostReceipt=(await writer.readMobileReturnReceipt(user,lostKey)).receipt;assert(lostReceipt.current);assert.equal(lostReceipt.review.totals.rentalRefund,100000);
  const afterLost=await state();assert.equal((await resolve(lost,lostKey)).status,'committed');
  assert.deepEqual(await record(lost,lostBody,lostKey),lostReceipt);assert.deepEqual(await state(),afterLost);
  await pg.query("UPDATE himoto.transactions SET status='cancelled' WHERE id=$1",[lostReceipt.transactions[0].id]);
  const corrected=(await writer.readMobileReturnReceipt(user,lostKey)).receipt;assert.equal(corrected.paymentsCurrent,false);assert.equal(corrected.current,false);
  assert.deepEqual(corrected.transactions,lostReceipt.transactions);assert.deepEqual(corrected.review,lostReceipt.review);
  await pg.query('UPDATE himoto.order_vehicle_details SET vehicle_id=201 WHERE id=$1',[lost.ids[0]]);
  const changed=(await writer.readMobileReturnReceipt(user,lostKey)).receipt;assert.equal(changed.itemsCurrent,false);
  await pg.query("UPDATE himoto.orders SET draft_payload='{}'::jsonb WHERE id=$1",[lost.id]);
  const changedReplay=await record(lost,lostBody,lostKey);assert.equal(changedReplay.current,false);assert.deepEqual(changedReplay.review,lostReceipt.review);
  assert.deepEqual(changedReplay.transactions,lostReceipt.transactions);
  checks.push('Lost return commit response recovers/replays the original immutable result without duplicate money; later cashbook cancellation, vehicle replacement and JSON reconciliation mark current flags independently without erasing original proof');

  const blockedWrite=await fixture({paid:400000,deposit:200000}),unacked=await recordInput(blockedWrite,{receipts:[receipt(120000)],refund_deferred:true});
  const blockedBefore=await state();await assert.rejects(()=>record(blockedWrite,unacked,randomUUID()),e=>e.code==='OVERPAYMENT_ACK_REQUIRED');
  await assert.rejects(()=>record(blockedWrite,{...unacked,settlement_snapshot:'f'.repeat(64)},randomUUID()),e=>e.code==='RETURN_REVIEW_REQUIRED');
  assert.deepEqual(await state(),blockedBefore);
  await pg.query(`INSERT INTO himoto.transactions(order_id,name,type,value,status,created_at,user_id,store_id,cash_id)
    VALUES($1,'order:payment','in',1,'pending',now(),7,23,1)`,[blockedWrite.id]);
  await assert.rejects(()=>record(blockedWrite,unacked,randomUUID()),e=>e.code==='RETURN_REVIEW_REQUIRED');
  checks.push('Return writer rechecks fee/cashbook/settlement fingerprints after locking, requires explicit overpayment acknowledgement and leaves no receipt/key/stock/money mutation on rejected review');
};
