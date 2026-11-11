import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ownerDatabase } from './himoto-database';
export type IntegrationJob='gps-live'|'telegram'|'push';
type Database=Pick<PoolClient,'query'>;
/** One shared lease per lane; no connection is held while contacting a provider. */
export async function runIntegrationJob<T>(job:IntegrationJob,leaseMs:number,run:()=>Promise<T>,database:Database=ownerDatabase):Promise<{busy:true}|{busy:false;result:T}> {
  const token=randomUUID();
  const claimed=await database.query(`UPDATE himoto.management_integration_workers
    SET lease_token=$2,lease_until=clock_timestamp()+($3::integer*interval '1 millisecond'),
      last_started_at=clock_timestamp(),last_status='running',runs=runs+1
    WHERE job=$1 AND (lease_until IS NULL OR lease_until<clock_timestamp()) RETURNING job`,[job,token,leaseMs]);
  if(!claimed.rowCount)return {busy:true};
  let status='error';
  try{const result=await run();status='success';return {busy:false,result};}
  finally{await database.query(`UPDATE himoto.management_integration_workers SET lease_token=NULL,lease_until=NULL,
    last_finished_at=clock_timestamp(),last_status=$3 WHERE job=$1 AND lease_token=$2`,[job,token,status]);}
}
