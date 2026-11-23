import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { canOperateAcrossStores, type CrossStoreOperation, type PermissionAccount } from '@/lib/management/permissions';

export interface DataAccess extends PermissionAccount { id:number; store_id:number|null; scope_all:boolean; operation:string; transfer_vehicle_id?:string; cross_store_read?:boolean; cross_store_operation?:boolean }
export const dataAccess = new AsyncLocalStorage<DataAccess>();

// Widen database visibility for this operation without changing account-level permissions.
export function withCrossStoreOperation<T>(permission: CrossStoreOperation | undefined, task: () => T): T {
  const actor = dataAccess.getStore();
  if (actor && !actor.scope_all && permission && canOperateAcrossStores(actor, permission)) {
    return dataAccess.run({ ...actor, cross_store_operation: true }, task);
  }
  return task();
}

// Keep this aligned with himotoPool: admins use the owner connection without
// scoped session variables; only non-admin scopes can call actor-bound helpers.
export function usesScopedDatabase() {
  const scope=dataAccess.getStore();
  return Boolean(scope && scope.access_role!=='admin');
}
