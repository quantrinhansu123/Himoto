import type { MobileUser } from '../../../shared/mobile-contract';
import { isMobileUser } from './response-validation';

export interface StoredSession {
  token: string;
  expiresAt: string;
  origin: string;
  user?: MobileUser;
  verifiedAt?: number;
  refreshToken?: string;
  refreshExpiresAt?: string;
  sessionId?: string;
  rotationId?: string;
}
export function decodeStoredSession(
  raw: string | null,
  origin: string,
  now = Date.now(),
): StoredSession | null {
  try {
    const value = raw ? JSON.parse(raw) : null;
    const refresh = value && /^hmr2_[A-Za-z0-9_-]{43}$/.test(value.refreshToken) && typeof value.refreshExpiresAt === 'string' && Date.parse(value.refreshExpiresAt) > now &&
      typeof value.sessionId === 'string' && /^[0-9a-f-]{36}$/.test(value.sessionId);
    if (
      !value ||
      value.origin !== origin ||
      !/^hm1_[A-Za-z0-9_-]{43}$/.test(value.token) ||
      typeof value.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(value.expiresAt)) ||
      (Date.parse(value.expiresAt) <= now && !refresh) ||
      (value.refreshToken !== undefined && !refresh)
    )
      return null;
    return { token: value.token, expiresAt: value.expiresAt, origin,
      ...(isMobileUser(value.user) && typeof value.verifiedAt === 'number' && value.verifiedAt <= now && value.verifiedAt > 0
        ? { user: value.user, verifiedAt: value.verifiedAt } : {}),
      ...(refresh ? { refreshToken: value.refreshToken, refreshExpiresAt: value.refreshExpiresAt, sessionId: value.sessionId,
        ...(typeof value.rotationId === 'string' && /^[0-9a-f-]{36}$/.test(value.rotationId) ? { rotationId: value.rotationId } : {}) } : {}),
    };
  } catch {
    return null;
  }
}
