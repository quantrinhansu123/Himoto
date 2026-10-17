/* Background collector; credentials stay on the server. Configuration is local and ignored by Git. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.backups','integration-worker');
const config=JSON.parse(fs.readFileSync(path.join(dir,'config.json'),'utf8'));
const url=new URL(config.url);
if(url.protocol!=='https:'||url.hostname!=='himoto.vercel.app'||!/^[a-f0-9]{64}$/.test(config.token))throw Error('Invalid integration worker configuration');
fs.mkdirSync(dir,{recursive:true});
const lock=path.join(dir,'worker.lock');
if(fs.existsSync(lock)){
  const previous=Number(fs.readFileSync(lock,'utf8'));
  try{if(Number.isSafeInteger(previous)&&previous>0){process.kill(previous,0);process.exit(0);}}catch{}
  fs.unlinkSync(lock);
}
try{fs.writeFileSync(lock,String(process.pid),{flag:'wx'});}catch{process.exit(0);}
process.on('exit',()=>{try{if(fs.readFileSync(lock,'utf8')===String(process.pid))fs.unlinkSync(lock);}catch{}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>process.exit(0));
async function tick(){
  const started=Date.now(),state={checkedAt:new Date().toISOString(),ok:false};
  try{
    const response=await fetch(config.url,{method:'POST',headers:{Authorization:'Bearer '+config.token},signal:AbortSignal.timeout(55000),redirect:'error',cache:'no-store'});
    state.httpStatus=response.status;
    const body=await response.json().catch(()=>null);state.ok=response.ok&&body?.status==='success';
    if(state.ok){state.gps=body.gps;state.telegram=body.telegram;}
  }catch(error){state.error=error.name;}
  fs.writeFileSync(path.join(dir,'last-result.json'),JSON.stringify(state,null,2));
  setTimeout(()=>void tick(),state.ok?Math.max(1000,5000-(Date.now()-started)):30000);
}
void tick();
