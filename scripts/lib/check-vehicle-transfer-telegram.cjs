const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./load-typescript.cjs');
module.exports=async function checkTransfers(db,c,schema,notices){
  const service=load(path.join(root,'lib/server/vehicle-transfer-telegram'));
  const source={access_role:'branch_staff',store_id:23,scope_all:false,permissions:['vehicles.read','vehicles.transfer']};
  const destination={...source,store_id:900001,permissions:['vehicles.read','vehicles.receive']};
  for(const [id,type,from,to,vehicle] of [[900001,'manual_transfer',23,900001,101],[900002,'manual_transfer_receive',23,900001,101],[900003,'manual_transfer',23,31,102],[900004,'manual_transfer',23,900001,101],[900005,'manual_transfer',23,31,101],[900006,'manual_transfer_receive',23,31,102],[900007,'manual_transfer',23,31,102],[900008,'manual_transfer',23,31,102]]){
    await c.query(`INSERT INTO ${schema}.vehicle_location_events(id,vehicle_id,event_type,from_store_id,to_store_id,created_by,created_at,notes,audit_snapshot)
      VALUES($1,$2,$3,$4,$5,143,now() AT TIME ZONE 'Asia/Ho_Chi_Minh','QA transfer', $6)`,[id,vehicle,type,from,to,JSON.stringify({actor_name:'Operator QA',license:`QA-${vehicle}`,vehicle_name:'QA',from_store_name:'Origin QA',to_store_name:vehicle===102?'Destination QA':'Ownership QA'})]);
  }
  await c.query(`INSERT INTO ${schema}.order_vehicle_details(id,order_id,vehicle_id) VALUES(900010,900002,101)`);
  await c.query(`UPDATE ${schema}.orders SET created_at=now()-interval '1 day' WHERE id=900002`);
  await c.query(`INSERT INTO ${schema}.orders(id,contract_number,order_status,order_type,store_id,created_at) VALUES(900006,'QA-FUTURE','completed','daily',23,now()+interval '1 hour')`);
  await c.query(`INSERT INTO ${schema}.order_vehicle_details(id,order_id,vehicle_id) VALUES(900011,900006,101)`);
  assert((await service.readVehicleTransferTelegram(db,101,900005,source)).state.eligible,'A prior ownership contract routes a physical-branch transfer; a future contract cannot reclassify an old event');
  let state=(await service.readVehicleTransferTelegram(db,101,900001,source)).state;
  assert(state.eligible&&state.can_send&&!state.status);assert(state.text.includes('ĐIỀU CHUYỂN XE SỞ HỮU'));assert(state.text.includes('Origin QA'));
  assert(state.destination_label.includes('Nhóm cơ sở Origin QA'));assert(state.destination_label.includes('Thuê sở hữu'));
  assert.equal((await c.query(`SELECT id FROM ${schema}.management_contract_notifications WHERE vehicle_event_id IS NOT NULL`)).rowCount,0);
  await assert.rejects(()=>service.saveVehicleTransferTelegram(db,101,900001,destination),e=>e.status===403);
  await assert.rejects(()=>service.readVehicleTransferTelegram(db,101,900001,{...source,store_id:999999}),e=>e.status===403);
  assert((await service.readVehicleTransferTelegram(db,101,900001,{...source,permissions:['vehicles.read']})).state.can_send);
  assert((await service.readVehicleTransferTelegram(db,101,900001,{...source,id:143,store_id:999999,permissions:[]})).state.can_send,'The actual global dispatcher can manage its own event');
  await service.saveVehicleTransferTelegram(db,101,900001,source);await service.saveVehicleTransferTelegram(db,101,900001,source);
  assert.equal((await c.query(`SELECT id FROM ${schema}.management_contract_notifications WHERE vehicle_event_id=900001`)).rowCount,2);
  assert.deepEqual((await c.query(`SELECT event_key FROM ${schema}.management_contract_notifications WHERE vehicle_event_id=900001 ORDER BY event_key`)).rows.map(row=>row.event_key),
    ['vehicle-event:900001:ownership','vehicle-event:900001:store']);
  const chats=[];
  const send=async(url,options)=>{const payload=JSON.parse(options.body);chats.push(payload.chat_id);assert(['-100000000101','-100000000001'].includes(payload.chat_id));assert(!payload.text.includes('Khách thuê xe:'));return Response.json({ok:true,result:{message_id:999}});};
  assert.equal((await notices.dispatchContractNotifications(send,2,db,undefined,[900001])).sent,2);
  await service.saveVehicleTransferTelegram(db,101,900001,source);
  assert.equal((await notices.dispatchContractNotifications(send,2,db,undefined,[900001])).sent,0);assert.equal(chats.length,2);
  assert(chats.includes('-100000000101')&&chats.includes('-100000000001'));
  await assert.rejects(()=>service.saveVehicleTransferTelegram(db,101,900002,source),e=>e.status===403);
  await service.saveVehicleTransferTelegram(db,101,900002,destination);
  assert.equal((await c.query(`SELECT id FROM ${schema}.management_contract_notifications WHERE vehicle_event_id=900002`)).rowCount,2);
  const receiveTexts=[];
  assert.equal((await notices.dispatchContractNotifications(async(_url,options)=>{const payload=JSON.parse(options.body);receiveTexts.push(payload.text);assert(payload.text.includes('ĐÃ NHẬN XE SỞ HỮU'));return Response.json({ok:true,result:{message_id:1001}});},2,db,undefined,[900002])).sent,2);
  assert.equal(receiveTexts.length,2);
  await service.saveVehicleTransferTelegram(db,101,900004,source);
  await notices.dispatchContractNotifications(async()=>{throw Error('QA network interruption');},1,db,undefined,[900004]);
  state=(await service.readVehicleTransferTelegram(db,101,900004,source)).state;assert.equal(state.status,'unknown');assert(!state.can_send);
  await assert.rejects(()=>service.saveVehicleTransferTelegram(db,101,900004,source),e=>e.status===403);
  assert.equal((await notices.dispatchContractNotifications(async()=>{throw Error('Must not retry unknown');},1,db,undefined,[900004])).sent,0);
  const branchReceiver={...destination,store_id:31};
  // The origin can reopen its event after the vehicle has moved out of its inventory.
  await c.query(`UPDATE ${schema}.vehicles SET current_store_id=31 WHERE id=102`);
  const regular=await service.readVehicleTransferTelegram(db,102,900003,source);
  assert(regular.state.eligible&&regular.state.can_send&&!regular.state.status);
  assert.equal(regular.state.destination_label,'Nhóm cơ sở Origin QA · Nhóm cơ sở Destination QA');
  assert(regular.state.text.startsWith('ĐIỀU CHUYỂN XE\n'));assert(!regular.state.text.includes('SỞ HỮU'));
  assert.equal((await c.query(`SELECT id FROM ${schema}.management_contract_notifications WHERE vehicle_event_id=900003`)).rowCount,0);
  assert(!(await service.readVehicleTransferTelegram(db,102,900003,branchReceiver)).state.can_send);
  for(const user of [branchReceiver,{...source,store_id:999999}]){
    await assert.rejects(()=>service.saveVehicleTransferTelegram(db,102,900003,user),e=>e.status===403);
  }
  const photo=Buffer.from([255,216,255,224,1,2]);
  for(const [event,kind] of [[900003,'transfer'],[900006,'receive']])await c.query(`INSERT INTO ${schema}.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by) VALUES('vehicles',102,$1,'image/jpeg',$2,143)`,[`${kind}-${event}-1`,photo]);
  const branchCalls=[];let messageId=3000;
  const branchSend=async(url,options)=>{
    const method=new URL(url).pathname.split('/').at(-1),form=options.body instanceof FormData;
    const body=form?options.body:JSON.parse(options.body),chat=form?body.get('chat_id'):body.chat_id;
    assert(['-100000000001','-100000000002'].includes(chat),'Regular transfers must never reach an ownership group');
    if(form){assert.equal(method,'sendPhoto');assert.equal(body.get('photo').size,photo.length);}
    else {assert(!body.text.includes('SỞ HỮU'));assert(body.text.includes('Bsx: QA-102'));assert(body.text.includes('QA transfer'));}
    branchCalls.push({method,chat,text:form?null:body.text});return Response.json({ok:true,result:{message_id:++messageId}});
  };
  await service.saveVehicleTransferTelegram(db,102,900003,source);await service.saveVehicleTransferTelegram(db,102,900003,source);
  assert.deepEqual((await c.query(`SELECT event_key,store_id::int FROM ${schema}.management_contract_notifications WHERE vehicle_event_id=900003 ORDER BY event_key`)).rows,
    [{event_key:'vehicle-event:900003:from:store',store_id:23},{event_key:'vehicle-event:900003:to:store',store_id:31}]);
  assert.equal((await notices.dispatchContractNotifications(branchSend,2,db,undefined,[900003])).sent,2);
  assert.deepEqual(branchCalls.map(call=>call.method),['sendPhoto','sendMessage','sendPhoto','sendMessage']);
  assert.equal(new Set(branchCalls.map(call=>call.chat)).size,2);
  state=(await service.readVehicleTransferTelegram(db,102,900003,source)).state;assert.equal(state.status,'sent');assert.equal(state.message_count,4);assert(!state.can_send);
  await service.saveVehicleTransferTelegram(db,102,900003,source);
  assert.equal((await notices.dispatchContractNotifications(branchSend,2,db,undefined,[900003])).sent,0);assert.equal(branchCalls.length,4);
  await assert.rejects(()=>service.saveVehicleTransferTelegram(db,102,900006,source),e=>e.status===403);
  await service.saveVehicleTransferTelegram(db,102,900006,branchReceiver);
  assert.equal((await notices.dispatchContractNotifications(branchSend,2,db,undefined,[900006])).sent,2);
  assert(branchCalls.filter(call=>call.text?.startsWith('ĐÃ NHẬN XE\n')).length===2);
  // Only the unconfigured destination is retried; the already-delivered origin stays locked.
  await c.query(`UPDATE ${schema}.management_store_telegram SET enabled=false WHERE store_id=31`);
  await service.saveVehicleTransferTelegram(db,102,900007,source);
  assert.equal((await notices.dispatchContractNotifications(branchSend,2,db,undefined,[900007])).sent,1);
  state=(await service.readVehicleTransferTelegram(db,102,900007,source)).state;assert.equal(state.status,'awaiting_config');assert(state.can_send);
  const delivered=(await c.query(`SELECT id,message_ids,sent_at FROM ${schema}.management_contract_notifications WHERE vehicle_event_id=900007 AND status='sent'`)).rows;
  await c.query(`UPDATE ${schema}.management_store_telegram SET enabled=true WHERE store_id=31`);
  assert.equal((await notices.dispatchContractNotifications(branchSend,2,db,undefined,[900007])).sent,0);
  await service.saveVehicleTransferTelegram(db,102,900007,source);
  assert.equal((await notices.dispatchContractNotifications(branchSend,2,db,undefined,[900007])).sent,1);
  assert.deepEqual((await c.query(`SELECT id,message_ids,sent_at FROM ${schema}.management_contract_notifications WHERE id=$1`,[delivered[0].id])).rows,delivered);
  await service.saveVehicleTransferTelegram(db,102,900008,source);
  await notices.dispatchContractNotifications(async()=>{throw Error('QA regular transfer interrupted');},1,db,undefined,[900008]);
  state=(await service.readVehicleTransferTelegram(db,102,900008,source)).state;assert.equal(state.status,'unknown');assert(!state.can_send);
  await assert.rejects(()=>service.saveVehicleTransferTelegram(db,102,900008,source),e=>e.status===403);
  assert.equal((await notices.dispatchContractNotifications(branchSend,2,db,undefined,[900008])).sent,1,'Only the untouched second group may send');
  assert.equal((await notices.dispatchContractNotifications(branchSend,2,db,undefined,[900008])).sent,0);
  const objects=load(path.join(root,'lib/server/object-media'));
  const originalUrl=objects.objectMediaUrl,originalRead=objects.readObjectMedia;
  let sourceReads=0;
  const ref={object_bucket:'qa-private',object_key:'himoto/photos/143/00000000-0000-4000-8000-000000000009/v1.jpg',object_etag:'"qa-etag"'};
  objects.objectMediaUrl=async()=>{throw Error('Photos must not use private URLs');};
  objects.readObjectMedia=async supplied=>{assert.deepEqual(supplied,ref);sourceReads++;return new Response(photo);};
  try{
    for(const event of [900009,900010]){
      await c.query(`INSERT INTO ${schema}.vehicle_location_events(id,vehicle_id,event_type,from_store_id,to_store_id,created_by,created_at,notes,audit_snapshot)
        VALUES($1,102,'manual_transfer',23,31,143,now() AT TIME ZONE 'Asia/Ho_Chi_Minh','QA object photo','{}')`,[event]);
      await c.query(`INSERT INTO ${schema}.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by,object_bucket,object_key,object_etag,storage_sha256,storage_bytes)
        VALUES('vehicles',102,$1,'image/jpeg',NULL,143,$2,$3,$4,$5,$6)`,[`transfer-${event}-1`,ref.object_bucket,ref.object_key,ref.object_etag,require('node:crypto').createHash('sha256').update(photo).digest('hex'),photo.length]);
    }
    const preview=await service.readVehicleTransferTelegram(db,102,900009,source);
    assert.equal(preview.payload.photos.length,1);assert.equal(preview.payload.photos[0].bytes,null);
    for(const key of Object.keys(ref))assert.equal(preview.payload.photos[0][key],ref[key]);
    await service.saveVehicleTransferTelegram(db,102,900009,source);
    const objectCalls=[];
    const objectSend=async(url,options)=>{
      const method=new URL(url).pathname.split('/').at(-1);
      if(method==='sendMessage')return Response.json({ok:true,result:{message_id:++messageId}});
      assert.equal(method,'sendPhoto');const value=options.body.get('photo');objectCalls.push(value);
      return Response.json({ok:true,result:{message_id:++messageId,photo:[{file_id:'cached-object-photo',width:1800,height:1800}]}});
    };
    assert.equal((await notices.dispatchContractNotifications(objectSend,2,db,undefined,[900009])).sent,2);
    assert.equal(objectCalls.length,2);assert(Buffer.from(await objectCalls[0].arrayBuffer()).equals(photo));assert.equal(objectCalls[1],'cached-object-photo');assert.equal(sourceReads,1);
    const metrics=(await c.query(`SELECT delivery_review FROM ${schema}.management_contract_notifications WHERE vehicle_event_id=900009 ORDER BY event_key`)).rows
      .map(row=>row.delivery_review.find(review=>review.outcome==='delivery_metrics'));
    assert.deepEqual(metrics.map(metric=>metric.cached_media).sort(),[0,1]);
    assert(metrics.every(metric=>metric.media_count===1&&metric.media_requests===1&&metric.delivery_ms>=0));
    assert.equal((await c.query(`SELECT has_table_privilege('himoto_scoped','${schema}.management_telegram_media_cache','SELECT') AS allowed`)).rows[0].allowed,false);
    await service.saveVehicleTransferTelegram(db,102,900010,source);
    const fallbackCalls=[];
    const fallbackSend=async(url,options)=>{
      const method=new URL(url).pathname.split('/').at(-1);
      if(method==='sendMessage'){fallbackCalls.push('summary');return Response.json({ok:true,result:{message_id:++messageId}});}
      const value=options.body.get('photo');
      if(value==='cached-object-photo'){fallbackCalls.push('rejected');return Response.json({ok:false,error_code:400,description:'wrong file identifier/HTTP URL specified'},{status:400});}
      if(typeof value==='string'){assert.equal(value,'refreshed-object-photo');fallbackCalls.push('cached');}
      else{assert(Buffer.from(await value.arrayBuffer()).equals(photo));fallbackCalls.push('uploaded');}
      return Response.json({ok:true,result:{message_id:++messageId,photo:[{file_id:'refreshed-object-photo',width:1800,height:1800}]}});
    };
    assert.equal((await notices.dispatchContractNotifications(fallbackSend,2,db,undefined,[900010])).sent,2);
    assert.deepEqual(fallbackCalls,['rejected','uploaded','summary','cached','summary']);
    assert.equal((await service.readVehicleTransferTelegram(db,102,900010,source)).state.status,'sent');
  }finally{objects.objectMediaUrl=originalUrl;objects.readObjectMedia=originalRead;}
  return [
    'Ownership transfer/receipt routing and legacy message titles remain intact; duplicates and uncertain retries stay blocked',
    'Regular transfers reopen after inventory moves, preview both branch groups without queueing, and enforce origin/receiver permissions',
    'Regular transfer and receipt each deliver their event photo before the summary to both branch groups, never ownership; repeat submits send nothing',
    'A missing branch configuration waits for explicit retry of only that branch; uncertain delivery cannot be requeued',
    'CloudFly-only transfer photos retain their bucket/key/ETag; both groups receive the photo, with the second group reusing the acknowledged Telegram file ID',
    'A definitely rejected cached file falls back once to verified bytes and refreshes the cache; delivery metrics persist and scoped accounts cannot read cache contents',
  ];
};
