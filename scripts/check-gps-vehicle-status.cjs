const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {load,root}=require('./lib/load-typescript.cjs');
const {readGpsWorkspace}=load(path.join(root,'lib/server/gps-workspace'));
const {GPS_EXPORT_HEADERS,gpsExportRows}=load(path.join(root,'lib/management/filtered-list-export'));
async function main(){
  const queries=[];
  const fixture=(id,status,gps)=>({id,vehicle_id:Math.abs(id),vehicle_status:status,management_status:gps,store_id:23,last_latitude:null,last_longitude:null,last_speed:null,license:`QA-${id}`});
  const db={query:async(sql,args)=>{queries.push({sql,args});return {rows:sql.includes('FROM himoto.gps_devices d LEFT JOIN')?[fixture(1,'ready','online'),fixture(2,'using','offline')]:sql.includes('-v.id AS id')?[fixture(-3,'bad_debt','none')]:[]};}};
  const data=await readGpsWorkspace(db,'23','all','');
  assert.deepEqual(data.devices.map(r=>r.vehicle_status),['ready','using','bad_debt']);
  for(const q of queries.slice(0,2)){assert.match(q.sql,/v\.status AS vehicle_status/);assert.deepEqual(q.args,[23]);}
  const exported=gpsExportRows(data.devices,row=>row.management_status);
  const col=GPS_EXPORT_HEADERS.indexOf('Trạng thái xe'),gps=GPS_EXPORT_HEADERS.indexOf('Trạng thái GPS');
  assert.deepEqual(exported.map(row=>row[col]),['Lưu kho','Đang thuê','Nợ xấu']);
  assert.match(exported[0][gps],/ON/);assert.match(exported[1][gps],/OFF/);
  assert(exported.every(row=>row.length===GPS_EXPORT_HEADERS.length));
  const ui=fs.readFileSync(path.join(root,'components/management/GpsPage.tsx'),'utf8');
  assert.match(ui,/row\.vehicle_status===vehicleState/);
  assert.equal((ui.match(/\{vehicleStatus\(row\)\}/g)||[]).length,2);
  if(process.argv.includes('--live-read')){
    require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
    const c=await load(path.join(root,'lib/server/himoto-database')).himotoPool.connect();
    try{
      await c.query('BEGIN READ ONLY');await c.query("SET LOCAL statement_timeout='30s'");
      const actual=await readGpsWorkspace(c,'all','all','');
      const inventory=new Map((await c.query('SELECT id,status FROM himoto.vehicles WHERE deleted_at IS NULL')).rows.map(row=>[Number(row.id),row.status]));
      for(const row of actual.devices){if(row.vehicle_id===null)assert.equal(row.vehicle_status,null);else assert.equal(row.vehicle_status,inventory.get(row.vehicle_id));}
      console.log(`PASS READ ONLY: ${actual.devices.length} GPS/fleet rows match inventory status, including vehicles without GPS; no business writes`);
      await c.query('ROLLBACK');
    }finally{c.release();await globalThis.himotoPool?.end();}
  }
  console.log('PASS: GPS uses independent inventory status for mapped/unmapped fleet, store-scoped reads, desktop/mobile cards, status filter and matching Excel columns; ready+ON and using+OFF stay independent');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
