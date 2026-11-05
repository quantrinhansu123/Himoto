// Actual photo policies and shared parsers in an isolated PostgreSQL transport.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {NextRequest}=require('next/server');
module.exports=async function recordMediaSql({pg,load,root,user,checks,failReceipt,loseResponse}) {
  const sql=name=>fs.readFileSync(path.resolve(root,'../docs/sql/'+name),'utf8');
  const api=load(path.join(root,'lib/server/mobile-record-media'));
  await pg.exec("ALTER TABLE himoto.customers ADD COLUMN IF NOT EXISTS store_id bigint;"+
    "GRANT SELECT ON himoto.customers TO himoto_scoped;"+
    "DROP POLICY branch_photos ON himoto.management_record_photos;"+
    "CREATE POLICY management_scoped_gate ON himoto.management_record_photos TO himoto_scoped USING(true) WITH CHECK(true);");
  // This shared fixture already contains valid later supplemental bill slots.
  // Install the old intermediate CHECK without validating later rows against
  // the superseded grammar; the 25/10 migration below validates the final CHECK.
  await pg.exec(sql('2026-10-19-vehicle-swap-photo.sql').replace(/(ADD CONSTRAINT management_record_photos_slots CHECK\([\s\S]*?)\);/,'$1) NOT VALID;'));
  // Apply the real transfer-photo extension without replacing the newer
  // cancel/ownership helper functions which have already run in this suite.
  const photoPolicy=sql('2026-10-24-global-vehicle-transfers.sql').match(/DO \$\$[\s\S]*?END \$\$;/)[0];
  await pg.exec(photoPolicy);
  await pg.exec(sql('2026-10-25-multiple-record-images.sql'));
  await pg.exec(sql('2026-11-02-mobile-record-media.sql'));
  assert.equal((await pg.query("SELECT convalidated FROM pg_constraint WHERE conrelid='himoto.management_record_photos'::regclass AND conname='management_record_photos_slots'")).rows[0].convalidated,true);
  const who={...user,access_role:'custom',permissions:['contracts.read','vehicles.read']};
  const raw=(entity,id,kind,referenceId)=>({entity,id:String(id),kind,referenceId:String(referenceId)});
  const req=(query='')=>new NextRequest('https://fixture.invalid/media'+query);
  const read=(target,page=1,actor=who)=>api.readMobileRecordMedia(actor,target,req('?page='+page));
  const image=(target,slot,revision,actor=who)=>api.readMobileRecordMediaImage(actor,target,slot,req('?revision='+revision));
  const jpeg=Buffer.from([255,216,255,0]);
  await pg.exec("INSERT INTO himoto.orders(id,contract_number,order_status,store_id,order_type,total,draft_payload) VALUES"+
    "(290001,'MEDIA-LOCAL','renting',23,'rental','500000','{}'),(290002,'MEDIA-FOREIGN','renting',24,'rental','500000','{}');"+
    "INSERT INTO himoto.vehicles(id,name,license,status,store_id,current_store_id) VALUES"+
    "(290011,'Xe media QA','QA-MEDIA-OLD','using',24,24),(290012,'Xe media mới','QA-MEDIA-NEW','ready',24,24);"+
    "INSERT INTO himoto.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,completed_at) VALUES"+
    "(290021,290001,290011,now()-interval '1 day',now()+interval '1 day',NULL),"+
    "(290022,290001,290012,now()-interval '2 days',now()-interval '1 day',now()),"+
    "(290023,290002,290011,now()-interval '1 day',now()+interval '1 day',NULL);"+
    "INSERT INTO himoto.management_contract_vehicle_swaps(id,order_id,order_item_id,from_vehicle_id,to_vehicle_id,actor_id) VALUES"+
    "(290031,290001,290021,290011,290012,7),(290032,290002,290023,290011,290012,8);"+
    "INSERT INTO himoto.vehicle_location_events(id,vehicle_id,event_type,from_store_id,to_store_id,created_by,created_at) VALUES"+
    "(290041,290011,'manual_transfer',24,31,8,now()),(290042,290011,'manual_transfer_receive',24,31,8,now()),"+
    "(290043,290012,'manual_transfer',24,31,8,now()),(290044,290011,'manual_transfer_cancel',24,31,8,now());");
  async function photo(entity,id,slot,type='image/jpeg',data=jpeg,extra={}) {
    await pg.query('INSERT INTO himoto.management_record_photos(entity_type,entity_id,slot,mime_type,data,updated_by,cloudinary_public_id,cloudinary_cloud_name,cloudinary_version,object_key) '+
      'VALUES($1,$2,$3,$4,$5,7,$6,$7,$8,$9)',[entity,id,slot,type,data,extra.publicId??null,extra.cloud??null,extra.version??null,extra.objectKey??null]);
  }
  for(let i=1;i<=28;i++)await photo('contracts',290001,'return-290021-'+i);
  await photo('contracts',290001,'return-290021-1-extra-2');
  await photo('contracts',290001,'return-290021-document-2');
  await photo('contracts',290001,'return-290021-video-1','video/mp4',null,{objectKey:'PRIVATE-STORAGE-KEY'});
  await photo('contracts',290001,'return-290021-29','image/webp',null,{publicId:'PRIVATE-CLOUD-ID',cloud:'PRIVATE-CLOUD',version:1});
  await photo('contracts',290001,'return-290021-30','image/png',Buffer.alloc(2*1024*1024+1));
  await photo('contracts',290001,'return-290022-1');await photo('contracts',290002,'return-290023-1');
  await photo('contracts',290001,'vehicle-swap-290031-18-extra-2');
  await photo('vehicles',290011,'transfer-290041-1');await photo('vehicles',290011,'transfer-290041-1-extra-2');
  await photo('vehicles',290011,'receive-290042-1');await photo('vehicles',290012,'transfer-290043-1');
  const returned=raw('contracts',290001,'return',290021),swap=raw('contracts',290001,'swap',290031),transfer=raw('vehicles',290011,'transfer',290041),received=raw('vehicles',290011,'receive',290042);
  async function state(){
    const result={};
    for(const table of ['orders','order_vehicle_details','vehicles','vehicle_location_events','management_contract_vehicle_swaps','transactions','management_contract_payments','management_mobile_requests',
      'management_mobile_bills','management_mobile_returns','management_mobile_swaps','management_mobile_vehicle_transfers','management_mobile_recoveries','management_mobile_record_media'])
      result[table]=(await pg.query('SELECT row_to_json(t) AS row,xmin::text AS revision FROM himoto.'+table+' t ORDER BY row_to_json(t)::text')).rows;
    result.photos=(await pg.query('SELECT entity_type,entity_id,slot,mime_type,md5(data) AS digest,updated_at,cloudinary_public_id,cloudinary_cloud_name,object_key,xmin::text AS revision '+
      'FROM himoto.management_record_photos ORDER BY entity_type,entity_id,slot')).rows;
    result.sequences={};
    for(const seq of (await pg.query("SELECT relname FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='himoto' AND relkind='S' ORDER BY relname")).rows)
      result.sequences[seq.relname]=(await pg.query('SELECT last_value,is_called FROM himoto.'+seq.relname)).rows;
    return result;
  }
  const before=await state(),p1=await read(returned),p2=await read(returned,2);
  assert.equal(p1.rows.length,25);assert(p1.hasMore);assert(!p2.hasMore);assert.equal(p2.rows.length,8);
  const rows=[...p1.rows,...p2.rows];assert.equal(new Set(rows.map(r=>r.slot)).size,33);assert(rows.every(r=>r.slot.startsWith('return-290021-')));
  assert.equal(p1.slots.length,33);assert(p1.target.label.includes('QA-MEDIA-OLD'));assert(!p1.target.label.includes('QA-MEDIA-NEW'));
  assert(rows.find(r=>r.slot==='return-290021-1-extra-2').readable);
  const video=rows.find(r=>r.slot==='return-290021-video-1');assert(video.kind==='video'&&!video.readable&&video.blockedReason);
  assert(rows.find(r=>r.slot==='return-290021-29').readable);assert(!rows.find(r=>r.slot==='return-290021-30').readable);
  assert(!JSON.stringify([p1,p2]).includes('PRIVATE-'));assert.deepEqual(await state(),before);
  checks.push('Record media executes actual photo constraints/RLS: 25-row paging retains all 33 exact-line photos including extras and document/video metadata, foreign stock label, bounded-image gates and no private storage fields or row/xmin/sequence mutation');
  const targets=await api.readMobileMediaTargets(who,{entity:'contracts',id:'290001'},req('?page=1'));
  assert.deepEqual(targets.rows.map(r=>r.kind+':'+r.referenceId).sort(),['return:290021','return:290022','swap:290031']);
  assert.equal(targets.rows.find(r=>r.referenceId===290021).snapshot,p1.target.snapshot);
  const targetVehicle=await api.readMobileMediaTargets(who,{entity:'vehicles',id:'290011'},req());
  assert.deepEqual(targetVehicle.rows.map(r=>r.kind+':'+r.referenceId).sort(),['receive:290042','transfer:290041']);
  const exact=await api.readMobileMediaSlotInfo(who,returned,'return-290021-1',req());assert.equal(exact.photo.slot,'return-290021-1');assert.equal(exact.nextSlot,'return-290021-1-extra-3');
  const empty=await api.readMobileMediaSlotInfo(who,returned,'return-290021-1-extra-3',req());assert.equal(empty.photo,null);assert.equal(empty.target.snapshot,exact.target.snapshot);
  assert.deepEqual(await state(),before);
  checks.push('Media discovery binds scoped line/saved swap or exact send/receive targets with the same stable review snapshots; exact slot metadata and next supplementary position come from the whole group rather than one gallery page, with no row/sequence changes');
  const completed=await read(raw('contracts',290001,'return',290022));assert.equal(completed.rows.length,1);
  const swapped=await read(swap);assert.equal(swapped.rows[0].slot,'vehicle-swap-290031-18-extra-2');assert.equal(swapped.slots.length,15);
  const otherActor=await read(returned,1,{...who,id:8});assert.deepEqual(otherActor.rows,p1.rows);
  for(const target of [raw('contracts',290001,'return',290023),raw('contracts',290002,'return',290023),raw('contracts',290001,'swap',290032),raw('contracts',290002,'swap',290032)])
    await assert.rejects(()=>read(target),e=>e.code==='NOT_FOUND');
  await assert.rejects(()=>read(returned,1,{...who,permissions:[]}),e=>e.code==='FORBIDDEN');
  assert.equal((await read(raw('contracts',290002,'return',290023),1,{...who,scope_all:true})).rows.length,1);
  await assert.rejects(()=>read(returned,1,{...who,store_id:24}),e=>e.code==='NOT_FOUND');assert.deepEqual(await state(),before);
  checks.push('Return preparation and completed lines, saved exact swap and second actor share current scoped media; cross-parent line/swap IDs and foreign contracts remain hidden, HQ scope is explicit and contract/financial grants are not widened');
  const sent=await read(transfer),receivedPhotos=await read(received);assert.equal(sent.rows.length,2);assert.equal(receivedPhotos.rows.length,1);
  assert(sent.rows.some(r=>r.slot.endsWith('-extra-2')));assert(receivedPhotos.rows.every(r=>r.slot==='receive-290042-1'));
  for(const target of [raw('vehicles',290011,'receive',290041),raw('vehicles',290011,'transfer',290042),raw('vehicles',290011,'transfer',290043),raw('vehicles',290011,'transfer',290044)])
    await assert.rejects(()=>read(target),e=>e.code==='NOT_FOUND');
  await api.withMobileMedia(who,{entity:'vehicles',id:290011,kind:'transfer',referenceId:290041},async db=>{
    assert.equal((await db.query('SELECT id FROM himoto.vehicles WHERE id=290012')).rowCount,0);
    assert.equal((await db.query("SELECT slot FROM himoto.management_record_photos WHERE entity_type='vehicles' AND entity_id=290012")).rowCount,0);
    assert.equal((await db.query('SELECT id FROM himoto.orders WHERE id=290002')).rowCount,0);
    const scope=(await db.query("SELECT current_setting('himoto.scope_all') AS all_stores,current_setting('himoto.operation') AS operation,current_setting('himoto.transfer_vehicle_id') AS pinned")).rows[0];
    assert.deepEqual(scope,{all_stores:'false',operation:'transfer',pinned:'290011'});
  });
  assert.deepEqual(await state(),before);
  checks.push('Global transfer-photo read uses the real pinned transfer entitlement and supplemental slot policy; exact send/receive event type is enforced while unrelated foreign stock/photos/contracts stay inaccessible with scope_all false');
  const first=rows.find(r=>r.slot==='return-290021-1'),loaded=await image(returned,first.slot,first.revision);
  assert.deepEqual(Buffer.from(loaded.data),jpeg);assert.equal(loaded.mimeType,'image/jpeg');
  await assert.rejects(()=>image(returned,first.slot,'1'),e=>e.code==='MEDIA_REVIEW_REQUIRED');
  await assert.rejects(()=>image(returned,'return-290022-1',first.revision),e=>e.code==='INVALID_MEDIA_TARGET');
  await assert.rejects(()=>image(returned,'return-290021-999',first.revision),e=>e.code==='NOT_FOUND');
  await assert.rejects(()=>api.withMobileMedia(who,{entity:'contracts',id:290001,kind:'return',referenceId:290021},db=>db.query("UPDATE himoto.orders SET total='1' WHERE id=290001")),e=>e.code==='25006');
  await assert.rejects(()=>api.withMobileMedia(who,{entity:'contracts',id:290001,kind:'return',referenceId:290021},db=>db.query("SELECT nextval('himoto.transactions_id_seq')")),e=>e.code==='25006');
  assert.deepEqual(await state(),before);
  checks.push('Exact-revision authenticated image read returns original inline bytes; stale/missing/cross-line reads fail, and PostgreSQL rejects accidental operational writes or nextval in media read-only transactions with every row/sequence unchanged');
  await require('./mobile_record_media_write_sql.cjs')({pg,load,root,who,checks,read,raw,state,failReceipt,loseResponse});
  await pg.query("UPDATE himoto.management_record_photos SET data=$1,updated_at=now() WHERE entity_type='contracts' AND entity_id=290001 AND slot=$2",[Buffer.from([255,216,255,1]),first.slot]);
  await assert.rejects(()=>image(returned,first.slot,first.revision),e=>e.code==='MEDIA_REVIEW_REQUIRED');
  const fresh=await read(returned);assert.notEqual(fresh.rows.find(r=>r.slot===first.slot).revision,first.revision);
  await pg.query('UPDATE himoto.order_vehicle_details SET deleted_at=now() WHERE id=290021');
  await assert.rejects(()=>read(returned),e=>e.code==='NOT_FOUND');
  await pg.query('UPDATE himoto.orders SET deleted_at=now() WHERE id=290001');
  await assert.rejects(()=>read(swap),e=>e.code==='NOT_FOUND');
  await pg.query('UPDATE himoto.vehicles SET deleted_at=now() WHERE id=290011');
  await assert.rejects(()=>read(transfer),e=>e.code==='NOT_FOUND');
  checks.push('Later photo replacement invalidates the old image revision; deleted return line, archived parent contract and archived transfer stock block new media reads without resetting any existing proof or media row');
};
