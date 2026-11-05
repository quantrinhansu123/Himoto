// Inherited disposable contract schema. No CLI/env or operational connection.
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto'),{NextRequest}=require('next/server');
module.exports=async function({pg,raw,load,root,user,admin,setFailReceipt}){
  process.env.MANAGEMENT_SESSION_SECRET='qa-mobile-contract-import-secret-at-least-32-bytes';
  const api=load(path.join(root,'lib/server/mobile-contract-import')),resultApi=load(path.join(root,'lib/server/mobile-customer-import')),recovery=load(path.join(root,'lib/server/mobile-write-recovery'));
  const dto=load(path.resolve('shared/mobile-contract-import')),receiptDto=load(path.resolve('shared/mobile-customer-import')),headers=load(path.join(root,'lib/management/customer-order-excel')).ORDER_CUSTOMER_HEADERS;
  const {Workbook}=require('exceljs'),book=new Workbook(),sheet=book.addWorksheet('Đơn nguồn');sheet.addRow(headers);
  for(const [sourceId,vehicle]of[[9001,19303],[9002,19304]])sheet.addRow([sourceId,'2026-11-04 08:00:01','Khách QA','0000000000','Xe QA',`EDIT${vehicle}`,'2026-11-04 08:00:02','2026-11-05 08:00:03','QA nguồn',1100000,100000,'renting']);
  const bytes=Buffer.from(await book.xlsx.writeBuffer());
  const req=(body,key)=>new NextRequest('https://qa.invalid/import',{method:'POST',headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify(body)});
  const upload=(actor=admin,name='KH QA.xlsx')=>api.readMobileContractWorkbook(actor,new NextRequest('https://qa.invalid/workbook',{method:'POST',headers:{'x-file-name':encodeURIComponent(name),'x-source-store':'23'},body:bytes}));
  const preview=(files,actor=admin)=>api.previewMobileContractImport(actor,req({files}));
  const input=(files,p)=>({files,batchId:p.batchId,revision:p.revision,expectedAdded:p.expectedAdded,backupSha:p.backupSha,backupSnapshotSha:p.backupSnapshotSha,manifestSha:p.manifestSha,signature:p.signature,verifiedBackupSha:p.backupSha});
  const write=(files,p,key=randomUUID(),patch={},actor=admin)=>api.writeMobileContractImport(actor,p.batchId,req({...input(files,p),...patch},key));
  const resolve=(p,key,actor=admin)=>recovery.resolveMobileWrite(actor,key,req({operation:`import.contracts:${p.batchId}`}));
  const state=async()=>JSON.stringify((await pg.query("SELECT (SELECT jsonb_agg(o ORDER BY o.id) FROM himoto.orders o) AS orders,(SELECT jsonb_agg(v ORDER BY v.id) FROM himoto.vehicles v) AS vehicles,(SELECT jsonb_agg(t ORDER BY t.id) FROM himoto.transactions t) AS money,(SELECT jsonb_agg(d ORDER BY d.id) FROM himoto.order_vehicle_details d) AS details,(SELECT jsonb_agg(m ORDER BY m.request_id) FROM himoto.management_mobile_requests m) AS requests")).rows);
  const checks=[];let loseCommit=false;const oldQuery=raw.query;
  raw.query=async function(sql,params){const result=await oldQuery(sql,params);if(sql==='COMMIT'&&loseCommit){loseCommit=false;throw Error('QA lost commit response');}return result;};
  try{
    await pg.exec(`ALTER TABLE himoto.orders ADD COLUMN metadata text DEFAULT '{}',ADD COLUMN order_mode text;
      ALTER TABLE himoto.orders ALTER COLUMN total SET DEFAULT 0;ALTER TABLE himoto.orders ALTER COLUMN pid SET DEFAULT 0;
      CREATE SEQUENCE himoto.orders_id_seq;ALTER TABLE himoto.orders ALTER COLUMN id SET DEFAULT nextval('himoto.orders_id_seq');ALTER SEQUENCE himoto.orders_id_seq OWNED BY himoto.orders.id;
      ALTER TABLE himoto.management_mobile_requests ADD COLUMN created_at timestamptz DEFAULT now();`);
    const before=await state(),file=await upload();assert(dto.isMobileContractWorkbook(file));assert.equal(file.sources.length,2);assert.equal(file.sources[0].paid,'1100000');assert.equal(file.sources[0].start,'2026-11-04 08:00:02');
    const template=await api.mobileContractImportTemplate(admin),templateBook=new Workbook();await templateBook.xlsx.load(Buffer.from(template.contentBase64,'base64'));assert.deepEqual(templateBook.worksheets[0].getRow(1).values.slice(1),headers);assert.equal(templateBook.worksheets[0].getColumn(4).numFmt,'@');assert.match(templateBook.worksheets[0].getCell('J1').note,/tổng đã thu/);
    assert.equal((await api.mobileContractImportOptions(admin)).namespace,'himoto-customer-workbooks-v1');await assert.rejects(()=>upload(user),e=>e.status===403);await assert.rejects(()=>upload(admin,'../bad.xlsx'),e=>e.status===400);
    const p=await preview([file]);assert(dto.isMobileContractImportPreview(p));assert.equal(p.expectedAdded,2);assert.equal(await state(),before);
    const backup=JSON.parse(p.backup.content);assert.equal(backup.actorId,145);assert.equal(backup.branchMap['KH QA.xlsx'],23);assert.equal(backup.sourceHashes['KH QA.xlsx'],createHash('sha256').update(bytes).digest('hex'));assert.equal(createHash('sha256').update(p.backup.content).digest('hex'),p.backupSha);
    const forged=structuredClone(file);forged.sources[0].paid='1';await assert.rejects(()=>preview([forged]),e=>e.status===409);await assert.rejects(()=>preview([file],{...admin,id:160}),e=>e.status===409);
    await assert.rejects(()=>write([file],p,randomUUID(),{verifiedBackupSha:''}),e=>e.status===400);await assert.rejects(()=>write([file],p,randomUUID(),{expectedAdded:1}),e=>e.status===409);assert.equal(await state(),before);
    checks.push('Actual12-column workbook parser, actor-bound source signature/branch map/namespace/hash, SELECT-only preview and complete snapshot backup; forbidden actor, forged source/count and unverified backup reject');
    await pg.exec("UPDATE himoto.vehicles SET color='QA thay đổi' WHERE id=19303");const changed=await state();await assert.rejects(()=>write([file],p),e=>e.status===409);assert.equal(await state(),changed);await pg.exec('UPDATE himoto.vehicles SET color=NULL WHERE id=19303');
    const fresh=await preview([file]),cancel=randomUUID();assert.equal((await resolve(fresh,cancel)).status,'cancelled');await assert.rejects(()=>write([file],fresh,cancel),e=>e.code==='REQUEST_CANCELLED');
    const safe=await state();setFailReceipt();await assert.rejects(()=>write([file],fresh),/QA receipt failure/);assert.equal(await state(),safe);
    checks.push('Changed DB/prepared revision blocks import; generic tombstone rejects late write; actual multi-draft transaction rolls both inserts back if receipt fails');
    const key=randomUUID();loseCommit=true;await assert.rejects(()=>write([file],fresh,key),/QA lost commit response/);
    const proof=(await resultApi.readMobileImportResult(admin,key)).receipt;assert(receiptDto.isMobileImportReceipt(proof));assert.equal(proof.kind,'contracts');assert.equal(proof.count,2);assert.equal((await resolve(fresh,key)).status,'committed');
    const committed=await state(),replay=await write([file],fresh,key);assert(replay.replayed);assert.equal(await state(),committed);
    const added=(await pg.query("SELECT * FROM himoto.orders WHERE metadata::jsonb#>>'{excel_import,mobile_request_id}'=$1 ORDER BY id",[key])).rows;assert.equal(added.length,2);assert(added.every(r=>Number(r.id)>9306));
    for(const row of added){const meta=JSON.parse(row.metadata).excel_import;assert.equal(row.order_status,'draft');assert.equal(row.total,0);assert.equal(row.pid,0);assert.equal(row.first_deposit_amount,null);assert.equal(meta.financialReconciled,false);assert.equal(meta.sourcePaid,'1100000');assert.equal(meta.namespace,'himoto-customer-workbooks-v1');assert.equal(meta.backup_sha256,fresh.backupSha);assert.equal(row.draft_payload.order_items[0].rent_at,'2026-11-04T08:00:02+07:00');}
    assert.equal((await preview([file])).expectedAdded,0);assert.equal((await preview([file])).existing,2);
    await assert.rejects(()=>resultApi.readMobileImportResult({...user,id:145,permissions:['settings.write']},key),e=>e.status===403);await assert.rejects(()=>resolve(fresh,key,{...user,id:145,permissions:['settings.write']}),e=>e.status===403);
    checks.push('Actual web draft writer preserves financial/stock/related tables and original contracts, aligns legacy sequence, writes source/backup metadata and seconds; lost COMMIT resolves original count, replay adds none and repeat preview marks existing; demoted actor cannot read/resolve admin import');
    const out=process.argv.indexOf('--import-fixture-output');
    if(out>=0){const fs=require('node:fs'),folder=path.resolve(process.argv[out+1]);assert(folder.startsWith(path.resolve('.backups')+path.sep)&&!fs.existsSync(folder));fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'KH QA.xlsx'),bytes);fs.writeFileSync(path.join(folder,'catalogue.json'),JSON.stringify({fixtureOnly:true,options:await api.mobileContractImportOptions(admin),template,file,preview:p,receipt:proof},null,2));}
    console.log(JSON.stringify({passed:checks.length,checks,operationalWrites:0,database:'disposable PGlite actual domain; local device backup/browser/native/staging tested separately'},null,2));
    return {passed:checks.length};
  }finally{raw.query=oldQuery;}
};
