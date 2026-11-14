require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {randomUUID}=require('node:crypto');
const {load}=require('./lib/load-typescript.cjs');
async function main(){
  const files=new Map(),secure=new Map();let failSave=false;
  class Directory{constructor(...parts){this.uri=parts.map(value=>value.uri||value).join('/');}create(){}}
  class File{constructor(...parts){this.uri=parts.map(value=>value.uri||value).join('/');}get exists(){return files.has(this.uri);}get size(){return files.get(this.uri)?.length||0;}copy(next){assert(this.exists);assert(!next.exists);files.set(next.uri,Buffer.from(files.get(this.uri)));}delete(){files.delete(this.uri);}async arrayBuffer(){assert(this.exists);return Uint8Array.from(files.get(this.uri)).buffer;}}
  const storage={WHEN_UNLOCKED_THIS_DEVICE_ONLY:1,async getItemAsync(key){return secure.get(key)||null;},async setItemAsync(key,value){if(failSave){failSave=false;throw Error('QA Keychain failure');}assert(value.length<2048);secure.set(key,value);},async deleteItemAsync(key){secure.delete(key);}};
  const source=fs.readFileSync('mobile/src/lib/attendance-pending.ts','utf8');
  function restart(){const module={exports:{}};const localRequire=name=>name==='expo-file-system'?{Directory,File,Paths:{document:'mem://document'}}:name==='expo-secure-store'?storage:name.endsWith('shared/mobile-support')?load(path.resolve('shared/mobile-support')):(()=>{throw Error('Unexpected dependency '+name);})();new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(localRequire,module,module.exports);return module.exports;}
  let service=restart();const id=randomUUID(),origin='https://fixture.invalid',photo={uri:'mem://camera/selfie.jpg',width:100,height:80,size:4,mimeType:'image/jpeg',dispose(){},async bytes(){return new Uint8Array([255,216,255,224]).buffer;}};
  files.set(photo.uri,Buffer.from([255,216,255,224]));
  const pending={id,action:'in',photo,location:{latitude:21,longitude:105,accuracy:8,timestamp:Date.now()}};
  const stored=await service.storeAttendancePending(7,origin,pending);assert.notEqual(stored.photo.uri,photo.uri);service=restart();let resumed=await service.loadAttendancePending(7,origin);assert.equal(resumed.id,id);assert.deepEqual(Buffer.from(await resumed.photo.bytes()),files.get(photo.uri));
  await assert.rejects(service.storeAttendancePending(7,origin,{...pending,id:randomUUID()}),/chấm công chờ/);
  assert.equal(await service.loadAttendancePending(8,origin),null);await assert.rejects(service.loadAttendancePending(7,'https://other.invalid'),/máy chủ khác/);
  const updated=await service.refreshAttendancePendingLocation(7,origin,id,{...pending.location,timestamp:Date.now()+1});assert.equal(updated.id,id);assert.equal(updated.photo.uri,resumed.photo.uri);assert.deepEqual(Buffer.from(await updated.photo.bytes()),files.get(photo.uri));
  await assert.rejects(service.clearAttendancePending(7,randomUUID()),/đã thay đổi/);assert(await service.loadAttendancePending(7,origin));
  files.delete(updated.photo.uri);resumed=await service.loadAttendancePending(7,origin);assert.equal(resumed.id,id);assert.equal(resumed.photo.size,0);await service.clearAttendancePending(7,id);assert.equal(await service.loadAttendancePending(7,origin),null);
  failSave=true;await assert.rejects(service.storeAttendancePending(9,origin,pending),/Keychain/);assert.equal(await service.loadAttendancePending(9,origin),null);assert(files.has(photo.uri));assert.equal(files.size,1);
  console.log(JSON.stringify({ok:true,checks:['Native pending attendance survives module restart with original UUID and copied photo bytes','Account/origin separation, no replacement of a pending intent and CAS acknowledgement','Refreshing stale GPS preserves the logical request/photo; missing photo still permits original receipt lookup','Keychain failure removes only the new private copy and leaves the original camera photo'],fixtureOnly:true,hardwareAcceptance:false},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
