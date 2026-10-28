import type {ManagementRow} from '@/lib/management/types';

export function ContractBranches({row}:{row:ManagementRow}) {
  return <span className="mg-contract-branches">
    <span>Kho xe: {row.warehouse_store_name||'Chưa xác định'}</span>
    <span>Nguồn khách: {row.store_name||'Chưa xác định'}</span>
  </span>;
}
