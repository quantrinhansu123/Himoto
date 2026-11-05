require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {randomUUID,createHash}=require('node:crypto'),{load}=require('./lib/load-typescript.cjs');
const filename=path.resolve('mobile/src/lib/direct-record-video.ts'),moduleValue={exports:{}};
new Function('require','module','exports',ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name==='expo/fetch'?{fetch:(...args)=>global.fetch(...args)}:load(path.resolve(path.dirname(filename),name)),moduleValue,moduleValue.exports);
const api=moduleValue.exports;
async function run(){
  const key=randomUUID(),bytes=Buffer.from('synthetic upload body'),blob=new Blob([bytes],{type:'video/mp4'}),sha256=createHash('sha256').update(bytes).digest('hex'),video={name:'QA.mp4',blob,size:blob.size};let calls=0;
  const signed={url:`https://s3.cloudfly.vn/qa-mobile-videos/himoto/videos/browser/7/${key}/v1.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=900&X-Amz-Signature=${'a'.repeat(64)}`,headers:{'Content-Type':'video/mp4','If-None-Match':'*','x-amz-acl':'private','x-amz-meta-sha256':sha256},ticket:`cXVh.${'b'.repeat(64)}`};
  let status=200;global.fetch=async(url,options)=>{calls++;assert.equal(url,signed.url);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.method,'PUT');assert.equal(options.body,blob);assert.deepEqual(options.headers,signed.headers);assert(!Object.keys(options.headers).some(k=>/authorization|cookie/i.test(k)));assert(options.signal instanceof AbortSignal);return new Response('',{status});};
  await api.putDirectRecordVideo(video,signed,7,key,sha256,new AbortController().signal);status=412;await api.putDirectRecordVideo(video,signed,7,key,sha256,new AbortController().signal);status=503;await assert.rejects(()=>api.putDirectRecordVideo(video,signed,7,key,sha256,new AbortController().signal));
  const before=calls;for(const changed of[{url:signed.url.replace('s3.cloudfly.vn','evil.invalid')},{headers:{...signed.headers,Authorization:'Bearer fake'}},{headers:{...signed.headers,'x-amz-acl':'public-read'}},{url:signed.url.replace('/7/','/8/')},{ticket:'bad'}])await assert.rejects(()=>api.putDirectRecordVideo(video,{...signed,...changed},7,key,sha256,new AbortController().signal));assert.equal(calls,before);
  assert(await api.isDirectVideoCandidate(video));const mp4=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(16)]),mov=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypqt  '),Buffer.alloc(16)]);
  assert(await api.isDirectVideoCandidate({name:'blob',blob:new Blob([mp4])}));assert(!await api.isDirectVideoCandidate({name:'blob',blob:new Blob([mov])}));assert(!await api.isDirectVideoCandidate({name:'QA.webm',blob:new Blob(['webm'])}));
  console.log(JSON.stringify({ok:true,groups:2,checks:['Signed native PUT confines host/actor/UUID/private headers, omits bearer/cookies, refuses redirects and accepts acknowledged immutable 412 before verification','Capability probe recognizes MP4/provider-unknown headers; MOV/WebM use conversion; malformed URL/header/ticket never starts network'],externalNetworkAllowed:false},null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
