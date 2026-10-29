import { CONTRACT_STATUSES } from './config';

function statusLabel(status: string) {
  return CONTRACT_STATUSES.find(option => option.value === status)?.label || status || 'không xác định';
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
