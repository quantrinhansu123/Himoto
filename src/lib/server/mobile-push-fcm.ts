import 'server-only';
import { getVercelOidcToken } from '@vercel/oidc';
import type { MobileNotificationKind } from '../../../shared/mobile-notifications';

export interface FcmFederation { projectId: string; projectNumber: string; serviceAccount: string; pool: string; provider: string }
let cached: { identity: string; token: string; until: number } | undefined;
function configuration(): FcmFederation | null {
  if (process.env.HIMOTO_MOBILE_ENABLED !== 'true' || process.env.HIMOTO_MOBILE_PUSH_ENABLED !== 'true') return null;
  const c = {projectId: process.env.GCP_PROJECT_ID || '', projectNumber: process.env.GCP_PROJECT_NUMBER || '',
    serviceAccount: process.env.GCP_SERVICE_ACCOUNT_EMAIL || '', pool: process.env.GCP_WORKLOAD_IDENTITY_POOL_ID || '',
    provider: process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID || ''};
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(c.projectId) || !/^\d{6,20}$/.test(c.projectNumber)
    || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(c.serviceAccount.split('@')[0])
    || !c.serviceAccount.endsWith(`@${c.projectId}.iam.gserviceaccount.com`)
    || ![c.pool,c.provider].every(v => /^[a-z][a-z0-9-]{3,31}$/.test(v))) return null;
  return c;
}
export function mobilePushConfigured() { return configuration() !== null; }
/** Google verifies Vercel's signature, issuer, audience and exact production subject.
 * Short-lived credentials stay in memory; there is no service-account private key.
 */
export async function federatedFcmToken(c: FcmFederation, subjectToken: () => Promise<string> = getVercelOidcToken): Promise<string> {
  const identity = JSON.stringify(c);
  if (cached?.identity === identity && cached.until > Date.now()) return cached.token;
  const response = await fetch('https://sts.googleapis.com/v1/token', {method:'POST',signal:AbortSignal.timeout(10000),
    headers:{'Content-Type':'application/json'},body:JSON.stringify({grantType:'urn:ietf:params:oauth:grant-type:token-exchange',
      audience:`//iam.googleapis.com/projects/${c.projectNumber}/locations/global/workloadIdentityPools/${c.pool}/providers/${c.provider}`,
      scope:'https://www.googleapis.com/auth/cloud-platform',requestedTokenType:'urn:ietf:params:oauth:token-type:access_token',
      subjectToken:await subjectToken(),subjectTokenType:'urn:ietf:params:oauth:token-type:jwt'})});
  const external = await response.json().catch(() => null);
  if (!response.ok || typeof external?.access_token !== 'string') throw new Error('FCM federation unavailable');
  const impersonation = await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(c.serviceAccount)}:generateAccessToken`,
    {method:'POST',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','Authorization':`Bearer ${external.access_token}`},
      body:JSON.stringify({scope:['https://www.googleapis.com/auth/firebase.messaging'],lifetime:'600s'})});
  const access = await impersonation.json().catch(() => null), until = Date.parse(access?.expireTime);
  if (!impersonation.ok || typeof access?.accessToken !== 'string' || !Number.isFinite(until) || until < Date.now()+30000)
    throw new Error('FCM service identity unavailable');
  cached = {identity,token:access.accessToken,until:Math.min(until-30000,Date.now()+540000)};
  return access.accessToken;
}
export type PushOutcome = 'sent' | 'invalid' | 'unknown' | 'failed';
export async function sendMobilePush(token: string, kind: MobileNotificationKind): Promise<PushOutcome> {
  const c = configuration(); if (!c) return 'failed';
  let auth: string;
  try { auth = await federatedFcmToken(c); } catch { return 'failed'; }
  try {
    // Generic notification only: current actor/permissions are checked again on open.
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${c.projectId}/messages:send`, {
      method: 'POST', signal: AbortSignal.timeout(10000), headers: {'Authorization': `Bearer ${auth}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({message: {token, notification: {title: 'Himoto', body: 'Có công việc cần kiểm tra. Mở Himoto để xem.'},
        data: {screen: 'notifications', kind}, android: {priority: 'normal', ttl: '300s', collapse_key: `himoto-${kind}`,
          notification: {channel_id: 'himoto-work', tag: `himoto-${kind}`, visibility: 'PRIVATE'}}}}),
    });
    const data = await response.json().catch(() => null);
    if (response.ok && typeof data?.name === 'string') return 'sent';
    if (data?.error?.details?.some((d: {errorCode?: string}) => d.errorCode === 'UNREGISTERED')) return 'invalid';
    return response.status >= 500 || response.status === 429 ? 'unknown' : 'failed';
  } catch { return 'unknown'; }
}
