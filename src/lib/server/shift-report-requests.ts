import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';

export class ShiftRequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function shiftRequestId(headers: Headers): string | null {
  const key = headers.get('x-shift-request-id');
  if (key !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    throw new ShiftRequestError('Mã thao tác lưu không hợp lệ.');
  }
  return key?.toLowerCase() ?? null;
}
export function shiftRequestHash(...parts: (string | Buffer)[]): string {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest('hex');
}
export type ShiftReceipt = { id?: number; revision: number; [key:string]:unknown };
// The receipt and business write share one transaction. Concurrent retries wait
// for the first transaction, then replay its result without repeating the write.
export async function readShiftReceipt(client: Pick<PoolClient, 'query'>, key: string | null, actor: number, hash: string): Promise<ShiftReceipt | null> {
  if (!key) return null; // Older browser tabs retain their existing API contract.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
  const row = (await client.query('SELECT created_by,request_hash,response FROM himoto.management_shift_requests WHERE request_id=$1', [key])).rows[0];
  if (!row) return null;
  if (Number(row.created_by) !== actor || row.request_hash !== hash) throw new ShiftRequestError('Mã lưu đã được dùng cho nội dung khác. Mở lại báo cáo để kiểm tra.', 409);
  return row.response as ShiftReceipt;
}
export async function writeShiftReceipt(client: Pick<PoolClient, 'query'>, key: string | null, actor: number, store: number, hash: string, response: ShiftReceipt) {
  if (key) await client.query('INSERT INTO himoto.management_shift_requests(request_id,store_id,created_by,request_hash,response) VALUES($1,$2,$3,$4,$5)', [key,store,actor,hash,response]);
}
