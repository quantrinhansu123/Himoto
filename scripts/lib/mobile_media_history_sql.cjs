const assert=require('node:assert/strict'),path=require('node:path');
const {randomUUID}=require('node:crypto'),{NextRequest}=require('next/server'),cloudinary=require('cloudinary').v2;
module.exports=async function historyMedia({pg,load,root,user,checks}) {
  const media=load(path.join(root,'lib/server/mobile-record-media')),video=load(path.join(root,'lib/server/mobile-record-video-write')),images=load(path.join(root,'lib/server/mobile-record-media-write')),dto=load(path.resolve('shared/mobile-record-media'));
  await pg.exec(`ALTER TABLE himoto.orders ADD COLUMN IF NOT EXISTS draft_payload jsonb DEFAULT '{}',ADD COLUMN IF NOT EXISTS order_status text DEFAULT 'renting';
    CREATE TABLE himoto.management_contract_notifications(order_id bigint,payload jsonb,event_key text,root_event_key text);
    CREATE TABLE himoto.management_contract_payments(transaction_id bigint PRIMARY KEY,order_id bigint,renewal_payload jsonb,amount numeric);
    CREATE TABLE himoto.management_contract_battery_swaps(id bigint PRIMARY KEY,order_id bigint,note text);
    GRANT SELECT,INSERT,UPDATE,DELETE ON himoto.management_contract_notifications,himoto.management_contract_payments,himoto.management_contract_battery_swaps TO himoto_scoped;
    INSERT INTO himoto.management_contract_notifications VALUES(101,'{"renewal":{"version":5}}','renewal:101:5',NULL),(101,'{}','retry:notice','renewal:101:7');
    INSERT INTO himoto.management_contract_payments SELECT n,101,'{"version":9}',12345 FROM generate_series(501,527) n;
    INSERT INTO himoto.management_contract_payments VALUES(999,102,'{"version":20}',100);
    INSERT INTO himoto.management_contract_battery_swaps VALUES(601,101,'QA swap'),(602,102,'foreign');
    UPDATE himoto.orders SET deleted_at=NULL,draft_payload='{"management_composer":{"versions":[{"kind":"original","version":1},{"kind":"renewal","version":"2"}]}}' WHERE id=101;`);
  const request=(page=1)=>new NextRequest('https://fixture.invalid/history?page='+page);
  const first=await media.readMobileMediaHistoryTargets(user,'101',request()),second=await media.readMobileMediaHistoryTargets(user,'101',request(2));
  assert(dto.isMobileMediaTargets(first)&&dto.isMobileMediaTargets(second));assert(first.hasMore&&!second.hasMore);assert.equal(first.rows.length,25);assert.equal(second.rows.length,9);
  const all=[...first.rows,...second.rows];assert.equal(new Set(all.map(v=>v.kind+':'+v.referenceId)).size,34);assert.deepEqual(all.filter(v=>v.kind==='renewal').map(v=>v.referenceId).sort((a,b)=>a-b),[2,3,5,7,9,10]);assert(!all.some(v=>v.referenceId===999||v.referenceId===602));
  await assert.rejects(()=>media.readMobileMediaHistoryTargets({...user,store_id:24},'101',request()),e=>e.code==='NOT_FOUND');
  const money=(await pg.query('SELECT *,xmin::text AS revision FROM himoto.management_contract_payments ORDER BY transaction_id')).rows,parent=(await pg.query('SELECT *,xmin::text AS revision FROM himoto.orders ORDER BY id')).rows;
  const saved=[];
  for(const[kind,ref,prefix]of[['renewal',2,'renewal-2'],['renewal_receipt',501,'renewal-receipt-501'],['battery_swap',601,'battery-swap-601']]) {
    const raw={entity:'contracts',id:'101',kind,referenceId:String(ref)},target=all.find(v=>v.kind===kind&&v.referenceId===ref);
    for(const isVideo of[false,true]) {
      const slot=prefix+(isVideo?'-video-1':'-document-2-extra-2'),info=await media.readMobileMediaSlotInfo(user,raw,slot,new NextRequest('https://fixture.invalid/slot'));
      assert.equal(info.target.snapshot,target.snapshot);const key=randomUUID(),public_id=`himoto/management-video/7/${key}`,cloud={public_id,version:1,resource_type:'video',signature:cloudinary.utils.api_sign_request({public_id,version:1},process.env.CLOUDINARY_API_SECRET)};
      const headers={'Content-Type':isVideo?'application/json':'image/jpeg','Idempotency-Key':key,'X-Record-Revision':info.target.revision,'X-Reference-Revision':info.target.referenceRevision,'X-Media-Snapshot':info.target.snapshot,'X-Photo-Revision':'0'};
      const req=new NextRequest('https://fixture.invalid/save',{method:'PUT',headers,body:isVideo?JSON.stringify(cloud):Buffer.from([255,216,255,1])});
      const proof=isVideo?await video.uploadMobileRecordVideo(user,raw,slot,req):await images.uploadMobileRecordMedia(user,raw,slot,req);assert(proof.current&&proof.referenceCurrent);assert.equal(proof.target.kind,kind);saved.push({key,kind,isVideo});
    }
  }
  assert.deepEqual((await pg.query('SELECT *,xmin::text AS revision FROM himoto.management_contract_payments ORDER BY transaction_id')).rows,money);assert.deepEqual((await pg.query('SELECT *,xmin::text AS revision FROM himoto.orders ORDER BY id')).rows,parent);
  checks.push('History media discovers legacy JSON plus actual notice/root-event/payment renewal numbers, both permissive next versions, receipt IDs and battery swaps in stable 25-row pages; images/extras/video use actual web slot/writers without changing order or money');
  for(const[kind,ref,prefix]of[['renewal',999,'renewal-999'],['renewal_receipt',999,'renewal-receipt-999'],['battery_swap',602,'battery-swap-602']])await assert.rejects(()=>media.readMobileMediaSlotInfo(user,{entity:'contracts',id:'101',kind,referenceId:String(ref)},prefix+'-video-1',new NextRequest('https://fixture.invalid/slot')),e=>e.code==='NOT_FOUND');
  assert(!dto.isMobileMediaSlot({entity:'contracts',id:101,kind:'battery_swap',referenceId:601},'battery-swap-601-video-2'));
  await pg.exec('UPDATE himoto.management_contract_payments SET renewal_payload=NULL WHERE transaction_id=501;DELETE FROM himoto.management_contract_battery_swaps WHERE id=601;');
  for(const row of saved.filter(v=>v.kind!=='renewal')) {const proof=(await(row.isVideo?video.readMobileVideoReceipt(user,row.key):images.readMobileMediaReceipt(user,row.key))).receipt;assert(proof.parentCurrent&&!proof.referenceCurrent&&proof.photoCurrent&&!proof.current);}
  await pg.exec("UPDATE himoto.orders SET draft_payload='{}',order_status='draft' WHERE id=101");
  for(const row of saved.filter(v=>v.kind==='renewal')) {const proof=(await(row.isVideo?video.readMobileVideoReceipt(user,row.key):images.readMobileMediaReceipt(user,row.key))).receipt;assert(!proof.parentCurrent&&!proof.referenceCurrent&&proof.photoCurrent);}
  checks.push('Cross-contract/unknown history and extra battery video slots reject; later receipt removal, swap deletion and parent edits preserve original actor proof while independently marking reference/parent stale');
};
