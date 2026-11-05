import 'server-only';
import type { NextRequest } from 'next/server';
import type { PoolClient } from 'pg';
import { hasPermission } from '@/lib/management/permissions';
import { canEditIssuedContract } from '@/lib/management/contract-profile';
import { paymentAccounts, type PaymentContext } from '@/lib/management/contract-payments';
import { readReceiptCorrections, parseReceiptCorrection, updateReceiptCorrections } from './receipt-corrections';
import { parseRenewalPaymentCorrection, updateRenewalPayment } from './renewal-payment-corrections';
import { ContractPaymentError, readPaymentContext } from './contract-payments';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import { mobileContractId } from './mobile-contracts';
import { withMobileData } from './mobile-context';
import { himotoPool } from './himoto-database';
import type { SessionUser } from './management-session';
import { MobileError } from './mobile-session';
import { idempotentMobileWrite, mobileBody, mobileRequestKey } from './mobile-writes';
import { isMobileContractCorrectionResult, isMobileReceiptCorrections, isMobileRenewalCorrections, type MobileCorrectionKind, type MobileContractCorrectionResult } from '../../../shared/mobile-contract-corrections';

export function requireMobileCorrection(user: SessionUser, kind: MobileCorrectionKind) {
  const allowed = kind === 'receipts' ? canEditIssuedContract(user) || hasPermission(user, 'finance.write') : hasPermission(user, 'contracts.renew') || hasPermission(user, 'finance.write');
  if (!hasPermission(user, 'contracts.read') || !allowed) throw new MobileError('Tài khoản không có quyền sửa khoản thu này.', 403, 'FORBIDDEN');
}
async function transaction<T>(user: SessionUser, kind: MobileCorrectionKind, write: boolean, task: (client: PoolClient) => Promise<T>) {
  requireMobileCorrection(user, kind);
  return withMobileData(user, '', async () => {
    const client = await himotoPool.connect();
    try {
      await client.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout='20s'");
      await client.query("SET LOCAL lock_timeout='5s'");
      const result = await task(client); await client.query('COMMIT'); return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error instanceof ContractPaymentError) throw new MobileError(error.message, error.status, error.status === 409 ? 'CORRECTION_CONFLICT' : 'INVALID_CORRECTION');
      throw error;
    } finally { client.release(); }
  });
}
async function visible(client: PoolClient, id: number) {
  const row = (await client.query(`SELECT o.id,o.xmin::text AS revision FROM himoto.orders o WHERE o.id=$1 AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}`, [id])).rows[0];
  if (!row) throw new MobileError('Không tìm thấy hợp đồng trong phạm vi tài khoản.', 404, 'NOT_FOUND');
  return row;
}
const accounts = (context: Pick<PaymentContext, 'accounts' | 'store_id'>) => (['cash', 'transfer', 'company_transfer'] as const).flatMap(method => paymentAccounts(context as PaymentContext, method).map(a => ({ id: a.id, method, label: a.label })));
export async function readMobileReceiptCorrections(user: SessionUser, value: string) {
  const id = mobileContractId(value);
  return transaction(user, 'receipts', false, async client => {
    await visible(client, id);
    const state = await readReceiptCorrections(client, id, user), store = (await client.query('SELECT store_id FROM himoto.orders WHERE id=$1', [id])).rows[0];
    const result = { id, code: state.code, revision: state.revision, depositAmount: state.deposit_amount, receipts: state.receipts, accounts: accounts({ accounts: state.accounts, store_id: Number(store.store_id) }) };
    if (!isMobileReceiptCorrections(result)) throw new MobileError('Khoản thu cần kiểm tra dữ liệu trên web trước khi sửa.', 409, 'DATA_REVIEW_REQUIRED');
    return result;
  });
}
export async function readMobileRenewalCorrections(user: SessionUser, value: string) {
  const id = mobileContractId(value);
  return transaction(user, 'renewal', false, async client => {
    await visible(client, id);
    const context = await readPaymentContext(client, id), result = {
      id, code: context.code, revision: context.revision, status: context.status, totalAmount: context.total_amount, rentalPaid: context.paid_amount,
      accounts: accounts(context), receipts: context.history.filter(r => r.renewal && r.type === 'in' && !r.deposit).map(r => ({
        id: r.id, revision: r.revision, status: r.status, collectedAmount: r.amount, paidAt: r.paid_at,
        method: r.payment_method || null, accountId: r.account_id || null, account: r.account, feeEditable: r.renewal_fee_editable === true,
        amount: r.renewal?.amount == null ? null : Number(r.renewal.amount), beforeReturnAt: r.renewal?.before_return_at || null, returnAt: r.renewal?.return_at || null,
        version: r.renewal?.version == null ? null : Number(r.renewal.version), license: r.renewal?.license || '', vehicleName: r.renewal?.vehicle_name || '',
      })),
    };
    if (!isMobileRenewalCorrections(result)) throw new MobileError('Phiếu gia hạn cần kiểm tra dữ liệu trên web trước khi sửa.', 409, 'DATA_REVIEW_REQUIRED');
    return result;
  });
}
async function result(client: PoolClient, user: SessionUser, kind: MobileCorrectionKind, key: string): Promise<MobileContractCorrectionResult | null> {
  const row = (await client.query('SELECT operation,resource_id,resource_revision FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2', [user.id, key])).rows[0];
  if (!row || !String(row.operation).startsWith(`correction.${kind}:`) || row.resource_id == null) return null;
  const result = { key, operation: row.operation, receipt: { id: Number(row.resource_id), revision: String(row.resource_revision), replayed: true } };
  if (!isMobileContractCorrectionResult(result)) throw new MobileError('Kết quả sửa khoản thu cần đối chiếu.', 409, 'INVALID_WRITE_RECEIPT');
  await visible(client, result.receipt.id); return result;
}
export async function readMobileContractCorrectionResult(user: SessionUser, kind: MobileCorrectionKind, key: string) {
  mobileRequestKey(key); return transaction(user, kind, false, async client => ({ result: await result(client, user, kind, key) }));
}
export async function writeMobileContractCorrection(user: SessionUser, value: string, kind: MobileCorrectionKind, request: NextRequest): Promise<MobileContractCorrectionResult> {
  requireMobileCorrection(user, kind);
  const id = mobileContractId(value), key = mobileRequestKey(request.headers.get('idempotency-key')), body = await mobileBody(request, 524288);
  if ('request_id' in body) throw new MobileError('Mã lần sửa phải lấy từ yêu cầu đã giữ trên thiết bị.', 400, 'INVALID_CORRECTION');
  return transaction(user, kind, true, async client => {
    await visible(client, id);
    const parsed = kind === 'receipts' ? parseReceiptCorrection({ ...body, request_id: key }) : parseRenewalPaymentCorrection({ ...body, request_id: key });
    const receipt = await idempotentMobileWrite(client, user.id, key, `correction.${kind}:${id}`, { id, input: parsed }, async () => {
      if (kind === 'receipts') await updateReceiptCorrections(client, id, user, parsed);
      else await updateRenewalPayment(client, id, user.id, parsed as ReturnType<typeof parseRenewalPaymentCorrection>);
      return { id, revision: String((await visible(client, id)).revision) };
    });
    const found = await result(client, user, kind, key);
    if (!found) throw new MobileError('Chưa xác nhận được kết quả sửa. Giữ mã để đối chiếu.', 503, 'INVALID_WRITE_RECEIPT');
    return { ...found, receipt: { ...found.receipt, replayed: receipt.replayed } };
  });
}
