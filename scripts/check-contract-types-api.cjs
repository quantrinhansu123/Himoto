const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'),false,{info(){},error(){}});
const {load,root} = require('./lib/load-typescript.cjs');
const sessions=load(path.join(root,'lib/server/management-session'));
const db=load(path.join(root,'lib/server/himoto-database')).himotoPool;
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const base=arg('--url','http://127.0.0.1:3102'),file=arg('--session-cookie-file');
assert(file,'Pass --session-cookie-file pointing to an ignored local cookie file');
const cookie=`${sessions.SESSION_COOKIE}=${fs.readFileSync(file,'utf8').trim()}`;
const checks=[];
async function run(){
  const url=base+'/api/auth/contract-types';
  assert.equal((await fetch(url)).status,401);checks.push('Anonymous catalog read: 401');
  const read=await fetch(url,{headers:{cookie}});assert.equal(read.status,200);assert.equal((await read.json()).data.filter(t=>t.active).length,3);
  checks.push('Authenticated catalog read: three initial active types');
  const invalid=(token,origin)=>fetch(url,{method:'POST',headers:{cookie:token,origin,'Content-Type':'application/json'},body:'{}'});
  assert.equal((await invalid(cookie,'https://invalid.example')).status,403);checks.push('Cross-origin catalog mutation: 403');
  assert.equal((await invalid(cookie,base)).status,400);checks.push('Malformed catalog input: 400, no catalog write');
  const account=(await db.query("SELECT u.id FROM himoto.users u LEFT JOIN himoto.roles r ON r.id=u.role_id WHERE u.status='active' AND u.deleted_at IS NULL AND (u.role='ke-toan' OR r.slug='ke-toan') AND u.role_id<>1 LIMIT 1")).rows[0];
  if(account){assert.equal((await invalid(`${sessions.SESSION_COOKIE}=${sessions.signSession(Number(account.id))}`,base)).status,400);checks.push('Accounting account reaches catalog input validation: 400, no catalog write');}
  assert.equal((await fetch(base+'/api/auth/battery-contracts?vehicle_contract_id=0',{headers:{cookie}})).status,400);
  checks.push('Invalid source vehicle contract filter: 400');
  const result={checks,permanentBusinessWrites:0};
  fs.writeFileSync(path.resolve(__dirname,'../docs/qa/contract-types/api-results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}
run().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>globalThis.himotoPool?.end());
