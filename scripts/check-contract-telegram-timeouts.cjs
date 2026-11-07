const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const file='src/app/api/auth/order/car-rental/[id]/telegram/route.ts';
async function run({saveError,readError,writing=true,retracting=false}={}) {
  const calls=[],jobs=[];
  class KnownError extends Error {}
  const client={query:async sql=>{calls.push(sql);return {rows:[]};},release:()=>calls.push('release')};
  const mocks={
    'next/server':{after:job=>jobs.push(job),NextResponse:{json:(body,options)=>({body,...options})}},
    '@/lib/server/access-request':{withAccessRequest:fn=>fn},
    '@/lib/server/access-context':{dataAccess:{getStore:()=>({id:1})}},
    '@/lib/server/himoto-database':{himotoPool:{connect:async()=>client}},
    '@/lib/server/contract-telegram':{ContractTelegramError:KnownError,
      saveContractTelegram:async()=>{calls.push('save');if(saveError)throw {code:saveError};if(retracting)return 'retract';},
      readContractTelegram:async()=>{calls.push('read');if(readError)throw {code:readError};return {state:{events:[{status:retracting?'retracting':'pending'}]}};}},
    '@/lib/server/contract-notifications':{dispatchContractNotifications:async()=>calls.push('dispatch')},
    '@/lib/server/telegram-retractions':{TelegramRetractionError:KnownError,dispatchTelegramRetractions:async()=>calls.push('retract')},
    '@/lib/server/public-failure':{failureResponse:()=>{throw Error('Unexpected fallback');}},
  };
  const module={exports:{}};
  new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{assert(name in mocks,name);return mocks[name];},module,module.exports);
  const response=await module.exports[writing?'POST':'GET']({text:async()=>JSON.stringify({action:'send'})},{params:Promise.resolve({id:'11404'})});
  for(const job of jobs)await job();
  return {response,calls};
}
(async()=>{
  const accepted=await run({readError:'57014'});
  assert.equal(accepted.response.status,503);assert.match(accepted.response.body.message,/Đã lưu yêu cầu/);
  assert(accepted.calls.indexOf('COMMIT')<accepted.calls.indexOf('read'));
  assert(accepted.calls.includes('dispatch'));assert.equal(accepted.calls.at(-2),'release');
  for(const code of ['55P03','57014']){
    const failed=await run({saveError:code});assert(!failed.calls.includes('COMMIT'));assert(!failed.calls.includes('dispatch'));
    assert.match(failed.response.body.message,/chưa được lưu/);assert(failed.calls.includes('ROLLBACK'));
  }
  const ok=await run();assert.equal(ok.response.body.status,'success');assert.equal(ok.calls.filter(c=>c==='COMMIT').length,2);
  const retract=await run({retracting:true});assert(retract.calls.includes('retract'));
  const read=await run({writing:false});assert.equal(read.response.body.status,'success');assert(read.calls.includes('dispatch'));
  console.log('PASS: committed sends survive preview timeout; lock/query failures roll back; workers run only after commit; retractions and GET recovery remain available.');
})().catch(error=>{console.error(error);process.exitCode=1;});
