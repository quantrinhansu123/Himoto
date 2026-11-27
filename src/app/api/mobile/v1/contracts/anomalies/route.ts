import { NextRequest } from 'next/server';
import { hasPermission } from '@/lib/management/permissions';
import { himotoPool } from '@/lib/server/himoto-database';
import { withMobileReadData } from '@/lib/server/mobile-context';
import { mobileFailure, mobileJson } from '@/lib/server/mobile-response';
import { MobileError, requireMobileSession } from '@/lib/server/mobile-session';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireMobileSession(request);
    if (!hasPermission(user, 'contracts.read')) {
      throw new MobileError('Tài khoản không có quyền xem bất thường hợp đồng.', 403, 'FORBIDDEN');
    }
    const query = request.nextUrl.searchParams;
    const date = query.get('date') || '';
    const page = Number(query.get('page') || 1);
    if (
      (date &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !Number.isFinite(Date.parse(date)) ||
          new Date(date).toISOString().slice(0, 10) !== date)) ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 100000
    ) {
      throw new MobileError('Ngày hoặc trang không hợp lệ.', 400);
    }
    const employee = (query.get('employee') || '').trim().slice(0, 100);
    const store = (query.get('store') || '').trim().slice(0, 100);
    const contract = (query.get('contract') || '').trim().slice(0, 100);
    const data = await withMobileReadData(user, '', async () => {
      const { rows } = await himotoPool.query(
        `SELECT a.transaction_id::text AS transaction_id,a.contract_code,a.occurred_at,a.amount::text AS amount,a.expected_amount::text AS expected_amount,t.status AS transaction_status,
          COALESCE(u.name,'#'||a.actor_id::text) AS employee,COALESCE(s.store_name,'#'||a.store_id::text) AS store
        FROM himoto.management_contract_anomalies a
        LEFT JOIN himoto.users u ON u.id=a.actor_id
        LEFT JOIN himoto.stores s ON s.id=a.store_id
        LEFT JOIN himoto.transactions t ON t.id=a.transaction_id
        WHERE ($1::date IS NULL OR a.occurred_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
          AND a.occurred_at < (($1::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))
          AND strpos(lower(COALESCE(u.name,'#'||a.actor_id::text)),lower($2))>0
          AND strpos(lower(COALESCE(s.store_name,'#'||a.store_id::text)),lower($3))>0
          AND strpos(lower(a.contract_code),lower($4))>0
        ORDER BY a.occurred_at DESC,a.transaction_id DESC LIMIT 51 OFFSET $5`,
        [date || null, employee, store, contract, (page - 1) * 50],
      );
      return {
        rows: rows.slice(0, 50).map((row) => ({
          ...row,
          transaction_id: String(row.transaction_id),
          occurred_at: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : String(row.occurred_at),
          amount: String(row.amount),
          expected_amount: String(row.expected_amount),
          transaction_status: row.transaction_status == null ? null : String(row.transaction_status),
        })),
        hasMore: rows.length > 50,
      };
    });
    return mobileJson(data);
  } catch (error) {
    return mobileFailure(error);
  }
}
