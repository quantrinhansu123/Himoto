import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { MAX_PAYMENT_AMOUNT, PAYABLE_STATUSES, PAYMENT_METHODS, PaymentContext, PaymentInput, paymentAccounts } from '@/lib/management/contract-payments';

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
  if (Object.keys(input).some(key => !['request_id', 'revision', 'amount', 'method', 'account_id', 'paid_at', 'note'].includes(key)) ||
      typeof input.request_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.request_id) ||
      typeof input.revision !== 'string' || !/^\d{1,20}$/.test(input.revision) ||
      typeof input.amount !== 'string' || !/^[1-9]\d{0,12}$/.test(input.amount) || money(input.amount) === null ||
      !PAYMENT_METHODS.some(method => method.value === input.method) || !Number.isSafeInteger(input.account_id) || Number(input.account_id) <= 0 ||
      typeof input.note !== 'string' || input.note.trim().length > 2000 || typeof input.paid_at !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.paid_at)) throw new ContractPaymentError('Kiểm tra số tiền nguyên VNĐ, hình thức, tài khoản, ngày giờ và ghi chú thanh toán.');
  const date = new Date(`${input.paid_at}+07:00`);
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 16) !== input.paid_at || date.getTime() > Date.now() + 5 * 60000) throw new ContractPaymentError('Ngày giờ thu tiền không hợp lệ hoặc nằm trong tương lai.');
  return { request_id: input.request_id.toLowerCase(), revision: input.revision, amount: input.amount, method: input.method as PaymentInput['method'], account_id: Number(input.account_id), paid_at: input.paid_at, note: input.note.trim() };
}
export async function readPaymentContext(client: Database, id: number): Promise<PaymentContext> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new ContractPaymentError('Mã hợp đồng không hợp lệ.');
  const result = await client.query(`SELECT id, COALESCE(contract_number, draft_reference, '#' || id::text) AS code,
      order_status AS status, store_id, total, pid, xmin::text AS revision
    FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL`, [id]);
  if (!result.rowCount) throw new ContractPaymentError('Không tìm thấy hợp đồng.', 404);
  const order = result.rows[0], total = money(order.total), paid = money(order.pid);
  const accounts = await client.query(`SELECT id, 'bank' AS kind, store_id, owner_type,
      bank_name || ' · ' || owner_name || ' · ' || account_number AS label
    FROM himoto.banks WHERE lower(status) = 'active' AND account_type IN (0,1) AND (store_id=$1 OR owner_type='company')
    UNION ALL SELECT id, 'cash' AS kind, store_id, '' AS owner_type, 'Két tiền mặt #' || id::text AS label
    FROM himoto.cash WHERE lower(status)='active' AND store_id=$1 ORDER BY kind,id`, [order.store_id]);
  const history = await client.query(`SELECT t.id,t.value AS amount,t.created_at AS paid_at,t.note,u.name AS actor,
      CASE WHEN t.cash_id IS NOT NULL THEN 'Tiền mặt' WHEN t.bank_owner_type='company' THEN 'CK tài khoản công ty'
        WHEN t.bank_id IS NOT NULL THEN 'Chuyển khoản' ELSE 'Chưa xác định' END AS method,
      CASE WHEN t.cash_id IS NOT NULL THEN 'Két tiền mặt #' || t.cash_id::text
        ELSE b.bank_name || ' · ' || b.owner_name || ' · ' || b.account_number END AS account,
      t.bank_owner_type
    FROM himoto.transactions t LEFT JOIN himoto.users u ON u.id=t.user_id LEFT JOIN himoto.banks b ON b.id=t.bank_id
    WHERE t.order_id=$1 AND t.type IN ('in','addon') AND t.status='approved' ORDER BY t.created_at DESC,t.id DESC`, [id]);
  const company = history.rows.filter(row => row.bank_owner_type === 'company');
  return { id: Number(order.id), code: String(order.code), status: String(order.status), store_id: Number(order.store_id), revision: String(order.revision),
    total_amount: total, paid_amount: paid, remaining: total === null || paid === null ? null : Math.max(total - paid, 0),
    company_paid_amount: company.reduce((sum, row) => sum + Number(row.amount), 0), company_payment_count: company.length,
    accounts: accounts.rows.map(row => ({ ...row, id: Number(row.id), store_id: Number(row.store_id) })),
    history: history.rows.map(row => ({ id: Number(row.id), amount: Number(row.amount), paid_at: row.paid_at instanceof Date ? row.paid_at.toISOString() : String(row.paid_at),
      note: String(row.note || ''), actor: String(row.actor || ''), method: String(row.method), account: String(row.account || '') })) };
}

// Caller owns BEGIN/COMMIT. The receipt, income and paid total are atomic.
export async function recordContractPayment(client: Database, id: number, actorId: number, input: PaymentInput) {
  input = parseContractPayment(input);
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(actorId) || actorId <= 0) throw new ContractPaymentError('Hợp đồng hoặc người thực hiện không hợp lệ.');
  const fingerprint = createHash('sha256').update(JSON.stringify({ id, actorId, amount: input.amount, method: input.method, account_id: input.account_id, paid_at: input.paid_at, note: input.note })).digest('hex');
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
  if (!PAYABLE_STATUSES.includes(context.status)) throw new ContractPaymentError('Chỉ thu tiền cho hợp đồng đang thuê, quá hạn, chờ thanh toán hoặc nợ xấu.', 409);
  if (context.remaining === null || context.paid_amount === null) throw new ContractPaymentError('Thiếu hoặc sai số liệu tiền hợp đồng/tổng đã thu. Cần đối chiếu trước khi thanh toán.', 409);
  const amount = Number(input.amount);
  if (amount > context.remaining || context.paid_amount + amount > MAX_PAYMENT_AMOUNT) throw new ContractPaymentError('Số tiền thu vượt phần còn thiếu của hợp đồng.', 409);
  // Lock and recheck the chosen account so concurrent edits cannot change its ownership/scope.
  const accountTable = input.method === 'cash' ? 'cash' : 'banks';
  await client.query(`SELECT id FROM himoto.${accountTable} WHERE id=$1 FOR SHARE`, [input.account_id]);
  const refreshed = await readPaymentContext(client, id);
  const account = paymentAccounts(refreshed, input.method).find(row => row.id === input.account_id);
  if (!account) throw new ContractPaymentError('Tài khoản nhận không hoạt động, sai cơ sở hoặc chưa được xác định là tài khoản công ty.', 409);
  const company = input.method === 'company_transfer';
  const transaction = await client.query(`INSERT INTO himoto.transactions
    (order_id,created_at,updated_at,name,type,value,note,status,user_id,store_id,bank_id,cash_id,payment_method,bank_owner_type,object_type,object_id)
    VALUES ($1,$2,now(),'order:payment','in',$3,$4,'approved',$5,$6,$7,$8,$9,$10,'order',$1) RETURNING id`,
    [id, `${input.paid_at}:00+07:00`, amount, input.note || `Gia hạn hợp đồng_${context.code}`, actorId, context.store_id,
      account.kind === 'bank' ? account.id : null, account.kind === 'cash' ? account.id : null,
      account.kind === 'cash' ? 1 : 2, account.kind === 'bank' ? account.owner_type : null]);
  const transactionId = Number(transaction.rows[0].id);
  await client.query('UPDATE himoto.orders SET pid=pid+$2,updated_at=now() WHERE id=$1', [id, amount]);
  await client.query(`INSERT INTO himoto.management_contract_payments(request_id,order_id,transaction_id,actor_id,request_hash)
    VALUES ($1,$2,$3,$4,$5)`, [input.request_id, id, transactionId, actorId, fingerprint]);
  return { context: await readPaymentContext(client, id), transaction_id: transactionId, replayed: false, company_transfer: company };
}
