const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {vehicleRevenue,rentalOverview}=load(path.join(root,'lib/server/rental-reports'));
const {rentalRevenue}=load(path.join(root,'lib/server/rental-revenue'));
const {validRentalReport}=load(path.join(root,'lib/management/rental-reports'));
const params=(extra='')=>new URLSearchParams(`from=2026-10-23&to=2026-10-23&store_id=1&${extra}`);
async function main(){
  const checks=[],unused={query(){throw Error('Invalid input reached SQL');}};
  for(const extra of ['from=2026-02-30','from=2026-10-24','store_id=0','size=0','sort=invalid','direction=desc;drop table','vehicle_id=-1']){
    const query=params();for(const [key,value] of new URLSearchParams(extra))query.set(key,value);
    await assert.rejects(vehicleRevenue(unused,query),/không hợp lệ/);
  }
  await assert.rejects(rentalOverview(unused,params('view=invalid')),/không hợp lệ/);
  checks.push('Invalid dates, reversed periods, IDs, pagination and SQL sort input fail before database access');
  if(process.argv.includes('--live-temp')){
    require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
    const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database')),c=await ownerDatabase.connect();
    const tables=['vehicles','orders','order_vehicle_details','transactions','users','cash','stores','banks','battery_contracts','management_contract_payments','staff_profiles'];
    const db={query(sql,values){const rewritten=sql.replaceAll('himoto.','pg_temp.');assert(!rewritten.includes('himoto.'));return c.query(rewritten,values);}};
    try{
      await c.query('BEGIN');
      for(const table of tables)await c.query(`CREATE TEMP TABLE ${table} ON COMMIT DROP AS SELECT * FROM himoto.${table} WHERE false`);
      await c.query("INSERT INTO pg_temp.stores(id,store_name) VALUES(1,'CS QA 1'),(2,'CS QA 2'); INSERT INTO pg_temp.users(id,name) VALUES(7,'QA')");
      let expected=0;
      for(let i=1;i<=13;i++){
        await c.query("INSERT INTO pg_temp.vehicles(id,name,license,type,year,store_id,current_store_id,status) VALUES($1,$2,$3,'xeso',2022,1,1,'ready')",[1000+i,`Xe QA ${i}`,`29B1-${String(i).padStart(5,'0')}`]);
        await c.query("INSERT INTO pg_temp.orders(id,contract_number,order_status,store_id) VALUES($1,$2,'completed',1)",[7000+i,`QA-${i}`]);
        const fee=i*100,adjustment=i===3?-20:10,handler=i===2?150:0;expected+=handler||fee+adjustment;
        await c.query("INSERT INTO pg_temp.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,total_money,money_out_date,handler_price) VALUES($1,$2,$3,'2026-10-23T00:00:00+07:00','2026-10-24T10:00:00+07:00',$4,$5,$6)",[i,7000+i,1000+i,fee,adjustment,handler]);
      }
      await c.query(`INSERT INTO pg_temp.vehicles(id,name,license,type,year,store_id,current_store_id,status) VALUES(2001,'Other branch','29B2-99999','xeso',2023,2,2,'ready');
        INSERT INTO pg_temp.orders(id,contract_number,order_status,store_id,draft_payload) VALUES
        (8001,'OTHER','completed',2,NULL),(8002,'DRAFT','draft',1,NULL),(8003,'BATTERY','completed',1,'{"legacy_migration":{"sourceStoreId":30}}');
        INSERT INTO pg_temp.order_vehicle_details(id,order_id,vehicle_id,rent_at,total_money,money_out_date) VALUES
        (100,8001,2001,'2026-10-23T10:00:00+07:00',500,0),
        (101,8002,1001,'2026-10-23T10:00:00+07:00',99999,0),
        (102,7001,1001,'2026-10-22T23:59:59+07:00',99999,0),
        (103,7001,1001,'2026-10-24T00:00:00+07:00',99999,0),
        (104,8003,1001,'2026-10-23T10:00:00+07:00',99999,0);
        INSERT INTO pg_temp.order_vehicle_details(id,order_id,vehicle_id,rent_at,total_money,deleted_at) VALUES(105,7001,1001,'2026-10-23T10:00:00+07:00',99999,now());`);
      const first=await vehicleRevenue(db,params());assert.equal(first.total,13);assert.equal(first.rows.length,10);assert.equal(first.revenue,expected);assert.equal(first.rentals,13);
      const last=await vehicleRevenue(db,params('page=999'));assert.equal(last.page,2);assert.equal(last.rows.length,3);assert.equal(last.revenue,expected);
      const ids=[...first.rows,...last.rows].map(row=>row.id);assert.equal(new Set(ids).size,13);
      const all=await vehicleRevenue(db,params('mode=all'));assert.equal(all.rows.length,13);assert.equal(all.rows.reduce((sum,row)=>sum+row.revenue,0),expected);
      assert(validRentalReport('vehicle-revenue',first,params()));assert(validRentalReport('vehicle-revenue',all,params('mode=all')));
      assert(!validRentalReport('vehicle-revenue',{...first,rows:[]},params()));
      assert(!validRentalReport('vehicle-revenue',{...all,revenue:all.revenue+1},params('mode=all')));
      assert(!validRentalReport('vehicle-revenue',{...first,rows:[null]},params()));
      assert.equal(all.rows.find(row=>row.id===1002).revenue,150);assert.equal(all.rows.find(row=>row.id===1003).revenue,280);
      checks.push('TEMP PostgreSQL: legacy handler override and signed early/late adjustments match, all 13 vehicles paginate without missing IDs, global totals and full export reconcile');
      const detail=await vehicleRevenue(db,params('vehicle_id=1002'));assert.equal(detail.length,1);assert.equal(detail[0].revenue,150);
      assert(validRentalReport('vehicle-revenue',detail,params('vehicle_id=1002')));
      assert.deepEqual(await vehicleRevenue(db,params('vehicle_id=2001')),[]);
      const empty=await vehicleRevenue(db,params('search=does-not-exist'));assert.equal(empty.total,0);assert.equal(empty.page,1);assert.equal(empty.revenue,0);
      checks.push('TEMP: detail agrees with selected vehicle; branch/date boundaries, drafts, deleted lines and legacy battery anchors are excluded; empty searches return genuine zeros');
      await c.query(`INSERT INTO pg_temp.orders(id,contract_number,order_status,store_id,total_rental_fees,draft_payload) VALUES
        (8200,'NATIVE-MULTI','completed',1,101,'{"management_composer":{"draft":{"vehicles":[{"id":"1001"},{"id":"1002"}]},"return_adjustments":[{"item_id":201,"late_fee":30,"repair_fee":50,"fee":80},{"item_id":202,"late_fee":0,"early_discount":20,"fee":-20}]}}');
        INSERT INTO pg_temp.order_vehicle_details(id,order_id,vehicle_id,rent_at,total_money,total_renewal_amount) VALUES
        (201,8200,1001,'2026-10-23T09:00:00+07:00',151,40),(202,8200,1002,'2026-10-23T09:00:00+07:00',0,60);`);
      const nativeA=(await vehicleRevenue(db,params('vehicle_id=1001'))).find(row=>row.order_id===8200),nativeB=(await vehicleRevenue(db,params('vehicle_id=1002'))).find(row=>row.order_id===8200);
      assert.deepEqual([nativeA.rental,nativeA.renewal,nativeA.adjustment,nativeA.revenue],[51,40,30,121]);
      assert.deepEqual([nativeB.rental,nativeB.renewal,nativeB.adjustment,nativeB.revenue],[50,60,-20,90]);
      assert.equal(nativeA.rental+nativeB.rental,101);
      checks.push('TEMP: native multi-vehicle rental base splits exactly including odd dong, per-line renewal and return adjustment are included, repair fees are excluded and totals are not placed on only the first vehicle');
      const fixtures=[['order:deposit','in',1000],['order:rental_fees','in',100],['addon','addon',40],['order:return_late','in',50],['order:deposit_refund','out',300],['order:rental_refund','out',20],['order:return_repair','in',7],['order:extra','in',9],['unknown','addon',5]];
      for(let i=0;i<fixtures.length;i++){const[name,type,value]=fixtures[i];await c.query("INSERT INTO pg_temp.transactions(id,order_id,name,type,value,status,user_id,store_id,created_at) VALUES($1,7001,$2,$3,$4,'approved',7,1,'2026-10-23T10:00:00+07:00')",[9000+i,name,type,value]);}
      await c.query(`INSERT INTO pg_temp.transactions(id,order_id,name,type,value,status,user_id,store_id,created_at) VALUES
        (9100,8001,'order:rental_fees','in',500,'approved',7,2,'2026-10-23T10:00:00+07:00'),
        (9101,7001,'order:rental_fees','in',99999,'pending',7,1,'2026-10-23T10:00:00+07:00'),
        (9102,7001,'order:rental_fees','in',99999,'approved',7,1,'2026-10-22T23:59:59+07:00'),
        (9103,7001,'order:rental_fees','in',99999,'approved',7,1,'2026-10-24T00:00:00+07:00'),
        (9104,8003,'order:rental_fees','in',99999,'approved',7,1,'2026-10-23T10:00:00+07:00');`);
      const stores=await rentalOverview(db,params()),days=await rentalOverview(db,params('view=days'));
      assert.equal(stores.rows.length,1);assert.equal(stores.total.revenue,170);assert.equal(stores.total.income,1190);assert.equal(stores.total.expense,320);
      assert.deepEqual(stores.total,days.total);assert.equal(days.rows[0].key,'2026-10-23');assert.equal(stores.total.breakdown.other_income,5);
      assert(validRentalReport('rental-overview',stores,params()));assert(validRentalReport('rental-overview',days,params('view=days')));
      assert(!validRentalReport('rental-overview',{...stores,rows:[]},params()));
      assert(!validRentalReport('rental-overview',{...stores,total:{...stores.total,income:0}},params()));
      assert(!validRentalReport('rental-overview',{...stores,rows:[null]},params()));
      const actual=await rentalRevenue(db,'2026-10-23','2026-10-23',1);assert.deepEqual(actual.total,{rental:100,renewal:40,late:50,early:20,revenue:170});assert.equal(actual.unclassified_amount,5);
      checks.push('TEMP: store/day overview obeys all three requested formulas, legacy addon renewal counts once, unknown addons remain separate, approved receipts and Vietnam dates drive actual money');
      checks.push('Client validation rejects missing page records, malformed rows and non-reconciling money before rendering or exporting financial reports');
    }finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}
  }
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,productionSequenceChanges:0},null,2));
}
main().catch(error=>{console.error(error.name,error.code||'',error.message);process.exitCode=1;});
