require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path');
const{load,root}=require('./lib/load-typescript.cjs');
(async()=>{
  const checks=[],{contractAttentionGroups}=load(path.join(root,'lib/server/mobile-notifications'));
  const now=Date.parse('2026-11-16T10:00:00+07:00'),row=(id,patch)=>({id,code:'QA'+id,name:'QA',status:'renting',...patch});
  const groups=contractAttentionGroups([
    row(1,{end_date:'2026-11-16T11:00'}),row(2,{billing_next_due_at:'2026-11-17T10:00'}),
    row(3,{end_date:'2026-11-17T10:01'}),row(4,{status:'overdue',end_date:'2026-11-15T10:00'}),
    row(5,{status:'bad_debt'}),row(6,{collection_overdue:1,billing_next_due_at:'2026-11-16T12:00'}),
    row(7,{end_date:'invalid'}),row(8,{end_date:'2026-11-16T11:00',billing_error:'invalid plan'}),
    row(9,{status:'completed',end_date:'2026-11-16T11:00'}),row(10,{end_date:'2026-11-16T10:00'}),
  ],now);
  assert.deepEqual(groups.due.map(r=>r.id),[1,2]);assert.deepEqual(groups.overdue.map(r=>r.id),[4,5,6]);
  checks.push('Upcoming is a Vietnam-local 24-hour window; invalid billing/completed/far-future items do not notify, overdue/payment arrears have no duplicate upcoming group');
  const{notificationPushPolicy}=load(path.resolve('shared/notification-push-policy'));
  const group={kind:'due',fingerprint:'next',rows:[{id:1},{id:2}]},first=notificationPushPolicy(group,{},now);assert(first.added&&!first.throttled);
  const prior={'due:members':first.members,'due:sentAt':String(now)};
  assert(!notificationPushPolicy({...group,rows:[{id:1}]},prior,now+1000).added);
  assert(notificationPushPolicy({...group,rows:[{id:1},{id:3}]},prior,now+1000).throttled);
  assert(!notificationPushPolicy({...group,rows:[{id:1},{id:3}]},prior,now+7200001).throttled);
  checks.push('Resolved work does not sound again; new deadlines are rate-limited for two hours and actionable non-financial groups retain distinct state');
  const{createThumbnailReader}=load(path.join(root,'lib/management/thumbnail-read')),read=createThumbnailReader();let calls=0,resolve;
  const pending=()=>{calls++;return new Promise(r=>{resolve=r})},a=read('vehicle1',pending),b=read('vehicle1',pending);assert.equal(calls,1);resolve('revision1');assert.deepEqual(await Promise.all([a,b]),['revision1','revision1']);
  await read('vehicle1',async()=>{calls++;return'revision2'});assert.equal(calls,2);await assert.rejects(read('other',async()=>{throw Error('401')}));await read('other',async()=>{calls++;return''});
  checks.push('Duplicate thumbnail metadata reads coalesce only in flight; refresh revalidates and rejection cannot poison a later read');
  const{readIntegrationSettings}=load(path.join(root,'lib/server/integration-settings'));const sql=[];
  await readIntegrationSettings({query:async text=>{sql.push(text);return{rows:[]}}},false);
  assert(!sql.some(s=>/count\(\*\)|secret_cipher|bot_cipher\s*FROM/.test(s)));
  const{readIntegrationHealth}=load(path.join(root,'lib/server/integration-health'));
  const health=await readIntegrationHealth({query:async()=>({rows:[{streams:2,completed_streams:1,failed_streams:0,behind_streams:1,inaccessible_streams:0,covered_until:null,last_success_at:null,waiting_webhooks:0}]})},async()=>({history_events:100,webhook_events:2,counts_at:new Date(now).toISOString()}));
  assert(load(path.resolve('shared/mobile-integrations')).isIntegrationHealth(health));
  checks.push('Lightweight configuration skips event counts; independently loaded health preserves its own observation timestamp and validates exact integer counters');
  console.log(JSON.stringify({ok:true,checks,businessWrites:0,providerRequests:0},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
