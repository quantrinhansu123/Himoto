// Portable encrypted backup: never write plaintext keystore/password payloads.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
function seal(payload,passphrase){
 assert(typeof passphrase==='string'&&passphrase.length>=16,'Use a backup passphrase of at least 16 characters');
 const salt=crypto.randomBytes(32),iv=crypto.randomBytes(12),iterations=600000;
 const key=crypto.pbkdf2Sync(passphrase,salt,iterations,32,'sha256'),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(Buffer.from('himoto-android-signing-backup-v1'));
 const plaintext=Buffer.from(JSON.stringify(payload)),body=Buffer.concat([cipher.update(plaintext),cipher.final()]);plaintext.fill(0);key.fill(0);
 return{format:'himoto-android-signing-backup-v1',kdf:'PBKDF2-SHA256',iterations,cipher:'AES-256-GCM',salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),body:body.toString('base64')};
}
function open(backup,passphrase){
 assert(backup.format==='himoto-android-signing-backup-v1'&&backup.iterations===600000&&backup.kdf==='PBKDF2-SHA256'&&backup.cipher==='AES-256-GCM');
 const key=crypto.pbkdf2Sync(passphrase,Buffer.from(backup.salt,'base64'),backup.iterations,32,'sha256'),decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(backup.iv,'base64'));
 decipher.setAAD(Buffer.from(backup.format));decipher.setAuthTag(Buffer.from(backup.tag,'base64'));
 try{const plaintext=Buffer.concat([decipher.update(Buffer.from(backup.body,'base64')),decipher.final()]);try{return JSON.parse(plaintext.toString('utf8'));}finally{plaintext.fill(0);}}finally{key.fill(0);}
}
async function main(){
 let input='';for await(const bytes of process.stdin){input+=bytes;assert(input.length<2*1024*1024);}
 const task=JSON.parse(input.replace(/^\uFEFF/,''));input=null;
 const root=path.resolve(__dirname,'..'),signing=path.join(root,'.backups/mobile-android-signing-20261105'),manifest=JSON.parse(fs.readFileSync(path.join(signing,'manifest.json'),'utf8').replace(/^\uFEFF/,''));
 const bytes=fs.readFileSync(path.join(signing,manifest.keystore));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),manifest.keystoreSha256);
 const payload={keystoreBase64:bytes.toString('base64'),keystorePassword:task.keystorePassword,keyPassword:task.keystorePassword,alias:manifest.alias,certificateSha256:manifest.certificateSha256,package:'vn.himoto.staff'};
 const backup=seal(payload,task.passphrase),restored=open(backup,task.passphrase);assert.deepEqual(restored,payload);
 const output=path.resolve(task.output);assert(output.startsWith(path.join(root,'.backups')+path.sep)&&!fs.existsSync(output));
 fs.writeFileSync(output,JSON.stringify(backup,null,2),{flag:'wx'});
 const proof={ok:true,file:path.basename(output),sha256:crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'),roundTripVerified:true,plaintextCredentialFilesWritten:0,certificateSha256:manifest.certificateSha256,createdAt:new Date().toISOString()};
 fs.writeFileSync(output+'.verification.json',JSON.stringify(proof,null,2),{flag:'wx'});task.passphrase=null;task.keystorePassword=null;payload.keystorePassword=null;payload.keyPassword=null;bytes.fill(0);
 console.log(JSON.stringify(proof,null,2));
}
module.exports={seal,open};if(require.main===module)main().catch(()=>{console.error('Signing backup failed; no key or password values logged.');process.exitCode=1;});
