import { CustomerDetails, normalizeIdCard, staffMatchesStore, validateCustomer, pairRelatives, relativesFromRow } from './contract-document';
import { mapApiRow, READ_ENDPOINTS } from './repository';
import { CustomerAssignment, ManagementRepository, ManagementRow } from './types';
import { CUSTOMER_STATUSES } from './config';
import { parseCustomerRelatives } from './customer-relatives';

export interface ContractAutofillRepository {
  lookupCustomer(idCard: string, signal?: AbortSignal): Promise<ManagementRow | null>;
  searchCustomers(query: string, storeId: string, signal?: AbortSignal): Promise<ManagementRow[]>;
  loadStaff(storeId: string, signal?: AbortSignal): Promise<ManagementRow[]>;
  createCustomer(customer: CustomerDetails, assignment?: CustomerAssignment): Promise<ManagementRow>;
  updateCustomer(customer: ManagementRow): Promise<ManagementRow>;
  deleteCustomer(id: number): Promise<void>;
}
export function createDemoAutofillRepository(repository: ManagementRepository): ContractAutofillRepository {
  return {
    async lookupCustomer(idCard, signal) {
      signal?.throwIfAborted();
      const dataset = await repository.load(); signal?.throwIfAborted();
      const matches = dataset.customers.filter(row => normalizeIdCard(String(row.id_card || '')) === normalizeIdCard(idCard));
      if (matches.length > 1) throw new Error('Có nhiều hồ sơ trùng số giấy tờ. Cần kiểm tra lại dữ liệu khách hàng.');
      return matches[0] || null;
    },
    async searchCustomers(query, storeId, signal) {
      signal?.throwIfAborted();
      const dataset = await repository.load(); signal?.throwIfAborted();
      const normalized = normalizeIdCard(query);
      const phone = query.replace(/\D/g, '');
      return dataset.customers.filter(row => String(row.store_id) === storeId && (normalizeIdCard(String(row.id_card || '')) === normalized || String(row.phone || '').replace(/\D/g, '') === phone));
    },
    async loadStaff(storeId, signal) { signal?.throwIfAborted(); return staffMatchesStore((await repository.load()).staff, storeId); },
    async createCustomer(customer, assignment) {
      const errors = validateCustomer(customer, 'demo');
      if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
      const dataset = await repository.load();
      const store_id = assignment?.store_id ?? dataset.stores[0]?.id;
      const status = assignment?.status ?? (customer.warning_note ? 'warning' : 'active');
      if (!dataset.stores.some(store => store.id === store_id)) throw new Error('Chọn một cơ sở hợp lệ cho khách hàng.');
      if (!CUSTOMER_STATUSES.some(option => option.value === status)) throw new Error('Trạng thái khách hàng không hợp lệ.');
      if (dataset.customers.some(row => normalizeIdCard(String(row.id_card || '')) === normalizeIdCard(customer.id_card))) throw new Error('Số CCCD/CMND này đã có. Hãy tra cứu khách hàng thay vì tạo thêm.');
      const id = Math.max(0, ...dataset.customers.map(row => row.id)) + 1;
      const row: ManagementRow = { ...customer, id, code: `KH-${String(id).padStart(3, '0')}`, status, store_id, store_name: dataset.stores.find(store => store.id === store_id)?.name,
        id_card: normalizeIdCard(customer.id_card), created_at: new Date().toISOString().slice(0, 10) };
      await repository.save('customers', row);
      return row;
    },
    async updateCustomer(customer) {
      const dataset = await repository.save('customers', customer);
      return dataset.customers.find(row => row.id === customer.id) || customer;
    },
    async deleteCustomer(id) {
      throw new Error(`Không thể xóa khách hàng #${id} trong dữ liệu mẫu.`);
    },
  };
}
type ApiRecord = Record<string, unknown>;
const object = (value: unknown): value is ApiRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export function createApiAutofillRepository(baseUrl = '/api'): ContractAutofillRepository {
  async function request(path: string, options: RequestInit = {}) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') || localStorage.getItem('jwt_token') : null;
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, { ...options, cache: 'no-store', credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    const envelope: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = object(envelope) && typeof envelope.message === 'string' ? envelope.message : '';
      throw new Error(message || `Không thực hiện được yêu cầu (HTTP ${response.status}). Kiểm tra kết nối và phiên làm việc.`);
    }
    if (!object(envelope) || envelope.status !== 'success' || !('data' in envelope)) throw new Error('API trả về dữ liệu chưa được hỗ trợ.');
    return envelope.data;
  }
  return {
    async lookupCustomer(idCard, signal) {
      const normalized = normalizeIdCard(idCard);
      const payload = await request(`${READ_ENDPOINTS.customers}/search-by-id-card?${new URLSearchParams({ id_card: normalized })}`, { method: 'GET', signal });
      if (payload === null) return null;
      if (!object(payload)) throw new Error('API tra cứu khách hàng trả về dữ liệu chưa được hỗ trợ.');
      const row = mapApiRow('customers', payload);
      if (normalizeIdCard(String(row.id_card || '')) !== normalized) throw new Error('API trả về khách hàng không khớp số CCCD/CMND.');
      return row;
    },
    async searchCustomers(query, storeId, signal) {
      const normalized = query.replace(/\D/g, '');
      if (!normalized || !storeId) return [];
      const payload = await request(`${READ_ENDPOINTS.customers}/search?${new URLSearchParams({ query: normalized, store_id: storeId })}`, { method: 'GET', signal });
      if (!Array.isArray(payload) || !payload.every(object)) throw new Error('API tra cứu trả về danh sách chưa được hỗ trợ.');
      return payload.map(row => mapApiRow('customers', row));
    },
    async loadStaff(storeId, signal) {
      if (!storeId) return [];
      const records: ManagementRow[] = [];
      for (let page = 1; page <= 1000; page++) {
        const payload = await request(`${READ_ENDPOINTS.staff}?${new URLSearchParams({ store_id: storeId, page: String(page), limit: '100' })}`, { method: 'GET', signal });
        const rows = Array.isArray(payload) ? payload : object(payload) ? payload.data : null;
        if (!Array.isArray(rows) || !rows.every(object)) throw new Error('API nhân sự trả về dữ liệu chưa được hỗ trợ.');
        records.push(...rows.map(row => mapApiRow('staff', row)));
        if (Array.isArray(payload)) return staffMatchesStore(records, storeId);
        if (!object(payload)) throw new Error('API nhân sự thiếu thông tin phân trang.');
        const lastPage = Number(payload.last_page);
        if (!Number.isSafeInteger(lastPage) || lastPage < 1) throw new Error('API nhân sự thiếu thông tin phân trang.');
        if (page >= lastPage) return staffMatchesStore(records, storeId);
        if (!rows.length) throw new Error('API nhân sự trả về trang rỗng trước khi tải đủ dữ liệu.');
      }
      throw new Error('Danh sách nhân sự vượt giới hạn tải.');
    },
    async createCustomer(customer, assignment) {
      const errors = validateCustomer(customer, 'api');
      if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
      if (await this.lookupCustomer(customer.id_card)) throw new Error('Số CCCD/CMND này đã có. Hãy tra cứu khách hàng thay vì tạo thêm.');
      // The Supabase adapter stores branch and profile status on customer creation.
      const payload = await request(READ_ENDPOINTS.customers, { method: 'POST', body: JSON.stringify({
        name: customer.name.trim(), phone: customer.phone.trim(), address: customer.address.trim(), id_card: normalizeIdCard(customer.id_card), warning_note: customer.warning_note.trim(),
        driver_license_number: customer.driver_license_number.trim(), driver_license_issued_on: customer.driver_license_issued_on,
        relatives: parseCustomerRelatives(pairRelatives(customer.relatives_json, customer.relatives_text)),
        ...(assignment ? { status: assignment.status, store_id: assignment.store_id } : {}),
      }) });
      if (!object(payload)) throw new Error('API chưa trả về hồ sơ khách hàng đã tạo. Không thể xác nhận kết quả.');
      const row = mapApiRow('customers', payload);
      if (normalizeIdCard(String(row.id_card || '')) !== normalizeIdCard(customer.id_card)) throw new Error('Hồ sơ được trả về không khớp số giấy tờ đã nhập.');
      return row;
    },
    async updateCustomer(customer) {
      const payload = await request(`${READ_ENDPOINTS.customers}/${customer.id}`, { method: 'PATCH', body: JSON.stringify({
        name: String(customer.name || '').trim(), phone: String(customer.phone || '').trim(),
        address: String(customer.address || '').trim(), id_card: normalizeIdCard(String(customer.id_card || '')),
        status: customer.status, warning_note: String(customer.warning_note || '').trim(), store_id: customer.store_id ?? null,
        driver_license_number: String(customer.driver_license_number || '').trim(), driver_license_issued_on: String(customer.driver_license_issued_on || ''),
        relatives: parseCustomerRelatives(relativesFromRow(customer)),
      }) });
      if (!object(payload)) throw new Error('API chưa trả về hồ sơ khách hàng đã cập nhật.');
      return mapApiRow('customers', payload);
    },
    async deleteCustomer(id) {
      await request(`${READ_ENDPOINTS.customers}/${id}`, { method: 'DELETE' });
    },
  };
}
