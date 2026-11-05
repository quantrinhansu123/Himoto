import 'server-only';
import { hasPermission } from '@/lib/management/permissions';
import { readContractHistory, ContractHistoryError } from './contract-history';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import { mobileContractId } from './mobile-contracts';
import { withMobileData } from './mobile-context';
import { himotoPool } from './himoto-database';
import type { SessionUser } from './management-session';
import { MobileError } from './mobile-session';
import { isMobileContractHistory, type MobileContractHistory } from '../../../shared/mobile-contract-history';

/** Display only the web history projection, never its raw composer/audit blobs. */
export async function readMobileContractHistory(user: SessionUser, value: string, params: URLSearchParams): Promise<MobileContractHistory> {
  if (!hasPermission(user, 'contracts.read')) throw new MobileError('Tài khoản chưa được cấp quyền xem hợp đồng.', 403, 'FORBIDDEN');
  const id = mobileContractId(value), page = params.get('page') || '1', tab = params.get('tab') || 'changes', search = (params.get('search') || '').trim();
  if ([...params.keys()].some(k => !['page', 'tab', 'search'].includes(k) || params.getAll(k).length !== 1) || !/^[1-9]\d{0,5}$/.test(page) || !['changes', 'cashflow'].includes(tab) || search.length > 120) throw new MobileError('Bộ lọc lịch sử chưa hợp lệ.');
  return withMobileData(user, '', async () => {
    const client = await himotoPool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); await client.query("SET LOCAL statement_timeout='20s'");
      const order = (await client.query(`SELECT o.id,COALESCE(NULLIF(o.contract_number,''),o.draft_reference,'#'||o.id::text) AS code FROM himoto.orders o WHERE o.id=$1 AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}`, [id])).rows[0];
      if (!order) throw new MobileError('Không tìm thấy hợp đồng trong phạm vi tài khoản.', 404, 'NOT_FOUND');
      const data = await readContractHistory(client, id), needle = search.toLocaleLowerCase('vi');
      const changes = data.changes.map(c => ({ id: c.id, kind: c.kind, at: c.at, actor: c.actor, title: c.title, detail: c.detail, amount: c.amount,
        ...(c.version ? { version: { label: c.version.label, return_at: c.version.return_at, total: c.version.total, paid: c.version.paid } } : {}) }));
      const cashflow = data.cashflow.map(c => ({ id: c.id, at: c.at, type: c.type, reason: c.reason, note: c.note, amount: Number.isSafeInteger(c.amount) ? c.amount : null,
        method: c.method, account: c.account, actor: c.actor, status: c.status, status_code: c.status_code || '', category: c.category || 'other' }));
      const filteredChanges = changes.filter(c => !needle || `${c.title} ${c.detail} ${c.actor}`.toLocaleLowerCase('vi').includes(needle));
      const filteredCashflow = cashflow.filter(c => !needle || `#${c.id} ${c.reason} ${c.note} ${c.actor} ${c.account} ${c.status}`.toLocaleLowerCase('vi').includes(needle));
      const total = tab === 'changes' ? filteredChanges.length : filteredCashflow.length, pages = Math.max(1, Math.ceil(total / 25)), current = Math.min(Number(page), pages), offset = (current - 1) * 25;
      const receipts = data.receipts!;
      const result = { id, code: String(order.code), tab, search, page: current, pages, total, changeCount: changes.length, cashflowCount: cashflow.length,
        changes: tab === 'changes' ? filteredChanges.slice(offset, offset + 25) : [], cashflow: tab === 'cashflow' ? filteredCashflow.slice(offset, offset + 25) : [],
        receipts: { received: receipts.received, spent: receipts.spent, net: receipts.net, receipt_count: receipts.receipt_count, rental_received: receipts.rental_received,
          renewal_received: receipts.renewal_received, other_received: receipts.other_received, rental_refunded: receipts.rental_refunded, deposit_received: receipts.deposit_received, deposit_refunded: receipts.deposit_refunded, deposit_held: receipts.deposit_held } };
      if (!isMobileContractHistory(result)) throw new MobileError('Lịch sử có dữ liệu cần đối chiếu trên web.', 409, 'DATA_REVIEW_REQUIRED');
      await client.query('COMMIT'); return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error instanceof ContractHistoryError) throw new MobileError(error.message, error.status, 'INVALID_CONTRACT_HISTORY'); throw error;
    } finally { client.release(); }
  });
}
