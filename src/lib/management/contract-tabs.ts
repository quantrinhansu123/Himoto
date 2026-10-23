/** These filters remain available even when the current page has no matching rows. */
export const CONTRACT_STATUS_TABS = [
  { value: '', label: 'Tất cả' },
  { value: 'renting', label: 'Đang thuê' },
  { value: 'draft', label: 'Nháp' },
  { value: 'overdue', label: 'Quá hạn' },
  { value: 'completed', label: 'Hoàn thành' },
] as const;
