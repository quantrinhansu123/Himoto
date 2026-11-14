const assert = require('node:assert/strict');
const path = require('node:path');
const { load } = require('./check-contract-payments.cjs');
const { requestBrowserLocation } = load(path.resolve('src/lib/management/browser-geolocation'));
async function main() {
  const position={coords:{latitude:21.03,longitude:105.85,accuracy:12},timestamp:Date.now()};
  let called=false;
  const success={getCurrentPosition(ok,_fail,options){called=true;assert.equal(options.maximumAge,0);assert(options.enableHighAccuracy);ok(position);}};
  const request=requestBrowserLocation({secureContext:true,geolocation:success});
  assert(called,'Request must start synchronously inside the tap gesture');
  assert.equal((await request).latitude,21.03);
  for(const [code,reason]of [[1,'permission-denied'],[2,'unavailable'],[3,'timeout']])await assert.rejects(requestBrowserLocation({secureContext:true,geolocation:{getCurrentPosition(_ok,fail){fail({code});}}}),e=>e.reason===reason);
  await assert.rejects(requestBrowserLocation({secureContext:false,geolocation:success}),e=>e.reason==='insecure');
  await assert.rejects(requestBrowserLocation({secureContext:true,geolocation:null}),e=>e.reason==='unsupported');
  await assert.rejects(requestBrowserLocation({secureContext:true,geolocation:{getCurrentPosition(){throw Error('browser failure');}}}),e=>e.reason==='unavailable');
  await assert.rejects(requestBrowserLocation({secureContext:true,timeoutMs:5,geolocation:{getCurrentPosition(){}}}),e=>e.reason==='timeout');
  let late;
  const abort=new AbortController();
  const pending=requestBrowserLocation({secureContext:true,signal:abort.signal,geolocation:{getCurrentPosition(ok){late=ok;}}});
  abort.abort();await assert.rejects(pending,e=>e.reason==='cancelled');late(position);
  await assert.rejects(requestBrowserLocation({secureContext:true,signal:abort.signal,geolocation:success}),e=>e.reason==='cancelled');
  await assert.rejects(requestBrowserLocation({secureContext:true,geolocation:{getCurrentPosition(ok){ok({...position,coords:{...position.coords,latitude:NaN}});}}}),e=>e.reason==='invalid');
  console.log('PASS: immediate user-gesture GPS request, fresh accurate coordinates, denied/unavailable/timeout/unsupported/HTTPS errors, watchdog, thrown browser errors, abort and ignored late callbacks');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
