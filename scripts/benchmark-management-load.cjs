const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { NextRequest } = require('next/server');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root} = require('./lib/load-typescript.cjs');
async function main() {
  const {ownerDatabase} = load(path.join(root,'lib/server/himoto-database'));
  const session = load(path.join(root,'lib/server/management-session'));
  const account = (await ownerDatabase.query("SELECT u.id FROM himoto.users u LEFT JOIN himoto.management_account_access a ON a.user_id=u.id WHERE u.status='active' AND u.deleted_at IS NULL AND (a.access_role='admin' OR (a.access_role IS NULL AND u.role_id=1)) LIMIT 1")).rows[0];
  if (!account) throw Error('Không có tài khoản quản trị hoạt động để đo API.');
  const headers = {cookie:`himoto_management_session=${session.signSession(Number(account.id))}`};
  const cases = [['stores','app/api/auth/stores/route','/api/auth/stores'],['reports','app/api/auth/shift-reports/route','/api/auth/shift-reports']];
  for (const [name,file,url] of cases) {
    const {GET} = load(path.join(root,file)); const samples=[];
    for(let i=0;i<6;i++) {
      const start=performance.now();const response=await GET(new NextRequest('http://localhost'+url,{headers}));
      await response.arrayBuffer(); if(response.status!==200)throw Error(`${name}: HTTP ${response.status}`);
      samples.push(Math.round(performance.now()-start));
    }
    console.log(JSON.stringify({endpoint:name,firstMs:samples[0],warmMedianMs:samples.slice(1).sort((a,b)=>a-b)[2],samplesMs:samples}));
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(async()=>{await globalThis.himotoPool?.end();});
