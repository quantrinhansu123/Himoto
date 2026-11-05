// Execute the legacy/current/mixed session transition entirely in memory.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash,randomBytes,randomUUID}=require('node:crypto'),{NextRequest}=require('next/server');
const {load,root}=require('./lib/load-typescript.cjs');
const read=file=>fs.readFileSync(path.resolve(root,'..',file),'utf8');
const transition=read('docs/sql/2026-11-03-mobile-session-transition.sql'),legacyDdl=read('scripts/fixtures/mobile-session-legacy.sql'),currentDdl=read('docs/sql/2026-10-31-mobile-sessions.sql');
const hash=token=>createHash('sha256').update(token).digest('hex');
async function run(){
  const at=process.argv.indexOf('--pglite-path');if(at<0)throw Error('Pass --pglite-path for offline PostgreSQL only');
  const {PGlite}=require(path.resolve(process.argv[at+1])),checks=[];
  const previous={};for(const key of ['HIMOTO_MOBILE_ENABLED','NODE_ENV','DATABASE_URL','MANAGEMENT_SESSION_SECRET'])previous[key]=process.env[key];
  Object.assign(process.env,{HIMOTO_MOBILE_ENABLED:'true',NODE_ENV:'production',DATABASE_URL:'postgresql://fixture.invalid/no-network',MANAGEMENT_SESSION_SECRET:'offline-mobile-session-transition-secret'});
  const api=load(path.join(root,'lib/server/mobile-session'));
  async function setup(){
    const pg=new PGlite();await pg.exec(`CREATE SCHEMA himoto;CREATE ROLE himoto_scoped;CREATE ROLE anon;CREATE ROLE authenticated;
      CREATE TABLE himoto.users(id bigint PRIMARY KEY,name text,email text,role text,role_id bigint,status text,management_password_version integer,deleted_at timestamptz);
      CREATE TABLE himoto.roles(id bigint PRIMARY KEY,slug text);INSERT INTO himoto.roles VALUES(2,'staff');
      CREATE TABLE himoto.management_account_access(user_id bigint PRIMARY KEY,access_role text,permissions text[],store_id bigint,scope_all boolean,enabled boolean);
      INSERT INTO himoto.users VALUES(7,'QA Session','qa-session@example.invalid','staff',2,'active',3,NULL);
      INSERT INTO himoto.management_account_access VALUES(7,'branch_staff',ARRAY['vehicles.read','customers.read'],23,false,true);
      GRANT USAGE ON SCHEMA himoto TO himoto_scoped,anon,authenticated;
    `);return pg;
  }
  const db=pg=>({async query(sql,values){const r=await pg.query(sql,values);return {...r,rowCount:r.rows.length||r.affectedRows||0};}});
  const actor={id:7,name:'QA Session',email:'qa-session@example.invalid',role:'staff',access_role:'branch_staff',permissions:['vehicles.read','customers.read'],store_id:23,scope_all:false,password_version:3};
  const request=token=>new NextRequest('https://fixture.invalid/api/mobile/v1/session',{headers:{Authorization:'Bearer '+token}});
  const legacyColumns='id,user_id,access_token_hash,refresh_token_hash,access_expires_at,refresh_expires_at,created_at,rotated_at,revoked_at';
  const currentColumns='id,user_id,token_hash,password_version,device_name,platform,created_at,expires_at,revoked_at';
  async function issueLegacy(pg){
    const id=randomUUID(),access=id+'.'+randomBytes(32).toString('base64url'),refresh=id+'.'+randomBytes(32).toString('base64url');
    await pg.query(`INSERT INTO himoto.management_mobile_sessions(id,user_id,access_token_hash,refresh_token_hash,access_expires_at,refresh_expires_at)
      VALUES($1,7,$2,$3,now()+interval '15 minutes',now()+interval '30 days')`,[id,hash(access),hash(refresh)]);
    return {id,access,refresh};
  }
  try{
    for(const baseline of ['legacy','current']){
      const pg=await setup(),database=db(pg);
      try{
        await pg.exec(baseline==='legacy'?legacyDdl:currentDdl);
        const legacy=baseline==='legacy'?await issueLegacy(pg):null;
        const current=baseline==='current'?await api.createMobileSession(actor,'QA Android','android',database):null;
        const columns=baseline==='legacy'?legacyColumns:currentColumns;
        const before=JSON.stringify((await pg.query(`SELECT ${columns} FROM himoto.management_mobile_sessions ORDER BY id`)).rows);
        await pg.exec(transition);assert.equal(JSON.stringify((await pg.query(`SELECT ${columns} FROM himoto.management_mobile_sessions ORDER BY id`)).rows),before);
        await pg.exec(transition);await pg.exec(currentDdl);
        assert.equal(JSON.stringify((await pg.query(`SELECT ${columns} FROM himoto.management_mobile_sessions ORDER BY id`)).rows),before);
        const old=legacy||await issueLegacy(pg),modern=current||await api.createMobileSession(actor,'QA iPhone','ios',database);
        assert.equal((await api.requireMobileSession(request(modern.token),database)).user.id,7);
        await assert.rejects(()=>api.requireMobileSession(request(old.access),database),e=>e.code==='SESSION_EXPIRED');
        assert.equal((await pg.query('SELECT user_id FROM himoto.management_mobile_sessions WHERE id=$1 AND access_token_hash=$2 AND access_expires_at>now() AND refresh_expires_at>now() AND revoked_at IS NULL',[old.id,hash(old.access)])).rows[0].user_id,7);
        const nextAccess=old.id+'.'+randomBytes(32).toString('base64url'),nextRefresh=old.id+'.'+randomBytes(32).toString('base64url');
        const rotate=async refresh=>pg.query(`UPDATE himoto.management_mobile_sessions SET access_token_hash=$1,refresh_token_hash=$2,
          access_expires_at=LEAST(now()+interval '15 minutes',refresh_expires_at),rotated_at=now()
          WHERE id=$3 AND refresh_token_hash=$4 AND refresh_expires_at>now() AND revoked_at IS NULL RETURNING user_id`,[hash(nextAccess),hash(nextRefresh),old.id,hash(refresh)]);
        assert.equal((await rotate(old.refresh)).rows.length,1);assert.equal((await rotate(old.refresh)).rows.length,0);
        assert.equal((await api.requireMobileSession(request(modern.token),database)).user.id,7);
        for(const role of ['himoto_scoped','anon','authenticated'])for(const table of ['management_mobile_sessions','management_mobile_login_limits',...(baseline==='legacy'?['management_mobile_login_attempts']:[])])for(const verb of ['SELECT','INSERT','UPDATE','DELETE'])
          assert.equal((await pg.query('SELECT has_table_privilege($1,$2,$3) AS allowed',[role,'himoto.'+table,verb])).rows[0].allowed,false);
        await api.revokeMobileSession((await api.requireMobileSession(request(modern.token),database)).sessionId,7,database);
        await assert.rejects(()=>api.requireMobileSession(request(modern.token),database),e=>e.code==='SESSION_EXPIRED');
        const versioned=await api.createMobileSession(actor,'QA versioned','android',database);await pg.query('UPDATE himoto.users SET management_password_version=4 WHERE id=7');
        await assert.rejects(()=>api.requireMobileSession(request(versioned.token),database),e=>e.code==='SESSION_EXPIRED');
        const updated=await api.createMobileSession({...actor,password_version:4},'QA new version','android',database);
        const currentRow=(await api.requireMobileSession(request(updated.token),database));assert.equal(currentRow.user.password_version,4);
        await pg.query('UPDATE himoto.management_mobile_sessions SET expires_at=now()-interval \'1 minute\',created_at=now()-interval \'1 hour\' WHERE token_hash=$1',[hash(updated.token)]);
        await assert.rejects(()=>api.requireMobileSession(request(updated.token),database),e=>e.code==='SESSION_EXPIRED');
        for(let i=0;i<10;i++)await api.consumeMobileLoginAttempt('qa-rate@example.invalid',database);
        await assert.rejects(()=>api.consumeMobileLoginAttempt('QA-RATE@example.invalid',database),e=>e.code==='RATE_LIMITED');
        await pg.query("UPDATE himoto.management_mobile_login_limits SET expires_at=now()-interval '1 second'");await api.consumeMobileLoginAttempt('qa-rate@example.invalid',database);
        const corrupt=[
          {sql:'INSERT INTO himoto.management_mobile_sessions(id,user_id) VALUES($1,7)',values:[randomUUID()]},
          {sql:"INSERT INTO himoto.management_mobile_sessions(id,user_id,token_hash,password_version,device_name,platform,expires_at) VALUES($1,7,$2,-1,'QA','android',now()+interval '1 hour')",values:[randomUUID(),'a'.repeat(64)]},
          {sql:"INSERT INTO himoto.management_mobile_sessions(id,user_id,token_hash,password_version,device_name,platform,expires_at,access_token_hash) VALUES($1,7,$2,4,'QA','android',now()+interval '1 hour',$3)",values:[randomUUID(),'b'.repeat(64),'c'.repeat(64)]},
          {sql:"INSERT INTO himoto.management_mobile_sessions(id,user_id,access_token_hash,refresh_token_hash,access_expires_at,refresh_expires_at) VALUES($1,7,$2,$3,now()+interval '2 hours',now()+interval '1 hour')",values:[randomUUID(),'d'.repeat(64),'e'.repeat(64)]},
        ];
        for(const item of corrupt)await assert.rejects(()=>pg.query(item.sql,item.values),e=>e.code==='23514');
        await pg.query('UPDATE himoto.management_account_access SET enabled=false WHERE user_id=7');
        const disabled=await api.createMobileSession({...actor,password_version:4},'QA disabled','android',database);await assert.rejects(()=>api.requireMobileSession(request(disabled.token),database),e=>e.code==='SESSION_EXPIRED');
        checks.push(`${baseline} baseline: migration/rerun preserves original rows; legacy insert/one-time refresh and current auth coexist; expiry/password version/revoke/disabled user/rate limit/credential-family checks and owner-only grants verified`);
      }finally{await pg.close();}
    }
    for(const invalid of ['partial','wrong-type','nullable-actor','unexpected-policy','invalid-row']){
      const pg=await setup();try{
        await pg.exec(legacyDdl);await issueLegacy(pg);
        if(invalid==='partial')await pg.exec('ALTER TABLE himoto.management_mobile_sessions DROP COLUMN rotated_at');
        if(invalid==='wrong-type')await pg.exec('ALTER TABLE himoto.management_mobile_sessions ALTER COLUMN access_token_hash TYPE text');
        if(invalid==='nullable-actor')await pg.exec('ALTER TABLE himoto.management_mobile_sessions ALTER COLUMN user_id DROP NOT NULL');
        if(invalid==='unexpected-policy')await pg.exec('CREATE POLICY unexpected_client ON himoto.management_mobile_sessions FOR SELECT TO himoto_scoped USING(true)');
        if(invalid==='invalid-row')await pg.exec("UPDATE himoto.management_mobile_sessions SET access_token_hash='malformed-qa'");
        const rows=JSON.stringify((await pg.query('SELECT * FROM himoto.management_mobile_sessions')).rows),columns=JSON.stringify((await pg.query("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='himoto' AND table_name='management_mobile_sessions' ORDER BY ordinal_position")).rows);
        await assert.rejects(()=>pg.exec(transition));await pg.exec('ROLLBACK');
        assert.equal(JSON.stringify((await pg.query('SELECT * FROM himoto.management_mobile_sessions')).rows),rows);
        assert.equal(JSON.stringify((await pg.query("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='himoto' AND table_name='management_mobile_sessions' ORDER BY ordinal_position")).rows),columns);
        assert.equal((await pg.query("SELECT to_regclass('himoto.management_mobile_login_limits') AS table_name")).rows[0].table_name,null);
        checks.push(`Unsupported ${invalid} aborts the whole transition with original credential rows/schema intact and no partial login-limit table`);
      }finally{await pg.close();}
    }
  }finally{for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}
  const result={passed:checks.length,checks,fixtureOnly:true,operationalWrites:0,legacyApkCompatibilityCertified:false};
  fs.writeFileSync(path.resolve(root,'../.backups/mobile-session-transition-results-20261103.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
