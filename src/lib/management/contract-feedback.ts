import type { ManagementRow } from './types';
import { parseInstallmentPlan } from './contract-billing';

const LABELS:Record<string,string>={
  contract_number:'Mã hợp đồng / Số HĐ giấy',signed_on:'Ngày ký hợp đồng',created_on:'Ngày tạo / nhập hợp đồng',
  store_id:'Cơ sở ghi nhận doanh thu',vehicle_store_id:'Cửa hàng xe',staff_id:'Nhân viên làm hợp đồng',staff_name:'Tên nhân viên làm hợp đồng',
  name:'Tên khách hàng',phone:'Số điện thoại khách hàng',id_card:'CCCD / Hộ chiếu',address:'Địa chỉ khách hàng',email:'Email khách hàng',
  birthday:'Ngày sinh khách hàng',customer_type:'Loại khách hàng',nationality:'Quốc tịch',contact_channel:'Kênh liên hệ',contact_detail:'Thông tin liên hệ',relatives_text:'Thông tin người thân',warning_note:'Cảnh báo khách hàng',
  id_card_issued_on:'Ngày cấp CCCD / Hộ chiếu',id_card_issued_by:'Nơi cấp CCCD / Hộ chiếu',driver_license_number:'Số giấy phép lái xe',driver_license_issued_on:'Ngày cấp GPLX',
  start_date:'Ngày giờ thuê',end_date:'Ngày giờ hẹn trả',rental_days:'Số ngày thuê',unit_price:'Đơn giá thuê',total_amount:'Tổng tiền thuê',paid_amount:'Tiền thuê đã thu',deposit_amount:'Tiền đặt cọc',
  package_name:'Gói thuê',payment_method:'Hình thức nhận tiền thuê',deposit_payment_method:'Hình thức nhận tiền cọc',
  customer_source:'Nguồn khách',customer_source_url:'Liên kết nguồn khách',sales_staff_id:'NVKD ghi nhận doanh số',sales_staff_name:'Tên NVKD ghi nhận doanh số',
  collateral_description:'Tài sản thế chấp',authorization_date:'Ngày ủy quyền',contract_type_id:'Loại hợp đồng',contract_type_name:'Tên loại hợp đồng',
  contract_type_months:'Thời hạn loại hợp đồng',ownership_term_months:'Thời hạn thuê sở hữu',notes:'Ghi chú hợp đồng',vehicles:'Xe thuê',
};
export function contractFieldLabel(key:string):string {
  const vehicle=/^vehicle_(\d+)(?:_(.*))?$/.exec(key);
  if(vehicle){const labels:Record<string,string>={borrow_hats:'Số mũ mượn',borrow_raincoats:'Số áo mưa',driver_name:'Tên người lái',driver_license_number:'Số GPLX',driver_license_issued_on:'Ngày cấp GPLX'};
    return `Xe ${Number(vehicle[1])+1}${vehicle[2]?` · ${labels[vehicle[2]]||'Thông tin xe'}`:''}`;}
  const relative=/^relative_(\d+)_(name|phone|relationship)$/.exec(key);
  if(relative){const labels:Record<string,string>={name:'Họ tên',phone:'Số điện thoại',relationship:'Quan hệ'};return `Người thân ${Number(relative[1])+1} · ${labels[relative[2]]}`;}
  return LABELS[key]||'Thông tin hợp đồng';
}
export class ContractDraftRequestError extends Error {
  constructor(message:string,public fields:Record<string,string>={}){super(message);}
}
export function contractErrorFields(value:unknown):Record<string,string> {
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  return Object.fromEntries(Object.entries(value).filter(([key,message])=>/^[a-z][a-z0-9_]{0,80}$/.test(key)&&typeof message==='string'&&message.length<=1000).slice(0,30)) as Record<string,string>;
}
export function contractFieldIds(key:string):string[] {
  const aliases:Record<string,string[]>={contract_type_id:['contract-record-type'],store_id:['contract-customer-source-store'],vehicle_store_id:['contract-vehicle-store-filter'],staff_id:['contract-staff'],staff_name:['contract-staff'],sales_staff_name:['contract-sales_staff_id'],id_card:['contract-id-card'],notes:['contract-record-notes'],rental_days:['contract-rental-days'],created_on:['contract-created-on'],ownership_term_months:['contract-ownership-term']};
  if(aliases[key])return aliases[key];
  const vehicle=/^vehicle_(\d+)(?:_(.*))?$/.exec(key);
  if(vehicle)return [`contract-vehicle-${vehicle[1]}${vehicle[2]&&vehicle[2]!=='id'?`-${vehicle[2]}`:''}`];
  const relative=/^relative_(\d+)_(.*)$/.exec(key);
  if(relative)return [`contract-relative-${relative[1]}-${relative[2]}`];
  return [`contract-${key}`,`contract-customer-${key}`];
}
export function contractReviewMessages(row?:ManagementRow|null):string[] {
  if(!row||String(row.legacy_source_store_id)!=='29'||!['ownership','ownership_cd'].includes(String(row.rental_type)))return [];
  const messages:string[]=[];
  if(Number(row.legacy_inferred_ownership)===1)messages.push('Loại Thuê sở hữu được nhận diện từ nhóm hồ sơ của hệ thống cũ. Đối chiếu loại trên hợp đồng giấy; thời hạn 3 tháng không tự xác định loại hợp đồng.');
  let hasPlan=false;try{hasPlan=Boolean(parseInstallmentPlan(JSON.parse(String(row.billing_plan_json||'null'))));}catch{/* Keep malformed imported schedules visible for review. */}
  if(!hasPlan&&['renting','overdue','wait_payment','bad_debt','reserved'].includes(row.status))messages.push('Chưa có lịch đóng tiền thuê sở hữu được đối chiếu. Kiểm tra ngày đến hạn, số tiền từng kỳ và chứng từ thực thu với người phụ trách trước khi xử lý công nợ.');
  return messages;
}
