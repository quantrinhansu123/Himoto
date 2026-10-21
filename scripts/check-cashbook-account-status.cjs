const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const db=load(path.join(root,'lib/server/himoto-database')).himotoPool;
const {setAccountStatus,deleteAccount}=load(path.join(root,'lib/server/cashbook-accounts'));
const {requestPermission}=load(path.join(root,'lib/server/access-request'));
const {hasPermission}=load(path.join(root,'lib/management/permissions'));
async function main(){
  const originalQuery=Object.getOwnPropertyDescriptor(db,'query'),originalConnect=Object.getOwnPropertyDescriptor(db,'connect'),queries=[];let used=3;
  const query=async(sql,values)=>{queries.push({sql,values});return /count\(\*\)/.test(sql)?{rows:[{count:used}],rowCount:1}:{rows:[{id:99}],rowCount:1};};
  Object.defineProperty(db,'query',{value:query,configurable:true});Object.defineProperty(db,'connect',{value:async()=>({query,release(){}}),configurable:true});
  try{
    const response=await setAccountStatus('bank',99,new Request('http://qa',{method:'PATCH',body:JSON.stringify({status:'inactive'})}));
    assert.equal(response.status,200);assert.equal(queries.length,1);assert.match(queries[0].sql,/SET status=\$2,updated_at=now\(\)/);assert.doesNotMatch(queries[0].sql,/opening_balance|DELETE|transactions/);assert.deepEqual(queries[0].values,[99,'Inactive']);
    for(const body of [{status:'bad'},{status:'inactive',opening_balance:0},null])assert.equal((await setAccountStatus('bank',99,new Request('http://qa',{method:'PATCH',body:JSON.stringify(body)}))).status,400);
    assert.equal(queries.length,1);
    assert.equal((await deleteAccount('bank',99)).status,409);assert(!queries.some(row=>/^DELETE/.test(row.sql)));
    used=0;assert.equal((await deleteAccount('bank',99)).status,200);assert(queries.some(row=>/^DELETE FROM himoto.banks/.test(row.sql)));
    assert.equal(requestPermission('/api/auth/cashbook/accounts/bank/99/status','PATCH'),'finance.write');
    assert(!hasPermission({access_role:'branch_staff',permissions:['finance.read']},'finance.write'));
    console.log(JSON.stringify({passed:3,checks:['Archiving only changes status; invalid bodies cannot modify balances or metadata','Used accounts keep every voucher and cannot be deleted; unused accounts remain deletable','Existing finance.write scope gates account changes; read-only staff gain no write permission'],realBusinessWrites:0}));
  }finally{Object.defineProperty(db,'query',originalQuery);Object.defineProperty(db,'connect',originalConnect);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
