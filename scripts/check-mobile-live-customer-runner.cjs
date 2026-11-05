require('./lib/offline-tests.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{runCustomerWrite}=require('./check-mobile-live-customer-write.cjs');
async function main(){const results=[];
 for(const mode of ['success','lost-create-response','stale-overwrite-detected']){
  const output=path.resolve('.backups','mobile-customer-runner-'+crypto.randomUUID()),receipts=new Map();let customer=null,creates=0,revoked=false,requestCount=0;
  const transport=async(url,init)=>{requestCount++;const u=new URL(url),route=u.pathname.replace('/api/mobile/v1',''),body=init.body?JSON.parse(init.body):null,key=init.headers['Idempotency-Key'];
   const response=(status,data)=>Response.json(data,{status});
   if(route==='/session'&&init.method==='POST')return response(201,{token:'hm1_'+'a'.repeat(43),user:{id:202,permissions:['accounts.manage']}});
   if(route==='/session'&&init.method==='DELETE'){revoked=true;return response(200,{success:true});}
   if(route==='/workspace')return response(200,{stores:[{id:34}]});
   if(route==='/catalogue/customers')return response(200,{total:customer?1:0,rows:customer?[{id:customer.id}]:[]});
   if(route==='/customers'&&init.method==='POST'){
    if(receipts.has(key))return response(201,{...receipts.get(key),replayed:true});
    assert(!customer);customer={...body,id:123,revision:'1'};creates++;receipts.set(key,{id:123,revision:'1',replayed:false});
    if(mode==='lost-create-response')throw Error('Simulated lost response after commit');return response(201,receipts.get(key));
   }
   if(route.startsWith('/customers/requests/'))return response(200,{receipt:receipts.get(route.split('/').at(-1))||null});
   if(route==='/customers/123'&&init.method==='GET')return customer?response(200,customer):response(404,{code:'NOT_FOUND'});
   if(route==='/customers/123'&&init.method==='PATCH'){
    if(body.revision!==customer.revision&&mode!=='stale-overwrite-detected')return response(409,{code:'CUSTOMER_CONFLICT'});
    customer={...customer,...body,revision:'2'};return response(200,{id:123,revision:'2',replayed:false});
   }
   if(route==='/bulk-delete/customers/review'){assert.deepEqual(body.ids,[123]);return response(200,{review:'f'.repeat(64),rows:[{id:123,name:customer.name}]});}
   if(route==='/bulk-delete/customers'&&init.method==='DELETE'){assert.deepEqual(body.ids,[123]);assert(customer.name.startsWith('QA-HANDOFF-'));customer=null;return response(200,{deletedCount:1});}
   throw Error('Unexpected fixture route');
  };
  const report=await runCustomerWrite({username:'qa',password:'SYNTHETIC_NOT_A_REAL_PASSWORD'},output,transport);assert.equal(report.ok,mode!=='stale-overwrite-detected');assert.equal(creates,1);assert.equal(customer,null);assert(revoked);assert(!JSON.stringify(report).includes('SYNTHETIC_NOT_A_REAL_PASSWORD'));
  results.push({mode,ok:true,exactlyOneCreate:true,onlyCreatedIdCleaned:true,sessionRevoked:true,requests:requestCount});
 }
 console.log(JSON.stringify({ok:true,checks:results.length,results,liveRequests:0},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
