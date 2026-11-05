const assert=require('node:assert/strict'),{seal,open}=require('./mobile-signing-backup.cjs');
const payload={keystoreBase64:'QA_ONLY',keystorePassword:'QA_PLAINTEXT_MUST_NOT_LEAK',alias:'QA'},password='QA_Backup_Test_Phrase_20261105';
const first=seal(payload,password),second=seal(payload,password);
assert.deepEqual(open(first,password),payload);assert.notEqual(first.salt,second.salt);assert.notEqual(first.body,second.body);assert(!JSON.stringify(first).includes(payload.keystorePassword));
assert.throws(()=>open(first,password+'x'));assert.throws(()=>open({...first,body:Buffer.from('tampered').toString('base64')},password));assert.throws(()=>seal(payload,'short'));
console.log(JSON.stringify({ok:true,roundTrip:true,randomized:true,wrongPasswordRejected:true,tamperingRejected:true,plaintextAbsent:true,operationalKeysRead:false}));
