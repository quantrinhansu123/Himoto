// Read-only account selection plus a privileged temporary-file storage probe. No business writes.
const path=require('node:path'),{randomUUID}=require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
const {signSession,SESSION_COOKIE}=load(path.join(root,'lib/server/management-session'));
async function main(){
  const base='https://himoto.vercel.app';
  const account=(await ownerDatabase.query(`SELECT u.id FROM himoto.users u LEFT JOIN himoto.roles r ON r.id=u.role_id
    LEFT JOIN himoto.management_account_access a ON a.user_id=u.id WHERE u.deleted_at IS NULL AND u.status='active' AND (
      (a.access_role='admin' AND a.enabled=true AND (a.scope_all=true OR a.store_id>0))
      OR (a.access_role IS NULL AND (u.role_id=1 OR u.role='admin' OR r.slug='quan-tri-vien')))
    ORDER BY u.id LIMIT 1`)).rows[0];
  if(!account)throw Error('No authorized admin account available for verification');
  // Use the application's signed-session mechanism; keep the token only in memory and expire it in five minutes.
  const token=signSession(Number(account.id),undefined,Date.now()-((8*60-5)*60*1000));
  const response=await fetch(`${base}/api/auth/photo-uploads/sign`,{method:'POST',redirect:'error',
    headers:{Origin:base,'Content-Type':'application/json',Cookie:`${SESSION_COOKIE}=${token}`},
    body:JSON.stringify({upload_id:randomUUID(),resource_type:'video',verify_storage:true}),signal:AbortSignal.timeout(65000)});
  const body=await response.json();
  const provider=body.data?.video_storage_provider,check=body.data?.storage_check;
  const passed=response.ok&&provider==='cloudfly'&&check?.write===true&&check?.read===true&&check?.range===true&&check?.private===true&&check?.temporary_file_removed===true;
  console.log(JSON.stringify({production:base,httpStatus:response.status,provider:provider||'not-reported',passed:Boolean(passed),storageCheck:check||null,businessWrites:0,telegramRequests:0},null,2));
  if(!passed)process.exitCode=1;
}
main().catch(error=>{console.error(JSON.stringify({passed:false,error:/^[A-Z0-9_]{5}$/.test(error.code||'')?error.code:'PRODUCTION_VERIFICATION_FAILED'}));process.exitCode=1;}).finally(async()=>{await globalThis.himotoPool?.end();});
