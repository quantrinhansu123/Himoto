const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const{load,root}=require('./lib/load-typescript.cjs'),service=load(path.join(root,'lib/server/rental-terms')),{dataAccess}=load(path.join(root,'lib/server/access-context')),db=load(path.join(root,'lib/server/himoto-database')).ownerDatabase;
const user={id:70001,access_role:'branch_staff',store_id:32,scope_all:false,permissions:['contracts.read','contracts.draft']};
const base={request_id:randomUUID(),revision:'1',item_id:101,item_revision:'1',start_at:'2026-01-01T10:00',end_at:'2026-01-05T10:00',unit_price:'250000',total_amount:'1000000',reason:'Sửa ngày nhập nhầm thành bốn ngày'};
async function main(){
  assert.equal(service.parseRentalTerms(base).end_at,base.end_at);
  for(const patch of [{reason:''},{start_at:'2026-02-30T10:00'},{end_at:base.start_at},{total_amount:'-1'},{total_amount:'1.5'},{unit_price:'01'},{item_id:0},{revision:'x'},{amount:'1'}])assert.throws(()=>service.parseRentalTerms({...base,...patch}));
  const {requestPermission}=load(path.join(root,'lib/server/access-request'));assert.equal(requestPermission('/api/auth/order/car-rental/1/rental-terms','PATCH'),'contracts.draft');
  const c=await db.connect(),schema='qa_rental_terms';const checks=[];
  const proxy={query(sql,args){return c.query(sql.replaceAll('himoto.',schema+'.'),args);}};
  const rev=async()=>{await c.query('RESET ROLE');const r=(await c.query(`SELECT o.xmin::text AS revision,d.xmin::text AS item_revision FROM ${schema}.orders o JOIN ${schema}.order_vehicle_details d ON d.order_id=o.id WHERE o.id=1`)).rows[0];await c.query('SET LOCAL ROLE himoto_scoped');return r;};
  const atomic=async work=>{await c.query('SAVEPOINT action');try{return await dataAccess.run(user,work);}catch(e){await c.query('ROLLBACK TO SAVEPOINT action');throw e;}finally{await c.query('RELEASE SAVEPOINT action');}};
  try{
    await c.query('BEGIN');await c.query(`CREATE SCHEMA ${schema};GRANT USAGE ON SCHEMA ${schema} TO himoto_scoped`);
    for(const t of ['orders','order_vehicle_details','vehicles','transactions','management_contract_payments','management_contract_notifications'])await c.query(`CREATE TABLE ${schema}.${t}(LIKE himoto.${t} INCLUDING DEFAULTS);GRANT SELECT,UPDATE ON ${schema}.${t} TO himoto_scoped`);
    await c.query(`REVOKE UPDATE ON ${schema}.transactions,${schema}.vehicles,${schema}.management_contract_notifications FROM himoto_scoped;
      CREATE FUNCTION ${schema}.access_store(target numeric) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT himoto.access_store(target)$$;
      CREATE FUNCTION ${schema}.access_actor() RETURNS bigint LANGUAGE sql STABLE AS $$SELECT himoto.access_actor()$$;
      ALTER TABLE ${schema}.orders ENABLE ROW LEVEL SECURITY;
      CREATE POLICY own_orders ON ${schema}.orders TO himoto_scoped USING(himoto.access_store(store_id)) WITH CHECK(himoto.access_store(store_id));
      CREATE FUNCTION ${schema}.vehicle_history_conflict_ids(targets bigint[],excluded bigint,started timestamptz,ended timestamptz) RETURNS TABLE(vehicle_id bigint)
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT DISTINCT d.vehicle_id FROM ${schema}.order_vehicle_details d JOIN ${schema}.orders o ON o.id=d.order_id
        WHERE d.vehicle_id=ANY(targets) AND o.id<>excluded AND d.deleted_at IS NULL AND o.deleted_at IS NULL
        AND d.rent_at<ended AND COALESCE(d.completed_at,d.return_at)>started$$;
      GRANT EXECUTE ON FUNCTION ${schema}.vehicle_history_conflict_ids(bigint[],bigint,timestamptz,timestamptz) TO himoto_scoped;`);
    await c.query(fs.readFileSync('docs/sql/2026-10-29-contract-vehicle-owner-labels.sql','utf8').replaceAll('himoto.',schema+'.').replaceAll('pg_catalog,himoto','pg_catalog,'+schema).replace(/^BEGIN;|^COMMIT;/gm,''));
    const renewal={kind:'renewal',version:2,created_at:'2026-01-02T03:00:00Z',item_id:101,vehicle_id:100,before_return_at:'2026-01-02T03:00:00Z',return_at:'2026-01-03T03:00:00Z',amount:250000,before_total:250000,total:500000};
    await c.query(`INSERT INTO ${schema}.orders(id,store_id,contract_number,order_type,order_status,total,pid,total_rental_fees,draft_payload)
      VALUES(1,32,'QA-CORRECT','daily','renting','500000',500000,250000,$1),(2,33,'QA-FOREIGN','daily','completed','0',0,0,'{}')`,[JSON.stringify({management_composer:{draft:{start_date:'2026-01-01T10:00',end_date:'2026-01-03T10:00'},versions:[renewal]}})]);
    await c.query(`INSERT INTO ${schema}.vehicles(id,store_id,current_store_id,license,status,name,type,year,created_by) VALUES(100,33,33,'QA-CORRECT','using','Xe QA','xeso',2026,70001);
      INSERT INTO ${schema}.order_vehicle_details(id,order_id,vehicle_id,rent_at,return_at,hiring_fee,type) VALUES
        (101,1,100,'2026-01-01T03:00Z','2026-01-03T03:00Z',250000,'day'),(102,2,100,'2026-01-10T03:00Z','2026-01-12T03:00Z',250000,'day');
      INSERT INTO ${schema}.transactions(id,order_id,name,type,status,value,store_id,user_id,note,created_at,updated_at) VALUES(100,1,'order:rental_fees','in','approved',500000,32,70001,'QA',now(),now());`);
    await c.query(`INSERT INTO ${schema}.management_contract_payments(request_id,order_id,transaction_id,actor_id,request_hash,renewal_payload) VALUES($1,1,100,70001,'original',$2)`,[randomUUID(),JSON.stringify(renewal)]);
    await c.query("SELECT set_config('himoto.scope_all','false',true),set_config('himoto.store_id','32',true),set_config('himoto.actor_id','70001',true)");await c.query('SET LOCAL ROLE himoto_scoped');
    const initial=await dataAccess.run(user,()=>service.readRentalTerms(proxy,1,user));assert.equal(initial.total_amount,500000);assert.equal(initial.items[0].license,'QA-CORRECT');
    await assert.rejects(()=>atomic(()=>service.readRentalTerms(proxy,2,user)),e=>e.status===404);
    await assert.rejects(()=>atomic(()=>service.updateRentalTerms(proxy,1,user,base)),e=>e.status===409);
    await assert.rejects(async()=>atomic(async()=>service.updateRentalTerms(proxy,1,user,{...base,...await rev(),end_at:'2026-01-11T10:00'})),e=>e.status===409&&/chồng/.test(e.message));
    checks.push('Strict dates/VNĐ/reasons and current revisions; branch RLS hides foreign contracts and a corrected interval cannot overlap another rental');
    await c.query('RESET ROLE');const beforeTx=(await c.query(`SELECT * FROM ${schema}.transactions`)).rows,beforeStock=(await c.query(`SELECT * FROM ${schema}.vehicles`)).rows;await c.query('SET LOCAL ROLE himoto_scoped');
    const body={...base,...await rev()};const result=await atomic(()=>service.updateRentalTerms(proxy,1,user,body));assert.equal(result.total_amount,1000000);assert.equal(result.items[0].end_at,'2026-01-05T10:00');assert.equal(result.paid_amount,500000);
    const retry=await atomic(()=>service.updateRentalTerms(proxy,1,user,body));assert.deepEqual(retry,result);
    await assert.rejects(()=>atomic(()=>service.updateRentalTerms(proxy,1,user,{...body,total_amount:'1'})),e=>e.status===409);
    await c.query('RESET ROLE');const saved=(await c.query(`SELECT * FROM ${schema}.orders WHERE id=1`)).rows[0],receipt=(await c.query(`SELECT * FROM ${schema}.management_contract_payments`)).rows[0];
    assert.equal(saved.draft_payload.management_composer.rental_terms_history.length,1);assert.equal(saved.draft_payload.management_composer.rental_terms_history[0].before.total_amount,500000);assert.equal(saved.draft_payload.management_composer.rental_terms_history[0].after.total_amount,1000000);
    assert.equal(saved.draft_payload.management_composer.versions[0].return_at,'2026-01-05T10:00:00+07:00');assert.equal(receipt.renewal_payload.return_at,'2026-01-05T10:00:00+07:00');assert.equal(receipt.request_hash.trim(),'original');
    assert.deepEqual((await c.query(`SELECT * FROM ${schema}.transactions`)).rows,beforeTx);assert.deepEqual((await c.query(`SELECT * FROM ${schema}.vehicles`)).rows,beforeStock);
    checks.push('A two-day rental corrects to four days and 1m; its latest renewal dates and receipt metadata agree, 500k actually collected and physical stock remain unchanged; retries cannot duplicate the amendment');
    await c.query('SET LOCAL ROLE himoto_scoped');const snapshot=JSON.stringify((await proxy.query('SELECT draft_payload FROM himoto.orders WHERE id=1')).rows);
    const failing={query(sql,args){if(sql.startsWith('UPDATE himoto.orders SET total='))throw Error('Injected failure');return proxy.query(sql,args);}};
    await assert.rejects(async()=>atomic(async()=>service.updateRentalTerms(failing,1,user,{...base,...await rev(),request_id:randomUUID(),end_at:'2026-01-06T10:00'})),/Injected/);
    assert.equal(JSON.stringify((await proxy.query('SELECT draft_payload FROM himoto.orders WHERE id=1')).rows),snapshot);
    assert.equal((await proxy.query('SELECT renewal_payload FROM himoto.management_contract_payments')).rows[0].renewal_payload.return_at,'2026-01-05T10:00:00+07:00');
    checks.push('An error after correcting the line and receipt metadata rolls back the entire change');
    await c.query('RESET ROLE');await c.query('ROLLBACK');console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,realTelegramRequests:0}));
  }finally{await c.query('ROLLBACK').catch(()=>{});c.release();await globalThis.himotoPool?.end();}
}
main().catch(e=>{console.error({message:e.message,code:e.code});process.exitCode=1;});
