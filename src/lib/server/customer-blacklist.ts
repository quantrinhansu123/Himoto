import 'server-only';
import type { PoolClient } from 'pg';

export class CustomerBlacklistError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function parseBlacklistChange(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CustomerBlacklistError('Thông tin đổi Blacklist không hợp lệ.');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['blacklisted', 'revision'].includes(key)) || typeof input.blacklisted !== 'boolean' ||
      typeof input.revision !== 'string' || !/^\d{1,20}$/.test(input.revision)) throw new CustomerBlacklistError('Cần trạng thái Blacklist và phiên bản hồ sơ hiện tại. Nhấn Làm mới rồi thử lại.');
  return { blacklisted: input.blacklisted, revision: input.revision };
}

// Caller owns the transaction. Only the status and update timestamp may change.
export async function changeCustomerBlacklist(client: Pick<PoolClient, 'query'>, id: number, input: ReturnType<typeof parseBlacklistChange>) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new CustomerBlacklistError('Mã khách hàng không hợp lệ.');
  await client.query("SET LOCAL lock_timeout = '5s'");
  // Acquire the write table lock before locking a row, matching Excel/form
  // writers' lock order without serializing changes to unrelated customers.
  await client.query('LOCK TABLE himoto.customers IN ROW EXCLUSIVE MODE');
  const result = await client.query('SELECT id, xmin::text AS customer_revision FROM himoto.customers WHERE id=$1 FOR UPDATE', [id]);
  if (!result.rowCount) throw new CustomerBlacklistError('Không tìm thấy khách hàng.', 404);
  if (result.rows[0].customer_revision !== input.revision) throw new CustomerBlacklistError('Hồ sơ đã được người khác thay đổi. Nhấn Làm mới trước khi đổi Blacklist.', 409);
  const updated = await client.query(`UPDATE himoto.customers SET status = CASE WHEN $2::boolean THEN 2
      WHEN NULLIF(BTRIM(name), '') IS NOT NULL AND NULLIF(BTRIM(address), '') IS NOT NULL
        AND regexp_replace(COALESCE(id_card, ''), '\\s+', '', 'g') ~ '^(\\d{9}|\\d{12})$'
        AND regexp_replace(COALESCE(phone, ''), '[[:space:].()-]+', '', 'g') ~ '^\\+?\\d{9,13}$' THEN 1 ELSE 0 END,
      updated_at = now()
    WHERE id=$1 RETURNING id,
      CASE WHEN status = 2 THEN 'blacklist' WHEN status = 0 THEN 'draft'
        WHEN NULLIF(BTRIM(warning), '') IS NOT NULL THEN 'warning' ELSE 'active' END AS status,
      xmin::text AS customer_revision`, [id, input.blacklisted]);
  if (updated.rowCount !== 1) throw new CustomerBlacklistError('Không xác nhận được thay đổi Blacklist.', 409);
  return updated.rows[0] as { id: string | number; status: string; customer_revision: string };
}
