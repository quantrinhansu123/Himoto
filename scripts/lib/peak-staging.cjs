const assert=require('node:assert/strict'),fs=require('node:fs'),net=require('node:net');
const rawConnect=net.Socket.prototype.connect;
require('./offline-tests.cjs');
module.exports=async function openFixture(file,max=4){
 const fixture=JSON.parse(fs.readFileSync(file,'utf8'));
 assert(fixture.fixtureOnly);assert.equal(fixture.host,'127.0.0.1');assert.equal(fixture.port,55439);
 assert(/^himoto_media_races_\d+$/.test(fixture.database));
 class QaSocket extends net.Socket{connect(port,host,...rest){assert.equal(port,55439);assert.equal(host,'127.0.0.1');return rawConnect.call(this,port,host,...rest);}}
 const{Pool}=require('pg'),pool=new Pool({host:fixture.host,port:fixture.port,database:fixture.database,user:'himoto_qa_owner',ssl:false,max,stream:()=>new QaSocket(),application_name:'himoto-peak-staging',connectionTimeoutMillis:5000});
 const info=(await pool.query("SELECT current_setting('cluster_name') AS cluster,host(inet_server_addr()) AS host")).rows[0];
 assert.equal(info.cluster,'himoto-mobile-local-qa');assert.equal(info.host,'127.0.0.1');
 process.env.MANAGEMENT_SESSION_SECRET=fixture.secret;global.himotoPool=pool;
 return{pool,fixture,close:async()=>{await pool.end();delete global.himotoPool;}};
};
