import type { MobileSession } from '../../../shared/mobile-contract';
import { sessionStore } from './session-store';
import { sessionFamily } from './session-refresh';
import { offlineScopeKey, OFFLINE_TTL } from './offline-policy';
import { offlineStatus } from './offline-status';

export function offlineAccessGuard(origin: string, expected: MobileSession) {
  const scope = offlineScopeKey({ origin, user: expected.user }), family = sessionFamily(expected);
  return async () => {
    const stored = await sessionStore.read(origin);
    return !!stored?.user && sessionFamily(stored) === family && offlineScopeKey({ origin, user: stored.user }) === scope &&
      (offlineStatus.get().connected || !!stored.verifiedAt && Date.now() - stored.verifiedAt < OFFLINE_TTL);
  };
}
