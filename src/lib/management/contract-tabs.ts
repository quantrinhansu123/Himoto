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
/** Open rentals still on the road — used by the status totals strip, not the Đang thuê tab. */
export const CONTRACT_ACTIVE_RENTAL_STATUSES = ['renting', 'overdue', 'bad_debt'] as const;
export function isContractActiveRentalStatus(status:string) {
  return (CONTRACT_ACTIVE_RENTAL_STATUSES as readonly string[]).includes(status);
}
export function contractActiveRentalCount(counts:Map<string,number>|Iterable<[string,number]>) {
  const map=counts instanceof Map?counts:new Map(counts);
  return CONTRACT_ACTIVE_RENTAL_STATUSES.reduce((sum,status)=>sum+(map.get(status)||0),0);
}
