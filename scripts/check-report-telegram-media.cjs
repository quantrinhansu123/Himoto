require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path');
const{load,root}=require('./lib/load-typescript.cjs');
async function main(){
  const at=process.argv.indexOf('--pglite-path');assert(at>=0,'Provide isolated PGlite');const pg=new(require(path.resolve(process.argv[at+1])).PGlite)();
  process.env.MANAGEMENT_SESSION_SECRET='fixture-report-media-test-secret-0000000000000000';
  const{sealIntegrationSecret}=load(path.join(root,'lib/server/integration-secrets'));
  const{queueReportTelegram,deliverReportTelegram}=load(path.join(root,'lib/server/report-telegram'));
  const db={async query(sql,params){const result=await pg.query(sql,params);return{rows:result.rows,rowCount:result.affectedRows??result.rows.length};}},checks=[];
  try{
    await pg.exec(`CREATE SCHEMA himoto;CREATE TABLE himoto.management_report_deliveries(delivery_key text PRIMARY KEY,store_id bigint,route text,text text,status text DEFAULT 'pending',message_id bigint,error_code text,updated_at timestamptz DEFAULT now(),attachments jsonb DEFAULT '[]',media_ids jsonb DEFAULT '[]',text_sent boolean DEFAULT false);
      CREATE TABLE himoto.management_telegram_settings(singleton boolean,bot_cipher text);CREATE TABLE himoto.management_store_telegram(store_id bigint,chat_id text,thread_id bigint,enabled boolean);CREATE TABLE himoto.management_ownership_telegram(route text,chat_id text,thread_id bigint,enabled boolean);
      INSERT INTO himoto.management_store_telegram VALUES(23,'fixture-chat',5,true);INSERT INTO himoto.management_ownership_telegram VALUES('ownership_new','fixture-ownership',7,true);`);
    await db.query('INSERT INTO himoto.management_telegram_settings VALUES(true,$1)',[sealIntegrationSecret({token:'fixture-token-only'})]);
    const photos=Array.from({length:25},(_,i)=>({slot:'shift-'+i,mime_type:'image/jpeg',bytes:Buffer.from([255,216,255]).toString('base64'),cloudinary_public_id:null,cloudinary_cloud_name:null,cloudinary_version:null}));
    photos.push({...photos[0],slot:'video-1',mime_type:'video/mp4',bytes:Buffer.from('fixture-video').toString('base64')});
    await queueReportTelegram(db,'shift:1',23,'PGD fixture','store',photos);
    const sent=[],methods=[];let id=100,fail=true;
    const transport=async(url,options)=>{const method=url.split('/').at(-1);methods.push(method);if(method==='sendMediaGroup'&&fail&&sent.length===10){fail=false;return Response.json({ok:false,error_code:429,description:'Fixture rate limit'});}
      let count=1;if(method==='sendMediaGroup')count=JSON.parse(options.body.get('media')).length;
      const messages=Array.from({length:count},()=>({message_id:++id}));sent.push(...messages.map(m=>m.message_id));return Response.json({ok:true,result:method==='sendMediaGroup'?messages:messages[0]});};
    await deliverReportTelegram('shift:1',db,transport);
    let row=(await db.query("SELECT * FROM himoto.management_report_deliveries WHERE delivery_key='shift:1'")).rows[0];assert.equal(row.status,'failed');assert.equal(row.media_ids.length,10);
    await deliverReportTelegram('shift:1',db,transport);
    row=(await db.query("SELECT * FROM himoto.management_report_deliveries WHERE delivery_key='shift:1'")).rows[0];assert.equal(row.status,'sent');assert.equal(row.media_ids.length,26);assert.equal(row.text_sent,true);assert.equal(new Set(sent).size,27);assert.equal(methods.filter(m=>m==='sendMessage').length,1);assert.equal(methods.filter(m=>m==='sendVideo').length,1);
    const before=methods.length;await deliverReportTelegram('shift:1',db,transport);assert.equal(methods.length,before);
    checks.push('25 report photos split into albums and the video sends separately; a confirmed 429 after ten receipts retries only the remaining media and sends the report text once');
    await queueReportTelegram(db,'shift:2',23,'Unknown result fixture','store',[photos[0]]);let calls=0;
    const unknown=async()=>{calls++;throw Error('Response lost after possible server acceptance');};await deliverReportTelegram('shift:2',db,unknown);await deliverReportTelegram('shift:2',db,unknown);
    assert.equal(calls,1);assert.equal((await db.query("SELECT status FROM himoto.management_report_deliveries WHERE delivery_key='shift:2'")).rows[0].status,'unknown');
    checks.push('A lost Telegram response is marked unknown and cannot be resent by another worker or retry click');
    await queueReportTelegram(db,'shift-audit:1',23,'KTNB fixture','ownership_new',[photos[0]]);
    const destinations=[];await deliverReportTelegram('shift-audit:1',db,async(_url,options)=>{destinations.push(options.body instanceof FormData?options.body.get('chat_id'):JSON.parse(options.body).chat_id);return Response.json({ok:true,result:{message_id:++id}});});assert.deepEqual(destinations,['fixture-ownership','fixture-ownership']);
    checks.push('KTNB has an independent delivery key and uses its configured ownership group; PGD and audit media cannot overwrite each other');
    console.log(JSON.stringify({passed:checks.length,checks,fixtureOnly:true,realMessagesSent:0,operationalWrites:0},null,2));
  }finally{await pg.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
