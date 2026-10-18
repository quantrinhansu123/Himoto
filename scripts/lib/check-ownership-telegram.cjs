const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {load,root}=require('./load-typescript.cjs');
module.exports=async function checkOwnershipTelegram(db,c,schema,notices){
  const service=load(path.join(root,'lib/server/contract-telegram')),settings=load(path.join(root,'lib/server/integration-settings'));
  const owner=load(path.join(root,'lib/server/himoto-database')).ownerDatabase;
  const descriptors={query:Object.getOwnPropertyDescriptor(owner,'query'),connect:Object.getOwnPropertyDescriptor(owner,'connect')};
  const client={release(){},async query(sql,params){
    if(sql==='BEGIN')return c.query('SAVEPOINT ownership_settings');
    if(sql==='COMMIT')return c.query('RELEASE SAVEPOINT ownership_settings');
    if(sql==='ROLLBACK'){await c.query('ROLLBACK TO SAVEPOINT ownership_settings');return c.query('RELEASE SAVEPOINT ownership_settings');}
    return db.query(sql,params);
  }};
  await c.query('SAVEPOINT ownership_telegram_cases');
  try{
    await c.query(`CREATE TABLE ${schema}.management_integration_schedule (LIKE himoto.management_integration_schedule INCLUDING DEFAULTS)`);
    let pending=Promise.resolve();
    Object.defineProperty(owner,'query',{configurable:true,value:(sql,params)=>{const result=pending.then(()=>db.query(sql,params));pending=result.catch(()=>{});return result;}});
    Object.defineProperty(owner,'connect',{configurable:true,value:async()=>client});
    const groups=[{route:'ownership_new',chat_id:'-100000000101',thread_id:17,enabled:true},{route:'ownership_renewal',chat_id:'-100000000102',thread_id:18,enabled:true}];
    const save=ownership_groups=>settings.saveIntegrationSettings({action:'telegram',token:'',groups:[],...(ownership_groups===undefined?{}:{ownership_groups})});
    await save(groups);
    const saved=await settings.readIntegrationSettings();assert.equal(saved.ownership_groups.length,2);assert(saved.ownership_groups.every(row=>row.enabled));assert(!('bot_cipher' in saved));
    await save(undefined);assert.equal((await c.query(`SELECT count(*)::int AS n FROM ${schema}.management_ownership_telegram WHERE enabled`)).rows[0].n,2);
    for(const invalid of [[groups[0],groups[0]],[{...groups[0],route:'daily'}],[{...groups[0],chat_id:'12345'}],[{...groups[0],thread_id:2147483648}],{},[groups[0],{...groups[1],chat_id:groups[0].chat_id}]])await assert.rejects(()=>save(invalid),settings.IntegrationSettingsError);
    assert.equal((await c.query(`SELECT chat_id FROM ${schema}.management_ownership_telegram WHERE route='ownership_renewal'`)).rows[0].chat_id,groups[1].chat_id);
    await c.query(`INSERT INTO ${schema}.stores(id,store_name,kind) VALUES(900001,'Ownership branch QA','lease_to_own')`);
    const version={kind:'renewal',version:2,amount:250000,before_return_at:'2026-10-18T00:00:00Z',return_at:'2026-11-18T00:00:00Z',license:'QA-OWN',vehicle_name:'QA'};
    const cases=[
      {id:900001,type:'daily',store:23,route:null},
      {id:900002,type:'ownership',store:23,route:'ownership_new'},
      {id:900003,type:'ownership_cd',store:23,route:'ownership_new'},
      {id:900004,type:'monthly',store:900001,route:'ownership_new'},
      {id:900005,type:'',store:23,route:'ownership_new',payloadType:'ownership'},
    ];
    for(const item of cases){
      await c.query(`INSERT INTO ${schema}.orders(id,contract_number,customer_name,order_status,store_id,order_type,total,pid,draft_payload)
        VALUES($1,$2,'Ownership customer QA','renting',$3,$4,250000,0,$5)`,[item.id,`QA-OWN-${item.id}`,item.store,item.type,JSON.stringify({management_composer:{rental_type:item.payloadType||item.type,versions:[version]}})]);
      const state=(await service.readContractTelegram(db,item.id,143,{access_role:'admin'})).state;
      assert.equal(state.auto_enabled,false);
      for(const event of state.events){
        const renewal=event.kind==='renewal',expected=item.route?renewal?groups[1]:groups[0]:{chat_id:'-100000000001',thread_id:null};
        assert.equal(event.destination_label,item.route?renewal?'Thuê sở hữu · Gia hạn':'Thuê sở hữu · Ký mới, trả xe & điều chuyển':'Nhóm cơ sở Branch A QA');
        await service.saveContractTelegram(db,item.id,143,{access_role:'admin'},{action:'send',event_key:event.key,hash:event.hash,request_id:randomUUID()});
        const calls=[];
        assert.equal((await notices.dispatchContractNotifications(async(url,options)=>{
          const body=JSON.parse(options.body);assert.equal(body.chat_id,expected.chat_id);assert.equal(body.message_thread_id,expected.thread_id||undefined);calls.push(new URL(url).pathname.split('/').at(-1));
          return Response.json({ok:true,result:{message_id:800+calls.length}});
        },1,db,[item.id])).sent,1);
        assert.deepEqual(calls,['sendMessage']);
      }
      const same=(await service.readContractTelegram(db,item.id,143,{access_role:'admin'})).state;assert(same.events.every(event=>event.unchanged&&!event.can_send));
    }
    // Returns belong to the main ownership group; swaps keep branch routing.
    for(const kind of ['reservation','handover','return','battery_swap']){
      const id=randomUUID(),key=`ownership-route:${id}`;
      await c.query(`INSERT INTO ${schema}.management_contract_notifications(id,order_id,store_id,event_key,root_event_key,event_type,payload,delivery_mode,status)
        SELECT $1,900002,23,$2,$2,$3,payload,'manual','pending' FROM ${schema}.management_contract_notifications WHERE order_id=900002 AND delivery_mode='manual' LIMIT 1`,[id,key,kind]);
      const chat=['reservation','handover','return'].includes(kind)?groups[0].chat_id:'-100000000001';
      assert.equal((await notices.dispatchContractNotifications(async(_url,options)=>{assert.equal(JSON.parse(options.body).chat_id,chat);return Response.json({ok:true,result:{message_id:901}});},1,db,[900002])).sent,1);
    }
    const transferChecks=await require('./check-vehicle-transfer-telegram.cjs')(db,c,schema,notices);
    // A missing/disabled ownership route never falls back to the physical branch or the other ownership group.
    await save([{...groups[1],enabled:false}]);
    const waitId=randomUUID();
    await c.query(`INSERT INTO ${schema}.management_contract_notifications(id,order_id,store_id,event_key,root_event_key,event_type,payload,delivery_mode,status)
      SELECT $1::uuid,900002,23,$1::text,$1::text,'renewal',payload,'manual','pending' FROM ${schema}.management_contract_notifications WHERE order_id=900002 AND delivery_mode='manual' LIMIT 1`,[waitId]);
    assert.equal((await notices.dispatchContractNotifications(async()=>{throw Error('Disabled ownership route must not send');},1,db,[900002])).sent,0);
    assert.equal((await c.query(`SELECT status FROM ${schema}.management_contract_notifications WHERE id=$1`,[waitId])).rows[0].status,'awaiting_config');
    await save(groups);assert.equal((await notices.dispatchContractNotifications(async()=>{throw Error('Configuration change must not replay waiting history');},1,db,[900002])).sent,0);
    const same=(await service.readContractTelegram(db,900003,143,{access_role:'admin'})).state;assert(same.events.every(event=>event.unchanged&&!event.can_send));
    return ['Ownership rental/reservation/handover/return and renewals route to two distinct groups/topics, including ownership_cd, ownership branches and legacy drafts; ordinary rentals and battery swaps stay scoped',
      'Settings validate ownership routes, reject duplicate destinations atomically and preserve them for older clients; disabled/missing routes wait without fallback or automatic replay; sent content remains deduplicated',...transferChecks];
  }finally{Object.defineProperties(owner,descriptors);await c.query('ROLLBACK TO SAVEPOINT ownership_telegram_cases');await c.query('RELEASE SAVEPOINT ownership_telegram_cases');}
};
