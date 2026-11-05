import type {MobileRecoveryInput,MobileRecoveryItem,MobileRecoveryPreparation} from '../../../shared/mobile-bad-debt-recovery';
import {returnLocalTime} from './return-form';

export function recoveryFormInput(order:MobileRecoveryPreparation,item:MobileRecoveryItem,recoveredAt:string,note:string,now=Date.now()):MobileRecoveryInput {
  if(!order.available)throw Error(order.blockedReason||'Hợp đồng chưa cho phép thu hồi xe.');
  if(!item.available||item.completedAt!==null||!order.items.rows.some(row=>row.id===item.id&&row.vehicleId===item.vehicleId&&row.revision===item.revision))
    throw Error('Dòng xe chưa cho phép thu hồi. Tải lại hợp đồng và chọn lại xe.');
  const actual=Date.parse(recoveredAt+':00+07:00');
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(recoveredAt)||!Number.isFinite(actual)||returnLocalTime(actual)!==recoveredAt||actual>now+5*60000)
    throw Error('Ngày thu hồi không hợp lệ hoặc nằm trong tương lai.');
  if(item.startsAt&&actual<Date.parse(item.startsAt))throw Error('Ngày thu hồi không được trước ngày nhận xe.');
  if(note.trim().length>1000)throw Error('Ghi chú thu hồi tối đa 1.000 ký tự.');
  return{revision:order.revision,item_id:item.id,item_revision:item.revision,recovered_at:recoveredAt,note:note.trim()};
}
