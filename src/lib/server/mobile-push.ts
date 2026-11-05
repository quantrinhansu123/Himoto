import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { ownerDatabase } from './himoto-database';
import { sessionUserById } from './management-session';
import { MobileError } from './mobile-session';
import { mobileBody } from './mobile-writes';
import { mobilePushConfigured, sendMobilePush } from './mobile-push-fcm';
import { readNotificationState, withNotificationSnapshot } from './mobile-notifications';
import {activityGrants,scopedActivity} from './mobile-activity';
import type { MobilePushStatus,MobilePushTest } from '../../../shared/mobile-notifications';

export async function testMobilePush(request:NextRequest,userId:number,sessionId:string):Promise<MobilePushTest>{
  if(!mobilePushConfigured())throw new MobileError('Thông báo chưa được cấu hình.',503,'PUSH_UNAVAILABLE');
  if(request.nextUrl.searchParams.size||Object.keys(await mobileBody(request,256)).length)throw new MobileError('Yêu cầu thử thông báo không hợp lệ.');
  const device=(await ownerDatabase.query(`WITH target AS (
    SELECT d.token_hash FROM himoto.management_mobile_push_devices d JOIN himoto.management_mobile_sessions s ON s.id=d.session_id
      WHERE d.user_id=$1 AND d.session_id=$2 AND d.enabled AND s.revoked_at IS NULL AND s.expires_at>now()
      ORDER BY d.updated_at DESC LIMIT 1)
    UPDATE himoto.management_mobile_push_devices d SET test_sent_at=clock_timestamp() FROM target t
    WHERE d.token_hash=t.token_hash AND (d.test_sent_at IS NULL OR d.test_sent_at<now()-interval '1 minute') RETURNING d.token,d.token_hash`,[userId,sessionId])).rows[0];
  if(!device)throw new MobileError('Bật thông báo trên thiết bị trước; nếu vừa thử, chờ một phút rồi thử lại.',429,'PUSH_TEST_LIMIT');
  const outcome=await sendMobilePush(device.token,'test');
  if(outcome==='invalid')await ownerDatabase.query('UPDATE himoto.management_mobile_push_devices SET enabled=false WHERE token_hash=$1 AND session_id=$2',[device.token_hash,sessionId]);
  if(outcome==='invalid'||outcome==='failed')throw new MobileError('Chưa gửi được thông báo thử. Kiểm tra mạng và bật lại thông báo.',503,'PUSH_UNAVAILABLE');
  return {outcome};
}

export async function readMobilePushStatus(sessionId: string): Promise<MobilePushStatus> {
  if (!mobilePushConfigured()) return {configured: false, enabled: false};
  const result = await ownerDatabase.query('SELECT 1 FROM himoto.management_mobile_push_devices WHERE session_id=$1 AND enabled LIMIT 1', [sessionId]);
  return {configured: true, enabled: result.rowCount === 1};
}
export async function registerMobilePush(request: NextRequest, userId: number, sessionId: string) {
  if (!mobilePushConfigured()) throw new MobileError('Thông báo chưa được cấu hình. Vui lòng thử lại sau.', 503, 'PUSH_UNAVAILABLE');
  const body = await mobileBody(request, 8192);
  if (Object.keys(body).some(key=>!['token','activity'].includes(key)) || typeof body.token !== 'string' || !/^[A-Za-z0-9_:-]{20,4096}$/.test(body.token) || (body.activity!==undefined&&typeof body.activity!=='boolean'))
    throw new MobileError('Đăng ký thông báo không hợp lệ.', 400, 'INVALID_PUSH_TOKEN');
  const hash = createHash('sha256').update(body.token).digest('hex');
  await ownerDatabase.query(`INSERT INTO himoto.management_mobile_push_devices AS d(token_hash,token,user_id,session_id,activity_enabled_at)
    VALUES($1,$2,$3,$4,CASE WHEN $5::boolean THEN clock_timestamp() ELSE NULL END) ON CONFLICT(token_hash) DO UPDATE SET token=EXCLUDED.token,user_id=EXCLUDED.user_id,
    session_id=EXCLUDED.session_id,enabled=true,updated_at=now(),
    activity_enabled_at=CASE WHEN $5::boolean THEN CASE WHEN d.session_id=EXCLUDED.session_id AND d.enabled THEN COALESCE(d.activity_enabled_at,clock_timestamp()) ELSE clock_timestamp() END ELSE NULL END,
    state=CASE WHEN d.session_id=EXCLUDED.session_id THEN d.state ELSE '{}'::jsonb END,
    checked_at=CASE WHEN d.session_id=EXCLUDED.session_id THEN d.checked_at ELSE NULL END,
    lease_id=NULL,lease_until=NULL`, [hash, body.token, userId, sessionId,body.activity===true]);
  return {configured: true, enabled: true};
}
export async function disableMobilePush(sessionId: string) {
  await ownerDatabase.query('UPDATE himoto.management_mobile_push_devices SET enabled=false,activity_enabled_at=NULL,updated_at=now(),lease_id=NULL,lease_until=NULL WHERE session_id=$1', [sessionId]);
  return {configured: mobilePushConfigured(), enabled: false};
}
/** Called by the existing authenticated scheduler. No changes to business records. */
export async function dispatchMobilePush(budgetMs = 45000) {
  if (!mobilePushConfigured()) return {configured: false, checked: 0, sent: 0};
  const deadline = Date.now() + budgetMs, lease = randomUUID();
  const candidates = (await ownerDatabase.query(`WITH candidates AS (
    SELECT token_hash FROM himoto.management_mobile_push_devices WHERE enabled
      AND (checked_at IS NULL OR checked_at<now()-interval '5 minutes' OR
        activity_enabled_at IS NOT NULL AND EXISTS(SELECT 1 FROM himoto.management_mobile_activity_events e
          WHERE e.created_at>=GREATEST(activity_enabled_at,now()-interval '7 days') AND e.created_at>COALESCE(checked_at,activity_enabled_at) AND NOT EXISTS(
            SELECT 1 FROM himoto.management_mobile_activity_deliveries a WHERE a.token_hash=himoto.management_mobile_push_devices.token_hash AND a.event_id=e.id AND a.outcome<>'failed')))
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
      // Old app versions never opt in to this independent feed. Each event is
      // claimed once per device, so a retry or worker overlap cannot replay it.
      if(device.activity_enabled_at && Date.now()<=deadline-12000){
        const grants=activityGrants(user);
        const candidates=(await ownerDatabase.query(`SELECT e.id FROM himoto.management_mobile_activity_events e
          WHERE e.created_at>=GREATEST($2::timestamptz,now()-interval '7 days')
            AND ($3::boolean OR e.store_id=$4::bigint OR e.other_store_id=$4::bigint)
            AND ((e.kind='payment' AND $5::boolean) OR (e.kind='transfer' AND $6::boolean)
              OR (e.kind IN ('contract_created','renewal','return') AND $7::boolean))
            AND NOT EXISTS(SELECT 1 FROM himoto.management_mobile_activity_deliveries d
              WHERE d.token_hash=$1 AND d.event_id=e.id AND d.outcome<>'failed')
          ORDER BY e.id LIMIT 20`,[device.token_hash,device.activity_enabled_at,user.scope_all===true,user.store_id??null,grants.finance,grants.vehicles,grants.contracts])).rows.map(row=>Number(row.id));
        if(candidates.length){
          const visible=await withNotificationSnapshot(user,db=>scopedActivity(db,user,null,candidates));
          const allowed=new Set(visible.rows.map(row=>row.id));
          const claimed:number[]=[];
          for(const eventId of candidates){
            if(Date.now()>deadline-12000)break;
            const latest=await sessionUserById(Number(session.user_id),Number(session.password_version),ownerDatabase);
            if(!latest||latest.store_id!==user.store_id||latest.scope_all!==user.scope_all||
              JSON.stringify(activityGrants(latest))!==JSON.stringify(grants))break;
            const claim=await ownerDatabase.query(`INSERT INTO himoto.management_mobile_activity_deliveries(token_hash,event_id,outcome)
              SELECT d.token_hash,$2,CASE WHEN $4::boolean THEN 'sending' ELSE 'ignored' END
              FROM himoto.management_mobile_push_devices d JOIN himoto.management_mobile_sessions s ON s.id=d.session_id
              WHERE d.token_hash=$1 AND d.lease_id=$3 AND d.enabled AND d.activity_enabled_at IS NOT NULL
                AND s.revoked_at IS NULL AND s.expires_at>now()
              ON CONFLICT(token_hash,event_id) DO UPDATE SET outcome=EXCLUDED.outcome,created_at=clock_timestamp(),completed_at=NULL
                WHERE himoto.management_mobile_activity_deliveries.outcome='failed' RETURNING event_id`,[device.token_hash,eventId,lease,allowed.has(eventId)]);
            if(claim.rowCount&&allowed.has(eventId))claimed.push(eventId);
          }
          if(claimed.length){
            // One private banner opens the complete event feed instead of
            // sounding repeatedly for each receipt in the same transaction.
            const latest=await sessionUserById(Number(session.user_id),Number(session.password_version),ownerDatabase);
            const still=await ownerDatabase.query(`SELECT 1 FROM himoto.management_mobile_push_devices d
              JOIN himoto.management_mobile_sessions s ON s.id=d.session_id WHERE d.token_hash=$1 AND d.lease_id=$2 AND d.enabled
              AND s.revoked_at IS NULL AND s.expires_at>now()`,[device.token_hash,lease]);
            if(still.rowCount&&latest&&latest.store_id===user.store_id&&latest.scope_all===user.scope_all&&JSON.stringify(activityGrants(latest))===JSON.stringify(grants)){
              const outcome=await sendMobilePush(device.token,'activity');
              await ownerDatabase.query('UPDATE himoto.management_mobile_activity_deliveries SET outcome=$3,completed_at=now() WHERE token_hash=$1 AND event_id=ANY($2::bigint[])',
                [device.token_hash,claimed,outcome==='invalid'?'failed':outcome]);
              if(outcome==='sent')sent++;
              if(outcome==='invalid')await ownerDatabase.query('UPDATE himoto.management_mobile_push_devices SET enabled=false WHERE token_hash=$1 AND lease_id=$2',[device.token_hash,lease]);
            }
          }
        }
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
