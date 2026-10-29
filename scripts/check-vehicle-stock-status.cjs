const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {VEHICLE_STATUS_SQL}=load(path.join(root,'lib/server/vehicle-status'));
const {mapApiRow}=load(path.join(root,'lib/management/repository'));
async function main(){
 const cases=[['ready','ready'],['using','using'],['rent','using'],['maintenance','repairing'],['holding','pending'],['bad_debt','bad_debt'],['sold','sold']];
 for(const [status,expected]of cases){const row=mapApiRow('vehicles',{id:1,status,rentals:[{order_id:11,customer:'Khách QA',status:'renting'}]});assert.equal(row.status,expected);assert.equal(row.holder_name,'Khách QA');}
 if(process.argv.includes('--live-read')){
  require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
  const db=load(path.join(root,'lib/server/himoto-database')).ownerDatabase,c=await db.connect();
  try{await c.query('BEGIN READ ONLY');
   const rows=(await c.query(`SELECT v.status AS stored,${VEHICLE_STATUS_SQL} AS displayed,r.rentals FROM unnest($1::text[]) v(status) CROSS JOIN(VALUES('[{"order_id":11,"status":"renting"}]'::json)) r(rentals)`,[cases.map(([status])=>status)])).rows;
   assert.deepEqual(rows.map(r=>[r.stored,r.displayed]),cases);
   assert(rows.every(r=>r.rentals[0].order_id===11));await c.query('ROLLBACK');
  }finally{c.release();await globalThis.himotoPool?.end();}
 }
 console.log(JSON.stringify({passed:cases.length,openContractsPreserveRecordedStockStatus:true,legacyAliasesNormalized:true,permanentBusinessWrites:0}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
