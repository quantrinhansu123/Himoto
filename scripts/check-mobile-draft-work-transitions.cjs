// Execute the transition helper and actual lifecycle/write hooks with controlled scheduling.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {load,root}=require('./lib/load-typescript.cjs');
const {prepareDraftWorkTransition}=load(path.resolve(root,'../mobile/src/lib/draft-work-transition'));
const source=name=>fs.readFileSync(path.resolve(root,'../mobile/src',name),'utf8');
const compile=(code,requireFn)=>{const module={exports:{}};new Function('require','module','exports',ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(requireFn,module,module.exports);return module.exports;};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function hooks(){
  const slots=[],effects=[];let index=0;
  const changed=(old,next)=>!old||!next||old.length!==next.length||old.some((v,i)=>v!==next[i]);
  const react={
    useState(initial){const at=index++;if(!slots[at])slots[at]={value:typeof initial==='function'?initial():initial};return[slots[at].value,value=>{slots[at].value=typeof value==='function'?value(slots[at].value):value;}];},
    useRef(initial){const at=index++;if(!slots[at])slots[at]={current:initial};return slots[at];},
    useMemo(make,deps){const at=index++;if(!slots[at]||changed(slots[at].deps,deps))slots[at]={value:make(),deps};return slots[at].value;},
    useEffect(run,deps){const at=index++;if(!slots[at]||changed(slots[at].deps,deps))effects.push(()=>{slots[at]?.cleanup?.();slots[at]={deps,cleanup:run()};});},
  };
  return{react,render(run){index=0;const value=run();while(effects.length)effects.shift()();return value;},unmount(){slots.forEach(slot=>slot?.cleanup?.());}};
}
async function run(){const checks=[];
  {
    const order=[],held=deferred();let current=true;
    const prepare=prepareDraftWorkTransition({isCurrent:()=>current,ensurePhotos:async()=>{order.push('photo:start');await held.promise;order.push('photo:done');},hasChanges:()=>true,flush:async()=>{order.push('input:done');}});
    await tick();assert.deepEqual(order,['photo:start']);held.resolve();await prepare;assert.deepEqual(order,['photo:start','photo:done','input:done']);
    let flushes=0;await assert.rejects(()=>prepareDraftWorkTransition({isCurrent:()=>true,ensurePhotos:async()=>{throw Error('QA disk full');},hasChanges:()=>true,flush:async()=>{flushes++;}}),/QA disk full/);assert.equal(flushes,0);
    const next=deferred();const switched=prepareDraftWorkTransition({isCurrent:()=>current,ensurePhotos:()=>next.promise,hasChanges:()=>true,flush:async()=>{flushes++;}});current=false;next.resolve();await assert.rejects(()=>switched,/Phiên hoặc bản/);assert.equal(flushes,0);
    await prepareDraftWorkTransition({isCurrent:()=>true,ensurePhotos:async()=>{},hasChanges:()=>false,flush:async()=>{throw Error('Empty form must not create a work');}});
    checks.push('Transition awaits every photo before input, propagates storage failures without proceeding, stops after an owner/session change and skips a pristine empty form');
  }
  {
    const runtime=hooks(),listeners=new Set();let removed=0,prepared=0,saved=0,errors=0;
    const life=compile(source('hooks/use-draft-work-lifecycle.ts'),name=>name==='react'?runtime.react:name==='react-native'?{AppState:{addEventListener(type,listener){assert.equal(type,'change');listeners.add(listener);return{remove(){listeners.delete(listener);removed++;}};}}}:(()=>{throw Error(name);})()).useDraftWorkLifecycle;
    let prepare=async()=>{prepared++;};const render=()=>runtime.render(()=>life(true,prepare,()=>{errors++;},()=>{saved++;}));render();
    const emit=state=>[...listeners].forEach(fn=>fn(state));emit('active');await tick();assert.equal(prepared,0);
    emit('inactive');emit('background');await tick();assert.equal(prepared,2);assert.equal(saved,2);
    prepare=async()=>{prepared++;throw Error('QA local storage blocked');};render();emit('background');await tick();assert.equal(errors,1);assert.equal(listeners.size,1);
    const pending=deferred();prepare=()=>pending.promise;render();emit('background');runtime.unmount();pending.resolve();await tick();assert.equal(listeners.size,0);assert.equal(removed,1);assert.equal(saved,2);
    checks.push('The actual AppState hook saves on inactive/background without API writes, uses the current callback, surfaces failures and removes its listener/suppresses late callbacks after unmount');
  }
  function leaveFixture(){
    const runtime=hooks(),events=[],api={};let token='qa-a',prevent;
    let props={id:null,input:require('./fixtures/mobile-draft.json'),dirty:true,onReload(){},onReset(){},onError(){events.push('show-error');},beforeLeave:async()=>{events.push('photos-and-input-saved');}};
    const hook=compile(source('hooks/use-draft-write.ts'),name=>{
      if(name==='react')return runtime.react;
      if(name==='@tanstack/react-query')return{useQueryClient:()=>({invalidateQueries:async()=>{},setQueryData(){}})};
      if(name==='expo')return{uuid:{v4:()=>{throw Error('Leave must reserve no UUID');}}};
      if(name==='expo-router')return{router:{dismissTo(){events.push('unexpected-open');}},usePreventRemove(_enabled,callback){prevent=callback;return()=>events.push('disable-prevention');}};
      if(name==='@/providers/session')return{useSession:()=>({api,session:{token,user:{id:7,storeId:23,allStores:false,permissions:['contracts.read','contracts.draft']}}})};
      if(name==='@/lib/pending-writes')return{pendingWrites:{lookup:async()=>null}};
      if(name==='@/lib/api')return{ApiError:class extends Error{}};
      throw Error(name);
    }).useDraftWrite;
    const render=()=>runtime.render(()=>hook(props));let view=render();
    return{events,runtime,render,view:()=>view,request(){prevent({repeat:()=>events.push('navigate')});view=render();return view;},setPrepare(next){props={...props,beforeLeave:next};view=render();},setToken(next){token=next;view=render();}};
  }
  {
    const f=leaveFixture();f.setPrepare(async()=>{f.events.push('photo-failed');throw Error('QA cannot hold image');});await f.request().leave();
    assert(!f.events.includes('navigate')&&!f.events.includes('disable-prevention'));const failed=f.render();assert.equal(failed.exit,null);assert.equal(failed.error,'QA cannot hold image');assert(f.events.includes('show-error'));
    f.setPrepare(async()=>{f.events.push('photos-and-input-saved');});await f.request().leave();assert.equal(f.events.filter(v=>v==='navigate').length,1);assert(f.events.indexOf('photos-and-input-saved')<f.events.indexOf('navigate'));
    const switched=leaveFixture(),waiting=deferred();switched.setPrepare(()=>waiting.promise);const pending=switched.request().leave();switched.setToken('qa-b');waiting.resolve();await pending;assert(!switched.events.includes('navigate'));
    const unmounted=leaveFixture(),hold=deferred();unmounted.setPrepare(()=>hold.promise);const old=unmounted.request().leave();unmounted.runtime.unmount();hold.resolve();await old;assert(!unmounted.events.includes('navigate'));
    checks.push('The actual leave hook keeps the form mounted and reports a failed photo hold; successful retry navigates once after persistence, and token replacement/unmount prevents a stale navigation');
  }
  console.log(JSON.stringify({passed:checks.length,checks,fixtureOnly:true,operationalWrites:0,nativeLifecycleTested:false},null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
