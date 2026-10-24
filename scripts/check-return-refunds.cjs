const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {parseReturnSettlements,completeReturnBatch}=load(path.join(root,'lib/server/return-settlements'));
const {readPaymentContext,recordContractPayment}=load(path.join(root,'lib/server/contract-payments'));
const {notificationPayload,contractNotificationText}=load(path.join(root,'lib/server/contract-notification-content'));
const {queueContractNotification}=load(path.join(root,'lib/server/contract-notifications'));
const {readContractTelegram}=load(path.join(root,'lib/server/contract-telegram'));
const {returnRentalRefundable}=load(path.join(root,'lib/management/return-refunds'));
const {rentalRevenue}=load(path.join(root,'lib/server/rental-revenue'));
const {rentalOverview,vehicleRevenue}=load(path.join(root,'lib/server/rental-reports'));
const pool=load(path.join(root,'lib/server/himoto-database')).ownerDatabase;
global.fetch=async()=>{throw Error('Real network writes are forbidden in QA');};
async function main(){const c=await pool.connect(),checks=[];
const form=fs.readFileSync(path.join(root,'components/management/ReturnSettlementFields.tsx'),'utf8');
assert.match(form,/Ngân hàng nhận của khách \(tuỳ chọn\)/);
assert.doesNotMatch(form,/Ngân hàng nhận của khách \*/);
assert.match(form,/Chưa thể tick «Đã hoàn cọc»/);
assert.match(form,/gia hạn ngày trả không đồng nghĩa đã thu tiền/);
assert.match(form,/if\(value\.deposit_held>0\)setRefundDeferred\(true\)/);
assert.match(form,/Chưa hoàn cọc — trả xe ngay/);
checks.push('Return form keeps bank/STK/name optional');
checks.push('Đã hoàn cọc stays locked until rental debt/fees on the return form are recorded');
const tables=['orders','order_vehicle_details','vehicles','banks','cash','transactions','management_contract_payments','stores','users','management_record_photos','customers','staff_profiles','battery_contracts','management_contract_notifications'];
const db={query:(sql,args)=>{for(const table of tables)sql=sql.replaceAll(`himoto.${table}`,`pg_temp.qa_refund_${table}`);assert(!sql.includes('himoto.'),'Business SQL must stay in TEMP');return c.query(sql,args);}};
const local=ms=>new Date(ms+7*3600000).toISOString().slice(0,16),paidAt=local(Date.now()-60000);
const revisions=async()=>(await db.query('SELECT o.xmin::text AS order_revision,d.xmin::text AS item_revision FROM himoto.orders o JOIN himoto.order_vehicle_details d ON d.order_id=o.id WHERE o.id=1')).rows[0];
try{await c.query('BEGIN');for(const table of tables)await c.query(`CREATE TEMP TABLE qa_refund_${table}(LIKE himoto.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);
await c.query('CREATE UNIQUE INDEX qa_refund_event_key ON qa_refund_management_contract_notifications(event_key)');
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
 ['empty-recipient',{},false],['account-only',{recipient_account:'000123'},false],
 ['qr-only',{},true],['qr-bank-only',{recipient_bank:'QA bank'},true],
 ['qr-name-only',{recipient_name:'Khách QA'},true],['qr-formatted-account',{recipient_account:'000.123 456'},true],
 ['cash',{},false]]){
 const {item,settlement}=await fixture();Object.assign(settlement.refund,recipient);
 if(name==='cash')Object.assign(settlement.refund,{method:'cash',account_id:5});
 if(photo)await db.query("INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by) VALUES('contracts',1,'return-101-document-2','image/jpeg',$1,153)",[Buffer.from([255,216,255,217])]);
 const parsed=parseReturnSettlements([settlement]);if(recipient.recipient_account)assert.equal(parsed[0].refund.recipient_account,String(recipient.recipient_account).replace(/[\s.]/g,''));
 const result=await completeReturnBatch(db,153,[item],parsed);assert.equal(result[0].status,'completed');
 const ctx=await readPaymentContext(db,1);assert.equal(ctx.deposit_held,0);
 const tx=(await db.query("SELECT type,value,bank_id,cash_id FROM himoto.transactions WHERE name='order:deposit_refund'")).rows;assert.equal(tx.length,1);assert.equal(tx[0].type,'out');assert.equal(Number(tx[0].value),1000000);assert.equal(Number(name==='cash'?tx[0].cash_id:tx[0].bank_id),name==='cash'?5:15);
 const notice=await notificationPayload(db,1,'return',153,['return-101']);assert.equal(notice.refunded,1000000);assert.equal(notice.method,name==='cash'?'Tiền mặt':'CK TK cá nhân');const text=contractNotificationText('return',notice);assert(text.includes('Hình thức thanh toán: '+notice.method));assert(!text.includes('undefined'));
 checks.push(name+': return, voucher, refund total and Telegram method agree');await c.query('ROLLBACK TO SAVEPOINT baseline');
}
const {item,settlement}=await fixture();
for(const patch of [{recipient_account:'bad/#'},{recipient_account:'12'},{recipient_account:'. . .'}])assert.throws(()=>parseReturnSettlements([{...settlement,refund:{...settlement.refund,...patch}}]));
assert.throws(()=>parseReturnSettlements([{...settlement,refund_deferred:true}]));
assert.equal((await db.query('SELECT completed_at FROM himoto.order_vehicle_details WHERE id=101')).rows[0].completed_at,null);assert.equal((await db.query('SELECT count(*)::int AS n FROM himoto.transactions')).rows[0].n,2);
checks.push('Invalid refund account numbers never save the return; empty bank/STK/name is allowed');
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
 const text=contractNotificationText('return',notice);assert(text.includes('Chờ kế toán hoàn cọc: 1.000.000'));assert(!text.includes('Hình thức thanh toán:'));if(recipient)assert.equal(notice.refund_pending.account,'000123456');if(qr)assert(notice.photos.some(p=>p.slot==='return-101-document-2'));
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
// Two vehicles, 2m deposit and 800k paid rent; returning early discounts 400k.
async function earlyFixture(paid=800000){
 await c.query('ROLLBACK TO SAVEPOINT baseline');
 await db.query("UPDATE himoto.orders SET total='800000',total_rental_fees=800000,pid=$1,draft_payload='{\"management_composer\":{\"draft\":{}}}' WHERE id=1",[2000000+paid]);
 await db.query('UPDATE himoto.transactions SET value=CASE WHEN id=100 THEN 2000000 ELSE $1 END WHERE id IN(100,101)',[paid]);
 await db.query('UPDATE himoto.order_vehicle_details SET total_money=400000 WHERE id=101');
 await db.query("INSERT INTO himoto.vehicles(id,name,license,type,year,store_id,current_store_id,status,created_by) VALUES(701,'Wave QA 2','QA-358.50','xeso',2026,32,32,'using',153)");
 await db.query("INSERT INTO himoto.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,total_money,total_renewal_amount) VALUES(102,1,701,now()-interval '1 day',now()+interval '1 day',400000,0)");
 const f=await fixture(),second=(await db.query('SELECT xmin::text AS revision FROM himoto.order_vehicle_details WHERE id=102')).rows[0];
 return {items:[{...f.item,early_discount:'200000'},{...f.item,item_id:102,item_revision:second.revision,early_discount:'200000'}],settlement:{...f.settlement,refund:{...f.settlement.refund,amount:'2000000'},rental_refund:{...f.settlement.refund,request_id:randomUUID(),amount:'400000',recipient_account:'000.123 456',recipient_bank:'QA bank',recipient_name:'Khách QA'}}};
}
const balances=[
 [800000,800000,0,400000,-400000,400000],
 [800000,300000,0,400000,-400000,0],
 [800000,600000,0,400000,-400000,200000],
 [800000,800000,0,400000,-300000,300000],
 [800000,1000000,100000,400000,-400000,500000],
 [800000,900000,100000,400000,-100000,200000],
 [null,800000,0,400000,-400000,0],
 [800000,null,0,400000,-400000,0],
];
for(const [total_amount,paid_amount,rental_refundable,discount,net,expected]of balances)assert.equal(returnRentalRefundable({total_amount,paid_amount,rental_refundable},discount,net),expected);
checks.push('Refund preview caps by early discounts AND actual overpayment, including existing credit, repair/late offsets and unknown balances');
let f=await earlyFixture();
assert.throws(()=>parseReturnSettlements([{...f.settlement,rental_refund:{...f.settlement.rental_refund,request_id:f.settlement.refund.request_id}}]));
assert.throws(()=>parseReturnSettlements([{...f.settlement,rental_refund:{...f.settlement.rental_refund,recipient_account:'bad/#'}}]));
assert.throws(()=>parseReturnSettlements([{...f.settlement,rental_refund:{...f.settlement.rental_refund,purpose:'deposit_refund'}}]));
const parsed=parseReturnSettlements([f.settlement]);assert.equal(parsed[0].rental_refund.recipient_account,'000123456');
const result=await completeReturnBatch(db,153,f.items,parsed);assert(result.every(row=>row.status==='completed'));
const context=await readPaymentContext(db,1);assert.equal(context.total_amount,400000);assert.equal(context.paid_amount,400000);assert.equal(context.deposit_held,0);assert.equal(context.rental_refundable,0);
const outs=(await db.query("SELECT name,value,type FROM himoto.transactions WHERE type='out' ORDER BY name")).rows;
assert.deepEqual(outs.map(row=>[row.name,Number(row.value)]),[['order:deposit_refund',2000000],['order:rental_refund',400000]]);
assert.equal(Number((await db.query('SELECT pid FROM himoto.orders WHERE id=1')).rows[0].pid),2400000);
const snapshot=(await db.query('SELECT draft_payload FROM himoto.orders WHERE id=1')).rows[0].draft_payload.management_composer.return_settlements[0];
assert(snapshot.refund_transaction_id&&snapshot.rental_refund_transaction_id&&snapshot.refund_transaction_id!==snapshot.rental_refund_transaction_id);
const notice=await notificationPayload(db,1,'return',153,['return-101','return-102']),text=contractNotificationText('return',notice);
assert.equal(notice.refunded,2000000);assert.equal(notice.rental_refunded,400000);assert(text.includes('Hoàn cọc: 2.000.000'));assert(text.includes('Hoàn tiền thuê trả sớm: 400.000'));assert(text.includes('Tổng tiền hoàn: 2.400.000'));
const today=paidAt.slice(0,10),params=new URLSearchParams({from:today,to:today,store_id:'32'});
const vehicleParams=new URLSearchParams(params);vehicleParams.set('from',local(Date.now()-3*86400000).slice(0,10));
const revenue=await rentalRevenue(db,today,today,32),overview=await rentalOverview(db,params),vehicles=await vehicleRevenue(db,vehicleParams);
assert.equal(revenue.total.early,400000);assert.equal(revenue.total.revenue,400000);assert.equal(overview.total.revenue,400000);assert.equal(overview.total.income,2800000);assert.equal(overview.total.expense,2400000);assert.equal(vehicles.revenue,400000);
checks.push('2m deposit + 400k early rent refund completes two returns atomically as two correctly classified vouchers; total/paid/Telegram/cashbook/actual revenue/vehicle revenue reconcile without double discount');
await db.query("UPDATE himoto.orders SET draft_payload=jsonb_set(draft_payload::jsonb,'{legacy_migration}','{\"sourceStoreId\":\"32\"}')::json WHERE id=1");
assert.equal((await vehicleRevenue(db,vehicleParams)).revenue,400000);
await db.query('UPDATE himoto.order_vehicle_details SET handler_price=450000,money_out_date=50000 WHERE order_id=1');
assert.equal((await vehicleRevenue(db,vehicleParams)).revenue,500000);
checks.push('Imported legacy rentals also include new-web early adjustments; legacy handler totals retain their original fee treatment without adding it twice');
await assert.rejects(()=>completeReturnBatch(db,153,f.items,parsed),e=>e.status===409);
assert.equal((await db.query("SELECT count(*)::int AS n FROM himoto.transactions WHERE type='out'")).rows[0].n,2);
checks.push('Repeated return confirmation cannot issue either refund twice');
for(const [name,paid,patch]of [
 ['unpaid-discount',300000,{}],['over-rental-cap',800000,{rental_refund:{amount:'400001'}}],
 ['over-deposit-cap',800000,{refund:{amount:'2000001'}}],['invalid-payout-account',800000,{refund:{account_id:99999}}],
 ['stale-order',800000,{revision:'0'}],
]){
 f=await earlyFixture(paid);const settlement={...f.settlement,...patch,refund:{...f.settlement.refund,...patch.refund},rental_refund:{...f.settlement.rental_refund,...patch.rental_refund}};
 await c.query('SAVEPOINT invalid_early');
 await assert.rejects(()=>completeReturnBatch(db,153,f.items,parseReturnSettlements([settlement])),e=>e.status===409);
 await c.query('ROLLBACK TO SAVEPOINT invalid_early');await c.query('RELEASE SAVEPOINT invalid_early');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM himoto.order_vehicle_details WHERE completed_at IS NOT NULL')).rows[0].n,0);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM himoto.transactions WHERE type='out'")).rows[0].n,0);
 assert.equal((await readPaymentContext(db,1)).deposit_held,2000000);assert.equal((await readPaymentContext(db,1)).total_amount,800000);
 checks.push(name+': rejection rolls back every vehicle return, discount and both refund vouchers');
}
f=await earlyFixture();
await completeReturnBatch(db,153,f.items,parseReturnSettlements([{order_id:1,revision:f.settlement.revision,receipts:[],refund_deferred:true,refund_recipient:{account:'000123456'},rental_refund:{...f.settlement.rental_refund,amount:'100000'}}]));
const partial=await readPaymentContext(db,1);assert.equal(partial.deposit_held,2000000);assert.equal(partial.rental_refundable,300000);assert.equal(partial.paid_amount,700000);
const partialNotice=await notificationPayload(db,1,'return',153,['return-101','return-102']);assert.equal(partialNotice.refund_pending.amount,2000000);assert.equal(partialNotice.rental_refunded,100000);assert.equal(partialNotice.refunded,0);
checks.push('Partial early refund can accompany deferred deposit; remaining rental credit and pending deposit stay separate in payment context and Telegram');
await queueContractNotification(db,1,'return','return:1:101,102',153,['return-101','return-102']);
const later=await recordContractPayment(db,1,153,{request_id:randomUUID(),revision:partial.revision,amount:'300000',method:'cash',account_id:5,paid_at:paidAt,purpose:'rental_refund',note:'QA remainder'});
await recordContractPayment(db,1,153,{request_id:randomUUID(),revision:later.context.revision,amount:'2000000',method:'cash',account_id:5,paid_at:paidAt,purpose:'deposit_refund',note:'QA deposit later'});
const refreshed=await readContractTelegram(db,1,153,{access_role:'admin',scope_all:true,permissions:[]});
const updated=refreshed.state.events.find(event=>event.key==='return:1:101,102');assert(updated);assert(updated.text.includes('Hoàn tiền thuê trả sớm: 400.000'));assert(updated.text.includes('Tổng tiền hoàn: 2.400.000'));assert(!updated.text.includes('Chờ kế toán hoàn cọc'));
await db.query("DELETE FROM himoto.transactions WHERE order_id=1 AND name='order:rental_refund'");
const removed=await readContractTelegram(db,1,153,{access_role:'admin',scope_all:true,permissions:[]});assert(!removed.state.events.find(event=>event.key==='return:1:101,102').text.includes('Hoàn tiền thuê trả sớm:'));
checks.push('Refreshing queued Telegram content includes later cashbook rental refunds, clears paid deposit reminders and removes deleted refund amounts instead of retaining stale snapshot totals');
f=await earlyFixture();
await completeReturnBatch(db,153,[f.items[0]],parseReturnSettlements([{order_id:1,revision:f.settlement.revision,receipts:[],refund_deferred:true,rental_refund:{...f.settlement.rental_refund,amount:'200000'}}]));
const one=await readPaymentContext(db,1);assert.equal(one.items.length,1);assert.equal(one.paid_amount,600000);assert.equal(one.total_amount,600000);assert.equal(one.deposit_held,2000000);
checks.push('Returning one of two vehicles can refund its paid early discount while the other rental and the entire deposit remain open');
f=await earlyFixture();f.items[0].repair_fee='100000';f.items[0].repair_note='QA repair';f.settlement.rental_refund.amount='300000';
await completeReturnBatch(db,153,f.items,parseReturnSettlements([f.settlement]));
assert.equal((await readPaymentContext(db,1)).total_amount,500000);assert.equal((await readPaymentContext(db,1)).paid_amount,500000);
checks.push('Repair costs offset the early overpayment before refunding; early discount is applied once and only 300k is paid out');
}finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}
console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,productionSequenceChanges:0,realTelegramRequests:0},null,2));}
main().catch(e=>{console.error(e.name,e.code||'',e.message);process.exitCode=1;});
