// Isolated actual lifecycle writer/stock helper integration. No live DB or env.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{NextRequest}=require('next/server');
module.exports=async function({pg,raw,load,root,user,admin}){
 const api=load(path.join(root,'lib/server/mobile-contract-lifecycle')),recovery=load(path.join(root,'lib/server/mobile-write-recovery')),checks=[];
 const actor={...user,permissions:['contracts.read','contracts.return']},finance={...user,permissions:['contracts.read','finance.write']},reader={...user,permissions:['contracts.read']};
 await pg.exec("ALTER TABLE himoto.orders ALTER COLUMN total TYPE text USING total::text;ALTER TABLE himoto.transactions ADD created_at timestamptz DEFAULT '2026-10-01T08:00+07'");
 await pg.exec(fs.readFileSync('docs/sql/2026-10-20-returned-vehicle-availability.sql','utf8'));
 await pg.exec(fs.readFileSync('docs/sql/2026-10-24-contract-lifecycle.sql','utf8'));
 await pg.exec("UPDATE himoto.orders SET order_type='ownership',draft_payload=jsonb_set(draft_payload,'{management_composer,rental_type}','\"ownership\"')WHERE id IN(9301,9305,9306);UPDATE himoto.stores SET kind='lease_to_own'WHERE id=24");
 const read=(id=9301,who=actor)=>api.readMobileLifecycle(who,String(id));
 const request=(body,key)=>new NextRequest('https://fixture.invalid/lifecycle',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});
 const write=(body,key=randomUUID(),id=9301,who=actor)=>api.writeMobileLifecycle(who,String(id),request(body,key));
 const resolve=(action,key,who=actor)=>recovery.resolveMobileWrite(who,key,new NextRequest('https://fixture.invalid/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:`lifecycle.${action}:9301`})}));
 const before=await read(),vouchers=(await pg.query('SELECT * FROM himoto.transactions ORDER BY id')).rows,warehouse=(await pg.query('SELECT id,current_store_id FROM himoto.vehicles ORDER BY id')).rows;
 assert(before.actions.some(a=>a.action==='hold'));assert.equal((await read(9301,reader)).actions.length,0);await assert.rejects(()=>read(9301,{...actor,store_id:24}),e=>e.status===404);
 const hold={action:'hold',revision:before.revision,at:'2026-10-02T08:00',hold_until:'2026-10-10T08:00',note:'Thực tế đã thu hồi xe QA',confirmed:true},key=randomUUID();
 await assert.rejects(()=>write(hold,randomUUID(),9301,reader),e=>e.status===403);await assert.rejects(()=>write(hold,randomUUID(),9301,finance),e=>e.status===403);
 const saved=await write(hold,key);assert((await write(hold,key)).receipt.replayed);let held=await read();assert.equal(held.status,'reserved');assert(held.allReturned&&held.holdExpired);assert.equal(held.rentalPaid,before.rentalPaid);assert.equal(held.depositHeld,before.depositHeld);assert.equal((await pg.query('SELECT status FROM himoto.vehicles WHERE id=19301')).rows[0].status,'ready');
 checks.push('Actual hold writer closes only active rental lines, releases stock, freezes the agreement while retaining debt/deposit/receipts; expiry remains reserved and permissions/scope match web');
 const update={action:'update_hold',revision:held.revision,at:'2026-10-02T09:00',hold_until:'2026-10-15T08:00',note:'Đổi hạn bảo lưu QA',confirmed:true};await write(update);held=await read();assert.equal(held.holdUntil,'2026-10-15T08:00');
 const preview=await api.readMobileLifecyclePreview(actor,'9301',request({at:'2026-10-05T08:00'},randomUUID()));assert.equal(preview.end,'2026-10-06T08:00');assert.equal(preview.totalPeriods,0);
 await assert.rejects(()=>write({...update,hold_until:'2026-10-16T08:00'}),e=>e.status===409);const cancel=randomUUID();assert.equal((await resolve('resume',cancel)).status,'cancelled');await assert.rejects(()=>write({action:'resume',revision:held.revision,at:'2026-10-05T08:00',vehicle_ids:[19304],resume_end:preview.end,note:'QA',confirmed:true},cancel),e=>e.code==='REQUEST_CANCELLED');
 const resumed=await write({action:'resume',revision:held.revision,at:'2026-10-05T08:00',vehicle_ids:[19304],resume_end:preview.end,note:'Bàn giao lại xe QA',confirmed:true});assert(resumed.receipt.id===9301);const active=await read();assert.equal(active.status,'renting');assert(active.items.some(i=>i.vehicleId===19304&&!i.completedAt));assert(active.items.some(i=>i.vehicleId===19301&&i.completedAt));assert.equal(active.rentalPaid,before.rentalPaid);assert.equal(active.depositHeld,before.depositHeld);
 checks.push('Actual update_hold and resume retain historical lines/warehouse and debt, choose fresh stock, shift the remaining deadline; CAS and original cancellation keys reject stale/late writes');
 const holdAgain={action:'hold',revision:active.revision,at:'2026-10-05T12:00',hold_until:'2026-10-20T08:00',note:'Thu lại QA',confirmed:true};await write(holdAgain);const toComplete=await read();await write({action:'complete_hold',revision:toComplete.revision,at:'2026-10-05T13:00',note:'Tổn thất không thu hồi QA',confirmed:true});const completed=await read();assert.equal(completed.status,'completed');assert(completed.completedFromHold);assert.equal(completed.waivedAmount,150000);assert.equal(completed.rentalPaid,before.rentalPaid);assert.equal(completed.depositHeld,before.depositHeld);assert.deepEqual((await pg.query('SELECT * FROM himoto.transactions ORDER BY id')).rows,vouchers);assert.deepEqual((await pg.query('SELECT id,current_store_id FROM himoto.vehicles ORDER BY id')).rows,warehouse);
 assert.equal((await resolve('hold',key)).status,'committed');assert.equal((await api.readMobileLifecycleResult(actor,key)).result.receipt.revision,saved.receipt.revision);
 checks.push('Actual completion after hold records debt loss, cancels future debt without inventing cash receipts or moving warehouses; original actor receipt survives later lifecycle changes');
 await pg.exec(`INSERT INTO himoto.orders(id,store_id,order_status,order_type,contract_number,total,pid,first_deposit_amount,additional_deposit_amount,rent_at,return_at,draft_payload)VALUES
  (9310,23,'overdue','daily','BAD9310','200000',0,0,0,'2026-10-01T08:00+07','2026-10-03T08:00+07','{}'),
  (9311,23,'bad_debt','daily','SETTLE9311','200000',200000,0,0,'2026-10-01T08:00+07','2026-10-03T08:00+07','{}');
  INSERT INTO himoto.transactions(id,order_id,value,name,type,status,created_at)VALUES(12,9311,200000,'order:payment','in','approved','2026-10-03T08:00+07');
  INSERT INTO himoto.order_vehicle_details(order_id,vehicle_id,rent_at,return_at,completed_at,type,total_money,hiring_fee)VALUES(9311,19302,'2026-10-01T08:00+07','2026-10-03T08:00+07','2026-10-03T08:00+07','day',200000,100000)`);
 const overdue=await read(9310);assert(overdue.actions.some(a=>a.action==='mark_bad_debt'));await write({action:'mark_bad_debt',revision:overdue.revision,at:'2026-10-04T08:00',note:'Đối chiếu nợ QA',confirmed:true},randomUUID(),9310);assert.equal((await read(9310)).status,'bad_debt');
 const settlement=await read(9311,finance);assert(settlement.actions.some(a=>a.action==='settle'&&a.enabled));await write({action:'settle',revision:settlement.revision,at:'2026-10-04T08:00',note:'Đã trả đủ xe/tiền QA',confirmed:true},randomUUID(),9311,finance);assert.equal((await read(9311)).status,'completed');
 checks.push('Actual debt marking keeps debt/stock; finance-only settlement is permitted when real rental/deposit/refund totals clear and all returned lines can close the contract');
 const out=process.argv.indexOf('--fixture-output');if(out>=0){
  const target=path.resolve(process.argv[out+1]);assert(target.startsWith(path.resolve('.backups')+path.sep)&&!fs.existsSync(target));
  for(const id of[9505,9506]){
   await pg.query(`INSERT INTO himoto.orders(id,store_id,order_status,order_type,contract_number,total,pid,first_deposit_amount,additional_deposit_amount,rent_at,return_at,draft_payload)VALUES($1,23,'renting','ownership',$2,'200000',150000,100000,0,'2026-10-01T08:00+07','2026-12-01T08:00+07','{"management_composer":{"rental_type":"ownership"}}')`,[id,`HOLD${id}`]);
   await pg.query("INSERT INTO himoto.vehicles(id,name,license,store_id,current_store_id,status)VALUES($1,'Xe bảo lưu QA',$2,23,24,'using')",[id+10000,`HOLD${id+10000}`]);
   await pg.query("INSERT INTO himoto.order_vehicle_details(order_id,vehicle_id,rent_at,return_at,hiring_fee,total_money,type)VALUES($1,$2,'2026-10-01T08:00+07','2026-12-01T08:00+07',100000,200000,'day')",[id,id+10000]);
   await pg.query("INSERT INTO himoto.transactions(id,order_id,value,name,type,status,created_at)VALUES($1,$3,50000,'order:payment','in','approved','2026-10-01T08:00+07'),($2,$3,100000,'order:deposit','in','approved','2026-10-01T08:00+07')",[id+20000,id+30000,id]);
  }
  const active=await read(9505),beforeHold=await read(9506);await write({action:'hold',revision:beforeHold.revision,at:'2026-10-02T08:00',hold_until:'2026-10-31T08:00',note:'Bảo lưu QA đã ghi bằng actual writer',confirmed:true},randomUUID(),9506);
  const held=await read(9506),inventory=await api.readMobileLifecycleInventory({...actor,permissions:[...actor.permissions,'vehicles.read']},'9506',new URLSearchParams('page=1'));
  const catalogue=load(path.join(root,'lib/server/mobile-catalogue')),records=[active,held].map(p=>catalogue.mobileRecord('contracts',{id:p.id,code:p.code,customer_name:'Khách bảo lưu QA',status:p.status,store_id:23,store_name:'Cơ sở QA',total_amount:p.totalAmount,paid_amount:p.rentalPaid,rental_type:'ownership'}));
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify({fixtureOnly:true,source:'Actual lifecycle reader/writer and stock helpers on isolated PGlite',active,held,inventory,records},null,2));
 }
 return{passed:checks.length,checks,fixtureOnly:true,operationalDatabaseWrites:0,stagingAcceptance:false,completedAt:new Date().toISOString()};
};
