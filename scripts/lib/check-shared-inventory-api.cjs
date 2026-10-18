const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./load-typescript.cjs');
module.exports=async function checkInventoryApi(c,schema){
  const session=load(path.join(root,'lib/server/management-session')),pool=load(path.join(root,'lib/server/himoto-database')).himotoPool;
  const savedUser=session.userFromSession,descriptor=Object.getOwnPropertyDescriptor(pool,'query');
  let user={id:70001,access_role:'branch_staff',store_id:80001,scope_all:false,permissions:['vehicles.read']};
  try{
    session.userFromSession=async()=>user;
    Object.defineProperty(pool,'query',{configurable:true,value:(sql,args)=>c.query(sql.replaceAll('himoto.',schema+'.'),args)});
    const {NextRequest}=require('next/server'),route=load(path.join(root,'app/api/auth/vehicles/inventory/route'));
    const request=()=>route.GET(new NextRequest('http://localhost/api/auth/vehicles/inventory'),{});
    const response=await request();assert.equal(response.status,200);assert(response.headers.get('Cache-Control').includes('no-store'));
    const rows=(await response.json()).data;assert.equal(rows.length,2);assert(rows.some(row=>Number(row.store_id)===80002));
    assert(rows.every(row=>!('customer_name' in row)&&!('rentals' in row)&&!('customer_phone' in row)&&!('total' in row)));
    user={...user,permissions:['contracts.read']};assert.equal((await request()).status,403);
    user=null;assert.equal((await request()).status,401);
  }finally{session.userFromSession=savedUser;Object.defineProperty(pool,'query',descriptor);}
};
