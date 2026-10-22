import { createDemoDataset, reconcileDataset } from '@/fixtures/management-data';
import { CONTRACT_TYPES, resolveLocationStatus } from '@/lib/management/config';
import { EditableKind, ManagementDataset, ManagementKind, ManagementRepository, ManagementRow } from './types';
import { dateTimeInput } from './contract-document';
import { cloneContractRecord, updateContractRecord } from './contract-record';
import { DraftStorage, readDemoDrafts, saveDraftRecord, writeDemoDrafts, DEMO_DRAFT_STORAGE_KEY } from './contract-drafts';
import { normalizeStaffPosition } from './staff-positions';
import { applyInstallmentBilling } from './contract-billing';

export function createDemoRepository(draftStorage?: DraftStorage): ManagementRepository {
  let dataset = createDemoDataset();
  let initialized = false;
  const storage = () => draftStorage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  function initialize() {
    if (initialized) return;
    const target = storage();
    const drafts = target ? readDemoDrafts(target) : [];
    if (drafts.some(draft => dataset.contracts.some(row => row.id === draft.id || row.code === draft.code))) throw new Error('Bản nháp đã lưu trùng mã hoặc ID với dữ liệu mẫu. Dữ liệu lưu vẫn được giữ nguyên.');
    dataset = reconcileDataset({ ...dataset, contracts: [...drafts, ...dataset.contracts] });
    initialized = true;
  }
  function persist(next: ManagementDataset) {
    const target = storage();
    if (target) {
      try { writeDemoDrafts(target, next); }
      catch { throw new Error('Không lưu được bản nháp vào trình duyệt. Kiểm tra dung lượng và quyền lưu trữ rồi thử lại.'); }
    }
  }
  return {
    source: 'demo',
    async load() { initialize(); return structuredClone(dataset); },
    async loadKind(kind, _query = '') { initialize(); return structuredClone(dataset[kind]); },
    async save(kind: EditableKind, row: ManagementRow) {
      if (!['staff', 'customers', 'stores', 'vehicles'].includes(kind)) throw new Error('Danh sách hợp đồng chỉ đọc.');
      const records = dataset[kind];
      const existing = records.some(r => r.id === row.id);
      dataset = reconcileDataset({ ...dataset, [kind]: existing
        ? records.map(r => r.id === row.id ? { ...row } : r)
        : [{ ...row }, ...records] });
      return structuredClone(dataset);
    },
    async cloneContract(id) {
      const row = cloneContractRecord(dataset, id);
      const next = reconcileDataset({ ...dataset, contracts: [row, ...dataset.contracts] });
      if (row.status === 'draft') persist(next);
      dataset = next;
      return structuredClone({ row, dataset });
    },
    async saveContract(id, edits) {
      if (dataset.contracts.find(row => row.id === id)?.status === 'draft') throw new Error('Dùng Lưu nháp để cập nhật bản nháp đang soạn.');
      const row = updateContractRecord(dataset, id, edits);
      dataset = reconcileDataset({ ...dataset, contracts: dataset.contracts.map(record => record.id === id ? row : record) });
      return structuredClone({ row, dataset });
    },
    async saveContractDraft(id, edits) {
      initialize();
      const row = saveDraftRecord(dataset, id, edits);
      const next = reconcileDataset({ ...dataset, contracts: [row, ...dataset.contracts.filter(record => record.id !== row.id)] });
      persist(next); dataset = next;
      return structuredClone({ row, dataset });
    },
    async reset() { storage()?.removeItem(DEMO_DRAFT_STORAGE_KEY); dataset = createDemoDataset(); initialized = true; return structuredClone(dataset); },
  };
}

// These GET routes are present in apps/api/src/modules/*/*.controller.ts.
export const READ_ENDPOINTS: Record<ManagementKind, string> = {
  staff: '/auth/hr/staff', customers: '/auth/customers', stores: '/auth/stores',
  vehicles: '/auth/vehicle/vehicles', contracts: '/auth/order/car-rental',
};
type ApiRow = Record<string, unknown>;
const text = (value: unknown): string => value == null ? '' : value instanceof Date ? value.toISOString() : String(value);
const number = (value: unknown): number | undefined => value == null || value === '' || !Number.isFinite(Number(value)) ? undefined : Number(value);
const object = (value: unknown): ApiRow => value && typeof value === 'object' && !Array.isArray(value) ? value as ApiRow : {};
function relativeRows(value: unknown) {
  let parsed = value;
  if (typeof value === 'string') { try { parsed = JSON.parse(value); } catch { return []; } }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(object).filter(relative => relative.name || relative.phone).map(relative => ({
    name: text(relative.name), relationship: text(relative.relationship || relative.relation), phone: text(relative.phone),
  }));
}
function relativesText(value: unknown): string {
  if (typeof value === 'string') { try { JSON.parse(value); } catch { return value; } }
  return relativeRows(value).map(relative => `${relative.name}${relative.relationship ? ` (${relative.relationship})` : ''}${relative.phone ? `: ${relative.phone}` : ''}`).join(' - Và: ');
}
function relativesJson(value: unknown) {
  const rows = relativeRows(value);
  return rows.length ? JSON.stringify(rows) : '';
}

export function mapApiRow(kind: ManagementKind, raw: ApiRow): ManagementRow {
  const id = number(raw.id);
  if (id === undefined) throw new Error('API trả về bản ghi thiếu ID hợp lệ.');
  const base: ManagementRow = { id, code: text(raw.code || raw.staff_code) || `#${id}`,
    name: text(raw.name || raw.full_name || raw.store_name), status: text(raw.status ?? raw.order_status),
    store_id: number(raw.current_store_id ?? raw.store_id), store_name: text(raw.store_name),
    phone: text(raw.phone || raw.store_phone), email: text(raw.email),
    address: text(raw.address || raw.store_address), created_at: text(raw.created_at),
  };
  if (kind === 'staff') return { ...base, position: normalizeStaffPosition(raw.position), hire_date: text(raw.joined_at), notes: text(raw.notes),
    user_id: number(raw.user_id),
    status: ({ '1': 'active', '0': 'inactive' } as Record<string, string>)[base.status] || base.status };
  if (kind === 'stores') return { ...base, manager_name: text(raw.manager_name),
    user_id: number(raw.user_id), kind: text(raw.kind), store_revision: text(raw.store_revision),
    vehicle_count: number(raw.vehicle_count), staff_count: number(raw.staff_count),
    status: ({ '1': 'active', '0': 'inactive', opening: 'active' } as Record<string, string>)[base.status] || base.status };
  if (kind === 'customers') return { ...base, customer_type:text(raw.customer_type)||'vietnam', nationality:text(raw.nationality),contact_channel:text(raw.contact_channel),contact_detail:text(raw.contact_detail), code: text(raw.code) || `KH-${String(id).padStart(3, '0')}`, id_card: text(raw.id_card || raw.identity_card), warning_note: text(raw.warning || raw.warning_note),
    first_rental_store_id: number(raw.first_rental_store_id), first_rental_store_name: text(raw.first_rental_store_name), first_rented_at: text(raw.first_rented_at),
    id_card_issued_on: text(raw.id_card_issued_on || raw.id_card_date).slice(0, 10), id_card_issued_by: text(raw.id_card_issued_by || raw.id_card_place),
    driver_license_number: text(raw.driver_license_number), driver_license_issued_on: text(raw.driver_license_issued_on).slice(0, 10),
    birthday: text(raw.birthday || raw.date_of_birth), relatives_text: text(raw.relatives_text) || relativesText(raw.relatives), relatives_json: relativesJson(raw.relatives),
    customer_revision: text(raw.customer_revision), contract_count: number(raw.contract_count), status: ['blacklist', 'bad_debt'].includes(base.status) ? 'blacklist' : ['draft', '0'].includes(base.status) ? 'draft' : raw.warning || raw.warning_note ? 'warning' :
      (({ '1': 'active', '0': 'draft' } as Record<string, string>)[base.status] || base.status) };
  if (kind === 'vehicles') {
    const openRentals = (Array.isArray(raw.rentals) ? raw.rentals : Array.isArray(raw.rental_blockers) ? raw.rental_blockers : []).map(object);
    const latestCustomer = openRentals.map(rental => text(rental.customer || rental.customer_name)).find(Boolean) || '';
    return { ...base, license: text(raw.license), brand: text(raw.brand), type: text(raw.type) === 'electric' ? 'xe_dien' : text(raw.type), vehicle_revision: text(raw.vehicle_revision),
    transfer_event_id:number(raw.transfer_event_id),transfer_from_store_id:number(raw.transfer_from_store_id),transfer_to_store_id:number(raw.transfer_to_store_id),
    transfer_from_store_name:text(raw.transfer_from_store_name),transfer_to_store_name:text(raw.transfer_to_store_name),transfer_receivable:number(raw.transfer_receivable),
    color: text(raw.color), chassis: text(raw.chassis), engine: text(raw.engine),
    rentals_json: Array.isArray(raw.rental_blockers) ? JSON.stringify(raw.rental_blockers) : Array.isArray(raw.rentals) ? JSON.stringify(raw.rentals) : '',
    holder_name: text(raw.holder_name) || latestCustomer || 'Lưu kho',
    beneficiary_store_id: number(raw.beneficiary_store_id ?? raw.current_store_id ?? raw.store_id), beneficiary_store_name: text(raw.beneficiary_store_name || raw.store_name),
    odometer: number(raw.odometer), daily_price: number(raw.daily_price), monthly_price: number(raw.monthly_price), year: text(raw.year),
    status: ({ rent: 'using', maintenance: 'repairing', holding: 'pending' } as Record<string, string>)[base.status] || base.status,
    location_status: (() => {
      const preset = String(raw.location_status || '');
      if (raw.gps_has_device == null && raw.gps_normalized_status == null && ['online','stopped','stale','warning', 'offline', 'none'].includes(preset)) return preset;
      return resolveLocationStatus({
        hasDevice: Boolean(raw.gps_has_device),
        normalizedStatus: raw.gps_normalized_status,
        lastAt: raw.gps_last_at,
      });
    })(),gps_latitude:number(raw.gps_latitude),gps_longitude:number(raw.gps_longitude),gps_last_sync:text(raw.gps_last_sync),gps_provider:text(raw.gps_provider),gps_heartbeat_at:text(raw.gps_heartbeat_at),gps_position_at:text(raw.gps_position_at),gps_reported_at:text(raw.gps_reported_at),gps_ignition:typeof raw.gps_ignition==='boolean'?Number(raw.gps_ignition):'' };
  }
  const customer = object(raw.customer);
  const vehicles = Array.isArray(raw.vehicles) ? raw.vehicles.map(object) : [];
  const store = object(raw.store);
  const code = text(raw.contract_number || raw.draft_reference || raw.code) || `#${id}`;
  const payload = object(raw.draft_payload);
  const saved = object(payload.management_composer);
  const snapshot = object(saved.draft);
  const salesStaffId = text(raw.sales_staff_id ?? object(saved.profile).sales_staff_id ?? snapshot.sales_staff_id);
  const salesAttribution = object(object(saved.profile_attribution).NVKD ?? object(saved.sales_attribution).NVKD);
  const mapped: ManagementRow = { ...base, code, name: code,
    sales_staff_id: /^[1-9]\d{0,14}$/.test(salesStaffId) ? Number(salesStaffId) : undefined, sales_staff_name: text(raw.sales_staff_name ?? salesAttribution.name),
    store_id: base.store_id ?? number(store.id), store_name: base.store_name || text(store.store_name || store.name),
    store_kind: text(raw.store_kind),
    staff_id: number(raw.staff_id ?? raw.contract_responsible_user_id),
    staff_name: text(raw.staff_name), representative_name: text(raw.representative_name || raw.staff_name),
    customer_id: number(raw.customer_id), customer_name: text(raw.customer_name || customer.name),
    customer_status: raw.customer_status == null ? undefined : ['2', 'blacklist', 'bad_debt'].includes(text(raw.customer_status)) ? 'blacklist' : text(raw.customer_status),
    customer_phone: text(raw.customer_phone || customer.phone), customer_type:text(raw.customer_type || customer.customer_type),nationality:text(raw.nationality || customer.nationality),contact_channel:text(raw.contact_channel || customer.contact_channel),contact_detail:text(raw.contact_detail || customer.contact_detail),
    customer_id_card: text(raw.customer_id_card || customer.id_card),
    customer_address: text(raw.customer_address || customer.address), customer_email: text(raw.customer_email || customer.email),
    customer_driver_license_number: text(raw.customer_driver_license_number), customer_driver_license_issued_on: text(raw.customer_driver_license_issued_on),
    id_card_issued_on: text(raw.id_card_issued_on), id_card_issued_by: text(raw.id_card_issued_by),
    relatives_text: relativesText(raw.relatives), relatives_json: relativesJson(raw.relatives), warning_note: text(raw.warning_note),
    vehicle_id: number(raw.vehicle_id ?? vehicles[0]?.id), vehicles_json: JSON.stringify(vehicles),
    overdue_items_json: Array.isArray(raw.overdue_items)?JSON.stringify(raw.overdue_items):undefined,
    vehicle_name: vehicles.map(v => text(v.name)).filter(Boolean).join(', '),
    license: vehicles.map(v => text(v.license)).filter(Boolean).join(', '),
    start_date: dateTimeInput(raw.start_date || raw.rent_at) || text(raw.start_date || raw.rent_at),
    end_date: dateTimeInput(raw.end_date || raw.return_at) || text(raw.end_date || raw.return_at),
    total_amount: number(raw.total_amount ?? raw.total), deposit_amount: number(raw.deposit_amount),
    paid_amount: number(raw.paid_amount), deposit_paid: number(raw.deposit_paid), deposit_refunded: number(raw.deposit_refunded), return_adjustment_amount: number(raw.return_adjustment_amount), unit_price: number(raw.unit_price), package_name: text(raw.package_name),
    collections_json:Array.isArray(raw.collections) ? JSON.stringify(raw.collections) : '',
    payment_method: text(raw.payment_method), deposit_payment_method: text(raw.deposit_payment_method),
    company_paid_amount: number(raw.company_paid_amount), company_payment_count: number(raw.company_payment_count),
    rental_type: text(raw.rental_type), notes: text(raw.notes ?? raw.note),
    contract_type_id: text(raw.contract_type_id || snapshot.contract_type_id || raw.rental_type || saved.rental_type),
    contract_type_name: text(raw.contract_type_name || snapshot.contract_type_name) || CONTRACT_TYPES.find(type=>type.value===text(raw.rental_type || saved.rental_type))?.label || text(raw.rental_type || saved.rental_type),
    contract_type_months: text(raw.contract_type_months ?? snapshot.contract_type_months ?? /^monthly_(\d+)$/.exec(text(raw.rental_type || saved.rental_type))?.[1]),
    ownership_term_months: [raw.rental_type,saved.rental_type].includes('ownership') ? text(object(saved.profile).ownership_term_months ?? snapshot.ownership_term_months) || 'custom' : '',
    signed_on: text(raw.signed_on), authorization_date: text(raw.authorization_date), collateral_description: text(raw.collateral_description),
    customer_source: text(raw.customer_source), customer_source_url: text(raw.customer_source_url),
    legacy_items_json: JSON.stringify(Array.isArray(payload.order_items) ? payload.order_items : []), draft_revision: text(raw.draft_revision),
    draft_json: typeof raw.draft_json === 'string' ? raw.draft_json : snapshot.customer && Array.isArray(snapshot.vehicles) ? JSON.stringify(snapshot) : undefined,
    billing_plan_json: saved.installment_plan ? JSON.stringify(saved.installment_plan) : '',
    profile_json: saved.profile ? JSON.stringify(saved.profile) : '',
    // Keep numeric/unrecognized statuses visible until the API contract is agreed.
  };
  if (mapped.status === 'draft' && saved.version === 1 && snapshot.customer && Array.isArray(snapshot.vehicles)) {
    const customer = object(snapshot.customer);
    const vehicles = snapshot.vehicles.map(object);
    return { ...mapped, draft_json: JSON.stringify(snapshot), rental_type: text(saved.rental_type), notes: text(saved.notes),
      staff_id: number(snapshot.staff_id), customer_id: number(snapshot.customer_id), customer_name: text(customer.name),
      customer_phone: text(customer.phone), customer_id_card: text(customer.id_card), vehicle_id: number(vehicles[0]?.id),
      vehicle_name: vehicles.map(vehicle => text(vehicle.name)).filter(Boolean).join(', '), license: vehicles.map(vehicle => text(vehicle.license)).filter(Boolean).join(', '),
      total_amount: number(snapshot.total_amount), deposit_amount: number(snapshot.deposit_amount), paid_amount: number(raw.paid_amount) ?? 0 };
  }
  return applyInstallmentBilling(mapped);
}

export function createApiRepository(baseUrl = '/api', options: { drafts?: boolean; staffDirectory?:boolean } = {}): ManagementRepository {
  let loaded: ManagementDataset | null = null;
  async function read(kind: ManagementKind, query = ''): Promise<ManagementRow[]> {
    const records: ManagementRow[] = [];
    for (let page = 1; page <= 1000; page++) {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') || localStorage.getItem('jwt_token') : null;
      const params = new URLSearchParams({ page: String(page), limit: '100' });
      if (query) for (const [key, value] of new URLSearchParams(query)) params.set(key, value);
      const endpoint=kind==='staff'&&options.staffDirectory?'/auth/contract-staff':READ_ENDPOINTS[kind];
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}${endpoint}?${params}`, {
        method: 'GET', cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!response.ok) throw new Error(`Không tải được ${kind} (HTTP ${response.status}). Kiểm tra kết nối và phiên đăng nhập.`);
      const envelope = object(await response.json());
      if (envelope.status && envelope.status !== 'success') throw new Error(`API ${kind} trả về trạng thái lỗi.`);
      const payload = envelope.data;
      const pagination = object(payload);
      const rows = Array.isArray(payload) ? payload : pagination.data;
      if (!Array.isArray(rows)) throw new Error(`API ${kind} trả về cấu trúc dữ liệu chưa được hỗ trợ.`);
      records.push(...rows.map(r => mapApiRow(kind, object(r))));
      if (Array.isArray(payload)) return records;
      const totalPages = number(pagination.last_page);
      const total = number(pagination.total);
      if (totalPages === undefined && total === undefined) throw new Error(`API ${kind} thiếu thông tin phân trang.`);
      if ((totalPages !== undefined && page >= totalPages) || (total !== undefined && records.length >= total)) return records;
      if (rows.length === 0) throw new Error(`API ${kind} trả về trang rỗng trước khi tải đủ dữ liệu.`);
    }
    throw new Error('Danh sách vượt giới hạn tải. Cần nối phân trang phía server trước khi vận hành.');
  }
  return {
    source: 'api',
    supportsContractDrafts: Boolean(options.drafts),
    async loadKind(kind, query = '') {
      const rows = await read(kind, query);
      loaded = { ...(loaded || { staff: [], customers: [], contracts: [], stores: [], vehicles: [] }), [kind]: rows };
      return rows;
    },
    async load() {
      const kinds: ManagementKind[] = ['staff', 'customers', 'contracts', 'stores', 'vehicles'];
      const values = await Promise.all(kinds.map(kind => read(kind)));
      const dataset = Object.fromEntries(kinds.map((kind, i) => [kind, values[i]])) as ManagementDataset;
      // Only resolve labels; API aggregates and contract values are never fabricated.
      for (const kind of ['staff', 'customers', 'vehicles', 'contracts'] as const) {
        dataset[kind] = dataset[kind].map(row => ({ ...row, store_name: row.store_name || dataset.stores.find(s => s.id === row.store_id)?.name }));
      }
      loaded = dataset;
      return structuredClone(dataset);
    },
    async save() { throw new Error('Chức năng ghi API chưa được tích hợp.'); },
    async cloneContract() { throw new Error('Chưa có API sao chép hợp đồng từ module hiện có.'); },
    async saveContract() { throw new Error('Chưa tích hợp API lưu chỉnh sửa hợp đồng.'); },
    async saveContractDraft(id, edits) {
      if (!options.drafts) throw new Error('Chưa tích hợp API lưu bản nháp. Thông tin đang nhập chưa được lưu lên hệ thống.');
      if (!loaded) throw new Error('Tải danh sách hợp đồng trước khi lưu nháp.');
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') || localStorage.getItem('jwt_token') : null;
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}${READ_ENDPOINTS.contracts}${id === null ? '' : `/${id}`}`, {
        method: id === null ? 'POST' : 'PUT', cache: 'no-store', credentials: 'same-origin', body: JSON.stringify(edits),
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const envelope = object(await response.json().catch(() => null));
      if (!response.ok || envelope.status !== 'success') throw new Error(text(envelope.message) || `Không lưu được bản nháp (HTTP ${response.status}).`);
      const row = mapApiRow('contracts', object(envelope.data));
      if (row.status !== 'draft') throw new Error('API chưa xác nhận đã lưu bản nháp. Nhấn Làm mới để kiểm tra trước khi lưu lại.');
      loaded = { ...loaded, contracts: [row, ...loaded.contracts.filter(record => record.id !== row.id)] };
      return structuredClone({ row, dataset: loaded });
    },
    async reset() { throw new Error('Không thể đặt lại dữ liệu API.'); },
  };
}

export function createManagementRepository(options:{staffDirectory?:boolean}={}): ManagementRepository {
  return createApiRepository('/api', { drafts: true,...options });
}
