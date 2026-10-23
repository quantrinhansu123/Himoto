import type { ManagementRow } from '@/lib/management/types';
import { formatValue } from '@/lib/management/table-utils';

export function ContractRentalPeriod({row}:{row:ManagementRow}) {
  return <span className="mg-rental-period"><span>Bắt đầu <strong>{formatValue(row.start_date,'datetime')}</strong></span><span>Dự kiến trả <strong>{formatValue(row.end_date,'datetime')}</strong></span></span>;
}
