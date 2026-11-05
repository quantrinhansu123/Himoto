import {contractPhotoLabel} from '../../../shared/contract-photos';
import {photoBaseSlot} from '../../../shared/photo-slot-groups';

export function pendingContractPhotoLabel(slot:string,vehicles:readonly {id:string;license:string;name:string}[]):string {
  const base=photoBaseSlot(slot),extra=base!==slot?` · Ảnh ${slot.split('-').at(-1)}`:'';
  if(base==='scan_plate')return `Ảnh biển số chưa gắn xe${extra}`;
  if(base.startsWith('plate-')){
    const vehicle=vehicles.find(row=>row.id===base.slice('plate-'.length));
    return `${vehicle?`Ảnh biển số ${vehicle.license||vehicle.name}`:'Ảnh biển số xe đã bỏ chọn'}${extra}`;
  }
  return contractPhotoLabel(slot);
}
