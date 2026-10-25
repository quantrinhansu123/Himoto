const fs=require('node:fs'),path=require('node:path');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs'),{ownerDatabase}=load(path.join(root,'lib/server/himoto-database'));
async function main(){
 if(!process.argv.includes('--apply'))throw Error('Use --apply for the additive account-password migration');
 const identity=await ownerDatabase.query("SELECT 1 FROM himoto.users WHERE id=145 AND status='active' AND deleted_at IS NULL AND lower(split_part(email,'@',1))='quanlyvanhanh'");
 if(identity.rowCount!==1)throw Error('Recovery identity does not match active quanlyvanhanh');
 await ownerDatabase.query(fs.readFileSync('docs/sql/2026-10-25-account-passwords.sql','utf8'));
 const check=await ownerDatabase.query("SELECT has_table_privilege('himoto_scoped','himoto.management_account_passwords','SELECT') AS scoped_can_read");
 if(check.rows[0].scoped_can_read)throw Error('Private recovery table must not be readable by scoped role');
 console.log(JSON.stringify({migration:'account-passwords',passed:true,businessRowsWritten:0,existingPasswordsReset:0}));
}
main().catch(e=>{console.error({passed:false,code:e.code||e.name,message:e.message});process.exitCode=1;}).finally(async()=>{await globalThis.himotoPool?.end()});
