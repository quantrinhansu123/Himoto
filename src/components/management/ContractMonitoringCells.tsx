import type { ManagementRow } from '@/lib/management/types';
import { isOwnershipContract } from '@/lib/management/contract-overdue';
import { formatValue } from '@/lib/management/table-utils';
import { GPS_STATE_LABELS } from '@/lib/management/gps';

export function contractVehicleIds(row:ManagementRow):number[]{
  try{const vehicles=JSON.parse(String(row.vehicles_json||'[]'));return Array.isArray(vehicles)?[...new Set(vehicles.filter(vehicle=>!vehicle.completed_at).map(vehicle=>Number(vehicle.id)).filter(id=>Number.isSafeInteger(id)&&id>0))] as number[]:[];}catch{return [];}
}
export function contractGpsFields(row:ManagementRow,data:{rows:{vehicle_id:number;status:string}[];error:boolean;loading:boolean},allowed:boolean){
  const ids=contractVehicleIds(row),found=data.rows.filter(item=>ids.includes(item.vehicle_id));
  const states=[...new Set(found.map(item=>item.status))];
  const label=!allowed?'GPS chưa khả dụng':!ids.length?'Chưa gắn GPS':data.error?'Chưa tải được GPS':data.loading?'Đang kiểm tra…':!found.length?'Chưa có dữ liệu':states.map(status=>GPS_STATE_LABELS[status]||'Cần kiểm tra').join(' / ')+(found.length<ids.length?' / Chưa đủ dữ liệu':'');
  const warning=!allowed||data.error||!found.length||found.length<ids.length||states.some(status=>!['online','stopped','offline','none'].includes(status));
  return {contract_gps_status:label,contract_gps_tone:warning?'yellow':states.includes('offline')?'red':states.includes('none')?'gray':'green'};
}
export function ContractGpsIndicator({row}:{row:ManagementRow}){return <span className={`mg-status mg-status-${row.contract_gps_tone||'yellow'}`}><span/>{row.contract_gps_status||'Đang kiểm tra…'}</span>;}
export function ContractMonitoringAmount({row}:{row:ManagementRow}){
  if(row.status==='bad_debt')return <span className="mg-monitoring-amount"><span className="mg-status mg-status-red"><span/>Nợ xấu</span><strong>{row.rental_debt_amount===undefined?'Cần đối chiếu':formatValue(row.rental_debt_amount,'money')}</strong><small>Tiền thuê còn thiếu</small></span>;
  const owner=isOwnershipContract(row),payment=row.overdue_basis==='payment';
  return <span className="mg-monitoring-amount"><strong>{row.monitoring_amount===undefined?'Cần đối chiếu':formatValue(row.monitoring_amount,'money')}</strong><small>{payment?'Tiền đến hạn':owner?'Nợ tiền thuê':'Phí trễ tạm tính'}</small>{!owner&&Number(row.rental_debt_amount)>0&&<small>Nợ thuê: {formatValue(row.rental_debt_amount,'money')}</small>}</span>;
}
