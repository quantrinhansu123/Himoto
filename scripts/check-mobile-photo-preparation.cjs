const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const source=fs.readFileSync(path.resolve(__dirname,'../mobile/src/lib/prepare-photo.ts'),'utf8');
const files=new Map(),deleted=[],loads=[],saves=[],checks=[];
const original='file:///cache/picker/original.heic';
let sizes,outputUri,dimensions,afterRender,afterSave,releasedImage,releasedContext;
function reset() {
  files.clear();files.set(original,12000000);deleted.length=loads.length=saves.length=0;
  sizes=[1000000];outputUri=null;dimensions={width:2200,height:1650};afterRender=afterSave=null;releasedImage=releasedContext=0;
}
class File {
  constructor(uri){this.uri=uri;}
  get size(){return files.get(this.uri)??null;}
  delete(){deleted.push(this.uri);files.delete(this.uri);}
}
const moduleShim={exports:{}};
new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{
  if(name==='expo-file-system')return{File,Paths:{cache:{uri:'file:///cache/'}}};
  if(name==='expo-image-manipulator')return{SaveFormat:{JPEG:'jpeg'},ImageManipulator:{manipulate(uri,options){
    loads.push({uri,options});return{release(){releasedContext++;},async renderAsync(){
      afterRender?.();return{...dimensions,release(){releasedImage++;},async saveAsync(options){
        const index=saves.length,uri=outputUri??`file:///cache/manipulator/output-${index}.jpg`;
        saves.push(options);files.set(uri,sizes[Math.min(index,sizes.length-1)]);afterSave?.();
        return{uri,...dimensions};
      }};
    }};
  }}};
  throw Error('Unexpected dependency: '+name);
},moduleShim,moduleShim.exports);
const {preparePhoto}=moduleShim.exports;
async function run(){
  reset();const ready=await preparePhoto(original);
  assert.deepEqual(loads,[{uri:original,options:{maxWidth:2200,maxHeight:2200}}]);
  assert.equal(ready.size,1000000);assert.equal(ready.mimeType,'image/jpeg');assert.equal(ready.width,2200);
  assert.deepEqual(saves,[{format:'jpeg',compress:0.85,base64:false}]);assert(files.has(ready.uri));assert(files.has(original));
  assert.equal(releasedImage,1);assert.equal(releasedContext,1);
  ready.dispose();ready.dispose();assert(!files.has(ready.uri));assert(files.has(original));assert.equal(deleted.length,1);
  checks.push('Preparation bounds native decoding, emits a measured JPEG without base64, releases native objects and deletes only its own output on explicit disposal');

  reset();sizes=[4000000,1500000];const smaller=await preparePhoto(original);
  assert.equal(saves.length,2);assert.equal(saves[1].compress,0.7);assert(!files.has('file:///cache/manipulator/output-0.jpg'));assert(files.has(smaller.uri));
  smaller.dispose();assert.deepEqual([...files.keys()],[original]);
  checks.push('An oversized first JPEG retries compression without decoding the original again, removes rejected outputs and retains the first output under 2 MiB');

  reset();sizes=[3000000];await assert.rejects(()=>preparePhoto(original),/2 MB/);
  assert.equal(saves.length,3);assert.deepEqual([...files.keys()],[original]);assert.equal(releasedImage,1);assert.equal(releasedContext,1);
  checks.push('Images still above the backend byte limit fail without keeping a misleading upload-ready result or deleting the original');

  reset();const abort=new AbortController();abort.abort();await assert.rejects(()=>preparePhoto(original,abort.signal),/hủy/);
  await assert.rejects(()=>preparePhoto('https://fixture.invalid/private.jpg'),/thiết bị/);assert.equal(loads.length,0);
  reset();const rendering=new AbortController();afterRender=()=>rendering.abort();await assert.rejects(()=>preparePhoto(original,rendering.signal),/hủy/);
  assert.equal(saves.length,0);assert.equal(releasedImage,1);assert.equal(releasedContext,1);
  reset();const saving=new AbortController();afterSave=()=>saving.abort();await assert.rejects(()=>preparePhoto(original,saving.signal),/hủy/);
  assert.deepEqual([...files.keys()],[original]);assert.equal(releasedImage,1);
  checks.push('Remote sources and pre-cancelled work never decode; cancellation during render/save releases objects and removes newly produced files');

  for(const uri of [original,'file:///elsewhere/untouched.jpg','file:///cache/../elsewhere/untouched.jpg','file:///cache-other/untouched.jpg']){
    reset();outputUri=uri;await assert.rejects(()=>preparePhoto(original),/Ảnh gốc/);assert.equal(deleted.length,0);
  }
  reset();dimensions={width:4400,height:3300};await assert.rejects(()=>preparePhoto(original),/kích thước/);assert.equal(saves.length,0);assert.equal(releasedImage,1);
  checks.push('Unexpected output paths, source aliases and ignored decode bounds fail closed without deleting a selected original or unrelated file');
  const result={passed:checks.length,checks,operationalWrites:0,nativeCodec:'Stubbed; actual image decode/compression, readability and camera/picker behavior still require native acceptance',completedAt:new Date().toISOString()};
  fs.mkdirSync('.backups',{recursive:true});fs.writeFileSync('.backups/mobile-photo-preparation-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
