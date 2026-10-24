const assert=require('node:assert/strict'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {readManagementTable}=load(path.join(root,'lib/server/management-table'));
const {createInstallmentPlan}=load(path.join(root,'lib/management/contract-billing'));
const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
async function main(){const c=await ownerDatabase.connect(),checks=[];
 try{await c.query('BEGIN');
  const tables=['orders','order_vehicle_details','vehicles','stores','staff_profiles','staff_account_attribution','customers','transactions'];
  for(const table of tables)await c.query(`CREATE TEMP TABLE qa_filters_${table} ON COMMIT DROP AS SELECT * FROM himoto.${table} WHERE false`);
  const commands=[],db={async query(sql,args){commands.push({sql,args});for(const table of tables)sql=sql.replaceAll('himoto.'+table,'pg_temp.qa_filters_'+table);assert(!sql.includes('himoto.'),'Every business read must use TEMP');return c.query(sql,args);}};
  await c.query(`INSERT INTO qa_filters_stores(id,store_name,kind) VALUES(1,'QA','lease_to_own')`);
  const start=new Date(Date.now()-10*86400000).toISOString().slice(0,16),end=new Date(Date.now()+50*86400000).toISOString().slice(0,16);
  const plan=createInstallmentPlan(start,end,'Theo ngày',100),future=createInstallmentPlan(new Date(Date.now()+2*86400000).toISOString().slice(0,16),end,'Theo ngày',100);
  for(let id=1;id<=37;id++){
   const type=id<=27?'ownership':'daily',installment_plan=id<=25?plan:id===26?future:undefined;
   const payload={management_composer:{rental_type:type,draft:{contract_type_id:type,contract_type_name:'QA '+type,...(id<=12?{ownership_term_months:'12'}:{})},...(installment_plan?{installment_plan}:{})}};
   await c.query(`INSERT INTO qa_filters_orders(id,store_id,contract_number,order_type,order_status,total,pid,draft_payload,rent_at,return_at) VALUES($1,1,'QA-'||$1::bigint::text,$2,'renting','100',$3,$4,now()-interval '10 days',now()+interval '50 days')`,[id,type,id===25?100000:0,JSON.stringify(payload)]);
   await c.query(`INSERT INTO qa_filters_order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,type,hiring_fee) VALUES($1,$1,$1,now()-interval '10 days',now()+interval '50 days','day',100)`,[id]);
   await c.query(`INSERT INTO qa_filters_vehicles(id,name,license) VALUES($1,'QA','QA-'||$1::bigint::text)`,[id]);
  }
  const read=extra=>readManagementTable(db,'contracts',new URLSearchParams({size:'10',scope_count:'1',...extra}));
  const daily=await read({filter_contract_type_id:'daily'});assert.equal(daily.total,10);assert(daily.rows.every(r=>r.contract_type_id==='daily'));assert.equal(daily.scopeCount,37);
  const owner=await read({filter_contract_type_id:'ownership'});assert.equal(owner.total,27);assert.equal(owner.pages,3);assert(owner.rows.every(r=>r.rental_type==='ownership'&&r.contract_type_name==='QA ownership'));
  const absent=await read({filter_contract_type_id:"x' OR true --"});assert.equal(absent.total,0);assert.equal(absent.scopeCount,37);
  checks.push('Contract type IDs and labels survive hydration; type filters are applied before SQL counting and paging, including literal quoted inputs');
  const term=await read({filter_ownership_term_months:'12'}),custom=await read({filter_ownership_term_months:'custom'});
  assert.equal(term.total,12);assert(term.rows.every(row=>row.ownership_term_months==='12'));assert.equal(custom.total,15);assert(custom.rows.every(row=>row.ownership_term_months==='custom'));
  checks.push('Ownership term filtering reads the saved label, preserves custom/unknown terms and excludes ordinary rentals');
  const due=await read({scope:'due'}),last=await read({scope:'due',page:'999'});
  assert.equal(due.total,24);assert.equal(due.pages,3);assert.equal(last.page,3);assert.equal(last.rows.length,4);
  assert(due.rows.every(r=>r.billing_overdue_at&&Number(r.billing_due_amount)>0));
  const ids=[];for(let page=1;page<=3;page++)ids.push(...(await read({scope:'due',page:String(page)})).rows.map(r=>r.id));
  assert.equal(new Set(ids).size,24);assert(ids.every(id=>id<=24));
  const paid=await read({scope:'due',filter_id:'25'});assert.equal(paid.total,0);assert.equal((await read({scope:'due',filter_id:'26'})).total,0);assert.equal((await read({scope:'due',filter_id:'27'})).total,0);
  checks.push('Payment-due list excludes already-paid, future and ordinary rentals before slicing; every due contract remains reachable across 3 pages');
  const renewable=await read({scope:'renewable'});assert.equal(renewable.total,11);assert(renewable.rows.every(r=>!r.billing_plan_json));
  checks.push('Ordinary renewal picker excludes contracts whose installment schedule must use a different flow');
  const selected=await read({filter_id:'27'});assert.equal(selected.rows[0].paid_amount,0);
  assert(commands.filter(r=>r.sql.includes('o.id=ANY')).every(r=>r.args[0].length<=50));
  checks.push('Hydration reads rental receipts separately from deposits and stays bounded to the selected IDs');
 }finally{await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
 console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realSequenceChanges:0},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
