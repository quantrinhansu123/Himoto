import 'server-only';
import type { PoolClient } from 'pg';
import { MAX_PAYMENT_AMOUNT, PAYMENT_METHODS, findPaymentAccount, paymentAccountMatchesMethod } from '@/lib/management/contract-payments';
import { draftPaymentMethod, PAYMENT_METHOD_LABELS, type FinalizeInput, type FinalizeReceipt, type FinalizeCollection, type FinalizeResult } from '@/lib/management/contract-finalize';
import { chargeErrors, chargeTotal, type ContractCharge } from '@/lib/management/contract-charges';
import { readPaymentContext } from './contract-payments';
import { usesScopedDatabase } from './access-context';
import { loadCommissionStaff } from './commission-staff';
import { contractNumberError, paperContractNumber } from '@/lib/management/contract-number';
import { contractNumberAvailable } from './contract-number';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import { rentalQuote } from '@/lib/management/contract-pricing';
import { validOwnershipTerm } from '@/lib/management/contract-billing';

type Database = Pick<PoolClient, 'query'>;
export class ContractFinalizeError extends Error {
  constructor(message: string, public status = 400, public code?: string) { super(message); }
}

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const validLocal = (value: unknown): value is string => {
  if (typeof value !== 'string' || !LOCAL_DATE_TIME.test(value)) return false;
  const date = new Date(`${value}+07:00`);
  return Number.isFinite(date.getTime()) && new Date(date.getTime() + 7 * 3600000).toISOString().slice(0,16) === value;
};
const validPaidAt = (value: unknown): value is string => validLocal(value) && new Date(`${value}+07:00`).getTime() <= Date.now()+5*60000;

/** Legacy / imported returns can leave status=using after every rental line is closed. */
async function releaseIdleRentedVehicles(client: Database, rows: { id: unknown; status?: unknown }[]) {
  const stale = rows.filter(row => ['using', 'rent'].includes(String(row.status))).map(row => Number(row.id)).filter(id => Number.isSafeInteger(id) && id > 0);
  if (!stale.length) return;
  const released = usesScopedDatabase()
    ? await client.query(`UPDATE himoto.vehicles v SET status='ready', updated_at=now()
        WHERE v.id = ANY($1::bigint[]) AND v.status IN ('using','rent') AND NOT himoto.vehicle_has_open_rental(v.id)
        RETURNING id`, [stale])
    : await client.query(`UPDATE himoto.vehicles v SET status='ready', updated_at=now()
        WHERE v.id = ANY($1::bigint[]) AND v.status IN ('using','rent') AND NOT EXISTS (
          SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
          WHERE d.vehicle_id=v.id AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
            AND ${VEHICLE_ORDER_SQL} AND o.order_status IN ('renting','overdue','wait_payment','pending','bad_debt'))
        RETURNING id`, [stale]);
  const ready = new Set(released.rows.map(row => Number(row.id)));
  for (const row of rows) if (ready.has(Number(row.id))) row.status = 'ready';
}
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
  const acknowledge = input.acknowledge_reservation_overlap === true ? { acknowledge_reservation_overlap: true as const } : {};
  if (input.acknowledge_reservation_overlap !== undefined && input.acknowledge_reservation_overlap !== true) {
    throw new ContractFinalizeError('Xác nhận chồng lịch cọc giữ xe không hợp lệ.');
  }
  if ('receipts' in input) {
    if (Object.keys(input).some(key=>!['revision','receipts','reservation','acknowledge_reservation_overlap'].includes(key)) || (input.reservation !== undefined && input.reservation !== true) || typeof input.revision !== 'string' || !/^\d{1,20}$/.test(input.revision) ||
      !Array.isArray(input.receipts) || input.receipts.length > 40) throw new ContractFinalizeError('Thông tin các khoản thu không hợp lệ.');
    const receipts: FinalizeCollection[] = input.receipts.map(value=>{
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ContractFinalizeError('Khoản thu không hợp lệ.');
      const row = value as Record<string,unknown>;
      if (Object.keys(row).some(key=>!['purpose','amount','method','account_id','paid_at'].includes(key)) || !['deposit','rental'].includes(String(row.purpose)) ||
        typeof row.amount !== 'string' || !/^[1-9]\d{0,12}$/.test(row.amount) || amountOf(row.amount) === null || !validPaidAt(row.paid_at)) throw new ContractFinalizeError('Nhập loại tiền, số tiền nguyên dương và thời điểm nhận hợp lệ.');
      const receipt = parseReceipt({method:row.method,account_id:row.account_id},'khoản thu')!;
      return {...receipt,purpose:row.purpose as FinalizeCollection['purpose'],amount:row.amount,paid_at:row.paid_at};
    });
    if (input.reservation && (!receipts.length || receipts.some(row=>row.purpose !== 'rental'))) throw new ContractFinalizeError('Nhập tiền giữ xe trả trước, được trừ vào tiền thuê.');
    return {revision:input.revision,receipts,...(input.reservation ? {reservation:true as const} : {}),...acknowledge};
  }
  if (Object.keys(input).some(key => !['revision', 'paid_at', 'deposit', 'rental', 'acknowledge_reservation_overlap'].includes(key)) || !('deposit' in input) || !('rental' in input) ||
      typeof input.revision !== 'string' || !/^\d{1,20}$/.test(input.revision)) throw new ContractFinalizeError('Thông tin lưu chính thức không hợp lệ.');
  if (!validPaidAt(input.paid_at)) throw new ContractFinalizeError('Ngày giờ thu tiền không hợp lệ hoặc nằm trong tương lai.');
  return { revision: input.revision, paid_at: input.paid_at, deposit: parseReceipt(input.deposit, 'tiền cọc'), rental: parseReceipt(input.rental, 'tiền thuê'), ...acknowledge };
}

// Caller owns BEGIN/COMMIT/ROLLBACK: contract number, vehicle lines, vehicle
// status and receipts are written together or not at all.
export async function finalizeContractDraft(client: Database, id: number, actorId: number, input: FinalizeInput): Promise<FinalizeResult> {
  input = parseFinalizeInput(input);
  const reservation = 'receipts' in input && input.reservation === true;
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(actorId) || actorId <= 0) throw new ContractFinalizeError('Hợp đồng hoặc người thực hiện không hợp lệ.');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '15s'");
  const locked = await client.query(`SELECT id, order_status, store_id, customer_id, pid, contract_number, draft_reference, draft_payload, xmin::text AS revision
    FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [id]);
  const order = locked.rows[0];
  if (!order) throw new ContractFinalizeError('Không tìm thấy bản nháp.', 404);
  if (order.order_status !== 'draft') throw new ContractFinalizeError('Hợp đồng này không còn là bản nháp (có thể đã được lưu chính thức).', 409);
  if (order.revision !== input.revision) throw new ContractFinalizeError('Bản nháp đã thay đổi. Đóng form, Làm mới rồi thử lại.', 409);

  const payload = order.draft_payload && typeof order.draft_payload === 'object' ? order.draft_payload as Record<string, unknown> : {};
  const composer = payload.management_composer && typeof payload.management_composer === 'object' ? payload.management_composer as Record<string, unknown> : {};
  const draft = composer.draft && typeof composer.draft === 'object' ? composer.draft as Record<string, unknown> : null;
  if (!draft) throw new ContractFinalizeError('Bản nháp chưa có thông tin hợp đồng. Lưu nháp lại trước khi lưu chính thức.', 409);
  const attribution:Record<string,{staff_id:number;name:string}> = {};
  for (const [key,role] of [['sales_staff_id','NVKD'],['tls_staff_id','TLS']] as const) {
    if (!draft[key]) continue;
    if (typeof draft[key] !== 'string' || !/^[1-9]\d{0,14}$/.test(String(draft[key]))) throw new ContractFinalizeError('Nhân viên ghi nhận doanh số chưa hợp lệ.',409);
    const person=await loadCommissionStaff(String(draft[key]), role);
    if (!person) throw new ContractFinalizeError(`Nhân viên ${role} đã thay đổi; chọn lại trước khi lưu.`,409);
    attribution[role]=person;
  }
  if (Object.keys(attribution).length) composer.sales_attribution=attribution;
  const storeId = Number(order.store_id), customerId = Number(order.customer_id);
  if (!Number.isSafeInteger(storeId) || storeId <= 0) throw new ContractFinalizeError('Bản nháp chưa chọn cơ sở.', 409);
  if (!Number.isSafeInteger(customerId) || customerId <= 0) throw new ContractFinalizeError('Bản nháp chưa có khách hàng.', 409);
  const start = draft.start_date, end = draft.end_date;
  if (!validLocal(start) || !validLocal(end) || end <= start) throw new ContractFinalizeError('Thời gian thuê / hẹn trả của bản nháp không hợp lệ.', 409);
  if (reservation && new Date(`${start}+07:00`).getTime() < Date.now()) throw new ContractFinalizeError('Chọn thời gian dự kiến nhận xe từ hiện tại trở đi.', 409);
  const lines = Array.isArray(draft.vehicles) ? draft.vehicles as Record<string, unknown>[] : [];
  const vehicleIds = lines.map(line => Number(line?.id));
  if (!lines.length || vehicleIds.some(value => !Number.isSafeInteger(value) || value <= 0) || new Set(vehicleIds).size !== vehicleIds.length) throw new ContractFinalizeError('Bản nháp cần chọn đủ xe, không trùng xe.', 409);
  const total = amountOf(draft.total_amount), deposit = amountOf(draft.deposit_amount), unitPrice = amountOf(draft.unit_price);
  const otherFees = chargeTotal(draft.extra_charges);
  if (otherFees === null || Object.keys(chargeErrors(draft.extra_charges as ContractCharge[] | undefined,true)).length || (total !== null && otherFees > total)) throw new ContractFinalizeError('Kiểm tra tên, số tiền và tổng các khoản phí khác.',409);
  if (total === null || deposit === null || unitPrice === null || total + deposit > MAX_PAYMENT_AMOUNT) throw new ContractFinalizeError('Số tiền thuê / tiền cọc của bản nháp không hợp lệ.', 409);
  if (lines.length > 1 && unitPrice > 0 && draft.package_name !== 'Tùy chọn') {
    const quote = rentalQuote({ start_date: start, end_date: end, package_name: String(draft.package_name || ''), unit_price: String(unitPrice), vehicles: lines, extra_charges: draft.extra_charges });
    if (!quote || quote.total_amount !== total) throw new ContractFinalizeError(`Tổng tiền chưa khớp ${lines.length} xe đã chọn. Mở lại bản nháp, kiểm tra đơn giá mỗi xe và lưu lại trước khi phát hành.`, 409);
  }
  const ownership = composer.rental_type === 'ownership';
  if (draft.ownership_term_months !== undefined && !validOwnershipTerm(String(draft.ownership_term_months))) throw new ContractFinalizeError('Phân loại thuê sở hữu chưa hợp lệ.',409);
  // Ownership currently follows ordinary rental operations; the term is a label.
  delete composer.installment_plan;
  if (ownership || draft.ownership !== undefined) draft.ownership = ownership;
  if (!('receipts' in input)) {
    if (deposit === 0 && input.deposit) throw new ContractFinalizeError('Bản nháp không có tiền cọc để ghi phiếu thu.');
    if (total === 0 && input.rental) throw new ContractFinalizeError('Bản nháp không có tiền thuê để ghi phiếu thu.');
  }

  // Cross-branch rentals lock stock at another store without granting table-wide vehicle SELECT.
  const vehicles = usesScopedDatabase()
    ? await client.query('SELECT * FROM himoto.lock_vehicles_for_contract($1::bigint[])', [vehicleIds])
    : await client.query(`SELECT v.id, v.license, v.status, COALESCE(v.current_store_id, v.store_id) AS store_id, s.store_name
    FROM himoto.vehicles v LEFT JOIN himoto.stores s ON s.id=COALESCE(v.current_store_id,v.store_id)
    WHERE v.id = ANY($1::bigint[]) ORDER BY v.id FOR UPDATE OF v`, [vehicleIds]);
  if (vehicles.rowCount !== vehicleIds.length) throw new ContractFinalizeError('Có xe trong bản nháp không còn tồn tại.', 409);
  const conflictLabel = (row: { license: string; code: string; store_name?: string | null; manager_name?: string | null; status?: string | null; rent_at?: Date | string | null; severity?: string | null }) => {
    const store = String(row.store_name || '').trim();
    const manager = String(row.manager_name || '').trim();
    const pickup = row.rent_at ? String(row.rent_at).replace('T', ' ').slice(0, 16) : '';
    if (row.severity === 'reservation_overlap') {
      return `xe ${row.license} đã cọc giữ (HĐ ${row.code}${pickup ? `, nhận ${pickup}` : ''}${store ? ` tại ${store}` : ''}) — hẹn trả HĐ này chồng/vượt ngày nhận`;
    }
    return `xe ${row.license} đang thuộc hợp đồng ${row.code}${store ? ` tại ${store}` : ''}${manager ? ` (phụ trách: ${manager})` : ''}`;
  };
  await releaseIdleRentedVehicles(client, vehicles.rows);
  const proposedStart = `${start}:00+07:00`, proposedEnd = `${end}:00+07:00`;
  const conflicts = usesScopedDatabase()
    ? await client.query('SELECT * FROM himoto.vehicle_window_conflicts($1::bigint[],$2,$3::timestamptz,$4::timestamptz)', [vehicleIds, id, proposedStart, proposedEnd])
    : await client.query(`SELECT v.license, COALESCE(NULLIF(o.contract_number,''), NULLIF(o.draft_reference,''), '#' || o.id::text) AS code, s.store_name,
        COALESCE(cu.name, mu.name, '') AS manager_name,
        CASE WHEN o.order_status='renting' AND d.return_at<now() THEN 'overdue' ELSE o.order_status END AS status,
        d.rent_at, d.return_at,
        CASE WHEN o.order_status='deposit_contract' THEN 'reservation_overlap' ELSE 'hard' END AS severity
      FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id JOIN himoto.vehicles v ON v.id=d.vehicle_id
      LEFT JOIN himoto.stores s ON s.id=o.store_id
      LEFT JOIN himoto.users cu ON cu.id=o.contract_responsible_user_id
      LEFT JOIN himoto.users mu ON mu.id=s.user_id
      WHERE d.vehicle_id = ANY($1::bigint[]) AND d.order_id <> $2 AND d.deleted_at IS NULL AND d.completed_at IS NULL
        AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
        AND (
          o.order_status = ANY($3::text[])
          OR (o.order_status='deposit_contract' AND d.rent_at IS NOT NULL AND $4::timestamptz > d.rent_at)
        )
      ORDER BY v.license`, [vehicleIds, id, ['renting','overdue','wait_payment','pending','bad_debt'], proposedEnd]);
  const hard = conflicts.rows.filter(row => row.severity !== 'reservation_overlap');
  const soft = conflicts.rows.filter(row => row.severity === 'reservation_overlap');
  if (hard.length) throw new ContractFinalizeError(`Không thể lưu chính thức: ${hard.map(conflictLabel).join('; ')} chưa đóng. Hoàn tất hợp đồng cũ trước khi phát hành hợp đồng mới.`, 409);
  if (soft.length && !('acknowledge_reservation_overlap' in input && input.acknowledge_reservation_overlap === true)) {
    throw new ContractFinalizeError(
      `Cảnh báo chồng lịch cọc giữ xe: ${soft.map(conflictLabel).join('; ')}. Tick xác nhận để vẫn phát hành, hoặc chỉnh hẹn trả trước ngày nhận của khách đã cọc.`,
      409,
      'reservation_overlap',
    );
  }
  const notStored = vehicles.rows.filter(row => row.status!=='ready');
  if (notStored.length) throw new ContractFinalizeError(`Xe ${notStored.map(row => row.license).join(', ')} phải ở trạng thái Lưu kho. Đóng hợp đồng cũ và xác nhận nhận xe trước khi phát hành hợp đồng mới.`, 409);
  for (const line of lines) {
    const stock = vehicles.rows.find(vehicle=>String(vehicle.id)===String(line.id))!;
    line.stock_store_id=String(stock.store_id); line.stock_store_name=String(stock.store_name || '');
  }
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
  const oldDepositPaid = context.deposit_paid, oldRentalPaid = context.paid_amount ?? 0;
  const depositDue = Math.max(deposit-oldDepositPaid,0), rentalDue = Math.max(total-oldRentalPaid,0);
  const receipts: FinalizeCollection[] = 'receipts' in input ? input.receipts : [
    ...(input.deposit && depositDue ? [{...input.deposit,purpose:'deposit' as const,amount:String(depositDue),paid_at:input.paid_at}] : []),
    ...(input.rental && rentalDue ? [{...input.rental,purpose:'rental' as const,amount:String(rentalDue),paid_at:input.paid_at}] : []),
  ];
  const depositCollected = receipts.filter(row=>row.purpose==='deposit').reduce((sum,row)=>sum+Number(row.amount),0);
  const rentalCollected = receipts.filter(row=>row.purpose==='rental').reduce((sum,row)=>sum+Number(row.amount),0);
  if (!Number.isSafeInteger(depositCollected+rentalCollected) || depositCollected>depositDue || rentalCollected>rentalDue) throw new ContractFinalizeError('Tổng các khoản thu vượt số tiền cọc hoặc tiền thuê/phí còn phải thu.',409);
  const previousPaid = amountOf(order.pid);
  if (previousPaid === null || previousPaid+depositCollected+rentalCollected>MAX_PAYMENT_AMOUNT) throw new ContractFinalizeError('Tổng đã thu không hợp lệ hoặc vượt giới hạn.',409);
  async function account(receipt: FinalizeReceipt | null, label: string) {
    if (!receipt) return null;
    const table = receipt.method === 'cash' ? 'cash' : 'banks';
    await client.query(`SELECT id FROM himoto.${table} WHERE id=$1 FOR SHARE`, [receipt.account_id]);
    const found = findPaymentAccount(context, receipt.method, receipt.account_id);
    if (!found || !paymentAccountMatchesMethod(found, receipt.method)) {
      throw new ContractFinalizeError(`Tài khoản nhận ${label} không khớp hình thức (Tiền mặt = két; CK cá nhân / CK công ty = ngân hàng).`, 409);
    }
    return found;
  }
  const accounts = [];
  for (const row of receipts) accounts.push(await account(row,row.purpose==='deposit' ? 'tiền cọc' : 'tiền thuê/phí'));

  let code = String(order.contract_number || '').trim() || paperContractNumber(draft.contract_number) || paperContractNumber(order.draft_reference);
  if (code && contractNumberError(code)) throw new ContractFinalizeError(contractNumberError(code)!,409);
  if (code && !await contractNumberAvailable(client,code,id)) throw new ContractFinalizeError('Số hợp đồng đã được sử dụng. Kiểm tra số HĐ giấy trước khi lưu chính thức.',409);
  if (!code) {
    const day = (await client.query(`SELECT to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') AS day`)).rows[0].day as string;
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`contract-number:${day}`]);
    const last = usesScopedDatabase()?await client.query('SELECT himoto.contract_day_last($1) AS last',[day]):await client.query(`SELECT COALESCE(max(substring(contract_number from 8)::int), 0) AS last FROM himoto.orders WHERE contract_number ~ ('^' || $1 || '-[0-9]{4}$')`, [day]);
    let sequence = Number(last.rows[0].last);
    do {
      if (++sequence > 9999) throw new ContractFinalizeError('Đã hết dãy số tự động trong ngày. Nhập số HĐ giấy để tiếp tục.',409);
      code = `${day}-${String(sequence).padStart(4, '0')}`;
    } while (!await contractNumberAvailable(client,code,id));
  }
  draft.contract_number = code;

  const startAt = `${start}:00+07:00`, endAt = `${end}:00+07:00`;
  const type = draft.package_name === 'Theo tháng' ? 'month' : draft.package_name === 'Theo tuần' ? 'week' : 'day';
  const rentalDays = Math.max(Math.ceil((new Date(endAt).getTime() - new Date(startAt).getTime()) / 86_400_000), 1);
  const rentalBase = total-otherFees;
  const hiringFee = unitPrice || (type === 'day' && rentalBase ? Math.round(rentalBase / rentalDays / lines.length) : 0);
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
  async function receipt(found: Awaited<ReturnType<typeof account>>, amount: number, name: string, note: string, paidAt: string,method:FinalizeCollection['method']) {
    if (!found || amount <= 0) return 0;
    // Method is the source of truth; never infer cash vs bank only from overlapping numeric ids.
    const cash = method === 'cash';
    const row = await client.query(`INSERT INTO himoto.transactions
      (order_id,created_at,updated_at,name,type,value,note,status,user_id,store_id,bank_id,cash_id,payment_method,bank_owner_type,object_type,object_id)
      VALUES ($1,$2,now(),$3,'in',$4,$5,'approved',$6,$7,$8,$9,$10,$11,'order',$1) RETURNING id`,
    [id, `${paidAt}:00+07:00`, name, amount, note, actorId, storeId, cash ? null : found.id, cash ? found.id : null,
      cash ? 1 : 2, cash ? null : (method === 'company_transfer' ? 'company' : 'personal')]);
    transactionIds.push(Number(row.rows[0].id));
    return amount;
  }
  for (const [index,row] of receipts.entries()) await receipt(accounts[index],Number(row.amount),row.purpose==='deposit' ? 'order:deposit' : 'order:rental_fees',
    `Thu ${reservation ? 'tiền giữ xe (trừ tiền thuê)' : row.purpose==='deposit' ? 'tiền cọc' : 'tiền thuê và phí khác'} hợp đồng ${code}`,row.paid_at,row.method);
  const paid = previousPaid+depositCollected+rentalCollected;
  const actualMethods = (purpose: 'deposit'|'rental') => [...new Set([
    ...context.history.filter(row=>row.type==='in' && row.deposit===(purpose==='deposit')).map(row=>PAYMENT_METHOD_LABELS[draftPaymentMethod(row.method)]),
    ...receipts.filter(row=>row.purpose===purpose).map(row=>PAYMENT_METHOD_LABELS[row.method]),
  ])].join(', ');
  draft.paid_amount=String(oldRentalPaid+rentalCollected); draft.deposit_paid_amount=String(oldDepositPaid+depositCollected);
  draft.payment_method=actualMethods('rental') || draft.payment_method; draft.deposit_payment_method=actualMethods('deposit') || draft.deposit_payment_method;

  const finalized = { at: new Date().toISOString(), actor_id: actorId, contract_number: code, item_ids: itemIds, transaction_ids: transactionIds,
    ...(soft.length ? { reservation_overlap_acknowledged: true, reservation_overlap_codes: soft.map(row => String(row.code)) } : {}),
    ...(retiredItemIds.length ? { retired_legacy_item_ids: retiredItemIds } : {}) };
  await client.query(`UPDATE himoto.orders SET order_status=$12, order_mode='standard', contract_number=$2,
      contract_issued_at=now() AT TIME ZONE 'Asia/Ho_Chi_Minh', rent_at=$3, return_at=$4, total=$5, total_rental_fees=$6, first_deposit_amount=$7,
      pid=$8, created_without_collect_deposit=$9, created_without_collect_rental_fees=$10, draft_payload=$11, updated_at=now()
    WHERE id=$1`, [id, code, startAt, endAt, String(total), rentalBase, deposit || null, paid, oldDepositPaid+depositCollected<deposit, oldRentalPaid+rentalCollected<total,
    JSON.stringify({ ...payload, management_composer: { ...composer, draft, finalized, ...(reservation ? {reservation:{at:finalized.at,actor_id:actorId,applies_to:'rental'}} : {}) } }), reservation ? 'deposit_contract' : 'renting']);
  if (!reservation) {
    if (usesScopedDatabase()) await client.query('SELECT himoto.mark_vehicles_using($1::bigint[])', [vehicleIds]);
    else await client.query(`UPDATE himoto.vehicles SET status='using', updated_at=now() WHERE id = ANY($1::bigint[])`, [vehicleIds]);
  }
  return { order_id: id, code, total_amount: total, deposit_amount: deposit, paid_amount: paid, transaction_ids: transactionIds, status:reservation ? 'deposit_contract' : 'renting' };
}
