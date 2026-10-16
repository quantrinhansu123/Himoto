/** Authorized bootstrap: new accounts only; never resets existing passwords or permissions. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{hash}=require('bcryptjs');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');const pool=load(path.join(root,'lib/server/himoto-database')).ownerDatabase;
const {saveManagedAccount}=load(path.join(root,'lib/server/account-management'));
const {ACCESS_ROLES}=load(path.join(root,'lib/management/permissions'));
const {bankBin}=load(path.join(root,'lib/management/transfer-qr'));
const passwordFile=process.argv[2];if(!passwordFile)throw Error('Supply a private password file; do not pass passwords on the command line.');
const password=fs.readFileSync(passwordFile,'utf8').trim();if(password.length<8)throw Error('Bootstrap password must contain at least 8 characters.');
const definitions=[
  ['nv.giapbat','Nhân viên CS Giáp Bát','branch_staff','CS Giáp Bát'],['nv.lang','Nhân viên CS Láng','branch_staff','CS Láng'],
  ['nv.nguyenhoang','Nhân viên CS Nguyễn Hoàng','branch_staff','CS Nguyễn Hoàng'],['nv.hadong','Nhân viên CS Hà Đông','branch_staff','CS Hà Đông'],
  ['nv.hangbut','Nhân viên CS Hàng Bút','branch_staff','CS Hàng Bút'],['nv.thuesohuu','Nhân viên thuê sở hữu','ownership_staff','CS Thuê sở hữu'],
  ['ql.thuesohuu','Quản lý thuê sở hữu','ownership_manager','CS Thuê sở hữu'],['hcns','HCNS','hr',null],['ketoan','Kế toán','accounting',null],['quantri','Quản trị HIMOTO','admin',null],
];
async function main(){const c=await pool.connect(),result=[];let serviceId,bankId;
  try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['management-accounts']);
    const existing=(await c.query("SELECT user_id FROM himoto.management_account_access WHERE login_name='system.sepay'")).rows[0];
    if(existing)serviceId=Number(existing.user_id);
    else{serviceId=Number((await c.query(`INSERT INTO himoto.users(name,email,password,role,role_id,status,created_at,updated_at)
      SELECT 'SePay tự động','system.sepay@accounts.himoto.local',$1,'ke-toan',id,'active',now(),now() FROM himoto.roles WHERE slug='ke-toan' RETURNING id`,[await hash(crypto.randomBytes(32).toString('base64url'),12)])).rows[0].id);
      await c.query(`INSERT INTO himoto.management_account_access(user_id,login_name,access_role,scope_all,permissions,enabled,created_by,updated_by)
        VALUES($1,'system.sepay','accounting',true,$2::jsonb,false,$1,$1)`,[serviceId,JSON.stringify(ACCESS_ROLES.accounting.permissions)]);
    }
    for(const [login,name,role,storeName] of definitions){
      const existing=(await c.query('SELECT user_id FROM himoto.management_account_access WHERE login_name=$1',[login])).rows[0];
      if(existing){result.push({login_name:login,id:Number(existing.user_id),created:false});continue;}
      const store=storeName?(await c.query('SELECT id FROM himoto.stores WHERE store_name=$1',[storeName])).rows[0]:null;
      if(storeName&&!store)throw Error('Required branch was not found.');
      const saved=await saveManagedAccount(c,serviceId,{name,login_name:login,password,access_role:role,store_id:store?Number(store.id):null,scope_all:!storeName,permissions:[...ACCESS_ROLES[role].permissions],enabled:true});
      result.push({login_name:login,id:saved.id,role,store_name:storeName,created:true});
    }
    if(process.env.SEPAY_ACCOUNT_NUMBER&&process.env.SEPAY_BANK_CODE){const banks=(await c.query("SELECT id,bank_name,owner_name FROM himoto.banks WHERE regexp_replace(account_number,'\\s','','g')=$1 AND lower(status)='active'",[process.env.SEPAY_ACCOUNT_NUMBER.replace(/\s/g,'')])).rows;
      const matches=banks.filter(bank=>bankBin(bank.bank_name)===bankBin(process.env.SEPAY_BANK_CODE));if(matches.length===1)bankId=Number(matches[0].id);
    }
    await c.query('COMMIT');
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();await globalThis.himotoPool?.end();}
  let env=fs.readFileSync('.env.local','utf8');for(const [key,value] of [['SEPAY_SERVICE_USER_ID',serviceId],['SEPAY_BANK_ID',bankId]])if(value)env=env.replace(new RegExp('^'+key+'[ \\t]*=[ \\t]*$','m'),key+'='+value);fs.writeFileSync('.env.local',env);
  const report={accounts:result,service_user_id:serviceId,bank_id_matched:bankId||null,passwordsPrinted:false};
  fs.mkdirSync('.backups/account-access',{recursive:true});fs.writeFileSync('.backups/account-access/provision-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error('Account provisioning failed:',error.message);process.exitCode=1;});
