const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const{load,root}=require('./load-typescript.cjs');
const service=load(path.join(root,'lib/server/contract-telegram'));
const content=load(path.join(root,'lib/server/contract-notification-content'));
module.exports=async function checkPreparation(db,c,schema,notices){
 const id=900021,item=900022,receipt=900023,admin={access_role:'admin'},key=`renewal:${id}:12`;
 const renewal={kind:'renewal',version:12,amount:400000,item_id:item,license:'QA-101',vehicle_name:'Vision',before_return_at:'2026-11-07T11:45:00.000Z',return_at:'2026-11-09T18:45:00+07:00',created_at:'2026-11-07T18:45:00+07:00'};
 const composer={draft:{start_date:'2026-07-21T18:45:58',end_date:'2026-10-24T18:45:00'},versions:[renewal],rental_terms_history:[{at:'2026-10-31T18:46:44',request_id:randomUUID()}]};
 await c.query(`INSERT INTO ${schema}.orders(id,contract_number,customer_name,customer_phone,order_status,store_id,total,pid,rent_at,return_at,draft_payload)
 VALUES($1,'QA-TIME','Fixture','','renting',23,'400000',0,'2026-07-21T11:45:58Z','2026-11-09T11:45:00Z',$2)`,[id,JSON.stringify({management_composer:composer})]);
 await c.query(`INSERT INTO ${schema}.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at) VALUES($1,$2,101,'2026-07-21T11:45:58Z','2026-11-09T11:45:00Z')`,[item,id]);
 await c.query(`INSERT INTO ${schema}.transactions(id,order_id,name,type,value,note,status,user_id,store_id,bank_id,payment_method,bank_owner_type) VALUES($1,$2,'order:payment','in',400000,'Fixture','approved',143,23,99,2,'personal')`,[receipt,id]);
 await c.query(`INSERT INTO ${schema}.management_contract_payments(request_id,order_id,transaction_id,actor_id,request_hash,renewal_payload) VALUES($1,$2,$3,143,$4,$5)`,[randomUUID(),id,receipt,'a'.repeat(64),JSON.stringify(renewal)]);
 await c.query(`INSERT INTO ${schema}.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by) VALUES('contracts',$1,'renewal-12-1','image/jpeg',$2,143)`,[id,Buffer.from([255,216,255,1])]);
 await notices.queueContractNotification(db,id,'renewal',key,143,'renewal-12',renewal);
 const read=async()=>service.readContractTelegram(db,id,143,admin);
 let state=await read(),event=state.state.events.find(e=>e.key===key);
 assert(state.state.events.every(e=>!e.preparation_error));assert(event.can_send);assert.deepEqual(event.renewal_receipt_ids,[receipt]);
 assert(event.text.includes('07/11/2026 18:45 - 09/11/2026 18:45 (2 ngày)'));assert(event.text.includes('CK TK cá nhân: 400.000 đ'));
 const rental=await content.notificationPayload(db,id,'rental',143,['rental']);assert.equal(rental.rental_correction.start_at,'2026-07-21T11:45:58.000Z');assert.equal(rental.rental_correction.end_at,'2026-10-24T11:45:00.000Z');
 assert.equal((await c.query(`SELECT draft_payload#>>'{management_composer,draft,start_date}' AS start FROM ${schema}.orders WHERE id=$1`,[id])).rows[0].start,composer.draft.start_date);

 await c.query(`UPDATE ${schema}.orders SET draft_payload=jsonb_set(draft_payload::jsonb,'{management_composer,draft,start_date}','"bad"')::json WHERE id=$1`,[id]);
 state=await read();const blocked=state.state.events.find(e=>e.kind==='rental');event=state.state.events.find(e=>e.key===key);
 assert(blocked.preparation_error&&!blocked.can_send&&!blocked.can_resume&&!blocked.can_retry_confirmed_absent);assert(!state.payloads.has(blocked.key));assert(event.can_send);
 const count=async()=>(await c.query(`SELECT count(*)::int AS n FROM ${schema}.management_contract_notifications WHERE order_id=$1`,[id])).rows[0].n;
 const before=await count();await assert.rejects(()=>service.saveContractTelegram(db,id,143,admin,{action:'send',event_key:blocked.key,hash:blocked.hash,request_id:randomUUID()}),e=>e.status===409);assert.equal(await count(),before);
 await service.saveContractTelegram(db,id,143,admin,{action:'send',event_key:key,hash:event.hash,request_id:randomUUID()});
 const sent=[];let seq=910000;
 await notices.dispatchContractNotifications(async(url,options)=>{const method=url.split('/').at(-1);sent.push(method);if(method==='sendMessage')assert(JSON.parse(options.body).text.includes('07/11/2026 18:45 - 09/11/2026 18:45'));return Response.json({ok:true,result:{message_id:++seq}});},1,db,[id]);
 assert.deepEqual(sent,['sendPhoto','sendMessage']);state=await read();event=state.state.events.find(e=>e.key===key);assert(event.unchanged&&!event.can_send);

 await c.query(`UPDATE ${schema}.management_contract_notifications SET payload=jsonb_set(payload,'{renewal,return_at}','"bad"') WHERE order_id=$1 AND status='sent'`,[id]);
 state=await read();event=state.state.events.find(e=>e.key===key);assert(event.unchanged&&!event.can_send);assert.equal(event.deliveries[0].message_count,2);assert(event.deliveries[0].text.includes('Nội dung lịch sử'));assert.equal(event.deliveries[0].can_retract,true);
 const badRenewal={...renewal,version:13,return_at:'2026-02-31T18:45:00'},next={...renewal,version:14,before_return_at:renewal.return_at,return_at:'2026-11-11T18:45:00+07:00'};
 await c.query(`UPDATE ${schema}.orders SET draft_payload=jsonb_set(draft_payload::jsonb,'{management_composer,versions}',$2::jsonb)::json WHERE id=$1`,[id,JSON.stringify([renewal,badRenewal,next])]);
 state=await read();assert(state.state.events.find(e=>e.key===`renewal:${id}:13`).preparation_error);assert(state.state.events.find(e=>e.key===`renewal:${id}:14`).can_send);
 await assert.rejects(()=>service.readContractTelegram({query(sql,args){if(sql.includes('AS contract_staff'))throw Object.assign(Error('Synthetic database failure'),{code:'57014'});return db.query(sql,args);}},id,143,admin),e=>e.code==='57014');

 const malformed={code:'QA-TIME',customer:'Fixture',phone:'',store:'Fixture',actor:'Fixture',vehicles:'QA-101',total:'0',at:'2026-11-07T18:45:00+07:00',photos:[],renewal:{...renewal,return_at:'2026-02-31T18:45:00'}};
 const notice=randomUUID();await c.query(`INSERT INTO ${schema}.management_contract_notifications(id,order_id,store_id,event_key,root_event_key,event_type,payload,delivery_mode,status) VALUES($1,$2,23,$3,$3,'renewal',$4,'manual','pending')`,[notice,id,`fixture-invalid:${notice}`,JSON.stringify(malformed)]);
 await notices.dispatchContractNotifications(async()=>{throw Error('Invalid preparation must never reach Telegram');},1,db,[id]);
 const failure=(await c.query(`SELECT status,error_code,message_ids FROM ${schema}.management_contract_notifications WHERE id=$1`,[notice])).rows[0];assert.equal(failure.status,'failed');assert.equal(failure.error_code,'NOTIFICATION_INVALID');assert.deepEqual(failure.message_ids,[]);
 assert.equal((await c.query(`SELECT value,status FROM ${schema}.transactions WHERE id=$1`,[receipt])).rows[0].value,'400000');
 return [
  'A corrected legacy contract with second-resolution local dates reads the complete Telegram panel, preserves 58 seconds and binds the correct 7–9 November receipt',
  'A bad rental event is blocked independently; its valid renewal still sends one photo and one summary without touching the saved dates or money',
  'A blocked event cannot be queued by a crafted send request and never retains a sendable payload',
  'Malformed historical text retains acknowledged IDs and retraction controls and does not unlock duplicate sends',
  'An invalid renewal period does not hide another valid period; database failures remain global failures rather than fake preparation warnings',
  'A queued snapshot with invalid time fails explicitly as NOTIFICATION_INVALID before contacting Telegram'
 ];
};
