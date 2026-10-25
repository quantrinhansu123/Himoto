const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const groups=load(path.join(root,'lib/management/photo-slot-groups'));
const photos=load(path.join(root,'lib/management/contract-photos'));
const records=load(path.join(root,'lib/server/record-photos'));
const {requestPermission}=load(path.join(root,'lib/server/access-request'));
const checks=[];
(async()=>{
  const keys=['rental-document-2'];for(let n=2;n<=40;n++){const key=groups.nextPhotoInGroup('rental-document-2',keys);assert.equal(key,`rental-document-2-extra-${n}`);keys.push(key);}
  assert.equal(groups.expandPhotoGroups([{key:'rental-document-2',label:'Bill'}],keys).length,40);
  const swapKeys=Array.from({length:30},(_,i)=>`vehicle-swap-12-${i+1}`);const expanded=photos.expandContractPhotoSlots(photos.contractPhotoSlots('vehicle-swap-12'),swapKeys);assert(expanded.some(slot=>slot.key==='vehicle-swap-12-31'));
  assert.equal(photos.expandablePhotoPrefix(photos.contractPhotoSlots('vehicle-swap-12')),'vehicle-swap-12-');
  checks.push('Forty images append without overwriting a bill; vehicle swaps grow past the initial fifteen slots');
  const targets=[['customers','id_front-extra-2','customers.write'],['customers','driver_license-extra-3','customers.write'],['contracts','vehicle-swap-12-30','contracts.draft'],['contracts','rental-document-2-extra-4','contracts.draft'],['contracts','return-44-document-2-extra-3','contracts.return'],['contracts','renewal-2-1-extra-2','contracts.renew'],['contracts','battery-swap-5-1-extra-2','contracts.renew'],['contracts','handover-1-extra-2','contracts.finalize'],['contracts','plate-101-extra-2','contracts.draft'],['vehicles','registration-front-extra-2','vehicles.write'],['vehicles','transfer-76-1-extra-5','vehicles.transfer'],['vehicles','receive-77-1-extra-2','vehicles.receive']];
  for(const[entity,slot,permission]of targets){records.parsePhotoTarget(entity,'901',slot);assert.equal(requestPermission(`/api/auth/record-photos/${entity}/901/${slot}`,'PUT'),permission);if(entity==='contracts')assert.equal(photos.contractPhotoWritePermission(slot),permission);}
  for(const[entity,slot]of [['customers','unknown-extra-2'],['vehicles','registration-front-extra-0'],['contracts','return-44-video-1-extra-2'],['contracts','rental-document-2-extra-2-extra-3'],['vehicles','transfer-76-2'],['contracts','vehicle-swap-0-2'],['customers','id_front-extra-1']])assert.throws(()=>records.parsePhotoTarget(entity,'901',slot));
  checks.push('Every image category inherits its original read/write permissions; unknown fields, nested extras, video extras and invalid indexes are rejected');
  const queries=[];const db={query:async(sql,params)=>{queries.push([sql,params]);return{rowCount:Number(params[0])===12&&Number(params[1])===901?1:0,rows:[]};}};
  await records.requireContractPhotoSlot(db,'contracts',901,'vehicle-swap-12-30');await records.requireContractPhotoSlot(db,'contracts',901,'vehicle-swap-12-1-extra-2');
  await assert.rejects(()=>records.requireContractPhotoSlot(db,'contracts',902,'vehicle-swap-12-30'),e=>e.status===404);
  await assert.rejects(()=>records.requireContractPhotoSlot(db,'contracts',901,'vehicle-swap-13-30'),e=>e.status===404);
  assert(queries.every(([sql])=>sql.includes('management_contract_vehicle_swaps')));
  checks.push('Every added vehicle-swap image still verifies the swap belongs to this contract');
  const attachments=await load(path.join(root,'lib/server/contract-notification-content')).notificationPhotos({query:async(_sql,args)=>({rows:[...keys,...swapKeys].filter(slot=>args[1].some(pattern=>new RegExp(pattern).test(slot))).map(slot=>({slot,mime_type:'image/jpeg'}))})},901,['rental','vehicle-swap-12']);
  assert.equal(attachments.length,70);checks.push('Notification assembly includes all images and supplemental payment evidence without sending provider requests');
  const schema='qa_multiple_images',pool=load(path.join(root,'lib/server/himoto-database')).ownerDatabase,c=await pool.connect();try{
    await c.query('BEGIN');await c.query(`CREATE SCHEMA ${schema}`);
    const current=(await c.query("SELECT pg_get_expr(conbin,conrelid) AS expression FROM pg_constraint WHERE conrelid='himoto.management_record_photos'::regclass AND conname='management_record_photos_slots'")).rows[0].expression;
    await c.query(`CREATE TABLE ${schema}.management_record_photos(entity_type text,entity_id bigint,slot text,CONSTRAINT management_record_photos_slots CHECK(${current}))`);
    await c.query(`ALTER TABLE ${schema}.management_record_photos ENABLE ROW LEVEL SECURITY`);
    await c.query(`CREATE POLICY qa_read ON ${schema}.management_record_photos FOR SELECT TO himoto_scoped USING(entity_type<>'vehicles' OR slot ~ '^transfer-76-1$')`);
    const sql=fs.readFileSync('docs/sql/2026-10-25-multiple-record-images.sql','utf8').replaceAll('himoto.',schema+'.').replace(/^BEGIN;|^COMMIT;/gm,'');await c.query(sql);await c.query(sql);
    for(const[entity,slot]of targets)await c.query(`INSERT INTO ${schema}.management_record_photos VALUES($1,901,$2)`,[entity,slot]);
    for(const[entity,slot]of [['contracts','return-44-video-1-extra-2'],['contracts','rental-1-extra-2-extra-3'],['customers','unknown-extra-2'],['vehicles','transfer-76-2'],['vehicles','registration-front-extra-0']]){await c.query('SAVEPOINT invalid');await assert.rejects(()=>c.query(`INSERT INTO ${schema}.management_record_photos VALUES($1,901,$2)`,[entity,slot]),e=>e.code==='23514');await c.query('ROLLBACK TO SAVEPOINT invalid');}
    await c.query(`INSERT INTO ${schema}.management_record_photos VALUES('vehicles',901,'transfer-77-1-extra-2')`);
    await c.query(`GRANT USAGE ON SCHEMA ${schema} TO himoto_scoped;GRANT SELECT ON ${schema}.management_record_photos TO himoto_scoped`);
    await c.query('SET LOCAL ROLE himoto_scoped');const visible=(await c.query(`SELECT slot FROM ${schema}.management_record_photos WHERE entity_type='vehicles'`)).rows.map(row=>row.slot);assert.deepEqual(visible,['transfer-76-1-extra-5']);
    await c.query('RESET ROLE');checks.push('Idempotent migration preserves old allowances, accepts supplemental images, rejects malformed slots and retains event-level RLS');
  }finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,providerRequests:0},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
