/** Maps the configured demo bank to HIMOTO. Does not classify an account as company-owned. */
const fs=require('node:fs'),path=require('node:path');require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {load,root}=require('./lib/load-typescript.cjs');const pool=load(path.join(root,'lib/server/himoto-database')).ownerDatabase;
const {sepayConfig}=load(path.join(root,'lib/server/sepay'));const {bankBin}=load(path.join(root,'lib/management/transfer-qr'));
async function main(){const config=sepayConfig();if(!config.configured)throw Error('Fill the configured bank code, receiving account and account name first.');const c=await pool.connect();let id,created=false,ownerType;
  try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`sepay-bank:${config.bank.bank_code}:${config.bank.account_number}`]);
    const rows=(await c.query('SELECT id,bank_name,owner_type FROM himoto.banks WHERE account_number=$1',[config.bank.account_number])).rows.filter(bank=>bankBin(bank.bank_name)===bankBin(config.bank.bank_code));
    if(config.bankId){const found=rows.find(bank=>Number(bank.id)===config.bankId);if(!found)throw Error('Configured HIMOTO bank ID does not match the receiving account.');id=config.bankId;ownerType=found.owner_type;}
    else if(rows.length===1){id=Number(rows[0].id);ownerType=rows[0].owner_type;}
    else if(rows.length>1)throw Error('Multiple bank records match; select the intended HIMOTO bank ID.');
    else{if(config.mode!=='test')throw Error('Create and classify the receiving bank in HIMOTO before enabling live mode.');
      const bank=(await c.query(`INSERT INTO himoto.banks(store_id,bank_name,account_number,owner_name,opening_balance,account_type,status,owner_type,created_at,updated_at)
        VALUES(0,$1,$2,$3,0,1,'Active','unknown',now(),now()) RETURNING id,owner_type`,[config.bank.bank_code,config.bank.account_number,config.bank.account_name])).rows[0];id=Number(bank.id);ownerType=bank.owner_type;created=true;
    }
    await c.query('COMMIT');
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();await globalThis.himotoPool?.end();}
  let env=fs.readFileSync('.env.local','utf8');env=env.replace(/^SEPAY_BANK_ID[ \t]*=[ \t]*$/m,`SEPAY_BANK_ID=${id}`);fs.writeFileSync('.env.local',env);
  console.log(JSON.stringify({bank_id:id,created,owner_type:ownerType,mode:config.mode,ledgerWrites:0,bankDetailsPrinted:false}));
}
main().catch(error=>{console.error('SePay bank configuration:',error.message);process.exitCode=1;});
