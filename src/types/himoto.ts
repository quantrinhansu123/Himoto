export type EntityId = number | string;

export interface PaginationParams {
  page: number;
  limit: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TableColumn<T> {
  key: keyof T | string;
  title: string;
  width?: string;
  minWidth?: string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  render?: (row: T, index: number) => React.ReactNode;
  visible?: boolean;
  exportable?: boolean;
}

// 1. Cơ sở (Store)
export interface StoreItem {
  id: number;
  code: string;               // e.g. CS-001
  store_name: string;         // e.g. Cơ sở 1 - Ba Đình
  address: string;
  phone: string;
  email: string;
  manager_name: string;       // Người phụ trách
  vehicle_count: number;      // Tổng số xe tại cơ sở
  staff_count: number;        // Tổng số nhân sự
  status: 'active' | 'inactive';
  created_at: string;
  notes?: string;
}

// 2. Nhân sự (Staff)
export interface StaffItem {
  id: number;
  code: string;               // e.g. NV-001
  name: string;
  phone: string;
  email: string;
  role_id: number;
  role_name: string;          // Quản lý cơ sở, Thu ngân, Nhân viên kinh doanh, Kỹ thuật viên
  store_id: number;
  store_name: string;
  status: 'active' | 'inactive' | 'leave'; // Hoạt động, Tạm nghỉ, Nghỉ việc
  created_at: string;
  hire_date?: string;
}

// 3. Khách hàng (Customer)
export interface CustomerItem {
  id: number;
  code: string;               // e.g. KH-001
  name: string;
  phone: string;
  id_card: string;            // CCCD / CMTND
  email?: string;
  address: string;
  contract_count: number;     // Số hợp đồng đã ký
  status: 'active' | 'vip' | 'warning' | 'bad_debt'; // Bình thường, VIP, Cần lưu ý, Nợ xấu
  warning_note?: string;      // Lý do cảnh báo (nếu có)
  created_at: string;
}

// 4. Danh sách xe (Vehicle)
export type VehicleType = 'scooter' | 'manual' | 'clutch' | 'electric';
export type VehicleStatus = 'ready' | 'rent' | 'maintenance' | 'holding' | 'sold';

export interface VehicleItem {
  id: number;
  code: string;               // e.g. XE-001
  license: string;            // Biển số xe: e.g. 29B1-888.88
  name: string;               // Tên/dòng xe: e.g. Honda Vision 110cc
  brand: string;              // Hãng: Honda, Yamaha, Piaggio, VinFast
  type: VehicleType;          // Xe ga, xe số, xe côn tay, xe điện
  store_id: number;
  store_name: string;
  daily_price: number;        // Giá thuê theo ngày (VNĐ)
  monthly_price?: number;     // Giá thuê theo tháng (VNĐ)
  odometer: number;           // Số km đã đi
  status: VehicleStatus;      // Sẵn sàng, Đang thuê, Bảo dưỡng, Đặt trước, Đã thanh lý
  year?: string;              // Năm sản xuất
  created_at: string;
}

// 5. Danh sách hợp đồng (Contract)
export type ContractRentalType = 'daily' | 'monthly' | 'rental' | 'tour' | 'ownership' | 'ownership_cd';
export type ContractStatus = 'renting' | 'completed' | 'pending' | 'overdue' | 'cancelled';

export interface ContractItem {
  id: number;
  code: string;               // Mã HĐ: e.g. HD-2401
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  customer_id_card: string;
  vehicle_id: number;
  vehicle_name: string;
  license: string;            // Biển số xe
  store_id: number;
  store_name: string;
  rental_type: ContractRentalType; // Thuê ngày, Thuê tháng, Tour
  start_date: string;         // YYYY-MM-DD
  end_date: string;           // YYYY-MM-DD (Ngày dự kiến trả)
  total_amount: number;       // Tiền thuê (VNĐ)
  deposit_amount: number;     // Tiền cọc (VNĐ)
  status: ContractStatus;     // Đang thuê, Đã hoàn thành, Chờ giao xe, Quá hạn, Đã hủy
  notes?: string;
  created_at: string;
}

// Filter Options for Dropdowns
export interface FilterOptions {
  stores: { id: number; name: string }[];
  roles: { id: number; name: string }[];
  vehicleTypes: { id: VehicleType; name: string }[];
  vehicleStatuses: { id: VehicleStatus; name: string }[];
  contractStatuses: { id: ContractStatus; name: string }[];
  contractTypes: { id: ContractRentalType; name: string }[];
  customerStatuses: { id: CustomerItem['status']; name: string }[];
  staffStatuses: { id: StaffItem['status']; name: string }[];
}
