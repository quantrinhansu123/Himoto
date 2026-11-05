// Build an exact source copy with no environment files and no external networking.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const arg=process.argv.indexOf('--output');assert(arg>=0&&process.argv[arg+1]);
const output=path.resolve(root,process.argv[arg+1]);assert(output.startsWith(path.join(root,'.backups')+path.sep)&&!fs.existsSync(output));
fs.mkdirSync(output,{recursive:true});const source=path.join(output,'source');fs.mkdirSync(source);
const names=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root}).toString('utf8').split('\0').filter(Boolean);
const configs=new Set(['package.json','package-lock.json','tsconfig.json','next.config.js','next-env.d.ts','postcss.config.js','eslint.config.mjs']);
const files=[...new Set(names)].filter(name=>/^(src|shared|public)\//.test(name)||configs.has(name));
assert(files.every(name=>!name.split('/').some(part=>part.startsWith('.env'))));
const manifest=[];
for(const name of files){
  const from=path.resolve(root,name);assert(from.startsWith(root+path.sep));
  const stat=fs.lstatSync(from);assert(stat.isFile()&&!stat.isSymbolicLink());
  const bytes=fs.readFileSync(from),to=path.join(source,name);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,bytes);
  assert.equal(sha(fs.readFileSync(to)),sha(bytes));manifest.push({path:name,sha256:sha(bytes),bytes:bytes.length});
}
fs.symlinkSync(path.join(root,'node_modules'),path.join(source,'node_modules'),'junction');
// QA process limits only; product configuration stays byte-identical in workspace.
fs.appendFileSync(path.join(source,'next.config.js'),"\nmodule.exports.experimental={...module.exports.experimental,cpus:1};\n");
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim();
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({head,environmentFilesCopied:0,files:manifest},null,2));
const env={...process.env,NEXT_TELEMETRY_DISABLED:'1',EXPO_NO_DOTENV:'1',HIMOTO_MOBILE_ENABLED:'true',DATABASE_URL:'postgresql://qa.invalid/no-network',SUPABASE_DATABASE_URL:'postgresql://qa.invalid/no-network',MANAGEMENT_SESSION_SECRET:'offline-build-only-synthetic-secret-not-a-live-account',NODE_OPTIONS:`--require=${path.join(root,'scripts/lib/offline-tests.cjs')} --max-old-space-size=4096`};
const log=fs.openSync(path.join(output,'build.log'),'wx');
const result=spawnSync(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'build'],{cwd:source,env,stdio:['ignore',log,log],windowsHide:true});fs.closeSync(log);
const mismatches=manifest.filter(file=>sha(fs.readFileSync(path.join(root,file.path)))!==file.sha256);
const summary={ok:result.status===0,exitCode:result.status,head,sourceFiles:manifest.length,sourceUnchanged:mismatches.length===0,changedWhileBuilding:mismatches.map(f=>f.path),environmentFilesCopied:0,externalNetworkAllowed:false,operationalWrites:0,completedAt:new Date().toISOString()};
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));process.exitCode=summary.ok&&summary.sourceUnchanged?0:1;
