import 'server-only';
import type { PoolClient } from 'pg';
import type { NextRequest } from 'next/server';
import { PAYMENT_METHODS, paymentAccounts, type PaymentContext } from '@/lib/management/contract-payments';
import { hasPermission } from '@/lib/management/permissions';
import {
  CONTRACT_OPERATION_PERMISSIONS, contractOperationKey, isContractOperationContext,
  type ContractOperation, type ContractOperationContext,
} from '../../../shared/mobile-contract-operations';
export { isContractOperation } from '../../../shared/mobile-contract-operations';
import { BatterySwapError, readBatterySwaps, writeBatterySwap } from './battery-swaps';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import { queueContractNotification } from './contract-notifications';
import { ContractPaymentError, readPaymentContext } from './contract-payments';
import { deleteDepositContract, ReservationDeleteError } from './contract-reservation-delete';
import { settleContract } from './contract-settlement';
import { himotoPool } from './himoto-database';
import type { SessionUser } from './management-session';
import { withMobileData, withMobileReadData } from './mobile-context';
import { mobileContractId } from './mobile-contracts';
import { MobileError } from './mobile-session';
import { idempotentMobileWrite, mobileBody, mobileRequestKey } from './mobile-writes';
import { closeReservationNoShow, ReservationNoShowError } from './reservation-no-show';

function transaction<T>(user: SessionUser, action: ContractOperation, write: boolean, run: (db: PoolClient) => Promise<T>) {
  if (!hasPermission(user, 'contracts.read') || (write || action !== 'battery_swap') && !hasPermission(user, CONTRACT_OPERATION_PERMISSIONS[action])) {
    throw new MobileError('Tài khoản chưa có quyền thao tác hợp đồng này.', 403, 'FORBIDDEN');
  }
  const scope = !write && action === 'battery_swap' ? withMobileReadData : withMobileData;
  return scope(user, '', async () => {
    const client = await himotoPool.connect();
    try {
      await client.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='20s'");
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error instanceof ContractPaymentError || error instanceof BatterySwapError ||
          error instanceof ReservationNoShowError || error instanceof ReservationDeleteError) {
        throw new MobileError(error.message, error.status, 'CONTRACT_OPERATION_REJECTED');
      }
      throw error;
    } finally { client.release(); }
  });
}

async function visible(client: PoolClient, id: number, includeDeleted = false) {
  const row = (await client.query(`SELECT id,store_id,order_status,xmin::text AS revision,
    COALESCE(NULLIF(contract_number,''),draft_reference,'#'||id::text) AS code,
    draft_payload #> '{management_composer,handover}' AS handover,
    draft_payload #> '{management_composer,lifecycle,bad_debt_closure}' IS NOT NULL AS closed_bad_debt
    FROM himoto.orders o WHERE id=$1 ${includeDeleted ? '' : 'AND deleted_at IS NULL'} AND ${VEHICLE_ORDER_SQL}`, [id])).rows[0];
  if (!row) throw new MobileError('Không tìm thấy hợp đồng trong phạm vi tài khoản.', 404, 'NOT_FOUND');
  return row;
}

function accounts(context: PaymentContext) {
  return PAYMENT_METHODS.flatMap(({ value: method }) => paymentAccounts(context, method).map(row => ({
    id: row.id, label: row.label, method,
  })));
}

export function readMobileContractOperation(user: SessionUser, value: string, action: ContractOperation): Promise<ContractOperationContext> {
  const id = mobileContractId(value);
  return transaction(user, action, false, async db => {
    const order = await visible(db, id);
    const common = { id, code: String(order.code), revision: String(order.revision), status: String(order.order_status), blocked_reason: '' };
    let result: ContractOperationContext;
    if (action === 'battery_swap') {
      const can_write = hasPermission(user, 'contracts.renew') && (user.scope_all === true || user.store_id === Number(order.store_id));
      const data = await readBatterySwaps(db, id);
      const payment = can_write && data.items.length ? await readPaymentContext(db, id, { page: 1, size: 0 }) : null;
      result = { ...common, action, can_write, accounts: payment ? accounts(payment) : [],
        items: data.items.map(row => ({ id: row.id, license: String(row.license ?? ''), name: String(row.name ?? '') })),
        swaps: data.swaps.map(row => {
          const swap = row as Record<string, unknown>;
          return {
            id: row.id, item_id: row.item_id, status: swap.status as 'draft' | 'confirmed', revision: String(swap.revision),
            license: String(swap.license ?? ''), battery_percent: swap.battery_percent == null ? null : Number(swap.battery_percent),
            fee: row.fee, confirmed_at: swap.confirmed_at ? new Date(String(swap.confirmed_at)).toISOString() : null,
          };
        }),
      };
    } else {
      const payment = await readPaymentContext(db, id, { page: 1, size: 0 });
      if (action === 'payment_settlement') {
        const remaining = payment.settlement_remaining ?? payment.remaining;
        const active = !payment.hold_active && !payment.completed_from_hold &&
          (['renting', 'overdue', 'wait_payment', 'bad_debt'].includes(payment.status) ||
            payment.status === 'completed' && (payment.payment_closed_at || order.closed_bad_debt) && Number(remaining) > 0);
        result = { ...common, action, status: payment.status, total: payment.settlement_total ?? payment.total_amount,
          paid: payment.paid_amount, held: payment.deposit_held, remaining,
          blocked_reason: active ? '' : 'Trạng thái hợp đồng hiện tại chưa cho phép thanh toán hoặc đóng.',
          items: payment.items.map(item => ({ id: item.id, name: item.name, license: item.license, revision: item.revision })),
          accounts: accounts(payment),
        };
      } else {
        const lines = (await db.query(`SELECT count(*) FILTER (WHERE completed_at IS NULL)::int AS open,
          count(*) FILTER (WHERE completed_at IS NOT NULL)::int AS finished,
          count(*) FILTER (WHERE completed_at IS NULL AND rent_at IS NULL)::int AS unscheduled,
          max(rent_at) FILTER (WHERE completed_at IS NULL) AS appointment
          FROM himoto.order_vehicle_details WHERE order_id=$1 AND deleted_at IS NULL`, [id])).rows[0];
        const appointment = lines.appointment ? new Date(lines.appointment).toISOString() : null;
        let blocked_reason = order.order_status !== 'deposit_contract' || order.handover ? 'Chỉ thao tác trên hợp đồng giữ xe chưa bàn giao.' : '';
        if (!blocked_reason && action === 'delete_reservation' && lines.finished) blocked_reason = 'Hợp đồng đã có lượt bàn giao. Không thể xóa giữ chỗ.';
        if (!blocked_reason && action === 'no_show') {
          if (!lines.open || lines.unscheduled || !appointment || Date.parse(appointment) > Date.now()) blocked_reason = 'Chưa đến giờ hẹn nhận xe.';
          else if (!payment.paid_amount || payment.paid_amount < 0 || payment.deposit_held > 0) blocked_reason = 'Cần đối chiếu tiền giữ xe và tiền cọc trước khi chốt.';
        }
        result = { ...common, action, paid: payment.paid_amount, appointment, blocked_reason };
      }
    }
    if (!isContractOperationContext(result)) throw new MobileError('Dữ liệu hợp đồng cần đối chiếu trước khi thao tác.', 409, 'DATA_REVIEW_REQUIRED');
    return result;
  });
}

export async function writeMobileContractOperation(user: SessionUser, value: string, action: ContractOperation, request: NextRequest) {
  const id = mobileContractId(value), key = mobileRequestKey(request.headers.get('Idempotency-Key'));
  const input = await mobileBody(request, action === 'payment_settlement' ? 32768 : 8192);
  return transaction(user, action, true, async db => {
    await visible(db, id, action === 'delete_reservation');
    return idempotentMobileWrite(db, user.id, key, contractOperationKey(action, id), { id, input }, async () => {
      if (action === 'battery_swap') {
        if ('request_id' in input || input.receipt && (typeof input.receipt !== 'object' || Array.isArray(input.receipt) || 'request_id' in input.receipt)) {
          throw new MobileError('Thông tin đổi pin không hợp lệ.');
        }
        const swap = await writeBatterySwap(db, id, user.id, {
          ...input, ...(input.action === 'prepare' ? { request_id: key } : {}),
          ...(input.receipt ? { receipt: { ...input.receipt, request_id: key } } : {}),
        });
        if (swap.status === 'confirmed') await queueContractNotification(db, id, 'battery_swap', `battery-swap:${id}:${swap.id}`, user.id, `battery-swap-${swap.id}`);
        return { id, revision: String(swap.id) };
      }
      if (action === 'no_show') await closeReservationNoShow(db, id, user.id, input);
      if (action === 'delete_reservation') {
        if (Object.keys(input).some(k => k !== 'revision')) throw new MobileError('Thông tin xóa hợp đồng cọc không hợp lệ.');
        await deleteDepositContract(db, id, input.revision, user.id);
      }
      if (action === 'payment_settlement') {
        if ('request_id' in input) throw new MobileError('Thông tin thanh toán không hợp lệ.');
        await settleContract(db, id, user.id, { ...input, request_id: key });
      }
      return { id, revision: String((await visible(db, id, action === 'delete_reservation')).revision) };
    });
  });
}
