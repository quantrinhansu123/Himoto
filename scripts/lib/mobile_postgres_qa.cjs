// Dedicated loopback QA transport. Core/application networking stays blocked.
const assert = require('node:assert/strict');
const net = require('node:net');
const {AsyncLocalStorage} = require('node:async_hooks');
const {Client,Pool} = require('pg');
const rawConnect = net.Socket.prototype.connect;
const PORT = 55439, CLUSTER = 'himoto-mobile-local-qa';
class QaSocket extends net.Socket {
  connect(port,host,...rest) {
    assert.equal(port,PORT,'Only the dedicated QA port is allowed');
    assert.equal(host,'127.0.0.1','Only literal IPv4 loopback is allowed');
    return rawConnect.call(this,port,host,...rest);
  }
}
require('./offline-tests.cjs');
const config = database => ({host:'127.0.0.1',port:PORT,user:'himoto_qa_owner',database,ssl:false,
  stream:()=>new QaSocket(),application_name:'himoto-mobile-qa-races',connectionTimeoutMillis:4000});
const deferred = () => {let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const delay = ms => new Promise(r=>setTimeout(r,ms));
module.exports = async function openQa() {
  const admin = new Client(config('postgres'));await admin.connect();
  let info,database;
  try{
    info=(await admin.query("SELECT current_setting('cluster_name') AS cluster,host(inet_server_addr()) AS host,inet_server_port() AS port,version() AS version")).rows[0];
    assert.equal(info.cluster,CLUSTER);assert.equal(info.host,'127.0.0.1');assert.equal(info.port,PORT);
    database='himoto_media_races_'+Date.now();assert(/^himoto_media_races_\d+$/.test(database));
    await admin.query(`CREATE DATABASE "${database}"`);
    for(const role of ['himoto_scoped','anon','authenticated']){
      const found=(await admin.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',[role])).rows[0];
      if(found)assert(!found.rolsuper&&!found.rolbypassrls);else await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
    }
  }finally{await admin.end();}
  const pool=new Pool({...config(database),max:8}),observer=new Client(config(database));
  try{await observer.connect();}catch(error){await pool.end();throw error;}
  const trace=new AsyncLocalStorage(),pids=new Map(),holds=new Map(),failures=new Map(),observations=[];
  const ownedPool={query:pool.query.bind(pool),async connect(){
    const client=await pool.connect(),flow=trace.getStore();if(flow)pids.set(flow,client.processID);
    return new Proxy(client,{get(target,key){
      if(key==='query')return async(sql,params)=>{
        const text=typeof sql==='string'?sql:sql.text;
        if(failures.get(flow)?.(text)){failures.delete(flow);throw Error('QA forced rollback after photo write');}
        const result=await target.query(sql,params),hold=holds.get(flow);
        if(hold&&!hold.used&&hold.match(text)){
          hold.used=true;hold.entered.resolve();
          let timeout;try{await Promise.race([hold.release.promise,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('QA barrier timeout')),3500);})]);}finally{clearTimeout(timeout);}
        }
        return result;
      };
      const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
    }});
  }};
  global.himotoPool=ownedPool;
  const hold=(flow,match)=>{const gate={match,used:false,entered:deferred(),release:deferred()};holds.set(flow,gate);return gate;};
  const task=(flow,work)=>trace.run(flow,work).then(value=>({ok:true,value}),error=>({ok:false,error}));
  async function blocked(waiter,blocker){
    const deadline=Date.now()+2000;
    while(Date.now()<deadline){
      const w=pids.get(waiter),b=pids.get(blocker);
      if(w&&b){assert.notEqual(w,b);const row=(await observer.query('SELECT pg_blocking_pids($1) AS blockers',[w])).rows[0];
        if(row.blockers.includes(b)){observations.push({waiter,blocker,waiterPid:w,blockerPid:b});return;}}
      await delay(25);
    }
    throw Error(`No real PostgreSQL blocking observed: ${waiter} waiting for ${blocker}`);
  }
  return{pool,observer,hold,task,blocked,observations,sessionPids:()=>[...new Set(pids.values())],fail:(flow,match)=>failures.set(flow,match),
    connection:{host:'127.0.0.1',port:PORT,cluster:CLUSTER,database,version:info.version},
    async close(){for(const h of holds.values())h.release.resolve();await observer.end();await pool.end();delete global.himotoPool;}};
};
