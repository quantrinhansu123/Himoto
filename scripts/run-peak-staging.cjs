const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const file=path.resolve(process.argv[2]),fixture=JSON.parse(fs.readFileSync(file,'utf8')),ca=path.resolve(process.argv[3]);
if(!fixture.fixtureOnly||fixture.host!=='127.0.0.1'||fixture.port!==55439||!/^himoto_media_races_\d+$/.test(fixture.database))throw Error('Invalid local fixture');
const dir=path.dirname(file),log=fs.openSync(path.join(dir,'server.log'),'a');
const child=spawn(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p','3020'],{cwd:process.cwd(),windowsHide:true,stdio:['ignore',log,log],env:{...process.env,
 DATABASE_URL:`postgresql://himoto_qa_owner@127.0.0.1:55439/${fixture.database}`,DATABASE_SSL_CA:fs.readFileSync(ca,'utf8'),MANAGEMENT_SESSION_SECRET:fixture.secret,
 HIMOTO_PEAK_QA:'1',HIMOTO_PEAK_FIXTURE:file,HIMOTO_PEAK_FAULT_FILE:path.join(dir,'fault.json'),
 NODE_OPTIONS:'--require '+JSON.stringify(path.resolve('scripts/lib/peak-network-guard.cjs')),VERCEL:'1',VERCEL_URL:'',VERCEL_REGION:'',NEXT_TELEMETRY_DISABLED:'1',
 PHOTO_STORAGE_PROVIDER:'cloudinary',VIDEO_STORAGE_PROVIDER:'cloudinary',MEDIA_ARCHIVE_ENABLED:'off'}});
child.on('exit',code=>{fs.closeSync(log);process.exitCode=code||0;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill());
console.log(JSON.stringify({started:true,pid:child.pid,origin:'http://127.0.0.1:3020',fixtureOnly:true,externalSockets:'blocked'}));
