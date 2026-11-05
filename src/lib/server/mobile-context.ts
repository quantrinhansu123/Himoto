import "server-only";
import type { SessionUser } from "./management-session";
import { dataAccess } from "./access-context";

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
