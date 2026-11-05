import "server-only";
import type { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import type { SessionUser } from "./management-session";
import { hasPermission } from "@/lib/management/permissions";
import { mapCashbookAccount, mapCashbookRow, cashbookDateTime } from "@/lib/management/cashbook-repository";
import { cashbookCsv,CASHBOOK_COLUMNS,cashbookCell } from "@/lib/management/cashbook";
import type { MobileFileExport } from "../../../shared/mobile-export";
import {mobileFilteredWorkbook} from './mobile-filtered-workbook';
import { bulkDelete, parseBulkDelete, BulkDeleteError } from "./bulk-delete";
import { CASHBOOK_DELETE_OPERATION, isVoucherDeletion, type VoucherDeletion, type VoucherDeleteSelection } from "../../../shared/mobile-cashbook-delete";
import { listCashbook, CashbookQueryError } from "./cashbook-list";
import { CASHBOOK_ACCOUNTS_SQL, CashbookAccountError, parseCashbookAccount, saveDatabaseCashbookAccount, deleteDatabaseCashbookAccount, setDatabaseCashbookAccountStatus, readDatabaseCashbookTransactions } from "./cashbook-account-domain";
import { withMobileData } from "./mobile-context";
import { himotoPool } from "./himoto-database";
import { MobileError } from "./mobile-session";
import { mobileBody, mobileRequestKey, idempotentMobileWrite } from "./mobile-writes";
import { isCashbookAccount, isCashbookPage, type CashbookAccountKind, type MobileCashbookPage, type MobileCashbookAccount, type MobileCashbookAccountResult, type MobileCashbookTransactions } from "../../../shared/mobile-cashbook";

function allowed(user: SessionUser, write = false) {
  if (!hasPermission(user, write ? "finance.write" : "finance.read")) throw new MobileError("Tài khoản không có quyền thực hiện thao tác sổ quỹ.", 403, "FORBIDDEN");
}
export function mobileCashbookKind(raw: string): CashbookAccountKind {
  if (raw !== "bank" && raw !== "cash") throw new MobileError("Loại tài khoản không hợp lệ.");
  return raw;
}
const accountId = (raw: string) => { if (!/^[1-9]\d{0,14}$/.test(raw)) throw new MobileError("Mã tài khoản không hợp lệ."); return Number(raw); };
function paramsOnly(params: URLSearchParams, keys: string[]) {
  for (const [key] of params) if (!keys.includes(key) || params.getAll(key).length !== 1) throw new MobileError("Bộ lọc sổ quỹ không hợp lệ.");
}
function dateRange(params: URLSearchParams) {
  const from = params.get("from") || "", to = params.get("to") || "";
  for (const date of [from, to]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new MobileError("Ngày lọc sổ quỹ không hợp lệ.");
  if (from && to && from > to) throw new MobileError("Đến ngày phải bằng hoặc sau Từ ngày.");
  return { from: from || null, to: to || null };
}
async function transaction<T>(user: SessionUser, read: boolean, run: (client: PoolClient) => Promise<T>) {
  return withMobileData(user, "", async () => {
    const client = await himotoPool.connect();
    try {
      await client.query(read ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
      await client.query("SET LOCAL statement_timeout='20s'"); await client.query("SET LOCAL lock_timeout='5s'");
      const result = await run(client); await client.query("COMMIT"); return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof CashbookAccountError) throw new MobileError(error.message, error.status, error.status === 409 ? "CONFLICT" : "INVALID_REQUEST");
      if (error instanceof CashbookQueryError) throw new MobileError(error.message);
      if (error instanceof BulkDeleteError) throw new MobileError(error.message, error.status, error.status === 409 ? "CONFLICT" : "INVALID_REQUEST");
      throw error;
    } finally { client.release(); }
  });
}
export async function readMobileCashbook(user: SessionUser, params: URLSearchParams): Promise<MobileCashbookPage> {
  allowed(user);
  paramsOnly(params, ["store_id", "actor", "from", "to", "search", ...["income", "expense"].flatMap(kind => ["page", "limit", "sort", "direction"].map(key => `${kind}_${key}`))]);
  dateRange(params);
  return transaction(user, true, async client => {
    const data = await listCashbook(params, client);
    if (Array.isArray(data)) throw new MobileError("Phân trang sổ quỹ không hợp lệ.");
    const page = (page: typeof data.income) => ({ ...page, rows: page.rows.map((raw: Record<string, unknown>) => {
      const row = mapCashbookRow(raw); return { id: row.id, date: row.date || "", time: row.time || "", type: row.type,
        actorId: row.actor_id || "", actorName: row.actor_name || "", reason: row.reason || "", content: row.content || "", storeId: row.store_id || "", storeName: row.store_name || "",
        amount: row.amount ?? null, contractId: row.order_id && /^[1-9]\d{0,14}$/.test(row.order_id) ? row.order_id : "", contractCode: row.contract_code || "", paymentMethod: row.payment_method || "", account: row.account || "" };
    }) });
    const result = { ...data, income: page(data.income), expense: page(data.expense) };
    if (!isCashbookPage(result)) throw new MobileError("Số tổng hợp hoặc phiếu sổ quỹ chưa hợp lệ. Tải lại để đối chiếu.", 503, "INVALID_CASHBOOK_DATA");
    return result;
  });
}
function accountRow(raw: Record<string, unknown>): MobileCashbookAccount {
  const row = mapCashbookAccount(raw);
  const result: MobileCashbookAccount = { id: Number(row.id), kind: row.kind, revision: String(raw.revision), label: row.label, storeId: row.store_id === undefined ? null : Number(row.store_id), storeName: row.store_name || "",
    ownerType: row.owner_type, status: row.status.toLowerCase() === "active" ? "active" : "inactive", name: row.name || "", bankName: row.bank_name || "", ownerName: row.owner_name || "", accountNumber: row.account_number || "",
    opening: row.opening_balance, income: row.income, expense: row.expense, balance: row.balance, voucherCount: row.voucher_count };
  if (!isCashbookAccount(result)) throw new MobileError("Thông tin tài khoản hoặc số dư chưa hợp lệ.", 503, "INVALID_ACCOUNT_DATA");
  return result;
}
export async function exportMobileCashbook(user: SessionUser, raw: URLSearchParams): Promise<MobileFileExport> {
  const params=new URLSearchParams(raw),format=params.get('format')||'csv';
  if(params.getAll('format').length>1||!['csv','xlsx'].includes(format))throw new MobileError('Định dạng xuất chưa hợp lệ.');
  params.delete('format');
  allowed(user); paramsOnly(params, ["store_id", "actor", "from", "to", "search"]); dateRange(params);
  return transaction(user, true, async client => {
    await client.query("SET LOCAL statement_timeout='60s'");
    const filters = new URLSearchParams(params); filters.set("mode", "all");
    const rows = await listCashbook(filters, client);
    if (!Array.isArray(rows)) throw new MobileError("Chưa đọc được dữ liệu xuất sổ quỹ.", 503);
    if(format==='xlsx'){
      const values=rows.map(row=>mapCashbookRow({...row,created_at:row.created_at instanceof Date?row.created_at.toISOString():row.created_at}));
      return mobileFilteredWorkbook(`himoto-so-quy-${new Date().toISOString().slice(0,10)}`,CASHBOOK_COLUMNS.map(c=>c.label),values.map(row=>CASHBOOK_COLUMNS.map(c=>c.key==='amount'?row.amount:cashbookCell(row,c.key))));
    }
    return { filename: `himoto-so-quy-${new Date().toISOString().replace(/\D/g, "")}.csv`, mimeType: "text/csv", content: "\uFEFF" + cashbookCsv(rows.map(row => mapCashbookRow({ ...row, created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at }))), rowCount: rows.length };
  });
}
function canDeleteVouchers(user: SessionUser) {
  allowed(user);
  // Web /bulk-delete/transactions requires settings.write, not finance.write.
  if (!hasPermission(user, "settings.write")) throw new MobileError("Tài khoản không có quyền xóa phiếu sổ quỹ.", 403, "FORBIDDEN");
}
export async function readMobileVoucherDeleteSelection(user: SessionUser, params: URLSearchParams): Promise<VoucherDeleteSelection> {
  canDeleteVouchers(user); paramsOnly(params, ["store_id", "actor", "from", "to", "search", "type"]); dateRange(params);
  const type = params.get("type");
  if (type !== "income" && type !== "expense") throw new MobileError("Chọn loại phiếu cần xóa.");
  return transaction(user, true, async client => {
    await client.query("SET LOCAL statement_timeout='60s'");
    const filters = new URLSearchParams(params); filters.set("mode", "ids");
    const rows = await listCashbook(filters, client);
    if (!Array.isArray(rows)) throw new MobileError("Chưa đọc được danh sách phiếu cần xóa.", 503);
    const selected = rows.map(row => ({ id: String(row.id), amount: Number(row.amount) }));
    if (selected.some(row => !/^[1-9]\d{0,14}$/.test(row.id) || !Number.isFinite(row.amount))) throw new MobileError("Số tiền hoặc mã phiếu chưa hợp lệ. Tải lại để đối chiếu.", 503);
    return { type, rows: selected };
  });
}
function deletion(key: string, count: number, version: string, replayed: boolean): VoucherDeletion {
  const result = { key, operation: CASHBOOK_DELETE_OPERATION, deletedCount: count, receiptVersion: Number(version), replayed };
  if (!isVoucherDeletion(result)) throw new MobileError("Chưa xác minh được số phiếu đã xóa. Giữ mã để đối chiếu.", 503, "INVALID_WRITE_RECEIPT");
  return result;
}
export async function deleteMobileVouchers(user: SessionUser, request: NextRequest): Promise<VoucherDeletion> {
  canDeleteVouchers(user); const key = mobileRequestKey(request.headers.get("Idempotency-Key"));
  if (request.nextUrl.searchParams.size) throw new MobileError("Yêu cầu xóa phiếu không hợp lệ.");
  const body = await mobileBody(request);
  if (Object.keys(body).some(field => field !== "ids")) throw new MobileError("Danh sách phiếu không hợp lệ.");
  return transaction(user, false, async client => {
    const { ids } = parseBulkDelete("transactions", body); ids.sort((a, b) => a - b);
    // This batch has no surviving business row. For cashbook.delete ONLY,
    // ledger resource_id stores confirmed row count; resource_revision is the
    // receipt format version. Neither value identifies a transaction record.
    // The fingerprint pins the original complete sorted ID set.
    const receipt = await idempotentMobileWrite(client, user.id, key, CASHBOOK_DELETE_OPERATION, { ids }, async () => {
      const removed = await bulkDelete(client, "transactions", ids);
      return { id: removed.length, revision: "1" };
    });
    return deletion(key, receipt.id, receipt.revision, receipt.replayed);
  });
}
export async function readMobileVoucherDeletion(user: SessionUser, key: string): Promise<VoucherDeletion> {
  canDeleteVouchers(user); mobileRequestKey(key);
  return transaction(user, true, async client => {
    const row = (await client.query("SELECT resource_id,resource_revision FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2 AND operation=$3", [user.id, key, CASHBOOK_DELETE_OPERATION])).rows[0];
    if (!row?.resource_id) throw new MobileError("Chưa có xác nhận xóa phiếu. Giữ mã để đối chiếu.", 404, "NOT_FOUND");
    return deletion(key, Number(row.resource_id), String(row.resource_revision), true);
  });
}
async function profile(client: PoolClient, kind: CashbookAccountKind, id: number) {
  const row = (await client.query(`${CASHBOOK_ACCOUNTS_SQL} WHERE a.kind=$1 AND a.id=$2`, [kind, id])).rows[0];
  return row ? accountRow(row) : null;
}
export async function readMobileCashbookAccounts(user: SessionUser, params: URLSearchParams) {
  allowed(user); paramsOnly(params, ["store_id", "status"]);
  const store = params.get("store_id") || "all", status = params.get("status") || "active";
  if (store !== "all" && !/^[1-9]\d{0,14}$/.test(store) || !["active", "inactive", "all"].includes(status)) throw new MobileError("Bộ lọc tài khoản không hợp lệ.");
  return transaction(user, true, async client => {
    const rows = (await client.query(`${CASHBOOK_ACCOUNTS_SQL} ORDER BY a.kind,a.id`)).rows.map(accountRow);
    return { rows: rows.filter(row => (store === "all" || String(row.storeId) === store || row.ownerType === "company" && !row.storeId) && (status === "all" || status === row.status)) };
  });
}
export async function readMobileCashbookAccount(user: SessionUser, rawKind: string, rawId: string) {
  allowed(user); const kind = mobileCashbookKind(rawKind), id = accountId(rawId);
  return transaction(user, true, async client => {
    const row = await profile(client, kind, id);
    if (!row) throw new MobileError("Tài khoản không tồn tại hoặc ngoài phạm vi truy cập.", 404, "NOT_FOUND");
    return row;
  });
}
export async function readMobileCashbookOptions(user: SessionUser) {
  allowed(user, true);
  return transaction(user, true, async client => ({ stores: (await client.query("SELECT id,store_name FROM himoto.stores ORDER BY store_name,id")).rows.map(row => ({ id: Number(row.id), name: String(row.store_name || "") })) }));
}
export async function readMobileCashbookTransactions(user: SessionUser, rawKind: string, rawId: string, params: URLSearchParams): Promise<MobileCashbookTransactions> {
  allowed(user); const kind = mobileCashbookKind(rawKind), id = accountId(rawId); paramsOnly(params, ["from", "to"]); const { from, to } = dateRange(params);
  return transaction(user, true, async client => {
    if (!await profile(client, kind, id)) throw new MobileError("Tài khoản không còn trong phạm vi truy cập.", 404, "NOT_FOUND");
    const rows = await readDatabaseCashbookTransactions(client, kind, id, from, to);
    return { kind, id, sourceLimit: 2000, rows: rows.map(row => ({ id: String(row.id), ...{ date: "", time: "", ...cashbookDateTime(row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at) },
      type: row.type === "out" ? "expense" : "income", amount: Number(row.amount ?? 0), actorName: String(row.user_name || ""), contractCode: String(row.contract_code || ""), content: String(row.content || "") })) };
  });
}
export async function saveMobileCashbookAccount(user: SessionUser, rawKind: string, rawId: string | null, action: "create" | "update" | "status" | "delete", request: NextRequest) {
  allowed(user, true); const kind = mobileCashbookKind(rawKind), id = rawId === null ? null : accountId(rawId), key = mobileRequestKey(request.headers.get("Idempotency-Key"));
  if ((action === "create") !== (id === null) || request.nextUrl.searchParams.size) throw new MobileError("Thao tác tài khoản không hợp lệ.");
  const body = await mobileBody(request, 12288), fields = action === "status" ? ["revision", "status"] : action === "delete" ? ["revision"] : ["status", "opening_balance", "store_id", "owner_type", "name", "bank_name", "owner_name", "account_number", ...(id === null ? [] : ["revision"])];
  if (Object.keys(body).some(field => !fields.includes(field)) || id !== null && (typeof body.revision !== "string" || !/^[1-9]\d{0,19}$/.test(body.revision))) throw new MobileError("Thông tin hoặc phiên bản tài khoản không hợp lệ.");
  return transaction(user, false, async client => {
    const values = action === "create" || action === "update" ? await parseCashbookAccount(client, kind, body) : { revision: body.revision, ...(action === "status" ? { status: body.status } : {}) };
    const operation = id === null ? `${kind}.create` : `${kind}.${action}:${id}`;
    return idempotentMobileWrite(client, user.id, key, operation, { ...values, ...(id === null ? {} : { revision: body.revision }) }, async () => {
      const table = kind === "cash" ? "cash" : "banks";
      if (id !== null) {
        const before = (await client.query(`SELECT xmin::text AS revision FROM himoto.${table} WHERE id=$1 FOR UPDATE`, [id])).rows[0];
        if (!before) throw new CashbookAccountError("Không tìm thấy tài khoản trong phạm vi hiện tại.", 404);
        if (String(before.revision) !== body.revision) throw new CashbookAccountError("Tài khoản đã thay đổi. Tải lại trước khi lưu.", 409);
        if (action === "delete") { await deleteDatabaseCashbookAccount(client, kind, id); return { id, revision: String(before.revision) }; }
        if (action === "status") await setDatabaseCashbookAccountStatus(client, kind, id, body.status);
      }
      const saved = action === "status" ? { id: id! } : await saveDatabaseCashbookAccount(client, kind, values as Awaited<ReturnType<typeof parseCashbookAccount>>, id ?? undefined);
      const row = (await client.query(`SELECT id,xmin::text AS revision FROM himoto.${table} WHERE id=$1`, [saved.id])).rows[0];
      if (!row) throw new MobileError("Chưa xác nhận được tài khoản đã lưu. Giữ mã để đối chiếu.", 503);
      return { id: Number(row.id), revision: String(row.revision) };
    });
  });
}
export async function readMobileCashbookAccountResult(user: SessionUser, key: string): Promise<MobileCashbookAccountResult> {
  allowed(user); mobileRequestKey(key);
  return transaction(user, true, async client => {
    const row = (await client.query("SELECT operation,resource_id,resource_revision FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2 AND operation ~ '^(bank|cash)[.](create|(update|status|delete):[1-9][0-9]*)$'", [user.id, key])).rows[0];
    if (!row?.resource_id) throw new MobileError("Chưa có xác nhận tài khoản. Giữ mã để đối chiếu.", 404, "NOT_FOUND");
    const kind = mobileCashbookKind(String(row.operation).split(".")[0]), current = await profile(client, kind, Number(row.resource_id));
    if (!current && !String(row.operation).includes(".delete:")) throw new MobileError("Tài khoản không còn trong phạm vi truy cập. Giữ mã để đối chiếu.", 403, "FORBIDDEN");
    return { key, kind, operation: String(row.operation), receipt: { id: Number(row.resource_id), revision: String(row.resource_revision), replayed: true }, current, deleted: !current };
  });
}
