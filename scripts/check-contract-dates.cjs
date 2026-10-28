const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {readManagementTable}=load(path.join(root,'lib/server/management-table'));
const {mapApiRow}=load(path.join(root,'lib/management/repository'));
const {createContractDraft}=load(path.join(root,'lib/management/contract-document'));
const {vietnamRentalTime,rentalDayCount}=load(path.join(root,'lib/management/rental-time'));
const {withContractMonitoring}=load(path.join(root,'lib/management/contract-overdue'));
const empty={stores:[],staff:[],customers:[],vehicles:[],contracts:[]};
const checks=[];
async function main(){
 const raw={id:901,contract_number:'QA-DATES',status:'overdue',created_at:new Date('2026-10-18T10:28:22.074Z'),signed_on:'2026-10-18',start_date:new Date('2026-10-18T10:19:00Z'),end_date:new Date('2026-10-19T10:19:00Z'),vehicles:[]};
 const queries=[];
 const list=await readManagementTable({async query(sql){
  queries.push(sql);if(queries.length===1)return{rows:[{...raw,__total_count:1}]};
  assert.match(sql,/o\.created_at/);assert.match(sql,/o\.contract_signed_on::text AS signed_on/);return{rows:[raw]};
 }},'contracts',new URLSearchParams({search:'QA-DATES',size:'10'}));
 const draft=createContractDraft(empty,'all',list.rows[0]);
 assert.equal(list.rows[0].created_at,'2026-10-18T10:28:22.074Z');assert.equal(list.rows[0].signed_on,'2026-10-18');
 assert.equal(draft.created_on,'2026-10-18');assert.equal(draft.signed_on,'2026-10-18');
 assert.equal(draft.start_date,'2026-10-18T17:19');assert.equal(draft.end_date,'2026-10-19T17:19');
 checks.push('Opening a paged contract keeps database creation/signing dates and rental times instead of inserting today');
 for(const signed_on of [new Date('2026-10-17T17:00:00Z'),'2026-10-17T17:00:00Z','2026-10-18']){
  const row=mapApiRow('contracts',{...raw,created_at:new Date('2026-10-17T17:05:00Z'),signed_on});
  const result=createContractDraft(empty,'all',row);assert.equal(result.created_on,'2026-10-18');assert.equal(result.signed_on,'2026-10-18');
 }
 checks.push('Vietnam calendar dates survive PostgreSQL Date values, ISO timestamps and plain SQL dates at midnight');
 const unknown=createContractDraft(empty,'all',{id:2,code:'QA-MISSING',status:'renting'});
 assert.equal(unknown.created_on,'');assert.equal(unknown.signed_on,'');
 const fresh=createContractDraft(empty,'all');assert.equal(fresh.created_on,vietnamRentalTime().slice(0,10));assert.equal(fresh.signed_on,fresh.created_on);
 checks.push('Existing records with missing dates stay blank; only a new contract receives today as a default');
 const saved={...fresh,created_on:'2026-08-01',signed_on:'2026-08-02'};
 const restored=createContractDraft(empty,'all',{id:3,status:'draft',draft_json:JSON.stringify(saved),created_at:'2026-10-18T10:28:00Z'});
 assert.equal(restored.created_on,'2026-08-01');assert.equal(restored.signed_on,'2026-08-02');
 checks.push('Saved draft dates retain their explicit values');
 const late=withContractMonitoring({...list.rows[0],overdue_items_json:JSON.stringify([{return_at:'2026-10-19T10:19:00Z',daily_price:300000}])},Date.parse('2026-10-29T00:00:00+07:00'));
 assert.equal(rentalDayCount(draft.start_date,draft.end_date),'1');assert.equal(late.overdue_days,9);
 checks.push('One contracted rental day is distinct from nine elapsed overdue days on 29 October');
 if(process.argv.includes('--live-read')){
  require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
  const db=load(path.join(root,'lib/server/himoto-database')).ownerDatabase,c=await db.connect();
  try{
   await c.query('BEGIN READ ONLY');await c.query("SET LOCAL statement_timeout='15s'");
   for(const scope of ['','overdue']){
    const page=await readManagementTable(c,'contracts',new URLSearchParams({search:'007180',scope,size:'10',status_counts:'1'}));
    assert.equal(page.total,1);const row=page.rows[0],detail=createContractDraft(empty,'all',row);
    assert.equal(row.id,57506);assert.equal(detail.created_on,'2026-10-18');assert.equal(detail.signed_on,'2026-10-18');
    assert.equal(detail.start_date,'2026-10-18T17:19');assert.equal(detail.end_date,'2026-10-19T17:19');
    assert.equal(new Map(page.statusCounts).get('overdue'),1);
    if(scope==='overdue')assert(row.overdue_days>1);
   }
   checks.push('READ ONLY: contract 007180 has identical correct dates in normal/overdue lists; tab badge counts one contract, not one overdue day');
  }finally{await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
 }
 console.log(JSON.stringify({passed:checks.length,checks,businessWrites:0},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
