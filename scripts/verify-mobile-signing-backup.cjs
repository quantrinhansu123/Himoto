const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {open}=require('./mobile-signing-backup.cjs'),{readCredentialInput}=require('./check-mobile-live-qa.cjs');
async function main(){
 const root=path.resolve(__dirname,'..'),file=path.join(root,'.backups/Himoto-Android-release-key-20261105.himoto-key');
 const input=JSON.parse((await readCredentialInput()).replace(/^\uFEFF/,''));
 const backup=JSON.parse(fs.readFileSync(file,'utf8')),payload=open(backup,input.passphrase);input.passphrase=null;
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'.backups/mobile-android-signing-20261105/manifest.json'),'utf8').replace(/^\uFEFF/,''));
 const bytes=Buffer.from(payload.keystoreBase64,'base64'),sha=crypto.createHash('sha256').update(bytes).digest('hex');
 assert.equal(sha,manifest.keystoreSha256);assert.equal(payload.alias,manifest.alias);assert.equal(payload.certificateSha256,manifest.certificateSha256);assert.equal(payload.package,'vn.himoto.staff');
 payload.keystorePassword=null;payload.keyPassword=null;payload.keystoreBase64=null;bytes.fill(0);
 const proof={ok:true,portableBackupDecryptedInMemory:true,originalKeystoreMatches:true,certificateSha256:manifest.certificateSha256,backupSha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),plaintextFilesWritten:0,verifiedAt:new Date().toISOString()};
 fs.writeFileSync(file+'.restore-check.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));
}
main().catch(()=>{console.error('Encrypted backup verification failed; no password or key values logged.');process.exitCode=1;});
