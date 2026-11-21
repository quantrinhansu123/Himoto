import 'server-only';
import type { NextRequest } from 'next/server';
import type { PoolClient } from 'pg';
import type { SessionUser } from './management-session';
import { canManageShiftRegistration } from '@/lib/management/permissions';
import { himotoPool, ownerDatabase } from './himoto-database';
import { withMobileData } from './mobile-context';
import { MobileError } from './mobile-session';
import { mobileBody } from './mobile-writes';
import { DutyError } from './duty-roster';
import { readRegistrationMonth, readRegistrationRange, saveRegistration, setRegistrationWeekLock } from './shift-registration';
import { readSelfRegistrationWeek, saveSelfRegistrationWeek } from './self-shift-registration';
import { dutyToday, dutyWeekStart } from '../../../shared/mobile-duty-roster';

async function transaction<T>(user: SessionUser, self: boolean, write: boolean, run: (db: PoolClient) => Promise<T>, updateLock = false) {
  if (!self && write && !canManageShiftRegistration(user)) throw new MobileError('Chỉ HCNS được chỉnh sửa hoặc khóa bảng đăng ký ca.', 403, 'FORBIDDEN');
  return withMobileData(self ? user : { ...user, store_id: null, scope_all: true }, self ? '' : 'duty_roster', async () => {
    const db = await (self || updateLock ? ownerDatabase : himotoPool).connect();
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
  if (!self && request.method === 'PATCH') {
    if (request.nextUrl.search) throw new MobileError('Bộ lọc đăng ký ca không hợp lệ.');
    const input = await mobileBody(request, 8192);
    return transaction(user, false, true, db => setRegistrationWeekLock(db, user.id, input), true);
  }
  const write = request.method === 'PUT', params = request.nextUrl.searchParams;
  const allowed = self ? ['week'] : ['month','from','to'];
  if ([...params.keys()].some(k => write || !allowed.includes(k) || params.getAll(k).length !== 1)||!self&&(params.has('month')&&(params.has('from')||params.has('to'))||params.has('from')!==params.has('to'))) throw new MobileError('Bộ lọc đăng ký ca không hợp lệ.');
  const body = write ? await mobileBody(request, 8192) : null;
  const ownUserId = canManageShiftRegistration(user) ? undefined : user.id;
  return transaction(user, self, write, async db => self
    ? write ? saveSelfRegistrationWeek(db, user, body) : readSelfRegistrationWeek(db, user, params.get('week') || dutyWeekStart(dutyToday()))
    : write ? saveRegistration(db, user.id, body) : params.has('from')?readRegistrationRange(db,params.get('from')!,params.get('to')!,ownUserId):readRegistrationMonth(db, params.get('month') || dutyToday().slice(0, 7),ownUserId));
}
export function readMobileRegistrationRange(user:SessionUser,from:string,to:string){
  return transaction(user,false,false,db=>readRegistrationRange(db,from,to,canManageShiftRegistration(user)?undefined:user.id));
}
