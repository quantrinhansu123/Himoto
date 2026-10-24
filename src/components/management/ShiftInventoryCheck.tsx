import Link from 'next/link';
import type {ShiftAutofillResult} from '@/lib/management/shift-autofill';

export function ShiftInventoryCheck({result}:{result:ShiftAutofillResult}){
 const inventory=result.inventory;
 if(!inventory)return null;
 const date=result.date.split('-').reverse().join('/');
 const stamp=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'short'}).format(new Date(result.read_at));
 const labels={ready_rental:'Lưu kho nhưng HĐ chưa trả',missing_vehicle:'HĐ chưa gắn xe',duplicate_rental:'Xe có nhiều HĐ chưa trả'};
 return <section className="shift-inventory-check" aria-label="Đối chiếu hợp đồng và xe">
  <div className="shift-inventory-comparison"><div><h4>Phát sinh ngày {date}</h4><p><strong data-inventory-started-contracts>{inventory.started_contracts}</strong> hợp đồng bắt đầu thuê · <strong data-inventory-started-vehicles>{inventory.started_vehicles}</strong> xe trên các HĐ này</p><small>Một hợp đồng có thể gồm nhiều xe.</small></div>
   <div><h4>Hiện trạng lúc {stamp}</h4><p><strong data-inventory-active-vehicles>{inventory.active_vehicles}</strong> xe chưa trả trên {inventory.active_contracts} HĐ</p><small>Thuê ngày {inventory.daily_vehicles} · Thuê tháng {inventory.monthly_vehicles} · Khác / sở hữu {inventory.other_vehicles}. Gồm cả HĐ từ ngày trước.</small></div></div>
  <p className="shift-inventory-stock">Lưu kho theo DB: {inventory.ready_vehicles_raw} xe · Loại {inventory.ready_conflicts} xe còn HĐ chưa trả · Còn <strong data-inventory-stock>{inventory.stock_vehicles} xe lưu kho gợi ý</strong>. Cần đếm thực tế tại PGD.</p>
  {(inventory.ready_conflicts>0||inventory.ready_rentals>0||inventory.missing_vehicle_lines>0||inventory.duplicate_vehicles>0)&&<div className="shift-inventory-issues" role="status"><strong>Cần đối chiếu trước khi chốt kiểm kê</strong><p>Số gợi ý chỉ loại đếm trùng; trạng thái xe và hợp đồng trong DB chưa thay đổi. Xe ghi Lưu kho có thể thuộc cơ sở khác.</p>
   <ul>{inventory.issues.map((issue,index)=><li key={`${issue.kind}-${issue.order_id}-${index}`}><Link href={`/contracts?contract_id=${issue.order_id}`} target="_blank" rel="noreferrer">HĐ {issue.code}</Link>{issue.license&&<> · {issue.license}</>} — {labels[issue.kind]}</li>)}</ul>
   {inventory.issues.length===100&&<p>Đang hiển thị tối đa 100 dòng cần đối chiếu.</p>}
  </div>}
 </section>;
}
