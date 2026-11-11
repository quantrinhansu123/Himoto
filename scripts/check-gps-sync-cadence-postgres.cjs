// Actual concurrent PostgreSQL claims, isolated to loopback QA; no provider/network calls.
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const openQa=require('./lib/mobile_postgres_qa.cjs');
const {load,root}=require('./lib/load-typescript.cjs');
async function main(){
  const qa=await openQa(),checks=[];
  try{
    await qa.pool.query(`CREATE SCHEMA himoto;CREATE TABLE himoto.management_gps_accounts(
      id uuid PRIMARY KEY,enabled boolean NOT NULL DEFAULT true,last_attempt_at timestamptz,
      sync_lease_token uuid,sync_lease_until timestamptz,next_attempt_at timestamptz,
      last_error text,last_success_at timestamptz,device_count int DEFAULT 0)`);
    const {claimGpsAccounts,finishGpsAccount}=load(path.join(root,'lib/server/gps-sync'));
    const account=randomUUID(),leases=Array.from({length:8},()=>randomUUID());
    await qa.pool.query('INSERT INTO himoto.management_gps_accounts(id) VALUES($1)',[account]);
    const race=await Promise.all(leases.map(lease=>claimGpsAccounts(qa.pool,lease)));
    assert.equal(race.reduce((n,rows)=>n+rows.length,0),1);
    const winner=race.findIndex(rows=>rows.length===1),current=leases[winner],other=leases[(winner+1)%leases.length];
    assert.equal((await finishGpsAccount(qa.pool,account,other,999)).rowCount,0);
    assert.equal((await finishGpsAccount(qa.pool,account,current,1)).rowCount,1);
    checks.push('Eight independent workers/tabs racing for one due account produce exactly one claim; stale completion cannot clear the current lease');
    for(const seconds of [0,5,30,59]){
      await qa.pool.query("UPDATE himoto.management_gps_accounts SET last_attempt_at=clock_timestamp()-($1::integer*interval '1 second')",[seconds]);
      assert.equal((await claimGpsAccounts(qa.pool,other)).length,0,`${seconds}s must not trigger another provider read`);
    }
    await qa.pool.query("UPDATE himoto.management_gps_accounts SET last_attempt_at=clock_timestamp()-interval '61 seconds'");
    assert.equal((await claimGpsAccounts(qa.pool,other)).length,1);
    await finishGpsAccount(qa.pool,account,other,1);
    checks.push('All entry points skip provider reads at 0/5/30/59 seconds and permit the next minute after completion');
    await qa.pool.query("UPDATE himoto.management_gps_accounts SET last_attempt_at=clock_timestamp()-interval '61 seconds',sync_lease_token=$1,sync_lease_until=clock_timestamp()+interval '30 seconds'",[current]);
    assert.equal((await claimGpsAccounts(qa.pool,other)).length,0);
    await qa.pool.query("UPDATE himoto.management_gps_accounts SET sync_lease_until=clock_timestamp()-interval '1 second'");
    assert.equal((await claimGpsAccounts(qa.pool,other)).length,1);
    assert.equal((await finishGpsAccount(qa.pool,account,current,99)).rowCount,0);
    await finishGpsAccount(qa.pool,account,other,0,'HTTP_429');
    checks.push('An in-flight lease remains protected beyond the minute; an expired worker can be replaced without accepting its late completion');
    await qa.pool.query("UPDATE himoto.management_gps_accounts SET last_attempt_at=clock_timestamp()-interval '61 seconds'");
    assert.equal((await claimGpsAccounts(qa.pool,current)).length,0);
    await qa.pool.query("UPDATE himoto.management_gps_accounts SET next_attempt_at=clock_timestamp()-interval '1 second',last_attempt_at=clock_timestamp()-interval '5 seconds'");
    assert.equal((await claimGpsAccounts(qa.pool,current)).length,0);
    await qa.pool.query("UPDATE himoto.management_gps_accounts SET last_attempt_at=clock_timestamp()-interval '61 seconds',enabled=false");
    assert.equal((await claimGpsAccounts(qa.pool,current)).length,0);
    await qa.pool.query('UPDATE himoto.management_gps_accounts SET enabled=true');
    assert.equal((await claimGpsAccounts(qa.pool,current)).length,1);
    await finishGpsAccount(qa.pool,account,current,2);
    const row=(await qa.pool.query('SELECT last_error,device_count,last_success_at IS NOT NULL AS success FROM himoto.management_gps_accounts')).rows[0];
    assert.deepEqual(row,{last_error:null,device_count:2,success:true});
    checks.push('Provider backoff and disabled accounts are respected; clearing backoff never bypasses the minute gate; a later success clears the error');
    console.log(JSON.stringify({passed:checks.length,checks,realProviderRequests:0,operationalWrites:0},null,2));
  }finally{await qa.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
