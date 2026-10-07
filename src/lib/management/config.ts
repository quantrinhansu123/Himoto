import { ManagementConfig, ManagementKind, Option } from './types';
import { ORDER_STATUS } from '@/lib/formatters';

export const STAFF_STATUSES: Option[] = [{ value: 'active', label: 'Đang làm việc' }, { value: 'inactive', label: 'Tạm nghỉ' }, { value: 'leave', label: 'Đã nghỉ việc' }];
export const CUSTOMER_STATUSES: Option[] = [{ value: 'active', label: 'Bình thường' }, { value: 'warning', label: 'Cần lưu ý' }, { value: 'blacklist', label: 'Blacklist (khách nợ xấu)' }, { value: 'draft', label: 'Chưa hoàn tất' }];
export const STORE_STATUSES: Option[] = [{ value: 'active', label: 'Hoạt động' }, { value: 'inactive', label: 'Tạm ngừng' }];
export const VEHICLE_STATUSES: Option[] = [
  { value: 'ready', label: 'Sẵn sàng' }, { value: 'using', label: 'Đang thuê' }, { value: 'repairing', label: 'Bảo dưỡng' },
  { value: 'pending', label: 'Đặt trước' }, { value: 'sold', label: 'Đã bán' }, { value: 'bad_debt', label: 'Nợ xấu' },
  { value: 'broken', label: 'Hỏng' }, { value: 'in_transit', label: 'Đang điều chuyển' },
];
export const VEHICLE_TYPES: Option[] = [{ value: 'xega', label: 'Xe ga' }, { value: 'xeso', label: 'Xe số' }, { value: 'xecon', label: 'Xe côn tay' }, { value: 'xesh', label: 'Xe SH' }, { value: 'electric', label: 'Xe điện' }];
export const POSITIONS: Option[] = ['Quản lý cơ sở', 'Nhân viên kinh doanh', 'Thu ngân', 'Kỹ thuật viên'].map(label => ({ value: label, label }));
export const CONTRACT_STATUSES: Option[] = [
  { value: 'draft', label: 'Lưu nháp' }, { value: 'renting', label: 'Đang thuê' },
  { value: 'completed', label: 'Hoàn thành' }, { value: 'pending', label: 'Chờ giao xe' },
  { value: 'overdue', label: 'Quá hạn' }, { value: 'cancelled', label: 'Đã hủy' },
  { value: 'bad_debt', label: 'Nợ xấu' }, { value: 'wait_payment', label: 'Chờ thanh toán' },
  { value: 'deposit_contract', label: 'Hợp đồng đặt cọc' },
  { value: 'cancel_pending_settlement', label: 'Chờ tất toán hủy' },
];
export const CONTRACT_TYPES: Option[] = [{ value: 'daily', label: 'Thuê theo ngày' }, { value: 'monthly', label: 'Thuê theo tháng' }, { value: 'rental', label: 'Thuê xe' }, { value: 'tour', label: 'Tour / phượt' }];
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
    columns: [codeColumn, { key: 'name', label: 'Khách hàng', format: 'person', secondary: 'email' },
      { key: 'phone', label: 'Số điện thoại' }, { key: 'id_card', label: 'Giấy tờ định danh' }, { key: 'address', label: 'Địa chỉ' },
      branchColumn, { key: 'contract_count', label: 'Hợp đồng', format: 'number', align: 'right' }, statusColumn],
    fields: [{ key: 'name', label: 'Họ và tên', required: true }, { key: 'phone', label: 'Số điện thoại', type: 'tel', required: true },
      { key: 'id_card', label: 'Giấy tờ định danh', hint: 'Có thể bổ sung sau đối với hồ sơ chưa hoàn tất.' },
      { key: 'email', label: 'Email', type: 'email' }, { key: 'address', label: 'Địa chỉ', wide: true },
      branchField, { key: 'status', label: 'Trạng thái hồ sơ', type: 'select', options: CUSTOMER_STATUSES, required: true },
      { key: 'warning_note', label: 'Ghi chú / cảnh báo', type: 'textarea', wide: true }],
  },
  contracts: {
    kind: 'contracts', title: 'Danh sách hợp đồng', singular: 'hợp đồng',
    description: 'Tra cứu, sao chép và chỉnh sửa thông tin hợp đồng.',
    searchPlaceholder: 'Tìm mã hợp đồng, khách hàng hoặc biển số…', statuses: CONTRACT_STATUSES,
    filters: [{ key: 'rental_type', label: 'Tất cả loại hợp đồng', options: CONTRACT_TYPES }],
    columns: [{ ...codeColumn, label: 'Mã hợp đồng' }, { key: 'customer_name', label: 'Khách hàng', format: 'person', secondary: 'customer_phone' },
      { key: 'vehicle_name', label: 'Xe / biển số', format: 'vehicle', secondary: 'license' }, branchColumn,
      { key: 'start_date', label: 'Bắt đầu thuê', format: 'date' }, { key: 'end_date', label: 'Dự kiến trả', format: 'date' },
      { key: 'total_amount', label: 'Tiền thuê', format: 'money', align: 'right' },
      { key: 'deposit_amount', label: 'Tiền cọc', format: 'money', align: 'right' }, statusColumn,
      { key: 'rental_type', label: 'Loại hợp đồng', hidden: true }], fields: [],
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
    searchPlaceholder: 'Tìm mã xe, tên xe hoặc biển số…', statuses: VEHICLE_STATUSES,
    filters: [{ key: 'type', label: 'Tất cả loại xe', options: VEHICLE_TYPES }],
    columns: [codeColumn, { key: 'name', label: 'Tên xe', format: 'vehicle', secondary: 'brand' }, { key: 'license', label: 'Biển số' },
      { key: 'type', label: 'Loại xe' }, branchColumn,
      { key: 'daily_price', label: 'Giá thuê / ngày', format: 'money', align: 'right' },
      { key: 'odometer', label: 'Số km', format: 'number', align: 'right' }, statusColumn,
      { key: 'year', label: 'Năm sản xuất', hidden: true },
      { key: 'monthly_price', label: 'Giá thuê / tháng', format: 'money', align: 'right', hidden: true }],
    fields: [{ key: 'name', label: 'Tên / dòng xe', required: true }, { key: 'license', label: 'Biển số', required: true },
      { key: 'brand', label: 'Hãng xe', required: true }, { key: 'type', label: 'Loại xe', type: 'select', options: VEHICLE_TYPES, required: true },
      branchField, { key: 'status', label: 'Trạng thái', type: 'select', options: VEHICLE_STATUSES, required: true },
      { key: 'daily_price', label: 'Giá thuê / ngày (VNĐ)', type: 'number', required: true },
      { key: 'monthly_price', label: 'Giá thuê / tháng (VNĐ)', type: 'number' },
      { key: 'odometer', label: 'Số km', type: 'number', required: true }, { key: 'year', label: 'Năm sản xuất', type: 'number' }],
  },
};

export function optionLabel(config: ManagementConfig, key: string, value: string): string {
  const options = key === 'status' ? config.statuses : config.filters.find(f => f.key === key)?.options;
  return options?.find(o => o.value === value)?.label || (config.kind === 'contracts' && key === 'status' ? ORDER_STATUS.find(o => o.value === value)?.label : undefined) || value || '—';
}

export function statusTone(status: string): string {
  if (['active', 'ready', 'completed'].includes(status)) return 'green';
  if (['using', 'renting', 'in_transit'].includes(status)) return 'blue';
  if (['warning', 'repairing', 'pending', 'draft'].includes(status)) return 'amber';
  if (['overdue', 'bad_debt', 'blacklist', 'broken'].includes(status)) return 'red';
  return 'gray';
}
