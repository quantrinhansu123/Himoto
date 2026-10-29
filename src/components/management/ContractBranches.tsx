import type {ManagementRow} from '@/lib/management/types';

/** Customer-source / contract branch under the customer name. */
export function ContractBranches({row}:{row:ManagementRow}) {
  return <span className="mg-contract-branches">
    <span>Nguồn khách: {row.store_name||'Chưa xác định'}</span>
  </span>;
}

/** Vehicle ownership / stock branch under the plate. */
export function VehicleOwnerBranch({row}:{row:ManagementRow}) {
  const name=String(row.warehouse_store_name||row.owner_store_name||'').trim();
  return <span className="mg-contract-branches">
    <span>Sở hữu: {name||'Chưa xác định'}</span>
  </span>;
}
