import type {ManagementRow} from '@/lib/management/types';

/** Contract-creating branch (customer source) under the customer name. */
export function ContractBranches({row}:{row:ManagementRow}) {
  const name=String(row.store_name||row.beneficiary_store_name||'').trim();
  return <span className="mg-contract-branches" title={name?`Nguồn khách: ${name}`:'Nguồn khách: Chưa xác định'}>
    <span>Nguồn: {name||'Chưa xác định'}</span>
  </span>;
}

/** Vehicle ownership branch under the plate. */
export function VehicleOwnerBranch({row}:{row:ManagementRow}) {
  const name=String(row.owner_store_name||'').trim();
  return <span className="mg-contract-branches" title={name?`Sở hữu xe: ${name}`:'Sở hữu xe: Chưa xác định'}>
    <span>Sở hữu: {name||'Chưa xác định'}</span>
  </span>;
}
