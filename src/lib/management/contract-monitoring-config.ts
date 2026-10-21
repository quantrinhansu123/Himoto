import type { ManagementConfig,ManagementColumn } from './types';

export function compactContractConfig(config:ManagementConfig):ManagementConfig {
  const columns:ManagementColumn[]=[
    {key:'code',label:'Mã HĐ',format:'code'},
    {key:'contract_signed_at',label:'Ngày ký / bắt đầu',format:'date'},
    {key:'deposit_amount',label:'Tiền cọc',format:'money',align:'right'},
    {key:'customer_name',label:'Khách hàng',format:'person'},
    {key:'license',label:'Biển số'},
    {key:'overdue_minutes',label:'Quá hạn',format:'duration',align:'right'},
    {key:'monitoring_amount',label:'Số tiền',format:'money',align:'right'},
    {key:'contract_gps_status',label:'Định vị',sortable:false},
  ];
  return {...config,columns:[...columns,...config.columns.filter(column=>!columns.some(item=>item.key===column.key)).map(column=>({...column,hidden:true}))]};
}
