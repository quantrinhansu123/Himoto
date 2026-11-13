import type {RecordMediaPhoto} from './record-media-photo';
export interface BatchPhoto {id:string;slot:string;width:number;height:number;size:number;key:string;attempt:unknown|null;state:'queued'|'saved';error:string;recordId?:number}
export interface PhotoBatchScope {origin:string;userId:number;storeId:number|null;allStores:boolean}
export const photoBatchScopeKey=(scope:PhotoBatchScope,identity:string)=>JSON.stringify([scope,identity]);
export interface PhotoBatchStore {
  list():Promise<BatchPhoto[]>;
  add(row:BatchPhoto,photo:RecordMediaPhoto):Promise<void>;
  update(row:BatchPhoto):Promise<void>;
  photo(row:BatchPhoto):Promise<RecordMediaPhoto>;
  remove(id:string):Promise<void>;
}
export interface PhotoBatchAdapter {
  identity:string;label:string;operation:string;conflicts:string[];
  prepare(row:BatchPhoto):Promise<unknown>;
  upload(row:BatchPhoto,attempt:unknown,bytes:ArrayBuffer):Promise<void>;
}
/** Claim before leaving the metadata receipt; an interrupted claim can only finish for the same record. */
export async function bindPhotoBatch(store:PhotoBatchStore,id:number){
  const rows=await store.list();if(rows.some(row=>row.recordId!==undefined&&row.recordId!==id))throw Error('Bộ ảnh thuộc hồ sơ đã lưu khác. Mở hồ sơ gốc và hoàn tất ảnh trước khi tạo hồ sơ mới.');
  for(const row of rows)if(row.recordId===undefined){row.recordId=id;await store.update(row);}
}
/** Persist an attempt before sending; retries keep the same body/key, and saved files are skipped. */
export async function savePhotoBatch(store:PhotoBatchStore,adapter:PhotoBatchAdapter,guard:{reserve(key:string):Promise<void>;complete(key:string):Promise<void>;current():boolean},changed:()=>Promise<void>) {
  for(const row of await store.list()){
    if(!guard.current())return;
    if(row.state==='saved')continue;
    try{
      if(row.attempt===null){row.attempt=await adapter.prepare(row);await store.update(row);}
      if(!guard.current())return;
      await guard.reserve(row.key);
      const photo=await store.photo(row);
      try{
        const bytes=await photo.bytes();
        if(!guard.current())return;
        if(bytes.byteLength!==row.size)throw Error('Ảnh trên thiết bị đã thay đổi. Giữ bộ ảnh để kiểm tra.');
        await adapter.upload(row,row.attempt,bytes);
      }finally{photo.dispose();}
      // A server receipt is durable before releasing the local request lock.
      row.state='saved';row.error='';await store.update(row);await guard.complete(row.key);
    }catch(error){row.error=(error as Error).message;await store.update(row);await changed();throw error;}
    await changed();
  }
}
