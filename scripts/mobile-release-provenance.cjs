const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const at=process.argv.indexOf('--manifest');assert(at>=0);const manifest=path.resolve(process.argv[at+1]);assert(manifest.startsWith(path.join(root,'.backups')+path.sep));
if(process.argv.includes('--verify')){
 const before=JSON.parse(fs.readFileSync(manifest,'utf8')),changed=before.files.filter(file=>!fs.existsSync(path.join(root,file.path))||sha(fs.readFileSync(path.join(root,file.path)))!==file.sha256);assert.equal(changed.length,0,'Source changed during APK build: '+changed.map(file=>file.path).join(','));console.log(JSON.stringify({sourceFiles:before.files.length,sourceUnchanged:true}));
}else{
 assert(!fs.existsSync(manifest));const names=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z','--','mobile','shared'],{cwd:root}).toString('utf8').split('\0').filter(Boolean);
 const files=[...new Set(names)].filter(name=>!name.split('/').some(part=>part.startsWith('.env'))).sort().map(name=>{assert(!/\.(jks|p12|keystore|key)$/.test(name));const file=path.resolve(root,name);assert(file.startsWith(root+path.sep)&&!fs.lstatSync(file).isSymbolicLink());const bytes=fs.readFileSync(file);return{path:name,bytes:bytes.length,sha256:sha(bytes)};});
 fs.writeFileSync(manifest,JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim(),environmentFilesRead:0,files},null,2));console.log(JSON.stringify({sourceFiles:files.length,environmentFilesRead:0}));
}
