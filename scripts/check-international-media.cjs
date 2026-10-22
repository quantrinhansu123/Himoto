const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const checks=[];
async function main(){
  const doc=load(path.join(root,'lib/management/contract-document'));
  const foreign={...doc.customerDetails(),name:'International QA',customer_type:'foreign',id_card:'QA-PASS-001',contact_channel:'Facebook',contact_detail:'qa.international'};
  assert.deepEqual(doc.validateCustomer(foreign,'api'),{});
  assert(doc.validateCustomer({...foreign,customer_type:'vietnam'},'api').id_card);
  assert(doc.validateCustomer({...foreign,contact_detail:''},'api').contact_detail);
  assert.deepEqual(doc.validateCustomer({...foreign,phone:'+82 10 1234 5678',contact_detail:''},'api'),{});
  assert(doc.validCustomerLookup('QA-PASS-001'));assert(doc.validCustomerLookup('1726617'));assert(!doc.validCustomerLookup('123'));
  checks.push('International profiles accept passports and Facebook/WhatsApp without Vietnamese phone/address; Vietnamese validation stays strict and a contact remains required');
  const ocr=load(path.join(root,'lib/management/photo-ocr'));
  assert.deepEqual(ocr.cleanOcrFields({id_card:'QA123456',driver_license_number:'ignored'},'passport'),{id_card:'QA123456'});
  assert.deepEqual(ocr.cleanOcrFields({driver_license_number:'QA-LIC-001',driver_license_issued_on:'12/10/2024',id_card:'001234567890'},'driver_license'),{driver_license_number:'QA-LIC-001',driver_license_issued_on:'2024-10-12'});
  const merged=ocr.mergeOcrCustomer(foreign,{driver_license_number:'QA-LIC-001'},foreign,{});
  assert.equal(merged.customer.driver_license_number,'QA-LIC-001');assert.equal(merged.customer.id_card,foreign.id_card);
  const serverOcr=load(path.join(root,'lib/server/photo-ocr'));serverOcr.ocrKind('passport');serverOcr.ocrKind('driver_license');
  checks.push('Passport OCR preserves alphanumeric IDs; driver-license OCR fills only the license number/issue date and preserves customer identity');
  const {contractPhotoSlots,contractEvidenceSlots}=load(path.join(root,'lib/management/contract-photos'));
  const {parsePhotoTarget}=load(path.join(root,'lib/server/record-photos'));
  const {requestPermission}=load(path.join(root,'lib/server/access-request'));
  assert.equal(contractPhotoSlots('rental').length,18);
  assert.deepEqual(contractEvidenceSlots('rental').map(slot=>[slot.key,slot.label]),[['rental-document-1','Hợp đồng đã ký'],['rental-document-2','Bill chuyển khoản / tổng tiền mặt']]);
  const composerSource=require('node:fs').readFileSync(path.join(root,'components/contracts/ContractComposer.tsx'),'utf8');
  const photoFields=require('node:fs').readFileSync(path.join(root,'components/management/RecordPhotoFields.tsx'),'utf8');
  assert.match(composerSource,/contractEvidenceSlots\('rental'\)/);
  assert.match(photoFields,/mg-media-documents/);
  assert.match(photoFields,/Xóa \$\{video\?'video':'ảnh'\}/);
  assert.match(photoFields,/deleteRecordPhoto/);
  assert.equal(requestPermission('/api/auth/record-photos/contracts/1/rental-document-1','DELETE'),'contracts.draft');
  for(const slot of ['rental-15','rental-16','rental-video-3','handover-video-1','return-101-15','return-101-16','renewal-receipt-42-video-3'])parsePhotoTarget('contracts','1',slot);
  for(const slot of ['rental-0','rental-video-4','return-101-0'])assert.throws(()=>parsePhotoTarget('contracts','1',slot));
  assert.equal(requestPermission('/api/auth/record-photos/contracts/1/handover-video-1','PUT'),'contracts.finalize');
  assert.equal(requestPermission('/api/auth/record-photos/contracts/1/return-101-15','PUT'),'contracts.return');
  assert.equal(requestPermission('/api/auth/record-photos/contracts/1/renewal-receipt-42-video-3','PUT'),'contracts.renew');
  checks.push('Additional photos beyond 15 remain accepted; video bounds and handover/return/renewal permissions are preserved');
  const {notificationPhotos}=load(path.join(root,'lib/server/contract-notification-content'));
  const ordered=await notificationPhotos({query:async()=>({rows:['rental-10','rental-video-1','rental-2','rental-1'].map(slot=>({slot,mime_type:slot.includes('video')?'video/mp4':'image/jpeg',bytes:Buffer.from(slot).toString('base64')}))})},1,['rental']);
  assert.deepEqual(ordered.map(p=>p.slot),['rental-1','rental-2','rental-10','rental-video-1']);
  const cloud=load(path.join(root,'lib/server/cloudinary-photos')),sdk=require('cloudinary').v2;
  const oldEnv={...process.env},oldResource=sdk.api.resource,oldFetch=global.fetch;
  try{
    delete process.env.CLOUDINARY_URL;Object.assign(process.env,{CLOUDINARY_CLOUD_NAME:'qa-cloud',CLOUDINARY_API_KEY:'qa-key',CLOUDINARY_API_SECRET:'qa-media-test-secret'});
    const signed=cloud.signPhotoUpload(151,randomUUID(),Date.now(),true),version=1800000000;
    assert.equal(signed.params.format,'mp4');assert.equal(signed.params.type,'authenticated');assert.match(signed.params.transformation,/vc_h264/);
    const receipt={public_id:signed.params.public_id,version,resource_type:'video'};
    receipt.signature=sdk.utils.api_sign_request({public_id:receipt.public_id,version},process.env.CLOUDINARY_API_SECRET);
    assert.deepEqual(cloud.verifyPhotoReceipt(receipt,151),receipt);assert.throws(()=>cloud.verifyPhotoReceipt(receipt,152));
    assert.throws(()=>cloud.verifyPhotoReceipt({...receipt,resource_type:undefined},151));
    let asset={resource_type:'video',format:'mp4',version,bytes:3876915,duration:10.17},saved;
    sdk.api.resource=async()=>asset;
    const database={query:async(sql,params)=>{saved={sql,params};return{rows:[],rowCount:1};}};
    await cloud.writeCloudinaryPhoto(database,'contracts',1,'rental-video-1',151,receipt);assert.equal(saved.params.at(-1),'video/mp4');
    asset={...asset,duration:61};await assert.rejects(()=>cloud.writeCloudinaryPhoto(database,'contracts',1,'rental-video-1',151,receipt));
    await assert.rejects(()=>cloud.writeCloudinaryPhoto(database,'customers',1,'id_front',151,receipt));
    global.fetch=async(url,options)=>{assert.match(String(url),/\/video\/download\?/);assert.equal(options.headers.Range,'bytes=0-15');return new Response(new Uint8Array(16),{status:206,headers:{'Content-Range':'bytes 0-15/100'}});};
    const remote=await cloud.readCloudinaryPhoto({cloudinary_public_id:receipt.public_id,cloudinary_cloud_name:'qa-cloud',cloudinary_version:version,mime_type:'video/mp4'},'bytes=0-15');assert.equal(remote.status,206);
    checks.push('Video upload receipts enforce actor/type/signature, server metadata checks size/duration/MP4, and authenticated playback forwards byte ranges');
  }finally{sdk.api.resource=oldResource;global.fetch=oldFetch;for(const key of Object.keys(process.env))if(!(key in oldEnv))delete process.env[key];Object.assign(process.env,oldEnv);}
  const crypto=load(path.join(root,'lib/server/integration-secrets'));
  const notices=load(path.join(root,'lib/server/contract-notifications'));
  async function dispatch(photos){let claimed=false,finalState,methods=[],batches=[];
    const db={query:async(sql,params)=>{
      if(sql.includes('SELECT bot_cipher'))return{rows:[{bot_cipher:crypto.sealIntegrationSecret({token:'qa-local-only'})}]};
      if(sql.includes("status='sending'")){if(claimed)return{rows:[]};claimed=true;return{rows:[{id:'qa',chat_id:'qa-chat',store_id:23,event_type:'rental',payload:{code:'QA',customer:'QA',store:'QA',actor:'QA',vehicles:'QA',total:'0',at:new Date().toISOString(),photos}}]};}
      if(sql.includes('SELECT chat_id'))return{rows:[{chat_id:'qa-chat'}]};
      if(sql.includes("status='sent'"))finalState='sent';return{rows:[]};
    }};
    const send=async(url,options)=>{const method=new URL(url).pathname.split('/').at(-1);methods.push(method);
      if(method==='sendMessage')return Response.json({ok:true,result:{message_id:999}});
      if(method==='sendMediaGroup'){const media=JSON.parse(options.body.get('media'));assert(media.length>=2&&media.length<=10);for(const item of media){const file=options.body.get(item.media.replace('attach://',''));assert.equal(item.type,file.type==='video/mp4'?'video':'photo');}batches.push(media);return Response.json({ok:true,result:media.map((_,i)=>({message_id:100+methods.length*10+i}))});}
      assert.equal(method,'sendVideo');assert.equal(options.body.get('video').type,'video/mp4');return Response.json({ok:true,result:{message_id:1}});
    };
    const result=await notices.dispatchContractNotifications(send,1,db);assert.equal(result.sent,1);assert.equal(finalState,'sent');return{methods,batches};
  }
  const photo={slot:'rental-1',mime_type:'image/jpeg',bytes:Buffer.from([255,216,255,217]).toString('base64')};
  const video={slot:'rental-video-1',mime_type:'video/mp4',bytes:Buffer.from('qa-video').toString('base64')};
  const mixed=await dispatch([...Array.from({length:15},(_,i)=>({...photo,slot:`rental-${i+1}`})),video]);assert.deepEqual(mixed.batches.map(b=>b.length),[10,5]);assert.deepEqual(mixed.methods,['sendMediaGroup','sendMediaGroup','sendVideo','sendMessage']);
  assert.deepEqual((await dispatch([video])).methods,['sendVideo','sendMessage']);
  checks.push('Real dispatcher builds valid mixed Telegram albums in batches of 10, preserves all 15 photos plus video, and uses sendVideo for a single video (no real Telegram requests)');
  const databases=load(path.join(root,'lib/server/himoto-database')),session=load(path.join(root,'lib/server/management-session'));
  const pool=databases.himotoPool,owner=databases.ownerDatabase;
  const descriptors=Object.getOwnPropertyDescriptors(pool),ownerDescriptors=Object.getOwnPropertyDescriptors(owner),auth=session.protectDatabaseRequest,userFromSession=session.userFromSession;
  const c=await owner.connect();
  try{
    await c.query('BEGIN');await c.query('CREATE TEMP TABLE qa_foreign_customers (LIKE himoto.customers INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING GENERATED)');
    await c.query('ALTER TABLE qa_foreign_customers ALTER COLUMN id DROP DEFAULT; ALTER TABLE qa_foreign_customers ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (START WITH 1000000)');
    await c.query(require('node:fs').readFileSync('docs/sql/2026-10-18-customer-duplicate-lookup.sql','utf8').replace(/^BEGIN;|^COMMIT;/gm,'').replaceAll('himoto.customers','pg_temp.qa_foreign_customers').replaceAll('himoto.find_customer_duplicate','pg_temp.qa_find_customer_duplicate'));
    const query=async(sql,params)=>{if(sql==='BEGIN')return c.query('SAVEPOINT qa_request');if(sql==='COMMIT')return c.query('RELEASE SAVEPOINT qa_request');if(sql==='ROLLBACK')return c.query('ROLLBACK TO SAVEPOINT qa_request');sql=sql.replaceAll('himoto.customers','pg_temp.qa_foreign_customers').replaceAll('himoto.find_customer_duplicate','pg_temp.qa_find_customer_duplicate');assert(!sql.includes('himoto.'),'All profile business SQL must use TEMP');return c.query(sql,params);};
    Object.defineProperty(pool,'connect',{configurable:true,value:async()=>({query,release(){}})});Object.defineProperty(owner,'query',{configurable:true,value:async()=>{throw Error('Customer writes must not borrow another owner connection while holding their lock');}});
    session.protectDatabaseRequest=async()=>null;session.userFromSession=async()=>({id:151,access_role:'branch_staff',store_id:23,scope_all:false,permissions:['customers.read','customers.write']});
    const route=load(path.join(root,'app/api/auth/[...path]/route')),{NextRequest}=require('next/server');
    const request=(method,body,id)=>route[method](new NextRequest(`http://localhost/api/auth/customers${id?'/'+id:''}`,{method,headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({path:['customers',...(id?[String(id)]:[])]})});
    const input={...foreign,store_id:23,status:'active',relatives:[]};
    const created=await request('POST',input);assert.equal(created.status,201);const customer=(await created.json()).data;assert.equal(customer.phone,'');assert.equal(customer.customer_type,'foreign');assert.equal(customer.contact_detail,input.contact_detail);
    const updated=await request('PATCH',{...input,contact_channel:'WhatsApp',contact_detail:'+82 10 1234 5678'},customer.id);assert.equal(updated.status,200);assert.equal((await updated.json()).data.contact_channel,'WhatsApp');
    assert.equal((await request('POST',input)).status,409);
    assert.equal((await request('POST',{...input,customer_type:'vietnam',id_card:'QA-OTHER'})).status,400);
    const stored=(await c.query('SELECT * FROM qa_foreign_customers')).rows;assert.equal(stored.length,1);assert.equal(Number(stored[0].store_id),23);
    checks.push('Actual authenticated POST/PATCH handlers persist foreign type/passport/Facebook/WhatsApp with blank phone, preserve branch ownership and reject duplicates; all rows and sequences are TEMP/rollback');
  }finally{Object.defineProperties(pool,descriptors);Object.defineProperties(owner,ownerDescriptors);session.protectDatabaseRequest=auth;session.userFromSession=userFromSession;await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
  console.log(JSON.stringify({passed:checks.length,checks,operationalWrites:0,realTelegramRequests:0},null,2));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
