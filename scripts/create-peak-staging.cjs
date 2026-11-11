// Schema-only snapshot + synthetic data, restricted to the dedicated local QA cluster.
const fs=require('node:fs'),path=require('node:path'),{randomUUID,randomBytes}=require('node:crypto');
const openQa=require('./lib/mobile_postgres_qa.cjs'),{load,root}=require('./lib/load-typescript.cjs');
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
async function main(){
 const schemaFile=arg('--schema'),grantsFile=arg('--grants'),out=path.resolve(arg('--output','.backups/peak-staging'));
 if(!schemaFile||!grantsFile)throw Error('Use --schema schema-only.sql --grants grants.sql --output ignored-directory');
 const schema=fs.readFileSync(schemaFile,'utf8');if(!schema.includes('CREATE TABLE himoto.orders')||/^COPY\s/im.test(schema))throw Error('Expected schema-only snapshot');
 const positions=Number(arg('--positions','2000000')),events=Number(arg('--events','1500000'));
 if(!Number.isSafeInteger(positions)||positions<0||positions>3000000||!Number.isSafeInteger(events)||events<0||events>2000000)throw Error('Invalid synthetic history sizes');
 fs.mkdirSync(out,{recursive:true});const qa=await openQa();
 const secret=randomBytes(32).toString('hex');process.env.MANAGEMENT_SESSION_SECRET=secret;
 fs.writeFileSync(path.join(out,'staging.json'),JSON.stringify({...qa.connection,secret,fixtureOnly:true},null,2));
 try{
  await qa.pool.query(`CREATE SCHEMA vault;CREATE TABLE vault.secrets(id uuid PRIMARY KEY);CREATE VIEW vault.decrypted_secrets AS SELECT id,NULL::text AS decrypted_secret FROM vault.secrets;
    CREATE SCHEMA net;CREATE TABLE net._http_response(id bigint,status_code int,content text,timed_out boolean,error_msg text);CREATE SCHEMA extensions;`);
  await qa.pool.query(schema.replace(/^\\(?:un)?restrict .+$/gm,''));
  await qa.pool.query(fs.readFileSync(grantsFile,'utf8'));
  for(const file of ['2026-11-12-bounded-contract-vehicles.sql','2026-11-12-independent-integration-workers.sql','2026-11-12-gps-job-schedules.sql'])await qa.pool.query(fs.readFileSync(path.join(root,'../docs/sql',file),'utf8'));
  await qa.pool.query('INSERT INTO himoto.management_gps_event_worker(singleton) VALUES(true) ON CONFLICT DO NOTHING');
  console.log('Schema and original scoped grants restored; no production rows copied.');
  const perms=load(path.join(root,'lib/management/permissions')).ACCESS_PERMISSIONS.filter(x=>x!=='accounts.manage');
  await qa.pool.query(`INSERT INTO himoto.roles(id,name,slug) VALUES(1,'QA admin','admin'),(2,'QA staff','staff');
    INSERT INTO himoto.stores(id,store_name,kind) VALUES(1,'QA Headquarters','physical'),(23,'QA Branch A','physical'),(31,'QA Branch B','physical'),(32,'QA Branch C','physical'),(35,'QA Ownership','ownership');
    INSERT INTO himoto.users(id,name,email,password,role_id,status,role)
      SELECT n,'QA Actor '||n,'qa-'||n||'@example.invalid','unused',CASE WHEN n=1 THEN 1 ELSE 2 END,'active','staff' FROM generate_series(1,60)n;`);
  await qa.pool.query(`INSERT INTO himoto.management_account_access(user_id,login_name,access_role,store_id,scope_all,permissions)
      SELECT n,'qa-'||n,CASE WHEN n=1 THEN 'admin' WHEN n=42 THEN 'ownership_manager' ELSE 'branch_staff' END,
        CASE WHEN n=1 THEN NULL WHEN n=42 THEN 35 WHEN n=43 THEN 31 ELSE 32 END,n=1,$1::jsonb FROM generate_series(1,60)n;`,[JSON.stringify(perms)]);
  await qa.pool.query(`INSERT INTO himoto.customers(id,name,phone,id_card,store_id,status)
      SELECT n,'Khách QA '||n,'090'||lpad(n::text,7,'0'),lpad(n::text,12,'0'),32,CASE WHEN n%50=0 THEN 2 ELSE 1 END FROM generate_series(1,10000)n;
    INSERT INTO himoto.vehicles(id,name,license,brand,type,year,color,status,odometer,store_id,current_store_id,created_by)
      SELECT n,'Xe QA '||n,'QA-'||lpad(n::text,6,'0'),'Honda','xeso',2024,'Black','ready',0,32,CASE WHEN n%7=0 THEN 31 ELSE 32 END,1 FROM generate_series(1,6500)n;
    UPDATE himoto.vehicles SET deleted_at=now() WHERE id IN(4,14);
    INSERT INTO himoto.orders(id,contract_number,customer_name,customer_phone,customer_id,order_status,store_id,order_type,rent_at,return_at,total,pid,draft_payload,created_at,updated_at)
      SELECT n,'QA-'||lpad(n::text,7,'0'),'Khách QA '||(1+n%10000),'090'||lpad((1+n%10000)::text,7,'0'),1+n%10000,
        CASE n%400 WHEN 0 THEN 'renting' WHEN 1 THEN 'overdue' WHEN 2 THEN 'bad_debt' WHEN 3 THEN 'draft' WHEN 4 THEN 'reserved' ELSE 'completed' END,
        CASE WHEN n%3=0 THEN 32 ELSE (ARRAY[23,31,35,1])[1+n%4] END,'rental',now()-interval '5 days',now()+interval '2 days','100000',100000,'{}',now()-interval '5 days',now()
      FROM generate_series(1,34000)n;
    INSERT INTO himoto.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,completed_at,handler_price,type)
      SELECT n,n,1+n%6500,now()-interval '5 days',now()+interval '2 days',CASE WHEN n%400>4 THEN now() ELSE NULL END,100000,'day' FROM generate_series(1,34000)n;
    UPDATE himoto.orders SET deleted_at=now() WHERE id IN(7,17);
    UPDATE himoto.order_vehicle_details SET deleted_at=now() WHERE id=27;
    INSERT INTO himoto.transactions(order_id,store_id,name,type,value,note,user_id,status,created_at)
      SELECT n,32,'order:payment','in',50000,'QA fixture',1,'approved',now() FROM generate_series(3,3000,3)n;`);
  console.log('Synthetic contracts: 34,000; vehicles: 6,500; customers: 10,000.');
  await qa.pool.query(`INSERT INTO himoto.orders(id,contract_number,customer_name,customer_phone,customer_id,order_status,store_id,order_type,rent_at,return_at,total,pid,draft_payload,created_at,updated_at)
    SELECT n,'QA-RETURN-'||n,'QA Return Customer','0900000001',1,'renting',32,'rental',now()-interval '1 day',now()+interval '1 day','100000',100000,'{}',now(),now() FROM generate_series(40001,40500)n;
    INSERT INTO himoto.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,handler_price,type)
    SELECT n,n,1+n%6500,now()-interval '1 day',now()+interval '1 day',100000,'day' FROM generate_series(40001,40500)n;`);
  const{sealIntegrationSecret}=load(path.join(root,'lib/server/integration-secrets'));
  await qa.pool.query('INSERT INTO himoto.management_telegram_settings(singleton,bot_cipher) VALUES(true,$1)',[sealIntegrationSecret({token:'123456:qa-only-worker-bot-123456789'})]);
  const accounts=[];
  for(let i=0;i<4;i++){
    const id=randomUUID(),provider=i<2?'protrack':'iopgps';accounts.push({id,provider,index:i});
    await qa.pool.query(`INSERT INTO himoto.management_gps_accounts(id,provider,label,username,secret_cipher,session_cipher,session_expires_at,last_success_at,last_attempt_at)
      VALUES($1,$2,$3,$3,$4,$5,now()+interval '2 hours',now(),now()-interval '30 seconds')`,[id,provider,'qa-account-'+i,sealIntegrationSecret({password:'qa-only'}),sealIntegrationSecret({token:'qa-token-'+i,accountId:String(i)})]);
    await qa.pool.query(`INSERT INTO himoto.management_gps_event_channels(account_id,motion_enabled,alarms_enabled) VALUES($1,true,true)`,[id]);
    await qa.pool.query(`INSERT INTO himoto.gps_devices(id,vehicle_id,provider,external_device_id,provider_device_id,provider_device_name,mapping_status,management_status,provider_status,last_latitude,last_longitude,last_speed,source_account_id,sync_received_at,heartbeat_at,position_recorded_at)
      SELECT n,n,$2,'990000000'||lpad(n::text,6,'0'),n::text,'QA-'||lpad(n::text,6,'0'),'manual','stopped','connected',21,105,0,$1,now(),now(),now() FROM generate_series(1,441)n WHERE (n-1)%4=$3`,[id,provider,i]);
  }
  await qa.pool.query(`INSERT INTO himoto.management_gps_history_cursors(gps_device_id,stream,account_id,coverage_started_at,covered_until)
    SELECT d.id,s.stream,d.source_account_id,now()-interval '25 days',now()-interval '25 days' FROM himoto.gps_devices d CROSS JOIN (VALUES('motion'),('alarms'))s(stream)`);
  console.log('GPS devices: 441; history cursors: 882. Seeding position history.');
  await qa.pool.query(`INSERT INTO himoto.gps_positions(gps_device_id,latitude,longitude,speed,ignition,provider_recorded_at,received_at,normalized_status,created_at,updated_at)
    SELECT 1+n%441,21,105,0,false,(now() AT TIME ZONE 'UTC')-n*interval '1 second',(now() AT TIME ZONE 'UTC')-n*interval '1 second','stopped',now(),now() FROM generate_series(1,$1::int)n`,[positions]);
  console.log('Position history seeded; seeding event history.');
  await qa.pool.query(`INSERT INTO himoto.management_gps_status_events(gps_device_id,vehicle_id,from_status,to_status,provider_status,provider_recorded_at,observed_at,event_kind,source)
    SELECT 1+n%441,1+n%441,'stopped','online','QA connected',now()-n*interval '1 second',now()-n*interval '1 second','motion','poll' FROM generate_series(1,$1::int)n`,[events]);
  for(const table of ['roles','stores','users','customers','vehicles','orders','order_vehicle_details','transactions','gps_devices','gps_positions','management_gps_status_events']){
    const seq=(await qa.pool.query('SELECT pg_get_serial_sequence($1,\'id\') AS seq',['himoto.'+table])).rows[0].seq;
    if(seq)await qa.pool.query(`SELECT setval($1,GREATEST((SELECT COALESCE(max(id),1) FROM himoto.${table}),1),true)`,[seq]);
  }
  await qa.pool.query('ANALYZE');
  fs.writeFileSync(path.join(out,'staging.json'),JSON.stringify({...qa.connection,secret,accounts,fixtureOnly:true,positions,events},null,2));
  console.log(JSON.stringify({created:true,fixtureOnly:true,contracts:34000,vehicles:6500,positions,events,connection:{host:qa.connection.host,port:qa.connection.port,database:qa.connection.database},productionRowsCopied:0}));
 }finally{await qa.close();}
}
main().catch(e=>{console.error({error:e.message,code:e.code});process.exitCode=1});
