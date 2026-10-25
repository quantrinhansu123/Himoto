const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async function checkMediaFirst(db,c,schema,notices){
  const photo=i=>({slot:`rental-${i+1}`,mime_type:i===12?'video/mp4':'image/jpeg',bytes:Buffer.from([255,216,255,i+1]).toString('base64')});
  const payload={code:'MEDIA-FIRST-QA',customer:'QA',phone:'',store:'QA',actor:'QA',contract_staff:'Named QA',vehicles:'QA-101',total:'0',at:new Date().toISOString(),photos:Array.from({length:23},(_,i)=>photo(i))};
  const enqueue=async(value=payload,orderId=2)=>{
    const id=randomUUID();
    await c.query(`INSERT INTO ${schema}.management_contract_notifications(id,order_id,store_id,event_key,root_event_key,event_type,payload,delivery_mode,status,created_at)
      VALUES($1,$4,31,$2,$2,'rental',$3,'manual','pending',clock_timestamp())`,[id,`media-first:${id}`,JSON.stringify(value),orderId]);
    return id;
  };
  const first=await enqueue(),second=await enqueue({...payload,code:'SECOND-QA',photos:[]}),methods=[];
  const send=async(url,options)=>{
    const method=new URL(url).pathname.split('/').at(-1);methods.push(method);
    if(method==='sendMessage')return Response.json({ok:true,result:{message_id:199}});
    const media=method==='sendVideo'?[{type:'video'}]:JSON.parse(options.body.get('media'));assert(media.every(item=>!item.caption));
    if(methods.length===1){const blocked=await notices.dispatchContractNotifications(async()=>{throw Error('Another request interleaved the same group');},1,db,[2]);assert.equal(blocked.sent,0);}
    const messages=media.map((_,i)=>({message_id:methods.length*10+i}));
    return Response.json({ok:true,result:method==='sendVideo'?messages[0]:messages});
  };
  assert.equal((await notices.dispatchContractNotifications(send,1,db,[2])).sent,1);
  assert.deepEqual(methods,['sendMediaGroup','sendMediaGroup','sendVideo','sendMediaGroup','sendMessage']);
  assert.equal((await c.query(`SELECT status FROM ${schema}.management_contract_notifications WHERE id=$1`,[first])).rows[0].status,'sent');
  assert.equal((await c.query(`SELECT status FROM ${schema}.management_contract_notifications WHERE id=$1`,[second])).rows[0].status,'pending');
  await notices.dispatchContractNotifications(send,1,db,[2]);assert.equal(methods.at(-1),'sendMessage');assert.equal(methods.length,6);
  const partial=await enqueue(),partialMethods=[];
  await notices.dispatchContractNotifications(async(url,options)=>{
    const method=new URL(url).pathname.split('/').at(-1);partialMethods.push(method);
    if(partialMethods.length===2)throw Error('QA interrupted second album');
    return Response.json({ok:true,result:JSON.parse(options.body.get('media')).map((_,i)=>({message_id:300+i}))});
  },1,db,[2]);
  assert.deepEqual(partialMethods,['sendMediaGroup','sendMediaGroup']);
  const uncertain=(await c.query(`SELECT status,message_ids FROM ${schema}.management_contract_notifications WHERE id=$1`,[partial])).rows[0];
  assert.equal(uncertain.status,'unknown');assert.equal(uncertain.message_ids.length,10);
  assert.equal((await c.query(`SELECT count(*)::int AS n FROM ${schema}.management_telegram_delivery_leases`)).rows[0].n,0);
  assert.equal((await notices.dispatchContractNotifications(async()=>{throw Error('Partial send must never retry');},1,db,[2])).sent,0);
  const continuation=await enqueue({...payload,photos:Array.from({length:12},(_,i)=>({...photo(i),mime_type:'image/jpeg'}))}),originalNow=Date.now;
  let clock=originalNow(),attempts=0;
  try {
    Date.now=()=>clock;
    assert.equal((await notices.dispatchContractNotifications(async(_url,options)=>{
      attempts++;clock+=180000;
      return Response.json({ok:true,result:JSON.parse(options.body.get('media')).map((_,i)=>({message_id:500+i}))});
    },1,db,[2])).sent,0);
  }finally{Date.now=originalNow;}
  const checkpoint=(await c.query(`SELECT status,error_code,message_ids FROM ${schema}.management_contract_notifications WHERE id=$1`,[continuation])).rows[0];
  assert.equal(attempts,1);assert.equal(checkpoint.status,'pending');assert.equal(checkpoint.error_code,'DELIVERY_CONTINUE');assert.equal(checkpoint.message_ids.length,10);
  await c.query(`UPDATE ${schema}.management_telegram_delivery_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE notice_id=$1`,[continuation]);
  await c.query(`UPDATE ${schema}.management_contract_notifications SET created_at=clock_timestamp()+interval '1 hour' WHERE id=$1`,[continuation]);
  const later=await enqueue({...payload,code:'WAIT-UNTIL-CONTINUATION-FINISHES',photos:[]}),resume=[];
  assert.equal((await notices.dispatchContractNotifications(async(url,options)=>{
    const method=new URL(url).pathname.split('/').at(-1);resume.push(method);
    if(method==='sendMessage')return Response.json({ok:true,result:{message_id:600}});
    const media=JSON.parse(options.body.get('media'));assert.equal(media.length,2);
    assert.deepEqual(Buffer.from(await options.body.get('photo0').arrayBuffer()),Buffer.from([255,216,255,11]));
    return Response.json({ok:true,result:[{message_id:510},{message_id:511}]});
  },1,db,[2])).sent,1);
  assert.deepEqual(resume,['sendMediaGroup','sendMessage']);
  const completed=(await c.query(`SELECT status,message_ids FROM ${schema}.management_contract_notifications WHERE id=$1`,[continuation])).rows[0];
  assert.equal(completed.status,'sent');assert.equal(completed.message_ids.length,13);
  assert.equal((await c.query(`SELECT status FROM ${schema}.management_contract_notifications WHERE id=$1`,[later])).rows[0].status,'pending');
  await notices.dispatchContractNotifications(async()=>Response.json({ok:true,result:{message_id:700}}),1,db,[2]);
  const summaryOnly=await enqueue({...payload,photos:[photo(0)]});clock=originalNow();
  try {
    Date.now=()=>clock;
    await notices.dispatchContractNotifications(async(url)=>{
      assert.equal(new URL(url).pathname.split('/').at(-1),'sendPhoto');clock+=210000;
      return Response.json({ok:true,result:{message_id:800}});
    },1,db,[2]);
  }finally{Date.now=originalNow;}
  assert.equal((await c.query(`SELECT status FROM ${schema}.management_contract_notifications WHERE id=$1`,[summaryOnly])).rows[0].status,'pending');
  await notices.dispatchContractNotifications(async(url)=>{assert.equal(new URL(url).pathname.split('/').at(-1),'sendMessage');return Response.json({ok:true,result:{message_id:801}});},1,db,[2]);
  assert.deepEqual((await c.query(`SELECT message_ids FROM ${schema}.management_contract_notifications WHERE id=$1`,[summaryOnly])).rows[0].message_ids,[800,801]);
  const timeoutId=await enqueue({...payload,photos:[photo(0)]});let timeoutCalls=0;
  await notices.dispatchContractNotifications(async()=>{timeoutCalls++;const error=new Error('QA slow Telegram');error.name='TimeoutError';throw error;},1,db,[2]);
  const timeoutState=(await c.query(`SELECT status,error_code,message_ids FROM ${schema}.management_contract_notifications WHERE id=$1`,[timeoutId])).rows[0];
  assert.equal(timeoutState.status,'unknown');assert.equal(timeoutState.error_code,'TELEGRAM_TIMEOUT');assert.deepEqual(timeoutState.message_ids,[]);
  await notices.dispatchContractNotifications(async()=>{timeoutCalls++;throw Error('Timeout must not auto retry');},1,db,[2]);assert.equal(timeoutCalls,1);
  const orphan=await enqueue({...payload,photos:[photo(0)]}),orphanMethods=[];
  await c.query(`UPDATE ${schema}.management_contract_notifications SET status='sending',error_code=NULL,message_ids='[]'::jsonb WHERE id=$1`,[orphan]);
  assert.equal((await notices.dispatchContractNotifications(async(url)=>{
    orphanMethods.push(new URL(url).pathname.split('/').at(-1));
    return Response.json({ok:true,result:{message_id:900}});
  },1,db,[2])).sent,1);
  assert.deepEqual(orphanMethods,['sendPhoto','sendMessage']);
  const stuck=await enqueue({...payload,photos:[photo(0)]});
  await c.query(`UPDATE ${schema}.management_contract_notifications SET status='sending',error_code=NULL,message_ids='[15]'::jsonb WHERE id=$1`,[stuck]);
  await notices.dispatchContractNotifications(async()=>{throw Error('Orphaned sending with Telegram IDs must not contact Telegram');},1,db,[2]);
  const stuckState=(await c.query(`SELECT status,error_code FROM ${schema}.management_contract_notifications WHERE id=$1`,[stuck])).rows[0];
  assert.equal(stuckState.status,'unknown');assert.equal(stuckState.error_code,'SEND_UNCERTAIN');

  // Reopening a later contract must unblock a paused delivery in the same topic.
  await c.query(`INSERT INTO ${schema}.orders(id,contract_number,customer_name,customer_phone,order_status,store_id,total,pid) VALUES(4,'WAITING-QA','QA','','completed',31,'0',0)`);
  const ownerPayload={...payload,code:'TOPIC-OWNER-QA',photos:Array.from({length:18},(_,i)=>({...photo(i),mime_type:'image/jpeg'}))};
  const owner=await enqueue(ownerPayload),waiting=await enqueue({...payload,code:'WAITING-QA',photos:[photo(0)]},4);
  const accepted=Array.from({length:13},(_,i)=>1000+i);
  const savedTarget=(await c.query(`SELECT delivery_target FROM ${schema}.management_contract_notifications WHERE id=$1`,[first])).rows[0].delivery_target;
  const hold=async(id,status='pending',code='DELIVERY_CONTINUE',live=false)=>{
    await c.query(`UPDATE ${schema}.management_contract_notifications SET status=$2,error_code=$3,message_ids=$4,delivery_target=$5 WHERE id=$1`,[id,status,code,JSON.stringify(accepted),JSON.stringify(savedTarget)]);
    await c.query(`INSERT INTO ${schema}.management_telegram_delivery_leases(chat_id,thread_id,lease_id,notice_id,expires_at)
      VALUES($1,0,$2,$3,clock_timestamp()+$4::interval)`,[savedTarget.chat_id,randomUUID(),id,live?'3 minutes':'-1 second']);
  };
  await hold(owner,'pending','DELIVERY_CONTINUE',true);
  assert.equal((await notices.dispatchContractNotifications(async()=>{throw Error('A live topic owner must not be claimed again');},1,db,[4])).sent,0);
  assert.equal((await notices.dispatchContractNotifications(async()=>{throw Error('A live continuation must not overlap itself');},1,db,[2])).sent,0);
  await c.query(`UPDATE ${schema}.management_telegram_delivery_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE notice_id=$1`,[owner]);
  // A requested topic may only wake its own dependency, not a different topic.
  const unrelated=await enqueue({...payload,code:'OTHER-TOPIC-QA',photos:[]},1);
  await c.query(`UPDATE ${schema}.management_contract_notifications SET store_id=23 WHERE id=$1`,[unrelated]);
  const unblockedMethods=[];
  assert.equal((await notices.dispatchContractNotifications(async(url,options)=>{
    const method=new URL(url).pathname.split('/').at(-1);unblockedMethods.push(method);
    if(method==='sendMessage'){assert(JSON.parse(options.body).text.includes('TOPIC-OWNER-QA'));return Response.json({ok:true,result:{message_id:1105}});}
    assert.equal(method,'sendMediaGroup');const media=JSON.parse(options.body.get('media'));assert.equal(media.length,5);
    for(let i=0;i<5;i++)assert.equal(Buffer.from(await options.body.get(`photo${i}`).arrayBuffer()).at(-1),14+i);
    return Response.json({ok:true,result:media.map((_,i)=>({message_id:1100+i}))});
  },1,db,[4])).sent,1);
  assert.deepEqual(unblockedMethods,['sendMediaGroup','sendMessage']);
  const ownerDone=(await c.query(`SELECT status,message_ids FROM ${schema}.management_contract_notifications WHERE id=$1`,[owner])).rows[0];
  assert.equal(ownerDone.status,'sent');assert.deepEqual(ownerDone.message_ids.slice(0,13),accepted);assert.equal(ownerDone.message_ids.length,19);
  for(const id of [waiting,unrelated])assert.equal((await c.query(`SELECT status FROM ${schema}.management_contract_notifications WHERE id=$1`,[id])).rows[0].status,'pending');
  await notices.dispatchContractNotifications(async()=>Response.json({ok:true,result:{message_id:1200}}),1,db,[4]);
  assert.equal((await c.query(`SELECT status FROM ${schema}.management_contract_notifications WHERE id=$1`,[waiting])).rows[0].status,'sent');

  const killedOwner=await enqueue(ownerPayload),nextWaiting=await enqueue({...payload,photos:[]},4);
  await hold(killedOwner,'sending','DELIVERY_IN_FLIGHT');
  await notices.dispatchContractNotifications(async()=>{throw Error('An uncertain dependency must never replay');},1,db,[4]);
  const killedState=(await c.query(`SELECT status,error_code,message_ids FROM ${schema}.management_contract_notifications WHERE id=$1`,[killedOwner])).rows[0];
  assert.equal(killedState.status,'unknown');assert.equal(killedState.error_code,'SEND_UNCERTAIN');assert.deepEqual(killedState.message_ids,accepted);
  await notices.dispatchContractNotifications(async()=>Response.json({ok:true,result:{message_id:1300}}),1,db,[4]);
  assert.equal((await c.query(`SELECT status FROM ${schema}.management_contract_notifications WHERE id=$1`,[nextWaiting])).rows[0].status,'sent');
  await c.query(`UPDATE ${schema}.management_contract_notifications SET status='manual' WHERE id=$1`,[unrelated]);
  return ['23 mixed photos/video preserve attachment order, send videos separately and put one summary after all media; a concurrent sender cannot interleave the same group',
    'Media interruption preserves partial Telegram IDs, omits the closing summary, releases the group lease and never retries an uncertain send automatically',
    'Long deliveries checkpoint acknowledged media, reserve the group even after lease expiry, resume only the remaining attachments or final summary and send each once; actual Telegram timeouts remain unknown without automatic replay',
    'A killed worker that left sending with no lease is resumed; sending with unconfirmed Telegram IDs stays unknown',
    'A later contract resumes its expired topic dependency from 13/18 acknowledged files, then sends on the next refresh without waking unrelated topics',
    'Live continuations cannot overlap; an expired in-flight dependency becomes unknown without replay and releases the topic for the waiting contract'];
};
