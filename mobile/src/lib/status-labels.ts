/** Display labels only; API values remain unchanged. */
export const statuses: Record<string, string> = {
  ready: 'Lưu kho', using: 'Đang thuê', repairing: 'Bảo dưỡng', pending: 'Đặt trước',
  in_transit: 'Chờ luân chuyển', sold: 'Đã bán', broken: 'Hỏng', bad_debt: 'Nợ xấu',
  renting: 'Đang thuê', overdue: 'Quá hạn', completed: 'Hoàn thành', draft: 'Bản nháp',
  wait_payment: 'Chờ tất toán', cancelled: 'Đã hủy', reserved: 'Bảo lưu',
  deposit_contract: 'Đã cọc', cancel_pending_settlement: 'Chờ tất toán hủy',
  active: 'Bình thường', warning: 'Cần lưu ý', blacklist: 'Danh sách cảnh báo', inactive: 'Tạm nghỉ',
};
