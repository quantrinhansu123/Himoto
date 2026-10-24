const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {load,root}=require('./load-typescript.cjs');

module.exports=async function checkRecovery(db,c,schema,notices){
  const service=load(path.join(root,'lib/server/contract-telegram'));
  const crypto=load(path.join(root,'lib/server/integration-secrets'));
  const admin={access_role:'admin'},key='legacy:rental:3';
  await c.query(`INSERT INTO ${schema}.orders(id,contract_number,customer_name,customer_phone,order_status,store_id,total,pid) VALUES(3,'RECOVERY-QA','Customer QA','','renting',23,'0',0)`);
  const photos=Array.from({length:17},(_,i)=>({slot:`rental-${i+1}`,mime_type:'image/jpeg',bytes:Buffer.from([255,216,255,i+1]).toString('base64')}));
  const payload={code:'RECOVERY-QA',customer:'ORIGINAL CUSTOMER QA',phone:'',store:'QA',actor:'QA',vehicles:'QA-123',total:'0',at:new Date().toISOString(),photos};
  const queue=async(value=payload)=>{
    const id=randomUUID();
    await c.query(`INSERT INTO ${schema}.management_contract_notifications(id,order_id,store_id,event_key,root_event_key,event_type,payload,delivery_mode,status) VALUES($1,3,23,$2,$3,'rental',$4,'manual','pending')`,[id,`recovery:${id}`,key,JSON.stringify(value)]);
    return id;
  };
  const read=async()=> (await service.readContractTelegram(db,3,143,admin)).state.events.find(e=>e.key===key);
  const row=async id=>(await c.query(`SELECT * FROM ${schema}.management_contract_notifications WHERE id=$1`,[id])).rows[0];
  const rejected=description=>Response.json({ok:false,error_code:400,description},{status:400});
  const first=await queue();let calls=0;
  await notices.dispatchContractNotifications(async()=>++calls===1?Response.json({ok:true,result:photos.slice(0,10).map((_,i)=>({message_id:100+i}))}):rejected('Bad Request: invalid photo'),1,db,[3]);
  let failed=await row(first);assert.equal(failed.status,'failed');assert.equal(failed.message_ids.length,10);assert.equal(failed.delivery_review.at(-1).method,'sendMediaGroup');
  await c.query(`UPDATE ${schema}.orders SET customer_name='CORRECTED CUSTOMER QA' WHERE id=3`);
  let event=await read();assert(event.can_resume);assert(!event.can_send);assert.equal(event.delivery_attachment_count,17);assert.equal(event.delivery_message_count,10);assert.equal(event.delivery_error_description,'Bad Request: invalid photo');
  await notices.dispatchContractNotifications(async()=>{throw Error('Failed delivery must await explicit recovery');},1,db,[3]);
  const command={action:'resume',event_key:key,notice_id:first,hash:event.hash,request_id:randomUUID()};
  await assert.rejects(()=>service.saveContractTelegram(db,3,143,{permissions:['contracts.read']},command),e=>e.status===403);
  await assert.rejects(()=>service.saveContractTelegram(db,3,143,admin,{...command,hash:'0'.repeat(64)}),e=>e.status===409);
  await assert.rejects(()=>service.saveContractTelegram(db,3,143,admin,{...command,notice_id:randomUUID()}),e=>e.status===404);
  await service.saveContractTelegram(db,3,143,admin,command);await service.saveContractTelegram(db,3,143,admin,command);
  let queued=await row(first);assert.equal(queued.status,'pending');assert.equal(queued.error_code,'DELIVERY_CONTINUE');assert.deepEqual(queued.payload,failed.payload);assert.deepEqual(queued.message_ids,failed.message_ids);assert.deepEqual(queued.delivery_target,failed.delivery_target);assert.equal(queued.delivery_review.filter(r=>r.outcome==='resume_remaining').length,1);
  assert.equal((await c.query(`SELECT count(*)::int AS n FROM ${schema}.management_contract_notifications WHERE order_id=3`)).rows[0].n,1);
  const resumed=[];
  await notices.dispatchContractNotifications(async(url,options)=>{
    const method=new URL(url).pathname.split('/').at(-1);resumed.push(method);
    if(method==='sendMessage'){assert(JSON.parse(options.body).text.includes('ORIGINAL CUSTOMER QA'));return rejected('Bad Request: text rejected');}
    assert.equal(method,'sendMediaGroup');const media=JSON.parse(options.body.get('media'));assert.equal(media.length,7);
    for(let i=0;i<7;i++)assert.equal(Buffer.from(await options.body.get(`photo${i}`).arrayBuffer()).at(-1),i+11);
    return Response.json({ok:true,result:media.map((_,i)=>({message_id:200+i}))});
  },1,db,[3]);
  assert.deepEqual(resumed,['sendMediaGroup','sendMessage']);failed=await row(first);assert.equal(failed.message_ids.length,17);assert.equal(failed.status,'failed');
  event=await read();assert(event.can_resume);await service.saveContractTelegram(db,3,143,admin,{...command,hash:event.hash,request_id:randomUUID()});
  await notices.dispatchContractNotifications(async url=>{assert(new URL(url).pathname.endsWith('/sendMessage'));return Response.json({ok:true,result:{message_id:300}});},1,db,[3]);
  const sent=await row(first);assert.equal(sent.status,'sent');assert.equal(sent.message_ids.length,18);assert(!(await read()).can_resume);
  // Old versions stored explicit rejections as unknown even though the failed request sent nothing.
  await c.query(`UPDATE ${schema}.management_contract_notifications SET status='unknown',error_code='TELEGRAM_400',message_ids=$2,sent_at=NULL WHERE id=$1`,[first,JSON.stringify(sent.message_ids.slice(0,10))]);
  assert((await read()).can_resume);
  for(const code of ['TELEGRAM_TIMEOUT','TELEGRAM_NETWORK','TELEGRAM_INVALID_RESPONSE','SEND_UNCERTAIN']){
    await c.query(`UPDATE ${schema}.management_contract_notifications SET error_code=$2 WHERE id=$1`,[first,code]);assert(!(await read()).can_resume);
    await assert.rejects(async()=>service.saveContractTelegram(db,3,143,admin,{...command,hash:(await read()).hash,request_id:randomUUID()}),e=>e.status===409);
  }
  await c.query(`UPDATE ${schema}.management_contract_notifications SET status='sent',error_code=NULL,message_ids=$2 WHERE id=$1`,[first,JSON.stringify(sent.message_ids)]);

  const oldEnv={...process.env},oldFetch=global.fetch;
  delete process.env.CLOUDINARY_URL;Object.assign(process.env,{CLOUDINARY_CLOUD_NAME:'qa-cloud',CLOUDINARY_API_KEY:'qa-key',CLOUDINARY_API_SECRET:'qa-recovery-only-secret'});
  let reads=0;
  try{
    const remote=photos.map((p,i)=>({...p,bytes:null,cloudinary_public_id:`qa/recovery/${i+1}`,cloudinary_cloud_name:'qa-cloud',cloudinary_version:1}));
    global.fetch=async url=>{const u=new URL(url);assert.equal(u.hostname,'api.cloudinary.com');const index=Number(u.searchParams.get('public_id').split('/').at(-1));assert(index>=11&&index<=17);reads++;return new Response(Buffer.alloc(1800000,index),{headers:{'Content-Type':'image/jpeg'}});};
    const automatic=await queue({...payload,photos:remote}),methods=[],uploaded=[];let seq=400;
    await notices.dispatchContractNotifications(async(url,options)=>{
      const method=new URL(url).pathname.split('/').at(-1);methods.push(method);
      if(method==='sendMessage')return Response.json({ok:true,result:{message_id:seq++}});
      const media=method==='sendPhoto'?null:JSON.parse(options.body.get('media'));
      const urls=media?.some(item=>item.media.startsWith('https://'));
      if(urls&&media.length===7)return rejected('Bad Request: failed to get HTTP URL content https://private.invalid/photo?signature=secret 123456789:qa-only-bot-token-123456789');
      if(!urls){const files=media?media.map((_,i)=>options.body.get(`photo${i}`)):[options.body.get('photo')];uploaded.push(files.length);assert(files.reduce((n,f)=>n+f.size,0)<=4*1024*1024);}
      const ids=Array.from({length:media?.length||1},()=>({message_id:seq++}));return Response.json({ok:true,result:media?ids:ids[0]});
    },1,db,[3]);
    const complete=await row(automatic);assert.equal(complete.status,'sent');assert.equal(complete.message_ids.length,18);assert.deepEqual(uploaded,[2,2,2,1]);assert.equal(reads,7);assert.equal(methods.at(-1),'sendMessage');
    const audit=complete.delivery_review.find(r=>r.outcome==='media_upload_fallback');assert.equal(audit.media_offset,10);assert.equal(audit.media_count,7);assert(audit.description.includes('[URL]'));assert(audit.description.includes('[TOKEN]'));assert(!audit.description.includes('signature=secret'));assert(!JSON.stringify(audit).includes('qa-only-bot'));
    const interrupted=await queue({...payload,photos:remote});let uploadCalls=0;
    await notices.dispatchContractNotifications(async(url,options)=>{
      const media=JSON.parse(options.body.get('media'));
      if(media.some(item=>item.media.startsWith('https://'))){
        if(media.length===7)return rejected('Bad Request: failed to get HTTP URL content');
        return Response.json({ok:true,result:media.map(()=>({message_id:seq++}))});
      }
      if(++uploadCalls===2)return rejected('Bad Request: invalid photo');
      return Response.json({ok:true,result:media.map(()=>({message_id:seq++}))});
    },1,db,[3]);
    const checkpoint=await row(interrupted);assert.equal(checkpoint.status,'failed');assert.equal(checkpoint.message_ids.length,12);
    event=await read();assert(event.can_resume);assert.equal(event.notice_id,interrupted);
    await service.saveContractTelegram(db,3,143,admin,{...command,notice_id:interrupted,hash:event.hash,request_id:randomUUID()});
    let nextPhoto=13;
    await notices.dispatchContractNotifications(async(url,options)=>{
      const method=new URL(url).pathname.split('/').at(-1);
      if(method==='sendMessage')return Response.json({ok:true,result:{message_id:seq++}});
      const media=method==='sendPhoto'?null:JSON.parse(options.body.get('media'));
      const files=media?media.map((_,i)=>options.body.get(`photo${i}`)):[options.body.get('photo')];
      for(const file of files)assert.equal(Buffer.from(await file.arrayBuffer())[0],nextPhoto++);
      const messages=files.map(()=>({message_id:seq++}));return Response.json({ok:true,result:media?messages:messages[0]});
    },1,db,[3]);
    assert.equal(nextPhoto,18);const recovered=await row(interrupted);assert.equal(recovered.status,'sent');assert.equal(recovered.message_ids.length,18);assert.deepEqual(recovered.message_ids.slice(0,12),checkpoint.message_ids);
    const timeout=await queue({...payload,photos:remote});let attempts=0;const readsBefore=reads;
    await notices.dispatchContractNotifications(async()=>{attempts++;const e=Error('QA timeout');e.name='TimeoutError';throw e;},1,db,[3]);
    assert.equal(attempts,1);assert.equal(reads,readsBefore);assert.equal((await row(timeout)).status,'unknown');
    await c.query(`UPDATE ${schema}.management_contract_notifications SET status='sent' WHERE id=$1`,[timeout]);
    const routing=await queue({...payload,photos:remote});attempts=0;
    await notices.dispatchContractNotifications(async()=>{attempts++;return rejected('Bad Request: message thread not found');},1,db,[3]);
    assert.equal(attempts,1);assert.equal(reads,readsBefore);assert.equal((await row(routing)).status,'failed');
    for(const priorIds of [[],sent.message_ids.slice(0,10)]){
      const killed=await queue();
      await c.query(`UPDATE ${schema}.management_contract_notifications SET status='sending',error_code='DELIVERY_IN_FLIGHT',message_ids=$2,delivery_target=$3 WHERE id=$1`,[killed,JSON.stringify(priorIds),JSON.stringify(failed.delivery_target)]);
      await notices.dispatchContractNotifications(async()=>{throw Error('An orphaned in-flight POST must never replay');},1,db,[3]);
      const uncertain=await row(killed);assert.equal(uncertain.status,'unknown');assert.equal(uncertain.error_code,'SEND_UNCERTAIN');assert.deepEqual(uncertain.message_ids,priorIds);
      await c.query(`UPDATE ${schema}.management_contract_notifications SET status='manual' WHERE id=$1`,[killed]);
    }
    // Verify a branch operator can recover using only the existing scoped UPDATE grants.
    await c.query(`UPDATE ${schema}.management_contract_notifications SET status='unknown',error_code='TELEGRAM_400',message_ids=$2 WHERE id=$1`,[first,JSON.stringify(sent.message_ids.slice(0,10))]);
    await c.query(`UPDATE ${schema}.management_contract_notifications SET status='manual' WHERE order_id=3 AND id<>$1`,[first]);
    await c.query(`GRANT USAGE ON SCHEMA ${schema} TO himoto_scoped; GRANT SELECT ON ${schema}.orders,${schema}.stores,${schema}.customers,${schema}.order_vehicle_details,${schema}.transactions,${schema}.management_contract_payments,${schema}.management_record_photos,${schema}.staff_profiles,${schema}.vehicles TO himoto_scoped; GRANT SELECT(id,name) ON ${schema}.users TO himoto_scoped; GRANT UPDATE ON ${schema}.orders TO himoto_scoped`);
    await c.query("SELECT set_config('himoto.scope_all','false',true),set_config('himoto.store_id','23',true)");await c.query('SET LOCAL ROLE himoto_scoped');
    const operator={permissions:['contracts.draft']};event=(await service.readContractTelegram(db,3,143,operator)).state.events.find(e=>e.key===key);assert(event.can_resume);
    await service.saveContractTelegram(db,3,143,operator,{...command,hash:event.hash,request_id:randomUUID()});assert.equal((await row(first)).status,'pending');
    await c.query('RESET ROLE');await c.query(`UPDATE ${schema}.management_contract_notifications SET status='manual' WHERE order_id=3`);
  }finally{global.fetch=oldFetch;for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];Object.assign(process.env,oldEnv);}
  return [
    '17-photo partial rejection keeps 10 acknowledged IDs, exposes exact progress, blocks full resend and resumes only 7 missing photos plus the original summary',
    'Resume preserves the original payload/target, is idempotent, enforces permission/stale-preview/notice checks and works with existing branch-scoped UPDATE grants',
    'A rejected final summary resumes text alone; legacy TELEGRAM_400 partial sends recover; timeouts/network/invalid responses never qualify for automatic recovery',
    'Confirmed Cloudinary URL rejection falls back to byte-capped direct uploads; a subsequent upload rejection resumes after 12/17 accepted photos, preserves their IDs and sends the summary last',
    'Persisted rejection diagnostics include method, offset and sanitized description without signed URLs or bot tokens',
    'A worker killed during its first or later Telegram POST remains uncertain and never automatically replays an in-flight request',
    'Network timeouts and unrelated routing errors never trigger upload fallback or an automatic replay'
  ];
};
