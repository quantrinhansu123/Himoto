// Runs inside the integration suite's isolated PostgreSQL schema and rollback.
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {load,root}=require('./load-typescript.cjs');
const content=load(path.join(root,'lib/server/contract-notification-content'));
const telegram=load(path.join(root,'lib/server/contract-telegram'));
module.exports=async function checkContractTelegram(db,c,schema,notices){
  const admin={access_role:'admin'},reader={permissions:['contracts.read']};
  const fixture={code:'HD-QA',customer:'Bùi Đinh Thành Phát',phone:'',store:'PGD QA',actor:'QA',vehicles:'22B2-374.48',vehicle_names:'Airblade',total:'200000',at:'2026-10-17T14:00:00Z',photos:[],rental_fee:200000,days:1,deposit:1000000,grand_total:1200000,method:'CK TK cá nhân',deposit_method:'CK TK cá nhân'};
  const rental=content.contractNotificationText('rental',fixture);
  for(const line of ['Khách thuê xe: Bùi Đinh Thành Phát','Bsx: 22B2-374.48','Loại xe: Airblade','Tiền thuê xe: 200.000','Số ngày thuê: 1','Tiền cọc: 1.000.000','Tổng tiền: 1.200.000','Hình thức thanh toán: CK TK cá nhân'])assert(rental.includes(line),line);
  const returned=content.contractNotificationText('return',{...fixture,customer:'Trần Nhật Nam',vehicles:'66G1-729.63',vehicle_names:'Vision',deposit:450000,refunded:450000,method:'Tiền mặt'});
  for(const line of ['Khách trả xe: Trần Nhật Nam','Hoàn cọc: 450.000','Hình thức thanh toán: Tiền mặt'])assert(returned.includes(line));
  assert(!returned.includes('Phí sửa chữa: 0'));assert(!returned.includes('Nhân viên làm hợp đồng:'));
  assert(returned.endsWith(`Thời gian: ${new Date(fixture.at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}`));
  assert(rental.endsWith(`Thời gian: ${new Date(fixture.at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}`));
  const renewal={version:2,amount:1500000,before_return_at:'2026-11-01T10:00:00+07:00',return_at:'2026-12-01T10:00:00+07:00',license:'20H1.573.02',vehicle_name:'Wave'};
  const renewed=content.contractNotificationText('renewal',{...fixture,customer:'Đoàn Văn Dũng',renewal});
  for(const line of ['Khách gia hạn: Đoàn Văn Dũng','Loại xe: Wave','Bsx: 20H1.573.02','01/11/2026 - 01/12/2026','Phí gia hạn: 1.500.000 đ'])assert(renewed.includes(line),line);
  assert.equal(content.notificationHash('rental',fixture),content.notificationHash('rental',Object.fromEntries(Object.entries({...fixture,at:new Date().toISOString(),actor:'Other sender'}).reverse())));
  await c.query(`UPDATE ${schema}.orders SET total='200000',total_rental_fees=200000,first_deposit_amount=1000000,rent_at='2026-11-01T10:00:00+07:00',return_at='2026-11-02T10:00:00+07:00',draft_payload=$1 WHERE id=1`,[JSON.stringify({management_composer:{finalized:{contract_number:'HD-QA-1'},draft:{staff_name:'Named QA employee'},versions:[{...renewal,kind:'renewal'}]}})]);
  await c.query(`INSERT INTO ${schema}.transactions(id,order_id,name,type,value,status,user_id,store_id,cash_id,bank_id,payment_method,bank_owner_type,note) VALUES
    (9001,1,'order:rental_fees','in',200000,'approved',143,23,NULL,99,2,'personal','QA'),
    (9002,1,'order:deposit','in',1000000,'approved',143,23,NULL,99,2,'personal','QA'),
    (9003,1,'order:deposit_refund','out',450000,'approved',143,23,99,NULL,1,NULL,'QA'),
    (9004,1,'order:deposit_refund','out',999999,'pending',143,23,99,NULL,1,NULL,'QA')`);
  const snapshot=await content.notificationPayload(db,1,'rental',143,['rental']);
  assert.equal(snapshot.contract_staff,'Named QA employee');assert(content.contractNotificationText('rental',snapshot).includes('Named QA employee'));assert(!content.contractNotificationText('rental',snapshot).includes('Actor QA'));assert.equal(snapshot.grand_total,1200000);assert.equal(snapshot.days,1);assert.equal(snapshot.method,'CK TK cá nhân');
  await c.query('SAVEPOINT reservation_telegram_method');
  await c.query(`DELETE FROM ${schema}.transactions WHERE id=9002`);
  const reservationSnap=await content.notificationPayload(db,1,'reservation',143,['rental']);
  assert.equal(reservationSnap.method,'CK TK cá nhân');
  assert(content.contractNotificationText('reservation',reservationSnap).includes('Hình thức thanh toán: CK TK cá nhân'));
  assert(!content.contractNotificationText('reservation',reservationSnap).includes('Chưa ghi nhận thanh toán'));
  await c.query('ROLLBACK TO SAVEPOINT reservation_telegram_method');
  await c.query(`INSERT INTO ${schema}.staff_profiles(id,staff_code,full_name,phone,store_id,user_id,status) VALUES(990101,'QA990101','Selected employee QA','0900000091',23,143,'active')`);
  await c.query(`UPDATE ${schema}.orders SET draft_payload=jsonb_set(draft_payload::jsonb,'{management_composer,draft}','{"staff_id":"990101","staff_name":""}')::json WHERE id=1`);
  const selectedStaff=await content.notificationPayload(db,1,'rental',143,['rental']);
  assert.equal(selectedStaff.contract_staff,'Selected employee QA');assert.equal(selectedStaff.actor,'Actor QA');
  await c.query(`UPDATE ${schema}.orders SET draft_payload=jsonb_set(draft_payload::jsonb,'{management_composer,draft}','{}')::json,contract_responsible_user_id=NULL WHERE id=1`);
  const loginFallback=await content.notificationPayload(db,1,'rental',143,['rental']);
  assert.equal(loginFallback.contract_staff,'Actor QA');
  assert(content.contractNotificationText('rental',loginFallback).includes('Nhân viên làm hợp đồng: Actor QA'));
  await c.query(`UPDATE ${schema}.orders SET draft_payload=jsonb_set(COALESCE(draft_payload::jsonb,'{}'::jsonb),'{management_composer,finalized}',$1::jsonb)::json WHERE id=1`,
    [JSON.stringify({contract_number:'HD-QA-1',actor_id:143})]);
  assert.equal((await content.notificationPayload(db,1,'handover',143,['handover'])).contract_staff,'Actor QA');
  const refund=await content.notificationPayload(db,1,'return',143,['return-1001']);assert.equal(refund.refunded,450000);assert.equal(refund.method,'Tiền mặt');
  assert.equal((await content.notificationPayload(db,1,'renewal',143,['renewal-2'],renewal)).method,'');
  await c.query('SAVEPOINT linked_renewal_telegram');
  await c.query(`INSERT INTO ${schema}.transactions(id,order_id,name,type,value,status,user_id,store_id,bank_id,payment_method,bank_owner_type,note) VALUES
    (9010,1,'order:payment','in',1500000,'approved',143,23,99,2,'personal','Gia hạn hợp đồng_HD-QA-1'),
    (9011,1,'order:payment','in',1500000,'pending',143,23,99,2,'company','QA')`);
  for(const [id,payload] of [[9010,{...renewal,kind:'renewal'}],[9011,{...renewal,kind:'renewal'}]]) await c.query(`INSERT INTO ${schema}.management_contract_payments(request_id,order_id,transaction_id,actor_id,request_hash,renewal_payload) VALUES($1,1,$2,143,$3,$4)`,[randomUUID(),id,'a'.repeat(64),JSON.stringify(payload)]);
  const paidRenewal=await content.notificationPayload(db,1,'renewal',143,['renewal-2'],renewal);
  assert.equal(paidRenewal.method,'CK TK cá nhân');assert(content.contractNotificationText('renewal',paidRenewal).includes('Hình thức thanh toán: CK TK cá nhân'));
  assert.equal((await content.notificationPayload(db,1,'renewal',143,['renewal-3'],{...renewal,version:3})).method,'');
  const linkedEvents=(await telegram.readContractTelegram(db,1,143,admin)).state.events.filter(e=>e.kind==='renewal');
  assert.equal(linkedEvents.length,1);assert.equal(linkedEvents[0].key,'renewal:1:2');assert(linkedEvents[0].text.includes('CK TK cá nhân'));
  await c.query('ROLLBACK TO SAVEPOINT linked_renewal_telegram');
  await telegram.saveContractTelegram(db,1,143,admin,{action:'auto',enabled:false});
  await notices.queueContractNotification(db,1,'renewal','renewal:1:2',143,'renewal-2',renewal);
  assert.equal((await c.query(`SELECT status FROM ${schema}.management_contract_notifications WHERE event_key='renewal:1:2'`)).rows[0].status,'manual');
  let state=(await telegram.readContractTelegram(db,1,143,admin)).state;
  let event=state.events.find(e=>e.key==='renewal:1:2');assert(event.can_send);assert(!state.auto_enabled);
  assert(!event.text.includes('Hình thức thanh toán: CK TK cá nhân'));assert(event.text.includes('Chưa ghi nhận thanh toán'));
  await assert.rejects(()=>telegram.saveContractTelegram(db,1,143,reader,{action:'send',event_key:event.key,hash:event.hash,request_id:randomUUID()}),e=>e.status===403);
  await assert.rejects(()=>telegram.saveContractTelegram(db,1,143,admin,{action:'send',event_key:event.key,hash:'0'.repeat(64),request_id:randomUUID()}),e=>e.status===409);
  const photo=Buffer.from([255,216,255,224,7,1]);
  for(let i=1;i<=5;i++)await c.query(`INSERT INTO ${schema}.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by) VALUES('contracts',1,$1,'image/jpeg',$2,143)`,[`renewal-2-${i}`,Buffer.from([255,216,255,224,7,i])]);
  const stale=event;
  event=(await telegram.readContractTelegram(db,1,143,admin)).state.events.find(e=>e.key===stale.key);assert.equal(event.photo_count,5);assert.notEqual(event.hash,stale.hash);
  await assert.rejects(()=>telegram.saveContractTelegram(db,1,143,admin,{action:'send',event_key:stale.key,hash:stale.hash,request_id:randomUUID()}),e=>e.status===409);
  const command={action:'send',event_key:event.key,hash:event.hash,request_id:randomUUID()};
  await telegram.saveContractTelegram(db,1,143,admin,command);await telegram.saveContractTelegram(db,1,143,admin,command);
  assert.equal((await c.query(`SELECT id FROM ${schema}.management_contract_notifications WHERE root_event_key='renewal:1:2' AND delivery_mode='manual'`)).rowCount,1);
  // Historical outboxes can embed bytes. Verify that backwards-compatible path explicitly;
  // current outboxes intentionally store refs and hydrate the saved slot at dispatch time.
  const legacyNotice=(await c.query(`SELECT id,payload FROM ${schema}.management_contract_notifications WHERE root_event_key='renewal:1:2' AND delivery_mode='manual'`)).rows[0];
  for(const attachment of legacyNotice.payload.photos)attachment.bytes=(await c.query(`SELECT encode(data,'base64') AS bytes FROM ${schema}.management_record_photos WHERE entity_type='contracts' AND entity_id=1 AND slot=$1`,[attachment.slot])).rows[0].bytes;
  await c.query(`UPDATE ${schema}.management_contract_notifications SET payload=$2,content_hash=$3 WHERE id=$1`,[legacyNotice.id,JSON.stringify(legacyNotice.payload),content.notificationHash('renewal',legacyNotice.payload)]);
  await c.query(`UPDATE ${schema}.management_record_photos SET data=$1 WHERE slot='renewal-2-1'`,[Buffer.from([255,216,255,9])]);
  const calls=[];
  const fake=async(url,options)=>{const method=new URL(url).pathname.split('/').at(-1);calls.push(method);
    if(method==='sendMessage'){assert.equal(calls.at(-2),'sendMediaGroup');assert(JSON.parse(options.body).text.includes('Phí gia hạn: 1.500.000 đ'));return Response.json({ok:true,result:{message_id:99}});}
    assert.equal(method,'sendMediaGroup');const media=JSON.parse(options.body.get('media'));assert.equal(media.length,5);assert(!media.some(item=>item.caption));
    assert.deepEqual(Buffer.from(await options.body.get('photo0').arrayBuffer()),photo);
    return Response.json({ok:true,result:media.map((_,i)=>({message_id:i+10}))});};
  await notices.dispatchContractNotifications(fake,5,db);assert.deepEqual(calls,['sendMediaGroup','sendMessage']);
  event=(await telegram.readContractTelegram(db,1,143,admin)).state.events.find(e=>e.key==='renewal:1:2');assert(event.can_send); // changed photo
  await telegram.saveContractTelegram(db,1,143,admin,{action:'send',event_key:event.key,hash:event.hash,request_id:randomUUID()});
  await notices.dispatchContractNotifications(async()=>{throw Error('Connection ended after request');},5,db);
  event=(await telegram.readContractTelegram(db,1,143,admin)).state.events.find(e=>e.key==='renewal:1:2');assert(!event.can_send);assert.equal(event.status,'unknown');
  assert(event.can_retry_confirmed_absent);assert.equal(event.delivery_error,'TELEGRAM_NETWORK');
  const retry={action:'retry_confirmed_absent',event_key:event.key,hash:event.hash,notice_id:event.notice_id,confirmed_absent:true,request_id:randomUUID()};
  await assert.rejects(()=>telegram.saveContractTelegram(db,1,143,admin,{...retry,confirmed_absent:false}),e=>e.status===400);
  await assert.rejects(()=>telegram.saveContractTelegram(db,1,143,reader,retry),e=>e.status===403);
  await c.query(`UPDATE ${schema}.management_contract_notifications SET message_ids='[999]' WHERE id=$1`,[event.notice_id]);
  await assert.rejects(()=>telegram.saveContractTelegram(db,1,143,admin,retry),e=>e.status===409);
  await c.query(`UPDATE ${schema}.management_contract_notifications SET message_ids='[]' WHERE id=$1`,[event.notice_id]);
  await telegram.saveContractTelegram(db,1,143,admin,retry);await telegram.saveContractTelegram(db,1,143,admin,retry);
  const reviews=(await c.query(`SELECT delivery_review FROM ${schema}.management_contract_notifications WHERE id=$1`,[event.notice_id])).rows[0].delivery_review;
  assert.equal(reviews.filter(review=>review.outcome==='confirmed_absent').length,1);
  assert.equal(reviews.filter(review=>review.outcome==='delivery_failed').length,1);
  assert.equal((await c.query(`SELECT count(*)::int AS n FROM ${schema}.management_contract_notifications WHERE event_key=$1`,[`manual:1:${retry.request_id}`])).rows[0].n,1);
  assert.equal((await notices.dispatchContractNotifications(fake,1,db,[2])).sent,0);
  await notices.dispatchContractNotifications(async(url,options)=>{if(new URL(url).pathname.endsWith('/sendMessage'))return Response.json({ok:true,result:{message_id:199}});const media=JSON.parse(options.body.get('media'));assert.equal(media.length,5);assert.deepEqual(Buffer.from(await options.body.get('photo0').arrayBuffer()),Buffer.from([255,216,255,9]));return Response.json({ok:true,result:media.map((_,i)=>({message_id:i+100}))});},1,db,[1]);
  event=(await telegram.readContractTelegram(db,1,143,admin)).state.events.find(e=>e.key==='renewal:1:2');assert.equal(event.status,'sent');assert(!event.can_send);assert(!event.can_retry_confirmed_absent);
  await assert.rejects(()=>telegram.saveContractTelegram(db,1,143,admin,{action:'auto',enabled:true}),e=>e.status===400);
  await notices.queueContractNotification(db,1,'rental','qa-detailed-rental',143,'rental');
  const detailed=(await telegram.readContractTelegram(db,1,143,admin)).state.events.find(e=>e.key==='qa-detailed-rental');
  await telegram.saveContractTelegram(db,1,143,admin,{action:'send',event_key:detailed.key,hash:detailed.hash,request_id:randomUUID()});
  await notices.dispatchContractNotifications(async(url)=>Response.json({ok:true,result:new URL(url).pathname.endsWith('/sendMessage')?{message_id:22}:[{message_id:20},{message_id:21}]}),5,db);
  const same=(await telegram.readContractTelegram(db,1,143,admin)).state.events.find(e=>e.key==='qa-detailed-rental');assert(same.unchanged);assert(!same.can_send);
  await c.query(`UPDATE ${schema}.orders SET contract_number='000867' WHERE id=1`);
  const paperEvent=(await telegram.readContractTelegram(db,1,143,admin)).state.events.find(e=>e.key==='qa-detailed-rental');
  assert(paperEvent.text.includes('Hợp đồng: 000867\n'));assert(paperEvent.can_send);assert(!paperEvent.unchanged);assert.equal(paperEvent.delivery_contract_code,'HD-QA-1');
  assert.equal((await c.query(`SELECT payload->>'code' AS code FROM ${schema}.management_contract_notifications WHERE event_key='qa-detailed-rental'`)).rows[0].code,'HD-QA-1');
  // Preferences are scoped and read-only accounts cannot change them through the service.
  await assert.rejects(()=>telegram.saveContractTelegram(db,1,143,reader,{action:'auto',enabled:false}),e=>e.status===403);
  const {parsePhotoTarget,requireContractPhotoSlot}=load(path.join(root,'lib/server/record-photos'));
  assert.equal(parsePhotoTarget('contracts','1','renewal-2-5').slot,'renewal-2-5');
  await requireContractPhotoSlot(db,'contracts',1,'renewal-2-5');
  await assert.rejects(()=>requireContractPhotoSlot(db,'contracts',1,'renewal-999-1'),e=>e.status===404);
  // Historical outboxes that lost plates under vehicle RLS must show live labels again.
  await c.query(`UPDATE ${schema}.management_contract_notifications SET payload=payload||'{"vehicles":"","vehicle_names":""}'::jsonb WHERE event_key='qa-detailed-rental'`);
  const backfilled=(await telegram.readContractTelegram(db,1,143,admin)).state.events.find(e=>e.key==='qa-detailed-rental');
  assert(backfilled.text.includes('Bsx: 29B1-123.45'),backfilled.text);
  assert(backfilled.text.includes('Loại xe: Vehicle QA'),backfilled.text);
  return ['Rental, return and renewal templates match requested figures; only approved receipts identify payment/refund methods',
    'Manual mode holds automatic events; five saved photos form one immutable album followed by one summary; stale previews, duplicate clicks and ambiguous deliveries are blocked',
    'Content hashes survive JSONB key ordering; completed automatic content cannot be manually duplicated; renewal photo ownership and read-only permissions enforced',
    'Confirmed-absent retry records the operator review, rejects unconfirmed/unauthorized/partial sends, queues once and dispatches only the selected contract',
    'Telegram previews use the current paper contract number after correction while sent snapshots and delivery history remain immutable',
    'Empty vehicle labels from cross-branch RLS are backfilled when reading Telegram previews'];
};
