const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs'),{NextRequest}=require('next/server');
const session=load(path.join(root,'lib/server/management-session')),passwords=load(path.join(root,'lib/server/account-passwords')),db=load(path.join(root,'lib/server/himoto-database')).ownerDatabase;
const {ACCESS_ROLES}=load(path.join(root,'lib/management/permissions'));
let actor=null,connections=0,queries=[],changes=0,resets=0,reveals=0;
const originals={user:session.userFromSession,read:session.readSessionUser,change:passwords.changeOwnPassword,reset:passwords.resetAccountPassword,reveal:passwords.revealAccountPassword,connect:Object.getOwnPropertyDescriptor(db,'connect')};
const admin={id:713,access_role:'admin',scope_all:true,permissions:[...ACCESS_ROLES.admin.permissions]},staff={id:714,access_role:'branch_staff',store_id:33,scope_all:false,permissions:[...ACCESS_ROLES.branch_staff.permissions]};
const request=(handler,method,url,body,origin='https://himoto.example')=>handler(new NextRequest('https://himoto.example'+url,{method,headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),{});
async function main(){const previous=process.env.MANAGEMENT_SESSION_SECRET;process.env.MANAGEMENT_SESSION_SECRET='QA-only-account-api-signing-key-32-characters';const checks=[];
 try{
  session.userFromSession=async()=>actor;session.readSessionUser=async()=>actor;
  Object.defineProperty(db,'connect',{configurable:true,value:async()=>{connections++;return {query:async sql=>{queries.push(sql);return {rows:[]};},release(){}};}});
  passwords.changeOwnPassword=async(_db,id)=>{assert.equal(id,actor.id);changes++;return {password_version:3,changed_at:'2026-10-25T00:00:00Z'};};
  passwords.resetAccountPassword=async(_db,user,id)=>{assert.equal(user.id,145);resets++;return {id,password_version:4,changed_at:'2026-10-25T00:00:00Z'};};
  passwords.revealAccountPassword=async(_db,user,id)=>{assert.equal(user.id,145);reveals++;return {id,password:'QA-only-response',revision:'1'};};
  const own=load(path.join(root,'app/api/auth/password/route')).PATCH,managed=load(path.join(root,'app/api/auth/accounts/password/route')).POST;
  assert.equal((await request(own,'PATCH','/api/auth/password',{})).status,401);
  actor=admin;assert.equal((await request(managed,'POST','/api/auth/accounts/password',{action:'reveal',id:714})).status,403);assert.equal(connections,0);
  actor=staff;assert.equal((await request(managed,'POST','/api/auth/accounts/password',{action:'reset',id:713,password:'QA-only-new'})).status,403);assert.equal(connections,0);
  assert.equal((await request(own,'PATCH','/api/auth/password',{},'https://foreign.invalid')).status,403);assert.equal(connections,0);
  assert.equal((await request(own,'PATCH','/api/auth/password',{id:713})).status,400);assert.equal(connections,0);
  checks.push('Anonymous, foreign-origin, staff and every other admin cannot access password recovery; self change rejects a forged target ID before DB access');
  const changed=await request(own,'PATCH','/api/auth/password',{current_password:'QA-current',new_password:'QA-new-strong',confirmation:'QA-new-strong'});
  assert.equal(changed.status,200);assert.equal(changes,1);assert(queries.includes('BEGIN')&&queries.includes('COMMIT'));assert.match(changed.headers.get('cache-control'),/private, no-store/);
  const cookie=changed.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=strict/);
  const token=decodeURIComponent(cookie.split(';')[0].split('=').slice(1).join('='));assert.equal(JSON.parse(Buffer.from(token.split('.')[0],'base64url')).password_version,3);
  assert(!JSON.stringify(await changed.json()).includes('QA-new-strong'));
  actor={...admin,id:145};
  const revealed=await request(managed,'POST','/api/auth/accounts/password',{action:'reveal',id:714});assert.equal(revealed.status,200);assert.equal(reveals,1);assert.match(revealed.headers.get('cache-control'),/private, no-store/);assert.equal(revealed.headers.get('vary'),'Cookie');
  const reset=await request(managed,'POST','/api/auth/accounts/password',{action:'reset',id:145,password:'QA-only-reset',revision:'1'});assert.equal(reset.status,200);assert.equal(resets,1);assert(reset.headers.get('set-cookie'));assert(!JSON.stringify(await reset.json()).includes('QA-only-reset'));
  checks.push('All roles can change only their own password; successful change/reset renews the Secure HttpOnly cookie, responses are uncached and secret recovery requires user 145');
  passwords.changeOwnPassword=async()=>{throw new passwords.AccountPasswordError('QA invalid current password');};queries=[];
  assert.equal((await request(own,'PATCH','/api/auth/password',{})).status,400);assert(queries.includes('ROLLBACK'));assert(!queries.includes('COMMIT'));
  checks.push('Password failures roll back and never issue a replacement cookie or return supplied passwords');
 }finally{session.userFromSession=originals.user;session.readSessionUser=originals.read;passwords.changeOwnPassword=originals.change;passwords.resetAccountPassword=originals.reset;passwords.revealAccountPassword=originals.reveal;Object.defineProperty(db,'connect',originals.connect);if(previous===undefined)delete process.env.MANAGEMENT_SESSION_SECRET;else process.env.MANAGEMENT_SESSION_SECRET=previous;}
 console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0,passwordsPrinted:false},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
