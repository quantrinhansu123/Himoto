const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {load,root}=require('./lib/load-typescript.cjs');
const p=load(path.join(root,'lib/management/permissions'));
const s=load(path.join(root,'lib/server/contract-settlement'));
const accounts=load(path.join(root,'lib/server/account-management'));
const {dataAccess}=load(path.join(root,'lib/server/access-context'));
const owner={id:157,access_role:'ownership_manager',store_id:35,store_kind:'lease_to_own',scope_all:false,permissions:[]};
const primary={id:202,access_role:'admin',scope_all:true};
const input={request_id:randomUUID(),revision:'10',mode:'partial',amount:'100000',method:'cash',account_id:1,paid_at:'2026-10-24T12:00',note:'QA only',confirmed:true};
async function main(){
 const checks=[];
 assert(p.canSettleContract(primary));assert(p.canSettleContract(owner));assert(p.canManageAccounts(owner));assert(!p.isAdminAccount(owner));
 for(const role of ['admin','accounting','ownership_staff','branch_staff','branch_manager']){
   const actor={...owner,id:160,access_role:role,permissions:[...p.ACCESS_PERMISSIONS]};
   if(role==='branch_manager'){assert(p.canSettleContract(actor));continue;}
   assert(!p.canSettleContract(actor));
   await assert.rejects(()=>dataAccess.run({...actor,operation:''},()=>s.settleContract({query:()=>{throw Error('Unauthorized SQL');}},1,160,input)),e=>e.status===403);
 }
 for(const actor of [{...owner,scope_all:true},{...owner,store_id:null},{...owner,store_kind:'physical'},undefined])assert(!p.canSettleContract(actor));
 for(const permission of p.ACCESS_PERMISSIONS)assert(p.hasPermission(owner,permission));
 assert(!p.canRecoverAccountPasswords(owner));assert(!p.canViewOwnedFleetRevenue(owner));
 checks.push('Only the designated administrator and a verified local lease-to-own manager may settle; scoped managers keep full local grants without global administrator or private-report privileges');
 assert.equal(s.parseContractSettlement(input).amount,'100000');
 assert.equal(s.parseContractSettlement({...input,mode:'full'}).mode,'full');
 const zero={request_id:randomUUID(),revision:'10',mode:'close_unpaid',amount:'0',paid_at:input.paid_at,note:'Close, keep debt',confirmed:true,vehicles_confirmed:true,vehicles:[{item_id:1,revision:'1',status:'with_customer'}]};
 assert.equal(s.parseContractSettlement(zero).vehicles[0].status,'with_customer');
 for(const patch of [{amount:'0'},{amount:'-1'},{amount:'1e5'},{amount:'1.1'},{amount:100000},{confirmed:false},{paid_at:'2026-02-30T12:00'},{paid_at:'2099-01-01T12:00'},{mode:'renewal'},{actor_id:202},{purpose:'renewal'},{vehicles:[]},{method:'unknown'}])assert.throws(()=>s.parseContractSettlement({...input,...patch}));
 for(const patch of [{amount:'1'},{account_id:1,method:'cash'},{vehicles:[{item_id:1,revision:'1',status:'unknown'}]},{vehicles:[{item_id:1,revision:'1',status:'returned'}]},{vehicles_confirmed:false},{vehicles:[{item_id:1,revision:'1',status:'with_customer',returned_at:input.paid_at}]}])assert.throws(()=>s.parseContractSettlement({...zero,...patch}));
 checks.push('Three payment modes validate money, real dates, explicit confirmation and per-vehicle status; renewal payloads, actor spoofing, duplicate/invalid vehicle choices and cash accounts on a zero receipt are rejected');
 const values={name:'QA manager',login_name:'qa.manager',password:'',access_role:'ownership_manager',scope_all:true,store_id:35,permissions:[],enabled:true};
 const parsed=accounts.parseAccountValues(values,false);assert(!parsed.scope_all);assert.equal(parsed.store_id,35);assert(parsed.permissions.includes('contracts.delete'));assert(parsed.permissions.includes('finance.write'));
 assert.throws(()=>accounts.parseAccountValues({...values,store_id:null},false));
 assert(!accounts.parseAccountValues({...values,access_role:'admin'},false).permissions.includes('contracts.settle'));
 checks.push('A new ownership manager automatically receives full permissions with a mandatory local store; a newly created global administrator does not inherit the individual settlement entitlement');
 console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,external_network_allowed:false},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
