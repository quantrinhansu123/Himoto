import { uuid } from 'expo';
import { ApiError, createApi } from './api';
import { sessionStore } from './session-store';
import type { StoredSession } from './session-codec';

const flights = new Map<string, Promise<StoredSession>>();
const accessTokens = new Map<string, string>();
export const sessionFamily = (session: Pick<StoredSession, 'token' | 'sessionId'>) => session.sessionId || session.token;
export function rememberAccess(origin: string, session: StoredSession) {
  accessTokens.set(`${origin}:${sessionFamily(session)}`, session.token);
  return session;
}
export const currentAccess = (origin: string, family: string, fallback: string) => accessTokens.get(`${origin}:${family}`) || fallback;
const expired = () => new ApiError('Phiên đã hết hạn. Vui lòng đăng nhập lại.', 401, 'SESSION_EXPIRED');

export async function freshSession(origin: string, expectedFamily?: string, force = false): Promise<StoredSession> {
  const stored = await sessionStore.read(origin);
  if (!stored || expectedFamily && sessionFamily(stored) !== expectedFamily) throw expired();
  const family = sessionFamily(stored), key = `${origin}:${family}`;
  if (!stored.refreshToken || !force && Date.parse(stored.expiresAt) > Date.now() + 60000) return rememberAccess(origin, stored);
  const existing = flights.get(key); if (existing) return existing;
  const promise = (async () => {
    const reserved = await sessionStore.rotation(origin, stored.token, () => uuid.v4().toLowerCase());
    if (!reserved?.refreshToken || !reserved.rotationId) throw expired();
    const next = await createApi(origin).refreshSession(reserved.refreshToken, reserved.rotationId);
    if (next.sessionId !== reserved.sessionId) throw new ApiError('Kết quả gia hạn không thuộc phiên này.', 502, 'INVALID_RESPONSE');
    if (!await sessionStore.update(origin, reserved.token, next)) throw expired();
    const saved = await sessionStore.read(origin);
    if (!saved || sessionFamily(saved) !== family) throw expired();
    return rememberAccess(origin, saved);
  })().finally(() => { flights.delete(key); });
  flights.set(key, promise);
  const next = await promise;
  // A lost response can be recovered after its 15-minute access token expired.
  // Persist the recovered refresh token first, then perform its next rotation.
  return Date.parse(next.expiresAt) <= Date.now() + 60000 ? freshSession(origin, family) : next;
}
export function sessionAccess(origin: string, session: Pick<StoredSession, 'token' | 'sessionId'>) {
  const family = sessionFamily(session);
  return {
    token: async (force = false) => (await freshSession(origin, family, force)).token,
    current: () => currentAccess(origin, family, session.token),
  };
}
