const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const content=load(path.join(root,'lib/server/contract-notification-content'));
const telegram=load(path.join(root,'lib/server/contract-telegram'));
const checks=[];
const cash='Tiền mặt',personal='CK TK cá nhân',company='CK TK công ty';
const row=(id,name,value,method=cash,extra={})=>({id,name,value,method,payment_method:method===cash?1:2,type:'in',status:'approved',...extra});
const fixture={store_id:23,code:'QA-SPLIT',contract_number:'QA-SPLIT',order_status:'renting',customer:'Khách QA',phone:'',store:'CS QA',actor:'Nhân viên QA',contract_staff:'Nhân viên QA',ownership:false,total:'140000',total_rental_fees:140000,first_deposit_amount:500000,additional_deposit_amount:null,rent_at:'2026-10-28T00:00:00Z',return_at:'2026-10-29T00:00:00Z',vehicles:'QA-1',vehicle_names:'Xe QA',return_covers_order:false,
  draft_payload:{management_composer:{finalized:{contract_number:'QA-SPLIT',transaction_ids:[101,102,103,104]},return_settlements:[{item_ids:[1],refund_transaction_id:106,rental_refund_transaction_id:108,transaction_ids:[110,111]}],return_adjustments:[{item_id:1,actual_return_at:'2026-10-28T10:00:00Z',late_fee:7,repair_fee:13,fee:20}]}}};
const transactions=[row(101,'order:rental_fees',10000),row(102,'order:rental_fees',130000,personal),row(103,'order:deposit',200000),row(104,'order:additional_deposit',300000,company),
  row(105,'order:payment',1200000,personal,{renewal_payload:{version:2}}),row(106,'order:deposit_refund',40000,cash,{type:'out'}),row(107,'order:deposit_refund',60000,personal,{type:'out'}),
  row(108,'order:rental_refund',20000,company,{type:'out',order_item_id:1}),row(110,'order:return_late',7),row(111,'order:payment',13,company),row(112,'order:battery_swap',100000),
  row(113,'order:payment',99000000,company,{status:'pending',renewal_payload:{version:2}}),row(114,'order:payment',99000000,company,{status:'cancelled',renewal_payload:{version:2}}),
  row(115,'order:payment',300000,company,{renewal_payload:{version:3}})];
let notices=[],queryLog=[];
function db(){return{query:async(sql,values)=>{
  queryLog.push(sql);assert.match(sql,/^SELECT/,'Preview and duplicate-send checks must never write');
  if(sql.includes('FROM himoto.management_contract_battery_swaps'))return{rows:[{id:1,vehicle_id:1,transaction_id:112,battery_percent:10,fee:100000,license:'QA-1',vehicle_name:'Xe QA'}]};
  if(sql.includes('AS return_covers_order'))return{rows:[structuredClone(fixture)]};
  if(sql.startsWith('SELECT o.store_id,o.order_status'))return{rows:[structuredClone(fixture)]};
  if(sql.includes('FROM himoto.transactions t')){assert.match(sql,/t\.status='approved'/);assert.deepEqual(values,[1]);return{rows:transactions.filter(t=>t.status==='approved')};}
  if(sql.includes('SELECT id,event_key'))return{rows:notices};
  if(sql.includes('SELECT transaction_id,renewal_payload'))return{rows:[]};
  return{rows:[]};
}};}
async function main(){
  const split=content.notificationPaymentAmounts([{method:personal,value:'100000'},{method:cash,value:10000},{method:personal,value:30000}]);
  assert.deepEqual(split,[{method:cash,amount:10000},{method:personal,amount:130000}]);
  assert.deepEqual(content.notificationPaymentAmounts([]),[]);
  assert.deepEqual(content.notificationPaymentAmounts([{method:personal,value:140000,payment_method:3}]),[{method:'Tiền mặt + CK (chưa tách số tiền)',amount:140000}]);
  for(const value of [null,'',NaN,Infinity,-1,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>content.notificationPaymentAmounts([{method:cash,value}]));
  assert.throws(()=>content.notificationPaymentAmounts([{method:cash,value:Number.MAX_SAFE_INTEGER},{method:cash,value:1}]));
  checks.push('Method grouping sums exact receipt values deterministically, supports multiple receipts per method, and never invents a split for old mixed or malformed vouchers');
  const rental=await content.notificationPayload(db(),1,'rental',143,['rental']);
  assert.deepEqual(rental.payment_amounts.rental,split);assert.deepEqual(rental.payment_amounts.deposit,[{method:cash,amount:200000},{method:company,amount:300000}]);
  const text=content.contractNotificationText('rental',rental);
  assert(text.includes('Đã thu tiền thuê / phí: Tiền mặt: 10.000 đ · CK TK cá nhân: 130.000 đ'));
  assert(text.includes('Đã thu tiền cọc: Tiền mặt: 200.000 đ · CK TK công ty: 300.000 đ'));
  assert(!text.includes('1.200.000'));assert(text.split('\n').at(-1).startsWith('Thời gian:'));
  assert(text.split('\n').at(-2).startsWith('Nhân viên xuất tin Telegram:'));
  checks.push('Rental payment text shows 10k cash and 130k personal transfer separately from 500k deposit; issue receipt IDs exclude later renewals and settlement collections');
  const reservation=await content.notificationPayload(db(),1,'reservation',143,['rental']);
  assert(content.contractNotificationText('reservation',reservation).includes('Đã thu cọc giữ xe: Tiền mặt: 10.000 đ · CK TK cá nhân: 130.000 đ'));
  assert.deepEqual((await content.notificationPayload(db(),1,'handover',143,['handover'])).payment_amounts,rental.payment_amounts);
  const renewal={version:2,amount:1200000,before_return_at:'2026-10-29T00:00:00Z',return_at:'2026-11-29T00:00:00Z',license:'QA-1',vehicle_name:'Xe QA'};
  const renewed=await content.notificationPayload(db(),1,'renewal',143,['renewal-2'],renewal);
  assert.deepEqual(renewed.payment_amounts,{renewal:[{method:personal,amount:1200000}]});
  assert(content.contractNotificationText('renewal',renewed).includes('Đã thu gia hạn: CK TK cá nhân: 1.200.000 đ'));
  const unpaid=await content.notificationPayload(db(),1,'renewal',143,['renewal-4'],{...renewal,version:4});
  assert.deepEqual(unpaid.payment_amounts.renewal,[]);assert(!content.contractNotificationText('renewal',unpaid).includes('Đã thu gia hạn:'));
  const oldReceipt=await content.notificationPayload(db(),1,'renewal',143,['renewal-receipt-105'],{...renewal,transaction_id:105});assert.deepEqual(oldReceipt.payment_amounts.renewal,renewed.payment_amounts.renewal);
  checks.push('Reservation/handover use original vouchers; renewal text uses only the selected version/receipt, excludes pending/cancelled/other versions and does not claim unpaid fees are collected');
  const returned=await content.notificationPayload(db(),1,'return',143,['return-1']);
  assert.deepEqual(returned.payment_amounts.deposit_refund,[{method:cash,amount:40000}]);assert.deepEqual(returned.payment_amounts.rental_refund,[{method:company,amount:20000}]);
  assert.deepEqual(returned.payment_amounts.return_fees,[{method:cash,amount:7},{method:company,amount:13}]);
  const returnedText=content.contractNotificationText('return',returned);assert(returnedText.includes('Hoàn cọc theo hình thức: Tiền mặt: 40.000 đ'));assert(returnedText.includes('Hoàn tiền thuê theo hình thức: CK TK công ty: 20.000 đ'));assert(!returnedText.includes('CK TK cá nhân: 60.000 đ'));
  const battery=await content.notificationPayload(db(),1,'battery_swap',143,['battery-swap-1']);assert.deepEqual(battery.payment_amounts,{battery_swap:[{method:cash,amount:100000}]});
  checks.push('Return fees, deposit refunds and rental refunds have separate amounts tied to the return event; battery fee breakdown includes only its confirmed receipt');
  const legacy=structuredClone(rental);delete legacy.payment_amounts;
  assert(content.notificationContentMatches('rental',rental,legacy,content.notificationHash('rental',legacy)));
  assert(content.notificationContentMatches('rental',{...rental,at:new Date().toISOString(),actor:'Other'},rental));
  const changed=structuredClone(rental);changed.payment_amounts.rental[0].amount=20000;changed.payment_amounts.rental[1].amount=120000;
  assert.notEqual(content.notificationHash('rental',rental),content.notificationHash('rental',changed));assert(!content.notificationContentMatches('rental',changed,rental));
  assert(!content.notificationContentMatches('rental',{...rental,method:'Tiền mặt'},legacy));
  checks.push('Legacy template enrichment is hash-compatible, while a real split change in a new snapshot changes its hash even when total/method names stay the same');
  const storedLegacy=structuredClone(legacy);delete storedLegacy.store_id;
  const key='finalize:1:QA-SPLIT',oldNotice={id:'00000000-0000-4000-8000-000000000001',event_key:'manual:1:old',root_event_key:key,event_type:'rental',photo_phases:['rental'],photo_slots:[],payload:storedLegacy,content_hash:content.notificationHash('rental',storedLegacy),status:'sent',sent_at:'2026-10-28T00:00:00Z',delivery_mode:'manual',message_ids:[1],retraction:null};
  notices=[oldNotice];const before=JSON.stringify(oldNotice);
  const state=await telegram.readContractTelegram(db(),1,143,{access_role:'admin'});const event=state.state.events.find(e=>e.key===key);
  assert(event.text.includes('Tiền mặt: 10.000 đ'));assert(event.unchanged);assert(!event.can_send);assert(!event.deliveries[0].text.includes('Đã thu tiền thuê / phí:'));assert.equal(JSON.stringify(oldNotice),before);
  await telegram.saveContractTelegram(db(),1,143,{access_role:'admin'},{action:'send',event_key:key,hash:event.hash,request_id:'00000000-0000-4000-8000-000000000002'});
  for(const status of ['pending','sending','unknown']){notices=[{...oldNotice,status}];const e=(await telegram.readContractTelegram(db(),1,143,{access_role:'admin'})).state.events.find(e=>e.key===key);assert(!e.can_send);}
  checks.push('Legacy sent preview gains the amounts without changing delivery history or unlocking duplicate Send; queued/in-flight/uncertain sends remain blocked and duplicate command issues no write');
  if(process.argv.includes('--live-read'))await liveRead();
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realTelegramRequests:0},null,2));
}
async function liveRead(){
  require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});const fs=require('node:fs');const db=load(path.join(root,'lib/server/himoto-database')).ownerDatabase;const c=await db.connect();
  try{await c.query('BEGIN READ ONLY');await c.query("SET LOCAL statement_timeout='20s'");
    const order=(await c.query("SELECT id FROM himoto.orders WHERE contract_number='005506' AND deleted_at IS NULL")).rows[0];assert(order);
    const snapshot=await content.notificationPayload(c,Number(order.id),'rental',173,['rental']);assert.deepEqual(snapshot.payment_amounts.rental,[{method:cash,amount:10000},{method:personal,amount:130000}]);
    const event=(await telegram.readContractTelegram(c,Number(order.id),173,{access_role:'admin'})).state.events.find(e=>e.kind==='rental');assert(event);assert(event.unchanged);assert(!event.can_send);
    fs.mkdirSync('.backups/telegram-payment-amounts',{recursive:true});fs.writeFileSync('.backups/telegram-payment-amounts/live-read.json',JSON.stringify({code:snapshot.code,payment_amounts:snapshot.payment_amounts,previewLines:event.text.split('\n').filter(line=>line.startsWith('Đã thu ')),status:event.status,unchanged:event.unchanged,canSend:event.can_send},null,2));
    checks.push('Live READ ONLY: HĐ 005506 shows exact approved 10k cash + 130k personal transfer and the already-sent notice stays locked against duplicate delivery');
  }finally{await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
