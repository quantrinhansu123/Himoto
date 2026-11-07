import { BATTERY_COLLECTION_METHODS,BATTERY_PAYMENT_METHODS,BATTERY_STATUSES,type BatteryContractInput,type BatteryCollectionMethod } from "./battery-contracts";
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

