const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./load-typescript.cjs');
module.exports=async function checkTransfers(db,c,schema,notices){
  const service=load(path.join(root,'lib/server/vehicle-transfer-telegram'));
  const source={access_role:'branch_staff',store_id:23,scope_all:false,permissions:['vehicles.read','vehicles.transfer']};
  const destination={...source,store_id:900001,permissions:['vehicles.read','vehicles.receive']};
  for(const [id,type,from,to,vehicle] of [[900001,'manual_transfer',23,900001,101],[900002,'manual_transfer_receive',23,900001,101],[900003,'manual_transfer',23,31,102],[900004,'manual_transfer',23,900001,101],[900005,'manual_transfer',23,31,101]]){
    await c.query(`INSERT INTO ${schema}.vehicle_location_events(id,vehicle_id,event_type,from_store_id,to_store_id,created_by,created_at,notes,audit_snapshot)
      VALUES($1,$2,$3,$4,$5,143,now() AT TIME ZONE 'Asia/Ho_Chi_Minh','QA transfer', $6)`,[id,vehicle,type,from,to,JSON.stringify({actor_name:'Operator QA',license:'QA-101',vehicle_name:'QA',from_store_name:'Origin QA',to_store_name:'Ownership QA'})]);
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
  await assert.rejects(()=>service.saveVehicleTransferTelegram(db,101,900001,{...source,permissions:['vehicles.read']}),e=>e.status===403);
  assert(!(await service.readVehicleTransferTelegram(db,102,900003,source)).state.eligible);
  await assert.rejects(()=>service.saveVehicleTransferTelegram(db,102,900003,source),e=>e.status===400);
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
  return ['Ownership transfer/receipt previews send nothing; source/destination owners submit explicitly; each event fans out to ownership and the physical branch group when present; duplicates and uncertain retries stay blocked'];
};
