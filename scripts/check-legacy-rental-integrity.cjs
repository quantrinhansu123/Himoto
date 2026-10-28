const assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
const {load,root}=require('./lib/load-typescript.cjs'),{NextRequest}=require('next/server');
const domain=load(path.join(root,'lib/server/legacy-rental-integrity')),publicKey=load(path.join(root,'lib/server/legacy-rental-integrity-public-key')),database=load(path.join(root,'lib/server/himoto-database')),route=load(path.join(root,'app/api/internal/vehicle-rental-integrity/route'));
const checks=[],pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
function headers(body,at=Math.floor(Date.now()/1000)){const timestamp=String(at),nonce=crypto.randomBytes(16).toString('hex');return new Headers({'content-type':'application/json','x-himoto-integrity-timestamp':timestamp,'x-himoto-integrity-nonce':nonce,'x-himoto-integrity-signature':crypto.sign('sha256',Buffer.from(`${timestamp}\n${nonce}\n${body}`),pair.privateKey).toString('base64')});}
async function main(){
 const body=JSON.stringify({licenses:['19G1-423.19','89AB-591.49']});
 assert(domain.validIntegritySignature(headers(body),body,Date.now(),pair.publicKey));assert(!domain.validIntegritySignature(headers(body),body+' ',Date.now(),pair.publicKey));assert(!domain.validIntegritySignature(headers(body,Math.floor(Date.now()/1000)-120),body,Date.now(),pair.publicKey));assert(!domain.validIntegritySignature(new Headers(),body));
 assert.deepEqual(domain.integrityLicenses({licenses:['19g1-423.19',' 19G1 42319 ']}),['19G142319']);
 for(const value of [null,{},[],{licenses:[]},{licenses:['\' OR true--']},{licenses:Array(101).fill('19G142319')},{licenses:['19G142319'],store_id:28},{licenses:[12345]}])assert.throws(()=>domain.integrityLicenses(value));
 checks.push('Only a fresh signed legacy request is accepted; tampering, expired signatures, invalid plates and overlarge batches are rejected');
 const descriptor=Object.getOwnPropertyDescriptor(database.ownerDatabase,'connect'),originalKey=publicKey.LEGACY_INTEGRITY_PUBLIC_KEY;let queries=[],connections=0;
 const fake={release(){},async query(sql){queries.push(sql);return{rows:sql.includes('FROM himoto.vehicles v')?[{license:'19G142319',active_count:1,named_count:1,other_open_count:0}]:[]};}};
 try{
  publicKey.LEGACY_INTEGRITY_PUBLIC_KEY=pair.publicKey;Object.defineProperty(database.ownerDatabase,'connect',{configurable:true,value:async()=>{connections++;return fake;}});
  const url='https://localhost/api/internal/vehicle-rental-integrity';
  assert.equal((await route.POST(new NextRequest(url,{method:'POST',body}))).status,401);assert.equal(connections,0);
  let response=await route.POST(new NextRequest(url,{method:'POST',headers:headers(body),body}));assert.equal(response.status,200);assert(response.headers.get('cache-control').includes('no-store'));
  const data=(await response.json()).data;assert(data.checked_at);assert.deepEqual(data.rows,[{license:'19G142319',found:true,active_count:1,named_count:1,other_open_count:0},{license:'89AB59149',found:false,active_count:0,named_count:0,other_open_count:0}]);
  assert(queries.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));assert(queries.includes('COMMIT'));assert(!queries.some(sql=>/\b(INSERT|UPDATE|DELETE)\b/.test(sql)));assert(!JSON.stringify(data).includes('customer_name'));
  const bad=JSON.stringify({licenses:['bad!']});response=await route.POST(new NextRequest(url,{method:'POST',headers:headers(bad),body:bad}));assert.equal(response.status,400);assert.equal(connections,1);
  const huge=' '.repeat(8193);assert.equal((await route.POST(new NextRequest(url,{method:'POST',body:huge}))).status,413);assert.equal(connections,1);
  checks.push('Actual endpoint rejects anonymous/invalid requests before opening DB; authorized result is read-only, no-store, counts only, with no customer or financial details');
 }finally{publicKey.LEGACY_INTEGRITY_PUBLIC_KEY=originalKey;Object.defineProperty(database.ownerDatabase,'connect',descriptor);}
 if(process.argv.includes('--live-temp')){
  require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});const c=await database.ownerDatabase.connect();
  try{await c.query('BEGIN');for(const table of ['vehicles','orders','order_vehicle_details','customers'])await c.query(`CREATE TEMP TABLE qa_integrity_${table} AS SELECT * FROM himoto.${table} WHERE false`);
   const proxy={query(sql,args){for(const table of ['vehicles','orders','order_vehicle_details','customers'])sql=sql.replaceAll('himoto.'+table,'pg_temp.qa_integrity_'+table);assert(!sql.includes('himoto.'));return c.query(sql,args);}};
   await c.query("INSERT INTO qa_integrity_vehicles(id,license) VALUES(1,'19G1-423.19'),(2,'89AB-591.49'),(3,'QA-12345'),(4,'QA-23456')");
   await c.query("INSERT INTO qa_integrity_customers(id,name) VALUES(7,'Khách QA'),(8,'   ')");
   await c.query("INSERT INTO qa_integrity_orders(id,customer_id,customer_name,order_status) VALUES(1,7,NULL,'renting'),(2,7,NULL,'completed'),(3,8,'Tên trên hợp đồng','bad_debt'),(4,7,NULL,'draft'),(5,8,'','renting')");
   await c.query("INSERT INTO qa_integrity_order_vehicle_details(id,vehicle_id,order_id,completed_at) VALUES(1,1,1,NULL),(2,2,2,NULL),(3,3,3,NULL),(4,4,4,NULL),(5,4,5,NULL),(6,2,1,now())");
   const rows=await domain.readNewRentalIntegrity(proxy,['19G142319','89AB59149','QA12345','QA23456']);assert.equal(rows[0].named_count,1);assert.equal(rows[1].active_count,0);assert.equal(rows[2].named_count,1);assert.equal(rows[3].active_count,1);assert.equal(rows[3].named_count,0);assert.equal(rows[3].other_open_count,1);
   await c.query("UPDATE qa_integrity_orders SET deleted_at=now() WHERE id=1");assert.equal((await domain.readNewRentalIntegrity(proxy,['19G142319']))[0].active_count,0);
   checks.push('PostgreSQL TEMP: completed/deleted/returned records cannot confirm a renter; fallback customer names and bad debt work; drafts stay separate from active hire');
  }finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}
 }
 const addon=require('../legacy/rental-integrity/rental-integrity.js'),csv=addon.csv({checked_at:'2026-10-29T02:00:00Z',rows:[{license:'19G1-423.19',name:'=HYPERLINK("bad")',message:'Không sửa xe'}]});assert(csv.startsWith('\uFEFF'));assert(csv.includes("\"'=HYPERLINK"));assert(csv.includes('Không sửa xe'));assert.equal(addon.day('2026-10-28T18:00:00Z'),'2026-10-29');
 checks.push('CSV is UTF-8 with quoted fields and spreadsheet formula protection');
 console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realTelegramRequests:0},null,2));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
