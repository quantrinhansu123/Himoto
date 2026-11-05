import {CONTRACT_CUSTOMER_PHOTO_SLOTS} from './contract-photos';
import {photoBaseSlot} from './photo-slot-groups';
import {isMobileMediaSlot} from './mobile-record-media';

/** ContractComposer.savePhotos: customer papers, selected plates, GPLX, transaction media. */
export function orderContractPhotoUploads<T extends {slot:string;savedTo?:number}>(photos:readonly T[],contractId:number,vehicleIds:readonly string[]):T[] {
  const phases:T[][]=[[],[],[],[]];
  for(const row of photos){
    if(row.savedTo===contractId)continue;
    if(row.savedTo!==undefined)throw Error('Ảnh đã lưu vào hợp đồng khác. Đối chiếu phiếu gốc trước khi tiếp tục.');
    const base=photoBaseSlot(row.slot),plate=/^plate-([1-9]\d{0,14})$/.exec(base);
    if(plate){
      if(!vehicleIds.includes(plate[1]))throw Error('Có ảnh biển số chưa gắn đúng xe đang chọn. Quay lại rà soát, gắn xe hoặc bỏ ảnh này.');
      if(!isMobileMediaSlot({entity:'contracts',id:contractId,kind:'plate',referenceId:Number(plate[1])},row.slot))throw Error('Mục ảnh biển số không hợp lệ. Quay lại rà soát ảnh trước khi lưu.');
      phases[1].push(row);continue;
    }
    if(!isMobileMediaSlot({entity:'contracts',id:contractId,kind:'rental',referenceId:contractId},row.slot)||/-video-[1-3]$/.test(base))throw Error('Có ảnh chưa gắn đúng mục hồ sơ. Quay lại rà soát ảnh trước khi lưu.');
    const phase=CONTRACT_CUSTOMER_PHOTO_SLOTS.some(slot=>slot.key===base)?0:base==='driver-license'?2:3;
    phases[phase].push(row);
  }
  // Preserve selection order within each web collection, without trusting a persisted phase.
  return phases.flat();
}
