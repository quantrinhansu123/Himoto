import 'server-only';
import { hasPermission } from '@/lib/management/permissions';
import { readContractQr, SePayError } from './sepay';
import { ContractPaymentError } from './contract-payments';
import { withMobileData } from './mobile-context';
import { himotoPool } from './himoto-database';
import type { SessionUser } from './management-session';
import { mobileContractId } from './mobile-contracts';
import { MobileError } from './mobile-session';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import { isMobileContractQr, type MobileContractQr } from '../../../shared/mobile-contract-qr';
export async function readMobileContractQr(user: SessionUser, value: string, params: URLSearchParams): Promise<MobileContractQr> {
  if (!hasPermission(user, 'contracts.read')) throw new MobileError('Tài khoản chưa được cấp quyền xem hợp đồng.', 403, 'FORBIDDEN');
  const id = mobileContractId(value), amount = params.get('amount'), bankId = params.get('account_id');
  if ([...params.keys()].some(k => !['amount', 'account_id'].includes(k) || params.getAll(k).length !== 1) || amount !== null && !/^(0|[1-9]\d{0,12})$/.test(amount) || bankId !== null && !/^[1-9]\d{0,14}$/.test(bankId)) throw new MobileError('Số tiền hoặc tài khoản nhận QR chưa hợp lệ.');
  return withMobileData(user, '', async () => {
    const client = await himotoPool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); await client.query("SET LOCAL statement_timeout='20s'");
      if (!(await client.query(`SELECT o.id FROM himoto.orders o WHERE o.id=$1 AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}`, [id])).rowCount) throw new MobileError('Không tìm thấy hợp đồng trong phạm vi tài khoản.', 404, 'NOT_FOUND');
      const raw = await readContractQr(client, id, amount === null ? undefined : Number(amount), bankId === null ? undefined : Number(bankId));
      const p = { id: raw.id, code: raw.code, configured: raw.configured, mode: raw.mode, amount: raw.amount, total: raw.total, paid: raw.paid,
        bank: raw.bank ? { bankCode: raw.bank.bank_code, accountNumber: raw.bank.account_number, accountName: raw.bank.account_name } : null, bankId: raw.bank_id ?? null,
        accounts: (raw.accounts || []).map(a => ({ id: a.id, bankCode: a.bank_code, accountNumber: a.account_number, accountName: a.account_name, ownerType: a.owner_type })),
        memo: raw.memo, qrUrl: raw.qr_url, receivedDemo: raw.received_demo, eventVersion: raw.event_version, configurationMessage: raw.configuration_message || '' };
      if (!isMobileContractQr(p)) throw new MobileError('Thông tin QR cần đối chiếu trên web.', 409, 'QR_REVIEW_REQUIRED');
      await client.query('COMMIT'); return p;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error instanceof SePayError || error instanceof ContractPaymentError) throw new MobileError(error.message, error.status, 'INVALID_CONTRACT_QR'); throw error;
    } finally { client.release(); }
  });
}
