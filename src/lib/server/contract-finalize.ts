import 'server-only';
import type { PoolClient } from 'pg';
import { MAX_PAYMENT_AMOUNT, PAYMENT_METHODS, paymentAccounts } from '@/lib/management/contract-payments';
import type { FinalizeInput, FinalizeReceipt, FinalizeResult } from '@/lib/management/contract-finalize';
import { readPaymentContext } from './contract-payments';

type Database = Pick<PoolClient, 'query'>;
export class ContractFinalizeError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const OPEN_STATUSES = ['renting', 'overdue', 'wait_payment', 'pending', 'deposit_contract'];
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const validLocal = (value: unknown): value is string => typeof value === 'string' && LOCAL_DATE_TIME.test(value)
  && new Date(new Date(`${value}+07:00`).getTime() + 7 * 3600000).toISOString().slice(0, 16) === value;
const amountOf = (value: unknown) => {
  const text = value == null ? '' : String(value).trim();
  if (text === '') return 0;
  const number = Number(text);
  return /^\d+$/.test(text) && Number.isSafeInteger(number) && number <= MAX_PAYMENT_AMOUNT ? number : null;
};

function parseReceipt(value: unknown, label: string): FinalizeReceipt | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ContractFinalizeError(`Thông tin nhận ${label} không hợp lệ.`);
  const receipt = value as Record<string, unknown>;
  if (Object.keys(receipt).some(key => !['method', 'account_id'].includes(key)) || !PAYMENT_METHODS.some(method => method.value === receipt.method) ||
      !Number.isSafeInteger(receipt.account_id) || Number(receipt.account_id) <= 0) throw new ContractFinalizeError(`Chọn hình thức và tài khoản nhận ${label}.`);
  return { method: receipt.method as FinalizeReceipt['method'], account_id: Number(receipt.account_id) };
}

export function parseFinalizeInput(body: unknown): FinalizeInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ContractFinalizeError('Thông tin lưu chính thức không hợp lệ.');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['revision', 'paid_at', 'deposit', 'rental'].includes(key)) || !('deposit' in input) || !('rental' in input) ||
      typeof input.revision !== 'string' || !/^\d{1,20}$/.test(input.revision)) throw new ContractFinalizeError('Thông tin lưu chính thức không hợp lệ.');
  if (!validLocal(input.paid_at) || new Date(`${input.paid_at}+07:00`).getTime() > Date.now() + 5 * 60000) throw new ContractFinalizeError('Ngày giờ thu tiền không hợp lệ hoặc nằm trong tương lai.');
  return { revision: input.revision, paid_at: input.paid_at, deposit: parseReceipt(input.deposit, 'tiền cọc'), rental: parseReceipt(input.rental, 'tiền thuê') };
}

// Caller owns BEGIN/COMMIT/ROLLBACK: contract number, vehicle lines, vehicle
// status and receipts are written together or not at all.
export async function finalizeContractDraft(client: Database, id: number, actorId: number, input: FinalizeInput): Promise<FinalizeResult> {
  input = parseFinalizeInput(input);
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(actorId) || actorId <= 0) throw new ContractFinalizeError('Hợp đồng hoặc người thực hiện không hợp lệ.');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '15s'");
  const locked = await client.query(`SELECT id, order_status, store_id, customer_id, contract_number, draft_reference, draft_payload, xmin::text AS revision
    FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [id]);
  const order = locked.rows[0];
  if (!order) throw new ContractFinalizeError('Không tìm thấy bản nháp.', 404);
  if (order.order_status !== 'draft') throw new ContractFinalizeError('Hợp đồng này không còn là bản nháp (có thể đã được lưu chính thức).', 409);
  if (order.revision !== input.revision) throw new ContractFinalizeError('Bản nháp đã thay đổi. Đóng form, Làm mới rồi thử lại.', 409);

  const payload = order.draft_payload && typeof order.draft_payload === 'object' ? order.draft_payload as Record<string, unknown> : {};
  const composer = payload.management_composer && typeof payload.management_composer === 'object' ? payload.management_composer as Record<string, unknown> : {};
  const draft = composer.draft && typeof composer.draft === 'object' ? composer.draft as Record<string, unknown> : null;
  if (!draft) throw new ContractFinalizeError('Bản nháp chưa có thông tin hợp đồng. Lưu nháp lại trước khi lưu chính thức.', 409);
  const storeId = Number(order.store_id), customerId = Number(order.customer_id);
  if (!Number.isSafeInteger(storeId) || storeId <= 0) throw new ContractFinalizeError('Bản nháp chưa chọn cơ sở.', 409);
  if (!Number.isSafeInteger(customerId) || customerId <= 0) throw new ContractFinalizeError('Bản nháp chưa có khách hàng.', 409);
  const start = draft.start_date, end = draft.end_date;
  if (!validLocal(start) || !validLocal(end) || end <= start) throw new ContractFinalizeError('Thời gian thuê / hẹn trả của bản nháp không hợp lệ.', 409);
  const lines = Array.isArray(draft.vehicles) ? draft.vehicles as Record<string, unknown>[] : [];
  const vehicleIds = lines.map(line => Number(line?.id));
  if (!lines.length || vehicleIds.some(value => !Number.isSafeInteger(value) || value <= 0) || new Set(vehicleIds).size !== vehicleIds.length) throw new ContractFinalizeError('Bản nháp cần chọn đủ xe, không trùng xe.', 409);
  const total = amountOf(draft.total_amount), deposit = amountOf(draft.deposit_amount), unitPrice = amountOf(draft.unit_price);
  if (total === null || deposit === null || unitPrice === null || total + deposit > MAX_PAYMENT_AMOUNT) throw new ContractFinalizeError('Số tiền thuê / tiền cọc của bản nháp không hợp lệ.', 409);
  if (deposit === 0 && input.deposit) throw new ContractFinalizeError('Bản nháp không có tiền cọc để ghi phiếu thu.');
  if (total === 0 && input.rental) throw new ContractFinalizeError('Bản nháp không có tiền thuê để ghi phiếu thu.');

  const vehicles = await client.query(`SELECT id, license, status, COALESCE(current_store_id, store_id) AS store_id FROM himoto.vehicles WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE`, [vehicleIds]);
  if (vehicles.rowCount !== vehicleIds.length) throw new ContractFinalizeError('Có xe trong bản nháp không còn tồn tại.', 409);
  const wrongStore = vehicles.rows.find(row => Number(row.store_id) !== storeId);
  if (wrongStore) throw new ContractFinalizeError(`Xe ${wrongStore.license} không thuộc cơ sở của hợp đồng.`, 409);
  const conflicts = await client.query(`SELECT v.license, COALESCE(NULLIF(o.contract_number,''), NULLIF(o.draft_reference,''), '#' || o.id::text) AS code
    FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id JOIN himoto.vehicles v ON v.id=d.vehicle_id
    WHERE d.vehicle_id = ANY($1::bigint[]) AND d.order_id <> $2 AND d.completed_at IS NULL AND d.deleted_at IS NULL
      AND o.deleted_at IS NULL AND o.order_status = ANY($3::text[]) ORDER BY v.license`, [vehicleIds, id, OPEN_STATUSES]);
  if (conflicts.rowCount) throw new ContractFinalizeError(`Không thể lưu chính thức: ${conflicts.rows.map(row => `xe ${row.license} đang thuộc hợp đồng ${row.code}`).join('; ')} chưa trả xe.`, 409);
  const notStored = vehicles.rows.filter(row => row.status !== 'ready');
  if (notStored.length) throw new ContractFinalizeError(`Chỉ cho thuê xe đang Lưu kho: ${notStored.map(row => row.license).join(', ')} đang ở trạng thái khác.`, 409);
  // The legacy app pre-created an empty line per draft (no money, not returned, no receipt). Those
  // placeholders are retired here; any legacy line carrying money or receipts still needs review.
  const existing = await client.query(`SELECT d.id, COALESCE(d.total_money, 0) AS total_money, COALESCE(d.total_renewal_amount, 0) AS renewal_amount, d.completed_at,
      EXISTS (SELECT 1 FROM himoto.transactions t WHERE t.order_item_id = d.id) AS has_receipt
    FROM himoto.order_vehicle_details d WHERE d.order_id=$1 AND d.deleted_at IS NULL ORDER BY d.id FOR UPDATE OF d`, [id]);
  if (existing.rows.some(row => Number(row.total_money) !== 0 || Number(row.renewal_amount) !== 0 || row.completed_at || row.has_receipt)) {
    throw new ContractFinalizeError('Bản nháp đã có dòng xe từ hệ thống cũ có tiền hoặc phiếu thu. Cần đối chiếu trước khi lưu chính thức.', 409);
  }
  const retiredItemIds = existing.rows.map(row => Number(row.id));
  if (retiredItemIds.length) await client.query('UPDATE himoto.order_vehicle_details SET deleted_at=now(), updated_at=now() WHERE id = ANY($1::bigint[])', [retiredItemIds]);

  const context = await readPaymentContext(client, id);
  async function account(receipt: FinalizeReceipt | null, label: string) {
    if (!receipt) return null;
    await client.query(`SELECT id FROM himoto.${receipt.method === 'cash' ? 'cash' : 'banks'} WHERE id=$1 FOR SHARE`, [receipt.account_id]);
    const found = paymentAccounts(context, receipt.method).find(row => row.id === receipt.account_id);
    if (!found) throw new ContractFinalizeError(`Tài khoản nhận ${label} không hoạt động hoặc không thuộc cơ sở.`, 409);
    return found;
  }
  const depositAccount = await account(input.deposit, 'tiền cọc');
  const rentalAccount = await account(input.rental, 'tiền thuê');

  let code = String(order.contract_number || '').trim();
  if (!code) {
    const day = (await client.query(`SELECT to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') AS day`)).rows[0].day as string;
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`contract-number:${day}`]);
    const last = await client.query(`SELECT COALESCE(max(substring(contract_number from 8)::int), 0) AS last FROM himoto.orders WHERE contract_number ~ ('^' || $1 || '-[0-9]{4}$')`, [day]);
    code = `${day}-${String(Number(last.rows[0].last) + 1).padStart(4, '0')}`;
  }

  const startAt = `${start}:00+07:00`, endAt = `${end}:00+07:00`;
  const type = draft.package_name === 'Theo tháng' ? 'month' : 'day';
  const rentalDays = Math.max(Math.ceil((new Date(endAt).getTime() - new Date(startAt).getTime()) / 86_400_000), 1);
  const hiringFee = unitPrice || (type === 'day' && total ? Math.round(total / rentalDays / lines.length) : 0);
  const itemIds: number[] = [];
  for (const [index, line] of lines.entries()) {
    const text = (key: string) => typeof line[key] === 'string' && String(line[key]).trim() ? String(line[key]).trim() : null;
    const count = (key: string) => /^\d{1,2}$/.test(String(line[key] ?? '')) ? Number(line[key]) : 0;
    const inserted = await client.query(`INSERT INTO himoto.order_vehicle_details
      (vehicle_id, order_id, price_id, borrow_hats, borrow_raincoats, rent_at, return_at, total_money, hiring_fee, status, type, handler_price,
       total_renewal_amount, driver_name, driver_license_number, driver_license_issued_on, created_at, updated_at)
      VALUES ($1,$2,0,$3,$4,$5,$6,$7,$8,1,$9,0,0,$10,$11,$12,now(),now()) RETURNING id`,
    [vehicleIds[index], id, count('borrow_hats'), count('borrow_raincoats'), startAt, endAt, index === 0 ? total : 0, hiringFee, type,
      text('driver_name'), text('driver_license_number'), /^\d{4}-\d{2}-\d{2}$/.test(String(line.driver_license_issued_on ?? '')) ? line.driver_license_issued_on : null]);
    itemIds.push(Number(inserted.rows[0].id));
  }

  const transactionIds: number[] = [];
  async function receipt(found: Awaited<ReturnType<typeof account>>, amount: number, name: string, note: string) {
    if (!found || amount <= 0) return 0;
    const row = await client.query(`INSERT INTO himoto.transactions
      (order_id,created_at,updated_at,name,type,value,note,status,user_id,store_id,bank_id,cash_id,payment_method,bank_owner_type,object_type,object_id)
      VALUES ($1,$2,now(),$3,'in',$4,$5,'approved',$6,$7,$8,$9,$10,$11,'order',$1) RETURNING id`,
    [id, `${input.paid_at}:00+07:00`, name, amount, note, actorId, storeId, found.kind === 'bank' ? found.id : null, found.kind === 'cash' ? found.id : null,
      found.kind === 'cash' ? 1 : 2, found.kind === 'bank' ? found.owner_type : null]);
    transactionIds.push(Number(row.rows[0].id));
    return amount;
  }
  const paid = await receipt(depositAccount, deposit, 'order:deposit', `Thu tiền cọc hợp đồng ${code}`)
    + await receipt(rentalAccount, total, 'order:rental_fees', `Thu tiền thuê xe hợp đồng ${code}`);

  const finalized = { at: new Date().toISOString(), actor_id: actorId, contract_number: code, item_ids: itemIds, transaction_ids: transactionIds,
    ...(retiredItemIds.length ? { retired_legacy_item_ids: retiredItemIds } : {}) };
  await client.query(`UPDATE himoto.orders SET order_status='renting', order_mode='standard', contract_number=$2,
      contract_issued_at=now() AT TIME ZONE 'Asia/Ho_Chi_Minh', rent_at=$3, return_at=$4, total=$5, total_rental_fees=$6, first_deposit_amount=$7,
      pid=$8, created_without_collect_deposit=$9, created_without_collect_rental_fees=$10, draft_payload=$11, updated_at=now()
    WHERE id=$1`, [id, code, startAt, endAt, String(total), total, deposit || null, paid, deposit > 0 && !depositAccount, total > 0 && !rentalAccount,
    JSON.stringify({ ...payload, management_composer: { ...composer, finalized } })]);
  await client.query(`UPDATE himoto.vehicles SET status='using', updated_at=now() WHERE id = ANY($1::bigint[])`, [vehicleIds]);
  return { order_id: id, code, total_amount: total, deposit_amount: deposit, paid_amount: paid, transaction_ids: transactionIds };
}
