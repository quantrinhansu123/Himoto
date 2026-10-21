const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const shared=load(path.join(root,'lib/management/management-table'));
const server=load(path.join(root,'lib/server/management-table'));
const input={kind:'contracts',query:load(path.join(root,'lib/management/table-utils')).EMPTY_QUERY,store:'all',scope:'',page:1,size:10,sort:'code',direction:'asc'};
async function main(){
 const originalFetch=global.fetch,originalSet=global.setTimeout,originalClear=global.clearTimeout;
 let fire,delay,cleared=0;
 global.setTimeout=(callback,ms)=>{fire=callback;delay=ms;return 1;};global.clearTimeout=()=>{cleared++;};
 try {
  global.fetch=async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
  const pending=shared.requestManagementTable(input);assert.equal(delay,45000);fire();await assert.rejects(pending,/Máy chủ phản hồi quá lâu/);assert.equal(cleared,1);
  const parent=new AbortController();const aborted=shared.requestManagementTable(input,parent.signal);parent.abort();await assert.rejects(aborted,error=>error.name==='AbortError');assert.equal(cleared,2);
  const result={rows:[],total:0,statusCounts:[]};
  global.fetch=async()=>({ok:true,json:async()=>({status:'success',data:result})});
  assert.deepEqual(await shared.requestManagementTable(input),result);assert.equal(cleared,3);
  global.fetch=async()=>({ok:true,json:()=>new Promise((resolve,reject)=>{fire=()=>{reject(new Error('body failed'));};})});
  // Body failures also settle the request and clean up its deadline.
  const body=shared.requestManagementTable(input);await Promise.resolve();fire();await assert.rejects(body);assert.equal(cleared,4);
 }finally{global.fetch=originalFetch;global.setTimeout=originalSet;global.clearTimeout=originalClear;}
 const commands=[];
 const client={async query(sql){commands.push(sql);
  return {rows:[{id:123,status:'renting',contract_number:'QA-123',vehicles:[]}]};
 }};
 const page=await server.readManagementTable(client,'contracts',new URLSearchParams('size=10'));
 assert.equal(page.rows[0].id,123);
 assert.equal(commands.length,1);
 assert(commands.some(sql=>/\bLIMIT \$1\b/.test(sql)&&!sql.includes('himoto.customers')&&!sql.includes('himoto.transactions')));
 console.log('PASS: request timeout, cancellation, retry, cleanup and transaction recovery preserve readable list rows');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
