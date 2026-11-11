const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
async function main(){const old={fetch:global.fetch,setTimeout:global.setTimeout,clearTimeout:global.clearTimeout};let fire,cleared=0;
  global.setTimeout=fn=>{fire=fn;return 1;};global.clearTimeout=()=>cleared++;
  const returns=load(path.join(root,'lib/management/contract-returns')),telegram=load(path.join(root,'lib/management/contract-telegram'));
  try{
    global.fetch=()=>new Promise(()=>{});
    const pending=returns.returnContractItems([{item_id:1}]);fire();await assert.rejects(pending,/có thể đã được lưu/);
    const read=returns.loadContractReturnableItems(1);fire();await assert.rejects(read,/quá lâu/);
    const notice=telegram.contractTelegramRequest(1);fire();await assert.rejects(notice,/Tải nội dung quá lâu/);
    global.fetch=async()=>({ok:true,json:()=>new Promise(()=>{})});const body=telegram.contractTelegramRequest(1,{action:'send'});await Promise.resolve();await Promise.resolve();fire();await assert.rejects(body,/kiểm tra kết quả trước khi gửi lại/);
    const controller=new AbortController(),cancel=returns.loadContractReturnableItems(1,controller.signal);controller.abort();await assert.rejects(cancel,e=>e.name==='AbortError');
    assert.equal(cleared,5);console.log('PASS: stuck transport, stuck JSON, cancellation and uncertain-write messages always settle and clean up');
  }finally{Object.assign(global,old);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
