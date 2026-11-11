// Copy referenced historical media; immutable aliases leave every business row,
// revision, Telegram payload and delivery hash unchanged. No source is deleted.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
const objects=load(path.join(root,'lib/server/object-media'));
const {v2:cloudinary}=require('cloudinary');
const flag=name=>process.argv.includes(name),option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:Number(process.argv[i+1]);};
const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4'};
const keyFor=photo=>createHash('sha256').update(JSON.stringify([photo.cloudinary_cloud_name,photo.cloudinary_public_id,String(photo.cloudinary_version),photo.mime_type])).digest('hex');
async function inventory(){
  const db=await ownerDatabase.connect();
  try {await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='30s'");
    const result=await db.query(`WITH refs AS (
      SELECT cloudinary_cloud_name,cloudinary_public_id,cloudinary_version,mime_type FROM himoto.management_record_photos WHERE cloudinary_public_id IS NOT NULL
      UNION ALL SELECT cloudinary_cloud_name,cloudinary_public_id,cloudinary_version,mime_type FROM himoto.management_shift_media WHERE cloudinary_public_id IS NOT NULL
      UNION ALL SELECT p->>'cloudinary_cloud_name',p->>'cloudinary_public_id',NULLIF(p->>'cloudinary_version','')::bigint,COALESCE(p->>'mime_type','image/jpeg')
        FROM himoto.management_contract_notifications n CROSS JOIN LATERAL jsonb_array_elements(COALESCE(n.payload->'photos','[]'::jsonb)) p WHERE p->>'cloudinary_public_id' IS NOT NULL
    ) SELECT DISTINCT cloudinary_cloud_name,cloudinary_public_id,cloudinary_version,mime_type FROM refs
      WHERE cloudinary_cloud_name IS NOT NULL AND cloudinary_version>0 ORDER BY cloudinary_cloud_name,cloudinary_public_id,cloudinary_version,mime_type`);
    await db.query('COMMIT');return result.rows;
  }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
}
async function download(photo){
  let fromUrl;try{fromUrl=process.env.CLOUDINARY_URL?new URL(process.env.CLOUDINARY_URL):undefined;}catch{throw Error('INVALID_SOURCE_CONFIG');}
  const config={cloud_name:process.env.CLOUDINARY_CLOUD_NAME||fromUrl?.hostname,api_key:process.env.CLOUDINARY_API_KEY||(fromUrl&&decodeURIComponent(fromUrl.username)),api_secret:process.env.CLOUDINARY_API_SECRET||(fromUrl&&decodeURIComponent(fromUrl.password))};
  if(photo.cloudinary_cloud_name!==config.cloud_name||!extension[photo.mime_type])throw Error('UNSUPPORTED_SOURCE');
  const url=cloudinary.url(photo.cloudinary_public_id,{...config,secure:true,sign_url:true,type:'authenticated',resource_type:photo.mime_type==='video/mp4'?'video':'image',format:extension[photo.mime_type],version:Number(photo.cloudinary_version)});
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(60000)});
  if(!response.ok||!response.body)throw Error('SOURCE_HTTP_'+response.status);
  const bytes=await objects.boundedObjectBytes(response.body,photo.mime_type==='video/mp4'?47185920:2097152);
  if(photo.mime_type==='video/mp4'){if(bytes.length<12||bytes.toString('ascii',4,8)!=='ftyp')throw Error('INVALID_SOURCE_VIDEO');}
  else {load(path.join(root,'lib/server/record-photos')).validatePhotoBytes(photo.mime_type,bytes);await require('sharp')(bytes,{limitInputPixels:40000000}).metadata();}
  return bytes;
}
async function main(){
  if(flag('--schema')){await ownerDatabase.query(fs.readFileSync('docs/sql/2026-11-11-cloudfly-photos.sql','utf8'));console.log(JSON.stringify({schema:'cloudfly-photos',applied:true,businessRowsWritten:0}));return;}
  const entries=await inventory(),exists=await ownerDatabase.query("SELECT to_regclass('himoto.management_media_archive') AS present");
  const archived=exists.rows[0].present?(await ownerDatabase.query('SELECT source_cloud AS cloudinary_cloud_name,source_public_id AS cloudinary_public_id,source_version AS cloudinary_version,mime_type FROM himoto.management_media_archive WHERE verified_at IS NOT NULL')).rows:[];
  const done=new Set(archived.map(keyFor)),pending=entries.filter(p=>!done.has(keyFor(p)));
  console.log(JSON.stringify({referencedAssets:entries.length,verifiedAliases:entries.length-pending.length,pendingAssets:pending.length,mode:flag('--apply')?'copy':'inventory',sourceDeletes:0,businessRowsWritten:0}));
  if(!flag('--apply'))return;
  if(!exists.rows[0].present)throw Error('APPLY_SCHEMA_FIRST');
  const limit=option('--limit',pending.length),concurrency=option('--concurrency',3);
  if(!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>32)throw Error('INVALID_BATCH_OPTIONS');
  const queue=pending.slice(0,limit),started=Date.now();let next=0,copied=0,failed=0,bytes=0;
  const dir=path.join('.backups','cloudfly-media-migration');fs.mkdirSync(dir,{recursive:true});
  const failures=[];
  const checkpoint=()=>{const summary={at:new Date().toISOString(),referencedAssets:entries.length,batch:queue.length,copied,failed,bytes,remaining:pending.length-copied,seconds:Math.round((Date.now()-started)/1000),businessRowsWritten:0,sourceDeletes:0};fs.writeFileSync(path.join(dir,'progress.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));};
  await Promise.all(Array.from({length:concurrency},async()=>{while(next<queue.length){const photo=queue[next++],hash=keyFor(photo);try{
    const data=await download(photo),sha256=createHash('sha256').update(data).digest('hex'),key=`himoto/legacy/cloudinary/${hash}.${extension[photo.mime_type]}`;
    const etag=await objects.putVerifiedObject(key,data,photo.mime_type,sha256),bucket=load(path.join(root,'lib/server/cloudfly-videos')).cloudflyVideoSettings().bucket;
    const saved=await ownerDatabase.query(`INSERT INTO himoto.management_media_archive(source_cloud,source_public_id,source_version,mime_type,object_bucket,object_key,object_etag,storage_sha256,storage_bytes,verified_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) ON CONFLICT(source_cloud,source_public_id,source_version,mime_type) DO UPDATE SET verified_at=EXCLUDED.verified_at
      WHERE management_media_archive.object_bucket=EXCLUDED.object_bucket AND management_media_archive.object_key=EXCLUDED.object_key AND management_media_archive.object_etag=EXCLUDED.object_etag AND management_media_archive.storage_sha256=EXCLUDED.storage_sha256 AND management_media_archive.storage_bytes=EXCLUDED.storage_bytes RETURNING storage_bytes`,
    [photo.cloudinary_cloud_name,photo.cloudinary_public_id,photo.cloudinary_version,photo.mime_type,bucket,key,etag,sha256,data.length]);
    if(!saved.rowCount)throw Error('ARCHIVE_CONFLICT');copied++;bytes+=data.length;
  }catch(e){failed++;failures.push({sourceFingerprint:hash,code:/^[A-Z0-9_]+$/.test(e.code||e.message||'')?(e.code||e.message):'COPY_FAILED'});}
  if((copied+failed)%25===0)checkpoint();}}));
  checkpoint();fs.writeFileSync(path.join(dir,'failures.json'),JSON.stringify(failures,null,2));if(failed)process.exitCode=1;
}
main().catch(e=>{console.error(JSON.stringify({error:/^[A-Z0-9_]+$/.test(e.code||e.message||'')?(e.code||e.message):'MEDIA_MIGRATION_FAILED'}));process.exitCode=1;}).finally(async()=>{await globalThis.himotoPool?.end();});
