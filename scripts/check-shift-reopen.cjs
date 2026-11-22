const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const server=name=>load(path.join(root,'lib/server',name));
const {ownerDatabase}=server('himoto-database');
const {queueShiftReopen,runShiftReopen,readShiftReopen}=server('shift-report-reopen');
const {queueReportTelegram,deliverReportTelegram}=server('report-telegram');
const {telegramBotIdentity}=server('telegram-retractions');
const {sealIntegrationSecret}=server('integration-secrets');
const {expectedShiftStock}=server('shift-stock-photos');
const {blankEndShiftFields,restoreShiftDraft,serializeShiftDraft,shiftFormIssues}=load(path.join(root,'lib/management/shift-report-fields'));
const {parseShiftInput}=load(path.join(root,'lib/management/shift-reports'));
const schema=`qa_shift_reopen_${process.pid}`;
const staff={id:101,store_id:41,scope_all:false,access_role:'branch_staff',permissions:['contracts.read','contracts.draft']};
const finance={id:102,store_id:null,scope_all:true,access_role:'accounting',permissions:['contracts.read','finance.write']};
const token='45678901:synthetic-test-token';
const testDate=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
const shift={store_id:41,date:testDate,staff:'QA staff',report_type:'end_shift',batteries:3,charged:2,rented_batteries:0,
  vehicles:1,daily_vehicles:4,monthly_vehicles:0,other_vehicles:0,transfers:0,cash:0,personal:0,company:0,electricity_off:true,notes:''};

async function main(){
  const blank=blankEndShiftFields({...shift,staff:'',electricity_off:false});
  const wire=parseShiftInput(serializeShiftDraft(blank,true,'QA draft'));
  const restored=restoreShiftDraft(wire);
  assert.equal(restored.staff,'');
  assert(Number.isNaN(restored.batteries));
  assert(Number.isNaN(restored.cash));
  const warnings=shiftFormIssues(restored,true);
  assert(warnings.some(e=>e.id==='shift-staff')&&warnings.some(e=>e.id==='shift-batteries')&&warnings.some(e=>e.id==='shift-electricity-off'));
  assert(!warnings.some(e=>e.id==='shift-vehicles'));
  assert.deepEqual(shiftFormIssues(shift,true),[]);

  const client=await ownerDatabase.connect();
  const sqlForQa=sql=>sql.replaceAll('himoto.',schema+'.').replaceAll(schema+'.access_store(','himoto.access_store(');
  const db={query:(sql,args)=>client.query(sqlForQa(sql),args),connect:async()=>({
    query:(sql,args)=>client.query(sqlForQa(({BEGIN:'SAVEPOINT qa_shift_reopen_worker',COMMIT:'RELEASE SAVEPOINT qa_shift_reopen_worker',
      ROLLBACK:'ROLLBACK TO SAVEPOINT qa_shift_reopen_worker'})[sql]||sql),args),release(){},
  })};
  try{
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA ${schema}`);
    await db.query(`CREATE TABLE himoto.stores(id bigint PRIMARY KEY);
      CREATE TABLE himoto.users(id bigint PRIMARY KEY,name text);
      CREATE TABLE himoto.management_shift_reports(id bigint PRIMARY KEY,store_id bigint NOT NULL,
        report_date date NOT NULL,payload jsonb,status text,revision int,updated_at timestamptz,submitted_at timestamptz,app_snapshot jsonb);
      CREATE TABLE himoto.management_shift_audits(report_id bigint PRIMARY KEY,status text,result text,revision int,confirmed_at timestamptz,updated_at timestamptz);
      CREATE TABLE himoto.management_report_deliveries(delivery_key text PRIMARY KEY,store_id bigint,route text,text text,status text DEFAULT 'pending',
        message_id bigint,error_code text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),attachments jsonb DEFAULT '[]',
        media_ids jsonb DEFAULT '[]',text_sent boolean DEFAULT false);
      CREATE TABLE himoto.management_telegram_settings(singleton bool,bot_cipher text,updated_at timestamptz);
      CREATE TABLE himoto.management_store_telegram(store_id bigint,chat_id text,thread_id integer,enabled bool,updated_at timestamptz);
      INSERT INTO himoto.stores VALUES(41),(42);
      INSERT INTO himoto.users VALUES(101,'QA staff'),(102,'QA finance');`);
    await db.query(fs.readFileSync('docs/sql/2026-11-22-shift-report-reopen.sql','utf8').replace(/^BEGIN;|^COMMIT;/gm,''));
    await db.query('INSERT INTO himoto.management_telegram_settings VALUES(true,$1,now()-interval \'1 day\')',[sealIntegrationSecret({token})]);
    await db.query("INSERT INTO himoto.management_store_telegram VALUES(41,'-123456',4,true,now()-interval '1 day')");
    const capture={vehicle:{id:17,name:'QA FELIZ',license:'00AA-000.00'},plate:'00AA-000.00',
      vehicle_photo_id:null,plate_photo_id:randomUUID(),captured_at:new Date().toISOString(),actor_name:'QA',distance_m:5};
    await db.query(`INSERT INTO himoto.management_shift_reports(id,store_id,report_date,payload,status,revision,updated_at,submitted_at,app_snapshot)
      SELECT i,41,$1,$2::jsonb,'submitted',15,now(),now(),'{"fixture":true}' FROM generate_series(5,8) i`,
      [testDate,JSON.stringify({...shift,stock_captures:[capture]})]);
    await db.query("INSERT INTO himoto.management_shift_audits VALUES(5,'confirmed','matched',7,now(),now())");
    const target={chat_id:'-123456',thread_id:4,bot_id:telegramBotIdentity(token),started_at:new Date(Date.now()-240_000).toISOString()};
    await db.query(`INSERT INTO himoto.management_report_deliveries(delivery_key,store_id,route,text,status,message_id,media_ids,text_sent,delivery_target)
      VALUES('shift:5',41,'store','QA','sent',31,'[29,30]',true,$1::jsonb),('shift-audit:5',41,'store','QA audit','sent',32,'[]',true,NULL),
        ('shift:6',41,'store','QA retry','sent',45,'[]',true,$1::jsonb),('shift:7',41,'store','QA sending','sending',NULL,'[]',false,$1::jsonb),
        ('shift:8',41,'store','QA unsent','pending',NULL,'[]',false,NULL)`,[JSON.stringify(target)]);
    const request=()=>({request_id:randomUUID(),revision:15,reason:'QA fix count',manual:false});
    await assert.rejects(()=>queueShiftReopen(db,{...staff,store_id:42},5,request()),e=>e.status===404);
    await assert.rejects(()=>queueShiftReopen(db,staff,5,request()),e=>e.status===403);
    await assert.rejects(()=>queueShiftReopen(db,staff,7,request()),e=>e.status===409);
    const first=request(),key=await queueShiftReopen(db,finance,5,first);
    assert.equal(await queueShiftReopen(db,finance,5,first),key);
    const calls=[];
    const ok=async(url,options)=>{
      assert.equal(new URL(url).pathname.endsWith('/deleteMessages'),true);
      const body=JSON.parse(options.body);
      assert.equal(body.chat_id,'-123456');
      calls.push(body.message_ids);
      return Response.json({ok:true,result:true});
    };
    await runShiftReopen(5,key,db,ok);
    assert.deepEqual(calls,[[32],[29,30,31]]);
    await runShiftReopen(5,key,db,ok);
    assert.equal(calls.length,2);
    const result=await readShiftReopen(db,finance,5);
    assert.equal(result.status,'draft');
    assert.equal(result.revision,16);
    assert.equal(result.history.length,1);
    assert.equal(await queueShiftReopen(db,finance,5,first),null);
    const row=(await db.query('SELECT payload,submitted_at FROM himoto.management_shift_reports WHERE id=5')).rows[0];
    assert(row.submitted_at);
    assert.deepEqual(await expectedShiftStock(db,41,row.payload),[capture.vehicle]);
    assert.deepEqual((await db.query('SELECT status,result FROM himoto.management_shift_audits WHERE report_id=5')).rows[0],{status:'draft',result:'pending'});
    assert.equal((await db.query("SELECT audit->>'status' AS v FROM himoto.management_shift_report_revisions WHERE report_id=5")).rows[0].v,'confirmed');
    assert.equal((await db.query("SELECT count(*)::int AS n FROM himoto.management_report_deliveries WHERE delivery_key LIKE '%:previous:15' AND retracted_at IS NOT NULL")).rows[0].n,2);
    await queueReportTelegram(db,'shift:5',41,'QA new version','store');
    await deliverReportTelegram('shift:5',db,async (url,options)=>{
      assert.equal(new URL(url).pathname.endsWith('/sendMessage'),true);
      assert.equal(JSON.parse(options.body).text,'QA new version');
      return Response.json({ok:true,result:{message_id:72}});
    });
    const newDelivery=(await db.query("SELECT status,message_id,delivery_target FROM himoto.management_report_deliveries WHERE delivery_key='shift:5'")).rows[0];
    assert.equal(newDelivery.status,'sent');
    assert.equal(newDelivery.message_id,'72');
    assert.equal(newDelivery.delivery_target.bot_id,telegramBotIdentity(token));

    const failure=request(),failedKey=await queueShiftReopen(db,staff,6,failure);
    await runShiftReopen(6,failedKey,db,async()=>Response.json({ok:false,error_code:403},{status:403}));
    assert.equal((await readShiftReopen(db,staff,6)).request.state,'failed');
    await assert.rejects(()=>queueShiftReopen(db,staff,6,{...request(),manual:true}),e=>e.status===403);
    const manual={...request(),manual:true};
    await runShiftReopen(6,await queueShiftReopen(db,finance,6,manual),db,()=>assert.fail('Manual confirmation must not call Telegram'));
    assert.equal((await readShiftReopen(db,finance,6)).status,'draft');
    assert.equal((await readShiftReopen(db,finance,6)).history[0].manual_retraction,true);
    await runShiftReopen(8,await queueShiftReopen(db,staff,8,request()),db,()=>assert.fail('Unsent report has no Telegram IDs'));
    assert.equal((await readShiftReopen(db,staff,8)).status,'draft');
    console.log('Pass: incomplete drafts, linked validation, branch permissions, confirmed audit, exact Telegram IDs, retry, manual and unsent reopening, frozen stock, and new delivery (all rolled back).');
  }finally{await client.query('ROLLBACK').catch(()=>{});client.release();await globalThis.himotoPool?.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
