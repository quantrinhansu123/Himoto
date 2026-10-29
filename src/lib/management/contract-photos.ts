import type { PhotoSlot } from './record-photos';
import type { AccessPermission } from './permissions';
import { isSupplementalPhotoSlot,photoBaseSlot } from './photo-slot-groups';
export type ContractPhotoPhase='rental'|'handover'|`return-${number}`|`renewal-${number}`|`renewal-receipt-${number}`|`battery-swap-${number}`|`vehicle-swap-${number}`;
export const CONTRACT_CUSTOMER_PHOTO_SLOTS:PhotoSlot[]=[{key:'customer-id-front',label:'CCCD mặt trước / Hộ chiếu'},{key:'customer-id-back',label:'CCCD mặt sau / Trang bổ sung'},{key:'customer-driver-license',label:'Giấy phép lái xe'}];
export function contractDocumentSlots(phase:ContractPhotoPhase):PhotoSlot[] {
  const labels=phase.startsWith('return-')?['Ảnh hợp đồng khi trả xe','QR / Số tài khoản khách nhận hoàn','Biên nhận thu phí / hoàn tiền']:phase.startsWith('renewal-')?['Bill chuyển khoản / tiền mặt gia hạn']:phase==='rental'?['Hợp đồng đã ký','Bill chuyển khoản / tổng tiền mặt','Khách nhận xe, biển số, chìa khóa & mũ','VNeID · trang CCCD 1 (nếu chưa có)','VNeID · trang CCCD 2 (nếu chưa có)','VNeID · trang CCCD 3 (nếu chưa có)','GPLX mặt sau / trang bổ sung','Giấy tờ bản cứng bổ sung (nếu chưa có)','Thẻ sinh viên / giấy tờ giảm giá','Vé máy bay khứ hồi','Danh bạ liên hệ do khách cung cấp','Đơn giao hàng · địa chỉ nhà hiện tại','Trang mạng xã hội do khách cung cấp']:[];
  return Array.from({length:15},(_,index)=>({key:`${phase}-document-${index+1}`,label:labels[index]||`Ảnh hồ sơ bổ sung ${index+1}`}));
}
/** Signed contract + transfer/cash bill on the main form; extra papers stay in the optional list. */
export function contractEvidenceSlots(phase:ContractPhotoPhase):PhotoSlot[] {
  const slots=contractDocumentSlots(phase);
  return slots.slice(0, phase.startsWith('return-') ? 3 : Math.min(2, slots.length));
}
/** Primary bill slot for a renewal version (transfer or cash proof). */
export function renewalPaymentEvidenceSlot(version:number) {
  return `renewal-${version}-document-1`;
}
export function isRenewalPaymentEvidenceSlot(slot:string,version?:number) {
  const base=isSupplementalPhotoSlot(slot)?photoBaseSlot(slot):slot;
  if(version!=null)return base===renewalPaymentEvidenceSlot(version)||new RegExp(`^renewal-${version}-document-[1-9]\\d{0,14}$`).test(base);
  return /^renewal-[1-9]\d{0,14}-document-[1-9]\d{0,14}$/.test(base);
}
/** Preferred return document slot: QR / customer refund account photo. */
export function returnRefundQrSlot(itemId:number){return `return-${itemId}-document-2`;}
/** Any return hồ sơ document can evidence the customer's refund account (QR or số TK). */
export function returnRefundEvidenceSlots(itemId:number){
  return Array.from({length:15},(_,index)=>`return-${itemId}-document-${index+1}`);
}
export function contractPhotoSlots(phase:ContractPhotoPhase):PhotoSlot[] {
  if(phase.startsWith('vehicle-swap-'))return Array.from({length:15},(_,index)=>({key:`${phase}-${index+1}`,label:`Ảnh đổi xe ${index+1}`}));
  if(phase.startsWith('battery-swap-'))return [{key:`${phase}-1`,label:'Biển số xe đổi pin'},{key:`${phase}-2`,label:'Phần trăm pin lúc nhận'},{key:`${phase}-video-1`,label:'Video pin cửa hàng giao cho khách'}];
  const labels=['Toàn cảnh xe','Đầu xe','Đuôi xe','Bên trái','Bên phải','Đồng hồ / phụ kiện'];
  return [...Array.from({length:15},(_,index)=>({key:`${phase}-${index+1}`,label:labels[index]||`Ảnh hồ sơ ${index+1}`})),...Array.from({length:3},(_,index)=>({key:`${phase}-video-${index+1}`,label:`Video tình trạng xe ${index+1}`}))];
}
export function isContractTransactionPhoto(slot:string) {
  if(isSupplementalPhotoSlot(slot))return isContractTransactionPhoto(photoBaseSlot(slot));
  return isSignedContractPhoto(slot)||slot==='driver-license'||CONTRACT_CUSTOMER_PHOTO_SLOTS.some(item=>item.key===slot)||/^(rental|handover)-(?:[1-9]\d{0,14}|video-[1-3]|document-[1-9]\d{0,14})$/.test(slot)||/^(return|renewal|renewal-receipt)-[1-9]\d{0,14}-(?:[1-9]\d{0,14}|video-[1-3]|document-[1-9]\d{0,14})$/.test(slot)||/^battery-swap-[1-9]\d{0,14}-(?:[12]|video-1|document-[1-9]\d{0,14})$/.test(slot)||/^vehicle-swap-[1-9]\d{0,14}-[1-9]\d{0,14}$/.test(slot);
}
/** Keep the original first page and the payment bill in their existing slots. */
export function isSignedContractPhoto(slot:string) {
  return slot==='rental-document-1'||/^rental-signed-[1-9]\d{0,14}$/.test(slot);
}
export function nextSignedContractPhotoSlot(keys:string[]) {
  if(!keys.includes('rental-document-1'))return 'rental-document-1';
  let page=2;while(keys.includes(`rental-signed-${page}`))page++;
  return `rental-signed-${page}`;
}
export function expandSignedContractPhotoSlots(slots:PhotoSlot[],keys:string[]) {
  if(!slots.some(slot=>slot.key==='rental-document-1'))return slots;
  const extra=Array.from(new Set(keys)).filter(key=>isSignedContractPhoto(key)&&!slots.some(slot=>slot.key===key))
    .sort((a,b)=>a.localeCompare(b,'en',{numeric:true})).map(key=>({key,label:`Hợp đồng đã ký · Trang ${key.split('-').at(-1)}`}));
  const first=slots.findIndex(slot=>slot.key==='rental-document-1');
  return [...slots.slice(0,first+1),...extra,...slots.slice(first+1)];
}
/**
 * Quyền gắn ảnh hợp đồng trên web — mọi tài khoản đã đăng nhập.
 * Dùng vehicles.read vì hasPermission luôn cho phép (giống chuyển/nhận xe).
 */
export function contractPhotoWritePermission(slot:string):AccessPermission|null {
  if(isSupplementalPhotoSlot(slot))return contractPhotoWritePermission(photoBaseSlot(slot));
  if(!isContractTransactionPhoto(slot)&&!/^plate-[1-9]\d{0,14}$/.test(slot))return null;
  return 'vehicles.read';
}
/** Mọi tài khoản đăng nhập có thể gỡ ảnh đã lưu trong phạm vi hồ sơ. */
export function contractPhotoDeletePermission(slot:string):AccessPermission|null {
  return contractPhotoWritePermission(slot)?'vehicles.read':null;
}
// Expand from actual saved/pending keys; the initial placeholders are not an upload limit.
export function expandablePhotoPrefix(slots:PhotoSlot[]) {
  const first=slots.find(slot=>!slot.key.includes('-video-'))?.key;
  if(!first||!isContractTransactionPhoto(first)||/^battery-swap-\d+-[12]$/.test(first))return undefined;
  return first.match(/^(.*-)([1-9]\d*)$/)?.[1];
}
export function expandContractPhotoSlots(slots:PhotoSlot[],keys:string[]):PhotoSlot[] {
  const prefix=expandablePhotoPrefix(slots);
  if(!prefix)return slots;
  const extra=keys.filter(key=>key.startsWith(prefix)&&/^[1-9]\d{0,14}$/.test(key.slice(prefix.length))&&isContractTransactionPhoto(key)&&!slots.some(slot=>slot.key===key));
  const expanded=[...slots,...extra.map(key=>({key,label:contractPhotoLabel(key).split(' · ').at(-1)!}))];
  if(expanded.filter(slot=>slot.key.startsWith(prefix)&&/^[1-9]\d*$/.test(slot.key.slice(prefix.length))).every(slot=>keys.includes(slot.key))){
    let index=1;while(keys.includes(`${prefix}${index}`))index++;
    expanded.push({key:`${prefix}${index}`,label:`Ảnh bổ sung ${index}`});
  }
  return expanded.sort((a,b)=>a.key.localeCompare(b.key,'en',{numeric:true}));
}
export function contractPhotoLabel(slot:string):string {
  if(isSupplementalPhotoSlot(slot))return `${contractPhotoLabel(photoBaseSlot(slot))} · Ảnh ${slot.split('-').at(-1)}`;
  if(/^rental-signed-/.test(slot))return `Khi thuê · Hợp đồng đã ký · Trang ${slot.split('-').at(-1)}`;
  if(slot.startsWith('plate-'))return 'Ảnh biển số / khách nhận xe';
  if(slot==='driver-license')return 'Giấy phép lái xe';
  const customerPhoto=CONTRACT_CUSTOMER_PHOTO_SLOTS.find(item=>item.key===slot);if(customerPhoto)return customerPhoto.label;
  const swap=slot.match(/^(battery-swap-[1-9]\d*)-/);if(swap){const phase=swap[1] as ContractPhotoPhase;return `Đổi pin · ${[...contractPhotoSlots(phase),...contractDocumentSlots(phase)].find(item=>item.key===slot)?.label||slot}`;}
  const vehicleSwap=slot.match(/^(vehicle-swap-[1-9]\d*)-/);if(vehicleSwap)return `Đổi xe · Ảnh ${slot.split('-').at(-1)}`;
  const prefix=slot.startsWith('rental-')?'Khi thuê':slot.startsWith('handover-')?'Giao xe':slot.startsWith('return-')?'Trả xe':slot.startsWith('renewal-receipt-')?`Gia hạn · phiếu ${slot.split('-')[2]}`:slot.startsWith('renewal-')?`Gia hạn v${slot.split('-')[1]}`:'Biển số';
  const n=Number(slot.split('-').at(-1));
  if(slot.includes('-document-')){
    const phase=slot.slice(0,slot.lastIndexOf('-document-')) as ContractPhotoPhase;
    return `${prefix} · ${contractDocumentSlots(phase).find(item=>item.key===slot)?.label||`Ảnh hồ sơ bổ sung ${n}`}`;
  }
  if(slot.includes('-video-'))return `${prefix} · Video ${n}`;
  return `${prefix} · ${['Toàn cảnh xe','Đầu xe','Đuôi xe','Bên trái','Bên phải','Đồng hồ / phụ kiện'][n-1]||`Ảnh hồ sơ ${n}`}`;
}
