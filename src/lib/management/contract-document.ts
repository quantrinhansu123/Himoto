import { ManagementDataset, ManagementRow } from './types';
import { VEHICLE_TYPES } from './config';
import { validIdentityIssueDate } from './customer-identity';
import { contractNumberError, paperContractNumber } from './contract-number';
import { addRentalDays, vietnamRentalTime } from './rental-time';
import { chargeErrors, chargeTotal, type ContractCharge, type ContractCollection } from './contract-charges';
import { billingUnitLabel, type CustomInstallment, type OwnershipTerm } from './contract-billing';
import { documentRequirements, type ContractDocumentRequirements } from './contract-requirements';

export const CUSTOMER_FIELDS = ['name', 'phone', 'email', 'address', 'id_card', 'id_card_issued_on', 'id_card_issued_by', 'driver_license_number', 'driver_license_issued_on', 'birthday', 'relatives_text', 'warning_note', 'customer_type', 'nationality', 'contact_channel', 'contact_detail'] as const;
export type CustomerDetails = Record<(typeof CUSTOMER_FIELDS)[number], string> & { relatives_json?: string };
export interface ContractRelative { name: string; relationship: string; phone: string }
export function emptyRelative(): ContractRelative { return { name: '', relationship: '', phone: '' }; }
export interface VehicleDetails {
  stock_store_id?: string; stock_store_name?: string;
  id: string; name: string; license: string; brand: string; type_text: string; color: string; year: string;
  driver_name: string; driver_license_number: string; driver_license_issued_on: string;
  borrow_hats: string; borrow_raincoats: string; rent_at: string; return_at: string;
}
export interface ContractDraft {
  contract_type_id?: string;
  contract_type_name?: string;
  contract_type_months?: string;
  // Vehicle selection and contract staff branch; store_id remains the revenue branch.
  vehicle_store_id?: string;
  reservation?: boolean;
  ownership?: boolean;
  document_requirements?: ContractDocumentRequirements;
  sales_staff_id?: string;
  tls_staff_id?: string;
  ownership_term_months?: OwnershipTerm;
  custom_installments?: CustomInstallment[];
  customer_lookup?: string;
  extra_charges?: ContractCharge[];
  collections?: ContractCollection[];
  deposit_paid_amount?: string;
  contract_number: string; signed_on: string; store_id: string; staff_id: string; staff_name: string;
  customer_id: number | null; customer: CustomerDetails; vehicles: VehicleDetails[];
  start_date: string; end_date: string; unit_price: string; total_amount: string; paid_amount: string;
  deposit_amount: string; package_name: string; payment_method: string; deposit_payment_method: string;
  collateral_description: string; customer_source: string; customer_source_url: string; authorization_date: string; created_on: string;
  relatives: [ContractRelative, ContractRelative];
}
const value = (input: unknown) => input == null ? '' : String(input);
export function contractStaffStoreId(draft: ContractDraft) { return draft.vehicle_store_id ?? draft.store_id; }
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
function relativeRecord(input: unknown): ContractRelative {
  const row = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return { name: value(row.name).trim(), relationship: value(row.relationship || row.relation).trim(), phone: value(row.phone).trim() };
}
function parseRelativeLine(part: string): ContractRelative {
  const text = part.trim();
  const phone = text.match(/:\s*(\+?\d[\d\s.()-]*)$/);
  const withoutPhone = phone ? text.slice(0, phone.index).trim() : text;
  const relation = withoutPhone.match(/^(.*)\(([^)]*)\)\s*$/);
  if (relation) return { name: relation[1].trim(), relationship: relation[2].trim(), phone: (phone?.[1] || '').trim() };
  return { name: withoutPhone, relationship: '', phone: (phone?.[1] || '').trim() };
}
export function pairRelatives(input: unknown, fallbackText = ''): [ContractRelative, ContractRelative] {
  let list: ContractRelative[] = [];
  let parsed = input;
  if (typeof input === 'string' && input.trim()) { try { parsed = JSON.parse(input); } catch { parsed = input; } }
  if (Array.isArray(parsed)) list = parsed.map(relativeRecord);
  const filled = list.filter(item => item.name || item.relationship || item.phone);
  const source = filled.length ? filled : fallbackText.split(' - Và: ').map(parseRelativeLine).filter(item => item.name || item.phone);
  return [source[0] || emptyRelative(), source[1] || emptyRelative()];
}
export function formatRelatives(relatives: ContractRelative[]) {
  return relatives.filter(item => item.name || item.phone).map(item => `${item.name}${item.relationship ? ` (${item.relationship})` : ''}${item.phone ? `: ${item.phone}` : ''}`).join(' - Và: ');
}
export function relativesFromRow(row?: ManagementRow | null) {
  return pairRelatives(row?.relatives_json, value(row?.relatives_text));
}
export function customerDetails(row?: ManagementRow | null): CustomerDetails {
  return Object.fromEntries(CUSTOMER_FIELDS.map(key => [key,
    key === 'id_card_issued_on' || key === 'driver_license_issued_on' || key === 'birthday' ? dateInput(row?.[key]) : value(row?.[key]),
  ])) as CustomerDetails;
}
export function emptyVehicle(): VehicleDetails {
  return { id: '', name: '', license: '', brand: '', type_text: '', color: '', year: '', driver_name: '', driver_license_number: '', driver_license_issued_on: '', borrow_hats: '02', borrow_raincoats: '02', rent_at: '', return_at: '' };
}
export function vehicleDetails(row: ManagementRow, customer: CustomerDetails): VehicleDetails {
  return { ...emptyVehicle(), id: String(row.id), name: row.name, license: value(row.license), brand: value(row.brand),
    stock_store_id: value(row.store_id), stock_store_name: value(row.store_name),
    type_text: VEHICLE_TYPES.find(type => type.value === row.type)?.label || value(row.type), color: value(row.color), year: value(row.year),
    driver_name: customer.name, driver_license_number: customer.driver_license_number, driver_license_issued_on: customer.driver_license_issued_on };
}
function nowDate() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}
function collectionMethods(collections: ContractCollection[] | undefined, purpose: 'deposit' | 'rental', fallback: string) {
  return [...new Set((collections || []).filter(item => item.purpose === purpose).map(item => item.method))].join(', ') || fallback;
}
export function createContractDraft(dataset: ManagementDataset, storeId: string, row?: ManagementRow | null): ContractDraft {
  const profile = row?.profile_json ? JSON.parse(String(row.profile_json)) as Partial<ContractDraft> : {};
  if(profile.customer)profile.customer={...customerDetails(profile.customer as unknown as ManagementRow),...profile.customer};
  if (row?.draft_json) {
    const snapshot = JSON.parse(String(row.draft_json)) as ContractDraft;
    if (!snapshot.customer || !Array.isArray(snapshot.vehicles) || !snapshot.vehicles.length) throw new Error('Thông tin hợp đồng đã lưu không hợp lệ.');
    const live = row.status !== 'draft' ? {
      ...(row.end_date ? { end_date: dateTimeInput(row.end_date) } : {}),
      ...(row.total_amount != null ? { total_amount: value(row.billing_base_total ?? row.total_amount) } : {}),
    } : {};
    const collections = row.collections_json ? JSON.parse(String(row.collections_json)) as ContractCollection[] : snapshot.collections;
    return { ...(row.contract_type_id ? {contract_type_id:value(row.contract_type_id),contract_type_name:value(row.contract_type_name),contract_type_months:value(row.contract_type_months)} : {}), ...structuredClone(snapshot), ...live,
      ...(row.paid_amount != null ? {paid_amount:value(row.paid_amount)} : {}),
      ...(row.deposit_paid != null ? {deposit_paid_amount:value(row.deposit_paid)} : {}),
      ...(collections ? {collections} : {}),
      ...(row.status!=='draft' && collections?.length ? {
        payment_method:collectionMethods(collections, 'rental', snapshot.payment_method),
        deposit_payment_method:collectionMethods(collections, 'deposit', snapshot.deposit_payment_method),
      } : {}), staff_name: snapshot.staff_name || '', customer: { ...customerDetails(snapshot.customer as unknown as ManagementRow), ...snapshot.customer },
      vehicles: snapshot.vehicles.map(vehicle => ({ ...emptyVehicle(), ...vehicle })), contract_number: row.status === 'draft' ? paperContractNumber(snapshot.contract_number) : row.code, relatives: pairRelatives(snapshot.relatives, snapshot.customer.relatives_text),
      created_on: dateInput(snapshot.created_on) || dateInput(row.created_at) || nowDate(), ...profile };
  }
  const sourceCustomer = row ? dataset.customers.find(item => item.id === row.customer_id) || { ...row,
    name: value(row.customer_name), phone: value(row.customer_phone), id_card: value(row.customer_id_card),
    address: value(row.customer_address), email: value(row.customer_email),
    driver_license_number: value(row.customer_driver_license_number), driver_license_issued_on: value(row.customer_driver_license_issued_on) } : null;
  const relatives = relativesFromRow(sourceCustomer);
  const customer = { ...customerDetails(sourceCustomer), relatives_text: formatRelatives(relatives) || value(sourceCustomer?.relatives_text) };
  const items: Record<string, unknown>[] = row?.legacy_items_json ? JSON.parse(String(row.legacy_items_json)) : [];
  const apiVehicles: Record<string, unknown>[] = row?.vehicles_json ? JSON.parse(String(row.vehicles_json)) : [];
  // Issued contracts keep live rental lines in vehicles_json; prefer those over stale order_items after a swap.
  const sourceVehicles = row && row.status !== 'draft' && apiVehicles.length ? apiVehicles : items.length ? items : apiVehicles;
  const vehicles = sourceVehicles.map(item => {
    const id = value(item.vehicle_id ?? item.id);
    const master = dataset.vehicles.find(vehicle => String(vehicle.id) === id);
    const legacy = items.find(line => value(line.vehicle_id ?? line.id) === id) || {};
    const embedded = { ...legacy, ...apiVehicles.find(vehicle => value(vehicle.id) === id), ...item };
    const details = master ? vehicleDetails(master, customer) : { ...emptyVehicle(), id, name: value(embedded.name), license: value(embedded.license),
      brand: value(embedded.brand), color: value(embedded.color), year: value(embedded.year),
      type_text: VEHICLE_TYPES.find(type => type.value === (embedded.type === 'electric' ? 'xe_dien' : embedded.type))?.label || value(embedded.type),
      driver_name: customer.name, driver_license_number: customer.driver_license_number, driver_license_issued_on: customer.driver_license_issued_on };
    for (const key of ['driver_name', 'driver_license_number', 'borrow_hats', 'borrow_raincoats'] as const) {
      const from = embedded[key] ?? item[key] ?? legacy[key];
      if (from != null) details[key] = value(from);
    }
    const issuedOn = embedded.driver_license_issued_on ?? item.driver_license_issued_on ?? legacy.driver_license_issued_on;
    if (issuedOn) details.driver_license_issued_on = dateInput(issuedOn);
    return details;
  });
  const vehicle = row ? dataset.vehicles.find(item => item.id === row.vehicle_id) : null;
  const startDate = row ? dateTimeInput(row.start_date) : vietnamRentalTime();
  const collections = row?.collections_json ? JSON.parse(String(row.collections_json)) as ContractCollection[] : undefined;
  return { contract_number: row?.status === 'draft' ? paperContractNumber(row.code) : row?.code || '', signed_on: dateInput(row?.signed_on || row?.created_at) || nowDate(),
    ...(row?.contract_type_id ? { contract_type_id: value(row.contract_type_id), contract_type_name: value(row.contract_type_name), contract_type_months: value(row.contract_type_months) } : {}),
    store_id: value(row?.store_id) || (storeId === 'all' ? '' : storeId),
    vehicle_store_id: value(row?.store_id) || (storeId === 'all' ? '' : storeId), staff_id: value(row?.staff_id), staff_name: value(row?.staff_name),
    customer_id: row?.customer_id ? Number(row.customer_id) : null, customer,
    vehicles: vehicles.length ? vehicles : [vehicle ? vehicleDetails(vehicle, customer) : emptyVehicle()],
    start_date: startDate, end_date: row ? dateTimeInput(row.end_date) : addRentalDays(startDate, '1'),
    unit_price: value(vehicle?.daily_price), total_amount: value(row?.total_amount), paid_amount: row ? value(row.paid_amount) : '0',
    deposit_amount: value(row?.deposit_amount), package_name: value(row?.package_name) || (/^(monthly|ownership)/.test(String(row?.rental_type ?? '')) ? 'Theo tháng' : 'Theo ngày'),
    ...(row?.rental_type === 'ownership' ? { ownership: true, ownership_term_months: value(row.ownership_term_months) as OwnershipTerm || 'custom' } : {}),
    payment_method: collectionMethods(collections, 'rental', value(row?.payment_method)), deposit_payment_method: collectionMethods(collections, 'deposit', value(row?.deposit_payment_method)), collateral_description: value(row?.collateral_description),
    customer_source: value(row?.customer_source), customer_source_url: value(row?.customer_source_url), authorization_date: dateInput(row?.authorization_date),
    created_on: dateInput(row?.created_at) || nowDate(), relatives,
    ...(collections ? {collections} : {}),
    ...profile,
    ...(row?.deposit_paid != null ? {deposit_paid_amount:value(row.deposit_paid)} : {}), };
}
export function normalizeCustomerLookup(input:string) { return /^[+\d\s.()-]+$/.test(input) ? input.replace(/\D/g,'') : input.trim().replace(/\s/g,'').toUpperCase(); }
export function validCustomerLookup(input:string) { const value=normalizeCustomerLookup(input);return /^\d{6,15}$/.test(value)||value.length>=4&&value.length<=100&&/[A-Z]/.test(value); }
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
  if (!validIdentityIssueDate(customer.id_card_issued_on)) errors.id_card_issued_on = 'Ngày cấp CCCD/CMND không hợp lệ.';
  if (!validIdentityIssueDate(customer.driver_license_issued_on)) errors.driver_license_issued_on = 'Ngày cấp GPLX không hợp lệ.';
  if (customer.id_card_issued_by.length > 255) errors.id_card_issued_by = 'Nơi cấp CCCD/CMND tối đa 255 ký tự.';
  if (customer.customer_type === 'foreign') {
    delete errors.phone; delete errors.id_card; delete errors.address;
    if (!customer.id_card.trim() || customer.id_card.length > 100) errors.id_card = 'Nhập hộ chiếu / giấy tờ quốc tế (tối đa 100 ký tự).';
    if (!customer.phone.trim() && !customer.contact_detail?.trim()) errors.contact_detail = 'Nhập số quốc tế, WhatsApp, Facebook hoặc kênh liên hệ của khách.';
    for (const key of ['phone', 'nationality', 'contact_channel', 'contact_detail'] as const) if ((customer[key] || '').length > 1000) errors[key] = 'Thông tin tối đa 1.000 ký tự.';
  } else if (customer.customer_type && customer.customer_type !== 'vietnam') errors.customer_type = 'Loại khách hàng không hợp lệ.';
  return errors;
}
export function validateContractCustomer(customer: CustomerDetails, source: 'demo' | 'api') {
  const errors = validateCustomer(customer, source);
  delete errors.email;
  return errors;
}
export function validateOperationalCustomer(customer: CustomerDetails,source: 'demo'|'api') {
  const errors = validateCustomer(customer,source);
  if (!customer.id_card.trim()) delete errors.id_card;
  if (!customer.address.trim()) delete errors.address;
  return errors;
}
export function validateContractDraft(draft: ContractDraft, dataset: ManagementDataset, staff: ManagementRow[], source: 'demo' | 'api') {
  const errors: Record<string, string> = {};
  const numberError = contractNumberError(draft.contract_number);
  if (numberError) errors.contract_number = numberError;
  const requirements = documentRequirements(draft.document_requirements);
  Object.assign(errors,chargeErrors(draft.extra_charges,true));
  if (contractStaffStoreId(draft) && !dataset.stores.some(row => String(row.id) === draft.store_id)) errors.store_id = 'Chọn cơ sở nguồn khách / ghi nhận doanh thu.';
  if (!dataset.stores.some(row => String(row.id) === contractStaffStoreId(draft))) errors.vehicle_store_id = 'Chọn cửa hàng xe.';
  if (requirements.representative && !draft.staff_name.trim() && !staffMatchesStore(staff, contractStaffStoreId(draft)).some(row => String(row.id) === draft.staff_id && staffIsAvailable(row))) errors.staff_id = 'Chọn nhân sự tại cửa hàng xe hoặc nhập tên người đại diện.';
  if (!draft.customer_id) errors.id_card = 'Tra cứu hoặc tạo khách hàng trước khi in.';
  Object.assign(errors, validateContractCustomer(draft.customer, source));
  for (const key of ['phone','id_card','address'] as const) if (!requirements[key] && !draft.customer[key].trim()) delete errors[key];
  const relatives = pairRelatives(draft.relatives, draft.customer.relatives_text);
  relatives.slice(0,draft.customer.customer_type === 'foreign' ? 0 : requirements.relatives).forEach((relative, index) => {
    if (!relative.name.trim()) errors[`relative_${index}_name`] = `Nhập họ tên người thân ${index + 1}.`;
    if (!relative.relationship.trim()) errors[`relative_${index}_relationship`] = `Nhập quan hệ người thân ${index + 1}.`;
    if (!/^\+?\d{9,13}$/.test(relative.phone.replace(/[\s.()-]/g, ''))) errors[`relative_${index}_phone`] = `Nhập số điện thoại người thân ${index + 1} từ 9 đến 13 chữ số.`;
  });
  if (!draft.signed_on) errors.signed_on = 'Chọn ngày ký.';
  const validDateTime = (input: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input) && Number.isFinite(new Date(input).getTime());
  if (!validDateTime(draft.start_date)) errors.start_date = 'Chọn thời gian bắt đầu thuê.';
  if (!validDateTime(draft.end_date) || draft.end_date <= draft.start_date) errors.end_date = 'Thời gian hẹn trả phải sau thời gian bắt đầu.';
  const ids = new Set<string>();
  draft.vehicles.forEach((vehicle, index) => {
    if (!dataset.vehicles.some(row => String(row.id) === vehicle.id)) errors[`vehicle_${index}`] = 'Chọn xe hiện có trong hệ thống.';
    if (ids.has(vehicle.id)) errors[`vehicle_${index}`] = 'Xe này đã được chọn trên mẫu.';
    ids.add(vehicle.id);
    for (const key of ['borrow_hats', 'borrow_raincoats'] as const) if (!/^\d+$/.test(vehicle[key])) errors[`vehicle_${index}_${key}`] = 'Nhập số nguyên không âm.';
  });
  for (const key of ['unit_price', 'total_amount', 'paid_amount', 'deposit_amount'] as const) {
    const amount = draft[key];
    if (amount && (!/^\d+$/.test(amount) || !Number.isSafeInteger(Number(amount)))) errors[key] = 'Nhập số tiền nguyên không âm.';
  }
  return errors;
}
export function validateOperationalDraft(draft: ContractDraft,dataset: ManagementDataset,staff: ManagementRow[],source: 'demo'|'api') {
  const errors = validateContractDraft({...draft,document_requirements:{phone:true,id_card:false,address:false,representative:false,relatives:0}},dataset,staff,source);
  delete errors.signed_on;
  if (!draft.customer_id) errors.id_card = 'Tra cứu hoặc tạo hồ sơ khách hàng để gắn hợp đồng.';
  if (!draft.total_amount) errors.total_amount = 'Nhập tiền thuê để đối chiếu công nợ.';
  return errors;
}
export function validateReservationDraft(draft: ContractDraft, dataset: ManagementDataset, staff: ManagementRow[], source: 'demo' | 'api') {
  const errors = validateContractDraft(draft, dataset, staff, source);
  // Legal signatures and relatives are completed before printing the rental contract.
  for (const key of Object.keys(errors)) if (key === 'signed_on' || key === 'address' || key.startsWith('relative_')) delete errors[key];
  if (!draft.total_amount || Number(draft.total_amount) <= 0) errors.total_amount = 'Nhập tiền thuê dự kiến để đối chiếu khoản giữ xe.';
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
    staff_name: draft.staff_name || value(staff.name),
    lessor: { company_name: 'CÔNG TY CP THƯƠNG MẠI DỊCH VỤ HIMOTO VIỆT NAM', tax_code: '0110863055', director_name: 'Nguyễn Thu Thủy', director_title: 'Giám đốc',
      head_office: 'Sn 31 dãy C1 Tổ 28 Khu tập thể Đồng Bát, Bệnh viện 198 Bộ Công An, P. Từ Liêm, Tp. Hà Nội, VN',
      branch_name: store.name, branch_address: value(store.address), branch_phone: value(store.phone),
      representative_name: staff.name, representative_title: value(staff.position),
      authorization: { date: printedDate(draft.authorization_date), party_name: staff.name } },
    relatives: pairRelatives(draft.relatives, draft.customer.relatives_text),
    customer: { ...draft.customer, phone:draft.customer.phone||(draft.customer.customer_type==='foreign'?[draft.customer.contact_channel,draft.customer.contact_detail].filter(Boolean).join(': '):''), relatives_text: formatRelatives(pairRelatives(draft.relatives, draft.customer.relatives_text)), id_card_issued_on: printedDate(draft.customer.id_card_issued_on) },
    customer_source: { name: draft.customer_source, url: draft.customer_source_url },
    vehicles, vehicles_count: vehicles.length, primary_vehicle: vehicles[0],
    rent_time: { start: timeParts(draft.start_date), end: timeParts(draft.end_date) },
    pricing: { unit_price_text: draft.unit_price ? `${money(draft.unit_price)} / ${billingUnitLabel(draft.package_name)}` : 'Theo bảng giá',
      paid_amount_formatted: money(draft.paid_amount), payment_method: draft.payment_method, payment_method_text: draft.paid_amount==='' ? 'Chưa có số liệu' : Number(draft.paid_amount)>0 ? draft.payment_method || '........................' : 'Chưa thu',
      package_name: draft.package_name, calculation_text: `Tổng phí thuê${chargeTotal(draft.extra_charges) ? ' và phí khác' : ''}: ${money(draft.total_amount)}`,
      installment_text: '' },
    deposit: { deposit_amount_formatted: money(draft.deposit_amount), paid_amount_formatted:draft.deposit_paid_amount===undefined ? '' : money(draft.deposit_paid_amount), collateral_description: draft.collateral_description || '........................', collateral_text: draft.collateral_description, payment_method: draft.deposit_payment_method, payment_method_text: draft.deposit_payment_method || '........................' },
    equipment: { total_hats: vehicles.reduce((sum, v) => sum + Number(v.borrow_hats), 0), total_raincoats: vehicles.reduce((sum, v) => sum + Number(v.borrow_raincoats), 0) },
    signers: { signer_a_name: staff.name, signer_b_name: draft.customer.name },
    ownership_schedule: [] as {number:number;due_at:string;amount:number}[],
    // Blank return receipt preserved from the template; this composer does not perform a return.
    return_confirmation: { return_hour: '', return_minute: '', signer_a_name: '', signer_b_name: '', refund_amount_formatted: '', additional_note: '' },
  };
}
export type LegacyContractDocument = ReturnType<typeof buildContractDocument>;
