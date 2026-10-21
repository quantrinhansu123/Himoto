const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {parseReturnSettlements,completeReturnBatch}=load(path.join(root,'lib/server/return-settlements'));
const {readPaymentContext,recordContractPayment}=load(path.join(root,'lib/server/contract-payments'));
const {notificationPayload,contractNotificationText}=load(path.join(root,'lib/server/contract-notification-content'));
const pool=load(path.join(root,'lib/server/himoto-database')).ownerDatabase;
global.fetch=async()=>{throw Error('Real network writes are forbidden in QA');};
async function main(){const c=await pool.connect(),checks=[];
const tables=['orders','order_vehicle_details','vehicles','banks','cash','transactions','management_contract_payments','stores','users','management_record_photos','customers','staff_profiles'];
const db={query:(sql,args)=>{for(const table of tables)sql=sql.replaceAll(`himoto.${table}`,`pg_temp.qa_refund_${table}`);assert(!sql.includes('himoto.'),'Business SQL must stay in TEMP');return c.query(sql,args);}};
const local=ms=>new Date(ms+7*3600000).toISOString().slice(0,16),paidAt=local(Date.now()-60000);
const revisions=async()=>(await db.query('SELECT o.xmin::text AS order_revision,d.xmin::text AS item_revision FROM himoto.orders o JOIN himoto.order_vehicle_details d ON d.order_id=o.id WHERE o.id=1')).rows[0];
try{await c.query('BEGIN');for(const table of tables)await c.query(`CREATE TEMP TABLE qa_refund_${table}(LIKE himoto.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);
await c.query("CREATE TEMP SEQUENCE qa_refund_seq START 99000;ALTER TABLE qa_refund_transactions ALTER COLUMN id SET DEFAULT nextval('qa_refund_seq')");
await db.query(`INSERT INTO himoto.stores(id,store_name) VALUES(32,'CS QA');
 INSERT INTO himoto.orders(id,store_id,contract_number,order_status,total,pid) VALUES(1,32,'QA-RETURN','renting','420000',1420000);
 INSERT INTO himoto.vehicles(id,name,license,type,year,store_id,current_store_id,status,created_by) VALUES(700,'Wave QA','QA-358.49','xeso',2026,32,32,'using',153);
 INSERT INTO himoto.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,total_money,total_renewal_amount) VALUES(101,1,700,now()-interval '1 day',now()+interval '1 day',420000,0);
 INSERT INTO himoto.transactions(id,order_id,name,type,status,value,store_id,note,user_id,created_at,updated_at) VALUES(100,1,'order:deposit','in','approved',1000000,32,'',153,now(),now()),(101,1,'order:rental_fees','in','approved',420000,32,'',153,now(),now());
 INSERT INTO himoto.banks(id,store_id,bank_name,owner_name,account_number,status,owner_type,account_type) VALUES(15,32,'QA','QA','0001','Active','personal',1);
 INSERT INTO himoto.cash(id,store_id,name,status,opening_balance) VALUES(5,32,'Két QA','Active',2000000);`);
await c.query('SAVEPOINT baseline');
const fixture=async()=>{const rev=await revisions();return {item:{item_id:101,item_revision:rev.item_revision,returned_at:paidAt,hourly_rate:'20000'},settlement:{order_id:1,revision:rev.order_revision,receipts:[],refund:{request_id:randomUUID(),amount:'1000000',method:'transfer',account_id:15,paid_at:paidAt}}};};
for(const [name,recipient,photo] of [
 ['typed',{recipient_bank:'QA bank',recipient_name:'Khách QA',recipient_account:'000.123 456'},false],
 ['qr-only',{},true],['qr-bank-only',{recipient_bank:'QA bank'},true],
 ['qr-name-only',{recipient_name:'Khách QA'},true],['qr-formatted-account',{recipient_account:'000.123 456'},true],
 ['cash',{},false]]){
 const {item,settlement}=await fixture();Object.assign(settlement.refund,recipient);
 if(name==='cash')Object.assign(settlement.refund,{method:'cash',account_id:5});
 if(photo)await db.query("INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by) VALUES('contracts',1,'return-101-document-2','image/jpeg',$1,153)",[Buffer.from([255,216,255,217])]);
 const parsed=parseReturnSettlements([settlement]);if(recipient.recipient_account)assert.equal(parsed[0].refund.recipient_account,'000123456');
 const result=await completeReturnBatch(db,153,[item],parsed);assert.equal(result[0].status,'completed');
 const ctx=await readPaymentContext(db,1);assert.equal(ctx.deposit_held,0);
 const tx=(await db.query("SELECT type,value,bank_id,cash_id FROM himoto.transactions WHERE name='order:deposit_refund'")).rows;assert.equal(tx.length,1);assert.equal(tx[0].type,'out');assert.equal(Number(tx[0].value),1000000);assert.equal(Number(name==='cash'?tx[0].cash_id:tx[0].bank_id),name==='cash'?5:15);
 const notice=await notificationPayload(db,1,'return',153,['return-101']);assert.equal(notice.refunded,1000000);assert.equal(notice.method,name==='cash'?'Tiền mặt':'CK TK cá nhân');const text=contractNotificationText('return',notice);assert(text.includes('Hình thức hoàn cọc: '+notice.method));assert(!text.includes('undefined'));
 checks.push(name+': return, voucher, refund total and Telegram method agree');await c.query('ROLLBACK TO SAVEPOINT baseline');
}
const {item,settlement}=await fixture();
for(const patch of [{recipient_account:'bad/#'},{recipient_account:'12'},{recipient_account:'. . .'}])assert.throws(()=>parseReturnSettlements([{...settlement,refund:{...settlement.refund,...patch}}]));
assert.throws(()=>parseReturnSettlements([{...settlement,refund_deferred:true}]));
await c.query('SAVEPOINT invalid_recipient');
await assert.rejects(()=>completeReturnBatch(db,153,[item],parseReturnSettlements([{...settlement,refund:{...settlement.refund,recipient_account:'000123'}}])),e=>e.status===409);
await c.query('ROLLBACK TO SAVEPOINT invalid_recipient');
assert.equal((await db.query('SELECT completed_at FROM himoto.order_vehicle_details WHERE id=101')).rows[0].completed_at,null);assert.equal((await db.query('SELECT count(*)::int AS n FROM himoto.transactions')).rows[0].n,2);
checks.push('Missing QR/incomplete recipient and invalid accounts never save the return or silently drop the refund');
const deferred={order_id:1,revision:(await revisions()).order_revision,receipts:[],refund_deferred:true};
await completeReturnBatch(db,153,[item],parseReturnSettlements([deferred]));assert.equal((await readPaymentContext(db,1)).deposit_held,1000000);assert.equal((await db.query('SELECT count(*)::int AS n FROM himoto.transactions')).rows[0].n,2);
const saved=(await db.query('SELECT draft_payload FROM himoto.orders WHERE id=1')).rows[0].draft_payload.management_composer.return_settlements[0];assert.equal(saved.refund_deferred,true);assert.equal(saved.refund_transaction_id,null);
const missingInfo=await notificationPayload(db,1,'return',153,['return-101']);assert(contractNotificationText('return',missingInfo).includes('Chưa có QR/STK'));
checks.push('Explicit not-refunded choice is audited, keeps the deposit and creates no fictitious voucher');
await c.query('ROLLBACK TO SAVEPOINT baseline');
for(const [name,recipient,qr] of [['pending-typed',{bank:'QA bank',account:'000.123 456',name:'Khách QA'},false],['pending-account-only',{account:'000123456'},false],['pending-qr',undefined,true]]){
 const f=await fixture();
 if(qr)await db.query("INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by) VALUES('contracts',1,'return-101-document-2','image/jpeg',$1,153)",[Buffer.from([255,216,255,217])]);
 const parsed=parseReturnSettlements([{order_id:1,revision:f.settlement.revision,receipts:[],refund_deferred:true,...(recipient?{refund_recipient:recipient}:{})}]);
 await completeReturnBatch(db,153,[f.item],parsed);const ctx=await readPaymentContext(db,1);assert.equal(ctx.deposit_held,1000000);assert.equal((await db.query('SELECT count(*)::int AS n FROM himoto.transactions')).rows[0].n,2);
 const notice=await notificationPayload(db,1,'return',153,['return-101']);assert.equal(notice.refunded,0);assert.equal(notice.method,'');assert.equal(notice.refund_pending.amount,1000000);
 const text=contractNotificationText('return',notice);assert(text.includes('Chờ kế toán hoàn cọc: 1.000.000'));assert(!text.includes('Hình thức hoàn cọc:'));if(recipient)assert.equal(notice.refund_pending.account,'000123456');if(qr)assert(notice.photos.some(p=>p.slot==='return-101-document-2'));
 await recordContractPayment(db,1,153,{request_id:randomUUID(),revision:ctx.revision,amount:'1000000',method:'transfer',account_id:15,paid_at:paidAt,purpose:'deposit_refund',note:'QA hoàn sau khi đã gửi thông tin'});
 const after=await notificationPayload(db,1,'return',153,['return-101']);assert.equal(after.refund_pending,undefined);assert.equal(after.refunded,1000000);assert.equal(after.method,'CK TK cá nhân');assert.equal((await readPaymentContext(db,1)).deposit_held,0);
 checks.push(name+': recipient/QR survives return into Telegram without a voucher/source account, then a real refund clears pending');await c.query('ROLLBACK TO SAVEPOINT baseline');
}
for(const r of [{account:'bad/#'},{account:'. . .'},{account:'000123456',amount:'1'},{account_id:15}])assert.throws(()=>parseReturnSettlements([{...deferred,refund_recipient:r}]));
assert.throws(()=>parseReturnSettlements([{...settlement,refund_recipient:{account:'000123456'}}]));
for(const actualFee of ['0','50000']){
 await c.query('ROLLBACK TO SAVEPOINT baseline');
 await db.query("UPDATE himoto.order_vehicle_details SET rent_at=now()-interval '5 days',return_at=now()-interval '3 days',total_money=0,total_renewal_amount=0 WHERE id=101");
 const f=await fixture();f.item.fee_override=actualFee;
 const original=(await db.query('SELECT total,pid FROM himoto.orders WHERE id=1')).rows[0];
 const result=await completeReturnBatch(db,153,[f.item],parseReturnSettlements([{order_id:1,revision:f.settlement.revision,receipts:[],refund_deferred:true}]));
 assert.equal(result[0].late_fee,Number(actualFee));assert.equal(result[0].status,actualFee==='0'?'completed':'wait_payment');
 const after=(await db.query('SELECT total,pid,draft_payload FROM himoto.orders WHERE id=1')).rows[0];
 assert.equal(Number(after.total),Number(original.total)+Number(actualFee));assert.equal(after.pid,original.pid);
 assert.equal(after.draft_payload.management_composer.return_adjustments[0].fee_overridden,true);
 assert(after.draft_payload.management_composer.return_adjustments[0].late_minutes>0);
 assert.equal((await readPaymentContext(db,1)).deposit_held,1000000);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM himoto.transactions')).rows[0].n,2);
 assert.equal((await db.query('SELECT status FROM himoto.vehicles WHERE id=700')).rows[0].status,'ready');
 checks.push('Manual overdue fee '+actualFee+' overrides a multi-day suggestion, preserves already-entered rent/deposit and creates no uncollected or zero-value receipt');
}
}finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}
console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,productionSequenceChanges:0,realTelegramRequests:0},null,2));}
main().catch(e=>{console.error(e.name,e.code||'',e.message);process.exitCode=1;});
