require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {CONTRACT_CUSTOMER_NAME_SQL:name,CONTRACT_CUSTOMER_PHONE_SQL:phone}=load(path.join(root,'lib/server/contract-customer-read'));
(async()=>{const c=await load(path.join(root,'lib/server/himoto-database')).ownerDatabase.connect();try{
for(const [profile,expected] of [[{customer:{name:'Tên mới',phone:''}},'Tên mới'],[{},'Tên danh bạ']]){
const r=await c.query(`SELECT ${name} AS name,${phone} AS phone FROM (SELECT $1::json AS draft_payload,'Tên cũ'::text AS customer_name,'0900000000'::text AS customer_phone) o CROSS JOIN (SELECT 'Tên danh bạ'::text AS name,'0900000001'::text AS phone)c`,[JSON.stringify({management_composer:{profile}})]);
assert.equal(r.rows[0].name,expected);if(profile.customer)assert.equal(r.rows[0].phone,'');}
console.log('PASS: saved profile name overrides directory; old records retain fallback; intentionally cleared phone stays clear.');
}finally{c.release();await globalThis.himotoPool?.end();}})().catch(e=>{console.error(e.message);process.exit(1)});
