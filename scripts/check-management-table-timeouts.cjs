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
  const result={rows:[],total:0,scopeCount:0,tabCount:0,statusCounts:[]};
  global.fetch=async()=>({ok:true,json:async()=>({status:'success',data:result})});
  assert.deepEqual(await shared.requestManagementTable(input),result);assert.equal(cleared,3);
  global.fetch=async()=>({ok:true,json:()=>new Promise((resolve,reject)=>{fire=()=>{reject(new Error('body failed'));};})});
  // Body failures also settle the request and clean up its deadline.
  const body=shared.requestManagementTable(input);await Promise.resolve();fire();await assert.rejects(body);assert.equal(cleared,4);
  // Mobile transports can ignore abort, both before headers and during JSON.
  global.fetch=()=>new Promise(()=>{});
  const stuckFetch=shared.requestManagementTable(input);fire();
  await assert.rejects(stuckFetch,/Máy chủ phản hồi quá lâu/);assert.equal(cleared,5);
  global.fetch=async()=>({ok:true,json:()=>new Promise(()=>{})});
  const stuckBody=shared.requestManagementTable(input);await Promise.resolve();await Promise.resolve();fire();
  await assert.rejects(stuckBody,/Máy chủ phản hồi quá lâu/);assert.equal(cleared,6);
  global.fetch=()=>new Promise(()=>{});
  const navigation=new AbortController();const ignoredAbort=shared.requestManagementTable(input,navigation.signal);navigation.abort();
  await assert.rejects(ignoredAbort,error=>error.name==='AbortError');assert.equal(cleared,7);
  const alreadyAborted=shared.requestManagementTable(input,navigation.signal);
  await assert.rejects(alreadyAborted,error=>error.name==='AbortError');assert.equal(cleared,8);
 }finally{global.fetch=originalFetch;global.setTimeout=originalSet;global.clearTimeout=originalClear;}
 const commands=[];
 const client={async query(sql){commands.push(sql);
  if(sql.startsWith('SELECT count(*)::int AS total FROM'))return {rows:[{total:1}]};
  return {rows:[{id:123,status:'renting',contract_number:'QA-123',vehicles:[],__total_count:1}]};
 }};
 const page=await server.readManagementTable(client,'contracts',new URLSearchParams('size=10'));
 assert.equal(page.rows[0].id,123);
 assert.equal(commands.length,3);
 assert(/\bLIMIT \$1\b/.test(commands[1])&&!commands[1].includes('himoto.customers')&&!commands[1].includes('himoto.transactions'));
 assert(commands[2].includes('ANY($1'));
 console.log('PASS: request timeout, cancellation, retry, cleanup and transaction recovery preserve readable list rows');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
