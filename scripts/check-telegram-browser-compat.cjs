const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const {contractTelegramRequest}=load(path.join(root,'lib/management/contract-telegram'));
async function main(){
  const original={any:AbortSignal.any,timeout:AbortSignal.timeout,fetch:global.fetch,setTimeout:global.setTimeout};
  const timers=[];
  try{
    // Reproduce Safari without either static AbortSignal helper.
    AbortSignal.any=undefined;AbortSignal.timeout=undefined;
    global.setTimeout=(callback,delay)=>{assert.equal(delay,60000);timers.push(callback);return {unref(){}};};
    const state={events:[]};
    global.fetch=async(_url,options)=>{assert(options.signal instanceof AbortSignal);return {ok:true,json:async()=>({status:'success',data:state})};};
    assert.deepEqual(await contractTelegramRequest(1,undefined,new AbortController().signal),state);
    global.fetch=(_url,{signal})=>new Promise((resolve,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
    const controller=new AbortController();
    const cancelled=contractTelegramRequest(1,undefined,controller.signal);
    controller.abort();await assert.rejects(cancelled,error=>error.name==='AbortError');
    const expired=new AbortController();expired.abort();
    await assert.rejects(contractTelegramRequest(1,undefined,expired.signal),error=>error.name==='AbortError');
    const timedOut=contractTelegramRequest(1);timers.at(-1)();
    await assert.rejects(timedOut,/Tải nội dung quá lâu/);
    const writeTimeout=contractTelegramRequest(1,{action:'send'});timers.at(-1)();
    await assert.rejects(writeTimeout,/kiểm tra kết quả trước khi gửi lại/);
    console.log('PASS: Safari fallback, successful load, cancellation, pre-aborted request, read/write timeouts.');
  }finally{AbortSignal.any=original.any;AbortSignal.timeout=original.timeout;global.fetch=original.fetch;global.setTimeout=original.setTimeout;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
