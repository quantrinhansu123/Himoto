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
    const media=JSON.parse(options.body.get('media'));assert(media.every(item=>!item.caption));
    if(methods.length===1){const blocked=await notices.dispatchContractNotifications(async()=>{throw Error('Another request interleaved the same group');},1,db,[2]);assert.equal(blocked.sent,0);}
    return Response.json({ok:true,result:media.map((_,i)=>({message_id:methods.length*10+i}))});
  };
  assert.equal((await notices.dispatchContractNotifications(send,1,db,[2])).sent,1);
  assert.deepEqual(methods,['sendMediaGroup','sendMediaGroup','sendMediaGroup','sendMessage']);
  assert.equal((await c.query(`SELECT status FROM ${schema}.management_contract_notifications WHERE id=$1`,[first])).rows[0].status,'sent');
  assert.equal((await c.query(`SELECT status FROM ${schema}.management_contract_notifications WHERE id=$1`,[second])).rows[0].status,'pending');
  await notices.dispatchContractNotifications(send,1,db,[2]);assert.equal(methods.at(-1),'sendMessage');assert.equal(methods.length,5);
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
  return ['23 mixed photos/video are sent in 10/10/3 albums with no captions, followed by one closing syntax message; a concurrent sender cannot interleave the same group',
    'Media interruption preserves partial Telegram IDs, omits the closing summary, releases the group lease and never retries an uncertain send automatically'];
};
