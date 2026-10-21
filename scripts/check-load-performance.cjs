const assert=require('node:assert/strict'),path=require('node:path');
const {NextRequest}=require('next/server');
const {load,root}=require('./lib/load-typescript.cjs');
async function main(){
  const database=load(path.join(root,'lib/server/himoto-database'));
  const session=load(path.join(root,'lib/server/management-session'));
  const {dataAccess}=load(path.join(root,'lib/server/access-context'));
  const descriptors=Object.getOwnPropertyDescriptors(database.himotoPool),original=session.readSessionUser;
  let queries=0,found=true;
  try{
    session.readSessionUser=async()=>({id:7,access_role:'branch_staff',permissions:['contracts.read'],store_id:1,scope_all:false});
    Object.defineProperty(database.himotoPool,'connect',{configurable:true,value:()=>{throw Error('Image reads must not open a multi-query transaction');}});
    Object.defineProperty(database.himotoPool,'query',{configurable:true,value:async(sql)=>{
      queries++;assert.equal(dataAccess.getStore().store_id,1);
      assert(!/FOR UPDATE|FOR SHARE|BEGIN/i.test(sql));assert.match(sql,/JOIN himoto.management_shift_reports/);
      return {rows:found?[{mime_type:'image/jpeg',data:Buffer.from([255,216,255,1])}]:[]};
    }});
    const {GET}=load(path.join(root,'app/api/auth/shift-reports/[id]/photos/[slot]/route'));
    const read=slot=>GET(new NextRequest('http://localhost/api/auth/shift-reports/1/photos/'+slot),{params:Promise.resolve({id:'1',slot})});
    const image=await read('vehicles');assert.equal(image.status,200);assert.equal(queries,1);
    assert.equal((await image.arrayBuffer()).byteLength,4);assert.equal(image.headers.get('cache-control'),'private, no-store');assert.equal(image.headers.get('content-type'),'image/jpeg');
    found=false;assert.equal((await read('vehicles')).status,404);assert.equal(queries,2);
    assert.equal((await read('invalid')).status,400);assert.equal(queries,2);
    session.readSessionUser=async()=>null;assert.equal((await read('vehicles')).status,401);assert.equal(queries,2);
    console.log('PASS: photo GET uses one unlocked scoped query; private headers, missing images, invalid slots and expired sessions remain enforced.');
  }finally{session.readSessionUser=original;Object.defineProperties(database.himotoPool,descriptors);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
