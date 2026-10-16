import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PermissionAccount } from '@/lib/management/permissions';

export interface DataAccess extends PermissionAccount { id:number; store_id:number|null; scope_all:boolean; operation:string }
export const dataAccess = new AsyncLocalStorage<DataAccess>();
