// Real local disk + independent Node process. Does not execute Expo/native filesystem APIs.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const {load,root}=require('./lib/load-typescript.cjs');
const {createContractWorkJournal}=load(path.resolve(root,'../mobile/src/lib/contract-work-journal'));
const {isWorkUuid}=load(path.resolve(root,'../shared/mobile-contract-work'));
const scope={origin:'https://disk-qa.example.invalid',userId:7,storeId:23,allStores:false};
const backups=path.resolve(root,'../.backups');
function disk(directory){
  const absolute=path.resolve(directory);assert(absolute.startsWith(backups+path.sep));
  const target=p=>{assert(typeof p==='string'&&!p.includes('..')&&!path.isAbsolute(p));const resolved=path.resolve(absolute,p);assert(resolved===absolute||resolved.startsWith(absolute+path.sep));return resolved;};
  return{lockKey:absolute,
    async list(p){return(await fs.readdir(target(p),{withFileTypes:true})).map(e=>({name:e.name,directory:e.isDirectory()}));},
    async mkdir(p){await fs.mkdir(target(p),{recursive:true});},
    async read(p,max){assert((await fs.stat(target(p))).size<=max);return fs.readFile(target(p),'utf8');},
    async writeNew(p,value){const handle=await fs.open(target(p),'wx');try{await handle.writeFile(value,'utf8');}finally{await handle.close();}},
    async digest(p){return createHash('sha256').update(await fs.readFile(target(p))).digest('hex');},
    async photoSize(p){return(await fs.stat(target(p))).size;},
  };
}
async function run(){
  if(process.argv[2]==='--read'){
    const directory=process.argv[3],workId=process.argv[4];assert(isWorkUuid(workId));const journal=createContractWorkJournal(disk(directory),scope,randomUUID);console.log(JSON.stringify(await journal.load(workId)));return;
  }
  await fs.mkdir(backups,{recursive:true});
  const directory=path.join(backups,'mobile-contract-work-disk-'+randomUUID());await fs.mkdir(directory);
  const data=path.join(directory,'actor');await fs.mkdir(data);const journal=createContractWorkJournal(disk(data),scope,randomUUID);
  const input=JSON.parse(JSON.stringify(require('./fixtures/mobile-draft.json')));input.draft.customer.name='QA khôi phục tiếng Việt';input.draft.total_amount='1250000';input.draft.vehicles[0].driver_name='Manual QA';
  const workId=randomUUID(),key=randomUUID();let head=await journal.create(workId,input,null);head=await journal.change(head,scope,{type:'edit',input,step:4});head=await journal.change(head,scope,{type:'plan-metadata',key});
  const inspect=()=>JSON.parse(execFileSync(process.execPath,[__filename,'--read',data,workId],{cwd:path.resolve(root,'..'),encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  let cold=inspect();assert.deepEqual(cold,head);assert.equal(cold.work.attempts[0].key,key);assert.deepEqual(cold.work.attempts[0].input,input);
  head=await journal.change(head,scope,{type:'committed',key,receipt:{id:2001,revision:'11',replayed:false}});head=await journal.change(head,scope,{type:'acknowledge',key});cold=inspect();assert.deepEqual(cold,head);assert.equal(cold.work.contractId,2001);
  const previousBytes=await fs.readFile(path.join(data,workId,'generations',head.commitId,'state.json'));
  const broken=path.join(data,workId,'generations',randomUUID());await fs.mkdir(broken);await fs.writeFile(path.join(broken,'state.json'),'{"partial":','utf8');let refused=false;
  try{inspect();}catch(error){refused=true;assert(error.stderr.toString().includes('ContractWorkStorageError'));}assert(refused);
  assert.deepEqual(await fs.readFile(path.join(data,workId,'generations',head.commitId,'state.json')),previousBytes);
  const result={passed:3,checks:['Independent process reads exact form/step/planned UUID and normalized submission from actual local files','Independent process restores original metadata ID and acknowledgement without creating another work or UUID','Partial newer generation blocks independent-process resume and leaves previous sealed bytes unchanged'],directory:path.relative(path.resolve(root,'..'),directory).replaceAll(path.sep,'/'),fixtureOnly:true,operationalWrites:0,independentProcess:true,nativeAdapterExecuted:false};
  await fs.writeFile(path.join(directory,'results.json'),JSON.stringify(result,null,2),'utf8');console.log(JSON.stringify(result,null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
