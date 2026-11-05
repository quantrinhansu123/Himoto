// SDK58 adapter contract using an in-memory File/Directory implementation. This is not native acceptance.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module'),{randomUUID,createHash}=require('node:crypto');
const {load,root}=require('./lib/load-typescript.cjs'),copy=v=>JSON.parse(JSON.stringify(v));
const files=new Map(),dirs=new Set(['file:///app/documents','file:///app/cache','file:///personal-gallery']),calls=[];
let copiesStarted=0,copiesFinished=0;
const uri=(...parts)=>new URL(parts.map(p=>typeof p==='string'?p:p.uri).join('/')).href.replace(/\/$/,'');
const parent=p=>p.slice(0,p.lastIndexOf('/'));
class Directory{
  constructor(...parts){this.uri=uri(...parts);}
  get name(){return this.uri.slice(this.uri.lastIndexOf('/')+1);}
  create(){let p=this.uri;while(p.startsWith('file:///')&&p.length>8){dirs.add(p);p=parent(p);}}
  list(){calls.push(['list',this.uri]);assert(dirs.has(this.uri));const prefix=this.uri+'/';return[...dirs].filter(p=>p.startsWith(prefix)&&!p.slice(prefix.length).includes('/')).map(p=>new Directory(p)).concat([...files.keys()].filter(p=>p.startsWith(prefix)&&!p.slice(prefix.length).includes('/')).map(p=>new File(p)));}
}
class File{
  constructor(...parts){this.uri=uri(...parts);}
  get name(){return this.uri.slice(this.uri.lastIndexOf('/')+1);}
  get exists(){return files.has(this.uri);}
  get size(){assert(this.exists);return files.get(this.uri).length;}
  create(options){assert(options.overwrite===false);assert(dirs.has(parent(this.uri)));assert(!this.exists);files.set(this.uri,Buffer.alloc(0));calls.push(['create',this.uri]);}
  async write(text){assert(this.exists);await Promise.resolve();files.set(this.uri,Buffer.from(text));calls.push(['write',this.uri]);}
  async text(){calls.push(['read',this.uri]);return files.get(this.uri).toString('utf8');}
  async digest(algorithm){assert.equal(algorithm,'SHA-256');calls.push(['hash',this.uri]);return createHash('sha256').update(files.get(this.uri)).digest('hex');}
  async copy(destination,options){copiesStarted++;assert(options.overwrite===false);assert(!destination.exists);await Promise.resolve();files.set(destination.uri,Buffer.from(files.get(this.uri)));copiesFinished++;calls.push(['copy',this.uri,destination.uri]);}
  async arrayBuffer(){calls.push(['bytes',this.uri]);const b=files.get(this.uri);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}
  delete(){assert(this.exists);calls.push(['delete',this.uri]);files.delete(this.uri);}
}
const originalLoad=Module._load;let openNativeContractWorkStore;
try{
  Module._load=function(request,...args){if(request==='expo-file-system')return{File,Directory,Paths:{document:new Directory('file:///app/documents'),cache:new Directory('file:///app/cache')}};if(request==='expo')return{uuid:{v4:randomUUID}};return originalLoad.call(this,request,...args);};
  ({openNativeContractWorkStore}=load(path.resolve(root,'../mobile/src/lib/contract-work-files')));
}finally{Module._load=originalLoad;}
const scope={origin:'https://work-qa.example.invalid',userId:7,storeId:23,allStores:false},input=copy(require('./fixtures/mobile-draft.json'));
async function run(){
  const j=await openNativeContractWorkStore(scope),id=randomUUID();let head=await j.create(id,input,null);
  const jpeg=Buffer.from([255,216,255,224,1,2,3,4]),cache='file:///app/cache/prepared-qa.jpg',gallery='file:///personal-gallery/original.jpg';files.set(cache,jpeg);files.set(gallery,Buffer.from(jpeg));
  let disposed=0;const source={uri:cache,width:640,height:420,size:jpeg.length,mimeType:'image/jpeg',dispose:()=>{disposed++;},bytes:async()=>jpeg.buffer.slice(jpeg.byteOffset,jpeg.byteOffset+jpeg.byteLength)};
  const photoId=randomUUID(),photo=await j.importPreparedPhoto(id,photoId,'rental-document-1',source);assert.equal(disposed,0);assert.equal(copiesStarted,1);assert.equal(copiesFinished,1);
  head=await j.change(head,scope,{type:'add-photo',photo});
  assert.deepEqual(await j.recoverPreparedPhoto(id,photoId,'rental-document-1',source),photo);assert.equal(copiesStarted,1);
  files.set(cache,Buffer.from([255,216,255,224,9,9,9,9]));await assert.rejects(()=>j.recoverPreparedPhoto(id,photoId,'rental-document-1',source));files.set(cache,jpeg);
  const restarted=await openNativeContractWorkStore(scope);assert.deepEqual((await restarted.load(id)).work,head.work);
  const restored=await restarted.readPhoto(id,photoId);assert(restored.uri.includes('/himoto-contract-work-v1/'));assert(!restored.uri.includes('personal-gallery'));assert.deepEqual(Buffer.from(await restored.bytes()),jpeg);restored.dispose();assert(files.has(restored.uri));
  const serialized=[...files].filter(([p])=>p.endsWith('/state.json')).map(([,b])=>b.toString()).join('');assert(!serialized.includes('file:///'));assert(!serialized.includes('personal-gallery'));assert(!serialized.includes('prepared-qa.jpg'));
  const start=calls.length;const foreign=await openNativeContractWorkStore({...scope,userId:8});await assert.rejects(()=>foreign.load(id));assert(!calls.slice(start).some(([action,p])=>action==='read'&&p.includes('/'+id+'/generations/')));
  const otherOrigin=await openNativeContractWorkStore({...scope,origin:'https://elsewhere.example.invalid'});assert.deepEqual(await otherOrigin.list(),[]);
  const changedScope=await openNativeContractWorkStore({...scope,storeId:24});assert.equal((await changedScope.load(id)).work.scope.storeId,23);await assert.rejects(()=>changedScope.change(head,{...scope,storeId:24},{type:'edit',input,step:2}));
  const reads=calls.length;for(const bad of [gallery,'content://photos/private.jpg','https://example.invalid/photo.jpg','file:///app/cache/../documents/private.jpg'])await assert.rejects(()=>j.importPreparedPhoto(id,randomUUID(),'rental-document-1',{...source,uri:bad}));assert(!calls.slice(reads).some(([action,p])=>['bytes','hash','copy'].includes(action)&&p===gallery));
  await assert.rejects(()=>j.importPreparedPhoto(id,photoId,'rental-document-1',source));
  files.set(cache,Buffer.alloc(8));await assert.rejects(()=>j.importPreparedPhoto(id,randomUUID(),'driver-license',source));files.set(cache,jpeg);
  files.set(restored.uri,Buffer.from([255,216,255,224,9,9,9,9]));await assert.rejects(()=>restored.bytes());files.set(restored.uri,jpeg);
  assert.deepEqual(files.get(gallery),jpeg);assert.deepEqual(files.get(cache),jpeg);assert.equal(disposed,0);
  assert(calls.filter(([action])=>action==='delete').every(([,p])=>/^file:\/\/\/app\/documents\/himoto-contract-work-v1\/scope-[0-9a-f-]{36}\.tmp$/.test(p)));
  console.log(JSON.stringify({passed:4,checks:['Actor/origin directories are hashed before listing form/photo payloads; same-actor store changes retain original scope','Prepared JPEG copy is awaited and bound by owned UUID path/bytes/SHA; cold factory reads original form/photo while view dispose preserves durable file','Gallery/content/network/escaping paths and duplicate destinations reject; manifests carry relative file IDs and no source URI','Changed file bytes and non-JPEG cache payload reject; only the current owned scope header is deleted, original gallery/cache images remain untouched'],sdkAdapterMocked:true,nativeAdapterExecuted:false,fixtureOnly:true,operationalWrites:0},null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
