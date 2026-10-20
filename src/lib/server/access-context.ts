import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PermissionAccount } from '@/lib/management/permissions';

export interface DataAccess extends PermissionAccount { id:number; store_id:number|null; scope_all:boolean; operation:string }
export const dataAccess = new AsyncLocalStorage<DataAccess>();

// Keep this aligned with himotoPool: admins use the owner connection without
// scoped session variables; only non-admin scopes can call actor-bound helpers.
export function usesScopedDatabase() {
  const scope=dataAccess.getStore();
  return Boolean(scope && scope.access_role!=='admin');
}
