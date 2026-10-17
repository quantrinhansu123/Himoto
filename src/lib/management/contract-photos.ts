import type { PhotoSlot } from './record-photos';
export type ContractPhotoPhase='rental'|'handover'|`return-${number}`|`renewal-${number}`|`renewal-receipt-${number}`;
export function contractPhotoSlots(phase:ContractPhotoPhase):PhotoSlot[] {
  const labels=['Toàn cảnh xe','Đầu xe','Đuôi xe','Bên trái','Bên phải','Đồng hồ / phụ kiện'];
  return labels.map((label,index)=>({key:`${phase}-${index+1}`,label}));
}
export function isContractTransactionPhoto(slot:string) {
  return /^(rental|handover)-[1-6]$/.test(slot)||/^(return|renewal|renewal-receipt)-[1-9]\d{0,14}-[1-6]$/.test(slot);
}
export function contractPhotoLabel(slot:string) {
  const prefix=slot.startsWith('rental-')?'Khi thuê':slot.startsWith('handover-')?'Giao xe':slot.startsWith('return-')?'Trả xe':slot.startsWith('renewal-receipt-')?`Gia hạn · phiếu ${slot.split('-')[2]}`:slot.startsWith('renewal-')?`Gia hạn v${slot.split('-')[1]}`:'Biển số';
  const n=Number(slot.split('-').at(-1));
  return `${prefix} · ${['Toàn cảnh xe','Đầu xe','Đuôi xe','Bên trái','Bên phải','Đồng hồ / phụ kiện'][n-1]||slot}`;
}
