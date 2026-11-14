import {Platform} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {uuid} from 'expo';
import {openPhotoBatchStore} from './photo-batch-store';
import {bindPhotoBatch,photoBatchScopeKey,type PhotoBatchScope} from './photo-batch';
export type StagedPhotoWork={id:string;recordId?:number;requestKey?:string};
type Work=StagedPhotoWork;
let queue:Promise<unknown>=Promise.resolve();
const serial=<T,>(run:()=>Promise<T>)=>{const result=queue.then(run);queue=result.catch(()=>{});return result;};
const key=(scope:PhotoBatchScope,suffix:string,namespace='vehicle')=>`himoto.staged-photos.v1.${namespace}.${Array.from(JSON.stringify(scope),c=>c.charCodeAt(0).toString(16).padStart(4,'0')).join('')}.${suffix}`;
const get=(name:string)=>Platform.OS==='web'?Promise.resolve(localStorage.getItem(name)):SecureStore.getItemAsync(name);
const put=(name:string,value:Work)=>Platform.OS==='web'?Promise.resolve(localStorage.setItem(name,JSON.stringify(value))):SecureStore.setItemAsync(name,JSON.stringify(value),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
const remove=(name:string)=>Platform.OS==='web'?Promise.resolve(localStorage.removeItem(name)):SecureStore.deleteItemAsync(name);
function parse(raw:string|null):Work|null{if(raw===null)return null;const value=JSON.parse(raw) as Work;const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;if(!value||!uuid.test(value.id)||value.requestKey!==undefined&&!uuid.test(value.requestKey)||value.recordId!==undefined&&(!Number.isSafeInteger(value.recordId)||value.recordId<1))throw Error('Không đọc được bộ ảnh đang soạn. Giữ dữ liệu để đối chiếu.');return value;}
export const stagedPhotoIdentity=(workId:string)=>`staged-record-work:${workId}`;
async function active(scope:PhotoBatchScope,namespace:string):Promise<Work>{const name=key(scope,'active',namespace),old=parse(await get(name));if(old)return old;const next:Work={id:uuid.v4().toLowerCase()};await put(name,next);return next;}
export function stagedPhotoWork(scope:PhotoBatchScope,namespace='vehicle'){return serial(()=>active(scope,namespace));}
export async function guardStagedPhotos(scope:PhotoBatchScope,namespace='vehicle'){const work=await stagedPhotoWork(scope,namespace);if(work.recordId)throw Error(`Bộ ảnh thuộc hồ sơ #${work.recordId}. Mở phiếu gốc và hoàn tất ảnh trước khi tạo lượt mới.`);}
/** Associate the local work with the exact metadata UUID before its first POST. */
export function linkStagedPhotos(scope:PhotoBatchScope,requestKey:string,namespace='vehicle'){return serial(async()=>{const work={...await active(scope,namespace),requestKey};if(work.recordId)throw Error('Hoàn tất bộ ảnh hồ sơ đã lưu trước khi tạo lượt khác.');await put(key(scope,requestKey,namespace),work);await put(key(scope,'active',namespace),work);});}
export function bindStagedPhotos(scope:PhotoBatchScope,id:number,requestKey:string,namespace='vehicle'){return serial(async()=>{
  const work=parse(await get(key(scope,requestKey,namespace)));if(!work)return null;
  if(work.recordId!==undefined&&work.recordId!==id)throw Error('Bộ ảnh không khớp phiếu gốc.');
  await bindPhotoBatch(await openPhotoBatchStore(photoBatchScopeKey(scope,stagedPhotoIdentity(work.id))),id);
  const bound={...work,recordId:id};await put(key(scope,requestKey,namespace),bound);
  const current=parse(await get(key(scope,'active',namespace)));if(current?.id===work.id)await put(key(scope,'active',namespace),bound);
  return stagedPhotoIdentity(work.id);
});}
export function completeStagedPhotos(scope:PhotoBatchScope,id:number,requestKey:string,namespace='vehicle'){return serial(async()=>{
  const work=parse(await get(key(scope,requestKey,namespace)));if(!work)return;
  if(work.recordId!==id)throw Error('Bộ ảnh không khớp hồ sơ đã lưu.');
  const store=await openPhotoBatchStore(photoBatchScopeKey(scope,stagedPhotoIdentity(work.id))),rows=await store.list();
  if(rows.some(row=>row.state!=='saved'||row.recordId!==id))throw Error('Lưu hoặc bỏ các ảnh chưa gửi trước khi hoàn tất phiếu.');
  for(const row of rows)await store.remove(row.id);
  if(parse(await get(key(scope,'active',namespace)))?.id===work.id)await remove(key(scope,'active',namespace));
  await remove(key(scope,requestKey,namespace));
});}
