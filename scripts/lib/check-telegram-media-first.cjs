const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
module.exports=async function checkMediaFirst(db,c,schema,notices){
  const photo=i=>({slot:`rental-${i+1}`,mime_type:i===12?'video/mp4':'image/jpeg',bytes:Buffer.from([255,216,255,i+1]).toString('base64')});
  const payload={code:'MEDIA-FIRST-QA',customer:'QA',phone:'',store:'QA',actor:'QA',contract_staff:'Named QA',vehicles:'QA-101',total:'0',at:new Date().toISOString(),photos:Array.from({length:23},(_,i)=>photo(i))};
  const enqueue=async(value=payload)=>{
    const id=randomUUID();
    await c.query(`INSERT INTO ${schema}.management_contract_notifications(id,order_id,store_id,event_key,root_event_key,event_type,payload,delivery_mode,status,created_at)
      VALUES($1,2,31,$2,$2,'rental',$3,'manual','pending',clock_timestamp())`,[id,`media-first:${id}`,JSON.stringify(value)]);
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
  return ['23 mixed photos/video preserve attachment order, send videos separately and put one summary after all media; a concurrent sender cannot interleave the same group',
    'Media interruption preserves partial Telegram IDs, omits the closing summary, releases the group lease and never retries an uncertain send automatically',
    'Long deliveries checkpoint acknowledged media, reserve the group even after lease expiry, resume only the remaining attachments or final summary and send each once; actual Telegram timeouts remain unknown without automatic replay'];
};
