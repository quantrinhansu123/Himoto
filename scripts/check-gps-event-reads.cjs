// PostgreSQL fixture only. Network is blocked before loading any application code.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
(async()=>{
  const flag=process.argv.indexOf('--pglite-path');assert(flag>=0,'Pass isolated --pglite-path');
  const {PGlite}=require(path.resolve(process.argv[flag+1])),pg=new PGlite();
  try {
    await pg.exec(`CREATE SCHEMA himoto;CREATE ROLE himoto_scoped;GRANT USAGE ON SCHEMA himoto TO himoto_scoped;
      CREATE TABLE himoto.vehicles(id bigint PRIMARY KEY,license text,current_store_id bigint,store_id bigint,deleted_at timestamptz);
      CREATE TABLE himoto.gps_devices(id bigint PRIMARY KEY,vehicle_id bigint,provider_device_name text,external_device_id text);
      CREATE TABLE himoto.management_gps_status_events(id bigint PRIMARY KEY,vehicle_id bigint,gps_device_id bigint,from_status text,to_status text,observed_at timestamptz,event_kind text,source text,provider_recorded_at timestamptz);
      INSERT INTO himoto.vehicles SELECT n,CASE WHEN n%9=0 THEN NULL ELSE 'QA-'||n END,CASE WHEN n%7=0 THEN 6 ELSE NULL END,n%6+1,NULL FROM generate_series(1,500)n;
      INSERT INTO himoto.gps_devices SELECT n,CASE WHEN n%5=0 THEN 501-n ELSE n END,'Synthetic','QA'||n FROM generate_series(1,500)n;
      INSERT INTO himoto.management_gps_status_events SELECT n,CASE WHEN n%71=0 THEN NULL WHEN n%73=0 THEN 99999 ELSE n%500+1 END,
        CASE WHEN n%79=0 THEN 99999 ELSE n%500+1 END,'online','stopped',timestamptz '2026-11-16 00:00:00+00'-(n%20000)*interval '1 second','motion',
        CASE n%3 WHEN 0 THEN 'poll' WHEN 1 THEN 'history' ELSE 'webhook' END,
        CASE WHEN n%11=0 THEN NULL ELSE timestamptz '2026-11-16 00:00:00+00'-(n%20000+80)*interval '1 second' END FROM generate_series(1,200000)n;
      CREATE INDEX old_device ON himoto.management_gps_status_events(gps_device_id,id DESC);
      CREATE INDEX old_occurred ON himoto.management_gps_status_events((COALESCE(provider_recorded_at,observed_at)) DESC);
      CREATE FUNCTION himoto.access_actor() RETURNS bigint LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('himoto.actor_id',true),'')::bigint$$;
      CREATE FUNCTION himoto.access_operation() RETURNS text LANGUAGE sql STABLE AS $$SELECT current_setting('himoto.operation',true)$$;
      CREATE FUNCTION himoto.access_store(id bigint) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT current_setting('himoto.scope_all',true)='true' OR id=NULLIF(current_setting('himoto.store_id',true),'')::bigint$$;
      ALTER TABLE himoto.vehicles ENABLE ROW LEVEL SECURITY;
      CREATE POLICY fleet ON himoto.vehicles FOR SELECT TO himoto_scoped USING(himoto.access_store(COALESCE(current_store_id,store_id)) OR himoto.access_operation()='fleet_read');
      ALTER TABLE himoto.gps_devices ENABLE ROW LEVEL SECURITY;
      CREATE POLICY management_scoped_gate ON himoto.gps_devices FOR SELECT TO himoto_scoped USING(true);
      ALTER TABLE himoto.management_gps_status_events ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON ALL TABLES IN SCHEMA himoto TO himoto_scoped;
      ANALYZE`);
    await pg.exec(fs.readFileSync(path.resolve('docs/sql/2026-10-28-fleet-gps-read.sql'),'utf8'));
    await pg.exec(fs.readFileSync(path.resolve('docs/sql/2026-11-16-gps-event-read-indexes.sql'),'utf8').replace(/\bCONCURRENTLY\b/g,''));
    await pg.exec('ANALYZE');
    const baseline=`SELECT e.id,e.vehicle_id,e.from_status,e.to_status,e.observed_at,e.event_kind,e.source,
      CASE WHEN e.source='poll' THEN e.observed_at ELSE COALESCE(e.provider_recorded_at,e.observed_at) END AS event_at,
      COALESCE(v.license,d.provider_device_name,d.external_device_id) AS license
      FROM himoto.management_gps_status_events e JOIN himoto.gps_devices d ON d.id=e.gps_device_id LEFT JOIN himoto.vehicles v ON v.id=e.vehicle_id
      WHERE ($1::bigint IS NULL OR COALESCE(v.current_store_id,v.store_id)=$1) AND ($2::text IS NULL OR e.source=$2) AND ($3::bigint IS NULL OR e.gps_device_id=$3)
      ORDER BY event_at DESC,e.id DESC LIMIT 100`;
    const {readGpsEvents}=load(path.join(root,'lib/server/gps-events')),checks=[],adapter={query:(s,v)=>pg.query(s,v)};
    const cases=[['all','all',''],...Array.from({length:6},(_,i)=>[String(i+1),'all','']),['all','poll',''],['all','history',''],['all','all','17'],['2','poll',''],['6','webhook','17']];
    for(const role of ['owner','fleet','branch']){
      if(role!=='owner')await pg.exec(`SET ROLE himoto_scoped;SELECT set_config('himoto.actor_id','7',false),set_config('himoto.store_id','2',false),set_config('himoto.scope_all','false',false),set_config('himoto.operation','${role==='fleet'?'fleet_read':''}',false)`);
      for(const [store,source,device]of cases){
        const params=[store==='all'?null:Number(store),source==='all'?null:source,device?Number(device):null];
        const expected=(await pg.query(baseline,params)).rows,actual=(await readGpsEvents(adapter,store,source,device)).rows;
        assert.deepEqual(actual,expected,role+':'+[store,source,device].join('/'));checks.push({role,store,source,device,rows:actual.length});
        if(role==='branch'&&store==='2'&&source==='all'&&!device)assert.equal(actual.length,100,'Branch parity must exercise visible rows, not only empty results');
      }
      await pg.exec('RESET ROLE');
    }
    let plan;
    await readGpsEvents({query:async(sql,values)=>{plan=(await pg.query('EXPLAIN (FORMAT JSON) '+sql,values)).rows[0]['QUERY PLAN'][0];return{rows:[]};}},'all','all','');
    assert(JSON.stringify(plan).includes('idx_gps_events_event_time_id'));
    console.log(JSON.stringify({ok:true,syntheticEvents:200000,comparisons:checks.length,checks,matchingIndexUsed:true,operationalWrites:0,providerRequests:0},null,2));
  }finally{await pg.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
