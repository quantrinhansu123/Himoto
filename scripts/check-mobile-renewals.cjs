require('./lib/offline-tests.cjs');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {NextRequest} = require('next/server');
const {load,root} = require('./lib/load-typescript.cjs');
const api = load(path.join(root,'lib/server/mobile-renewals'));
const domain = load(path.join(root,'lib/server/contract-payments'));
const database = load(path.join(root,'lib/server/himoto-database'));
const {dataAccess} = load(path.join(root,'lib/server/access-context'));
const {isMobileRenewalPreparation} = load(path.resolve(root,'../shared/mobile-renewals'));
const {createApi} = load(path.resolve(root,'../mobile/src/lib/api'));
const descriptor = Object.getOwnPropertyDescriptor(database.himotoPool,'connect');
const originalRead = domain.readPaymentContext;
const originalFetch = global.fetch;
const user = {id:7,role:'staff',access_role:'branch_staff',store_id:23,scope_all:false,permissions:['contracts.read','contracts.renew']};
const checks = [], statements = [];
let composer, context, evidencePresent, connects=0, refs;
function seed() {
  composer={versions:[{kind:'renewal',version:2},{kind:'renewal',version:5}],private_document:'Never project this'};
  refs=[{version:'7'},{version:'8'}]; evidencePresent=false;
  context={id:101,code:'HD-QA-101',status:'renting',store_id:23,revision:'100',total_amount:500000,paid_amount:100000,remaining:400000,
    accounts:[{id:1,kind:'cash',store_id:23,owner_type:'',label:'Két QA'},{id:1,kind:'bank',store_id:23,owner_type:'personal',label:'Cá nhân QA'},
      {id:2,kind:'bank',store_id:24,owner_type:'company',label:'Công ty QA'},{id:3,kind:'bank',store_id:24,owner_type:'personal',label:'Khác QA'}],
    history:[],items:Array.from({length:52},(_,i)=>({id:i+1,vehicle_id:i+100,name:`Xe Đỏ ${i+1}`,license:`QA-${i+1}`,revision:'10',return_at:'2026-11-02T08:00:00+07:00',daily_price:100000,renewal_amount:0}))};
}
const rows = values => ({rows:values,rowCount:values.length});
Object.defineProperty(database.himotoPool,'connect',{configurable:true,value:async()=>{
  connects++; const scope=structuredClone(dataAccess.getStore());
  assert(scope && scope.operation==='');
  return {release(){},async query(sql,values=[]) {
    statements.push({sql,values:structuredClone(values),scope});
    if (/^(BEGIN|SET |COMMIT|ROLLBACK)/.test(sql)) return rows([]);
    if (sql==='QA CONTEXT') {
      if (values[0]!==101 || (!scope.scope_all && scope.store_id!==23)) throw new domain.ContractPaymentError('Scoped missing',404);
      assert.equal(values[1].size,0); assert(Number.isSafeInteger(values[1].asOf));
      return rows([structuredClone(context)]);
    }
    if (sql.startsWith('SELECT draft_payload')) return rows([{draft_payload:{management_composer:structuredClone(composer)}}]);
    if (sql.includes('FROM himoto.management_contract_notifications')) return rows(refs);
    if (sql.includes('FROM himoto.management_record_photos')) return rows(evidencePresent?[{exists:1}]:[]);
    throw Error('Unexpected SQL: '+sql);
  }};
}});
domain.readPaymentContext=async(db,id,options)=>(await db.query('QA CONTEXT',[id,options])).rows[0];
const read=(query='',who=user)=>api.readMobileRenewalPreparation(who,'101',new NextRequest(`https://fixture.invalid/api/mobile/v1/contracts/101/renewals${query}`));
async function run() {
  seed(); const prepared=await read();
  assert(isMobileRenewalPreparation(prepared)); assert.equal(prepared.available,true); assert.equal(prepared.nextVersion,9);
  assert.equal(prepared.evidence.requiredForCollection,true); assert.equal(prepared.evidence.slot,'renewal-9-document-1'); assert.equal(prepared.evidence.present,false);
  assert(!JSON.stringify(prepared).includes('private_document')); assert(!('history' in prepared)); assert(!('draft_payload' in prepared));
  assert.deepEqual(prepared.accounts.map(row=>`${row.method}:${row.id}`).sort(),['cash:1','company_transfer:2','transfer:1']);
  assert(statements.some(row=>row.sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
  checks.push('Renewal preparation uses contracts.renew with a scoped read-only snapshot, explicit balances/accounts and no raw composer or financial history');

  assert.equal(prepared.items.rows.length,25); assert.equal(prepared.items.total,52); assert.equal(prepared.items.pages,3);
  const final=await read('?page=999'); assert.equal(final.items.page,3); assert.equal(final.items.rows.length,2);
  const searched=await read('?search=xe%20do%2052'); assert.equal(searched.items.total,1); assert.equal(searched.items.rows[0].id,52);
  const empty=await read('?search=missing'); assert.equal(empty.items.pages,1); assert.equal(empty.items.rows.length,0);
  checks.push('Vehicle selection projects 25 rows per page, clamps the final page and supports accent-insensitive search/empty states');

  evidencePresent=true; const withEvidence=await read(); assert.equal(withEvidence.evidence.present,true);
  const evidenceQuery=statements.filter(row=>row.sql.includes('FROM himoto.management_record_photos')).at(-1);
  assert.deepEqual(evidenceQuery.values,[101,'renewal-9-document-1','renewal-9-document-%']);
  composer.versions.push({kind:'renewal',version:12}); const newer=await read(); assert.equal(newer.nextVersion,13); assert.equal(newer.evidence.slot,'renewal-13-document-1');
  assert(!statements.some(row=>/^(INSERT|UPDATE|DELETE)/.test(row.sql)));
  checks.push('The next renewal version includes saved notification/payment references; bill evidence is checked only for that exact version without reserving a version or writing data');

  for (const [patch,extra] of [[{status:'draft'},{}],[{completed_from_hold:true},{}],[{hold_active:true},{}],[{items:[]},{}],[{total_amount:null},{}],[{}, {installment_plan:{version:1}}]]) {
    seed(); Object.assign(context,patch); Object.assign(composer,extra);
    const blocked=await read(); assert.equal(blocked.available,false); assert.equal(typeof blocked.blockedReason,'string');
  }
  checks.push('Ownership plans, holds/completion, unsupported states, missing active vehicles and invalid balances return a clear preparation gate');

  seed(); const before=connects;
  for (const query of ['?store=24','?page=0','?page=1&page=2','?search=a&search=b','?search='+ 'x'.repeat(81)]) await assert.rejects(()=>read(query),error=>error.code==='INVALID_QUERY');
  for (const who of [{...user,permissions:['contracts.read','finance.write'],access_role:'accounting'},{...user,permissions:['contracts.renew'],access_role:'custom'}]) await assert.rejects(()=>read('',who),error=>error.status===403);
  assert.equal(connects,before);
  await assert.rejects(()=>read('',{...user,store_id:24}),error=>error.status===404);
  assert.equal(statements.at(-1).sql,'ROLLBACK');
  context.items[0].revision='bad'; await assert.rejects(()=>read(),error=>error.code==='DATA_REVIEW_REQUIRED');
  for (const broken of [{...prepared,nextVersion:1},{...prepared,evidence:{...prepared.evidence,slot:'renewal-10-document-1'}},{...prepared,available:false},{...prepared,items:{...prepared.items,rows:[prepared.items.rows[0],prepared.items.rows[0],...prepared.items.rows.slice(2)]}}]) assert.equal(isMobileRenewalPreparation(broken),false);
  checks.push('Forged filters and missing grants fail before connecting; foreign resources remain hidden and malformed revisions/duplicate rows/wrong bill slots fail closed');
  const calls=[];
  const client=createApi('https://fixture.invalid','hm1_'+'a'.repeat(43));
  global.fetch=async(url,options)=>{calls.push({url,options});return Response.json(prepared);};
  assert.equal((await client.renewalPreparation('101',2,'xe đỏ / QA')).id,101);
  const called=new URL(calls[0].url); assert.equal(called.pathname,'/api/mobile/v1/contracts/101/renewals');
  assert.equal(called.searchParams.get('page'),'2');assert.equal(called.searchParams.get('search'),'xe đỏ / QA');
  assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.redirect,'error');
  assert.equal(calls[0].options.headers.Authorization,'Bearer hm1_'+'a'.repeat(43));
  for (const malformed of [{...prepared,id:102},{...prepared,revision:'bad'},{...prepared,evidence:{...prepared.evidence,slot:'renewal-2-document-1'}},{...prepared,items:{...prepared.items,total:0}}]) {
    global.fetch=async()=>Response.json(malformed);
    await assert.rejects(()=>client.renewalPreparation('101'),error=>error.code==='INVALID_RESPONSE');
  }
  checks.push('The native client binds preparation to the requested contract, encodes vehicle search/page and rejects malformed revisions/pages/bill versions while retaining origin-bound bearer-only requests');
  const result={passed:checks.length,checks,operationalWrites:0,scope:'Preparation service/DTO/native client only; write, recovery, media and UI remain unfinished',completedAt:new Date().toISOString()};
  fs.mkdirSync('.backups',{recursive:true}); fs.writeFileSync('.backups/mobile-renewal-preparation-results.json',JSON.stringify(result,null,2)+'\n'); console.log(JSON.stringify(result,null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
  domain.readPaymentContext=originalRead;
  global.fetch=originalFetch;
  if(descriptor)Object.defineProperty(database.himotoPool,'connect',descriptor);else delete database.himotoPool.connect;
});
