import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { dailyPriceSql, DEPOSIT_REFUND_NAME, depositLateral, rentalPaidSql } from './contract-deposits';
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
  if (Object.keys(input).some(key => !['request_id', 'revision', 'amount', 'method', 'account_id', 'paid_at', 'note', 'purpose', 'item_id', 'item_revision', 'return_at', 'items'].includes(key)) ||
      typeof input.request_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.request_id) ||
      typeof input.revision !== 'string' || !/^\d{1,20}$/.test(input.revision) ||
      typeof input.amount !== 'string' || !/^[1-9]\d{0,12}$/.test(input.amount) || money(input.amount) === null ||
      !PAYMENT_METHODS.some(method => method.value === input.method) || !Number.isSafeInteger(input.account_id) || Number(input.account_id) <= 0 ||
      typeof input.note !== 'string' || input.note.trim().length > 2000 || typeof input.paid_at !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.paid_at)) throw new ContractPaymentError('Kiểm tra số tiền nguyên VNĐ, hình thức, tài khoản, ngày giờ và ghi chú thanh toán.');
  const date = new Date(`${input.paid_at}+07:00`);
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 16) !== input.paid_at || date.getTime() > Date.now() + 5 * 60000) throw new ContractPaymentError('Ngày giờ thu tiền không hợp lệ hoặc nằm trong tương lai.');
  const renewal = input.purpose === 'renewal', extra = input.purpose === 'extra', refund = input.purpose === 'deposit_refund';
  if (input.purpose !== undefined && !renewal && !extra && !refund) throw new ContractPaymentError('Nghiệp vụ thanh toán không hợp lệ.');
  if (!renewal && ['item_id', 'item_revision', 'return_at', 'items'].some(key => key in input)) throw new ContractPaymentError('Chỉ truyền xe và ngày hẹn trả khi thu tiền gia hạn.');
  if (extra && !input.note.trim()) throw new ContractPaymentError('Nhập nội dung cho phiếu thu thêm.');
  const base = { request_id: input.request_id.toLowerCase(), revision: input.revision, amount: input.amount, method: input.method as PaymentInput['method'], account_id: Number(input.account_id), paid_at: input.paid_at, note: input.note.trim() };
  if (renewal) {
    const validReturn = (value: unknown) => {
      const returnAt = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? new Date(`${value}+07:00`) : null;
      return Boolean(returnAt && Number.isFinite(returnAt.getTime()) && new Date(returnAt.getTime() + 7 * 3600000).toISOString().slice(0, 16) === value);
    };
    const validItem = (item: Record<string, unknown>) => Number.isSafeInteger(item.item_id) && Number(item.item_id) > 0 && typeof item.item_revision === 'string' && /^\d{1,20}$/.test(item.item_revision) && validReturn(item.return_at);
    if ('items' in input) {
      const items = input.items;
      if ('item_id' in input || 'item_revision' in input || 'return_at' in input || !Array.isArray(items) || !items.length || items.length > 20 ||
          items.some(item => !item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['item_id', 'item_revision', 'return_at', 'amount'].includes(key)) ||
            !validItem(item as Record<string, unknown>) || typeof (item as Record<string, unknown>).amount !== 'string' || !/^(0|[1-9]\d{0,12})$/.test(String((item as Record<string, unknown>).amount))) ||
          new Set(items.map(item => (item as Record<string, unknown>).item_id)).size !== items.length) throw new ContractPaymentError('Chọn xe, phiên bản chi tiết xe và ngày hẹn trả mới hợp lệ.');
      const lines = items.map(item => ({ item_id: Number(item.item_id), item_revision: String(item.item_revision), return_at: String(item.return_at), amount: String(item.amount) }));
      if (lines.reduce((sum, item) => sum + Number(item.amount), 0) !== Number(input.amount)) throw new ContractPaymentError('Tổng tiền gia hạn từng xe phải bằng số tiền thu.');
      return { ...base, purpose: 'renewal', items: lines };
    }
    if (!validItem(input)) throw new ContractPaymentError('Chọn xe, phiên bản chi tiết xe và ngày hẹn trả mới hợp lệ.');
    return { ...base, purpose: 'renewal', item_id: Number(input.item_id), item_revision: String(input.item_revision), return_at: String(input.return_at) };
  }
  return { ...base, ...(extra ? { purpose: 'extra' as const } : refund ? { purpose: 'deposit_refund' as const } : {}) };
}
const renewalLines = (input: PaymentInput) => input.items
  ?? (input.item_id ? [{ item_id: input.item_id, item_revision: String(input.item_revision), return_at: String(input.return_at), amount: input.amount }] : []);
export async function readPaymentContext(client: Database, id: number): Promise<PaymentContext> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new ContractPaymentError('Mã hợp đồng không hợp lệ.');
  const result = await client.query(`SELECT o.id, COALESCE(NULLIF(o.contract_number,''), o.draft_reference, '#' || o.id::text) AS code,
      CASE WHEN o.order_status='renting' AND COALESCE(o.return_at,(SELECT max(d.return_at) FROM himoto.order_vehicle_details d WHERE d.order_id=o.id AND d.deleted_at IS NULL)) < now() THEN 'overdue' ELSE o.order_status END AS status,
      o.store_id, o.total, ${rentalPaidSql()} AS rental_paid, dep.paid AS deposit_paid, dep.refunded AS deposit_refunded, o.xmin::text AS revision,
      COALESCE(o.return_at,(SELECT max(d.return_at) FROM himoto.order_vehicle_details d WHERE d.order_id=o.id AND d.deleted_at IS NULL)) AS end_date
    FROM himoto.orders o ${depositLateral()} WHERE o.id=$1 AND o.deleted_at IS NULL`, [id]);
  if (!result.rowCount) throw new ContractPaymentError('Không tìm thấy hợp đồng.', 404);
  const order = result.rows[0], total = money(order.total), paid = money(order.rental_paid);
  const depositPaid = money(order.deposit_paid) ?? 0, depositRefunded = money(order.deposit_refunded) ?? 0;
  const accounts = await client.query(`SELECT id, 'bank' AS kind, store_id, owner_type,bank_name,account_number,owner_name,
      bank_name || ' · ' || owner_name || ' · ' || account_number AS label
    FROM himoto.banks WHERE lower(status) = 'active' AND account_type IN (0,1) AND (store_id=$1 OR owner_type='company')
    UNION ALL SELECT id, 'cash' AS kind, store_id, '' AS owner_type,NULL AS bank_name,NULL AS account_number,NULL AS owner_name,COALESCE(NULLIF(name,''),'Két tiền mặt #' || id::text) AS label
    FROM himoto.cash WHERE lower(status)='active' AND store_id=$1 ORDER BY kind,id`, [order.store_id]);
  const history = await client.query(`SELECT t.id,t.type,t.name,t.value AS amount,t.created_at AS paid_at,t.note,u.name AS actor,
      CASE WHEN t.cash_id IS NOT NULL THEN 'Tiền mặt' WHEN t.bank_owner_type='company' THEN 'CK tài khoản công ty'
        WHEN t.bank_id IS NOT NULL THEN 'Chuyển khoản' ELSE 'Chưa xác định' END AS method,
      CASE WHEN t.cash_id IS NOT NULL THEN COALESCE(NULLIF(cb.name,''),'Két tiền mặt #' || t.cash_id::text)
        ELSE b.bank_name || ' · ' || b.owner_name || ' · ' || b.account_number END AS account,
      t.bank_owner_type,r.renewal_payload
    FROM himoto.transactions t LEFT JOIN himoto.users u ON u.id=t.user_id LEFT JOIN himoto.banks b ON b.id=t.bank_id LEFT JOIN himoto.cash cb ON cb.id=t.cash_id
    LEFT JOIN himoto.management_contract_payments r ON r.transaction_id=t.id
    WHERE t.order_id=$1 AND t.type IN ('in','addon','out') AND t.status='approved' ORDER BY t.created_at DESC,t.id DESC`, [id]);
  const company = history.rows.filter(row => row.type !== 'out' && row.bank_owner_type === 'company');
  const items = await client.query(`SELECT d.id,d.vehicle_id,v.name,v.license,
      ${dailyPriceSql()} AS daily_price,d.return_at,d.total_renewal_amount,d.xmin::text AS revision
    FROM himoto.order_vehicle_details d JOIN himoto.vehicles v ON v.id=d.vehicle_id JOIN himoto.orders o ON o.id=d.order_id
    WHERE d.order_id=$1 AND d.deleted_at IS NULL AND d.completed_at IS NULL ORDER BY d.id`, [id]);
  return { id: Number(order.id), code: String(order.code), status: String(order.status), store_id: Number(order.store_id), revision: String(order.revision),
    total_amount: total, paid_amount: paid, remaining: total === null || paid === null ? null : Math.max(total - paid, 0),
    deposit_paid: depositPaid, deposit_refunded: depositRefunded, deposit_held: Math.max(depositPaid - depositRefunded, 0),
    company_paid_amount: company.reduce((sum, row) => sum + Number(row.amount), 0), company_payment_count: company.length,
    end_date: order.end_date instanceof Date ? order.end_date.toISOString() : order.end_date == null ? null : String(order.end_date),
    items: items.rows.map(row => ({ id: Number(row.id), vehicle_id: Number(row.vehicle_id), name: String(row.name || ''), license: String(row.license || ''), revision: String(row.revision),
      return_at: row.return_at instanceof Date ? row.return_at.toISOString() : row.return_at == null ? null : String(row.return_at), renewal_amount: row.total_renewal_amount == null ? 0 : money(row.total_renewal_amount),
      daily_price: row.daily_price == null ? null : money(row.daily_price) })),
    accounts: accounts.rows.map(row => ({ ...row, id: Number(row.id), store_id: Number(row.store_id) })),
    history: history.rows.map(row => ({ id: Number(row.id), type: row.type === 'out' ? 'out' as const : 'in' as const,
      deposit: row.name === 'order:deposit' || String(row.name || '').startsWith('order:deposit:') || row.name === DEPOSIT_REFUND_NAME || String(row.name || '').startsWith('order:complete:'), amount: Number(row.amount), paid_at: row.paid_at instanceof Date ? row.paid_at.toISOString() : String(row.paid_at),
      note: String(row.note || ''), actor: String(row.actor || ''), method: String(row.method), account: String(row.account || ''), renewal: row.renewal_payload || null })) };
}

// Caller owns BEGIN/COMMIT. The receipt, income and paid total are atomic.
export async function recordContractPayment(client: Database, id: number, actorId: number, input: PaymentInput) {
  input = parseContractPayment(input);
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(actorId) || actorId <= 0) throw new ContractPaymentError('Hợp đồng hoặc người thực hiện không hợp lệ.');
  const renewal = input.purpose === 'renewal', extra = input.purpose === 'extra', refund = input.purpose === 'deposit_refund';
  const fingerprint = createHash('sha256').update(JSON.stringify({ id, actorId, amount: input.amount, method: input.method, account_id: input.account_id, paid_at: input.paid_at, note: input.note,
    ...(renewal ? { purpose: input.purpose, ...(input.items ? { items: input.items.map(item => [item.item_id, item.return_at, item.amount]) } : { item_id: input.item_id, return_at: input.return_at }) }
      : extra || refund ? { purpose: input.purpose } : {}) })).digest('hex');
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
  const amount = Number(input.amount);
  if (refund) {
    if (!canAddExtraReceipt(context.status)) throw new ContractPaymentError('Không trả cọc cho hợp đồng nháp hoặc đã hủy.', 409);
    if (amount > context.deposit_held) throw new ContractPaymentError(`Số tiền trả cọc vượt tiền cọc đang giữ (${context.deposit_held.toLocaleString('vi-VN')} đ).`, 409);
  } else {
    if (extra ? !canAddExtraReceipt(context.status) : !PAYABLE_STATUSES.includes(context.status)) throw new ContractPaymentError(extra ? 'Không thêm phiếu thu cho hợp đồng nháp hoặc đã hủy.' : 'Chỉ thu tiền cho hợp đồng đang thuê, quá hạn, chờ thanh toán hoặc nợ xấu.', 409);
    if (context.remaining === null || context.paid_amount === null || context.total_amount === null) throw new ContractPaymentError('Thiếu hoặc sai số liệu tiền hợp đồng/tổng đã thu. Cần đối chiếu trước khi thanh toán.', 409);
    if (context.paid_amount + amount > MAX_PAYMENT_AMOUNT) throw new ContractPaymentError('Tổng đã thu vượt giới hạn lưu trữ.', 409);
    if (extra && context.total_amount + amount > MAX_PAYMENT_AMOUNT) throw new ContractPaymentError('Tiền hợp đồng vượt giới hạn lưu trữ.', 409);
    if (!renewal && !extra && amount > context.remaining) throw new ContractPaymentError('Số tiền thu vượt phần còn thiếu của hợp đồng.', 409);
  }
  const lines = renewal ? renewalLines(input) : [];
  let renewalPayload: Record<string, unknown> | null = null;
  if (renewal) {
    if (!RENEWABLE_STATUSES.includes(context.status)) throw new ContractPaymentError('Chỉ gia hạn hợp đồng đang thuê hoặc quá hạn.', 409);
    if (context.total_amount === null || context.paid_amount === null || context.total_amount + amount > MAX_PAYMENT_AMOUNT) throw new ContractPaymentError('Tiền gia hạn hoặc tổng phí chưa hợp lệ / vượt giới hạn lưu trữ.', 409);
    const renewed = [];
    for (const line of lines) {
      const detail = await client.query(`SELECT xmin::text AS revision FROM himoto.order_vehicle_details
        WHERE id=$1 AND order_id=$2 AND completed_at IS NULL AND deleted_at IS NULL FOR UPDATE`, [line.item_id, id]);
      const item = context.items.find(row => row.id === line.item_id);
      if (!detail.rowCount || !item || detail.rows[0].revision !== line.item_revision) throw new ContractPaymentError('Xe đã thay đổi, đã trả hoặc không thuộc hợp đồng. Tải lại trước khi gia hạn.', 409);
      if (!item.return_at || !Number.isFinite(new Date(item.return_at).getTime()) || new Date(`${line.return_at}+07:00`).getTime() <= new Date(item.return_at).getTime()) throw new ContractPaymentError(`Ngày hẹn trả mới của xe ${item.license || item.name} phải sau ngày hẹn trả hiện tại.`, 409);
      const lineAmount = Number(line.amount);
      if (item.renewal_amount === null || item.renewal_amount + lineAmount > MAX_PAYMENT_AMOUNT) throw new ContractPaymentError('Tiền gia hạn hoặc tổng phí chưa hợp lệ / vượt giới hạn lưu trữ.', 409);
      renewed.push({ item_id: item.id, vehicle_id: item.vehicle_id, vehicle_name: item.name, license: item.license,
        before_return_at: item.return_at, return_at: `${line.return_at}:00+07:00`,
        before_renewal_amount: item.renewal_amount, renewal_amount: item.renewal_amount + lineAmount, amount: lineAmount });
    }
    const totals = { amount, before_total: context.total_amount, total: context.total_amount + amount, before_paid: context.paid_amount, paid: context.paid_amount + amount };
    renewalPayload = renewed.length === 1 ? { ...renewed[0], ...totals }
      : { ...totals, items: renewed, license: renewed.map(item => item.license || item.vehicle_name).join(', '), vehicle_name: renewed.map(item => item.vehicle_name).join(', '),
        return_at: renewed.map(item => item.return_at).sort().at(-1) };
  }
  // Lock and recheck the chosen account so concurrent edits cannot change its ownership/scope.
  const accountTable = input.method === 'cash' ? 'cash' : 'banks';
  await client.query(`SELECT id FROM himoto.${accountTable} WHERE id=$1 FOR SHARE`, [input.account_id]);
  const refreshed = await readPaymentContext(client, id);
  const account = paymentAccounts(refreshed, input.method).find(row => row.id === input.account_id);
  if (!account) throw new ContractPaymentError('Tài khoản nhận không hoạt động, sai cơ sở hoặc chưa được xác định là tài khoản công ty.', 409);
  const company = input.method === 'company_transfer';
  const singleItem = lines.length === 1 ? lines[0].item_id : null;
  const transaction = await client.query(`INSERT INTO himoto.transactions
    (order_id,created_at,updated_at,name,type,value,note,status,user_id,store_id,bank_id,cash_id,payment_method,bank_owner_type,object_type,object_id,order_item_id)
    VALUES ($1,$2,now(),$11,$15,$3,$4,'approved',$5,$6,$7,$8,$9,$10,$12,$13,$14) RETURNING id`,
    [id, `${input.paid_at}:00+07:00`, amount, input.note || (refund ? `Trả cọc hợp đồng_${context.code}` : `Gia hạn hợp đồng_${context.code}`), actorId, context.store_id,
      account.kind === 'bank' ? account.id : null, account.kind === 'cash' ? account.id : null,
      account.kind === 'cash' ? 1 : 2, account.kind === 'bank' ? account.owner_type : null,
      renewal ? 'order:renewal' : extra ? 'order:extra' : refund ? DEPOSIT_REFUND_NAME : 'order:payment',
      singleItem ? 'line_item_id' : 'order', singleItem ?? id, singleItem, refund ? 'out' : 'in']);
  const transactionId = Number(transaction.rows[0].id);
  if (renewal) {
    for (const line of lines) await client.query(`UPDATE himoto.order_vehicle_details SET return_at=$3::timestamptz,
      total_renewal_amount=COALESCE(total_renewal_amount,0)+$4,updated_at=now() WHERE id=$1 AND order_id=$2`, [line.item_id,id,`${line.return_at}:00+07:00`,Number(line.amount)]);
    await client.query(`UPDATE himoto.orders SET pid=pid+$2,total=(total::numeric+$2)::text,
      return_at=CASE WHEN return_at IS NULL THEN NULL ELSE GREATEST(return_at,
        (SELECT max(d.return_at) FROM himoto.order_vehicle_details d WHERE d.order_id=$1 AND d.deleted_at IS NULL)) END,
      updated_at=now() WHERE id=$1`, [id,amount]);
  } else if (extra) await client.query('UPDATE himoto.orders SET pid=pid+$2,total=(total::numeric+$2)::text,updated_at=now() WHERE id=$1', [id, amount]);
  else if (refund) await client.query('UPDATE himoto.orders SET updated_at=now() WHERE id=$1', [id]);
  else await client.query('UPDATE himoto.orders SET pid=pid+$2,updated_at=now() WHERE id=$1', [id, amount]);
  await client.query(`INSERT INTO himoto.management_contract_payments(request_id,order_id,transaction_id,actor_id,request_hash,renewal_payload)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [input.request_id, id, transactionId, actorId, fingerprint, renewalPayload ? JSON.stringify(renewalPayload) : null]);
  return { context: await readPaymentContext(client, id), transaction_id: transactionId, replayed: false, company_transfer: company };
}
