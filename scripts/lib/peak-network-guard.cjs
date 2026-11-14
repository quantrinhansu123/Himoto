// Preloaded only by local peak QA. Refuses a production database and all external sockets.
const assert=require('node:assert/strict'),fs=require('node:fs'),net=require('node:net');
assert.equal(process.env.HIMOTO_PEAK_QA,'1');
const fixture=JSON.parse(fs.readFileSync(process.env.HIMOTO_PEAK_FIXTURE,'utf8')),db=new URL(process.env.DATABASE_URL);
assert(fixture.fixtureOnly);assert.equal(db.hostname,'127.0.0.1');assert.equal(db.port,'55439');assert.equal(db.pathname,'/'+fixture.database);
assert(/^himoto_media_races_\d+$/.test(fixture.database));
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){const first=Array.isArray(args[0])?args[0][0]:args[0],o=typeof first==='object'?first:{port:first,host:args[1]};
 const host=o.host||'localhost';if(!['127.0.0.1','localhost','::1'].includes(host)||![55439,3020].includes(Number(o.port)))throw Error('PEAK_QA_EXTERNAL_SOCKET_BLOCKED');
 return connect.apply(this,args);
};
const send=global.fetch;
global.fetch=async(input,options)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 const fault=fs.existsSync(process.env.HIMOTO_PEAK_FAULT_FILE||'')?JSON.parse(fs.readFileSync(process.env.HIMOTO_PEAK_FAULT_FILE,'utf8')):{};
 const live=url.hostname==='real.gpscenter.xyz'&&url.searchParams.get('method')==='customerDeviceAndGpsone'||url.hostname==='iopgps.com'&&url.pathname==='/rest/device/list';
 if(live){
  const index=url.hostname==='real.gpscenter.xyz'?Number(url.searchParams.get('customerid')):Number(url.searchParams.get('accountId'));
  assert(fixture.accounts.some(a=>a.index===index));
  if(fault.slowLiveMs)await new Promise(r=>setTimeout(r,Math.min(20000,Number(fault.slowLiveMs))));
  const at=Date.now(),ids=Array.from({length:441},(_,i)=>i+1).filter(n=>(n-1)%4===index);
  if(url.hostname==='real.gpscenter.xyz')return Response.json({errorcode:0,servertime:at,records:ids.map(n=>({id:n,imei:'990000000'+String(n).padStart(6,'0'),devicename:'QA-'+String(n).padStart(6,'0'),carnumber:'QA-'+String(n).padStart(6,'0'),hearttime:at,systime:at,gpstime:at,lat:21,lng:105,speed:0,accstatus:0}))});
  const page=Number(url.searchParams.get('currentPage'))||1;
  return Response.json({resultBean:{code:0},page:{count:ids.length},data:ids.slice((page-1)*100,page*100).map(n=>({imei:'990000000'+String(n).padStart(6,'0'),name:'QA-'+String(n).padStart(6,'0'),deviceStatusBean:{status:0,speed:0,gpsTime:at,sysTime:at,heartTime:at,lat:21,lng:105,accStatus:false}}))});
 }
 if(url.hostname==='real.gpscenter.xyz'&&url.searchParams.get('method')==='playback'){
  if(fault.historyRate)return Response.json({errorcode:10009});
  return Response.json({errorcode:0,record:`105,21,${Number(url.searchParams.get('begintime'))+60000},0,0`});
 }
 if(url.hostname==='www.protrack365.com'&&url.pathname==='/StatService')return Response.json({errorcode:0,records:[]});
 if(url.hostname==='iopgps.com'&&url.pathname.includes('/rest/device/track/'))return Response.json({resultBean:{code:0},histories:[{'7':Number(url.searchParams.get('startTime'))+60,'12':0}]});
 if(url.hostname==='iopgps.com'&&url.pathname==='/rest/device/alarm/single')return Response.json({resultBean:{code:0},beanList:[]});
 if(url.hostname==='api.telegram.org'&&url.pathname.startsWith('/bot123456:qa-only-worker-bot-'))return Response.json({ok:true,result:url.pathname.endsWith('/getMe')?{id:123456,is_bot:true,username:'qa_himoto_bot'}:{message_id:1}});
 if(url.hostname==='127.0.0.1'&&url.port==='3020')return send(input,options);
 throw Error('PEAK_QA_EXTERNAL_FETCH_BLOCKED');
};
