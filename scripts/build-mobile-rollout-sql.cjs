// Assemble existing reviewed mobile migrations into one transaction. Never connects to a DB.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const mobileFiles=[
 '2026-11-03-mobile-session-transition.sql','2026-10-31-mobile-sessions.sql','2026-11-06-mobile-refresh-tokens.sql','2026-10-31-mobile-writes.sql',
 '2026-11-01-mobile-bills.sql','2026-11-01-mobile-renewals.sql','2026-11-01-mobile-renewal-collections.sql',
 '2026-11-02-mobile-returns.sql','2026-11-02-mobile-swaps.sql','2026-11-02-mobile-recoveries.sql',
 '2026-11-02-mobile-vehicle-transfers.sql','2026-11-02-mobile-record-media.sql','2026-11-03-mobile-customer-documents.sql',
 '2026-11-03-mobile-customer-photo-copies.sql','2026-11-03-mobile-media-deletions.sql','2026-11-03-mobile-gps-mappings.sql','2026-11-03-mobile-text-receipts.sql'
];
const prerequisites=['2026-11-02-ownership-scope-helpers.sql','2026-11-02-contract-vehicle-scope.sql','2026-11-02-contract-vehicle-swaps.sql','2026-11-04-vehicle-photo-slot.sql'];
function assemble(files){return '-- Himoto Android rollout. Existing SQL, atomic: any error rolls the entire file back.\nBEGIN;\nSET LOCAL lock_timeout=\'5s\';\nSET LOCAL statement_timeout=\'30s\';\n'+files.map(name=>{
 const source=fs.readFileSync(path.join(root,'docs/sql',name),'utf8').replace(/\r\n/g,'\n');
 assert.equal((source.match(/^BEGIN;\s*$/gm)||[]).length,1,name);assert.equal((source.match(/^COMMIT;\s*$/gm)||[]).length,1,name);
 return '\n-- SOURCE: '+name+'\n'+source.replace(/^(BEGIN|COMMIT);[ \t]*\n?/gm,'');
}).join('\n')+'\nCOMMIT;\n';}
module.exports={mobileFiles,prerequisites,assemble};
if(require.main===module){
 const at=process.argv.indexOf('--output');assert(at>=0&&process.argv[at+1]);const folder=path.resolve(process.argv[at+1]);assert(folder.startsWith(path.join(root,'.backups')+path.sep)&&!fs.existsSync(folder));fs.mkdirSync(folder,{recursive:true});
 const artifacts=[['01-web-prerequisites.sql',prerequisites],['02-mobile-schema.sql',mobileFiles]];
 const manifest=[];for(const[name,files]of artifacts){const source=assemble(files);fs.writeFileSync(path.join(folder,name),source);manifest.push({file:name,sourceFiles:files,sha256:createHash('sha256').update(source).digest('hex')});}
 fs.copyFileSync(path.join(root,'docs/sql/2026-11-05-mobile-rollout-preflight.sql'),path.join(folder,'03-preflight-readonly.sql'));
 fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify({appliedToLiveDatabase:false,artifacts:manifest},null,2));console.log(JSON.stringify({output:folder,appliedToLiveDatabase:false,artifacts:manifest.map(r=>r.file)},null,2));
}
