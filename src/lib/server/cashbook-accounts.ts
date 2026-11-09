import { NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { failureResponse } from './public-failure';
import { CashbookAccountError, parseCashbookAccount, saveDatabaseCashbookAccount, deleteDatabaseCashbookAccount, setDatabaseCashbookAccountStatus, readDatabaseCashbookTransactions } from './cashbook-account-domain';

const json = (status: number, message: string) => NextResponse.json({ status: 'error', message }, { status });

/** Parses `cashbook/accounts/{bank|cash}/{id}`; returns null when the path is not an account item. */
export function parseAccountPath(path: string[], suffix?: string): { kind: 'bank' | 'cash'; id: number } | null {
  if (suffix ? path.length !== 5 || path[4] !== suffix : path.length !== 4) return null;
  if ( path[0] !== 'cashbook' || path[1] !== 'accounts' || (path[2] !== 'bank' && path[2] !== 'cash') || !/^\d+$/.test(path[3])) return null;
  const id = Number(path[3]);
  return Number.isSafeInteger(id) && id > 0 ? { kind: path[2], id } : null;
}

/** Parses `cashbook/accounts/{bank|cash}` for creating an account. */
export function parseAccountCollectionPath(path: string[]): 'bank' | 'cash' | null {
  return path.length === 3 && path[0] === 'cashbook' && path[1] === 'accounts' && (path[2] === 'bank' || path[2] === 'cash') ? path[2] : null;
}
function accountFailure(error: unknown, message: string) {
  if (error instanceof CashbookAccountError) return json(error.status, error.message);
  if (error instanceof SyntaxError) return json(400, 'Thông tin tài khoản không hợp lệ.');
  return failureResponse(message, error);
}
export async function createAccount(kind: 'bank' | 'cash', request: Request) {
  try {
    const values = await parseCashbookAccount(himotoPool, kind, await request.json());
    const saved = await saveDatabaseCashbookAccount(himotoPool, kind, values);
    return NextResponse.json({ status: 'success', data: { id: saved.id } }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return accountFailure(error, 'Không tạo được tài khoản.'); }
}
export async function updateAccount(kind: 'bank' | 'cash', id: number, request: Request) {
  try {
    const values = await parseCashbookAccount(himotoPool, kind, await request.json());
    await saveDatabaseCashbookAccount(himotoPool, kind, values, id);
    return NextResponse.json({ status: 'success', data: null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return accountFailure(error, 'Không lưu được thay đổi tài khoản.'); }
}
export async function deleteAccount(kind: 'bank' | 'cash', id: number) {
  const client = await himotoPool.connect();
  try {
    await client.query('BEGIN'); await deleteDatabaseCashbookAccount(client, kind, id); await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data: null });
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); return accountFailure(error, 'Không xóa được tài khoản.'); }
  finally { client.release(); }
}
/** Availability only; balances, vouchers and account details remain unchanged. */
export async function setAccountStatus(kind: 'bank' | 'cash', id: number, request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'status')) throw new CashbookAccountError('Trạng thái tài khoản không hợp lệ.');
    await setDatabaseCashbookAccountStatus(himotoPool, kind, id, (body as Record<string, unknown>).status);
    return NextResponse.json({ status: 'success', data: null });
  } catch (error) { return accountFailure(error, 'Không đổi được trạng thái tài khoản.'); }
}

const dateParam = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

export async function listAccountTransactions(kind: 'bank' | 'cash', id: number, params: URLSearchParams) {
  const from = dateParam(params.get('from')), to = dateParam(params.get('to'));
  if ((params.get('from') && !from) || (params.get('to') && !to) || (from && to && from > to)) return json(400, 'Khoảng ngày không hợp lệ.');
  try {
    const rows = await readDatabaseCashbookTransactions(himotoPool, kind, id, from, to, params.get('all') === '1');
    return NextResponse.json({ status: 'success', data: rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failureResponse('Không tải được danh sách thu chi của tài khoản.', error); }
}
