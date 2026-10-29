import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { PAYMENT_METHODS, findPaymentAccount, paymentAccountMatchesMethod, paymentMethodLabel, type RenewalPaymentCorrection } from '@/lib/management/contract-payments';
import { ContractPaymentError, readPaymentContext } from './contract-payments';

export function parseRenewalPaymentCorrection(body: unknown): RenewalPaymentCorrection {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ContractPaymentError('Thông tin sửa thanh toán không hợp lệ.');
  const value = body as Record<string, unknown>;
  const allowed = ['request_id','transaction_id','revision','method','account_id','reason','before_return_at','return_at'];
  if (Object.keys(value).some(key => !allowed.includes(key)) ||
    typeof value.request_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.request_id) ||
    !Number.isSafeInteger(Number(value.transaction_id)) || Number(value.transaction_id) <= 0 ||
    typeof value.revision !== 'string' || !/^\d{1,20}$/.test(value.revision) ||
    typeof value.reason !== 'string' || !value.reason.trim() || value.reason.trim().length > 500) {
    throw new ContractPaymentError('Thông tin sửa không hợp lệ hoặc thiếu lý do sửa (tối đa 500 ký tự).');
  }

  let method: RenewalPaymentCorrection['method'] | undefined;
  if (value.method !== undefined && value.method !== null) {
    if (!PAYMENT_METHODS.some(m => m.value === value.method)) throw new ContractPaymentError('Hình thức thanh toán không hợp lệ.');
    method = value.method as RenewalPaymentCorrection['method'];
  }

  let accountId: number | undefined;
  if (value.account_id !== undefined && value.account_id !== null) {
    if (!Number.isSafeInteger(value.account_id) || Number(value.account_id) <= 0) throw new ContractPaymentError('Tài khoản nhận không hợp lệ.');
    accountId = Number(value.account_id);
  }

  let beforeReturnAt: string | undefined;
  if (value.before_return_at !== undefined && value.before_return_at !== null && String(value.before_return_at).trim() !== '') {
    const parsed = Date.parse(String(value.before_return_at));
    if (!Number.isFinite(parsed)) throw new ContractPaymentError('Ngày giờ bắt đầu gia hạn không hợp lệ.');
    beforeReturnAt = new Date(parsed).toISOString();
  }

  let returnAt: string | undefined;
  if (value.return_at !== undefined && value.return_at !== null && String(value.return_at).trim() !== '') {
    const parsed = Date.parse(String(value.return_at));
    if (!Number.isFinite(parsed)) throw new ContractPaymentError('Ngày giờ kết thúc gia hạn không hợp lệ.');
    returnAt = new Date(parsed).toISOString();
  }

  if (beforeReturnAt && returnAt && Date.parse(returnAt) <= Date.parse(beforeReturnAt)) {
    throw new ContractPaymentError('Ngày hẹn trả mới phải sau ngày bắt đầu gia hạn.');
  }

  return {
    request_id: value.request_id.toLowerCase(),
    transaction_id: Number(value.transaction_id),
    revision: value.revision,
    method,
    account_id: accountId,
    reason: value.reason.trim(),
    before_return_at: beforeReturnAt,
    return_at: returnAt,
  };
}

// The caller owns BEGIN/COMMIT. Supports correcting payment routing and renewal period dates.
export async function updateRenewalPayment(db: Pick<PoolClient, 'query'>, orderId: number, actorId: number, raw: RenewalPaymentCorrection) {
  const input = parseRenewalPaymentCorrection(raw);
  if (![orderId,actorId].every(id => Number.isSafeInteger(id) && id > 0)) throw new ContractPaymentError('Hợp đồng hoặc người sửa không hợp lệ.');
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query("SET LOCAL statement_timeout='15s'");
  const order = (await db.query('SELECT store_id,order_status,draft_payload FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[orderId])).rows[0];
  if (!order) throw new ContractPaymentError('Không tìm thấy hợp đồng trong cơ sở được phân quyền.',404);
  const payload = structuredClone(order.draft_payload || {}), composer = payload.management_composer || {};
  const edits = Array.isArray(composer.payment_corrections) ? composer.payment_corrections : [];
  const hash = createHash('sha256').update(JSON.stringify({orderId,actorId,transaction:input.transaction_id,method:input.method,account:input.account_id,reason:input.reason,before_return_at:input.before_return_at,return_at:input.return_at})).digest('hex');
  const previous = edits.find((edit: {request_id: string}) => edit.request_id === input.request_id);
  if (previous) {
    if (previous.request_hash !== hash) throw new ContractPaymentError('Mã lần sửa đã dùng cho nội dung khác. Tải lại phiếu để kiểm tra.',409);
    return readPaymentContext(db,orderId);
  }
  if (['draft','cancelled'].includes(order.order_status)) throw new ContractPaymentError('Không sửa thanh toán của hợp đồng nháp hoặc đã hủy.',409);
  const receipt = (await db.query(`SELECT t.id,t.store_id,t.type,t.status,t.value,t.bank_id,t.cash_id,t.payment_method,t.bank_owner_type,
      t.xmin::text AS revision,p.renewal_payload
    FROM himoto.transactions t JOIN himoto.management_contract_payments p ON p.transaction_id=t.id AND p.order_id=t.order_id
    WHERE t.id=$1 AND t.order_id=$2 FOR UPDATE OF t`,[input.transaction_id,orderId])).rows[0];
  if (!receipt || !receipt.renewal_payload || !['in','addon'].includes(receipt.type) || !['approved','cancelled'].includes(receipt.status) || Number(receipt.value) <= 0 || Number(receipt.store_id) !== Number(order.store_id)) {
    throw new ContractPaymentError('Chỉ sửa thông tin gia hạn thuộc hợp đồng này.',409);
  }
  if (receipt.revision !== input.revision) throw new ContractPaymentError('Phiếu đã được cập nhật. Tải lại rồi sửa trên thông tin mới.',409);
  const eventKey = receipt.renewal_payload.version !== undefined ? `renewal:${orderId}:${receipt.renewal_payload.version}` : `renewal-receipt:${orderId}:${input.transaction_id}`;
  const notices = (await db.query(`SELECT status,message_ids,retraction FROM himoto.management_contract_notifications
    WHERE order_id=$1 AND (event_key=$2 OR root_event_key=$2) FOR UPDATE`,[orderId,eventKey])).rows;
  if (notices.some(notice => notice.retraction?.state !== 'done' && (['pending','sending','unknown'].includes(notice.status) ||
    notice.status === 'failed' && notice.message_ids?.length || notice.retraction))) {
    throw new ContractPaymentError('Telegram của lượt gia hạn đang gửi hoặc chưa đối chiếu xong. Xử lý lượt gửi trước khi sửa thanh toán.',409);
  }

  const context = await readPaymentContext(db,orderId);
  const old = context.history.find(row => row.id === input.transaction_id);

  // Check payment changes
  let paymentChanged = false;
  let afterPayment = {
    bank_id: receipt.bank_id,
    cash_id: receipt.cash_id,
    payment_method: receipt.payment_method,
    bank_owner_type: receipt.bank_owner_type,
    method: old?.method || '',
    account: old?.account || '',
  };
  if (input.method && input.account_id) {
    await db.query(`SELECT id FROM himoto.${input.method === 'cash' ? 'cash' : 'banks'} WHERE id=$1 FOR SHARE`,[input.account_id]);
    const account = findPaymentAccount(context,input.method,input.account_id);
    if (!account || !paymentAccountMatchesMethod(account,input.method)) throw new ContractPaymentError('Tài khoản nhận không hoạt động hoặc không khớp hình thức / cơ sở hợp đồng.',409);
    const cash = input.method === 'cash';
    const candidate = { bank_id: cash ? null : account.id, cash_id: cash ? account.id : null, payment_method: cash ? 1 : 2,
      bank_owner_type: cash ? null : input.method === 'company_transfer' ? 'company' : 'personal' };
    if (!(Number(receipt.bank_id || 0) === Number(candidate.bank_id || 0) && Number(receipt.cash_id || 0) === Number(candidate.cash_id || 0) &&
      Number(receipt.payment_method) === candidate.payment_method && receipt.bank_owner_type === candidate.bank_owner_type)) {
      paymentChanged = true;
      afterPayment = { ...candidate, method: paymentMethodLabel(input.method), account: account.label };
    }
  }

  // Check renewal period changes
  let periodChanged = false;
  const currentBefore = receipt.renewal_payload.before_return_at ? new Date(receipt.renewal_payload.before_return_at).toISOString() : null;
  const currentReturn = receipt.renewal_payload.return_at ? new Date(receipt.renewal_payload.return_at).toISOString() : null;
  const newBefore = input.before_return_at || currentBefore;
  const newReturn = input.return_at || currentReturn;

  if (newBefore !== currentBefore || newReturn !== currentReturn) {
    periodChanged = true;
  }

  if (!paymentChanged && !periodChanged) {
    throw new ContractPaymentError('Chưa có thông tin nào thay đổi (tài khoản nhận hoặc thời gian gia hạn).');
  }

  if (paymentChanged) {
    const changed = await db.query(`UPDATE himoto.transactions SET bank_id=$3,cash_id=$4,payment_method=$5,bank_owner_type=$6,updated_at=now()
      WHERE id=$1 AND order_id=$2 RETURNING id`,[input.transaction_id,orderId,afterPayment.bank_id,afterPayment.cash_id,afterPayment.payment_method,afterPayment.bank_owner_type]);
    if (changed.rowCount !== 1) throw new ContractPaymentError('Không cập nhật được phiếu trong cơ sở được phân quyền.',409);
  }

  if (periodChanged) {
    const updatedRenewalPayload = {
      ...receipt.renewal_payload,
      ...(newBefore ? { before_return_at: newBefore } : {}),
      ...(newReturn ? { return_at: newReturn } : {}),
    };
    await db.query(`UPDATE himoto.management_contract_payments SET renewal_payload=$3::jsonb WHERE transaction_id=$1 AND order_id=$2`,
      [input.transaction_id, orderId, JSON.stringify(updatedRenewalPayload)]);

    const renewalVersion = receipt.renewal_payload.version;
    if (renewalVersion !== undefined) {
      const existingVersions = Array.isArray(composer.versions) ? [...composer.versions] : [];
      const idx = existingVersions.findIndex((v: Record<string, unknown>) => v.kind === 'renewal' && Number(v.version) === Number(renewalVersion));
      const entry = {
        kind: 'renewal',
        version: renewalVersion,
        license: receipt.renewal_payload.license,
        vehicle_name: receipt.renewal_payload.vehicle_name,
        amount: Number(receipt.value),
        ...(newBefore ? { before_return_at: newBefore } : {}),
        ...(newReturn ? { return_at: newReturn } : {}),
      };
      if (idx >= 0) existingVersions[idx] = { ...existingVersions[idx], ...entry };
      else existingVersions.push(entry);
      composer.versions = existingVersions;
    }

    const itemId = receipt.renewal_payload.item_id;
    if (itemId && newReturn) {
      await db.query(`UPDATE himoto.order_vehicle_details SET return_at=$2, updated_at=now() WHERE id=$1 AND order_id=$3`,
        [itemId, newReturn, orderId]);
    }
  }

  payload.management_composer = { ...composer, payment_corrections: [...edits, {
    request_id: input.request_id, request_hash: hash, at: new Date().toISOString(), actor_id: actorId, reason: input.reason,
    transaction_id: input.transaction_id, renewal_version: receipt.renewal_payload.version ?? null, amount: Number(receipt.value),
    before: {
      bank_id: receipt.bank_id, cash_id: receipt.cash_id, payment_method: receipt.payment_method, bank_owner_type: receipt.bank_owner_type,
      method: old?.method || '', account: old?.account || '',
      before_return_at: currentBefore, return_at: currentReturn,
    },
    after: {
      ...afterPayment,
      before_return_at: newBefore, return_at: newReturn,
    },
  }] };
  await db.query('UPDATE himoto.orders SET draft_payload=$2::json,updated_at=now() WHERE id=$1',[orderId,JSON.stringify(payload)]);
  return readPaymentContext(db,orderId);
}
