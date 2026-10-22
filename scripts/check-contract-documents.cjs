// Called by the integration suite inside its isolated schema and rollback.
const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
module.exports=async function checkDocuments(db,c,schema,notices){
  const {contractDocumentSlots,contractEvidenceSlots}=load(path.join(root,'lib/management/contract-photos'));
  const {notificationPhotos,notificationHash,hydrateNotificationPhotos}=load(path.join(root,'lib/server/contract-notification-content'));
  const {parsePhotoTarget,requireContractPhotoSlot}=load(path.join(root,'lib/server/record-photos'));
  const {requestPermission}=load(path.join(root,'lib/server/access-request'));
  const {copyContractCustomerPhotos}=load(path.join(root,'lib/server/contract-customer-photos'));
  assert.equal(contractDocumentSlots('rental').length,15); // initial placeholders, never an upload cap
  assert.deepEqual(contractEvidenceSlots('rental').map(slot=>slot.key),['rental-document-1','rental-document-2']);
  assert.equal(contractEvidenceSlots('rental')[0].label,'Hợp đồng đã ký');
  assert.equal(contractEvidenceSlots('rental')[1].label,'Bill chuyển khoản / tổng tiền mặt');
  assert.equal(contractEvidenceSlots('return-101').length,3);
  for(const slot of ['rental-document-50','handover-document-100','return-1001-document-15','renewal-2-document-1','renewal-receipt-9001-document-15','customer-id-front','customer-id-back','customer-driver-license'])parsePhotoTarget('contracts','1',slot);
  for(const slot of ['rental-document-0','rental-document-00','return-0-document-1','return-1001-document-00'])assert.throws(()=>parsePhotoTarget('contracts','1',slot));
  assert.equal(requestPermission('/api/auth/record-photos/contracts/1/return-1001-document-15','PUT'),'contracts.return');
  assert.equal(requestPermission('/api/auth/record-photos/contracts/1/return-1001-document-15','DELETE'),'contracts.return');
  assert.equal(requestPermission('/api/auth/record-photos/contracts/1/return-1001-document-50','PUT'),'contracts.return');
  assert.equal(requestPermission('/api/auth/record-photos/contracts/1/handover-50','PUT'),'contracts.finalize');
  assert.equal(requestPermission('/api/auth/record-photos/contracts/1/renewal-2-document-50','PUT'),'contracts.renew');
  assert.equal(requestPermission('/api/auth/record-photos/contracts/1/handover-document-1','PUT'),'contracts.finalize');
  assert.equal(requestPermission('/api/auth/record-photos/contracts/1/renewal-receipt-9001-document-15','PUT'),'contracts.renew');
  assert.equal(requestPermission('/api/auth/record-photos/contracts/1','POST'),'contracts.draft');
  await requireContractPhotoSlot(db,'contracts',1,'return-1001-document-15');
  await assert.rejects(()=>requireContractPhotoSlot(db,'contracts',2,'return-1001-document-15'),e=>e.status===404);
  await assert.rejects(()=>requireContractPhotoSlot(db,'contracts',1,'renewal-999-document-15'),e=>e.status===404);
  await assert.rejects(()=>requireContractPhotoSlot(db,'contracts',1,'renewal-receipt-999-document-15'),e=>e.status===404);
  const {nextRenewalVersion,hasRenewalVersion}=load(path.join(root,'lib/management/contract-renewals'));
  assert.equal(nextRenewalVersion(null),2);
  assert.equal(nextRenewalVersion([{kind:'renewal',version:'2'},{kind:'other',version:9}]),3);
  assert.equal(nextRenewalVersion([{kind:'renewal',version:2},{kind:'renewal',version:5}]),6);
  assert(hasRenewalVersion([{kind:'renewal',version:'4'}],4));
  assert(!hasRenewalVersion([{kind:'renewal',version:4}],5));
  await requireContractPhotoSlot(db,'contracts',1,'renewal-2-document-1');
  await c.query(`INSERT INTO ${schema}.customers(id,name,phone,id_card) VALUES(990001,'Document QA','0900000000','QA-PASS')`);
  await c.query(`UPDATE ${schema}.orders SET customer_id=990001 WHERE id=1`);
  const source=Buffer.from([255,216,255,224,33]),changed=Buffer.from([255,216,255,224,44]);
  const insert=async(entity,id,slot,bytes)=>c.query(`INSERT INTO ${schema}.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by) VALUES($1,$2,$3,'image/jpeg',$4,143) ON CONFLICT(entity_type,entity_id,slot) DO UPDATE SET data=EXCLUDED.data`,[entity,id,slot,bytes]);
  for(const [i,slot] of ['id_front','id_back','driver_license'].entries())await insert('customers',990001,slot,Buffer.concat([source,Buffer.from([i+1])]));
  assert.equal((await copyContractCustomerPhotos(db,1,143)).copied,3);
  await insert('customers',990001,'id_front',changed);
  assert.equal((await copyContractCustomerPhotos(db,1,143)).copied,0);
  const copy=(await hydrateNotificationPhotos(db,1,await notificationPhotos(db,1,['rental']))).find(photo=>photo.slot==='customer-id-front');
  assert.equal(copy.bytes,Buffer.concat([source,Buffer.from([1])]).toString('base64'));
  await insert('contracts',1,'driver-license',Buffer.concat([source,Buffer.from([3])]));
  for(let i=1;i<=35;i++)await insert('contracts',1,`rental-document-${i}`,Buffer.concat([source,Buffer.from([10+i])]));
  await insert('contracts',1,'plate-101',Buffer.concat([source,Buffer.from([99])]));
  await insert('contracts',1,'rental-16',Buffer.concat([source,Buffer.from([100])]));
  await insert('contracts',1,'handover-document-1',changed);
  await insert('contracts',1,'return-1001-document-1',changed);
  await c.query('SAVEPOINT invalid_document');await assert.rejects(()=>insert('contracts',1,'rental-document-0',source),e=>e.code==='23514');await c.query('ROLLBACK TO SAVEPOINT invalid_document');
  const photos=await notificationPhotos(db,1,['rental']);
  assert.equal(photos.filter(p=>p.slot.includes('-document-')).length,35);
  assert(photos.some(p=>p.slot==='customer-id-front'));assert(photos.some(p=>p.slot==='customer-id-back'));assert(photos.some(p=>p.slot==='driver-license'));
  assert(photos.some(p=>p.slot==='customer-driver-license')); // Independent legacy slots have independent refs.
  assert(!photos.some(p=>p.slot.startsWith('handover-')||p.slot.startsWith('return-')));
  assert.deepEqual((await notificationPhotos(db,1,['return-1001'])).map(p=>p.slot),['return-1001-document-1']);
  assert(photos.findIndex(p=>p.slot==='rental-document-2')<photos.findIndex(p=>p.slot==='rental-document-10'));
  const beforeHash=notificationHash('rental',{photos:await hydrateNotificationPhotos(db,1,photos)});
  // Finalization must import missing customer documents even if the UI import
  // was skipped. Already copied identity photos must keep their old bytes.
  await c.query(`DELETE FROM ${schema}.management_record_photos WHERE entity_type='contracts' AND entity_id=1 AND slot='customer-id-back'`);
  await notices.queueContractNotification(db,1,'rental','qa-documents',143,'rental');
  const queued=(await c.query(`SELECT payload FROM ${schema}.management_contract_notifications WHERE event_key='qa-documents'`)).rows[0].payload;
  assert(queued.photos.some(p=>p.slot==='customer-id-back'));
  assert.equal(queued.photos.find(p=>p.slot==='customer-id-front').bytes,null);
  assert.equal((await hydrateNotificationPhotos(db,1,queued.photos)).find(p=>p.slot==='customer-id-front').bytes,Buffer.concat([source,Buffer.from([1])]).toString('base64'));
  await insert('contracts',1,'rental-document-1',changed);
  assert.notEqual(notificationHash('rental',{photos:await hydrateNotificationPhotos(db,1,await notificationPhotos(db,1,['rental']))}),beforeHash);
  assert.equal(queued.photos.find(p=>p.slot==='rental-document-1').bytes,null);
  assert.equal((await hydrateNotificationPhotos(db,1,queued.photos)).find(p=>p.slot==='rental-document-1').bytes,changed.toString('base64'));
  const {randomUUID}=require('node:crypto'),service=load(path.join(root,'lib/server/contract-telegram')),admin={access_role:'admin'};
  const event=(await service.readContractTelegram(db,1,143,admin)).state.events.find(e=>e.key==='qa-documents');
  await service.saveContractTelegram(db,1,143,admin,{action:'send',event_key:event.key,hash:event.hash,request_id:randomUUID()});
  const batches=[],methods=[];
  await notices.dispatchContractNotifications(async(url,options)=>{
    const method=new URL(url).pathname.split('/').at(-1);methods.push(method);if(method==='sendMessage'){assert.equal(batches.reduce((sum,n)=>sum+n,0),event.photo_count);return Response.json({ok:true,result:{message_id:300}});}if(method==='sendPhoto'){batches.push(1);return Response.json({ok:true,result:{message_id:299}});}assert.equal(method,'sendMediaGroup');
    const media=JSON.parse(options.body.get('media'));batches.push(media.length);
    assert(media.length>=2&&media.length<=10);assert(media.every(item=>!item.caption));
    return Response.json({ok:true,result:media.map((_,i)=>({message_id:200+i}))});
  },5,db);
  assert.equal(batches.reduce((sum,n)=>sum+n,0),event.photo_count);
  assert.equal(methods.at(-1),'sendMessage');assert.equal(methods.filter(method=>method==='sendMessage').length,1);
  assert.equal(queued.photos.length,43); // 3 vehicle + 35 additional + 1 plate + 4 identity slots
  const database=load(path.join(root,'lib/server/himoto-database')).himotoPool;
  const session=load(path.join(root,'lib/server/management-session')),savedUser=session.userFromSession,descriptor=Object.getOwnPropertyDescriptor(database,'connect');
  let user={id:143,access_role:'branch_staff',store_id:23,scope_all:false,permissions:['contracts.read','contracts.draft']};
  try {
    Object.defineProperty(database,'connect',{configurable:true,value:async()=>({release(){},query:async(sql,params)=>{
      if(sql==='BEGIN')return c.query('SAVEPOINT qa_import_request');
      if(sql==='COMMIT')return c.query('RELEASE SAVEPOINT qa_import_request');
      if(sql==='ROLLBACK')return c.query('ROLLBACK TO SAVEPOINT qa_import_request');
      return db.query(sql,params);
    }})});
    session.userFromSession=async()=>user;
    const route=load(path.join(root,'app/api/auth/record-photos/[entity]/[id]/route')),{NextRequest}=require('next/server');
    const request=(id=1,origin='http://localhost')=>route.POST(new NextRequest(`http://localhost/api/auth/record-photos/contracts/${id}`,{method:'POST',headers:{Origin:origin}}),{params:Promise.resolve({entity:'contracts',id:String(id)})});
    const authorized=await request();assert.equal(authorized.status,200);assert.equal((await authorized.json()).data.copied,0);
    assert.equal((await request(999999)).status,404);
    assert.equal((await request(1,'https://example.invalid')).status,403);
    user={...user,permissions:['contracts.read']};assert.equal((await request()).status,403);
    user=null;assert.equal((await request()).status,401);
  } finally {Object.defineProperty(database,'connect',descriptor);session.userFromSession=savedUser;}
  return ['More than 15 photos are accepted, saved, reopened and selected with phase-specific permissions and ownership; malformed slots are rejected',
    'CCCD/passport/licence copies are idempotent snapshots; later source edits preserve contract images; independent legacy licence slots stay available',
    'One explicit Submit sends 43 vehicle, document, plate and identity images in albums of at most 10; other phases stay isolated and current outboxes hydrate saved refs at dispatch time',
    'Actual identity-import API returns 200/404 appropriately and rejects unsigned, read-only and cross-origin requests with 401/403; all writes remain inside QA rollback'];
};
