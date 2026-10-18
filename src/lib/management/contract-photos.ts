import type { PhotoSlot } from './record-photos';
export type ContractPhotoPhase='rental'|'handover'|`return-${number}`|`renewal-${number}`|`renewal-receipt-${number}`;
export const CONTRACT_CUSTOMER_PHOTO_SLOTS:PhotoSlot[]=[{key:'customer-id-front',label:'CCCD mặt trước / Hộ chiếu'},{key:'customer-id-back',label:'CCCD mặt sau / Trang bổ sung'},{key:'customer-driver-license',label:'Giấy phép lái xe'}];
export function contractDocumentSlots(phase:ContractPhotoPhase):PhotoSlot[] {
  return Array.from({length:15},(_,index)=>({key:`${phase}-document-${index+1}`,label:`Ảnh hồ sơ bổ sung ${index+1}`}));
}
export function contractPhotoSlots(phase:ContractPhotoPhase):PhotoSlot[] {
  const labels=['Toàn cảnh xe','Đầu xe','Đuôi xe','Bên trái','Bên phải','Đồng hồ / phụ kiện'];
  return [...Array.from({length:15},(_,index)=>({key:`${phase}-${index+1}`,label:labels[index]||`Ảnh hồ sơ ${index+1}`})),...Array.from({length:3},(_,index)=>({key:`${phase}-video-${index+1}`,label:`Video tình trạng xe ${index+1}`}))];
}
export function isContractTransactionPhoto(slot:string) {
  return slot==='driver-license'||CONTRACT_CUSTOMER_PHOTO_SLOTS.some(item=>item.key===slot)||/^(rental|handover)-(?:[1-9]|1[0-5]|video-[1-3]|document-(?:[1-9]|1[0-5]))$/.test(slot)||/^(return|renewal|renewal-receipt)-[1-9]\d{0,14}-(?:[1-9]|1[0-5]|video-[1-3]|document-(?:[1-9]|1[0-5]))$/.test(slot);
}
export function contractPhotoLabel(slot:string) {
  if(slot==='driver-license')return 'Giấy phép lái xe';
  const customerPhoto=CONTRACT_CUSTOMER_PHOTO_SLOTS.find(item=>item.key===slot);if(customerPhoto)return customerPhoto.label;
  const prefix=slot.startsWith('rental-')?'Khi thuê':slot.startsWith('handover-')?'Giao xe':slot.startsWith('return-')?'Trả xe':slot.startsWith('renewal-receipt-')?`Gia hạn · phiếu ${slot.split('-')[2]}`:slot.startsWith('renewal-')?`Gia hạn v${slot.split('-')[1]}`:'Biển số';
  const n=Number(slot.split('-').at(-1));
  if(slot.includes('-document-'))return `${prefix} · Ảnh hồ sơ bổ sung ${n}`;
  if(slot.includes('-video-'))return `${prefix} · Video ${n}`;
  return `${prefix} · ${['Toàn cảnh xe','Đầu xe','Đuôi xe','Bên trái','Bên phải','Đồng hồ / phụ kiện'][n-1]||`Ảnh hồ sơ ${n}`}`;
}
