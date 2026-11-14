const assert = require('node:assert/strict');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { load } = require('./check-contract-payments.cjs');
async function main() {
  const { readStaffAccountDetails, parseStaffAccountEdit, updateStaffAccountDetails } = load(path.resolve('src/lib/server/staff-account-details'));
  const { requestPermission } = load(path.resolve('src/lib/server/access-request'));
  const { canRecoverAccountPasswords } = load(path.resolve('src/lib/management/permissions'));
  const hash = 'QA-only-one-way-hash';
  let calls = 0;
  const db = { query: async (sql, values) => {
    calls++;
    assert(sql.includes('himoto.staff_account_attribution'));
    assert(sql.includes('u.deleted_at IS NULL'));
    assert(sql.includes("<>'system.sepay'"));
    assert.deepEqual(values,[42]);
    return { rows: [
      {id:'7',login_name:'qa.staff',enabled:true,password_hash:hash,password_fingerprint:createHash('sha256').update(hash).digest('hex'),user_revision:'10',access_revision:'11'},
      {id:'8',login_name:'qa.second',enabled:false,password_hash:hash,password_fingerprint:'outdated',user_revision:'12',access_revision:'13'},
    ] };
  } };
  const owner = {id:145,access_role:'admin'};
  const result = await readStaffAccountDetails(db,owner,42);
  assert.deepEqual(result,[{id:7,login_name:'qa.staff',enabled:true,password_available:true,revision:'10:11'},{id:8,login_name:'qa.second',enabled:false,password_available:false,revision:'12:13'}]);
  assert(!JSON.stringify(result).includes(hash));
  assert(!JSON.stringify(result).includes('password_fingerprint'));
  assert(!JSON.stringify(result).includes('password_cipher'));
  assert.equal((await readStaffAccountDetails(db,{id:999,access_role:'admin'},42))[0].password_available,false);
  assert.equal((await readStaffAccountDetails(db,{id:202,access_role:'admin'},42))[0].password_available,true);
  const before = calls;
  for (const actor of [null,{}, {id:1,access_role:'hr',permissions:['hr.read','hr.write']}, {id:2,access_role:'branch_manager',permissions:['accounts.manage']}]) {
    await assert.rejects(readStaffAccountDetails(db,actor,42),error=>error.status===403);
  }
  for (const id of [0,-1,NaN,1.5,'42']) await assert.rejects(readStaffAccountDetails(db,owner,id));
  assert.equal(calls,before);
  assert.equal(requestPermission('/api/auth/accounts/staff/42','GET'),'accounts.manage');
  assert(canRecoverAccountPasswords(owner));
  assert(canRecoverAccountPasswords({id:160,access_role:'admin'}));
  assert(canRecoverAccountPasswords({id:202,access_role:'admin'}));
  assert(!canRecoverAccountPasswords({id:202,access_role:'branch_staff'}));
  assert(!canRecoverAccountPasswords({id:999,access_role:'admin'}));
  const edit = {account_id:7,login_name:' New.Nick ',revision:'10:11',password:'QA valid password',confirmation:'QA valid password'};
  assert.equal(parseStaffAccountEdit(edit).login_name,'new.nick');
  for (const patch of [{account_id:'7'},{account_id:0},{login_name:'bad name'},{revision:'10'},{password:'short'},{confirmation:'different'},{access_role:'admin'},{permissions:[]},{password:null}]) assert.throws(()=>parseStaffAccountEdit({...edit,...patch}));
  await assert.rejects(updateStaffAccountDetails(db,{id:999,access_role:'admin'},42,edit),e=>e.status===403);
  assert.equal(requestPermission('/api/auth/accounts/staff/42','PATCH'),'accounts.manage');
  console.log('PASS: staff-linked account lookup, admin-only metadata, specific password-view entitlements, matching current password fingerprint, no hash/cipher/plaintext in metadata, strict staff IDs');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
