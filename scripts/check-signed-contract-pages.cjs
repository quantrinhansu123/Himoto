const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const{load,root}=require('./lib/load-typescript.cjs');
const photos=load(path.join(root,'lib/management/contract-photos'));
const{parsePhotoTarget}=load(path.join(root,'lib/server/record-photos'));
const{requestPermission}=load(path.join(root,'lib/server/access-request'));
const checks=[];
(async()=>{
  const original=['rental-document-1','rental-document-2','rental-1'];const keys=[...original];
  for(let i=2;i<=8;i++){const key=photos.nextSignedContractPhotoSlot(keys);assert.equal(key,`rental-signed-${i}`);keys.push(key);}
  assert.deepEqual(keys.slice(0,3),original);assert.equal(photos.nextSignedContractPhotoSlot([]),'rental-document-1');
  const expanded=photos.expandSignedContractPhotoSlots(photos.contractEvidenceSlots('rental'),keys);
  assert.equal(expanded.length,9);assert.equal(expanded.at(-1).key,'rental-document-2');
  assert.deepEqual(photos.expandSignedContractPhotoSlots([{key:'return-1-document-1',label:'Return'}],keys),[{key:'return-1-document-1',label:'Return'}]);
  checks.push('Eight signed pages coexist with the original first page, payment bill and vehicle photo; return evidence stays separate');
  for(const key of keys.filter(photos.isSignedContractPhoto)){
    parsePhotoTarget('contracts','901',key);assert.equal(photos.contractPhotoWritePermission(key),'contracts.draft');
    assert.equal(requestPermission(`/api/auth/record-photos/contracts/901/${key}`,'PUT'),'contracts.draft');
    assert.equal(photos.contractPhotoDeletePermission(key),'contracts.read');
  }
  for(const key of ['rental-signed-0','rental-signed--2','rental-signed-2x','return-1-signed-2'])assert.throws(()=>parsePhotoTarget('contracts','901',key));
  assert.match(photos.contractPhotoLabel('rental-signed-4'),/Hợp đồng đã ký · Trang 4/);
  checks.push('Page labels, API validation, write scope and delete permission match signed contract evidence');
  let queryPatterns;
  const{notificationPhotos}=load(path.join(root,'lib/server/contract-notification-content'));
  const attachments=await notificationPhotos({query:async(sql,params)=>{queryPatterns=params[1];return{rows:keys.filter(key=>queryPatterns.some(pattern=>new RegExp(pattern).test(key))).map(slot=>({slot,mime_type:'image/jpeg',bytes:slot}))};}},901,['rental']);
  assert(keys.every(key=>attachments.some(photo=>photo.slot===key)));
  checks.push('Explicit whole-contract delivery includes every signed page along with bill and vehicle evidence');
  const db=load(path.join(root,'lib/server/himoto-database')).ownerDatabase,c=await db.connect();
  try{
    await c.query('BEGIN');
    const current=(await c.query("SELECT pg_get_expr(conbin,conrelid) AS expression FROM pg_constraint WHERE conrelid='himoto.management_record_photos'::regclass AND conname='management_record_photos_slots'")).rows[0].expression;
    await c.query(`CREATE TEMP TABLE qa_signed_pages(entity_type text,slot text,CONSTRAINT management_record_photos_slots CHECK (${current})) ON COMMIT DROP`);
    const sql=fs.readFileSync('docs/sql/2026-10-25-signed-contract-pages.sql','utf8').replaceAll('himoto.management_record_photos','pg_temp.qa_signed_pages').replace(/^BEGIN;|^COMMIT;/gm,'');
    await c.query(sql);await c.query(sql);
    for(const [entity,slot]of [...keys.map(key=>['contracts',key]),['customers','id_front'],['vehicles','registration-front'],['contracts','return-1-document-2'],['contracts','vehicle-swap-1-1']])await c.query('INSERT INTO qa_signed_pages VALUES($1,$2)',[entity,slot]);
    for(const [entity,slot]of [['contracts','rental-signed-0'],['customers','rental-signed-2'],['vehicles','rental-signed-2'],['contracts','rental-video-4']]){
      await c.query('SAVEPOINT invalid_slot');await assert.rejects(()=>c.query('INSERT INTO qa_signed_pages VALUES($1,$2)',[entity,slot]),e=>e.code==='23514');await c.query('ROLLBACK TO SAVEPOINT invalid_slot');
    }
    const count=(await c.query("SELECT count(*)::int AS n FROM qa_signed_pages WHERE entity_type='contracts' AND (slot='rental-document-1' OR slot LIKE 'rental-signed-%')")).rows[0].n;assert.equal(count,8);
    checks.push('Idempotent TEMP migration accepts new pages, preserves every existing allowance and rejects invalid entity/slots');
  }finally{await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
