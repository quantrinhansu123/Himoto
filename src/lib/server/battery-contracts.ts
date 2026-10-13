import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { BATTERY_PAYMENT_METHODS, BATTERY_STATUSES, BatteryContract, BatteryContractInput } from '@/lib/management/battery-contracts';
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
const FIELDS = ['store_id', 'customer_id', 'status', 'signed_on', 'id_card_issued_on', 'starts_at', 'ends_at', 'paid_method', 'deposit_method', ...Object.keys(TEXT_LIMITS), ...MONEY_FIELDS];

export function parseBatteryInput(body: unknown, editing = false): BatteryContractInput {
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
  if (!BATTERY_STATUSES.some(option => option.value === value.status)) throw new BatteryContractError('Trạng thái hợp đồng không hợp lệ.');
  if (!BATTERY_PAYMENT_METHODS.includes(value.paid_method as never) || !BATTERY_PAYMENT_METHODS.includes(value.deposit_method as never)) throw new BatteryContractError('Hình thức thanh toán chỉ nhận CK hoặc TM.');
  if (typeof value.signed_on !== 'string' || !validDate(value.signed_on)) throw new BatteryContractError('Nhập ngày ký hợp đồng hợp lệ.');
  if (typeof value.id_card_issued_on !== 'string' || (value.id_card_issued_on && !validDate(value.id_card_issued_on))) throw new BatteryContractError('Ngày cấp CCCD không hợp lệ.');
  if (typeof value.starts_at !== 'string' || !validTime(value.starts_at)) throw new BatteryContractError('Nhập thời điểm bắt đầu thuê hợp lệ.');
  if (typeof value.ends_at !== 'string' || (value.ends_at && !validTime(value.ends_at))) throw new BatteryContractError('Thời điểm kết thúc thuê không hợp lệ.');
  if (value.ends_at && Date.parse(`${value.ends_at}+07:00`) <= Date.parse(`${value.starts_at}+07:00`)) throw new BatteryContractError('Thời điểm kết thúc phải sau thời điểm bắt đầu.');
  if (!text.customer_name) throw new BatteryContractError('Nhập tên khách hàng (Bên B).');
  if (!text.battery_name) throw new BatteryContractError('Nhập loại pin cho thuê.');
  if (editing ? typeof value.revision !== 'string' || !/^\d{1,20}$/.test(value.revision) : typeof value.request_id !== 'string' || !uuid.test(value.request_id)) throw new BatteryContractError('Phiên bản hợp đồng không hợp lệ. Tải lại trang rồi thử lại.');
  return {
    ...text, ...money, store_id: Number(value.store_id), customer_id: value.customer_id === null ? null : Number(value.customer_id),
    status: value.status as BatteryContractInput['status'], signed_on: value.signed_on, id_card_issued_on: value.id_card_issued_on,
    starts_at: value.starts_at, ends_at: value.ends_at, paid_method: value.paid_method as BatteryContractInput['paid_method'], deposit_method: value.deposit_method as BatteryContractInput['deposit_method'],
    ...(editing ? { revision: String(value.revision) } : { request_id: String(value.request_id).toLowerCase() }),
  };
}

const SELECT = `SELECT b.*, b.signed_on::text AS signed_on_text, b.id_card_issued_on::text AS id_card_issued_on_text, b.xmin::text AS revision,
  s.store_name, s.store_address, s.store_phone FROM himoto.battery_contracts b LEFT JOIN himoto.stores s ON s.id=b.store_id`;
const localTime = (input: unknown) => input instanceof Date ? new Date(input.getTime() + 7 * 3600000).toISOString().slice(0, 16) : '';
const money = (input: unknown) => input == null ? null : Number(input);
const text = (input: unknown) => input == null ? '' : String(input);
function map(row: Record<string, unknown>): BatteryContract {
  return {
    id: Number(row.id), code: text(row.code), store_id: Number(row.store_id), store_name: text(row.store_name), store_address: text(row.store_address), store_phone: text(row.store_phone),
    customer_id: row.customer_id == null ? null : Number(row.customer_id), status: text(row.status) as BatteryContract['status'], staff_name: text(row.staff_name),
    signed_on: text(row.signed_on_text), signed_place: text(row.signed_place), customer_name: text(row.customer_name), customer_phone: text(row.customer_phone),
    customer_address: text(row.customer_address), customer_id_card: text(row.customer_id_card), id_card_issued_on: text(row.id_card_issued_on_text), id_card_issued_by: text(row.id_card_issued_by),
    battery_name: text(row.battery_name), vehicle_license: text(row.vehicle_license), vehicle_brand: text(row.vehicle_brand), vehicle_type: text(row.vehicle_type),
    vehicle_color: text(row.vehicle_color), vehicle_year: text(row.vehicle_year), starts_at: localTime(row.starts_at), ends_at: localTime(row.ends_at),
    rent_price: money(row.rent_price), price_unit: text(row.price_unit), package_name: text(row.package_name), paid_amount: money(row.paid_amount),
    paid_method: text(row.paid_method) as BatteryContract['paid_method'], deposit_amount: money(row.deposit_amount), deposit_note: text(row.deposit_note),
    deposit_method: text(row.deposit_method) as BatteryContract['deposit_method'], notes: text(row.notes),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : text(row.created_at), revision: text(row.revision),
  };
}

export async function listBatteryContracts(client: Database, storeId?: number) {
  if (storeId !== undefined && (!Number.isSafeInteger(storeId) || storeId <= 0)) throw new BatteryContractError('Cơ sở không hợp lệ.');
  const result = await client.query(`${SELECT} WHERE b.deleted_at IS NULL AND ($1::bigint IS NULL OR b.store_id=$1) ORDER BY b.starts_at DESC, b.id DESC LIMIT 5000`, [storeId ?? null]);
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

export async function saveBatteryContract(client: Database, actorId: number, raw: BatteryContractInput, id?: number) {
  if (!Number.isSafeInteger(actorId) || actorId <= 0 || (id !== undefined && (!Number.isSafeInteger(id) || id <= 0))) throw new BatteryContractError('Mã hợp đồng hoặc người thực hiện không hợp lệ.');
  const input = parseBatteryInput(raw, id !== undefined);
  await lock(client);
  const hash = createHash('sha256').update(JSON.stringify({ actorId, ...input })).digest('hex');
  if (id === undefined) {
    const previous = await client.query('SELECT id, request_hash, deleted_at FROM himoto.battery_contracts WHERE request_id=$1', [input.request_id]);
    if (previous.rowCount) {
      if (previous.rows[0].request_hash !== hash || previous.rows[0].deleted_at) throw new BatteryContractError('Mã lần lưu đã được dùng. Tải lại trang trước khi tạo hợp đồng khác.', 409);
      return readOne(client, Number(previous.rows[0].id));
    }
  } else if ((await readOne(client, id)).revision !== input.revision) throw new BatteryContractError('Hợp đồng đã được người khác cập nhật. Tải lại trang và mở lại để sửa.', 409);
  const store = await client.query("SELECT id FROM himoto.stores WHERE id=$1 AND status IN ('opening','active') FOR SHARE", [input.store_id]);
  if (!store.rowCount) throw new BatteryContractError('Cơ sở không tồn tại hoặc đã ngừng hoạt động.', 409);
  if (input.customer_id !== null && !(await client.query('SELECT id FROM himoto.customers WHERE id=$1 FOR SHARE', [input.customer_id])).rowCount) throw new BatteryContractError('Khách hàng đã chọn không còn tồn tại. Tra cứu lại khách hàng.', 409);
  const values = [input.store_id, input.customer_id, input.status, input.staff_name, input.signed_on, input.signed_place, input.customer_name, input.customer_phone,
    input.customer_address, input.customer_id_card, input.id_card_issued_on || null, input.id_card_issued_by, input.battery_name, input.vehicle_license, input.vehicle_brand,
    input.vehicle_type, input.vehicle_color, input.vehicle_year, `${input.starts_at}:00+07:00`, input.ends_at ? `${input.ends_at}:00+07:00` : null, input.rent_price,
    input.price_unit, input.package_name, input.paid_amount, input.paid_method, input.deposit_amount, input.deposit_note, input.deposit_method, input.notes, actorId];
  const columns = 'store_id,customer_id,status,staff_name,signed_on,signed_place,customer_name,customer_phone,customer_address,customer_id_card,id_card_issued_on,id_card_issued_by,battery_name,vehicle_license,vehicle_brand,vehicle_type,vehicle_color,vehicle_year,starts_at,ends_at,rent_price,price_unit,package_name,paid_amount,paid_method,deposit_amount,deposit_note,deposit_method,notes';
  if (id !== undefined) {
    await client.query(`UPDATE himoto.battery_contracts SET (${columns},updated_by,updated_at) = (${values.map((_, index) => `$${index + 1}`).join(',')},now()) WHERE id=$${values.length + 1}`, [...values, id]);
  } else {
    const code = await nextCode(client, input.signed_on);
    id = Number((await client.query(`INSERT INTO himoto.battery_contracts(${columns},created_by,updated_by,code,request_id,request_hash)
      VALUES(${values.map((_, index) => `$${index + 1}`).join(',')},$${values.length},$${values.length + 1},$${values.length + 2},$${values.length + 3}) RETURNING id`,
      [...values, code, input.request_id, hash])).rows[0].id);
  }
  return readOne(client, id);
}

export async function deleteBatteryContract(client: Database, id: number, revision: string, actorId: number) {
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(actorId) || actorId <= 0 || !/^\d{1,20}$/.test(revision)) throw new BatteryContractError('Mã hợp đồng hoặc phiên bản không hợp lệ.');
  await lock(client);
  if ((await readOne(client, id)).revision !== revision) throw new BatteryContractError('Hợp đồng đã được người khác cập nhật. Tải lại trang và kiểm tra trước khi xóa.', 409);
  await client.query('UPDATE himoto.battery_contracts SET deleted_at=now(), updated_at=now(), updated_by=$2 WHERE id=$1', [id, actorId]);
  return null;
}
