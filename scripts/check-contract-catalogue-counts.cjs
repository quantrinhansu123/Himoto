const assert=require('node:assert/strict'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
const {readManagementTable}=load(path.join(root,'lib/server/management-table'));
const billing=load(path.join(root,'lib/management/contract-billing'));
const schema='qa_contract_catalogue',checks=[];
async function main(){const c=await ownerDatabase.connect();try{
 await c.query('BEGIN');await c.query(`CREATE SCHEMA ${schema}`);
 for(const table of ['users','stores','customers','staff_profiles','orders','vehicles','order_vehicle_details','transactions','management_contract_payments'])await c.query(`CREATE TABLE ${schema}.${table}(LIKE himoto.${table} INCLUDING DEFAULTS INCLUDING INDEXES)`);
 await c.query(`CREATE VIEW ${schema}.staff_account_attribution AS SELECT id,user_id,full_name,store_id FROM ${schema}.staff_profiles`);
 await c.query(`INSERT INTO ${schema}.stores(id,store_name) VALUES(80001,'A QA'),(80002,'B QA')`);
 const local=ms=>new Date(ms+7*3600000).toISOString().slice(0,16),now=Date.now();
 const plan=billing.createInstallmentPlan(local(now-20*86400000),local(now+40*86400000),'Theo tuần',100000);
 for(const [id,status,store,days,planned] of [[101,'renting',80001,5,false],[102,'renting',80001,-5,false],[103,'renting',80001,40,true],[104,'bad_debt',80001,-20,false],[105,'bad_debt',80001,40,true],[106,'completed',80001,-5,false],[107,'draft',80001,5,false],[108,'reserved',80001,10,false],[109,'renting',80002,5,false],[110,'cancelled',80001,-5,false]]){
   const payload={management_composer:{...(planned?{installment_plan:plan}:{}),...(status==='bad_debt'?{lifecycle:{bad_debt:{at:new Date(now-10*86400000).toISOString()}}}:{})}};
   await c.query(`INSERT INTO ${schema}.orders(id,contract_number,customer_name,store_id,order_status,order_type,total,pid,rent_at,return_at,draft_payload) VALUES($1,$2,$3,$4,$5,$6,'100000',0,now()-interval '25 days',$7,$8)`,[id,`QA-${id}`,id===104?'MATCH BAD QA':'Customer QA',store,status,planned?'ownership':'daily',new Date(now+days*86400000),JSON.stringify(payload)]);
 }
 const db={query:(sql,args)=>{const rewritten=sql.replaceAll('himoto.',schema+'.');assert(!rewritten.includes('himoto.'));return c.query(rewritten,args);}};
 const read=params=>readManagementTable(db,'contracts',new URLSearchParams({size:'2',scope_count:'1',status_counts:'1',...params}));
 const first=await read({}),second=await read({page:'2'});assert.equal(first.total,10);assert.equal(first.tabCount,10);assert.equal(first.scopeCount,10);assert.deepEqual(second.statusCounts,first.statusCounts);assert.deepEqual(second.summary,first.summary);
 const counts=new Map(first.statusCounts);assert.equal(counts.get('bad_debt'),2);assert.equal(counts.get('overdue'),2);assert.equal(counts.get('renting'),4);assert.equal(counts.get('reserved'),1);assert.equal(counts.get('draft'),1);
 checks.push('Contract tab counts and financial totals cover all pages; active overdue rentals overlap renting intentionally, while bad debt remains separate');
 const late=await read({status:'overdue'});assert.equal(late.total,2);assert.equal(late.summary.contractCount,2);assert.equal(late.summary.totalAmount,400000);assert.equal(late.summary.badDebtAmount,0);assert.deepEqual(late.statusCounts,first.statusCounts);
 const bad=await read({status:'bad_debt'});assert.equal(bad.total,2);assert.equal(bad.summary.totalAmount,0);assert.equal(bad.summary.receivableAmount,0);assert.equal(bad.summary.badDebtAmount,300000);
 checks.push('Unpaid ownership installments are classified before counting/paging; overdue excludes bad debt and bad-debt totals freeze at their own cutoff');
 const branch=await read({store:'80001'});assert.equal(branch.total,9);assert.equal(branch.scopeCount,9);assert.equal(new Map(branch.statusCounts).get('renting'),3);
 const search=await read({search:'MATCH BAD'});assert.equal(search.total,1);assert.equal(search.tabCount,1);assert.equal(search.scopeCount,10);assert.equal(new Map(search.statusCounts).get('bad_debt'),1);
 const type=await read({filter_rental_type:'ownership'});assert.equal(type.total,2);assert.equal(type.tabCount,2);assert.equal(new Map(type.statusCounts).get('overdue'),1);
 const empty=await read({store:'99999'});assert.equal(empty.total,0);assert.equal(empty.tabCount,0);assert.equal(empty.scopeCount,0);assert.equal(empty.summary.totalAmount,0);
 checks.push('Branch/search/type filters and empty results return matching counters and summaries without leaking another branch or treating a page length as the total');
 }finally{await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
 console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realSequenceChanges:0},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
