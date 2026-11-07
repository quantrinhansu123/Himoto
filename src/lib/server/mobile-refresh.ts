import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';
import { ownerDatabase } from './himoto-database';
import { sessionUserById, type SessionUser } from './management-session';
import { createMobileSession, mobileUser, MobileError, tokenHash } from './mobile-session';
import type { MobileSession } from '../../../shared/mobile-contract';

export const ACCESS_SECONDS = 15 * 60;
export const REFRESH_SECONDS = 30 * 24 * 60 * 60;
const ABSOLUTE_SECONDS = 90 * 24 * 60 * 60;
type Database = Pick<typeof ownerDatabase, 'connect'>;
const expired = () => new MobileError('Phiên đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.', 401, 'SESSION_EXPIRED');
const deadline = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
function rotatedTokens(refreshToken: string, rotationId: string, sessionId: string) {
  const secret = process.env.MANAGEMENT_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new MobileError('Chưa cấu hình gia hạn phiên.', 503, 'MOBILE_UNAVAILABLE');
  const derive = (purpose: string) => createHmac('sha256', secret).update(JSON.stringify(['himoto-mobile-refresh-v2', purpose, sessionId, refreshToken, rotationId])).digest('base64url');
  return { token: `hm1_${derive('access')}`, refreshToken: `hmr2_${derive('refresh')}` };
}
export async function createRotatingMobileSession(user: SessionUser, deviceName: string, platform: 'ios' | 'android', database: Database = ownerDatabase): Promise<MobileSession> {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const session = await createMobileSession(user, deviceName, platform, client);
    const expiresAt = deadline(ACCESS_SECONDS), refreshExpiresAt = deadline(REFRESH_SECONDS);
    const refreshToken = `hmr2_${randomBytes(32).toString('base64url')}`;
    const row = await client.query('UPDATE himoto.management_mobile_sessions SET expires_at=$1 WHERE token_hash=$2 RETURNING id', [expiresAt, tokenHash(session.token)]);
    await client.query('INSERT INTO himoto.management_mobile_refresh_sessions(session_id,token_hash,expires_at,absolute_expires_at) VALUES($1,$2,$3,$4)', [row.rows[0].id, tokenHash(refreshToken), refreshExpiresAt, deadline(ABSOLUTE_SECONDS)]);
    await client.query('COMMIT');
    return { ...session, expiresAt, refreshToken, refreshExpiresAt, sessionId: String(row.rows[0].id) };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}

export async function rotateMobileSession(refreshToken: string, rotationId: string, database: Database = ownerDatabase): Promise<MobileSession> {
  if (!/^hmr2_[A-Za-z0-9_-]{43}$/.test(refreshToken) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(rotationId)) throw expired();
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    const hash = tokenHash(refreshToken);
    const candidate = (await client.query(`SELECT session_id FROM himoto.management_mobile_refresh_sessions WHERE token_hash=$1
      UNION SELECT session_id FROM himoto.management_mobile_used_refresh_tokens WHERE token_hash=$1`, [hash])).rows[0];
    if (!candidate) throw expired();
    const row = (await client.query(`SELECT s.id,s.user_id,s.password_version,s.token_hash AS access_hash,s.revoked_at,s.expires_at AS access_expires_at,
      r.token_hash,r.expires_at,r.absolute_expires_at FROM himoto.management_mobile_sessions s
      JOIN himoto.management_mobile_refresh_sessions r ON r.session_id=s.id WHERE s.id=$1 FOR UPDATE OF s,r`, [candidate.session_id])).rows[0];
    if (!row || row.revoked_at || Date.parse(row.expires_at) <= Date.now() || Date.parse(row.absolute_expires_at) <= Date.now()) throw expired();
    const user = await sessionUserById(Number(row.user_id), Number(row.password_version), client);
    if (!user) {
      await client.query('UPDATE himoto.management_mobile_sessions SET revoked_at=now() WHERE id=$1', [row.id]);
      await client.query('COMMIT'); throw expired();
    }
    const next = rotatedTokens(refreshToken, rotationId, String(row.id));
    if (row.token_hash !== hash) {
      const used = (await client.query('SELECT rotation_id FROM himoto.management_mobile_used_refresh_tokens WHERE token_hash=$1 AND session_id=$2', [hash, row.id])).rows[0];
      // Same UUID retries a lost response without rotating twice. Different UUID
      // reuse of a retired token revokes this device's whole session family.
      if (used?.rotation_id === rotationId && row.token_hash === tokenHash(next.refreshToken) && row.access_hash === tokenHash(next.token)) {
        await client.query('COMMIT');
        return { ...next, user: mobileUser(user), expiresAt: new Date(row.access_expires_at).toISOString(), refreshExpiresAt: new Date(row.expires_at).toISOString(), sessionId: String(row.id) };
      }
      if (used?.rotation_id !== rotationId) await client.query('UPDATE himoto.management_mobile_sessions SET revoked_at=now() WHERE id=$1', [row.id]);
      await client.query('COMMIT'); throw expired();
    }
    const expiresAt = new Date(Math.min(Date.now() + ACCESS_SECONDS * 1000, Date.parse(row.absolute_expires_at))).toISOString();
    const refreshExpiresAt = new Date(Math.min(Date.now() + REFRESH_SECONDS * 1000, Date.parse(row.absolute_expires_at))).toISOString();
    await client.query('INSERT INTO himoto.management_mobile_used_refresh_tokens(token_hash,session_id,rotation_id) VALUES($1,$2,$3)', [hash, row.id, rotationId]);
    await client.query('UPDATE himoto.management_mobile_refresh_sessions SET token_hash=$1,expires_at=$2 WHERE session_id=$3', [tokenHash(next.refreshToken), refreshExpiresAt, row.id]);
    await client.query('UPDATE himoto.management_mobile_sessions SET token_hash=$1,expires_at=$2 WHERE id=$3', [tokenHash(next.token), expiresAt, row.id]);
    await client.query('COMMIT');
    return { ...next, user: mobileUser(user), expiresAt, refreshExpiresAt, sessionId: String(row.id) };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}
