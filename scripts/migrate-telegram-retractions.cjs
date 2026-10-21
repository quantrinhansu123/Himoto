const fs=require('node:fs'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');
const {ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
const {openIntegrationSecret}=load(path.join(root,'lib/server/integration-secrets'));
const {telegramBotIdentity}=load(path.join(root,'lib/server/telegram-retractions'));
const {CONTRACT_TELEGRAM_ROUTE_SQL}=load(path.join(root,'lib/server/contract-telegram-routing'));
async function main(){
 if(!process.argv.includes('--apply'))throw Error('Pass --apply to add delivery target/retraction metadata. No Telegram calls are made.');
 await ownerDatabase.query(fs.readFileSync('docs/sql/2026-10-21-telegram-retractions.sql','utf8'));
 const settings=(await ownerDatabase.query('SELECT bot_cipher,updated_at FROM himoto.management_telegram_settings WHERE singleton=true')).rows[0];
 let backfilled=0;
 if(settings?.bot_cipher){
  const {token}=openIntegrationSecret(settings.bot_cipher);
  // Legacy targets are recoverable only when bot, routing, order classification and branch
  // have all remained unchanged since queue creation. Never guess a changed destination.
  const result=await ownerDatabase.query(`WITH targets AS (
    SELECT n.id,g.chat_id,g.thread_id FROM himoto.management_contract_notifications n
    JOIN himoto.orders o ON o.id=n.order_id AND o.store_id=n.store_id
    JOIN himoto.stores s ON s.id=o.store_id
    JOIN LATERAL (
      SELECT chat_id,thread_id,updated_at FROM himoto.management_store_telegram WHERE ${CONTRACT_TELEGRAM_ROUTE_SQL}='store' AND store_id=n.store_id AND enabled
      UNION ALL SELECT chat_id,thread_id,updated_at FROM himoto.management_ownership_telegram WHERE route=${CONTRACT_TELEGRAM_ROUTE_SQL} AND enabled
    ) g ON true
    WHERE n.delivery_target IS NULL AND n.status='sent' AND jsonb_array_length(n.message_ids)>0
      AND n.created_at>now()-interval '48 hours' AND o.deleted_at IS NULL
      AND COALESCE(o.updated_at,o.created_at)<=n.created_at AND COALESCE(s.updated_at,s.created_at)<=n.created_at
      AND g.updated_at<=n.created_at AND $2::timestamptz<=n.created_at
  ) UPDATE himoto.management_contract_notifications n SET delivery_target=jsonb_build_object(
    'chat_id',t.chat_id,'thread_id',t.thread_id,'bot_id',$1::text,'started_at',n.created_at,'source','verified_legacy_configuration')
    FROM targets t WHERE n.id=t.id AND n.delivery_target IS NULL`,[telegramBotIdentity(token),settings.updated_at]);
  backfilled=result.rowCount;
 }
 console.log(JSON.stringify({migrationApplied:true,verifiedLegacyTargets:backfilled,telegramRequests:0}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{await globalThis.himotoPool?.end();});
