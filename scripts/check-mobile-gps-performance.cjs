// Real Query/SQLite engines, synthetic data only. No env, provider or device access.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {QueryClient,InfiniteQueryObserver}=require('../mobile/node_modules/@tanstack/react-query');
const {NextRequest}=require('next/server');
const {load,root}=require('./lib/load-typescript.cjs');
const mobile=name=>load(path.resolve('mobile/src/lib',name));

(async()=>{
  const checks=[],sql=new DatabaseSync(':memory:');
  const adapter={execAsync:async s=>sql.exec(s),runAsync:async(s,...v)=>sql.prepare(s).run(...v),getFirstAsync:async(s,...v)=>sql.prepare(s).get(...v)||null,getAllAsync:async(s,...v)=>sql.prepare(s).all(...v)};
  const dto=load(path.resolve('shared/mobile-gps.ts')),policy=mobile('offline-policy'),{ApiError,createApi}=mobile('api');
  const {createOfflineStore}=mobile('offline-store'),{createOfflineTransport}=mobile('offline-transport'),{offlineStatus}=mobile('offline-status');
  const {lookupSnapshot,restoreLookupQueries}=mobile('query-persistence');
  const origin='https://fixture.invalid',user={id:7,name:'QA',email:'qa@example.invalid',role:'staff',storeId:23,allStores:false,permissions:['vehicles.read']};
  const scope=policy.offlineScopeKey({origin,user}),at=Date.now(),query={...dto.defaultGpsQuery};let now=at;
  const sample={query,page:1,pageSize:25,total:0,hasMore:false,rows:[],summary:{fleet:0,unmapped:0,devices:0,states:Object.fromEntries(dto.GPS_FILTER_STATES.filter(s=>s!=='all').map(s=>[s,0]))},stores:[],eventDevices:[],events:[],canMap:true,observedAt:new Date(at).toISOString()};
  const client=new QueryClient(),store=await createOfflineStore(adapter,()=>{},()=>now),gpsPath='/gps/devices?'+dto.gpsQueryString(query),key=['gps-devices',origin,7,23,false,dto.gpsQueryString(query)];
  try {
    assert(dto.isMobileGpsWorkspace(sample));
    await store.cache(scope,gpsPath,sample);assert.equal((await store.read(scope,gpsPath)).data.canMap,false);
    now=at+policy.GPS_CACHE_TTL;assert.equal(await store.read(scope,gpsPath),null);now=at;
    const snapshot=lookupSnapshot(key,sample,at+1000);assert.equal(snapshot.updatedAt,at);assert.equal(snapshot.data.canMap,false);
    await store.cacheQuery(scope,'gps-fixture',snapshot);await restoreLookupQueries(client,store,scope,()=>true,at+1000);assert.equal(client.getQueryData(key).canMap,false);client.clear();
    await restoreLookupQueries(client,store,scope,()=>true,at+policy.GPS_CACHE_TTL);assert.equal(client.getQueryData(key),undefined);
    for(const route of ['/gps/history','/gps/event-options','/gps/sync-state','/gps/refresh'])assert.equal(policy.cacheableRead(route),false);
    for(const other of [{...user,id:8},{...user,storeId:24},{...user,permissions:[]}])assert.equal(await store.read(policy.offlineScopeKey({origin,user:other}),gpsPath),null);
    checks.push('GPS cache expires at five minutes, preserves server observation age, isolates scope and never restores mapping permission/history/sync results');

    let subscriptions=0;const subscribe=offlineStatus.subscribe;
    offlineStatus.subscribe=(fn)=>{subscriptions++;return subscribe(fn);};
    try{for(let n=0;n<100;n++)createOfflineTransport(store,scope,()=>true);assert.equal(subscriptions,0);}finally{offlineStatus.subscribe=subscribe;}
    const transport=createOfflineTransport(store,scope,()=>true);offlineStatus.update({connected:true});
    await store.cache(scope,gpsPath,sample);
    await assert.rejects(()=>transport.execute(gpsPath,dto.isMobileGpsWorkspace,{},async()=>{throw new ApiError('Denied',403,'FORBIDDEN');},1000),e=>e.status===403);
    assert.equal(await store.read(scope,gpsPath),null);
    checks.push('Replacing 100 transports creates no retained subscriptions; permission denial evicts the HTTP cache instead of allowing later offline resurrection');

    const {cataloguePageWindow,CATALOGUE_MAX_PAGES}=mobile('catalogue-pages');let requests=0;
    const observer=new InfiniteQueryObserver(client,{queryKey:['catalogue','long-fixture'],initialPageParam:1,...cataloguePageWindow,retry:false,
      queryFn:async({pageParam})=>{requests++;return{page:pageParam,pages:40,rows:Array.from({length:20},(_,i)=>({id:(pageParam-1)*20+i+1}))};}});
    const seen=new Set();
    for(let n=1;n<=40;n++){const r=await observer.fetchNextPage();assert(r.data.pages.length<=CATALOGUE_MAX_PAGES);r.data.pages.at(-1).rows.forEach(row=>seen.add(row.id));}
    assert.equal(seen.size,800);assert.equal(observer.getCurrentResult().data.pages.length,CATALOGUE_MAX_PAGES);
    const before=requests;await observer.refetch();assert.equal(requests-before,CATALOGUE_MAX_PAGES);
    for(let n=0;n<40-CATALOGUE_MAX_PAGES;n++){const r=await observer.fetchPreviousPage();assert(r.data.pages.length<=CATALOGUE_MAX_PAGES);}
    assert.equal(observer.getCurrentResult().data.pages[0].page,1);observer.destroy();client.clear();
    checks.push('Forty catalogue pages stay within eight pages/160 rows; refresh fetches only the window and previous pages remain recoverable');

    const originalFetch=global.fetch,api=createApi(origin,'hm1_'+'a'.repeat(43));
    const historyQuery={store:'all',event_source:'all',event_device:''},history={query:historyQuery,events:[],observedAt:sample.observedAt};
    const state={inProgress:false,enabledAccounts:4,failedAccounts:0,lastFinishedAt:null,latestSuccessAt:sample.observedAt,oldestSuccessAt:sample.observedAt,nextAttemptAt:null};
    try {
      global.fetch=async(url,options)=>{const p=new URL(url).pathname;assert.equal(options.credentials,'omit');if(p.endsWith('/devices'))return Response.json(sample);if(p.endsWith('/history'))return Response.json(history);if(p.endsWith('/event-options'))return Response.json({store:'all',devices:[]});if(p.endsWith('/sync-state'))return Response.json(state);assert.equal(new Headers(options.headers).get('Prefer'),'respond-async');return Response.json({status:'queued',requestedAt:sample.observedAt,state},{status:202});};
      assert.deepEqual(await api.gpsDevices(query),sample);assert.deepEqual(await api.gpsHistory(historyQuery),history);await api.gpsEventOptions('all');await api.gpsSyncState();await api.requestGpsRefresh();
      global.fetch=async()=>Response.json({...history,query:{...historyQuery,store:'24'}});await assert.rejects(()=>api.gpsHistory(historyQuery),e=>e.code==='INVALID_RESPONSE');
    }finally{global.fetch=originalFetch;}
    checks.push('Split native reads validate exact scope/filter responses; manual refresh explicitly negotiates an asynchronous response');

    const syncState=load(path.join(root,'lib/server/gps-sync-state')),sync=load(path.join(root,'lib/server/gps-sync')),service=load(path.join(root,'lib/server/mobile-gps-sync'));
    const originalState=syncState.readGpsSyncState,originalSync=sync.syncGpsAccounts;let activeState=state,sends=0;
    syncState.readGpsSyncState=async()=>activeState;sync.syncGpsAccounts=async()=>{sends++;return{attempted:1,succeeded:1};};
    try{
      const who={id:7,name:'QA',role:'staff',access_role:'branch_staff',store_id:23,scope_all:false,permissions:[]},request=()=>new NextRequest(origin+'/gps/refresh',{method:'POST'}),deferred=[];
      assert.equal((await service.requestMobileGpsRefresh(who,request(),run=>deferred.push(run))).status,'queued');assert.equal(sends,0);await deferred[0]();assert.equal(sends,1);
      for(const [patch,status]of [[{inProgress:true},'running'],[{nextAttemptAt:new Date(Date.now()+60000).toISOString()},'not_due'],[{enabledAccounts:0},'unconfigured']]){activeState={...state,...patch};assert.equal((await service.requestMobileGpsRefresh(who,request(),()=>{throw Error('Unexpected dispatch');})).status,status);}
    }finally{syncState.readGpsSyncState=originalState;sync.syncGpsAccounts=originalSync;}
    checks.push('Async refresh returns before provider work; running/not-due/unconfigured requests cannot bypass the shared collector cadence');

    const flag=process.env.HIMOTO_MOBILE_ENABLED;process.env.HIMOTO_MOBILE_ENABLED='false';
    try{for(const name of ['devices','history','event-options','sync-state']){const route=load(path.join(root,`app/api/mobile/v1/gps/${name}/route.ts`));assert.equal((await route.GET(new NextRequest(origin+'/api/mobile/v1/gps/'+name))).status,503);}}
    finally{if(flag===undefined)delete process.env.HIMOTO_MOBILE_ENABLED;else process.env.HIMOTO_MOBILE_ENABLED=flag;}
    checks.push('All new GPS read routes preserve the native feature/session gate before database access');
    console.log(JSON.stringify({ok:true,checks,operationalWrites:0,providerRequests:0,deviceBenchmark:false},null,2));
  }finally{client.clear();sql.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
