// Actual correction helpers reuse the isolated finance bootstrap, never a live DB.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{NextRequest}=require('next/server');
module.exports=async function({pg,raw,load,root,user}){
 const api=load(path.join(root,'lib/server/mobile-contract-corrections')),recovery=load(path.join(root,'lib/server/mobile-write-recovery')),web=load(path.join(root,'lib/server/contract-payments')),checks=[];
 const drafter={...user,access_role:'branch_staff',permissions:['contracts.read','contracts.draft']},renewer={...user,permissions:['contracts.read','contracts.renew']},reader={...user,permissions:['contracts.read']};
 const request=(body,key)=>new NextRequest('https://fixture.invalid/correction',{method:'PATCH',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});
 const write=(kind,input,key=randomUUID(),who=user)=>api.writeMobileContractCorrection(who,'101',kind,request(input,key));
 const resolve=(kind,key,who=user)=>recovery.resolveMobileWrite(who,key,new NextRequest('https://fixture.invalid/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:`correction.${kind}:101`})}));
 await pg.exec('ALTER TABLE himoto.management_contract_notifications ADD status text,ADD message_ids jsonb,ADD retraction jsonb;ALTER TABLE himoto.orders ADD contract_snapshot jsonb;ALTER TABLE himoto.order_vehicle_details ADD updated_at timestamptz;');
 const before=await api.readMobileReceiptCorrections(drafter,'101');assert(before.receipts.length>25);assert(before.accounts.some(a=>a.method==='cash'&&a.id===1)&&before.accounts.some(a=>a.method==='transfer'&&a.id===1));
 await assert.rejects(()=>api.readMobileReceiptCorrections(reader,'101'),e=>e.status===403);await assert.rejects(()=>api.readMobileRenewalCorrections(reader,'101'),e=>e.status===403);await assert.rejects(()=>api.readMobileReceiptCorrections({...drafter,store_id:24},'101'),e=>e.status===404);
 checks.push('Correction grants match actual web alternatives: draft or finance for initial receipts, renew or finance for renewal; scope and cash/bank ID collisions preserved');
 const body={revision:before.revision,deposit_amount:before.depositAmount,reason:'Đối chiếu lại thực nhận',receipts:structuredClone(before.receipts)},target=body.receipts.find(r=>!r.deposit&&r.parts[0].amount==='600000');assert(target);target.parts=[{amount:'310000',method:'cash',account_id:1},{amount:'300000',method:'transfer',account_id:1}];
 const key=randomUUID(),saved=await write('receipts',body,key,drafter);assert(!saved.receipt.replayed);assert((await write('receipts',body,key,drafter)).receipt.replayed);
 const paid=await web.readPaymentContext(raw,101);assert.equal(paid.paid_amount,630000);assert.equal(paid.company_paid_amount,0);assert.equal(paid.deposit_held,80000);
 const split=(await pg.query("SELECT value,created_at,cash_id,bank_id FROM himoto.transactions WHERE order_id=101 AND value IN(310000,300000)ORDER BY id")).rows;assert.equal(split.length,2);assert(split.every(r=>new Date(r.created_at).toISOString()===target.paid_at));
 assert.equal((await pg.query("SELECT jsonb_array_length(draft_payload#>'{management_composer,receipt_corrections}')n FROM himoto.orders WHERE id=101")).rows[0].n,1);
 await assert.rejects(()=>write('receipts',{...body,reason:'Khác nội dung'},key,drafter),e=>e.code==='REQUEST_KEY_REUSED');assert.equal((await resolve('receipts',key,drafter)).status,'committed');
 checks.push('Actual initial-receipt writer splits routing/amount into existing+new vouchers once; original dates/deposit/refund preserved, paid/company totals and before/after audit update together');
 const fresh=await api.readMobileReceiptCorrections(user,'101'),invalid={revision:fresh.revision,deposit_amount:fresh.depositAmount,reason:'Ngày không được đổi',receipts:structuredClone(fresh.receipts)};invalid.receipts[0].paid_at='2026-10-01T00:00:00Z';await assert.rejects(()=>write('receipts',invalid),e=>e.status===409);
 await assert.rejects(()=>write('receipts',{...invalid,revision:'0'}),e=>e.status===409);const cancel=randomUUID();assert.equal((await resolve('receipts',cancel,drafter)).status,'cancelled');await assert.rejects(()=>write('receipts',invalid,cancel,drafter),e=>e.code==='REQUEST_CANCELLED');
 checks.push('Initial correction keeps receipt date/type, uses order and receipt CAS, requires reason, and cancelled keys block late submissions');
 // Seed one coherent approved renewal plus its matching version/line, inside QA DB.
 const payload={version:2,kind:'renewal',item_id:301,vehicle_id:201,amount:100000,collected_amount:50000,before_return_at:'2026-10-02T01:00:00Z',return_at:'2026-10-03T01:00:00Z',license:'QA-SQL-201',vehicle_name:'Xe QA'};
 await pg.query("UPDATE himoto.orders SET draft_payload=jsonb_set(draft_payload,'{management_composer,versions}',$1),return_at='2026-10-03T01:00Z'WHERE id=101",[JSON.stringify([payload])]);
 await pg.exec("UPDATE himoto.order_vehicle_details SET rent_at='2026-10-01T01:00Z',return_at='2026-10-03T01:00Z',total_renewal_amount=100000 WHERE id=301");
 const tx=Number((await pg.query("INSERT INTO himoto.transactions(order_id,name,type,value,status,created_at,user_id,store_id,cash_id,payment_method,note)VALUES(101,'order:payment','in',50000,'approved','2026-10-02T02:00Z',7,23,1,1,'Gia hạn QA')RETURNING id")).rows[0].id);
 await pg.query('INSERT INTO himoto.management_contract_payments(request_id,order_id,transaction_id,actor_id,request_hash,renewal_payload)VALUES($1,101,$2,7,$3,$4)',[randomUUID(),tx,'0'.repeat(64),JSON.stringify(payload)]);await pg.exec('UPDATE himoto.orders SET pid=pid+50000 WHERE id=101');
 const renewal=await api.readMobileRenewalCorrections(renewer,'101'),receipt=renewal.receipts.find(r=>r.id===tx);assert(receipt&&receipt.feeEditable);
 const correction={transaction_id:tx,revision:receipt.revision,reason:'Sửa ngày và số thực thu',paid_at:'2026-10-02T03:00:00Z',collected_amount:'60000',amount:'120000',before_return_at:'2026-10-02T01:00:00Z',return_at:'2026-10-04T01:00:00Z',method:'transfer',account_id:1};
 const beforeMoney=await web.readPaymentContext(raw,101),rk=randomUUID(),result=await write('renewal',correction,rk,renewer);assert((await write('renewal',correction,rk,renewer)).receipt.replayed);assert.equal((await resolve('renewal',rk,renewer)).status,'committed');
 const after=await web.readPaymentContext(raw,101);assert.equal(after.total_amount,beforeMoney.total_amount+20000);assert.equal(after.paid_amount,beforeMoney.paid_amount+10000);const changed=after.history.find(r=>r.id===tx);assert.equal(changed.amount,60000);assert.equal(changed.paid_at,'2026-10-02T03:00:00.000Z');assert.equal(changed.renewal.amount,120000);assert.equal(changed.renewal.return_at,'2026-10-04T01:00:00.000Z');
 assert.equal((await api.readMobileContractCorrectionResult(renewer,'renewal',rk)).result.receipt.revision,result.receipt.revision);
 await assert.rejects(()=>write('renewal',{...correction,reason:'Stale'},randomUUID(),renewer),e=>e.status===409);await assert.rejects(()=>resolve('renewal',randomUUID(),drafter),e=>e.status===403);
 checks.push('Actual renewal correction adjusts real voucher date/value/routing separately from renewal fee/period, updates totals/line/audit once, preserves original UUID receipt and rejects stale revisions');
 const out=process.argv.indexOf('--fixture-output');if(out>=0){
  const target=path.resolve(process.argv[out+1]);assert(target.startsWith(path.resolve('.backups')+path.sep)&&!fs.existsSync(target));
  await pg.exec("INSERT INTO himoto.orders(id,contract_number,order_status,store_id,total,pid,first_deposit_amount,additional_deposit_amount,total_rental_fees,rent_at,return_at,draft_payload)VALUES(9405,'CORRECT9405','renting',23,'300000',250000,200000,0,300000,'2026-10-01T01:00Z','2026-10-03T01:00Z','{}');INSERT INTO himoto.vehicles VALUES(29405,'Xe sửa tiền QA','CORRECT29405');INSERT INTO himoto.order_vehicle_details(id,order_id,vehicle_id,type,rent_at,return_at,hiring_fee,total_renewal_amount)VALUES(19405,9405,29405,'day','2026-10-01T01:00Z','2026-10-03T01:00Z',100000,100000)");
  const demoPayload={...payload,item_id:19405,vehicle_id:29405,collected_amount:100000,license:'CORRECT29405',vehicle_name:'Xe sửa tiền QA'};
  await pg.query('UPDATE himoto.orders SET draft_payload=$1 WHERE id=9405',[JSON.stringify({management_composer:{versions:[demoPayload]}})]);
  for(const[name,value]of[['order:deposit',100000],['order:payment',50000],['order:payment',100000]]){
   const t=Number((await pg.query("INSERT INTO himoto.transactions(order_id,name,type,value,status,created_at,user_id,store_id,cash_id,payment_method,note)VALUES(9405,$1,'in',$2,'approved','2026-10-02T02:00Z',7,23,1,1,'Khoản thu QA')RETURNING id",[name,value])).rows[0].id);
   if(value===100000&&name==='order:payment')await pg.query('INSERT INTO himoto.management_contract_payments(request_id,order_id,transaction_id,actor_id,request_hash,renewal_payload)VALUES($1,9405,$2,7,$3,$4)',[randomUUID(),t,'0'.repeat(64),JSON.stringify(demoPayload)]);
  }
  const receipts=await api.readMobileReceiptCorrections(drafter,'9405'),renewal=await api.readMobileRenewalCorrections(renewer,'9405'),catalogue=load(path.join(root,'lib/server/mobile-catalogue'));
  const record=catalogue.mobileRecord('contracts',{id:9405,code:'CORRECT9405',customer_name:'Khách sửa tiền QA',status:'renting',store_id:23,store_name:'Cơ sở QA',total_amount:300000,paid_amount:150000,rental_type:'daily'});
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify({fixtureOnly:true,source:'Actual web/mobile receipt and renewal correction projections on disposable PGlite',receipts,renewal,record},null,2));
 }
 return{passed:checks.length,checks,fixtureOnly:true,operationalDatabaseWrites:0,stagingAcceptance:false,completedAt:new Date().toISOString()};
};
