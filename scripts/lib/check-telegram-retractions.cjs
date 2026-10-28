const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {load,root}=require('./load-typescript.cjs');
module.exports=async function checkRetractions(db,c,schema){
 const r=load(path.join(root,'lib/server/telegram-retractions')),service=load(path.join(root,'lib/server/contract-telegram'));
 const crypto=load(path.join(root,'lib/server/integration-secrets')),checks=[];
 const user={permissions:['contracts.read','contracts.draft'],store_id:23},reader={permissions:['contracts.read']};
 const token='123456789:qa-only-bot-token-123456789';
 const target={chat_id:'-100000000001',thread_id:17,bot_id:r.telegramBotIdentity(token),started_at:new Date(Date.now()-60000).toISOString()};
 await c.query('SAVEPOINT retraction_cases');
 const finance=async()=>JSON.stringify((await c.query(`SELECT (SELECT row_to_json(o) FROM ${schema}.orders o WHERE id=1) AS order_row,(SELECT jsonb_agg(t ORDER BY id) FROM ${schema}.transactions t WHERE order_id=1) AS receipts`)).rows);
 const before=await finance();
 try{
  const fixture=async(count=3,overrides={})=>{
   const id=randomUUID(),key='retract:'+id;
   const payload=(await c.query(`SELECT payload FROM ${schema}.management_contract_notifications WHERE order_id=1 LIMIT 1`)).rows[0].payload;
   payload.customer='WRONG SENT CUSTOMER QA';
   await c.query(`INSERT INTO ${schema}.management_contract_notifications(id,order_id,store_id,event_key,root_event_key,event_type,payload,status,message_ids,delivery_target,delivery_mode,sent_at)
     VALUES($1,1,23,$2,$2,'rental',$3,'sent',$4,$5,'manual',now())`,[id,key,JSON.stringify(payload),JSON.stringify(Array.from({length:count},(_,i)=>i+1)),JSON.stringify({...target,...overrides})]);
   return {id,key,input:{action:'retract',notice_id:id,event_key:key,request_id:randomUUID(),reason:'QA nhập sai thông tin hợp đồng',confirmed:true}};
  };
  const read=async id=>(await db.query('SELECT * FROM himoto.management_contract_notifications WHERE id=$1',[id])).rows[0];
  const fresh=await fixture(201);
  assert(r.retractionEligibility(await read(fresh.id),user).can_retract);
  await assert.rejects(()=>service.saveContractTelegram(db,1,143,reader,fresh.input),e=>e.status===403);
  for(const patch of [{confirmed:false},{reason:'x'.repeat(501)},{chat_id:'-100000000999'},{notice_id:randomUUID()},{event_key:'foreign-root'}])await assert.rejects(()=>service.saveContractTelegram(db,1,143,user,{...fresh.input,...patch}));
  checks.push('Retraction requires matching notice/root/order, original event permission and explicit confirmation; arbitrary chat IDs and oversized reasons are rejected');
  fresh.input.reason='';
  await service.saveContractTelegram(db,1,143,user,fresh.input);await service.saveContractTelegram(db,1,143,user,fresh.input);
  assert.equal((await read(fresh.id)).retraction.state,'pending');
  assert.equal((await read(fresh.id)).delivery_review.filter(item=>item.outcome==='retraction_requested').length,1);
  let event=(await service.readContractTelegram(db,1,143,user)).state.events.find(item=>item.key===fresh.key);assert(!event.can_send);assert.equal(event.status,'retracting');
  await c.query(`UPDATE ${schema}.management_store_telegram SET chat_id='-100000000999' WHERE store_id=23`);
  const batches=[];let nested=false;
  const fake=async(url,init)=>{
   assert(new URL(url).pathname.endsWith('/deleteMessages'));assert.equal(init.redirect,'error');const body=JSON.parse(init.body);assert.equal(body.chat_id,target.chat_id);assert(!('message_thread_id' in body));batches.push(body.message_ids);
   if(!nested){nested=true;assert.equal((await r.dispatchTelegramRetractions(fake,1,db,[1])).completed,0);}
   return Response.json({ok:true,result:true});
  };
  assert.equal((await r.dispatchTelegramRetractions(fake,1,db,[1])).completed,1);assert.deepEqual(batches.map(ids=>ids.length),[100,100,1]);
  assert.deepEqual(batches.flat(),Array.from({length:201},(_,i)=>i+1));assert.equal((await read(fresh.id)).retraction.state,'done');
  event=(await service.readContractTelegram(db,1,143,user)).state.events.find(item=>item.key===fresh.key);assert(event.can_send);assert.equal(event.status,'retracted');
  const corrected=await service.readContractTelegram(db,1,143,user);assert.notEqual(corrected.payloads.get(fresh.key).customer,'WRONG SENT CUSTOMER QA');
  await service.saveContractTelegram(db,1,143,user,fresh.input);assert.equal((await r.dispatchTelegramRetractions(fake,1,db,[1])).completed,0);assert.equal(batches.length,3);
  await service.saveContractTelegram(db,1,143,user,{action:'send',event_key:event.key,hash:event.hash,request_id:randomUUID()});
  const resend=(await db.query("SELECT payload FROM himoto.management_contract_notifications WHERE root_event_key=$1 AND status='pending'",[fresh.key])).rows[0];assert(resend);assert.notEqual(resend.payload.customer,'WRONG SENT CUSTOMER QA');
  await db.query("UPDATE himoto.management_contract_notifications SET status='sent',sent_at=now() WHERE root_event_key=$1 AND status='pending'",[fresh.key]);
  assert.equal((await service.readContractTelegram(db,1,143,user)).state.events.find(item=>item.key===fresh.key).can_send,false);
  checks.push('Double click/parallel worker is claimed once; exact frozen group and all 201 media/text IDs removed in 100/100/1 batches; successful retraction permits explicit resend only');
  const partial=await fixture(101);await service.saveContractTelegram(db,1,143,user,partial.input);let calls=0;
  await r.dispatchTelegramRetractions(async()=>++calls===1?Response.json({ok:true,result:true}):Response.json({ok:false,error_code:403},{status:403}),1,db,[1]);
  assert.equal((await read(partial.id)).retraction.state,'failed');assert.equal((await read(partial.id)).retraction.deleted_ids.length,100);
  event=(await service.readContractTelegram(db,1,143,user)).state.events.find(item=>item.key===partial.key);assert(!event.can_send);assert.equal(event.status,'retraction_failed');
  await service.saveContractTelegram(db,1,143,user,{...partial.input,request_id:randomUUID()});const remaining=[];
  await r.dispatchTelegramRetractions(async(_url,init)=>{remaining.push(...JSON.parse(init.body).message_ids);return Response.json({ok:true,result:true});},1,db,[1]);
  assert.deepEqual(remaining,[101]);assert.equal((await read(partial.id)).retraction.state,'done');
  checks.push('Permission/partial deletion failure retains acknowledged IDs, blocks resend and retries only remaining messages; no false full-success state');
  for(const fake of [async()=>{throw Error('Network timeout with token URL that must never be logged');},async()=>Response.json({ok:true,result:false})]){
   const failed=await fixture();await service.saveContractTelegram(db,1,143,user,failed.input);
   await r.dispatchTelegramRetractions(fake,1,db,[1]);const row=await read(failed.id);assert.equal(row.retraction.state,'failed');assert.equal(row.retraction.deleted_ids.length,0);assert(!JSON.stringify(row.retraction).includes('token URL'));
  }
  const expired=await fixture(1,{started_at:new Date(Date.now()-48*3600000).toISOString()});await assert.rejects(()=>service.saveContractTelegram(db,1,143,user,expired.input),e=>e.status===409);
  const legacy=await fixture();await db.query('UPDATE himoto.management_contract_notifications SET delivery_target=NULL WHERE id=$1',[legacy.id]);await assert.rejects(()=>service.saveContractTelegram(db,1,143,user,legacy.input),e=>e.status===409);
  const switched=await fixture();await service.saveContractTelegram(db,1,143,user,switched.input);
  await c.query(`UPDATE ${schema}.management_telegram_settings SET bot_cipher=$1`,[crypto.sealIntegrationSecret({token:'987654321:other-qa-bot'})]);
  await r.dispatchTelegramRetractions(async()=>{throw Error('Must not contact a different bot');},1,db,[1]);assert.equal((await read(switched.id)).retraction.error,'BOT_CHANGED');
  checks.push('48-hour cutoff, legacy unknown destinations and changed bot are blocked; timeouts/malformed acknowledgements remain failed without leaking provider details');
  const scopedOwn=await fixture();
  await c.query(`GRANT USAGE ON SCHEMA ${schema} TO himoto_scoped; GRANT SELECT,UPDATE ON ${schema}.orders TO himoto_scoped; ALTER TABLE ${schema}.orders ENABLE ROW LEVEL SECURITY; CREATE POLICY qa_retraction_order_scope ON ${schema}.orders TO himoto_scoped USING(himoto.access_store(store_id))`);
  await c.query("SELECT set_config('himoto.scope_all','false',true),set_config('himoto.store_id','23',true),set_config('himoto.actor_id','143',true)");
  await c.query('SET LOCAL ROLE himoto_scoped');
  await assert.rejects(()=>service.saveContractTelegram(db,2,143,user,fresh.input),e=>e.status===404);
  await c.query('SAVEPOINT protected_target');await assert.rejects(()=>db.query("UPDATE himoto.management_contract_notifications SET delivery_target='{}' WHERE id=$1",[fresh.id]),e=>e.code==='42501');await c.query('ROLLBACK TO SAVEPOINT protected_target');
  await service.saveContractTelegram(db,1,143,user,scopedOwn.input);
  await c.query('RESET ROLE');
  assert.equal(await finance(),before);
  checks.push('Real scoped SQL denies foreign contracts and target edits; order state, customer data, money/refund receipts remain byte-for-byte unchanged');
  return checks;
 }finally{await c.query('RESET ROLE');await c.query('ROLLBACK TO SAVEPOINT retraction_cases');}
};
