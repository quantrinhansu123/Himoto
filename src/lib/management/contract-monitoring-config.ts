import type { ManagementConfig,ManagementColumn } from './types';

export function compactContractConfig(config:ManagementConfig, mode:'monitoring'|'ownership'|'rental'|'due'='monitoring'):ManagementConfig {
  const rentalDates:ManagementColumn[]=[
    {key:'start_date',label:'Ngày bắt đầu thuê',format:'datetime'},
    {key:'end_date',label:'Dự kiến trả xe',format:'datetime'},
  ];
  const columns:ManagementColumn[]=[
    {key:'code',label:'Mã HĐ',format:'code'},
    ...(mode==='ownership'?rentalDates:[{key:'contract_signed_at',label:'Ngày ký / bắt đầu',format:'date' as const}]),
    {key:'deposit_amount',label:'Tiền cọc',format:'money',align:'right'},
    {key:'customer_name',label:'Khách hàng',format:'person'},
    {key:'license',label:'Biển số'},
    {key:'overdue_minutes',label:'Quá hạn',format:'duration',align:'right'},
    {key:'monitoring_amount',label:'Số tiền',format:'money',align:'right'},
    {key:'contract_gps_status',label:'Định vị',sortable:false},
  ];
  if(mode!=='monitoring'&&mode!=='ownership')columns.splice(5,3,
    ...(mode==='due' ? [
      {key:'billing_next_due_at',label:'Hẹn đóng tiền',format:'date',align:undefined},
      {key:'billing_due_amount',label:'Tiền đến hạn',format:'money',align:'right'},
    ] as ManagementColumn[] : [
      ...rentalDates,
      {key:'total_amount',label:'Tiền thuê',format:'money',align:'right'},
    ] as ManagementColumn[]),
    {key:'status',label:'Trạng thái',format:'status'});
  const optional=mode==='monitoring'?config.columns:[...config.columns,{key:'contract_gps_status',label:'Định vị',sortable:false}];
  return {...config,columns:[...columns,...optional.filter(column=>!columns.some(item=>item.key===column.key)).map(column=>({...column,hidden:true}))]};
}
