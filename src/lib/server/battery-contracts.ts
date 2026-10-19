import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { BATTERY_COLLECTION_METHODS, BATTERY_PAYMENT_METHODS, BATTERY_STATUSES, BatteryContract, BatteryContractInput, type BatteryCollectionMethod } from '@/lib/management/battery-contracts';
type Database = Pick<PoolClient, 'query'>;
export class BatteryContractError extends Error { constructor(message: string, public status = 400) { super(message); } }

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const validTime = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}+07:00`)) && new Date(Date.parse(`${value}+07:00`) + 7 * 3600000).toISOString().slice(0, 16) === value;
const TEXT_LIMITS = {
  staff_name: 120, signed_place: 255, customer_name: 255, customer_phone: 32, customer_address: 500, customer_id_card: 32, id_card_issued_by: 255,
  battery_name: 255, vehicle_license: 32, vehicle_brand: 120, vehicle_type: 120, vehicle_color: 60, vehicle_year: 10, price_unit: 30, package_name: 120, deposit_note: 500, notes: 2000,
} as const;
const MONEY_FIELDS = ['rent_price', 'paid_amount', 'deposit_amount'] as const;
const FIELDS = ['store_id', 'customer_id', 'vehicle_contract_id', 'status', 'signed_on', 'id_card_issued_on', 'starts_at', 'ends_at', 'paid_method', 'deposit_method', 'paid_account_type','paid_account_id','deposit_account_type','deposit_account_id','collected_at', ...Object.keys(TEXT_LIMITS), ...MONEY_FIELDS];

export function parseBatteryInput(body: unknown, editing = false, legacyCollected = { paid: 0, deposit: 0 }): BatteryContractInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BatteryContractError('Thông tin hợp đồng thuê pin không hợp lệ.');
  const value = body as Record<string, unknown>;
  const allowed = [...FIELDS, editing ? 'revision' : 'request_id'];
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new BatteryContractError('Thông tin hợp đồng thuê pin có trường không được hỗ trợ.');
  const text = {} as Record<keyof typeof TEXT_LIMITS, string>;
  for (const [key, limit] of Object.entries(TEXT_LIMITS) as [keyof typeof TEXT_LIMITS, number][]) {
    if (typeof value[key] !== 'string') throw new BatteryContractError('Thông tin hợp đồng thuê pin không hợp lệ.');
    text[key] = (value[key] as string).trim();
    if (text[key].length > limit) throw new BatteryContractError(`Một trường thông tin dài quá ${limit} ký tự.`);
  }
  const money = {} as Record<(typeof MONEY_FIELDS)[number], number | null>;
  for (const key of MONEY_FIELDS) {
    if (value[key] !== null && (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0 || Number(value[key]) > 1e12)) throw new BatteryContractError('Số tiền phải là số nguyên không âm.');
    money[key] = value[key] === null ? null : Number(value[key]);
  }
  if (!Number.isSafeInteger(value.store_id) || Number(value.store_id) <= 0) throw new BatteryContractError('Chọn cơ sở cho thuê pin.');
  if (value.customer_id !== null && (!Number.isSafeInteger(value.customer_id) || Number(value.customer_id) <= 0)) throw new BatteryContractError('Khách hàng đã chọn không hợp lệ.');
  if (value.vehicle_contract_id !== undefined && value.vehicle_contract_id !== null && (!Number.isSafeInteger(value.vehicle_contract_id) || Number(value.vehicle_contract_id) <= 0)) throw new BatteryContractError('Hợp đồng xe liên kết không hợp lệ.');
  if (!BATTERY_STATUSES.some(option => option.value === value.status)) throw new BatteryContractError('Trạng thái hợp đồng không hợp lệ.');
  if (!BATTERY_PAYMENT_METHODS.includes(value.paid_method as never) || !BATTERY_PAYMENT_METHODS.includes(value.deposit_method as never)) throw new BatteryContractError('Hình thức thanh toán chỉ nhận CK hoặc TM.');
  if (typeof value.signed_on !== 'string' || !validDate(value.signed_on)) throw new BatteryContractError('Nhập ngày ký hợp đồng hợp lệ.');
  if (typeof value.id_card_issued_on !== 'string' || (value.id_card_issued_on && !validDate(value.id_card_issued_on))) throw new BatteryContractError('Ngày cấp CCCD không hợp lệ.');
  if (typeof value.starts_at !== 'string' || !validTime(value.starts_at)) throw new BatteryContractError('Nhập thời điểm bắt đầu thuê hợp lệ.');
  if (typeof value.ends_at !== 'string' || (value.ends_at && !validTime(value.ends_at))) throw new BatteryContractError('Thời điểm kết thúc thuê không hợp lệ.');
  if (value.ends_at && Date.parse(`${value.ends_at}+07:00`) <= Date.parse(`${value.starts_at}+07:00`)) throw new BatteryContractError('Thời điểm kết thúc phải sau thời điểm bắt đầu.');
  if (!text.customer_name) throw new BatteryContractError('Nhập tên khách hàng (Bên B).');
  if (!text.battery_name) throw new BatteryContractError('Nhập loại pin cho thuê.');
  const accounts: Partial<BatteryContractInput> = {};
  for (const purpose of ['paid','deposit'] as const) {
    const type = value[`${purpose}_account_type`] ?? (value[`${purpose}_method`] === 'TM' ? 'cash' : value[`${purpose}_method`] === 'CK' ? 'transfer' : '');
    const id = value[`${purpose}_account_id`] ?? null;
    if (!BATTERY_COLLECTION_METHODS.some(option=>option.value === type) || id !== null && (!Number.isSafeInteger(id) || Number(id) <= 0)) throw new BatteryContractError('Hình thức hoặc tài khoản nhận tiền chưa hợp lệ.');
    const positive = Number(money[purpose === 'paid' ? 'paid_amount' : 'deposit_amount']) > legacyCollected[purpose];
    if (positive && (!type || id === null)) throw new BatteryContractError('Chọn tài khoản nhận tiền thuê và tiền cọc đã thu.');
    const method = type === 'cash' ? 'TM' : type ? 'CK' : '';
    if (value[`${purpose}_method`] !== method) throw new BatteryContractError('Hình thức thanh toán chưa khớp tài khoản nhận tiền.');
    accounts[`${purpose}_account_type`] = type as BatteryCollectionMethod;
    accounts[`${purpose}_account_id`] = id === null ? null : Number(id);
  }
  const collected = value.collected_at ?? value.starts_at;
  if (typeof collected !== 'string' || !validTime(collected)) throw new BatteryContractError('Thời điểm nhận tiền chưa hợp lệ.');
  if ((Number(money.paid_amount) > 0 || Number(money.deposit_amount) > 0) && Date.parse(`${collected}+07:00`) > Date.now()+60000) throw new BatteryContractError('Thời điểm đã nhận tiền không được ở tương lai.');
  if (editing ? typeof value.revision !== 'string' || !/^\d{1,20}$/.test(value.revision) : typeof value.request_id !== 'string' || !uuid.test(value.request_id)) throw new BatteryContractError('Phiên bản hợp đồng không hợp lệ. Tải lại trang rồi thử lại.');
  return {
    ...text, ...money, ...accounts, collected_at:collected, store_id: Number(value.store_id), customer_id: value.customer_id === null ? null : Number(value.customer_id),
    status: value.status as BatteryContractInput['status'], signed_on: value.signed_on, id_card_issued_on: value.id_card_issued_on,
    starts_at: value.starts_at, ends_at: value.ends_at, paid_method: value.paid_method as BatteryContractInput['paid_method'], deposit_method: value.deposit_method as BatteryContractInput['deposit_method'],
    ...(editing ? { revision: String(value.revision) } : { request_id: String(value.request_id).toLowerCase() }),
    ...(value.vehicle_contract_id !== undefined ? { vehicle_contract_id: value.vehicle_contract_id === null ? null : Number(value.vehicle_contract_id) } : {}),
  };
}

const SELECT = `SELECT b.*, b.signed_on::text AS signed_on_text, b.id_card_issued_on::text AS id_card_issued_on_text, b.xmin::text AS revision,
  s.store_name, s.store_address, s.store_phone,
  COALESCE(NULLIF(vo.contract_number,''),NULLIF(vo.draft_reference,''),'#' || vo.id::text) AS vehicle_contract_code,
  rp.account_id AS paid_account_id,rp.method AS paid_account_type,dp.account_id AS deposit_account_id,dp.method AS deposit_account_type,
  GREATEST(rp.collected_at,dp.collected_at) AS collection_at
  FROM himoto.battery_contracts b LEFT JOIN himoto.stores s ON s.id=b.store_id
  LEFT JOIN himoto.orders vo ON vo.id=b.vehicle_contract_id
  LEFT JOIN LATERAL (SELECT COALESCE(t.cash_id,t.bank_id) AS account_id,
    CASE WHEN t.cash_id IS NOT NULL THEN 'cash' WHEN t.bank_owner_type='company' THEN 'company_transfer' ELSE 'transfer' END AS method,t.created_at AS collected_at
    FROM himoto.transactions t WHERE t.object_type='battery_contract' AND t.object_id=b.id AND t.name='battery:rental' AND t.status='approved' ORDER BY t.id DESC LIMIT 1) rp ON true
  LEFT JOIN LATERAL (SELECT COALESCE(t.cash_id,t.bank_id) AS account_id,
    CASE WHEN t.cash_id IS NOT NULL THEN 'cash' WHEN t.bank_owner_type='company' THEN 'company_transfer' ELSE 'transfer' END AS method,t.created_at AS collected_at
    FROM himoto.transactions t WHERE t.object_type='battery_contract' AND t.object_id=b.id AND t.name='battery:deposit' AND t.status='approved' ORDER BY t.id DESC LIMIT 1) dp ON true`;
const localTime = (input: unknown) => input instanceof Date ? new Date(input.getTime() + 7 * 3600000).toISOString().slice(0, 16) : '';
const money = (input: unknown) => input == null ? null : Number(input);
const text = (input: unknown) => input == null ? '' : String(input);
function map(row: Record<string, unknown>): BatteryContract {
  return {
    id: Number(row.id), code: text(row.code), store_id: Number(row.store_id), store_name: text(row.store_name), store_address: text(row.store_address), store_phone: text(row.store_phone),
    legacy_paid_amount: Number(row.legacy_paid_amount || 0), legacy_deposit_amount: Number(row.legacy_deposit_amount || 0),
    customer_id: row.customer_id == null ? null : Number(row.customer_id), status: text(row.status) as BatteryContract['status'], staff_name: text(row.staff_name),
    vehicle_contract_id: row.vehicle_contract_id == null ? null : Number(row.vehicle_contract_id), vehicle_contract_code: text(row.vehicle_contract_code),
    signed_on: text(row.signed_on_text), signed_place: text(row.signed_place), customer_name: text(row.customer_name), customer_phone: text(row.customer_phone),
    customer_address: text(row.customer_address), customer_id_card: text(row.customer_id_card), id_card_issued_on: text(row.id_card_issued_on_text), id_card_issued_by: text(row.id_card_issued_by),
    battery_name: text(row.battery_name), vehicle_license: text(row.vehicle_license), vehicle_brand: text(row.vehicle_brand), vehicle_type: text(row.vehicle_type),
    vehicle_color: text(row.vehicle_color), vehicle_year: text(row.vehicle_year), starts_at: localTime(row.starts_at), ends_at: localTime(row.ends_at),
    rent_price: money(row.rent_price), price_unit: text(row.price_unit), package_name: text(row.package_name), paid_amount: money(row.paid_amount),
    paid_method: text(row.paid_method) as BatteryContract['paid_method'], deposit_amount: money(row.deposit_amount), deposit_note: text(row.deposit_note),
    deposit_method: text(row.deposit_method) as BatteryContract['deposit_method'], notes: text(row.notes),
    paid_account_type:(text(row.paid_account_type) || (row.paid_method === 'TM' ? 'cash' : row.paid_method === 'CK' ? 'transfer' : '')) as BatteryCollectionMethod,paid_account_id:money(row.paid_account_id),
    deposit_account_type:(text(row.deposit_account_type) || (row.deposit_method === 'TM' ? 'cash' : row.deposit_method === 'CK' ? 'transfer' : '')) as BatteryCollectionMethod,deposit_account_id:money(row.deposit_account_id),
    collected_at:localTime(row.collection_at) || localTime(row.starts_at),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : text(row.created_at), revision: text(row.revision),
  };
}

export async function listBatteryContracts(client: Database, storeId?: number, vehicleContractId?: number) {
  if (storeId !== undefined && (!Number.isSafeInteger(storeId) || storeId <= 0)) throw new BatteryContractError('Cơ sở không hợp lệ.');
  if (vehicleContractId !== undefined && (!Number.isSafeInteger(vehicleContractId) || vehicleContractId <= 0)) throw new BatteryContractError('Hợp đồng xe liên kết không hợp lệ.');
  const result = await client.query(`${SELECT} WHERE b.deleted_at IS NULL AND ($1::bigint IS NULL OR b.store_id=$1) AND ($2::bigint IS NULL OR b.vehicle_contract_id=$2) ORDER BY b.starts_at DESC, b.id DESC LIMIT 5000`, [storeId ?? null, vehicleContractId ?? null]);
  return result.rows.map(map);
}
async function lock(client: Database) {
  await client.query("SET LOCAL lock_timeout='5s'"); await client.query("SET LOCAL statement_timeout='15s'");
  await client.query('LOCK TABLE himoto.battery_contracts IN SHARE ROW EXCLUSIVE MODE');
}
async function readOne(client: Database, id: number) {
  const result = await client.query(`${SELECT} WHERE b.id=$1 AND b.deleted_at IS NULL`, [id]);
  if (!result.rowCount) throw new BatteryContractError('Hợp đồng thuê pin không còn tồn tại.', 404);
  return map(result.rows[0]);
}
async function nextCode(client: Database, signedOn: string) {
  const prefix = `P${signedOn.slice(2, 4)}${signedOn.slice(5, 7)}${signedOn.slice(8, 10)}-`;
  const result = await client.query(`SELECT coalesce(max(substring(code FROM '\\d+$')::int), 0) + 1 AS next FROM himoto.battery_contracts WHERE code LIKE $1 || '%'`, [prefix]);
  return `${prefix}${String(result.rows[0].next).padStart(4, '0')}`;
}

export async function saveBatteryContract(client: Database, actorId: number, raw: unknown, id?: number) {
  if (!Number.isSafeInteger(actorId) || actorId <= 0 || (id !== undefined && (!Number.isSafeInteger(id) || id <= 0))) throw new BatteryContractError('Mã hợp đồng hoặc người thực hiện không hợp lệ.');
  await lock(client);
  const legacy = id === undefined ? undefined : (await client.query('SELECT legacy_paid_amount,legacy_deposit_amount FROM himoto.battery_contracts WHERE id=$1 AND deleted_at IS NULL', [id])).rows[0];
  const input = parseBatteryInput(raw, id !== undefined, { paid: Number(legacy?.legacy_paid_amount || 0), deposit: Number(legacy?.legacy_deposit_amount || 0) });
  const hash = createHash('sha256').update(JSON.stringify({ actorId, ...input })).digest('hex');
  if (id === undefined) {
    const previous = await client.query('SELECT id, request_hash, deleted_at FROM himoto.battery_contracts WHERE request_id=$1', [input.request_id]);
    if (previous.rowCount) {
      if (previous.rows[0].request_hash !== hash || previous.rows[0].deleted_at) throw new BatteryContractError('Mã lần lưu đã được dùng. Tải lại trang trước khi tạo hợp đồng khác.', 409);
      return readOne(client, Number(previous.rows[0].id));
    }
  } else {
    const previous = await readOne(client,id);
    if (previous.revision !== input.revision) throw new BatteryContractError('Hợp đồng đã được người khác cập nhật. Tải lại trang và mở lại để sửa.', 409);
    if (previous.vehicle_contract_id && input.vehicle_contract_id !== undefined && input.vehicle_contract_id !== previous.vehicle_contract_id) throw new BatteryContractError('Giữ nguyên hợp đồng xe đã liên kết để lịch sử thuê pin / sạc chính xác.',409);
    if (input.vehicle_contract_id === undefined) input.vehicle_contract_id = previous.vehicle_contract_id ?? null;
    if (previous.store_id !== input.store_id && (previous.paid_account_id || previous.deposit_account_id || previous.legacy_paid_amount || previous.legacy_deposit_amount)) throw new BatteryContractError('Hợp đồng đã có phiếu thu; giữ cơ sở để số dư và lịch sử đúng.',409);
  }
  const store = await client.query("SELECT id FROM himoto.stores WHERE id=$1 AND status IN ('opening','active') FOR SHARE", [input.store_id]);
  if (!store.rowCount) throw new BatteryContractError('Cơ sở không tồn tại hoặc đã ngừng hoạt động.', 409);
  if (input.customer_id !== null && !(await client.query('SELECT id FROM himoto.customers WHERE id=$1 FOR SHARE', [input.customer_id])).rowCount) throw new BatteryContractError('Khách hàng đã chọn không còn tồn tại. Tra cứu lại khách hàng.', 409);
  if (input.vehicle_contract_id) {
    const source = await client.query('SELECT id,store_id,customer_id,order_status FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR SHARE',[input.vehicle_contract_id]);
    const order = source.rows[0];
    if (!order || ['draft','cancelled'].includes(String(order.order_status))) throw new BatteryContractError('Chỉ liên kết hợp đồng xe đã phát hành và chưa hủy.',409);
    if (Number(order.store_id)!==input.store_id || order.customer_id != null && Number(order.customer_id)!==input.customer_id) throw new BatteryContractError('Hợp đồng pin / sạc phải cùng khách hàng và cơ sở nguồn với hợp đồng xe liên kết.',409);
  }
  const values = [input.store_id, input.customer_id, input.status, input.staff_name, input.signed_on, input.signed_place, input.customer_name, input.customer_phone,
    input.customer_address, input.customer_id_card, input.id_card_issued_on || null, input.id_card_issued_by, input.battery_name, input.vehicle_license, input.vehicle_brand,
    input.vehicle_type, input.vehicle_color, input.vehicle_year, `${input.starts_at}:00+07:00`, input.ends_at ? `${input.ends_at}:00+07:00` : null, input.rent_price,
    input.price_unit, input.package_name, input.paid_amount, input.paid_method, input.deposit_amount, input.deposit_note, input.deposit_method, input.notes, input.vehicle_contract_id ?? null, actorId];
  const columns = 'store_id,customer_id,status,staff_name,signed_on,signed_place,customer_name,customer_phone,customer_address,customer_id_card,id_card_issued_on,id_card_issued_by,battery_name,vehicle_license,vehicle_brand,vehicle_type,vehicle_color,vehicle_year,starts_at,ends_at,rent_price,price_unit,package_name,paid_amount,paid_method,deposit_amount,deposit_note,deposit_method,notes,vehicle_contract_id';
  if (id !== undefined) {
    await client.query(`UPDATE himoto.battery_contracts SET (${columns},updated_by,updated_at) = (${values.map((_, index) => `$${index + 1}`).join(',')},now()) WHERE id=$${values.length + 1}`, [...values, id]);
  } else {
    const code = await nextCode(client, input.signed_on);
    id = Number((await client.query(`INSERT INTO himoto.battery_contracts(${columns},created_by,updated_by,code,request_id,request_hash)
      VALUES(${values.map((_, index) => `$${index + 1}`).join(',')},$${values.length},$${values.length + 1},$${values.length + 2},$${values.length + 3}) RETURNING id`,
      [...values, code, input.request_id, hash])).rows[0].id);
  }
  await collectBatteryPayments(client,id,actorId,input);
  return readOne(client, id);
}

async function collectBatteryPayments(client: Database,id: number,actorId: number,input: BatteryContractInput) {
  const imported = (await client.query('SELECT legacy_paid_amount,legacy_deposit_amount FROM himoto.battery_contracts WHERE id=$1', [id])).rows[0];
  const totals = await client.query(`SELECT name,COALESCE(SUM(value),0) AS amount FROM himoto.transactions
    WHERE object_type='battery_contract' AND object_id=$1 AND status='approved' AND type='in' GROUP BY name`,[id]);
  for (const purpose of ['paid','deposit'] as const) {
    const name = purpose === 'paid' ? 'battery:rental' : 'battery:deposit';
    const target = Number(purpose === 'paid' ? input.paid_amount : input.deposit_amount) || 0;
    const baseline = Number(imported?.[purpose === 'paid' ? 'legacy_paid_amount' : 'legacy_deposit_amount'] || 0);
    const before = baseline + Number(totals.rows.find(row=>row.name === name)?.amount || 0), delta = target-before;
    if (delta < 0) throw new BatteryContractError('Số đã thu thấp hơn phiếu thu hiện có. Đối chiếu Sổ quỹ trước khi điều chỉnh; không tự xóa tiền đã nhận.',409);
    if (!delta) {
      if (target > 0) {
        const latest = await client.query(`SELECT COALESCE(cash_id,bank_id) AS account_id,
          CASE WHEN cash_id IS NOT NULL THEN 'cash' WHEN bank_owner_type='company' THEN 'company_transfer' ELSE 'transfer' END AS method
          FROM himoto.transactions WHERE object_type='battery_contract' AND object_id=$1 AND name=$2 AND status='approved' ORDER BY id DESC LIMIT 1`,[id,name]);
        if (!latest.rowCount && baseline === target) {
          if (input[`${purpose}_account_id`] !== null) throw new BatteryContractError('Khoản thu app cũ được giữ trong lịch sử; chỉ chọn tài khoản mới khi thu tăng thêm.',409);
          continue;
        }
        if (Number(latest.rows[0]?.account_id) !== input[`${purpose}_account_id`] || latest.rows[0]?.method !== input[`${purpose}_account_type`]) throw new BatteryContractError('Không đổi tài khoản của khoản đã thu bằng cách sửa hợp đồng. Đối chiếu phiếu trong Sổ quỹ; tài khoản mới áp dụng cho khoản thu tăng thêm.',409);
      }
      continue;
    }
    const method = input[`${purpose}_account_type`], accountId = input[`${purpose}_account_id`];
    const cash = method === 'cash';
    const result = await client.query(`SELECT id,store_id,${cash ? "''::text" : 'owner_type'} AS owner_type FROM himoto.${cash ? 'cash' : 'banks'}
      WHERE id=$1 AND lower(status)='active' FOR SHARE`,[accountId]);
    const account = result.rows[0];
    if (!account || (method === 'company_transfer' ? account.owner_type !== 'company'
      : Number(account.store_id) !== input.store_id || !cash && account.owner_type === 'company')) throw new BatteryContractError('Tài khoản nhận không hoạt động hoặc không khớp hình thức / cơ sở thuê pin.',409);
    const code = (await client.query('SELECT code FROM himoto.battery_contracts WHERE id=$1',[id])).rows[0].code;
    await client.query(`INSERT INTO himoto.transactions(created_at,updated_at,name,type,value,note,status,user_id,store_id,bank_id,cash_id,payment_method,bank_owner_type,object_type,object_id)
      VALUES($1,now(),$2,'in',$3,$4,'approved',$5,$6,$7,$8,$9,$10,'battery_contract',$11)`,
      [`${input.collected_at}:00+07:00`,name,delta,`${purpose === 'paid' ? 'Thu tiền thuê pin' : 'Thu cọc thuê pin'}_${code}`,actorId,input.store_id,
        cash ? null : accountId,cash ? accountId : null,cash ? 1 : 2,cash ? null : method==='company_transfer'?'company':'personal',id]);
  }
}

export async function deleteBatteryContract(client: Database, id: number, revision: string, actorId: number) {
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(actorId) || actorId <= 0 || !/^\d{1,20}$/.test(revision)) throw new BatteryContractError('Mã hợp đồng hoặc phiên bản không hợp lệ.');
  await lock(client);
  if ((await readOne(client, id)).revision !== revision) throw new BatteryContractError('Hợp đồng đã được người khác cập nhật. Tải lại trang và kiểm tra trước khi xóa.', 409);
  await client.query('UPDATE himoto.battery_contracts SET deleted_at=now(), updated_at=now(), updated_by=$2 WHERE id=$1', [id, actorId]);
  return null;
}
