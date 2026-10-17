import 'server-only';
import { createHmac,timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
export function integrationWorkerToken() {
  const secret=process.env.MANAGEMENT_SESSION_SECRET;
  if(!secret||secret.length<32)throw new Error('Thiếu khóa tiến trình đồng bộ.');
  return createHmac('sha256',secret).update('himoto-integrations-worker-v1').digest('hex');
}
const proofPattern=/^Himoto-Scheduler (\d{10}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([a-f0-9]{64})$/;
export function integrationSchedulerProof(time:string,nonce:string) {
  return createHmac('sha256',integrationWorkerToken()).update(`himoto-scheduler-v1:POST:/api/cron/integrations:${time}:${nonce}`).digest('hex');
}
export function integrationSchedulerNonce(header:string) {return header.match(proofPattern)?.[2]||null;}
export function validIntegrationWorker(header:string|null,now=Date.now()) {
  if(!header)return false;
  const proof=header.match(proofPattern);
  if(proof){if(Math.abs(now-Number(proof[1])*1000)>60_000)return false;const actual=Buffer.from(proof[3]),expected=Buffer.from(integrationSchedulerProof(proof[1],proof[2]));return actual.length===expected.length&&timingSafeEqual(actual,expected);}
  if(!/^Bearer [a-f0-9]{64}$/.test(header))return false;
  const token=Buffer.from(header.slice(7)),expected=Buffer.from(integrationWorkerToken());
  return token.length===expected.length&&timingSafeEqual(token,expected);
}
export async function claimIntegrationSchedulerNonce(database:Pick<PoolClient,'query'>,nonce:string) {
  const result=await database.query(`WITH expired AS (DELETE FROM himoto.management_integration_worker_nonces WHERE expires_at<clock_timestamp())
    INSERT INTO himoto.management_integration_worker_nonces(nonce) VALUES($1::uuid) ON CONFLICT DO NOTHING RETURNING nonce`,[nonce]);
  return result.rowCount===1;
}
