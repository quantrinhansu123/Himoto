/** These filters remain available even when the current page has no matching rows. */
export const CONTRACT_STATUS_TABS = [
  { value: '', label: 'Tất cả' },
  { value: 'renting', label: 'Đang thuê' },
  { value: 'draft', label: 'Nháp' },
  { value: 'overdue', label: 'Quá hạn' },
  { value: 'bad_debt', label: 'Nợ xấu' },
  { value: 'reserved', label: 'Bảo lưu' },
  { value: 'wait_payment', label: 'Chờ tất toán' },
  { value: 'deposit_contract', label: 'Đặt cọc' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Đã hủy' },
] as const;
