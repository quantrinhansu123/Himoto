import 'server-only';
import type { PoolClient } from 'pg';

export async function auditContractDeletion(db:Pick<PoolClient,'query'>,id:number,actor:number,code:unknown,mode:'permanent'|'hidden') {
  await db.query(`INSERT INTO himoto.management_access_audit(actor_id,target_user_id,action,after_value)
    VALUES($1,$1,'contract_deleted',jsonb_build_object('contract_id',$2::bigint,'code',$3::text,'mode',$4::text,
      'actor_name',(SELECT name FROM himoto.users WHERE id=$1),'at',now()))`,[actor,id,String(code||''),mode]);
}
