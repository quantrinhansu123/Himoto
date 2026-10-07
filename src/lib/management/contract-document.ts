import { ManagementDataset, ManagementRow } from './types';
import { VEHICLE_TYPES } from './config';

export const CUSTOMER_FIELDS = ['name', 'phone', 'email', 'address', 'id_card', 'id_card_issued_on', 'id_card_issued_by', 'birthday', 'relatives_text', 'warning_note'] as const;
export type CustomerDetails = Record<(typeof CUSTOMER_FIELDS)[number], string>;
export interface VehicleDetails {
  id: string; name: string; license: string; brand: string; type_text: string; color: string; year: string;
  driver_name: string; driver_license_number: string; driver_license_issued_on: string;
  borrow_hats: string; borrow_raincoats: string; rent_at: string; return_at: string;
}
export interface ContractDraft {
  customer_lookup?: string;
  contract_number: string; signed_on: string; store_id: string; staff_id: string;
  customer_id: number | null; customer: CustomerDetails; vehicles: VehicleDetails[];
  start_date: string; end_date: string; unit_price: string; total_amount: string; paid_amount: string;
  deposit_amount: string; package_name: string; payment_method: string; deposit_payment_method: string;
  collateral_description: string; customer_source: string; customer_source_url: string; authorization_date: string;
}
const value = (input: unknown) => input == null ? '' : String(input);
export const dateInput = (input: unknown) => value(input).slice(0, 10);
export function dateTimeInput(input: unknown): string {
  const timestamp = value(input);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(timestamp)) return '';
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp)) return timestamp.slice(0, 16);
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
export function customerDetails(row?: ManagementRow | null): CustomerDetails {
  return Object.fromEntries(CUSTOMER_FIELDS.map(key => [key, key === 'id_card_issued_on' || key === 'birthday' ? dateInput(row?.[key]) : value(row?.[key])])) as CustomerDetails;
}
export function emptyVehicle(): VehicleDetails {
  return { id: '', name: '', license: '', brand: '', type_text: '', color: '', year: '', driver_name: '', driver_license_number: '', driver_license_issued_on: '', borrow_hats: '0', borrow_raincoats: '0', rent_at: '', return_at: '' };
}
export function vehicleDetails(row: ManagementRow, customer: CustomerDetails): VehicleDetails {
  return { ...emptyVehicle(), id: String(row.id), name: row.name, license: value(row.license), brand: value(row.brand),
    type_text: VEHICLE_TYPES.find(type => type.value === row.type)?.label || value(row.type), color: value(row.color), year: value(row.year),
    driver_name: customer.name, driver_license_number: value(row.driver_license_number), driver_license_issued_on: dateInput(row.driver_license_issued_on) };
}
function nowDate() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}
export function createContractDraft(dataset: ManagementDataset, storeId: string, row?: ManagementRow | null): ContractDraft {
  if (row?.draft_json) {
    const snapshot = JSON.parse(String(row.draft_json)) as ContractDraft;
    if (!snapshot.customer || !Array.isArray(snapshot.vehicles) || !snapshot.vehicles.length) throw new Error('Thông tin hợp đồng đã lưu không hợp lệ.');
    return { ...structuredClone(snapshot), contract_number: row.code };
  }
  const customer = customerDetails(row ? dataset.customers.find(item => item.id === row.customer_id) || { ...row,
    name: value(row.customer_name), phone: value(row.customer_phone), id_card: value(row.customer_id_card),
    address: value(row.customer_address), email: value(row.customer_email) } : null);
  const items: Record<string, unknown>[] = row?.legacy_items_json ? JSON.parse(String(row.legacy_items_json)) : [];
  const apiVehicles: Record<string, unknown>[] = row?.vehicles_json ? JSON.parse(String(row.vehicles_json)) : [];
  const sourceVehicles = items.length ? items : apiVehicles;
  const vehicles = sourceVehicles.map(item => {
    const id = value(item.vehicle_id ?? item.id);
    const master = dataset.vehicles.find(vehicle => String(vehicle.id) === id);
    const details = master ? vehicleDetails(master, customer) : { ...emptyVehicle(), id, name: value(item.name), license: value(item.license) };
    for (const key of ['driver_name', 'driver_license_number', 'borrow_hats', 'borrow_raincoats'] as const) if (item[key] != null) details[key] = value(item[key]);
    if (item.driver_license_issued_on) details.driver_license_issued_on = dateInput(item.driver_license_issued_on);
    return details;
  });
  const vehicle = row ? dataset.vehicles.find(item => item.id === row.vehicle_id) : null;
  return { contract_number: row?.code || '', signed_on: dateInput(row?.signed_on || row?.created_at) || nowDate(),
    store_id: value(row?.store_id) || (storeId === 'all' ? '' : storeId), staff_id: value(row?.staff_id),
    customer_id: row?.customer_id ? Number(row.customer_id) : null, customer,
    vehicles: vehicles.length ? vehicles : [vehicle ? vehicleDetails(vehicle, customer) : emptyVehicle()],
    start_date: dateTimeInput(row?.start_date), end_date: dateTimeInput(row?.end_date),
    unit_price: value(vehicle?.daily_price), total_amount: value(row?.total_amount), paid_amount: value(row?.paid_amount),
    deposit_amount: value(row?.deposit_amount), package_name: row?.rental_type === 'monthly' ? 'Theo tháng' : 'Theo ngày',
    payment_method: '', deposit_payment_method: '', collateral_description: value(row?.collateral_description),
    customer_source: value(row?.customer_source), customer_source_url: value(row?.customer_source_url), authorization_date: dateInput(row?.authorization_date), };
}
export function normalizeIdCard(input: string) { return input.trim().replace(/\s/g, '').toUpperCase(); }
export function validIdCard(input: string, source: 'demo' | 'api') {
  const normalized = normalizeIdCard(input);
  return /^(?:\d{9}|\d{12})$/.test(normalized) || (source === 'demo' && /^DEMO-\d{6}$/.test(normalized));
}
export function staffMatchesStore(staff: ManagementRow[], storeId: string) {
  return storeId ? staff.filter(row => String(row.store_id) === storeId) : [];
}
export function staffIsAvailable(row: ManagementRow) { return ['active', '1'].includes(row.status); }
export function validateCustomer(customer: CustomerDetails, source: 'demo' | 'api') {
  const errors: Record<string, string> = {};
  if (!customer.name.trim()) errors.name = 'Nhập họ và tên khách hàng.';
  if (!/^\+?\d{9,13}$/.test(customer.phone.replace(/[\s.()-]/g, ''))) errors.phone = 'Nhập số điện thoại từ 9 đến 13 chữ số.';
  if (!validIdCard(customer.id_card, source)) errors.id_card = 'CCCD cần 12 chữ số; CMND cần 9 chữ số.';
  if (!customer.address.trim()) errors.address = 'Nhập địa chỉ khách hàng.';
  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) errors.email = 'Email chưa đúng định dạng.';
  return errors;
}
export function validateContractDraft(draft: ContractDraft, dataset: ManagementDataset, staff: ManagementRow[], source: 'demo' | 'api') {
  const errors: Record<string, string> = {};
  if (!dataset.stores.some(row => String(row.id) === draft.store_id)) errors.store_id = 'Chọn cơ sở cho thuê.';
  if (!staffMatchesStore(staff, draft.store_id).some(row => String(row.id) === draft.staff_id && staffIsAvailable(row))) errors.staff_id = 'Chọn nhân sự đang làm việc tại cơ sở này.';
  if (!draft.customer_id) errors.id_card = 'Tra cứu hoặc tạo khách hàng trước khi in.';
  Object.assign(errors, validateCustomer(draft.customer, source));
  if (!draft.signed_on) errors.signed_on = 'Chọn ngày ký.';
  const validDateTime = (input: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input) && Number.isFinite(new Date(input).getTime());
  if (!validDateTime(draft.start_date)) errors.start_date = 'Chọn thời gian bắt đầu thuê.';
  if (!validDateTime(draft.end_date) || draft.end_date <= draft.start_date) errors.end_date = 'Thời gian hẹn trả phải sau thời gian bắt đầu.';
  const ids = new Set<string>();
  draft.vehicles.forEach((vehicle, index) => {
    if (!dataset.vehicles.some(row => String(row.id) === vehicle.id && String(row.store_id) === draft.store_id)) errors[`vehicle_${index}`] = 'Chọn xe tại đúng cơ sở.';
    if (ids.has(vehicle.id)) errors[`vehicle_${index}`] = 'Xe này đã được chọn trên mẫu.';
    ids.add(vehicle.id);
    for (const key of ['borrow_hats', 'borrow_raincoats'] as const) if (!/^\d+$/.test(vehicle[key])) errors[`vehicle_${index}_${key}`] = 'Nhập số nguyên không âm.';
  });
  for (const key of ['unit_price', 'total_amount', 'paid_amount', 'deposit_amount'] as const) {
    const amount = draft[key];
    if (amount && (!/^\d+$/.test(amount) || !Number.isSafeInteger(Number(amount)))) errors[key] = 'Nhập số tiền nguyên không âm.';
  }
  if (draft.customer_source_url && !/^https?:\/\//i.test(draft.customer_source_url)) errors.customer_source_url = 'Liên kết cần bắt đầu bằng http:// hoặc https://.';
  return errors;
}
const money = (amount: string) => amount === '' ? '........................' : `${Number(amount).toLocaleString('vi-VN')} đ`;
function timeParts(input: string) {
  const [date, time = ''] = input.split('T'); const [year = '', month = '', day = ''] = date.split('-'); const [hour = '', minute = ''] = time.split(':');
  return { year, month, day, hour, minute };
}
const printedDate = (input: string) => input ? input.split('-').reverse().join('/') : '';
export function buildContractDocument(draft: ContractDraft, store: ManagementRow, staff: ManagementRow) {
  const signed = timeParts(draft.signed_on);
  const vehicles = draft.vehicles.map(vehicle => ({ ...vehicle, driver_license_issued_on: printedDate(vehicle.driver_license_issued_on),
    rent_at: `${printedDate(dateInput(draft.start_date))} ${draft.start_date.slice(11, 16)}`,
    return_at: `${printedDate(dateInput(draft.end_date))} ${draft.end_date.slice(11, 16)}` }));
  return {
    is_preview: true, contract_number: draft.contract_number || 'Chưa cấp số',
    contract_number_label: 'BẢN NHÁP - CHƯA PHÁT HÀNH',
    signed_date: { full_text: `Hôm nay, ngày ${signed.day} tháng ${signed.month} năm ${signed.year}` },
    lessor: { company_name: 'CÔNG TY CP THƯƠNG MẠI DỊCH VỤ HIMOTO VIỆT NAM', tax_code: '0110863055',
      head_office: 'Sn 31 dãy C1 Tổ 28 Khu tập thể Đồng Bát, Bệnh viện 198 Bộ Công An, P. Từ Liêm, Tp. Hà Nội, VN',
      branch_name: store.name, branch_address: value(store.address), branch_phone: value(store.phone),
      representative_name: staff.name, representative_title: value(staff.position),
      authorization: { date: printedDate(draft.authorization_date), party_name: staff.name } },
    customer: { ...draft.customer, id_card_issued_on: printedDate(draft.customer.id_card_issued_on) },
    customer_source: { name: draft.customer_source, url: draft.customer_source_url },
    vehicles, vehicles_count: vehicles.length, primary_vehicle: vehicles[0],
    rent_time: { start: timeParts(draft.start_date), end: timeParts(draft.end_date) },
    pricing: { unit_price_text: draft.unit_price ? `${money(draft.unit_price)} / ${draft.package_name === 'Theo tháng' ? 'tháng' : 'ngày'}` : 'Theo bảng giá',
      paid_amount_formatted: money(draft.paid_amount), payment_method_text: draft.payment_method || '........................',
      package_name: draft.package_name, calculation_text: `Tổng tiền thuê: ${money(draft.total_amount)}` },
    deposit: { deposit_amount_formatted: money(draft.deposit_amount), collateral_description: draft.collateral_description || '........................', payment_method_text: draft.deposit_payment_method || '........................' },
    equipment: { total_hats: vehicles.reduce((sum, v) => sum + Number(v.borrow_hats), 0), total_raincoats: vehicles.reduce((sum, v) => sum + Number(v.borrow_raincoats), 0) },
    signers: { signer_a_name: staff.name, signer_b_name: draft.customer.name },
    // Blank return receipt preserved from the template; this composer does not perform a return.
    return_confirmation: { return_hour: '', return_minute: '', signer_a_name: '', signer_b_name: '', refund_amount_formatted: '', additional_note: '' },
  };
}
export type LegacyContractDocument = ReturnType<typeof buildContractDocument>;
