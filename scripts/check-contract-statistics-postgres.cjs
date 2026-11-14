// Exact statistics parity against the full projection, using isolated loopback PostgreSQL.
const assert=require('node:assert/strict'),path=require('node:path');
const openQa=require('./lib/mobile_postgres_qa.cjs');
const {load,root}=require('./lib/load-typescript.cjs');
async function main(){
 const qa=await openQa();let c;
 try{
  await qa.pool.query(`CREATE SCHEMA himoto;
   CREATE TABLE himoto.orders(id bigint PRIMARY KEY,contract_number text,draft_reference text,order_status text,customer_id bigint,store_id bigint,order_type text,
     rent_at timestamptz,return_at timestamptz,contract_signed_on date,total text,pid numeric,draft_payload jsonb DEFAULT '{}',deleted_at timestamptz);
   CREATE TABLE himoto.customers(id bigint PRIMARY KEY,status int);
   CREATE TABLE himoto.stores(id bigint PRIMARY KEY,kind text);
   CREATE TABLE himoto.order_vehicle_details(order_id bigint,rent_at timestamptz,return_at timestamptz,deleted_at timestamptz);
   CREATE TABLE himoto.transactions(order_id bigint,store_id bigint,status text,type text,name text,value numeric,bank_owner_type text);
   GRANT USAGE ON SCHEMA himoto TO himoto_scoped;
   GRANT SELECT ON ALL TABLES IN SCHEMA himoto TO himoto_scoped;
   ALTER TABLE himoto.orders ENABLE ROW LEVEL SECURITY;
   CREATE POLICY qa_orders ON himoto.orders TO himoto_scoped USING(store_id=NULLIF(current_setting('himoto.store_id',true),'')::bigint);
   ALTER TABLE himoto.transactions ENABLE ROW LEVEL SECURITY;
   CREATE POLICY qa_receipts ON himoto.transactions TO himoto_scoped USING(store_id=NULLIF(current_setting('himoto.store_id',true),'')::bigint);
   INSERT INTO himoto.stores VALUES(1,'traditional'),(2,'traditional');
   INSERT INTO himoto.customers VALUES(1,2),(2,1);
   INSERT INTO himoto.orders(id,contract_number,order_status,customer_id,store_id,order_type,rent_at,return_at,total,pid)
     SELECT i,'QA-'||i,'completed',1+i%2,1,'daily','2026-09-01','2026-09-02','1000',1000 FROM generate_series(1,1000)i;
   INSERT INTO himoto.orders(id,contract_number,order_status,customer_id,store_id,order_type,rent_at,return_at,total,pid,draft_payload) VALUES
     (1101,'QA-OPEN','renting',1,1,'daily','2026-09-01','2026-09-02','1000',500,'{}'),
     (1102,'QA-BAD','bad_debt',2,1,'daily','2026-09-01','2026-09-02','1000',100,'{}'),
     (1103,'QA-RESERVED','reserved',2,1,'daily','2026-09-01','2026-12-01','1000',0,'{}'),
     (1104,'QA-DRAFT','draft',1,1,'daily',NULL,NULL,NULL,0,'{"management_composer":{"draft":{"total_amount":"500"}}}'),
     (1105,'QA-DECIMAL','completed',1,1,'daily',NULL,NULL,'1.5',0,'{}'),
     (1106,'QA-HEX','completed',1,1,'daily',NULL,NULL,'0x10',0,'{}'),
     (1107,'QA-UNKNOWN','completed',1,1,'daily',NULL,NULL,NULL,0,'{}'),
     (1108,'QA-CANCELLED','cancelled',1,1,'daily',NULL,NULL,NULL,0,'{}'),
     (1109,'QA-PLAN','completed',1,1,'daily',NULL,NULL,'1000',1000,'{"management_composer":{"installment_plan":{"version":1,"start":"2026-09-01T00:00","end":"2026-09-03T00:00","interval":"day","amount":500}}}'),
     (1110,'QA-BATTERY','completed',1,1,'daily',NULL,NULL,'999999',0,'{"legacy_migration":{"sourceStoreId":"30"}}'),
     (1111,'QA-FOREIGN','renting',1,2,'daily','2026-09-01','2026-09-02','999999',0,'{}'),
     (1112,'QA-LINE-DATE','renting',1,1,'daily',NULL,NULL,'1000',100,'{}'),
     (1113,'QA-EMPTY','completed',1,1,'daily',NULL,NULL,'',0,'{}'),
     (1114,'QA-MALFORMED','completed',1,1,'daily',NULL,NULL,'not money',0,'{}'),
     (1115,'QA-NEGATIVE','completed',1,1,'daily',NULL,NULL,'-1',0,'{}'),
     (1116,'QA-LARGE','completed',1,1,'daily',NULL,NULL,'10000000000000',0,'{}');
   UPDATE himoto.orders SET contract_signed_on='2026-09-01' WHERE id=1101;
   INSERT INTO himoto.order_vehicle_details VALUES(1112,'2026-09-01','2026-09-02',NULL),(1112,'2020-01-01','2020-01-02',now());
   INSERT INTO himoto.transactions VALUES(1101,1,'approved','in','order:deposit',200,NULL),(1101,1,'approved','in','order:payment',300,'company'),
     (1101,1,'pending','in','order:deposit',100000,NULL),(1111,2,'approved','in','order:payment',300,'company'),
     (1,1,'approved','in','order:payment',1000,'company');`);
  const {contractStatisticsSql,mapContractStatistics,fastContractStatistics}=load(path.join(root,'lib/server/contract-table-stats'));
  const {projectManagementTable}=load(path.join(root,'lib/management/management-table'));
  const {EMPTY_QUERY}=load(path.join(root,'lib/management/table-utils'));
  const {withContractMonitoring}=load(path.join(root,'lib/management/contract-overdue'));
  const {applyInstallmentBilling}=load(path.join(root,'lib/management/contract-billing'));
  c=await qa.pool.connect();await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const now=Date.parse('2026-11-11T12:00:00Z');let cases=0;
  for(const scoped of [false,true]){
   if(scoped){await c.query("SELECT set_config('himoto.store_id','1',true)");await c.query('SET LOCAL ROLE himoto_scoped');}
   for(const vat of [false,true]){
    const scope=vat?" AND EXISTS(SELECT 1 FROM himoto.transactions t WHERE t.order_id=o.id AND t.type IN('in','addon') AND t.status='approved' AND t.bank_owner_type='company')":'';
    const source=(await c.query(`SELECT to_jsonb(detail) AS record FROM (${contractStatisticsSql(scope,vat)}) detail`)).rows.map(r=>mapContractStatistics(r.record)).map(r=>withContractMonitoring(applyInstallmentBilling(r,now),now));
    assert(!source.some(r=>r.id===1110));if(scoped)assert(!source.some(r=>r.id===1111));
    for(const status of ['','completed','renting','reserved','cancelled','draft']){
     const statements=[],db={query:async(sql,args)=>{const r=await c.query(sql,args);statements.push({sql,args,ids:r.rows[0]?.detailed_ids});return r;}};
     const input={kind:'contracts',query:{...EMPTY_QUERY,status},store:'all',scope:vat?'vat':'',page:1,size:10,sort:'code',direction:'asc'};
     const expected=projectManagementTable(source,input,true,now),actual=await fastContractStatistics(db,input,scope,now);
     assert(actual);for(const key of ['total','scopeCount','tabCount','statusCounts','statuses','dueCount','summary'])assert.deepEqual(actual[key],expected[key],`${scoped}/${vat}/${status}: ${key}`);
     assert(!statements[0].sql.includes('order_vehicle_details'));assert(!statements[0].sql.includes('sum(t.value)'));
     assert(statements[0].ids.length<20);assert(statements[0].ids.every(id=>id>1000));
     const ids=new Set(statements[0].ids);assert.deepEqual(actual.rows,expected.rows.filter(r=>ids.has(r.id)),'detail fields preserve JSON dates and numeric representation');
     if(statements.length>1)assert.deepEqual(statements[1].args[0],statements[0].ids);
     cases++;
    }
   }
  }
  console.log(JSON.stringify({passed:true,cases,checks:['counts and all financial summaries match the full projection','draft override, installments, missing header dates, deposit exclusion and malformed money preserved','source30 and foreign-store rows excluded under real RLS','1,000 closed rentals never enter detail hydration'],externalNetwork:false,businessWrites:0}));
 }finally{if(c){await c.query('ROLLBACK').catch(()=>{});c.release();}await qa.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
