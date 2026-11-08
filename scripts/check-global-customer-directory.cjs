const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const permissions=load(path.join(root,'lib/management/permissions'));
for(const access_role of Object.keys(permissions.ACCESS_ROLES))assert(permissions.hasPermission({access_role,permissions:[]},'customers.read'));
assert(!permissions.hasPermission(null,'customers.read'));
assert(!permissions.hasPermission({access_role:'hr',permissions:[]},'customers.write'));
if(!process.argv.includes('--live-read')){console.log('PASS: every authenticated role can read customers; write grants stay explicit');process.exit(0);}
require('@next/env').loadEnvConfig(path.resolve(__dirname,'../../..'),false,{info(){},error(){}});
const {himotoPool,ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
const {dataAccess}=load(path.join(root,'lib/server/access-context'));
const {readManagementTable}=load(path.join(root,'lib/server/management-table'));
async function main(){
 const expected=Number((await ownerDatabase.query('SELECT count(*)::int AS n FROM himoto.customers')).rows[0].n);
 const results=[];
 for(const account of [{id:151,store_id:23,access_role:'branch_staff'},{id:162,store_id:35,access_role:'ownership_manager'}])await dataAccess.run({...account,scope_all:false,permissions:[],operation:''},async()=>{
  const c=await himotoPool.connect();try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SET LOCAL statement_timeout='20s'");
   assert.equal(Number((await c.query('SELECT count(*)::int AS n FROM himoto.customers')).rows[0].n),expected);
   const started=Date.now();
   const table=await readManagementTable(c,'customers',new URLSearchParams('store=all&size=10'));
   assert.equal(table.total,expected);assert.equal(table.rows.length,10);
   const lookup=await readManagementTable(c,'customers',new URLSearchParams('store=32&size=10'));
   assert(lookup.total>0);assert(lookup.rows.every(row=>row.store_id===32&&row.store_name));
   const visible=(await c.query('SELECT id FROM himoto.customers WHERE id=$1',[42671])).rows;
   assert.equal(visible.length,1);
   const writePolicies=(await c.query("SELECT cmd,qual,with_check FROM pg_policies WHERE schemaname='himoto' AND tablename='customers' AND cmd IN ('INSERT','UPDATE','DELETE')")).rows;
   assert.equal(writePolicies.length,3);
   for(const policy of writePolicies)assert((policy.qual||policy.with_check).includes('himoto.access_store'));
   assert.equal(Number((await c.query('SELECT count(*)::int AS n FROM himoto.orders WHERE NOT himoto.access_order_store(store_id)')).rows[0].n),0);
   await c.query("SELECT set_config('himoto.actor_id','',true)");
   assert.equal((await c.query('SELECT id FROM himoto.customers LIMIT 1')).rowCount,0);
   results.push({role:account.access_role,total:table.total,rows:table.rows.length,ms:Date.now()-started});
  }finally{await c.query('ROLLBACK');c.release();}
 });
 console.log(JSON.stringify({passed:true,results,businessWrites:0},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>globalThis.himotoPool?.end());
