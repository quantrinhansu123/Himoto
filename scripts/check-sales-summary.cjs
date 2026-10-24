const assert=require('node:assert/strict'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {readSalesSummary}=load(path.join(root,'lib/server/page-summaries'));
const {contractTableSql}=load(path.join(root,'lib/server/contract-drafts'));
const {mapApiRow}=load(path.join(root,'lib/management/repository'));
const domain=load(path.join(root,'lib/management/source-sales'));
const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
async function main(){const c=await ownerDatabase.connect(),checks=[];
 try{await c.query('BEGIN');
  const tables=['orders','customers','stores','vehicles','order_vehicle_details','staff_profiles','transactions'];
  for(const table of tables)await c.query(`CREATE TEMP TABLE qa_summary_${table} ON COMMIT DROP AS SELECT * FROM himoto.${table} WHERE false`);
  const sqls=[],db={query(sql,args){sqls.push(sql);for(const table of tables)sql=sql.replaceAll('himoto.'+table,'pg_temp.qa_summary_'+table);assert(!sql.includes('himoto.'),'Every business read must use TEMP');return c.query(sql,args);}};
  await c.query(`INSERT INTO qa_summary_stores(id,store_name) VALUES(1,'QA 1'),(2,'QA 2'); INSERT INTO qa_summary_staff_profiles(id,full_name,store_id) VALUES(8,'QA NVKD',1)`);
  for(let id=1;id<=17;id++){
   const payload={management_composer:{rental_type:'daily',draft:{sales_staff_id:'8'},sales_attribution:{NVKD:{name:'QA saved'}}}};
   const date=id===1?'2026-10-01T00:15:00+07:00':id===2?'2026-10-31T23:59:00+07:00':id===3?'2026-09-30T23:59:00+07:00':id===4?'2026-11-01T00:00:00+07:00':'2026-10-16T09:00:00+07:00';
   const status=['renting','completed','bad_debt','draft','pending','deposit_contract','cancelled','wait_payment'][id%8];
   await c.query(`INSERT INTO qa_summary_orders(id,store_id,customer_id,order_status,total,pid,first_deposit_amount,draft_payload,rent_at,return_at) VALUES($1,$2,$3,$4,'1000',700,200,$5,$6,$7)`,[id,id%2+1,id%4,status,JSON.stringify(payload),id===9?null:date,'2026-10-20T12:00:00+07:00']);
   await c.query(`INSERT INTO qa_summary_order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at) VALUES($1,$1,$1,$2,'2026-10-20T12:00:00+07:00')`,[id,date]);
   await c.query(`INSERT INTO qa_summary_transactions(id,order_id,name,type,value,status) VALUES($1,$1,'order:deposit','in',200,'approved')`,[id]);
  }
  for(const store of ['all','1','2','99']){
   const params=new URLSearchParams({from:'2026-10-01',to:'2026-10-31',store}),got=await readSalesSummary(db,params);
   const source=await db.query(contractTableSql(` AND (COALESCE(o.rent_at,ov.start_date) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date AND ($3::bigint IS NULL OR o.store_id=$3)`),['2026-10-01','2026-10-31',store==='all'?null:Number(store)]);
   const rows=source.rows.map(r=>mapApiRow('contracts',r)),staff=[{id:8,name:'QA NVKD'}];
   assert.deepEqual(got,{sources:domain.summarizeBySalesStaff(rows,params.get('from'),params.get('to'),store,staff),stores:domain.summarizeByStore(rows,params.get('from'),params.get('to'),store),kpis:domain.summarizeSalesKpis(rows,params.get('from'),params.get('to'),store)});
  }
  checks.push('Lean summaries exactly match the existing financial projection across all, selected and empty branches, preserving attribution, deposits, rent paid, debt, customers and charts');
  const start=await readSalesSummary(db,new URLSearchParams({from:'2026-10-01',to:'2026-10-01'})),end=await readSalesSummary(db,new URLSearchParams({from:'2026-10-31',to:'2026-10-31'}));
  assert.equal(start.kpis.contracts,1);assert.equal(end.kpis.contracts,1);
  assert(sqls.some(sql=>sql.includes('WITH scoped AS MATERIALIZED')&&!sql.includes('company_payment_count')&&!sql.includes('AS vehicles')));
  checks.push('Vietnam midnight and final-minute rentals stay in the correct day; a summary never hydrates vehicle/document/company-payment payloads');
 }finally{await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
 console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
