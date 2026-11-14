import 'server-only';
import type { NextRequest } from 'next/server';
import type { PoolClient } from 'pg';
import type { SessionUser } from './management-session';
import { hasPermission } from '@/lib/management/permissions';
import { withMobileData } from './mobile-context';
import { himotoPool, ownerDatabase } from './himoto-database';
import { MobileError } from './mobile-session';
import { mobileBody } from './mobile-writes';
import { DutyError } from './duty-roster';
import { readRegistrationMonth, readRegistrationRange, saveRegistration } from './shift-registration';
import { readSelfRegistrationWeek, saveSelfRegistrationWeek } from './self-shift-registration';
import { dutyToday, dutyWeekStart } from '../../../shared/mobile-duty-roster';
import type { SelfRegistrationWeek, RegistrationMonth, RegistrationRange, ShiftRegistration } from '../../../shared/mobile-shift-registration';

async function transaction<T>(user: SessionUser, self: boolean, write: boolean, run: (db: PoolClient) => Promise<T>) {
  if (!self && (!hasPermission(user, 'hr.read') || write && !hasPermission(user, 'hr.write'))) throw new MobileError('Không có quyền đăng ký ca làm việc.', 403, 'FORBIDDEN');
  return withMobileData(self ? user : { ...user, store_id: null, scope_all: true }, self ? '' : 'duty_roster', async () => {
    const db = await (self ? ownerDatabase : himotoPool).connect();
    try {
      await db.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await db.query("SET LOCAL statement_timeout='20s'");
      await db.query("SET LOCAL lock_timeout='5s'");
      const result = await run(db); await db.query('COMMIT'); return result;
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      if (error instanceof DutyError) throw new MobileError(error.message, error.status, error.status === 409 ? 'CONFLICT' : 'INVALID_REQUEST');
      throw error;
    } finally { db.release(); }
  });
}
export async function mobileShiftRegistration(user: SessionUser, request: NextRequest, self: boolean) {
  const write = request.method === 'PUT', params = request.nextUrl.searchParams;
  const allowed = self ? ['week'] : ['month','from','to'];
  if ([...params.keys()].some(k => write || !allowed.includes(k) || params.getAll(k).length !== 1)||!self&&(params.has('month')&&(params.has('from')||params.has('to'))||params.has('from')!==params.has('to'))) throw new MobileError('Bộ lọc đăng ký ca không hợp lệ.');
  const body = write ? await mobileBody(request, 8192) : null;
  return transaction<SelfRegistrationWeek | RegistrationMonth | RegistrationRange | ShiftRegistration>(user, self, write, db => self
    ? write ? saveSelfRegistrationWeek(db, user, body) : readSelfRegistrationWeek(db, user, params.get('week') || dutyWeekStart(dutyToday()))
    : write ? saveRegistration(db, user.id, body) : params.has('from')?readRegistrationRange(db,params.get('from')!,params.get('to')!):readRegistrationMonth(db, params.get('month') || dutyToday().slice(0, 7)));
}
export function readMobileRegistrationRange(user:SessionUser,from:string,to:string){return transaction(user,false,false,db=>readRegistrationRange(db,from,to));}
