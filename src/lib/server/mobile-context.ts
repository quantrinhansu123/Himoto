import "server-only";
import type { SessionUser } from "./management-session";
import { dataAccess } from "./access-context";

export function canMobileCrossStoreRead(user: SessionUser) {
  return user.scope_all === true || user.scope_all_read === true;
}

export function withMobileData<T>(
  user: SessionUser,
  operation: string,
  task: () => Promise<T>,
) {
  return dataAccess.run(
    {
      ...user,
      store_id: user.store_id ?? null,
      scope_all: user.scope_all === true,
      operation,
    },
    task,
  );
}

export function withMobileReadData<T>(
  user: SessionUser,
  operation: string,
  task: () => Promise<T>,
) {
  const crossStoreRead = user.scope_all_read === true && user.scope_all !== true;
  return dataAccess.run(
    {
      ...user,
      store_id: user.store_id ?? null,
      scope_all: user.scope_all === true || crossStoreRead,
      ...(crossStoreRead ? { cross_store_read: true } : {}),
      operation,
    },
    task,
  );
}
