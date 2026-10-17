import 'server-only';
import { createHmac,timingSafeEqual } from 'node:crypto';
export function integrationWorkerToken() {
  const secret=process.env.MANAGEMENT_SESSION_SECRET;
  if(!secret||secret.length<32)throw new Error('Thiếu khóa tiến trình đồng bộ.');
  return createHmac('sha256',secret).update('himoto-integrations-worker-v1').digest('hex');
}
export function validIntegrationWorker(header:string|null) {
  if(!header||!/^Bearer [a-f0-9]{64}$/.test(header))return false;
  const token=Buffer.from(header.slice(7)),expected=Buffer.from(integrationWorkerToken());
  return token.length===expected.length&&timingSafeEqual(token,expected);
}
