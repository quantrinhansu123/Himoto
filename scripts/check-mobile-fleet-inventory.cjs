require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path');
const{load,root}=require('./lib/load-typescript.cjs');
async function main(){
  const db=load(path.join(root,'lib/server/himoto-database')),context=load(path.join(root,'lib/server/access-context')).dataAccess;
  const reader=load(path.join(root,'lib/server/mobile-fleet-inventory')),common=load(path.join(root,'lib/server/vehicle-inventory'));
  const dto=load(path.resolve('shared/mobile-fleet-inventory'));
  const user={id:7,name:'QA',role:'staff',access_role:'custom',store_id:23,scope_all:false,permissions:['vehicles.read']};
  let calls=0,empty=false;
  const inventory=Array.from({length:28},(_,i)=>({id:i+1,name:i===0?'Xe đỏ QA':`Xe QA ${i+1}`,license:i===0?'29-X1.00001':`QA-${i+1}`,type:'xega',status:i===2?'in_transit':'ready',store_id:i%2?24:23,store_name:i%2?'Cơ sở B':'Cơ sở Đỏ',from_store_name:i===2?'Cơ sở B':'',to_store_name:i===2?'Cơ sở Đỏ':'',available:i!==1&&i!==2}));
  const descriptor=Object.getOwnPropertyDescriptor(db.himotoPool,'query');
  Object.defineProperty(db.himotoPool,'query',{configurable:true,value:async(sql,values)=>{
    const actor=context.getStore();assert.equal(actor.id,7);assert.equal(actor.store_id,23);assert.equal(actor.scope_all,false);assert.equal(actor.operation,'fleet_read');calls++;
    assert(!/\b(INSERT|UPDATE|DELETE)\b/i.test(sql));
    if(sql.includes('vehicle_inventory()'))return{rows:empty?[]:inventory};
    assert.deepEqual(values,[inventory.map(row=>row.id)]);
    if(sql.includes('vehicle_rental_blockers('))return{rows:[{vehicle_id:2,order_id:101,code:'QA-OPEN',status:'renting',store_name:'Cơ sở B',rent_at:null,return_at:null}]};
    assert(sql.includes("o.order_status='draft'"));
    return{rows:[{vehicle_id:1,order_id:102,code:'QA-DRAFT',customer:'Khách QA',store_name:'Cơ sở Đỏ',rent_at:null,return_at:null}]};
  }});
  const checks=[];
  try{
    const web=await context.run({...user,operation:'fleet_read'},()=>common.readVehicleInventory(db.himotoPool));
    assert.equal(web[0].draft_rentals[0].order_id,102);assert.equal(web[1].rental_blockers[0].code,'QA-OPEN');assert.equal(web[0].available,true);
    checks.push('Shared web reader preserves blocker/draft snapshots and soft holds do not change SQL availability');
    const first=await reader.readMobileFleetInventory(user,new URLSearchParams());
    assert(dto.isFleetInventory(first));assert.equal(first.rows.length,25);assert.equal(first.scopeCount,28);assert.equal(first.pages,2);assert.equal(first.stores.length,2);
    assert(!('draft_rentals'in first.rows[0])&&!('rental_blockers'in first.rows[0]));
    const last=await reader.readMobileFleetInventory(user,new URLSearchParams('page=99'));assert.equal(last.page,2);assert.deepEqual(last.rows.map(r=>r.id),[26,27,28]);
    checks.push('Fleet-read context retains actor/store; global catalogue pages and narrows out customer/rental snapshots');
    const plate=await reader.readMobileFleetInventory(user,new URLSearchParams('search=29X100001'));assert.deepEqual(plate.rows.map(r=>r.id),[1]);
    const accent=await reader.readMobileFleetInventory(user,new URLSearchParams('search=xe do'));assert.deepEqual(accent.rows.map(r=>r.id),[1]);
    const blocked=await reader.readMobileFleetInventory(user,new URLSearchParams('availability=blocked'));assert.deepEqual(blocked.rows.map(r=>r.id),[2,3]);
    const branch=await reader.readMobileFleetInventory(user,new URLSearchParams('store=24&availability=ready'));assert.equal(branch.total,13);assert(branch.rows.every(r=>r.storeId===24&&r.available));
    checks.push('Plate punctuation, Vietnamese search, cross-store and availability filters match web before pagination');
    const account=await reader.readMobileFleetInventory({...user,access_role:'accounting',permissions:[]},new URLSearchParams());assert.equal(account.scopeCount,28);
    const missing=await reader.readMobileFleetInventory(user,new URLSearchParams('search=khong-co-qa'));assert.equal(missing.total,0);assert.equal(missing.scopeCount,28);
    const previous=calls;
    await assert.rejects(()=>reader.readMobileFleetInventory(null,new URLSearchParams()),e=>e.status===403);
    for(const value of ['page=0','page=1&page=2','store=0','availability=using','extra=1','search='+('a'.repeat(101))])await assert.rejects(()=>reader.readMobileFleetInventory(user,new URLSearchParams(value)),e=>e.status===400);
    assert.equal(calls,previous);checks.push('Web fleet entitlement remains available to authenticated roles; anonymous actor and invalid/duplicate filters are rejected before SQL');
    empty=true;const none=await reader.readMobileFleetInventory(user,new URLSearchParams());assert.deepEqual(none,{rows:[],total:0,scopeCount:0,page:1,pages:1,stores:[]});checks.push('Empty fleet remains a valid first page without blocker/draft queries');
    const at=process.argv.indexOf('--output');
    if(at>=0){const fs=require('node:fs'),output=path.resolve(process.argv[at+1]);assert(output.startsWith(path.resolve('.backups')+path.sep)&&!fs.existsSync(output));fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'catalogue.json'),JSON.stringify({fixtureOnly:true,first,last,plate,accent,blocked,branch,missing,none},null,2));}
    console.log(JSON.stringify({ok:true,fixtureOnly:true,mockedPool:true,deployedRlsVerified:false,checks},null,2));
  }finally{Object.defineProperty(db.himotoPool,'query',descriptor);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
