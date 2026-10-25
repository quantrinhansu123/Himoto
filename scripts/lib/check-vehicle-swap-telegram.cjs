const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {load,root}=require('./load-typescript.cjs');
module.exports=async function checkVehicleSwapTelegram(db,c,schema,notices){
  await c.query('SAVEPOINT vehicle_swap_qa');
  try{
    await c.query(fs.readFileSync('docs/sql/2026-10-25-multiple-record-images.sql','utf8').replaceAll('himoto.',schema+'.').replace(/^BEGIN;|^COMMIT;/gm,''));
    await c.query(`INSERT INTO ${schema}.orders(id,contract_number,customer_name,customer_phone,order_status,store_id,total,pid) VALUES(5,'SWAP-QA','Swap customer QA','','renting',23,'1000000',0)`);
    await c.query(`INSERT INTO ${schema}.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at) VALUES(5001,5,102,now(),now()+interval '1 day')`);
    await c.query(`INSERT INTO ${schema}.management_contract_vehicle_swaps(id,order_id,order_item_id,from_vehicle_id,to_vehicle_id,actor_id) VALUES(51,5,5001,101,102,143),(52,5,5001,102,101,143)`);
    const keys=[...Array.from({length:18},(_,i)=>`vehicle-swap-51-${i+1}`),'vehicle-swap-51-1-extra-2'];
    for(const slot of [...keys,'vehicle-swap-52-1','rental-1'])await c.query(`INSERT INTO ${schema}.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by) VALUES('contracts',5,$1,'image/jpeg',decode('ffd8ff','hex'),143)`,[slot]);
    const service=load(path.join(root,'lib/server/contract-telegram')),content=load(path.join(root,'lib/server/contract-notification-content'));
    const operator={permissions:['contracts.read','contracts.return']},key='vehicle-swap:5:51';
    const read=async()=> (await service.readContractTelegram(db,5,143,operator)).state.events.find(e=>e.key===key);
    let event=await read();assert(event.can_send);assert.equal(event.photo_count,19);assert.equal(event.kind,'vehicle_swap');
    assert(event.text.includes('Xe cũ: 29B1-123.45'));assert(event.text.includes('Xe mới: 30B1-999.99'));assert(event.text.includes('SWAP-QA'));
    assert(event.attachments.every(p=>p.slot.startsWith('vehicle-swap-51-')));assert(!event.text.includes('Hình thức thanh toán'));
    assert.equal((await c.query(`SELECT count(*)::int AS n FROM ${schema}.management_contract_notifications WHERE order_id=5`)).rows[0].n,0);
    const command={action:'send',event_key:key,hash:event.hash,request_id:randomUUID()};
    await assert.rejects(()=>service.saveContractTelegram(db,5,143,{permissions:['contracts.read','contracts.draft']},command),e=>e.status===403);
    await assert.rejects(()=>content.notificationPayload(db,2,'vehicle_swap',143,['vehicle-swap-51']),/Không tìm thấy lượt đổi xe/);
    await service.saveContractTelegram(db,5,143,operator,command);await service.saveContractTelegram(db,5,143,operator,command);
    assert.equal((await c.query(`SELECT count(*)::int AS n FROM ${schema}.management_contract_notifications WHERE order_id=5`)).rows[0].n,1);
    const methods=[];let message=5000;
    assert.equal((await notices.dispatchContractNotifications(async(url,options)=>{
      const method=new URL(url).pathname.split('/').at(-1);methods.push(method);
      if(method==='sendMessage'){assert(JSON.parse(options.body).text.includes('Xe cũ: 29B1-123.45'));return Response.json({ok:true,result:{message_id:message++}});}
      assert.equal(method,'sendMediaGroup');const media=JSON.parse(options.body.get('media'));assert.equal(options.body.get('chat_id'),'-100000000001');
      return Response.json({ok:true,result:media.map(()=>({message_id:message++}))});
    },1,db,[5])).sent,1);
    assert.deepEqual(methods,['sendMediaGroup','sendMediaGroup','sendMessage']);event=await read();assert.equal(event.status,'sent');assert(!event.can_send);
    await notices.dispatchContractNotifications(async()=>{throw Error('A completed swap must not resend automatically');},1,db,[5]);
    // Future contract swaps do not change an older event's old/new vehicles or content hash.
    await c.query(`UPDATE ${schema}.order_vehicle_details SET vehicle_id=101 WHERE order_id=5`);
    const unchanged=await read();assert.equal(unchanged.hash,event.hash);assert(!unchanged.can_send);
    const ids=(await c.query(`SELECT message_ids FROM ${schema}.management_contract_notifications WHERE order_id=5`)).rows[0].message_ids;assert.equal(ids.length,20);
    return ['Vehicle swaps reopen as independent Telegram events with the exact old/new plates and all 19 saved attachments, excluding other swaps/rental photos',
      'Preview never queues; return permission is required; cross-contract swap IDs fail; duplicate submit sends one ordered 10/9-photo block then the summary',
      'Completed swap deliveries stay locked against duplicates after later vehicle changes and preserve all acknowledged IDs'];
  }finally{await c.query('ROLLBACK TO SAVEPOINT vehicle_swap_qa');await c.query('RELEASE SAVEPOINT vehicle_swap_qa');}
};
