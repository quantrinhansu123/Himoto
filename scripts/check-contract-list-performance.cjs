const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {load,root}=require('./lib/load-typescript.cjs');
const shared=load(path.join(root,'lib/management/management-table'));
const server=load(path.join(root,'lib/server/management-table'));
const input={kind:'contracts',query:load(path.join(root,'lib/management/table-utils')).EMPTY_QUERY,store:'all',scope:'',page:1,size:10,sort:'code',direction:'asc'};
async function main(){
  const original=global.fetch,requests=[];
  try {
    global.fetch=async url=>{requests.push(new URL(url,'http://localhost').searchParams);return {ok:true,json:async()=>({status:'success',data:{rows:[],total:0,scopeCount:0,tabCount:0,statusCounts:[]}})};};
    await shared.requestManagementTable(input,undefined,false,[],undefined,'page');
    await shared.requestManagementTable(input,undefined,false,[],undefined,'statistics');
    assert(!requests[0].has('status_counts')&&!requests[0].has('scope_count'));
    assert.equal(requests[1].get('statistics_only'),'1');
    assert.equal(requests[1].get('scope_count'),'1');
    const outdated={rows:[],total:1,scopeCount:1,tabCount:1,statusCounts:[['renting',1]],dueCount:1};
    const changed=await shared.requestManagementTable(input,undefined,false,[],outdated,'page');
    assert.equal(changed.total,0);assert.deepEqual(changed.statusCounts,[]);
    assert.notEqual(changed.dueCount,1,'Changed totals must not reuse stale counters');
  } finally {global.fetch=original;}
  if(!process.argv.includes('--live-read'))return console.log('PASS: page requests exclude counters; statistics use a separate request');
  require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
  const db=load(path.join(root,'lib/server/himoto-database')).ownerDatabase,c=await db.connect(),results=[];
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await c.query("SET LOCAL statement_timeout='25s'");
    for(const filters of [{},{store:'36'},{search:'3110264'},{status:'completed',page:'999999'}]){
      const params=new URLSearchParams({size:'10',store:'all',...filters});
      const run=async(mode)=>{
        const q=new URLSearchParams(params),queries=[];
        if(mode==='full'){q.set('status_counts','1');q.set('scope_count','1');}
        if(mode==='statistics'){q.set('statistics_only','1');q.set('scope_count','1');}
        const started=performance.now();
        const data=await server.readManagementTable({query:async(...args)=>{
          const at=performance.now(),r=await c.query(...args);
          queries.push({ms:Math.round(performance.now()-at),rows:r.rows.length,hydrate:args[0].includes('ANY($1::bigint[])')});return r;
        }},'contracts',q);
        results.push({filters,mode,ms:Math.round(performance.now()-started),bytes:Buffer.byteLength(JSON.stringify(data)),queries});
        return data;
      };
      const page=await run('page'),stats=await run('statistics'),full=await run('full');
      assert.deepEqual(page.rows,full.rows);assert.equal(page.total,full.total);assert.equal(page.page,full.page);
      assert.equal(stats.rows.length,0);assert.equal(stats.total,full.total);assert.equal(stats.scopeCount,full.scopeCount);
      for(const key of ['summary','statusCounts','tabCount','dueCount'])assert.deepEqual(stats[key],full[key],key);
      assert(!results.at(-2).queries.some(q=>q.hydrate),'Statistics must not hydrate page details');
    }
    const dir=path.join(process.cwd(),'local-backups','contract-list-performance');fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'measurements.json'),JSON.stringify({at:new Date().toISOString(),results,businessWrites:0},null,2));
    console.log(JSON.stringify({passed:true,results,businessWrites:0},null,2));
  } finally {await c.query('ROLLBACK');c.release();await globalThis.himotoPool?.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
