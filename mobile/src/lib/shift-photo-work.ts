import {SHIFT_PHOTOS} from '../../../shared/mobile-shift-reports';
import {openPhotoBatchStore} from './photo-batch-store';
import {photoBatchScopeKey,type PhotoBatchScope} from './photo-batch';

/** A final report must snapshot every selected category, including a closed picker. */
export async function requireShiftPhotosSaved(scope:PhotoBatchScope,id:number,stage:'pgd'|'audit'){
  for(const[category,label]of SHIFT_PHOTOS){
    const store=await openPhotoBatchStore(photoBatchScopeKey(scope,`shift:${id}:${stage}:${category}`));
    const pending=(await store.list()).filter(row=>row.state!=='saved');
    if(pending.length)throw Error(`Còn ${pending.length} ảnh ${stage==='pgd'?'PGD':'KTNB'} chưa lưu ở mục ${label}. Mở minh chứng báo cáo để lưu hoặc bỏ ảnh trước khi chốt.`);
  }
}
