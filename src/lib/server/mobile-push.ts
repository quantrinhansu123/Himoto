import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { ownerDatabase } from './himoto-database';
import { sessionUserById } from './management-session';
import { MobileError } from './mobile-session';
import { mobileBody } from './mobile-writes';
import { mobilePushConfigured, sendMobilePush } from './mobile-push-fcm';
import { readNotificationState, withNotificationSnapshot } from './mobile-notifications';
import type { MobilePushStatus } from '../../../shared/mobile-notifications';

export async function readMobilePushStatus(sessionId: string): Promise<MobilePushStatus> {
  if (!mobilePushConfigured()) return {configured: false, enabled: false};
  const result = await ownerDatabase.query('SELECT 1 FROM himoto.management_mobile_push_devices WHERE session_id=$1 AND enabled LIMIT 1', [sessionId]);
  return {configured: true, enabled: result.rowCount === 1};
}
export async function registerMobilePush(request: NextRequest, userId: number, sessionId: string) {
  if (!mobilePushConfigured()) throw new MobileError('Thông báo chưa được cấu hình. Vui lòng thử lại sau.', 503, 'PUSH_UNAVAILABLE');
  const body = await mobileBody(request, 8192);
  if (Object.keys(body).length !== 1 || typeof body.token !== 'string' || !/^[A-Za-z0-9_:-]{20,4096}$/.test(body.token))
    throw new MobileError('Đăng ký thông báo không hợp lệ.', 400, 'INVALID_PUSH_TOKEN');
  const hash = createHash('sha256').update(body.token).digest('hex');
  await ownerDatabase.query(`INSERT INTO himoto.management_mobile_push_devices AS d(token_hash,token,user_id,session_id)
    VALUES($1,$2,$3,$4) ON CONFLICT(token_hash) DO UPDATE SET token=EXCLUDED.token,user_id=EXCLUDED.user_id,
    session_id=EXCLUDED.session_id,enabled=true,updated_at=now(),
    state=CASE WHEN d.session_id=EXCLUDED.session_id THEN d.state ELSE '{}'::jsonb END,
    checked_at=CASE WHEN d.session_id=EXCLUDED.session_id THEN d.checked_at ELSE NULL END,
    lease_id=NULL,lease_until=NULL`, [hash, body.token, userId, sessionId]);
  return {configured: true, enabled: true};
}
export async function disableMobilePush(sessionId: string) {
  await ownerDatabase.query('UPDATE himoto.management_mobile_push_devices SET enabled=false,updated_at=now(),lease_id=NULL,lease_until=NULL WHERE session_id=$1', [sessionId]);
  return {configured: mobilePushConfigured(), enabled: false};
}
/** Called by the existing authenticated scheduler. No changes to business records. */
export async function dispatchMobilePush(budgetMs = 45000) {
  if (!mobilePushConfigured()) return {configured: false, checked: 0, sent: 0};
  const deadline = Date.now() + budgetMs, lease = randomUUID();
  const candidates = (await ownerDatabase.query(`WITH candidates AS (
    SELECT token_hash FROM himoto.management_mobile_push_devices WHERE enabled
      AND (checked_at IS NULL OR checked_at<now()-interval '5 minutes')
      AND (lease_until IS NULL OR lease_until<now()) ORDER BY checked_at NULLS FIRST LIMIT 5 FOR UPDATE SKIP LOCKED)
    UPDATE himoto.management_mobile_push_devices d SET lease_id=$1,lease_until=now()+interval '2 minutes'
    FROM candidates c WHERE d.token_hash=c.token_hash RETURNING d.*`, [lease])).rows;
  let checked = 0, sent = 0;
  for (const device of candidates) {
    if (Date.now() > deadline - 12000) break;
    try {
      const session = (await ownerDatabase.query(`SELECT user_id,password_version FROM himoto.management_mobile_sessions
        WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now() AND token_hash IS NOT NULL`, [device.session_id, device.user_id])).rows[0];
      const user = session && await sessionUserById(Number(session.user_id), Number(session.password_version), ownerDatabase);
      if (!user) { await ownerDatabase.query('UPDATE himoto.management_mobile_push_devices SET enabled=false WHERE token_hash=$1 AND lease_id=$2', [device.token_hash, lease]); continue; }
      const current = await withNotificationSnapshot(user, db => readNotificationState(db, user));
      const next: Record<string, string> = {};
      for (const group of current) {
        next[group.kind] = group.fingerprint;
        if (!group.count || device.state?.[group.kind] === group.fingerprint) continue;
        if (Date.now() > deadline - 12000) throw new Error('Push budget exhausted');
        // Check the lease/session immediately before outbound send; concurrent
        // opt-out, actor replacement and logout stop the old worker here.
        const still = await ownerDatabase.query(`SELECT 1 FROM himoto.management_mobile_push_devices d
          JOIN himoto.management_mobile_sessions s ON s.id=d.session_id WHERE d.token_hash=$1 AND d.lease_id=$2 AND d.enabled
          AND s.revoked_at IS NULL AND s.expires_at>now()`, [device.token_hash, lease]);
        if (!still.rowCount) break;
        const id = randomUUID();
        const claim = await ownerDatabase.query(`WITH claimed AS (
          UPDATE himoto.management_mobile_push_devices SET state=jsonb_set(state,ARRAY[$3::text],to_jsonb($4::text))
          WHERE token_hash=$2 AND lease_id=$5 AND enabled RETURNING token_hash)
          INSERT INTO himoto.management_mobile_push_deliveries(id,token_hash,kind,fingerprint,outcome)
          SELECT $1,token_hash,$3,$4,'sending' FROM claimed RETURNING id`, [id, device.token_hash, group.kind, group.fingerprint, lease]);
        if (!claim.rowCount) break;
        const outcome = await sendMobilePush(device.token, group.kind);
        await ownerDatabase.query('UPDATE himoto.management_mobile_push_deliveries SET outcome=$2,completed_at=now() WHERE id=$1', [id, outcome === 'invalid' ? 'failed' : outcome]);
        if (outcome === 'invalid') { await ownerDatabase.query('UPDATE himoto.management_mobile_push_devices SET enabled=false WHERE token_hash=$1 AND lease_id=$2', [device.token_hash, lease]); break; }
        if (outcome === 'sent') sent++;
        // Unknown may have reached FCM: retain the fingerprint to avoid blind replay.
        if (outcome === 'failed') delete next[group.kind];
      }
      await ownerDatabase.query(`UPDATE himoto.management_mobile_push_devices SET state=$3::jsonb,checked_at=now(),lease_until=NULL,lease_id=NULL
        WHERE token_hash=$1 AND lease_id=$2`, [device.token_hash, lease, JSON.stringify(next)]); checked++;
    } catch {
      // No exception text can include an FCM token, credential or provider body.
      await ownerDatabase.query(`UPDATE himoto.management_mobile_push_devices SET checked_at=now(),lease_until=NULL,lease_id=NULL WHERE token_hash=$1 AND lease_id=$2`, [device.token_hash, lease]).catch(() => {});
    }
  }
  await ownerDatabase.query('UPDATE himoto.management_mobile_push_devices SET lease_id=NULL,lease_until=NULL WHERE lease_id=$1', [lease]);
  return {configured: true, checked, sent};
}
