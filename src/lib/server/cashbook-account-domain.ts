import "server-only";
import type { PoolClient } from "pg";
import { cashbookAccountValues, validateCashbookAccount, type CashbookAccountKind, type CashbookAccountValues } from "../../../shared/cashbook-account";
type Database = Pick<PoolClient, "query">;
export class CashbookAccountError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const CASHBOOK_ACCOUNTS_SQL = `SELECT a.kind,a.id,a.store_id,s.store_name,a.label,a.name,a.bank_name,a.owner_name,a.account_number,a.owner_type,a.status,a.opening_balance,a.revision,
  COALESCE(t.income,0) AS income,COALESCE(t.expense,0) AS expense,COALESCE(t.voucher_count,0)::int AS voucher_count,
  a.opening_balance+COALESCE(t.income,0)-COALESCE(t.expense,0) AS balance
  FROM (
    SELECT 'bank' AS kind,b.id,b.store_id,concat_ws(' · ',b.bank_name,b.owner_name,b.account_number) AS label,NULL::text AS name,
      b.bank_name::text AS bank_name,b.owner_name::text AS owner_name,b.account_number::text AS account_number,COALESCE(b.owner_type,'') AS owner_type,
      b.status,COALESCE(b.opening_balance,0) AS opening_balance,b.xmin::text AS revision FROM himoto.banks b
    UNION ALL
    SELECT 'cash',c.id,c.store_id,COALESCE(NULLIF(c.name,''),'Két tiền mặt #'||c.id::text),c.name::text,NULL,NULL,NULL,'',c.status,COALESCE(c.opening_balance,0),c.xmin::text FROM himoto.cash c
  ) a LEFT JOIN himoto.stores s ON s.id=a.store_id
  LEFT JOIN (
    SELECT CASE WHEN cash_id IS NOT NULL THEN 'cash' ELSE 'bank' END AS kind,COALESCE(cash_id,bank_id) AS account_id,
      sum(value) FILTER(WHERE type IN ('in','addon')) AS income,sum(value) FILTER(WHERE type='out') AS expense,count(*) AS voucher_count
    FROM himoto.transactions WHERE status='approved' AND (cash_id IS NOT NULL OR bank_id IS NOT NULL) GROUP BY 1,2
  ) t ON t.kind=a.kind AND t.account_id=a.id`;
export const CASHBOOK_ACCOUNT_TRANSACTIONS_SQL = `SELECT t.id,t.created_at,t.type,t.value AS amount,u.name AS user_name,
  COALESCE(o.contract_number,o.draft_reference,bc.code,CASE WHEN t.order_id IS NOT NULL THEN '#'||t.order_id::text END) AS contract_code,
  COALESCE(t."desc",t.note) AS content
  FROM himoto.transactions t LEFT JOIN himoto.users u ON u.id=t.user_id LEFT JOIN himoto.orders o ON o.id=t.order_id
  LEFT JOIN himoto.battery_contracts bc ON t.object_type='battery_contract' AND bc.id=t.object_id`;
export async function parseCashbookAccount(client: Database, kind: CashbookAccountKind, body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new CashbookAccountError("Thông tin tài khoản không hợp lệ.");
  const values = cashbookAccountValues(kind, body as Record<string, unknown>), errors = validateCashbookAccount(kind, values);
  if (Object.keys(errors).length) throw new CashbookAccountError(Object.values(errors)[0]);
  if (values.storeId !== 0 || values.ownerType !== "company") {
    if (!(await client.query("SELECT 1 FROM himoto.stores WHERE id=$1", [values.storeId])).rowCount) throw new CashbookAccountError("Cơ sở đã chọn không còn tồn tại.");
  }
  return values;
}
/** Caller owns the transaction. Shared unchanged business columns/defaults. */
export async function saveDatabaseCashbookAccount(client: Database, kind: CashbookAccountKind, values: CashbookAccountValues, id?: number) {
  let result;
  if (!id) result = kind === "cash"
    ? await client.query("INSERT INTO himoto.cash (store_id,opening_balance,status,name,created_at,updated_at) VALUES($1,$2,$3,NULLIF($4,''),now(),now()) RETURNING id", [values.storeId, values.opening, values.status, values.name])
    : await client.query("INSERT INTO himoto.banks (store_id,bank_name,account_number,owner_name,opening_balance,account_type,status,owner_type,created_at,updated_at) VALUES($1,$2,$3,$4,$5,1,$6,$7,now(),now()) RETURNING id", [values.storeId, values.bankName, values.accountNumber, values.ownerName, values.opening, values.status, values.ownerType]);
  else result = kind === "cash"
    ? await client.query("UPDATE himoto.cash SET store_id=$2,status=$3,opening_balance=$4,name=NULLIF($5,''),updated_at=now() WHERE id=$1 RETURNING id", [id, values.storeId, values.status, values.opening, values.name])
    : await client.query("UPDATE himoto.banks SET store_id=$2,owner_type=$3,bank_name=$4,owner_name=$5,account_number=$6,status=$7,opening_balance=$8,updated_at=now() WHERE id=$1 RETURNING id", [id, values.storeId, values.ownerType, values.bankName, values.ownerName, values.accountNumber, values.status, values.opening]);
  if (!result.rowCount) throw new CashbookAccountError(kind === "cash" ? "Không tìm thấy két tiền mặt." : "Không tìm thấy tài khoản ngân hàng.", 404);
  return { id: result.rows[0].id as string | number };
}
export async function deleteDatabaseCashbookAccount(client: Database, kind: CashbookAccountKind, id: number) {
  const table = kind === "cash" ? "cash" : "banks", column = kind === "cash" ? "cash_id" : "bank_id";
  if (!(await client.query(`SELECT id FROM himoto.${table} WHERE id=$1 FOR UPDATE`, [id])).rowCount) throw new CashbookAccountError("Không tìm thấy tài khoản cần xóa.", 404);
  const count = Number((await client.query(`SELECT count(*)::int AS count FROM himoto.transactions WHERE ${column}=$1`, [id])).rows[0]?.count || 0);
  if (count) throw new CashbookAccountError(`Không thể xóa vì đã có ${count} phiếu thu/chi gắn với tài khoản này. Hãy chuyển sang “Ngừng sử dụng” để giữ lịch sử.`, 409);
  await client.query(`DELETE FROM himoto.${table} WHERE id=$1`, [id]);
}
export async function setDatabaseCashbookAccountStatus(client: Database, kind: CashbookAccountKind, id: number, status: unknown) {
  if (status !== "active" && status !== "inactive") throw new CashbookAccountError("Trạng thái tài khoản không hợp lệ.");
  if (!(await client.query(`UPDATE himoto.${kind === "cash" ? "cash" : "banks"} SET status=$2,updated_at=now() WHERE id=$1 RETURNING id`, [id, status === "active" ? "Active" : "Inactive"])).rowCount) throw new CashbookAccountError("Không tìm thấy tài khoản.", 404);
}
export async function readDatabaseCashbookTransactions(client: Database, kind: CashbookAccountKind, id: number, from: string | null, to: string | null) {
  return (await client.query(`${CASHBOOK_ACCOUNT_TRANSACTIONS_SQL} WHERE t.${kind === "cash" ? "cash_id" : "bank_id"}=$1 AND t.status='approved'
    AND ($2::date IS NULL OR (t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= $2::date)
    AND ($3::date IS NULL OR (t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= $3::date) ORDER BY t.created_at DESC,t.id DESC LIMIT 2000`, [id, from, to])).rows;
}
