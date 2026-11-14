const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
const source = fs.readFileSync(path.resolve(__dirname, "../mobile/src/lib/pending-writes.ts"), "utf8");
const values = new Map(), checks = [];
const INDEX = "himoto.mobile.pending-writes.v2";
const keys = Array.from({ length: 8 }, (_, i) => `${i.toString(16).padStart(8,"0")}-0000-4000-8000-000000000000`);
let failStorage = false;
function createStore() {
  const module = { exports: {} };
  const secure = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => { if (failStorage) throw Error("QA Keychain unavailable"); values.set(key, value); },
    deleteItemAsync: async (key) => { values.delete(key); },
  };
  new Function("require", "module", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(
    (name) => name === "expo-secure-store" ? secure : name === "react-native" ? { Platform: { OS: "android" } } : (() => { throw Error("Unexpected dependency"); })(), module, module.exports);
  return module.exports.pendingWrites;
}
const scope = { origin: "https://mobile-api.example.invalid", userId: 7, storeId: 23, allStores: false };
const globalScope = { ...scope, storeId: null, allStores: true };
async function run() {
  for (const operation of ["contract.edit:101", "correction.receipts:101", "correction.renewal:101", "lifecycle.hold:101", "lifecycle.resume:101", "lifecycle.settle:101", "gps.mapping:101", "media.customer:101", "media.contract:101", "media.vehicle:101", "payment.record:101", "renewal.bill:101", "return.record:101", "return.swap:101", "return.recover:101", "vehicle.transfer:101", "vehicle.receive:101", "vehicle.reject:101", "vehicle.cancel:101", "customer.update:101", "draft.update:101", "contract.finalize:101", "contract.handover:101"]) {
    values.clear(); let store = createStore(), generated = 0;
    await store.reserve(scope, operation, () => keys[0]);
    store = createStore();
    assert.equal(await store.lookup(globalScope, operation), keys[0], "A resource-specific pending intent must survive an actor's scope change");
    assert.equal(await store.reserve(globalScope, operation, () => { generated++; return keys[1]; }), keys[0]);
    assert.equal(generated, 0);
    await store.complete(globalScope, operation, keys[0]);
    assert.equal(await store.lookup(globalScope, operation), null);
  }
  checks.push("Resource-specific intents retain their UUID across branch/all-stores scope changes and process restart; acknowledging under the new scope removes the same key");

  values.clear(); let store = createStore();
  await store.reserve(scope, "payment.record:101", () => keys[0]);
  assert.equal(await store.lookup({ ...globalScope, userId: 8 }, "payment.record:101"), null);
  assert.equal(await store.lookup({ ...globalScope, origin: "https://other.example.invalid" }, "payment.record:101"), null);
  await store.reserve(globalScope, "payment.record:101", () => keys[1]);
  assert.deepEqual(JSON.parse(values.get(INDEX)), [keys[0]]);
  checks.push("Scope recovery is restricted to the same origin/actor/resource and reserve cannot invent another UUID for that pending intent");
  for(const operation of ['payment.record:101','contract.edit:101','renewal.record:101','return.record:101','media.contract:101']){
    values.clear();store=createStore();await store.reserve(scope,operation,()=>keys[0]);
    assert.deepEqual(await store.reserveExclusive(scope,'bulk.contracts.delete',['bulk.contracts.delete'],()=>keys[1]),{operation,key:keys[0],created:false});
    values.clear();store=createStore();await store.reserve(scope,'bulk.contracts.delete',()=>keys[0]);
    assert.deepEqual(await store.reserveExclusive(scope,operation,[operation],()=>keys[1]),{operation:'bulk.contracts.delete',key:keys[0],created:false});
  }
  checks.push('Contract batch deletion and pending contract/payment/renewal/return/media intents block one another across a process restart instead of losing the original write key');

  values.clear(); store = createStore();
  await store.reserve(scope, "draft.create", () => keys[0]);
  assert.equal(await store.lookup(globalScope, "draft.create"), null);
  await store.reserve(globalScope, "draft.create", () => keys[1]);
  assert.equal(await store.lookup(scope, "draft.create"), keys[0]);
  assert.equal(await store.lookup(globalScope, "draft.create"), keys[1]);
  checks.push("Creation intents for different destination scopes remain separate; no form contents or bearer token is stored");

  values.clear(); store = createStore();
  await store.reserve(scope, "payment.record:101", () => keys[0]);
  let generated = 0; failStorage = true;
  await assert.rejects(store.reserve(globalScope, "payment.record:101", () => { generated++; return keys[1]; }), /Keychain/);
  assert.equal(generated, 0); failStorage = false;
  assert.equal(await store.lookup(scope, "payment.record:101"), keys[0]);
  checks.push("A failed secure-store scope update preserves the old UUID and blocks sending a new financial intent");

  values.clear();
  values.set(INDEX, JSON.stringify([keys[0], keys[1]]));
  values.set(INDEX + "." + keys[0], JSON.stringify({ scope, operation: "payment.record:101", key: keys[0] }));
  values.set(INDEX + "." + keys[1], JSON.stringify({ scope: { ...scope, storeId: 24 }, operation: "payment.record:101", key: keys[1] }));
  store = createStore();
  await assert.rejects(store.lookup(globalScope, "payment.record:101"), /nhiều mã|nhiều yêu cầu/);
  assert.deepEqual(JSON.parse(values.get(INDEX)), [keys[0], keys[1]]);
  checks.push("Conflicting older keys for one actor/resource fail closed without selecting or deleting either unresolved request");

  const operations = ["transfer", "receive", "reject", "cancel"].map(action => `vehicle.${action}:7101`);
  values.clear(); store = createStore(); generated = 0;
  const concurrent = await Promise.all(operations.map(operation => store.reserveExclusive(scope, operation, operations, () => keys[generated++])));
  assert.equal(generated, 1);
  assert.equal(concurrent.filter(row => row.created).length, 1);
  for (const row of concurrent) assert.deepEqual({ operation: row.operation, key: row.key }, { operation: operations[0], key: keys[0] });
  assert.deepEqual(JSON.parse(values.get(INDEX)), [keys[0]]);
  store = createStore();
  const resumed = await store.reserveExclusive(globalScope, operations[2], operations, () => { throw Error("Must not generate another UUID"); });
  assert.deepEqual(resumed, { operation: operations[0], key: keys[0], created: false });
  assert.equal(await store.lookup(globalScope, operations[0]), keys[0]);
  await store.complete(globalScope, operations[0], keys[0]);
  assert.deepEqual(await store.reserveExclusive(globalScope, operations[1], operations, () => keys[1]), { operation: operations[1], key: keys[1], created: true });
  checks.push("Concurrent transfer/receive/reject/cancel reservations serialize to one UUID; restart and scope changes preserve the original action until acknowledged");

  values.clear(); store = createStore();
  await store.reserve(scope, operations[0], () => keys[0]);
  await store.reserve(scope, operations[1], () => keys[1]);
  await assert.rejects(store.reserveExclusive(globalScope, operations[2], operations, () => keys[2]), /nhiều thao tác/);
  assert.deepEqual(JSON.parse(values.get(INDEX)), [keys[0], keys[1]]);
  assert.equal(await store.lookup(globalScope, operations[0]), keys[0]);
  assert.equal(await store.lookup(globalScope, operations[1]), keys[1]);
  checks.push("Multiple historical actions on the same vehicle block new writes and retain every unresolved key for separate reconciliation");

  values.clear(); store = createStore();
  await store.reserve(scope, operations[0], () => keys[0]);
  const otherActor = await store.reserveExclusive({ ...scope, userId: 8 }, operations[1], operations, () => keys[1]);
  const otherOrigin = await store.reserveExclusive({ ...scope, origin: "https://other.example.invalid" }, operations[2], operations, () => keys[2]);
  const otherVehicle = ["transfer", "receive", "reject", "cancel"].map(action => `vehicle.${action}:7102`);
  assert.equal(otherActor.created, true); assert.equal(otherOrigin.created, true);
  assert.equal((await store.reserveExclusive(scope, otherVehicle[0], otherVehicle, () => keys[3])).created, true);
  const beforeInvalid = JSON.stringify([...values]);
  for (const group of [[], [operations[1]], [operations[0], operations[0]], [operations[0], "invalid"]])
    await assert.rejects(store.reserveExclusive(scope, operations[0], group, () => keys[4]), /chưa hợp lệ/);
  assert.equal(JSON.stringify([...values]), beforeInvalid);
  checks.push("Exclusion is limited to one origin/actor/vehicle and invalid conflict groups cannot mutate the ledger");

  values.clear(); store = createStore();
  await store.reserve(scope, operations[0], () => keys[0]);
  failStorage = true;
  await assert.rejects(store.reserveExclusive(globalScope, operations[3], operations, () => keys[1]), /Keychain/);
  failStorage = false;
  assert.equal(await store.lookup(scope, operations[0]), keys[0]);
  assert.deepEqual(JSON.parse(values.get(INDEX)), [keys[0]]);
  store.detach();
  const queued = store.reserveExclusive(scope, operations[1], operations, () => keys[1]);
  store.detach();
  await assert.rejects(queued, /Phiên làm việc/);
  assert.deepEqual(JSON.parse(values.get(INDEX)), [keys[0]]);
  checks.push("Storage failure and session detachment block exclusive reservation without replacing or losing the pending intent");
  values.clear();store=createStore();generated=0;
  const group=['return.record:101','return.swap:101','return.recover:101'];
  const reservations=await Promise.all(group.map(operation=>store.reserveExclusive(scope,operation,group,()=>keys[generated++])));
  assert.equal(generated,1);assert.equal(reservations.filter(row=>row.created).length,1);
  assert(reservations.every(row=>row.key===keys[0]&&row.operation===group[0]));
  store=createStore();
  assert.deepEqual(await store.reserveExclusive(globalScope,group[2],group,()=>keys[1]),{operation:group[0],key:keys[0],created:false});
  const form={exports:{}};
  new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../mobile/src/lib/contract-return-pending.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(
    name=>{assert.equal(name,'./pending-writes');return{pendingWrites:store};},form,form.exports);
  await assert.rejects(()=>form.exports.lookupContractReturnPending(globalScope,group[2]),/Tài khoản/);
  assert.equal(await form.exports.lookupContractReturnPending(globalScope,group[0]),keys[0]);
  assert.deepEqual(JSON.parse(values.get(INDEX)),[keys[0]]);
  await store.complete(globalScope,group[0],keys[0]);
  assert.equal(await form.exports.lookupContractReturnPending(globalScope,group[2]),null);
  assert((await store.reserveExclusive(globalScope,group[2],group,()=>keys[1])).created);
  assert.equal(await form.exports.lookupContractReturnPending(globalScope,group[2]),keys[1]);
  await assert.rejects(()=>form.exports.lookupContractReturnPending(globalScope,group[1]),/Tài khoản/);
  checks.push("Return, swap and bad-debt recovery share one serialized contract intent; restart/scope migration keeps its action/UUID and another editor must reconcile it before sending");
  values.clear();store=createStore();
  const mediaGroup=['media.copy:101','media.contract:101','media.delete.contract:101'];
  assert((await store.reserveExclusive(scope,mediaGroup[0],mediaGroup,()=>keys[0])).created);
  store=createStore();assert.deepEqual(await store.reserveExclusive(globalScope,mediaGroup[1],mediaGroup,()=>keys[1]),{operation:mediaGroup[0],key:keys[0],created:false});
  await store.complete(globalScope,mediaGroup[0],keys[0]);assert((await store.reserveExclusive(globalScope,mediaGroup[1],mediaGroup,()=>keys[1])).created);
  assert.deepEqual(await store.reserveExclusive(scope,mediaGroup[2],mediaGroup,()=>keys[2]),{operation:mediaGroup[1],key:keys[1],created:false});
  checks.push('Customer-paper copy and contract-photo upload serialize across process restart/scope migration, preserving the actual pending action and its original UUID');
  values.clear();store=createStore();let guardedReserve=0,guardedComplete=0,permit=false;
  store.configureWorkGuard({reserve:async(current,operation,conflicts,key)=>{guardedReserve++;assert.equal(current.userId,7);assert(conflicts.includes(operation));assert.equal(key,keys[0]);if(!permit)throw Error('QA work association blocked');},complete:async(_scope,_operation,key)=>{guardedComplete++;assert.equal(key,keys[0]);if(!permit)throw Error('QA work acknowledgement missing');}});
  await assert.rejects(()=>store.reserve(scope,'draft.create',()=>keys[0]),/QA work association/);assert.equal(values.size,0);
  permit=true;assert((await store.reserveExclusive(scope,'draft.create',['draft.create'],()=>keys[0])).created);
  permit=false;await assert.rejects(()=>store.complete(scope,'draft.create',keys[0]),/QA work acknowledgement/);assert.deepEqual(JSON.parse(values.get(INDEX)),[keys[0]]);
  permit=true;await store.complete(scope,'draft.create',keys[0]);assert.deepEqual(JSON.parse(values.get(INDEX)),[]);assert.equal(guardedReserve,2);assert.equal(guardedComplete,2);
  checks.push('The installed work guard runs before either reserve variant persists a new key and before completion removes a key; a failed file association/acknowledgement leaves the original ledger intact');
  values.clear();store=createStore();
  await store.reserve(scope,'draft.create',()=>keys[0]);
  await store.reserve(scope,'media.copy:2001',()=>keys[1]);
  await store.reserve({...scope,userId:8},'media.copy:2001',()=>keys[2]);
  await store.reserve({...scope,origin:'https://other.example.invalid'},'media.copy:2001',()=>keys[3]);
  const beforeActorList=JSON.stringify([...values]);
  assert.deepEqual(await store.list(globalScope),[]);
  assert.deepEqual(await store.list(globalScope,true),[{operation:'media.copy:2001',key:keys[1]}]);
  assert.equal(JSON.stringify([...values]),beforeActorList,'Listing must not migrate a create destination or rewrite any opaque key');
  await store.complete(globalScope,'media.copy:2001',keys[1]);
  assert.equal(await store.lookup(scope,'media.copy:2001'),null);
  await store.complete(globalScope,'draft.create',keys[0]);
  assert.equal(await store.lookup(scope,'draft.create'),keys[0]);
  assert.equal(await store.lookup({...scope,userId:8},'media.copy:2001'),keys[2]);
  assert.equal(await store.lookup({...scope,origin:'https://other.example.invalid'},'media.copy:2001'),keys[3]);
  checks.push('Account can list resource intents across its own actor/store change without migrating create keys or exposing another actor/origin; exact resource acknowledgement removes only that original UUID');
  values.clear();store=createStore();
  const vehicleGroup=['vehicle.update:101','vehicle.status:101','vehicle.transfer:101','vehicle.receive:101','vehicle.reject:101','vehicle.cancel:101'];
  const vehicleRequests=await Promise.all(vehicleGroup.map((operation,index)=>store.reserveExclusive(scope,operation,vehicleGroup,()=>keys[index])));
  assert(vehicleRequests.every(row=>row.key===keys[0]&&row.operation==='vehicle.update:101'));
  store=createStore();assert.deepEqual(await store.reserveExclusive(globalScope,'vehicle.receive:101',vehicleGroup,()=>keys[1]),{operation:'vehicle.update:101',key:keys[0],created:false});
  checks.push('Vehicle profile updates and transfer/receive/reject/cancel share one serialized intent across restart/scope changes, blocking a new action while the original update is unresolved');
  values.clear();store=createStore();await store.reserve(scope,'vehicle.create',()=>keys[0]);await store.reserve(globalScope,'vehicle.create',()=>keys[1]);
  const registered=JSON.stringify([...values]);assert.deepEqual(await store.entryScope(globalScope,'vehicle.create',keys[0]),scope);
  assert.equal(await store.entryScope({...globalScope,userId:8},'vehicle.create',keys[0]),null);assert.equal(await store.entryScope({...globalScope,origin:'https://elsewhere.example.invalid'},'vehicle.create',keys[0]),null);
  assert.equal(JSON.stringify([...values]),registered,'Looking up original owner must not migrate or remove a create');
  await store.complete(await store.entryScope(globalScope,'vehicle.create',keys[0]),'vehicle.create',keys[0]);
  assert.equal(await store.lookup(globalScope,'vehicle.create'),keys[1]);assert.equal(await store.lookup(scope,'vehicle.create'),null);
  checks.push('An exact committed-vehicle receipt can locate its own actor/origin/key original create scope without migrating it, and acknowledgement preserves the other destination create');
  values.clear();store=createStore();const storeGroup=['store.update:23','store.delete:23'];
  const storeIntents=await Promise.all(storeGroup.map((operation,index)=>store.reserveExclusive(scope,operation,storeGroup,()=>keys[index])));
  assert(storeIntents.every(row=>row.key===keys[0]&&row.operation===storeGroup[0]));
  store=createStore();assert.deepEqual(await store.reserveExclusive(globalScope,storeGroup[1],storeGroup,()=>keys[1]),{key:keys[0],operation:storeGroup[0],created:false});
  await store.complete(globalScope,storeGroup[0],keys[0]);assert((await store.reserveExclusive(globalScope,storeGroup[1],storeGroup,()=>keys[1])).created);
  checks.push('Store edits and hard deletion share one durable actor/resource intent across restart and scope change; acknowledgement of the original edit is required before reserving deletion');
  values.clear();store=createStore();const staffGroup=['staff.update:501','staff.delete:501'];
  const staffIntents=await Promise.all(staffGroup.map((operation,index)=>store.reserveExclusive(scope,operation,staffGroup,()=>keys[index])));
  assert(staffIntents.every(row=>row.key===keys[0]&&row.operation===staffGroup[0]));
  store=createStore();assert.deepEqual(await store.reserveExclusive(globalScope,staffGroup[1],staffGroup,()=>keys[1]),{key:keys[0],operation:staffGroup[0],created:false});
  await store.complete(globalScope,staffGroup[0],keys[0]);assert((await store.reserveExclusive(globalScope,staffGroup[1],staffGroup,()=>keys[1])).created);
  checks.push('Staff profile/account changes and hard deletion serialize one actor/resource intent across restart and scope change; the original key must be reconciled before another action');
  values.clear();store=createStore();const cashGroup=['cash.update:1','cash.status:1','cash.delete:1'];
  const cashIntents=await Promise.all(cashGroup.map((operation,index)=>store.reserveExclusive(scope,operation,cashGroup,()=>keys[index])));
  assert(cashIntents.every(row=>row.key===keys[0]&&row.operation===cashGroup[0]));
  store=createStore();assert.deepEqual(await store.reserveExclusive(globalScope,cashGroup[2],cashGroup,()=>keys[1]),{key:keys[0],operation:cashGroup[0],created:false});
  assert((await store.reserveExclusive(scope,'bank.update:1',['bank.update:1','bank.status:1','bank.delete:1'],()=>keys[2])).created);
  await store.complete(globalScope,cashGroup[0],keys[0]);assert((await store.reserveExclusive(globalScope,cashGroup[2],cashGroup,()=>keys[1])).created);
  checks.push('Cash edits, availability and deletion serialize across restart/scope changes; a bank with the same numeric ID keeps a separate intent');
  values.clear();store=createStore();assert((await store.reserveExclusive(scope,'cashbook.delete',['cashbook.delete'],()=>keys[0])).created);
  store=createStore();assert.deepEqual(await store.reserveExclusive(globalScope,'cashbook.delete',['cashbook.delete'],()=>keys[1]),{operation:'cashbook.delete',key:keys[0],created:false});
  assert.deepEqual(await store.list(globalScope,true),[{operation:'cashbook.delete',key:keys[0]}]);
  assert.equal(await store.entryScope({...globalScope,userId:8},'cashbook.delete',keys[0]),null);
  await store.complete(globalScope,'cashbook.delete',keys[0]);assert.equal(await store.lookup(scope,'cashbook.delete'),null);
  checks.push('Voucher batch deletion retains one actor/origin intent across scope changes without an invented resource ID; restart/reconciliation preserves its original UUID and excludes another actor');
  values.clear();store=createStore();assert((await store.reserveExclusive(scope,'reminder.send:101',['reminder.send:101'],()=>keys[0])).created);
  store=createStore();assert.deepEqual(await store.reserveExclusive(globalScope,'reminder.send:101',['reminder.send:101'],()=>keys[1]),{operation:'reminder.send:101',key:keys[0],created:false});
  assert.equal(await store.entryScope({...globalScope,userId:8},'reminder.send:101',keys[0]),null);await store.complete(globalScope,'reminder.send:101',keys[0]);assert.equal(await store.lookup(scope,'reminder.send:101'),null);
  checks.push('Debt reminders preserve one original per-contract UUID across restart and store changes; other actors cannot recover or clear it');
  values.clear();store=createStore();const shiftOperations=['shift.update:1','shift.audit:1','shift.media:1'];
  const shiftIntents=await Promise.all(shiftOperations.map((op,index)=>store.reserveExclusive(scope,op,shiftOperations,()=>keys[index])));assert(shiftIntents.every(row=>row.key===keys[0]&&row.operation===shiftOperations[0]));
  store=createStore();assert.deepEqual(await store.reserveExclusive(globalScope,shiftOperations[1],shiftOperations,()=>keys[1]),{operation:shiftOperations[0],key:keys[0],created:false});await store.complete(globalScope,shiftOperations[0],keys[0]);assert((await store.reserveExclusive(scope,shiftOperations[2],shiftOperations,()=>keys[2])).created);
  checks.push('Shift edits/submission, KTNB audit and evidence serialize one per-report intent across restart and branch changes before another mutation');
  values.clear();store=createStore();const batteryOperations=['battery.update:2','battery.delete:2','battery.renew:2','battery.collect_renewal:2','battery.return:2'];
  const batteryIntents=await Promise.all(batteryOperations.map((op,index)=>store.reserveExclusive(scope,op,batteryOperations,()=>keys[index%keys.length])));assert(batteryIntents.every(row=>row.key===keys[0]&&row.operation===batteryOperations[0]));
  store=createStore();assert.deepEqual(await store.reserveExclusive(globalScope,batteryOperations[4],batteryOperations,()=>keys[1]),{operation:batteryOperations[0],key:keys[0],created:false});assert.equal(await store.entryScope({...globalScope,userId:8},batteryOperations[0],keys[0]),null);await store.complete(globalScope,batteryOperations[0],keys[0]);assert((await store.reserveExclusive(scope,batteryOperations[4],batteryOperations,()=>keys[1])).created);
  checks.push('Battery editing, deletion, renewal, collection and return share one original per-contract UUID across restart/store changes; another actor cannot acknowledge it');
  values.clear();store=createStore();assert((await store.reserveExclusive(scope,'ctype.create',['ctype.create','ctype.update'],()=>keys[0])).created);store=createStore();assert.deepEqual(await store.reserveExclusive(globalScope,'ctype.update',['ctype.create','ctype.update'],()=>keys[1]),{operation:'ctype.create',key:keys[0],created:false});assert.equal(await store.entryScope({...globalScope,userId:8},'ctype.create',keys[0]),null);await store.complete(globalScope,'ctype.create',keys[0]);assert((await store.reserveExclusive(globalScope,'ctype.update',['ctype.create','ctype.update'],()=>keys[1])).created);
  checks.push('Global contract-type creation/edit/hide retains one original catalogue intent across restart and store changes; another actor cannot clear it');
  values.clear();store=createStore();const accountGroup=['account.update:1000','account.delete:1000','account.password:1000'];assert((await store.reserveExclusive(scope,accountGroup[0],accountGroup,()=>keys[0])).created);store=createStore();assert.deepEqual(await store.reserveExclusive(globalScope,accountGroup[2],accountGroup,()=>keys[1]),{key:keys[0],operation:accountGroup[0],created:false});assert.equal(await store.entryScope({...globalScope,userId:8},accountGroup[0],keys[0]),null);await store.complete(globalScope,accountGroup[0],keys[0]);assert((await store.reserveExclusive(scope,accountGroup[2],accountGroup,()=>keys[1])).created);
  assert((await store.reserveExclusive(scope,'account.change-password',['account.change-password'],()=>keys[2])).created);store=createStore();assert.deepEqual(await store.reserveExclusive(globalScope,'account.change-password',['account.change-password'],()=>keys[3]),{key:keys[2],operation:'account.change-password',created:false});
  checks.push('Account permission changes/deletion/password viewing retain one per-user intent across scope/restart; own password changes retain their original actor-global UUID without another actor acknowledgement');
  values.clear();store=createStore();const integrationGroup=['integration.gps-account','integration.gps-enabled','integration.telegram'];assert((await store.reserveExclusive(scope,integrationGroup[0],integrationGroup,()=>keys[0])).created);store=createStore();assert.deepEqual(await store.reserveExclusive(globalScope,integrationGroup[2],integrationGroup,()=>keys[1]),{operation:integrationGroup[0],key:keys[0],created:false});assert.equal(await store.entryScope({...globalScope,userId:8},integrationGroup[0],keys[0]),null);await store.complete(globalScope,integrationGroup[0],keys[0]);assert((await store.reserveExclusive(scope,integrationGroup[2],integrationGroup,()=>keys[1])).created);
  checks.push('GPS accounts, GPS enablement and Telegram configuration share one actor-global original UUID across store changes and restart; another actor cannot acknowledge it');
  values.clear();store=createStore();const lifecycleGroup=['mark_bad_debt','settle','hold','resume','update_hold','complete_hold'].map(action=>`lifecycle.${action}:101`);
  const lifecycleIntents=await Promise.all(lifecycleGroup.map((op,index)=>store.reserveExclusive(scope,op,lifecycleGroup,()=>keys[index])));assert(lifecycleIntents.every(row=>row.key===keys[0]&&row.operation===lifecycleGroup[0]));
  store=createStore();assert.deepEqual(await store.reserveExclusive(globalScope,lifecycleGroup[5],lifecycleGroup,()=>keys[7]),{key:keys[0],operation:lifecycleGroup[0],created:false});assert.equal(await store.entryScope({...globalScope,userId:8},lifecycleGroup[0],keys[0]),null);await store.complete(globalScope,lifecycleGroup[0],keys[0]);assert((await store.reserveExclusive(scope,lifecycleGroup[2],lifecycleGroup,()=>keys[1])).created);
  checks.push('All six lifecycle actions serialize one original per-contract UUID across restart/store changes; another actor cannot acknowledge it and a different action cannot bypass unresolved hold/resume/settlement');
  values.clear();store=createStore();const videoGroup=['video.record:101','media.contract:101','media.delete.contract:101','media.copy:101','draft.delete:101'];
  const videoIntents=await Promise.all(videoGroup.map((op,i)=>store.reserveExclusive(scope,op,videoGroup,()=>keys[i])));assert(videoIntents.every(v=>v.key===keys[0]&&v.operation===videoGroup[0]));
  store=createStore();assert.deepEqual(await store.reserveExclusive(globalScope,videoGroup[1],videoGroup,()=>keys[1]),{key:keys[0],operation:videoGroup[0],created:false});await store.complete(globalScope,videoGroup[0],keys[0]);assert((await store.reserveExclusive(scope,videoGroup[1],videoGroup,()=>keys[1])).created);
  checks.push('Video upload, image/copy/delete and draft deletion serialize one durable UUID across restart and branch changes; acknowledging video is required before a conflicting file mutation');
  values.clear();store=createStore();const imports=[`import.contracts:${keys[3]}`,`import.customers:${keys[4]}`,`import.cstores:${keys[5]}`];
  assert((await store.reserveExclusive(scope,imports[0],imports,()=>keys[0])).created);store=createStore();assert.deepEqual(await store.reserveExclusive(globalScope,imports[1],imports,()=>keys[1]),{key:keys[0],operation:imports[0],created:false});assert.equal(await store.entryScope({...globalScope,userId:145},imports[0],keys[0]),null);await store.complete(globalScope,imports[0],keys[0]);
  checks.push('Contract/customer/store-match import group preserves the original actor UUID across restart and branch changes; another actor cannot acknowledge it');
  for(const op of ['telegram.contract:9301','telegram.transfer:501']){values.clear();store=createStore();await store.reserve(scope,op,()=>keys[0]);store=createStore();assert.equal(await store.lookup(globalScope,op),keys[0]);assert.deepEqual(await store.reserveExclusive(globalScope,op,[op],()=>keys[1]),{key:keys[0],operation:op,created:false});await store.complete(globalScope,op,keys[0]);}
  checks.push('Contract Telegram and transfer Telegram preserve one original request across restart/branch changes until explicit acknowledgement');
  for(const [bulk,single] of [['bulk.staff.delete','staff.update:101'],['bulk.stores.delete','store.delete:23'],['bulk.customers.delete','customer.update:101'],['bulk.vehicles.delete','vehicle.transfer:101'],['bulk.vehicles.delete','vehicle.status:101']]){
    values.clear();store=createStore();await store.reserveExclusive(scope,bulk,[bulk],()=>keys[0]);store=createStore();assert.deepEqual(await store.reserveExclusive(globalScope,single,[single],()=>keys[1]),{operation:bulk,key:keys[0],created:false});await assert.rejects(store.reserve(globalScope,single,()=>keys[1]));assert.equal(await store.entryScope({...globalScope,userId:8},bulk,keys[0]),null);await store.complete(globalScope,bulk,keys[0]);await store.reserveExclusive(scope,single,[single],()=>keys[1]);assert.deepEqual(await store.reserveExclusive(globalScope,bulk,[bulk],()=>keys[2]),{operation:single,key:keys[1],created:false});
  }
  checks.push('All four bulk deletion families conflict in both directions with individual writes, preserve the original actor UUID through restart/store changes and deny another actor acknowledgement');
  const result = { passed: checks.length, checks, operationalWrites: 0, nativeStorage: "SecureStore stub; Android scope-transition acceptance is separate", completedAt: new Date().toISOString() };
  fs.writeFileSync(path.resolve(__dirname, "../.backups/mobile-pending-scope-results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
