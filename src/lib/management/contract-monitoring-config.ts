import type { ManagementConfig,ManagementColumn } from './types';

export function compactContractConfig(config:ManagementConfig, mode:'monitoring'|'ownership'|'rental'|'due'='monitoring'):ManagementConfig {
  const rentalDates:ManagementColumn[]=[{key:'rental_period',label:'Thời gian thuê',sortable:false}];
  const columns:ManagementColumn[]=[
    {key:'code',label:'Mã HĐ',format:'code'},
    ...rentalDates,
    {key:'deposit_amount',label:'Tiền cọc',format:'money',align:'right'},
    {key:'customer_name',label:'Khách hàng',format:'person',secondary:'store_name'},
    {key:'license',label:'Biển số'},
    {key:'overdue_minutes',label:'Quá hạn',format:'duration',align:'right'},
    {key:'monitoring_amount',label:'Số tiền',format:'money',align:'right'},
    {key:'contract_gps_status',label:'Định vị',sortable:false},
  ];
  if(mode==='ownership')columns.splice(5,0,{key:'contract_type_name',label:'Loại hợp đồng'});
  if(mode!=='monitoring'&&mode!=='ownership')columns.splice(5,3,
    ...(mode==='due' ? [
      {key:'billing_next_due_at',label:'Hẹn đóng tiền',format:'date',align:undefined},
      {key:'billing_due_amount',label:'Tiền đến hạn',format:'money',align:'right'},
    ] as ManagementColumn[] : [
      {key:'total_amount',label:'Tiền thuê',format:'money',align:'right'},
    ] as ManagementColumn[]),
    {key:'status',label:'Trạng thái',format:'status'});
  const optional=(mode==='monitoring'?config.columns:[...config.columns,{key:'contract_gps_status',label:'Định vị',sortable:false}]).filter(column=>!['start_date','end_date'].includes(column.key));
  // Preserve columns the page explicitly un-hid (ownership keeps loại hợp đồng visible).
  return {...config,columns:[...columns,...optional.filter(column=>!columns.some(item=>item.key===column.key)).map(column=>({...column,hidden:column.hidden===false?false:true}))]};
}
