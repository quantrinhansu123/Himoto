import { CONTRACT_STATUSES, VEHICLE_STATUSES } from './config';
import type { OpenVehicleRental } from './vehicle-reservation-window';

function statusLabel(status: string) {
  return CONTRACT_STATUSES.find(option => option.value === status)?.label || status || 'không xác định';
}

function vehicleStatusLabel(status: string) {
  return VEHICLE_STATUSES.find(option => option.value === status)?.label || status || 'không xác định';
}

function openRentalSummary(rentals: Pick<OpenVehicleRental, 'code' | 'customer' | 'status'>[]) {
  const first = rentals[0];
  if (!first) return '';
  const code = String(first.code || '').trim() || 'mở';
  const customer = String(first.customer || '').trim();
  const extra = rentals.length > 1 ? ` (+${rentals.length - 1} HĐ khác)` : '';
  return `HĐ ${code}${customer ? ` · ${customer}` : ''}${extra}`;
}

/** null = được chuyển xe. */
export function vehicleTransferBlockReason(input: {
  selected: boolean;
  status: string;
  rentals: Pick<OpenVehicleRental, 'code' | 'customer' | 'status'>[];
  sameDestination: boolean;
  storeName?: string;
}): string | null {
  if (!input.selected) return 'Chọn xe cần chuyển.';
  // HĐ nháp không khóa kho — vẫn chuyển/cho thuê được.
  const blocking = input.rentals.filter(item => String(item.status || '').toLowerCase() !== 'draft');
  if (blocking.length) {
    return `Xe đang thuộc ${openRentalSummary(blocking)}. Trả xe trên hợp đồng trước khi chuyển xe.`;
  }
  if (input.status === 'in_transit') {
    return 'Xe đang Chờ luân chuyển. Cơ sở đích cần Nhận xe hoặc Từ chối trước khi chuyển tiếp.';
  }
  if (input.status !== 'ready') {
    return `Chỉ chuyển xe đang Lưu kho. Hiện tại: “${vehicleStatusLabel(input.status)}”.`;
  }
  if (input.sameDestination) {
    return `Xe đang ở ${input.storeName || 'cơ sở này'}. Chọn cơ sở khác để chuyển.`;
  }
  return null;
}

export function vehicleReceiveBlockReason(mode: 'receive' | 'reject' | 'cancel', blocked: boolean): string | null {
  if (!blocked) return null;
  return mode !== 'receive'
    ? 'Lần chuyển xe không còn chờ xử lý hoặc thiếu thông tin. Đóng hộp thoại, nhấn Làm mới rồi kiểm tra lịch sử.'
    : 'Lần chuyển xe không còn chờ nhận hoặc thiếu thông tin. Đóng hộp thoại, nhấn Làm mới rồi kiểm tra lịch sử.';
}

/** null = không chặn trả xe theo trạng thái HĐ. */
export function contractReturnBlockReason(status: string): string | null {
  if (['renting', 'overdue', 'wait_payment'].includes(status)) return null;
  if (status === 'completed') return 'Hợp đồng đã hoàn thành; không trả xe lại. Dùng Sửa hồ sơ trả xe nếu cần chỉnh giờ/phí hoặc gửi Telegram.';
  if (status === 'cancelled') return 'Hợp đồng đã hủy; không trả xe.';
  if (status === 'draft') return 'Bản nháp chưa phát hành; không trả xe.';
  if (status === 'deposit_contract') return 'Đang giữ cọc, chưa giao xe; dùng Giao xe thay vì Trả xe.';
  if (status === 'bad_debt') return 'Hợp đồng đang nợ xấu; xử lý qua Nợ xấu / tất toán, không trả xe thường.';
  if (status === 'reserved') return 'Hợp đồng đang bảo lưu; dùng Tiếp tục thuê hoặc Hoàn thành bảo lưu.';
  if (status === 'pending') return 'Hợp đồng đang chờ giao xe; chưa thể trả xe.';
  return `Trạng thái “${statusLabel(status)}” không cho trả xe.`;
}

export function contractRenewBlockReason(status: string, hasBillingPlan: boolean): string | null {
  if (hasBillingPlan) return 'Hợp đồng thuê sở hữu có lịch đóng tiền; không gia hạn theo lượt ngày/tháng thường.';
  if (['renting', 'overdue', 'wait_payment'].includes(status)) return null;
  if (status === 'completed') return 'Hợp đồng đã hoàn thành; không gia hạn.';
  if (status === 'cancelled') return 'Hợp đồng đã hủy; không gia hạn.';
  if (status === 'draft') return 'Bản nháp chưa phát hành; không gia hạn.';
  if (status === 'deposit_contract') return 'Đang giữ cọc, chưa giao xe; không gia hạn.';
  if (status === 'bad_debt') return 'Hợp đồng đang nợ xấu; không gia hạn cho đến khi xử lý công nợ.';
  if (status === 'reserved') return 'Hợp đồng đang bảo lưu; không gia hạn trong thời gian bảo lưu.';
  return `Trạng thái “${statusLabel(status)}” không cho gia hạn.`;
}

export function contractHandoverBlockReason(status: string): string | null {
  if (status === 'deposit_contract') return null;
  if (status === 'renting' || status === 'overdue') return 'Xe đã giao / đang thuê; không giao lại từ trạng thái này.';
  if (status === 'completed') return 'Hợp đồng đã hoàn thành; không giao xe.';
  if (status === 'draft') return 'Bản nháp chưa phát hành; hoàn tất hồ sơ trước khi giao xe.';
  return `Chỉ giao xe khi trạng thái Đặt cọc. Hiện tại: “${statusLabel(status)}”.`;
}
