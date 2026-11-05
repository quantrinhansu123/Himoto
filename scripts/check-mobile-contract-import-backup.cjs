// Native adapter contract over real disposable local files. No device data/env.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{randomUUID,createHash}=require('node:crypto');
fs.mkdirSync(path.resolve('.backups'),{recursive:true});
const directory=fs.mkdtempSync(path.resolve('.backups/mobile-contract-import-backup-files-'));
let failWrite=false;
const inside=value=>{const resolved=path.resolve(value);assert(resolved.startsWith(directory+path.sep));return resolved;};
const parts=values=>values.map(v=>typeof v==='object'?v.uri:v);
class Directory{constructor(...values){this.uri=path.join(...parts(values));}create(){fs.mkdirSync(inside(this.uri),{recursive:true});}}
class File{
  constructor(...values){this.uri=path.join(...parts(values));}
  get exists(){return fs.existsSync(inside(this.uri));}
  get parentDirectory(){return new Directory(path.dirname(this.uri));}
  create(){fs.writeFileSync(inside(this.uri),'',{flag:'wx'});}
  async write(content){fs.writeFileSync(inside(this.uri),failWrite?content.slice(0,10):content);if(failWrite)throw Error('QA full disk');}
  async text(){return fs.readFileSync(inside(this.uri),'utf8');}
  async digest(){return createHash('sha256').update(fs.readFileSync(inside(this.uri))).digest('hex');}
  move(target){fs.renameSync(inside(this.uri),inside(target.uri));this.uri=target.uri;}
  delete(){fs.unlinkSync(inside(this.uri));}
}
async function run(){
  const source=fs.readFileSync('mobile/src/lib/contract-import-backup.ts','utf8'),module={exports:{}};
  new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name==='expo-file-system'?{File,Directory,Paths:{document:directory}}:name==='expo'?{uuid:{v4:randomUUID}}:(()=>{throw Error('Unexpected dependency');})(),module,module.exports);
  const api=module.exports,scope={origin:'https://mobile-api.example.invalid',actorId:145};
  const preview=()=>{const batchId=randomUUID(),content=JSON.stringify({batchId,actorId:145,snapshot:{orders:[{id:1,source:'QA ONLY'}]}});return{batchId,backup:{content},backupSha:createHash('sha256').update(content).digest('hex')};};
  const a=preview();assert.equal(await api.verifyContractImportBackup(scope,a),a.backupSha);assert.equal((await api.readContractImportBackup(scope,a.batchId)).content,a.backup.content);assert.equal(await api.verifyContractImportBackup(scope,a),a.backupSha);
  await assert.rejects(()=>api.verifyContractImportBackup(scope,{...a,backup:{content:a.backup.content+' '}}),/chưa khớp/);assert.equal((await api.readContractImportBackup(scope,a.batchId)).content,a.backup.content);
  const b=preview();failWrite=true;await assert.rejects(()=>api.verifyContractImportBackup(scope,b),/full disk/);failWrite=false;await assert.rejects(()=>api.readContractImportBackup(scope,b.batchId),/không có/);assert.equal(await api.verifyContractImportBackup(scope,b),b.backupSha);
  const c=preview();await assert.rejects(()=>api.verifyContractImportBackup(scope,{...c,backupSha:'a'.repeat(64)}),/chưa đầy đủ/);await assert.rejects(()=>api.readContractImportBackup(scope,c.batchId),/không có/);
  await assert.rejects(()=>api.readContractImportBackup({...scope,actorId:7},a.batchId),/không có/);await assert.rejects(()=>api.readContractImportBackup({...scope,origin:'https://other.example.invalid'},a.batchId),/không có/);
  const files=fs.readdirSync(path.join(directory,'himoto-contract-import-backups',scope.origin.replace(/[^a-z0-9]/gi,'_'),'145'));assert.equal(files.length,2);assert(files.every(name=>!name.includes('.pending-')));
  console.log(JSON.stringify({passed:3,checks:['File.move mutates URI; cleanup targets original temporary path and final backup survives exact readback and repeated verification','Existing backup never overwritten; partial write/full disk or digest mismatch leaves no final/temporary partial, retry succeeds','Origin/actor scopes and backup identity enforced; only two verified synthetic backups retained'],nativeModule:'File adapter backed by real local filesystem; actual Expo Android/iOS execution remains separate',evidence:directory},null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
