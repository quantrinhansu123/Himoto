import { NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';

const json = (status: number, message: string) => NextResponse.json({ status: 'error', message }, { status });

/** Parses `cashbook/accounts/{bank|cash}/{id}`; returns null when the path is not an account item. */
export function parseAccountPath(path: string[], suffix?: string): { kind: 'bank' | 'cash'; id: number } | null {
  if (suffix ? path.length !== 5 || path[4] !== suffix : path.length !== 4) return null;
  if ( path[0] !== 'cashbook' || path[1] !== 'accounts' || (path[2] !== 'bank' && path[2] !== 'cash') || !/^\d+$/.test(path[3])) return null;
  const id = Number(path[3]);
  return Number.isSafeInteger(id) && id > 0 ? { kind: path[2], id } : null;
}

const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max + 1) : '';

export async function updateAccount(kind: 'bank' | 'cash', id: number, request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
    body = parsed as Record<string, unknown>;
  } catch { return json(400, 'Thông tin tài khoản không hợp lệ.'); }
  const status = body.status === 'inactive' ? 'inactive' : body.status === 'active' ? 'active' : '';
  const opening = Number(body.opening_balance ?? 0);
  if (!status || !Number.isFinite(opening) || Math.abs(opening) > 1e13) return json(400, 'Kiểm tra trạng thái và số dư đầu kỳ.');
  try {
    if (kind === 'cash') {
      const result = await himotoPool.query('UPDATE himoto.cash SET status=$2, opening_balance=$3 WHERE id=$1 RETURNING id', [id, status, opening]);
      if (!result.rowCount) return json(404, 'Không tìm thấy két tiền mặt.');
    } else {
      const bankName = text(body.bank_name, 191), ownerName = text(body.owner_name, 191), accountNumber = text(body.account_number, 64);
      if (!bankName || !ownerName || !accountNumber || bankName.length > 191 || ownerName.length > 191 || accountNumber.length > 64) return json(400, 'Nhập đủ ngân hàng, chủ tài khoản và số tài khoản.');
      const result = await himotoPool.query('UPDATE himoto.banks SET bank_name=$2, owner_name=$3, account_number=$4, status=$5, opening_balance=$6 WHERE id=$1 RETURNING id',
        [id, bankName, ownerName, accountNumber, status, opening]);
      if (!result.rowCount) return json(404, 'Không tìm thấy tài khoản ngân hàng.');
    }
    return NextResponse.json({ status: 'success', data: null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Supabase account update failed:', error instanceof Error ? error.name : 'Unknown database error');
    return json(500, 'Không lưu được thay đổi tài khoản.');
  }
}

export async function deleteAccount(kind: 'bank' | 'cash', id: number) {
  const table = kind === 'cash' ? 'cash' : 'banks', column = kind === 'cash' ? 'cash_id' : 'bank_id';
  const client = await himotoPool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`SELECT id FROM himoto.${table} WHERE id=$1 FOR UPDATE`, [id]);
    if (!found.rowCount) { await client.query('ROLLBACK'); return json(404, 'Không tìm thấy tài khoản cần xóa.'); }
    const used = await client.query(`SELECT count(*)::int AS count FROM himoto.transactions WHERE ${column}=$1`, [id]);
    const count = Number(used.rows[0]?.count || 0);
    if (count > 0) {
      await client.query('ROLLBACK');
      return json(409, `Không thể xóa vì đã có ${count} phiếu thu/chi gắn với tài khoản này. Hãy chuyển sang “Ngừng sử dụng” để giữ lịch sử.`);
    }
    await client.query(`DELETE FROM himoto.${table} WHERE id=$1`, [id]);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data: null });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Supabase account delete failed:', error instanceof Error ? error.name : 'Unknown database error');
    return json(500, 'Không xóa được tài khoản.');
  } finally { client.release(); }
}

const dateParam = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

export async function listAccountTransactions(kind: 'bank' | 'cash', id: number, params: URLSearchParams) {
  const from = dateParam(params.get('from')), to = dateParam(params.get('to'));
  if ((params.get('from') && !from) || (params.get('to') && !to) || (from && to && from > to)) return json(400, 'Khoảng ngày không hợp lệ.');
  const column = kind === 'cash' ? 'cash_id' : 'bank_id';
  try {
    const result = await himotoPool.query(
      `SELECT t.id, t.created_at, t.type, t.value AS amount, u.name AS user_name,
              COALESCE(o.contract_number, o.draft_reference, CASE WHEN t.order_id IS NOT NULL THEN '#' || t.order_id::text END) AS contract_code,
              COALESCE(t."desc", t.note) AS content
       FROM himoto.transactions t LEFT JOIN himoto.users u ON u.id = t.user_id LEFT JOIN himoto.orders o ON o.id = t.order_id
       WHERE t.${column} = $1 AND t.status = 'approved'
         AND ($2::date IS NULL OR (t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= $2::date)
         AND ($3::date IS NULL OR (t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= $3::date)
       ORDER BY t.created_at DESC, t.id DESC LIMIT 2000`, [id, from, to]);
    return NextResponse.json({ status: 'success', data: result.rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Supabase account transactions failed:', error instanceof Error ? error.name : 'Unknown database error');
    return json(500, 'Không tải được danh sách thu chi của tài khoản.');
  }
}
