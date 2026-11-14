// Synthetic data and real Query/SQLite engines. Never reads .env or device data.
require('./lib/offline-tests.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { load } = require('./lib/load-typescript.cjs');
const { QueryClient, QueryObserver } = require('../mobile/node_modules/@tanstack/react-query');
const mobile = file => load(path.resolve('mobile/src/lib', file));
const { createOfflineStore } = mobile('offline-store');
const { offlineScopeKey, OFFLINE_TTL } = mobile('offline-policy');
const { rememberRecordPreview, recordPreviewKey } = mobile('record-preview');
const { lookupSnapshot, persistableLookup, restoreLookupQueries, persistLookupQueries, refreshActiveLookups } = mobile('query-persistence');
const { cachedMobileSession } = mobile('session-bootstrap');
const { ApiError } = mobile('api');
const pause = () => new Promise(resolve => setTimeout(resolve, 20));
async function main() {
  const checks = [], sql = new DatabaseSync(':memory:');
  const adapter = { execAsync: async s => sql.exec(s), runAsync: async (s,...v) => sql.prepare(s).run(...v),
    getFirstAsync: async (s,...v) => sql.prepare(s).get(...v) || null, getAllAsync: async (s,...v) => sql.prepare(s).all(...v) };
  const store = await createOfflineStore(adapter);
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30000, retry: false, gcTime: 300000 } } });
  const origin = 'https://fixture.invalid', user = { id: 7, role: 'staff', storeId: 23, allStores: false, permissions: ['vehicles.read','contracts.read'], name: 'Fixture', email: 'qa@example.invalid' };
  const scope = offlineScopeKey({ origin, user });
  let stop = () => {};
  try {
    const key = ['record',7,'contracts','42'], oldAt = Date.now()-60000;
    client.setQueryData(key,{id:42,status:'renting'},{updatedAt:oldAt});
    rememberRecordPreview(client,origin,user,'contracts',{id:42,status:'returned'});
    assert.equal(client.getQueryState(key).dataUpdatedAt,oldAt);
    assert.equal(client.getQueryData(recordPreviewKey(origin,user,'contracts','42')).status,'returned');
    assert.equal(client.getQueryData(recordPreviewKey(origin,{...user,storeId:24},'contracts','42')),undefined);
    let calls=0;
    const observer = new QueryObserver(client,{queryKey:key,queryFn:async()=>{calls++;return{id:42,status:'returned'};},refetchOnMount:'always'});
    const unsubscribe=observer.subscribe(()=>{}); await pause();
    assert.equal(calls,1); assert.equal(observer.getCurrentResult().data.status,'returned'); unsubscribe();
    checks.push('List previews do not freshen old details; opening detail revalidates and preview keys cannot cross a branch');

    const savedAt=Date.now()-45000, listKey=['catalogue',7,23,false,'vehicles'];
    await store.cacheQuery(scope,'fixture',lookupSnapshot(listKey,{pages:[{rows:[{id:11}]}],pageParams:[1]},savedAt));
    await restoreLookupQueries(client,store,scope,()=>true);
    assert.equal(client.getQueryData(listKey).pages[0].rows[0].id,11);
    assert.equal(client.getQueryState(listKey).dataUpdatedAt,savedAt);
    const other = new QueryClient();
    await restoreLookupQueries(other,store,offlineScopeKey({origin,user:{...user,id:8}}),()=>true);
    assert.equal(other.getQueryData(listKey),undefined); other.clear();
    const cancelled = new QueryClient(); await restoreLookupQueries(cancelled,store,scope,()=>false);
    assert.equal(cancelled.getQueryData(listKey),undefined); cancelled.clear();
    checks.push('SQLite lookup hydration preserves original freshness, isolates accounts and stops after session replacement');

    for(const family of ['return-preparation','renewal-preparation','payment','contract-qr','record-media','managed-accounts','battery','shift-snapshot','draft-edit'])
      assert.equal(persistableLookup([family,7]),false);
    assert.equal(persistableLookup(['catalogue','hm1_'+'a'.repeat(43)]),false);
    const snapshot=lookupSnapshot(listKey,{pages:[1,2,3,4,5],pageParams:[1,2,3,4,5]},savedAt);
    assert.deepEqual(snapshot.data,{pages:[1,2,3],pageParams:[1,2,3]});
    await store.cacheQuery(scope,'expired',{key:['operations',7],data:{stale:true},updatedAt:Date.now()-OFFLINE_TTL-1});
    await restoreLookupQueries(client,store,scope,()=>true);
    assert.equal(client.getQueryData(['operations',7]),undefined);
    checks.push('Only read-only lookup families persist; credentials/preparations/receipts/media are excluded and infinite cache is bounded');

    stop=persistLookupQueries(client,store,scope,()=>true);
    client.setQueryData(['dashboard',7],{total:123}); await pause();
    assert((await store.readQueries(scope)).some(r=>r.key[0]==='dashboard'));
    await client.invalidateQueries({queryKey:['dashboard']}); await pause();
    assert(!(await store.readQueries(scope)).some(r=>r.key[0]==='dashboard'));
    client.setQueryData(['overview',7],{total:5}); await pause();
    await store.clearCache(scope); assert.equal((await store.readQueries(scope)).length,0);
    checks.push('Lookup success persists; invalidation and confirmed write cache clearing cannot resurrect an old stored report');
    const offlineKey=['staff-organization',7], offlineAt=Date.now()-45000;
    client.setQueryData(offlineKey,{rows:[{id:7}]},{updatedAt:offlineAt});
    const offlineObserver=new QueryObserver(client,{queryKey:offlineKey,queryFn:async()=>{throw new ApiError('Offline fixture',0,'NETWORK');},retry:false});
    const unobserve=offlineObserver.subscribe(()=>{});await pause();
    assert.equal(offlineObserver.getCurrentResult().isSuccess,true);
    assert.equal(client.getQueryState(offlineKey).dataUpdatedAt,offlineAt);
    assert.equal(offlineObserver.getCurrentResult().data.rows[0].id,7);unobserve();
    const deniedKey=['directory',7,'staff'];client.setQueryData(deniedKey,{rows:[{id:7}]},{updatedAt:offlineAt});
    const denied=new QueryObserver(client,{queryKey:deniedKey,queryFn:async()=>{throw new ApiError('Denied fixture',403,'FORBIDDEN');},retry:false});
    const undenied=denied.subscribe(()=>{});await pause();assert.equal(denied.getCurrentResult().isError,true);assert.equal(denied.getCurrentResult().data,undefined);undenied();
    checks.push('Failed background refresh keeps a cached lookup visible without freshening it; permission denial is never converted to cached success');

    const stored={origin,token:'hm1_'+'a'.repeat(43),user,expiresAt:new Date(Date.now()+60000).toISOString(),verifiedAt:Date.now()-1000};
    assert.equal(cachedMobileSession(stored).user.id,7);
    assert.equal(cachedMobileSession({...stored,verifiedAt:Date.now()-OFFLINE_TTL}),null);
    assert.equal(cachedMobileSession({...stored,verifiedAt:Date.now()+60000}),null);
    assert.equal(cachedMobileSession({...stored,expiresAt:new Date(Date.now()-1).toISOString()}),null);
    assert.equal(cachedMobileSession({...stored,user:undefined}),null);
    assert.equal(cachedMobileSession({...stored,expiresAt:new Date(Date.now()-1).toISOString(),refreshToken:'hmr2_'+'b'.repeat(43),refreshExpiresAt:new Date(Date.now()+86400000).toISOString()}).user.id,7);
    checks.push('Immediate session bootstrap reuses only the existing 24h grant and valid session family; no verification timestamp is extended');
    const focus=new QueryClient({defaultOptions:{queries:{staleTime:30000,retry:false}}}),callsByKind={old:0,fresh:0,prep:0,inactive:0};
    const observers=[];
    for(const [kind,key,age]of [['old',['catalogue',7],60000],['fresh',['overview',7],0],['prep',['return-preparation',7],60000],['inactive',['dashboard',7],60000]]){
      focus.setQueryData(key,{ok:true},{updatedAt:Date.now()-age});
      if(kind!=='inactive'){const observer=new QueryObserver(focus,{queryKey:key,refetchOnMount:false,queryFn:async()=>{callsByKind[kind]++;await pause();return{ok:true};}});observers.push(observer.subscribe(()=>{}));}
    }
    await Promise.all([refreshActiveLookups(focus),refreshActiveLookups(focus)]);
    assert.deepEqual(callsByKind,{old:1,fresh:0,prep:0,inactive:0});observers.forEach(unsubscribe=>unsubscribe());focus.clear();
    checks.push('Returning to a kept-alive tab refreshes stale active lookups once, reuses in-flight reads and excludes fresh/inactive/transaction queries');
    for(let i=0;i<60;i++)await store.cacheQuery(scope,'quota-'+i,{key:['dashboard',7,i],data:{value:'\u0110'.repeat(60000)},updatedAt:Date.now()});
    const quota=sql.prepare('SELECT count(*) AS n, sum(length(CAST(body AS BLOB))) AS bytes FROM lookup_queries').get();
    assert(quota.n<=40 && quota.bytes<=4194304);
    checks.push('Persistent lookup cache stays within 40 entries / 4 MiB even for multibyte text; pending business writes are not evicted');
    console.log(JSON.stringify({ok:true,checks,operationalWrites:0,deviceBenchmark:false},null,2));
  } finally { stop(); client.clear(); sql.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
