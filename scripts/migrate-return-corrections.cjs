const fs=require('node:fs'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs'),{ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
async function main(){
 if(!process.argv.includes('--apply'))throw Error('Use --apply to install the returned-time correction helper');
 await ownerDatabase.query(fs.readFileSync('docs/sql/2026-10-25-return-corrections.sql','utf8'));
 const check=(await ownerDatabase.query(`SELECT p.prosecdef,has_function_privilege('himoto_scoped',p.oid,'EXECUTE') AS scoped,
   EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
   FROM pg_proc p WHERE p.oid='himoto.correct_returned_contract_time(bigint,timestamptz)'::regprocedure`)).rows[0];
 if(!check?.prosecdef||!check.scoped||check.public_execute)throw Error('Correction helper privileges do not match the intended scope');
 console.log(JSON.stringify({migration:'return-corrections',passed:true,businessRowsWritten:0,telegramMessagesSent:0}));
}
main().catch(e=>{console.error({passed:false,code:e.code||e.name});process.exitCode=1;}).finally(async()=>{await globalThis.himotoPool?.end();});
