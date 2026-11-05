// Freeze only reviewed mobile/pure source and fork synthetic QA without changing Samsung state.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2);
const value=name=>{const i=args.indexOf(name);if(i<0||!args[i+1])throw Error(`Missing ${name}`);return args[i+1];};
const output=path.resolve(root,value('--output')),checkpoint=path.resolve(root,value('--checkpoint'));
const backups=path.join(root,'.backups')+path.sep;
if(!output.startsWith(backups)||!checkpoint.startsWith(backups)||fs.existsSync(output)||output===checkpoint||!fs.statSync(checkpoint).isFile())throw Error('Use a new .backups destination and an existing synthetic checkpoint');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),manifest=[];
const original=fs.readFileSync(checkpoint),state=JSON.parse(original);
if(state.fixtureOnly!==true||!Number.isSafeInteger(state.generation)||state.generation<1)throw Error('Not a synthetic QA checkpoint');
fs.mkdirSync(output);
function copy(relative){
  const source=path.join(root,relative),target=path.join(output,relative),entry=fs.lstatSync(source);
  if(!entry.isFile()||entry.isSymbolicLink()||/(^|[\\/])\.env(?:\.|$)/i.test(relative))throw Error('Source is outside the explicit file allowlist');
  const bytes=fs.readFileSync(source);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});
  const digest=sha(bytes);if(sha(fs.readFileSync(target))!==digest)throw Error('Source verification failed');manifest.push({path:relative.replaceAll(path.sep,'/'),bytes:bytes.length,sha256:digest});
}
function directory(relative,extensions){
  for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){
    if(entry.name.startsWith('.'))continue;
    const name=path.join(relative,entry.name);
    if(entry.isSymbolicLink())throw Error('Refusing a source symlink');
    if(entry.isDirectory())directory(name,extensions);else if(extensions.has(path.extname(entry.name).toLowerCase()))copy(name);
  }
}
for(const name of ['package.json','package-lock.json','app.json','metro.config.js','tsconfig.json','expo-env.d.ts','babel.config.js','babel.config.cjs']){const rel=path.join('mobile',name);if(fs.existsSync(path.join(root,rel)))copy(rel);}
directory('mobile/src',new Set(['.ts','.tsx','.js','.jsx','.json']));
directory('mobile/assets',new Set(['.png','.jpg','.jpeg','.webp','.gif','.svg','.ttf','.otf']));
directory('mobile/plugins',new Set(['.cjs','.js','.json']));
directory('shared',new Set(['.ts','.tsx','.js','.json']));
fs.symlinkSync(path.join(root,'mobile/node_modules'),path.join(output,'mobile/node_modules'),process.platform==='win32'?'junction':'dir');
const statePath=path.join(output,'state.json');fs.writeFileSync(statePath,original,{flag:'wx'});
if(sha(fs.readFileSync(statePath))!==sha(original)||sha(fs.readFileSync(checkpoint))!==sha(original))throw Error('Checkpoint changed while preparing the fork');
const result={fixtureOnly:true,sourceRoot:root,output,project:path.join(output,'mobile'),statePath,sourceCheckpoint:checkpoint,sourceCheckpointSha256:sha(original),initialGeneration:state.generation,files:manifest.length,manifestSha256:sha(JSON.stringify(manifest)),manifest,createdAt:new Date().toISOString(),copiedEnvironmentFiles:0,productionAccess:false};
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify({fixtureOnly:true,output,project:result.project,statePath,files:result.files,sourceCheckpointSha256:result.sourceCheckpointSha256,initialGeneration:state.generation,copiedEnvironmentFiles:0},null,2));
