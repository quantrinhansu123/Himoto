const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {ownershipVehicleStockError}=load(path.join(root,'lib/management/ownership-stock'));
const {checkOwnershipVehicleStock}=load(path.join(root,'lib/server/ownership-stock'));
const {createContractDraft,vehicleDetails}=load(path.join(root,'lib/management/contract-document'));
const {saveDatabaseDraft}=load(path.join(root,'lib/server/contract-drafts'));
const {finalizeContractDraft}=load(path.join(root,'lib/server/contract-finalize'));
const {handoverReservation}=load(path.join(root,'lib/server/contract-handover'));
const {replaceContractVehicle}=load(path.join(root,'lib/server/contract-returns'));
const stores=[{id:35,name:'CS Thuê sở hữu',kind:'lease_to_own'},{id:36,name:'Trụ Sở Chính',kind:'physical'}];
const stock={id:100,name:'Xe QA',license:'QA-HQ-100',store_id:36,store_name:'Trụ Sở Chính',status:'ready'};
const draft=createContractDraft({stores,vehicles:[stock],customers:[],contracts:[],staff:[]},'35');
Object.assign(draft,{contract_type_id:'',vehicle_store_id:'36',staff_id:'',start_date:'2026-10-28T10:00',end_date:'2026-10-29T10:00',unit_price:'100000',total_amount:'100000',deposit_amount:'0',vehicles:[vehicleDetails(stock,draft.customer)]});
draft.vehicles[0].stock_store_id='35';draft.vehicles[0].stock_store_name='CS Thuê sở hữu giả';
let type='ownership',status='draft',queries=[];
const db={release(){},async query(sql){queries.push(sql);let rows=[];
 if(sql.includes('SELECT id,kind FROM himoto.stores'))rows=stores;
 else if(sql.includes('FROM himoto.management_contract_types'))rows=[{id:type,label:'Thuê sở hữu QA',rental_type:type,term_months:null,active:true}];
 else if(sql.includes('FROM himoto.orders WHERE id=$1'))rows=[{id:901,store_id:35,customer_id:7,order_status:status,order_type:type,revision:'7',draft_payload:{management_composer:{rental_type:type,draft}}}];
 else if(sql.includes('SELECT d.id,d.vehicle_id FROM himoto.order_vehicle_details'))rows=[{id:501,vehicle_id:100}];
 else if(sql.includes('FROM himoto.order_vehicle_details d JOIN himoto.orders'))rows=[{id:501,order_id:901,vehicle_id:101,item_revision:'7',store_id:35,order_type:type,draft_payload:{management_composer:{rental_type:type}}}];
 else if(sql.includes('FROM himoto.vehicles'))rows=[stock];
 else if(sql.includes('FROM himoto.stores WHERE id = $1'))rows=[stores[0]];
 else if(sql.includes('FROM himoto.store_directory()'))rows=[stores[1]];
 else if(sql.includes('FROM himoto.customers'))rows=[{id:7}];
 return {rows,rowCount:rows.length};}};
async function main(){
 for(type of ['ownership','ownership_cd']){
  draft.contract_type_id=type;
  assert.match(ownershipVehicleStockError(type,[stock],stores),/xác nhận nhận xe/);
  assert.match(ownershipVehicleStockError(type,[{...stock,store_id:35,status:'in_transit'}],stores),/xác nhận nhận xe/);
  assert.equal(ownershipVehicleStockError(type,[{...stock,store_id:35}],stores),'');
  assert.equal(ownershipVehicleStockError(type,[stock],stores,true),'');
  assert.equal(ownershipVehicleStockError(type,[],stores),'');
  for(const [name,work]of [
   ['draft',()=>saveDatabaseDraft(db,null,{draft,status:'draft',rental_type:type,notes:''})],
   ['finalize',()=>{status='draft';return finalizeContractDraft(db,901,143,{revision:'7',receipts:[]});}],
   ['handover',()=>{status='deposit_contract';return handoverReservation(db,901,143,'7');}],
   ['vehicle swap',()=>replaceContractVehicle(db,143,{item_id:501,item_revision:'7',vehicle_id:100})],
  ]){queries=[];await assert.rejects(work,error=>{if(error.status!==409||!/kho Thuê sở hữu/.test(error.message))throw Error(name+': '+error.message);return true;},name+' must reject HQ stock');assert(!queries.some(sql=>/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql)),name+' must not mutate business data');}
 }
 queries=[];assert.equal(await checkOwnershipVehicleStock(db,'daily',[stock]),'');assert.equal(queries.length,0);
 assert(ownershipVehicleStockError('ownership',[stock],[{id:36,name:'CS Thuê sở hữu giả',kind:'physical'}]));
 console.log(JSON.stringify({passed:5,checks:['Ownership and ownership_cd require received stock in a lease_to_own branch','A transfer arriving at the right branch remains blocked until receipt','Actual draft, finalize, handover and swap services reject HQ stock before mutation','Ordinary cross-branch rentals and returned historical entry keep existing behavior','Stock kind comes from database records; client labels cannot authorize a physical branch'],realBusinessWrites:0,realTelegramRequests:0}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
