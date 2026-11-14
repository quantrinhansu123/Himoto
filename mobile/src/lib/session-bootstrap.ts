import type { MobileSession } from '../../../shared/mobile-contract';
import type { StoredSession } from './session-codec';
import { OFFLINE_TTL } from './offline-policy';

/** Reuses the existing, bounded offline grant; never extends its verification. */
export function cachedMobileSession(stored: StoredSession | null, now = Date.now()): MobileSession | null {
  if (!stored?.user || !stored.verifiedAt || stored.verifiedAt > now || now - stored.verifiedAt >= OFFLINE_TTL ||
    Date.parse(stored.refreshExpiresAt || stored.expiresAt) <= now) return null;
  return { user: stored.user, token: stored.token, expiresAt: stored.expiresAt,
    ...(stored.refreshToken ? { refreshToken: stored.refreshToken, refreshExpiresAt: stored.refreshExpiresAt, sessionId: stored.sessionId } : {}),
  };
}
