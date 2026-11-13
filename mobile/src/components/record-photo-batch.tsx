import {router} from 'expo-router';
import {useQueryClient} from '@tanstack/react-query';
import type {MobileMediaIdentity,MobileMediaSlotInfo} from '../../../shared/mobile-record-media';
import {mediaOperation} from '../../../shared/mobile-record-media';
import {mediaMutationOperations} from '../../../shared/mobile-media-delete';
import {nextPhotoInGroup,photoBaseSlot} from '../../../shared/photo-slot-groups';
import {useSession} from '@/providers/session';
import {PhotoBatch} from './photo-batch';
import type {RecordMediaPhoto} from '@/lib/record-media-photo';

export function RecordPhotoBatch({target,slot,onPrepared,onPendingChange,onBusyChange,showTelegram=true,queueId,allowSave=true,disabled=false}:{target:MobileMediaIdentity;slot:string;onPrepared?:(photo:RecordMediaPhoto,index:number)=>Promise<void>;onPendingChange?:(pending:boolean)=>void;onBusyChange?:(busy:boolean)=>void;showTelegram?:boolean;queueId?:string;allowSave?:boolean;disabled?:boolean}){
  const{api}=useSession(),cache=useQueryClient(),base=photoBaseSlot(slot);
  const telegram=target.entity==='contracts'?()=>router.push({pathname:'/contract-telegram/[id]',params:{id:String(target.id)}}):target.entity==='vehicles'&&['transfer','receive'].includes(target.kind)?()=>router.push({pathname:'/transfer-telegram/[id]/[eventId]',params:{id:String(target.id),eventId:String(target.referenceId)}}):undefined;
  return <PhotoBatch allowSave={allowSave} disabled={disabled} onBusyChange={onBusyChange} adapter={{identity:queueId??JSON.stringify([target,base]),label:'Chọn và lưu bộ ảnh',operation:mediaOperation(target.entity,target.id),conflicts:mediaMutationOperations(target.entity,target.id),
    prepare:async row=>{
      if(row.recordId!==undefined&&row.recordId!==target.id)throw Error('Bộ ảnh thuộc hồ sơ gốc khác. Giữ nguyên để đối chiếu.');
      row.recordId=target.id;
      let info=await api!.mediaSlotInfo(target,row.slot);
      // Albums append to the same group; existing photos are never overwritten implicitly.
      while(info.photo){if(!info.nextSlot)throw Error('Nhóm ảnh đã đầy. Chọn mục khác.');info=await api!.mediaSlotInfo(target,info.nextSlot);}
      if(info.target.canWrite===false)throw Error('Không có quyền bổ sung ảnh vào hồ sơ này.');
      return info;
    },
    upload:async(row,attempt,bytes)=>{const info=attempt as MobileMediaSlotInfo;const receipt=await api!.uploadRecordMedia(info.target,info.slot,null,bytes,row.key);if(receipt.requestId!==row.key||receipt.id!==target.id)throw Error('Phiếu ảnh không khớp hồ sơ gốc. Giữ bộ ảnh để đối chiếu.');},
  }} nextSlot={rows=>nextPhotoInGroup(base,rows.map(r=>r.slot))} onPendingChange={onPendingChange} onPrepared={onPrepared} onSaved={()=>{void cache.invalidateQueries({queryKey:['record-media']});}} onTelegram={showTelegram?telegram:undefined}/>;
}
