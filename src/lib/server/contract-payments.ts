import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { MAX_PAYMENT_AMOUNT, PAYABLE_STATUSES, canAddExtraReceipt, RENEWABLE_STATUSES, PAYMENT_METHODS, PaymentContext, PaymentInput, paymentAccounts } from '@/lib/management/contract-payments';

type Database = Pick<PoolClient, 'query'>;
export class ContractPaymentError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function money(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number <= MAX_PAYMENT_AMOUNT ? number : null;
}
export function parseContractPayment(body: unknown): PaymentInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ContractPaymentError('Thông tin thanh toán không hợp lệ.');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['request_id', 'revision', 'amount', 'method', 'account_id', 'paid_at', 'note', 'purpose', 'item_id', 'item_revision', 'return_at'].includes(key)) ||
      typeof input.request_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.request_id) ||
      typeof input.revision !== 'string' || !/^\d{1,20}$/.test(input.revision) ||
      typeof input.amount !== 'string' || !/^[1-9]\d{0,12}$/.test(input.amount) || money(input.amount) === null ||
      !PAYMENT_METHODS.some(method => method.value === input.method) || !Number.isSafeInteger(input.account_id) || Number(input.account_id) <= 0 ||
      typeof input.note !== 'string' || input.note.trim().length > 2000 || typeof input.paid_at !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.paid_at)) throw new ContractPaymentError('Kiểm tra số tiền nguyên VNĐ, hình thức, tài khoản, ngày giờ và ghi chú thanh toán.');
  const date = new Date(`${input.paid_at}+07:00`);
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 16) !== input.paid_at || date.getTime() > Date.now() + 5 * 60000) throw new ContractPaymentError('Ngày giờ thu tiền không hợp lệ hoặc nằm trong tương lai.');
  const renewal = input.purpose === 'renewal', extra = input.purpose === 'extra';
  if (input.purpose !== undefined && !renewal && !extra) throw new ContractPaymentError('Nghiệp vụ thanh toán không hợp lệ.');
  if (!renewal && ['item_id', 'item_revision', 'return_at'].some(key => key in input)) throw new ContractPaymentError('Chỉ truyền xe và ngày hẹn trả khi thu tiền gia hạn.');
  if (extra && !input.note.trim()) throw new ContractPaymentError('Nhập nội dung cho phiếu thu thêm.');
  if (renewal) {
    const returnAt = typeof input.return_at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.return_at) ? new Date(`${input.return_at}+07:00`) : null;
    if (!Number.isSafeInteger(input.item_id) || Number(input.item_id) <= 0 || typeof input.item_revision !== 'string' || !/^\d{1,20}$/.test(input.item_revision) ||
        !returnAt || !Number.isFinite(returnAt.getTime()) || new Date(returnAt.getTime() + 7 * 3600000).toISOString().slice(0,16) !== input.return_at) throw new ContractPaymentError('Chọn xe, phiên bản chi tiết xe và ngày hẹn trả mới hợp lệ.');
  }
  return { request_id: input.request_id.toLowerCase(), revision: input.revision, amount: input.amount, method: input.method as PaymentInput['method'], account_id: Number(input.account_id), paid_at: input.paid_at, note: input.note.trim(),
    ...(renewal ? { purpose: 'renewal' as const, item_id: Number(input.item_id), item_revision: String(input.item_revision), return_at: String(input.return_at) } : extra ? { purpose: 'extra' as const } : {}) };
}
export async function readPaymentContext(client: Database, id: number): Promise<PaymentContext> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new ContractPaymentError('Mã hợp đồng không hợp lệ.');
  const result = await client.query(`SELECT o.id, COALESCE(NULLIF(o.contract_number,''), o.draft_reference, '#' || o.id::text) AS code,
      CASE WHEN o.order_status='renting' AND COALESCE(o.return_at,(SELECT max(d.return_at) FROM himoto.order_vehicle_details d WHERE d.order_id=o.id AND d.deleted_at IS NULL)) < now() THEN 'overdue' ELSE o.order_status END AS status,
      o.store_id, o.total, o.pid, o.xmin::text AS revision,
      COALESCE(o.return_at,(SELECT max(d.return_at) FROM himoto.order_vehicle_details d WHERE d.order_id=o.id AND d.deleted_at IS NULL)) AS end_date
    FROM himoto.orders o WHERE o.id=$1 AND o.deleted_at IS NULL`, [id]);
  if (!result.rowCount) throw new ContractPaymentError('Không tìm thấy hợp đồng.', 404);
  const order = result.rows[0], total = money(order.total), paid = money(order.pid);
  const accounts = await client.query(`SELECT id, 'bank' AS kind, store_id, owner_type,bank_name,account_number,owner_name,
      bank_name || ' · ' || owner_name || ' · ' || account_number AS label
    FROM himoto.banks WHERE lower(status) = 'active' AND account_type IN (0,1) AND (store_id=$1 OR owner_type='company')
    UNION ALL SELECT id, 'cash' AS kind, store_id, '' AS owner_type,NULL AS bank_name,NULL AS account_number,NULL AS owner_name,'Két tiền mặt #' || id::text AS label
    FROM himoto.cash WHERE lower(status)='active' AND store_id=$1 ORDER BY kind,id`, [order.store_id]);
  const history = await client.query(`SELECT t.id,t.value AS amount,t.created_at AS paid_at,t.note,u.name AS actor,
      CASE WHEN t.cash_id IS NOT NULL THEN 'Tiền mặt' WHEN t.bank_owner_type='company' THEN 'CK tài khoản công ty'
        WHEN t.bank_id IS NOT NULL THEN 'Chuyển khoản' ELSE 'Chưa xác định' END AS method,
      CASE WHEN t.cash_id IS NOT NULL THEN 'Két tiền mặt #' || t.cash_id::text
        ELSE b.bank_name || ' · ' || b.owner_name || ' · ' || b.account_number END AS account,
      t.bank_owner_type,r.renewal_payload
    FROM himoto.transactions t LEFT JOIN himoto.users u ON u.id=t.user_id LEFT JOIN himoto.banks b ON b.id=t.bank_id
    LEFT JOIN himoto.management_contract_payments r ON r.transaction_id=t.id
    WHERE t.order_id=$1 AND t.type IN ('in','addon') AND t.status='approved' ORDER BY t.created_at DESC,t.id DESC`, [id]);
  const company = history.rows.filter(row => row.bank_owner_type === 'company');
  const items = await client.query(`SELECT d.id,d.vehicle_id,v.name,v.license,NULL::numeric AS daily_price,d.return_at,d.total_renewal_amount,d.xmin::text AS revision
    FROM himoto.order_vehicle_details d JOIN himoto.vehicles v ON v.id=d.vehicle_id
    WHERE d.order_id=$1 AND d.deleted_at IS NULL AND d.completed_at IS NULL ORDER BY d.id`, [id]);
  return { id: Number(order.id), code: String(order.code), status: String(order.status), store_id: Number(order.store_id), revision: String(order.revision),
    total_amount: total, paid_amount: paid, remaining: total === null || paid === null ? null : Math.max(total - paid, 0),
    company_paid_amount: company.reduce((sum, row) => sum + Number(row.amount), 0), company_payment_count: company.length,
    end_date: order.end_date instanceof Date ? order.end_date.toISOString() : order.end_date == null ? null : String(order.end_date),
    items: items.rows.map(row => ({ id: Number(row.id), vehicle_id: Number(row.vehicle_id), name: String(row.name || ''), license: String(row.license || ''), revision: String(row.revision),
      return_at: row.return_at instanceof Date ? row.return_at.toISOString() : row.return_at == null ? null : String(row.return_at), renewal_amount: row.total_renewal_amount == null ? 0 : money(row.total_renewal_amount),
      daily_price: row.daily_price == null ? null : money(row.daily_price) })),
    accounts: accounts.rows.map(row => ({ ...row, id: Number(row.id), store_id: Number(row.store_id) })),
    history: history.rows.map(row => ({ id: Number(row.id), amount: Number(row.amount), paid_at: row.paid_at instanceof Date ? row.paid_at.toISOString() : String(row.paid_at),
      note: String(row.note || ''), actor: String(row.actor || ''), method: String(row.method), account: String(row.account || ''), renewal: row.renewal_payload || null })) };
}

// Caller owns BEGIN/COMMIT. The receipt, income and paid total are atomic.
export async function recordContractPayment(client: Database, id: number, actorId: number, input: PaymentInput) {
  input = parseContractPayment(input);
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(actorId) || actorId <= 0) throw new ContractPaymentError('Hợp đồng hoặc người thực hiện không hợp lệ.');
  const renewal = input.purpose === 'renewal', extra = input.purpose === 'extra';
  const fingerprint = createHash('sha256').update(JSON.stringify({ id, actorId, amount: input.amount, method: input.method, account_id: input.account_id, paid_at: input.paid_at, note: input.note,
    ...(renewal ? { purpose: input.purpose, item_id: input.item_id, return_at: input.return_at } : extra ? { purpose: input.purpose } : {}) })).digest('hex');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '15s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`contract-payment:${input.request_id}`]);
  const receipt = await client.query('SELECT request_hash, transaction_id FROM himoto.management_contract_payments WHERE request_id=$1', [input.request_id]);
  if (receipt.rowCount) {
    if (receipt.rows[0].request_hash !== fingerprint) throw new ContractPaymentError('Mã lần thanh toán đã dùng cho thông tin khác. Kiểm tra lịch sử trước khi tạo lần mới.', 409);
    return { context: await readPaymentContext(client, id), transaction_id: Number(receipt.rows[0].transaction_id), replayed: true, company_transfer: input.method === 'company_transfer' };
  }
  await client.query('LOCK TABLE himoto.orders IN ROW EXCLUSIVE MODE');
  const locked = await client.query('SELECT xmin::text AS revision FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [id]);
  if (!locked.rowCount) throw new ContractPaymentError('Không tìm thấy hợp đồng.', 404);
  if (locked.rows[0].revision !== input.revision) throw new ContractPaymentError('Hợp đồng hoặc tổng đã thu đã thay đổi. Tải lại thông tin trước khi thanh toán.', 409);
  const context = await readPaymentContext(client, id);
  if (extra ? !canAddExtraReceipt(context.status) : !PAYABLE_STATUSES.includes(context.status)) throw new ContractPaymentError(extra ? 'Không thêm phiếu thu cho hợp đồng nháp hoặc đã hủy.' : 'Chỉ thu tiền cho hợp đồng đang thuê, quá hạn, chờ thanh toán hoặc nợ xấu.', 409);
  if (context.remaining === null || context.paid_amount === null || context.total_amount === null) throw new ContractPaymentError('Thiếu hoặc sai số liệu tiền hợp đồng/tổng đã thu. Cần đối chiếu trước khi thanh toán.', 409);
  const amount = Number(input.amount);
  let renewalPayload = null;
  if (context.paid_amount + amount > MAX_PAYMENT_AMOUNT) throw new ContractPaymentError('Tổng đã thu vượt giới hạn lưu trữ.', 409);
  if (extra && context.total_amount + amount > MAX_PAYMENT_AMOUNT) throw new ContractPaymentError('Tiền hợp đồng vượt giới hạn lưu trữ.', 409);
  if (!renewal && !extra && amount > context.remaining) throw new ContractPaymentError('Số tiền thu vượt phần còn thiếu của hợp đồng.', 409);
  if (renewal) {
    if (!RENEWABLE_STATUSES.includes(context.status)) throw new ContractPaymentError('Chỉ gia hạn hợp đồng đang thuê hoặc quá hạn.', 409);
    const detail = await client.query(`SELECT xmin::text AS revision FROM himoto.order_vehicle_details
      WHERE id=$1 AND order_id=$2 AND completed_at IS NULL AND deleted_at IS NULL FOR UPDATE`, [input.item_id, id]);
    const item = context.items.find(row => row.id === input.item_id);
    if (!detail.rowCount || !item || detail.rows[0].revision !== input.item_revision) throw new ContractPaymentError('Xe đã thay đổi, đã trả hoặc không thuộc hợp đồng. Tải lại trước khi gia hạn.', 409);
    if (!item.return_at || !Number.isFinite(new Date(item.return_at).getTime()) || new Date(`${input.return_at}+07:00`).getTime() <= new Date(item.return_at).getTime()) throw new ContractPaymentError('Ngày hẹn trả mới phải sau ngày hẹn trả hiện tại của xe.', 409);
    if (item.renewal_amount === null || item.renewal_amount + amount > MAX_PAYMENT_AMOUNT || context.total_amount === null || context.total_amount + amount > MAX_PAYMENT_AMOUNT) throw new ContractPaymentError('Tiền gia hạn hoặc tổng phí chưa hợp lệ / vượt giới hạn lưu trữ.', 409);
    renewalPayload = { item_id: item.id, vehicle_id: item.vehicle_id, vehicle_name: item.name, license: item.license,
      before_return_at: item.return_at, return_at: `${input.return_at}:00+07:00`,
      before_renewal_amount: item.renewal_amount, renewal_amount: item.renewal_amount + amount, amount,
      before_total: context.total_amount, total: context.total_amount + amount, before_paid: context.paid_amount, paid: context.paid_amount + amount };
  }
  // Lock and recheck the chosen account so concurrent edits cannot change its ownership/scope.
  const accountTable = input.method === 'cash' ? 'cash' : 'banks';
  await client.query(`SELECT id FROM himoto.${accountTable} WHERE id=$1 FOR SHARE`, [input.account_id]);
  const refreshed = await readPaymentContext(client, id);
  const account = paymentAccounts(refreshed, input.method).find(row => row.id === input.account_id);
  if (!account) throw new ContractPaymentError('Tài khoản nhận không hoạt động, sai cơ sở hoặc chưa được xác định là tài khoản công ty.', 409);
  const company = input.method === 'company_transfer';
  const transaction = await client.query(`INSERT INTO himoto.transactions
    (order_id,created_at,updated_at,name,type,value,note,status,user_id,store_id,bank_id,cash_id,payment_method,bank_owner_type,object_type,object_id,order_item_id)
    VALUES ($1,$2,now(),$11,'in',$3,$4,'approved',$5,$6,$7,$8,$9,$10,$12,$13,$14) RETURNING id`,
    [id, `${input.paid_at}:00+07:00`, amount, input.note || `Gia hạn hợp đồng_${context.code}`, actorId, context.store_id,
      account.kind === 'bank' ? account.id : null, account.kind === 'cash' ? account.id : null,
      account.kind === 'cash' ? 1 : 2, account.kind === 'bank' ? account.owner_type : null,
      renewal ? 'order:renewal' : extra ? 'order:extra' : 'order:payment', renewal ? 'line_item_id' : 'order', renewal ? input.item_id : id, renewal ? input.item_id : null]);
  const transactionId = Number(transaction.rows[0].id);
  if (renewal) {
    await client.query(`UPDATE himoto.order_vehicle_details SET return_at=$3::timestamptz,
      total_renewal_amount=COALESCE(total_renewal_amount,0)+$4,updated_at=now() WHERE id=$1 AND order_id=$2`, [input.item_id,id,`${input.return_at}:00+07:00`,amount]);
    await client.query(`UPDATE himoto.orders SET pid=pid+$2,total=(total::numeric+$2)::text,
      return_at=CASE WHEN return_at IS NULL THEN NULL ELSE GREATEST(return_at,
        (SELECT max(d.return_at) FROM himoto.order_vehicle_details d WHERE d.order_id=$1 AND d.deleted_at IS NULL)) END,
      updated_at=now() WHERE id=$1`, [id,amount]);
  } else if (extra) await client.query('UPDATE himoto.orders SET pid=pid+$2,total=(total::numeric+$2)::text,updated_at=now() WHERE id=$1', [id, amount]);
  else await client.query('UPDATE himoto.orders SET pid=pid+$2,updated_at=now() WHERE id=$1', [id, amount]);
  await client.query(`INSERT INTO himoto.management_contract_payments(request_id,order_id,transaction_id,actor_id,request_hash,renewal_payload)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [input.request_id, id, transactionId, actorId, fingerprint, renewalPayload ? JSON.stringify(renewalPayload) : null]);
  return { context: await readPaymentContext(client, id), transaction_id: transactionId, replayed: false, company_transfer: company };
}
