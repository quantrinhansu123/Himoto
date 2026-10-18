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
  assert.equal((await c.query(`SELECT id FROM ${schema}.management_contract_notifications WHERE vehicle_event_id IS NOT NULL`)).rowCount,0);
  await assert.rejects(()=>service.saveVehicleTransferTelegram(db,101,900001,destination),e=>e.status===403);
  await assert.rejects(()=>service.readVehicleTransferTelegram(db,101,900001,{...source,store_id:999999}),e=>e.status===403);
  await assert.rejects(()=>service.saveVehicleTransferTelegram(db,101,900001,{...source,permissions:['vehicles.read']}),e=>e.status===403);
  assert(!(await service.readVehicleTransferTelegram(db,102,900003,source)).state.eligible);
  await assert.rejects(()=>service.saveVehicleTransferTelegram(db,102,900003,source),e=>e.status===400);
  await service.saveVehicleTransferTelegram(db,101,900001,source);await service.saveVehicleTransferTelegram(db,101,900001,source);
  assert.equal((await c.query(`SELECT id FROM ${schema}.management_contract_notifications WHERE vehicle_event_id=900001`)).rowCount,1);
  const calls=[];
  const send=async(url,options)=>{const payload=JSON.parse(options.body);assert.equal(payload.chat_id,'-100000000101');assert.equal(payload.message_thread_id,17);assert(!payload.text.includes('Khách thuê xe:'));calls.push(payload.text);return Response.json({ok:true,result:{message_id:999}});};
  assert.equal((await notices.dispatchContractNotifications(send,1,db,undefined,[900001])).sent,1);
  await service.saveVehicleTransferTelegram(db,101,900001,source);
  assert.equal((await notices.dispatchContractNotifications(send,1,db,undefined,[900001])).sent,0);assert.equal(calls.length,1);
  await assert.rejects(()=>service.saveVehicleTransferTelegram(db,101,900002,source),e=>e.status===403);
  await service.saveVehicleTransferTelegram(db,101,900002,destination);
  assert.equal((await notices.dispatchContractNotifications(send,1,db,undefined,[900002])).sent,1);assert(calls[1].includes('ĐÃ NHẬN XE SỞ HỮU'));
  await service.saveVehicleTransferTelegram(db,101,900004,source);
  await notices.dispatchContractNotifications(async()=>{throw Error('QA network interruption');},1,db,undefined,[900004]);
  state=(await service.readVehicleTransferTelegram(db,101,900004,source)).state;assert.equal(state.status,'unknown');assert(!state.can_send);
  await assert.rejects(()=>service.saveVehicleTransferTelegram(db,101,900004,source),e=>e.status===403);
  assert.equal((await notices.dispatchContractNotifications(async()=>{throw Error('Must not retry unknown');},1,db,undefined,[900004])).sent,0);
  return ['Ownership transfer/receipt previews send nothing; only the source/destination operation owner may explicitly submit their event, sends use the main ownership group, duplicates and uncertain retries are blocked'];
};
