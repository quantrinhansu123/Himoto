export interface StoredSession {
  token: string;
  expiresAt: string;
  origin: string;
}
export function decodeStoredSession(
  raw: string | null,
  origin: string,
  now = Date.now(),
): StoredSession | null {
  try {
    const value = raw ? JSON.parse(raw) : null;
    if (
      !value ||
      value.origin !== origin ||
      !/^hm1_[A-Za-z0-9_-]{43}$/.test(value.token) ||
      typeof value.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(value.expiresAt)) ||
      Date.parse(value.expiresAt) <= now
    )
      return null;
    return { token: value.token, expiresAt: value.expiresAt, origin };
  } catch {
    return null;
  }
}
