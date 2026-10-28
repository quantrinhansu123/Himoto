import { ManagementConfig, ManagementKind, Option } from './types';
import { ORDER_STATUS } from '@/lib/formatters';
import { STAFF_POSITIONS } from './staff-positions';
import { OWNERSHIP_TERMS } from './contract-billing';

export const STAFF_STATUSES: Option[] = [{ value: 'active', label: 'Bình thường' }, { value: 'inactive', label: 'Tạm nghỉ' }, { value: 'leave', label: 'Đã nghỉ việc' }];
export const CUSTOMER_STATUSES: Option[] = [{ value: 'active', label: 'Bình thường' }, { value: 'warning', label: 'Cần lưu ý' }, { value: 'blacklist', label: 'Blacklist (khách nợ xấu)' }, { value: 'draft', label: 'Chưa hoàn tất' }];
export const STORE_STATUSES: Option[] = [{ value: 'active', label: 'Hoạt động' }, { value: 'inactive', label: 'Tạm ngừng' }];
export const VEHICLE_STATUSES: Option[] = [
  { value: 'ready', label: 'Lưu kho' }, { value: 'using', label: 'Đang thuê' }, { value: 'repairing', label: 'Bảo dưỡng' },
  { value: 'pending', label: 'Đặt trước' }, { value: 'sold', label: 'Đã bán' }, { value: 'bad_debt', label: 'Nợ xấu' },
  { value: 'broken', label: 'Hỏng' }, { value: 'in_transit', label: 'Chờ luân chuyển' },
];
/** GPS tracker connection: green / yellow / red dots on the vehicles list. */
export const LOCATION_STATUSES: Option[] = [
  { value: 'online', label: 'ON · Đang di chuyển' },
  { value: 'stopped', label: 'ON · Đang dừng' },
  { value: 'warning', label: 'Cảnh báo' },
  { value: 'offline', label: 'OFF · Mất kết nối' },
  { value: 'stale', label: 'Chưa cập nhật' },
  { value: 'unavailable', label: 'Không còn trong tài khoản GPS' },
  { value: 'none', label: 'Chưa gắn GPS' },
];
export const VEHICLE_TYPES: Option[] = [{ value: 'xega', label: 'Xe ga' }, { value: 'xeso', label: 'Xe số' }, { value: 'xecon', label: 'Xe côn tay' }, { value: 'xesh', label: 'Xe SH' }, { value: 'xe_dien', label: 'Xe điện' }];
export const POSITIONS: Option[] = STAFF_POSITIONS.map(label => ({ value: label, label }));
export const CONTRACT_STATUSES: Option[] = [
  { value: 'draft', label: 'Lưu nháp' }, { value: 'renting', label: 'Đang thuê' },
  { value: 'completed', label: 'Hoàn thành' }, { value: 'pending', label: 'Chờ giao xe' },
  { value: 'overdue', label: 'Quá hạn' }, { value: 'cancelled', label: 'Đã hủy' },
  { value: 'bad_debt', label: 'Nợ xấu' }, { value: 'wait_payment', label: 'Chờ tất toán' },
  { value: 'reserved', label: 'Bảo lưu' },
  { value: 'deposit_contract', label: 'Đã cọc, chờ nhận xe' },
  { value: 'cancel_pending_settlement', label: 'Chờ tất toán hủy' },
];
export const CONTRACT_TYPES: Option[] = [
  { value: 'daily', label: 'Thuê theo ngày' },
  { value: 'monthly', label: 'Thuê theo tháng' },
  { value: 'monthly_3', label: 'Thuê 3 tháng' },
  { value: 'monthly_6', label: 'Thuê 6 tháng' },
  { value: 'monthly_12', label: 'Thuê 12 tháng' },
  { value: 'rental', label: 'Thuê xe' },
  { value: 'tour', label: 'Tour / phượt' },
  { value: 'ownership', label: 'Thuê sở hữu' },
  { value: 'ownership_cd', label: 'Thuê sở hữu( cd)' },
];
export const OWNERSHIP_CONTRACT_TYPES = new Set(['ownership', 'ownership_cd']);

const branchField = { key: 'store_id', label: 'Cơ sở', type: 'select' as const, storeOptions: true, required: true };
const codeColumn = { key: 'code', label: 'Mã', format: 'code' as const };
const statusColumn = { key: 'status', label: 'Trạng thái', format: 'status' as const };
const branchColumn = { key: 'store_name', label: 'Cơ sở' };

export const MANAGEMENT_CONFIG: Record<ManagementKind, ManagementConfig> = {
  staff: {
    kind: 'staff', title: 'Nhân sự', singular: 'nhân sự', addLabel: 'Thêm nhân sự',
    description: 'Quản lý thông tin nhân sự và phân bổ theo cơ sở.',
    searchPlaceholder: 'Tìm mã, tên hoặc số điện thoại…', statuses: STAFF_STATUSES,
    filters: [{ key: 'position', label: 'Tất cả chức vụ', options: POSITIONS }],
    columns: [codeColumn, { key: 'name', label: 'Nhân sự', format: 'person', secondary: 'email' },
      { key: 'phone', label: 'Số điện thoại' }, { key: 'position', label: 'Chức vụ' }, branchColumn, statusColumn,
      { key: 'hire_date', label: 'Ngày vào làm', format: 'date', hidden: true }],
    fields: [{ key: 'name', label: 'Họ và tên', required: true }, { key: 'phone', label: 'Số điện thoại', type: 'tel', required: true },
      { key: 'email', label: 'Email', type: 'email' }, { key: 'position', label: 'Chức vụ', type: 'select', options: POSITIONS, required: true },
      branchField, { key: 'status', label: 'Trạng thái', type: 'select', options: STAFF_STATUSES, required: true },
      { key: 'hire_date', label: 'Ngày vào làm', type: 'date' }],
  },
  customers: {
    kind: 'customers', title: 'Khách hàng', singular: 'khách hàng', addLabel: 'Thêm khách hàng',
    description: 'Thông tin liên hệ, hồ sơ và lịch sử hợp đồng của khách hàng.',
    searchPlaceholder: 'Tìm tên, số điện thoại hoặc giấy tờ…', statuses: CUSTOMER_STATUSES, filters: [],
    columns: [codeColumn, { key: 'name', label: 'Khách hàng', format: 'person' },
      { key: 'phone', label: 'Số điện thoại' }, { key: 'id_card', label: 'Giấy tờ định danh' }, { key: 'address', label: 'Nơi ở hiện tại' },
      branchColumn, { key: 'contract_count', label: 'Hợp đồng', format: 'number', align: 'right' }, statusColumn],
    fields: [{ key: 'name', label: 'Họ và tên', required: true }, { key: 'phone', label: 'Số điện thoại', type: 'tel', required: true },
      { key: 'id_card', label: 'Giấy tờ định danh', hint: 'Có thể bổ sung sau đối với hồ sơ chưa hoàn tất.' },
      { key: 'id_card_issued_on', label: 'Ngày cấp CCCD / CMND', type: 'date' },
      { key: 'id_card_issued_by', label: 'Nơi cấp CCCD / CMND' },
      { key: 'address', label: 'Nơi ở hiện tại', wide: true, hint: 'Ghi số nhà, phường/xã, quận/huyện.' },
      { key: 'driver_license_number', label: 'Số giấy phép lái xe' },
      { key: 'driver_license_issued_on', label: 'Ngày cấp GPLX', type: 'date' },
      { ...branchField, label: 'Cơ sở nguồn khách' }, { key: 'status', label: 'Trạng thái hồ sơ', type: 'select', options: CUSTOMER_STATUSES, required: true },
      { key: 'warning_note', label: 'Ghi chú / cảnh báo', type: 'textarea', wide: true },
      { key: 'relatives_text', label: 'Thông tin người thân', wide: true }],
  },
  contracts: {
    kind: 'contracts', title: 'Danh sách hợp đồng', singular: 'hợp đồng',
    description: 'Tra cứu, sao chép và chỉnh sửa thông tin hợp đồng.',
    searchPlaceholder: 'Tìm mã hợp đồng, khách hàng hoặc biển số…', statuses: CONTRACT_STATUSES,
    filters: [{ key: 'rental_type', label: 'Tất cả loại hợp đồng', options: CONTRACT_TYPES }, {key:'ownership_term_months',label:'Tất cả thời hạn sở hữu',options:OWNERSHIP_TERMS}],
    columns: [{ ...codeColumn, label: 'Mã hợp đồng' }, { key: 'customer_name', label: 'Khách hàng', format: 'person', secondary: 'customer_phone' },
      { key: 'vehicle_name', label: 'Xe / biển số', format: 'vehicle', secondary: 'license' }, { ...branchColumn, label: 'Nguồn / doanh thu' },
      { key: 'representative_name', label: 'Nhân viên nguồn khách' }, { key: 'sales_staff_name', label: 'NVKD ghi nhận doanh số' },
      { key: 'start_date', label: 'Bắt đầu thuê', format: 'datetime' }, { key: 'end_date', label: 'Dự kiến trả', format: 'datetime' },
      { key: 'total_amount', label: 'Tiền thuê', format: 'money', align: 'right' },
      { key: 'return_adjustment_amount', label: 'Phát sinh trả xe', format: 'money', align: 'right' },
      { key: 'deposit_amount', label: 'Tiền cọc', format: 'money', align: 'right' }, statusColumn,
      { key: 'rental_type', label: 'Loại hợp đồng', hidden: true }, {key:'ownership_term_months',label:'Thời hạn sở hữu',hidden:true}], fields: [],
  },
  stores: {
    kind: 'stores', title: 'Cơ sở', singular: 'cơ sở', addLabel: 'Thêm cơ sở',
    description: 'Danh sách cơ sở, người phụ trách và nguồn lực đang phân bổ.',
    searchPlaceholder: 'Tìm mã, tên hoặc địa chỉ cơ sở…', statuses: STORE_STATUSES, filters: [],
    columns: [codeColumn, { key: 'name', label: 'Tên cơ sở', format: 'vehicle' },
      { key: 'address', label: 'Địa chỉ' }, { key: 'phone', label: 'Số điện thoại' }, { key: 'manager_name', label: 'Người phụ trách' },
      { key: 'vehicle_count', label: 'Số xe', format: 'number', align: 'right' },
      { key: 'staff_count', label: 'Nhân sự', format: 'number', align: 'right' }, statusColumn],
    fields: [{ key: 'name', label: 'Tên cơ sở', required: true }, { key: 'phone', label: 'Số điện thoại', type: 'tel' },
      { key: 'manager_name', label: 'Người phụ trách' }, { key: 'address', label: 'Địa chỉ', wide: true },
      { key: 'status', label: 'Trạng thái', type: 'select', options: STORE_STATUSES, required: true }],
  },
  vehicles: {
    kind: 'vehicles', title: 'Danh sách xe', singular: 'xe', addLabel: 'Thêm xe',
    description: 'Theo dõi thông tin, tình trạng và cơ sở hiện tại của từng xe.',
    searchPlaceholder: 'Tìm mã xe, tên xe, biển số hoặc tên khách hàng…', statuses: VEHICLE_STATUSES,
    filters: [{ key: 'type', label: 'Tất cả loại xe', options: VEHICLE_TYPES }, { key: 'beneficiary_store_id', label: 'Tất cả cơ sở nguồn khách', options: [], storeOptions: true }],
    columns: [codeColumn,
      { key: 'name', label: 'Tên xe', format: 'vehicle', secondary: 'brand' }, { key: 'license', label: 'Biển số' },
      { key: 'holder_name', label: 'Tên khách hàng', format: 'person' },
      { key: 'beneficiary_store_name', label: 'Cơ sở nguồn khách' },
      { key: 'overdue_days', label: 'Số ngày quá hạn', format: 'number', align: 'right' },
      { key: 'color', label: 'Màu sắc' }, { key: 'type', label: 'Loại xe' }, { ...branchColumn, label: 'Kho quản lý' },

      { key: 'daily_price', label: 'Giá thuê / ngày', format: 'money', align: 'right' },
      { key: 'odometer', label: 'Số km', format: 'number', align: 'right' }, statusColumn,
      { key: 'location_status', label: 'Trạng thái định vị', format: 'status' },
      { key: 'year', label: 'Năm sản xuất', hidden: true }, { key: 'chassis', label: 'Số khung', hidden: true }, { key: 'engine', label: 'Số máy', hidden: true },
      { key: 'monthly_price', label: 'Đơn giá / tháng', format: 'money', align: 'right' }],
    fields: [{ key: 'name', label: 'Tên / dòng xe', required: true }, { key: 'license', label: 'Biển số', required: true },
      { key: 'brand', label: 'Hãng xe', required: true }, { key: 'color', label: 'Màu sắc' }, { key: 'type', label: 'Loại xe', type: 'select', options: VEHICLE_TYPES, required: true },
      branchField, { key: 'status', label: 'Trạng thái', type: 'select', options: VEHICLE_STATUSES, required: true },
      { key: 'odometer', label: 'Số km', type: 'number' }, { key: 'year', label: 'Năm sản xuất', type: 'number', required: true },
      { key: 'chassis', label: 'Số khung' }, { key: 'engine', label: 'Số máy' }],
  },
};

export function optionLabel(config: ManagementConfig, key: string, value: string): string {
  if (key === 'location_status') return LOCATION_STATUSES.find(o => o.value === value)?.label || value || '—';
  const options = key === 'status' ? config.statuses : config.filters.find(f => f.key === key)?.options;
  return options?.find(o => o.value === value)?.label || (config.kind === 'contracts' && key === 'status' ? ORDER_STATUS.find(o => o.value === value)?.label : undefined) || value || '—';
}

export function statusTone(status: string): string {
  if (['online', 'active', 'ready', 'completed'].includes(status)) return 'green';
  if (['using', 'renting', 'in_transit'].includes(status)) return 'blue';
  if (['warning', 'stopped','stale','repairing', 'pending', 'draft'].includes(status)) return 'yellow';
  if (['offline', 'overdue', 'bad_debt', 'blacklist', 'broken'].includes(status)) return 'red';
  return 'gray';
}

/** Map provider/raw GPS status strings onto online | warning | offline | none. */
export function normalizeLocationStatus(raw: unknown, hasDevice: boolean): string {
  if (!hasDevice) return 'none';
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return 'offline';
  if(['idle','parked','parking','stop','stopped'].includes(value))return 'stopped';
  if(value==='stale')return 'stale';
  if(value==='unavailable')return 'unavailable';
  if (['online', 'on', 'active', 'moving', 'running', 'có tín hiệu', 'co tin hieu'].includes(value)) return 'online';
  if (['warning', 'warn', 'weak', 'satellite_lost', 'no_gps', 'low_signal', 'cảnh báo', 'canh bao', 'mất vệ tinh', 'mat ve tinh'].includes(value)) return 'warning';
  if (['offline', 'off', 'lost', 'disconnected', 'dead', 'mất liên lạc', 'mat lien lac'].includes(value)) return 'offline';
  if (['none', 'unmapped', 'chưa gắn', 'chua gan'].includes(value)) return 'none';
  return 'warning';
}

export function resolveLocationStatus(input: { hasDevice: boolean; normalizedStatus?: unknown; lastAt?: unknown }): string {
  if (!input.hasDevice) return 'none';
  const mapped = normalizeLocationStatus(input.normalizedStatus, true);
  if (mapped !== 'offline' || input.normalizedStatus) return mapped;
  const at = input.lastAt == null || input.lastAt === '' ? NaN : Date.parse(String(input.lastAt));
  if (!Number.isFinite(at)) return 'offline';
  const ageMs = Date.now() - at;
  if (ageMs <= 30 * 60_000) return 'online';
  if (ageMs <= 24 * 60 * 60_000) return 'warning';
  return 'offline';
}
