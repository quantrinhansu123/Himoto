import type {BatchPhoto,PhotoBatchStore} from './photo-batch';
/** Keep metadata separate so progress refreshes never load the entire album's bytes. */
export async function openPhotoBatchStore(scope:string):Promise<PhotoBatchStore>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('himoto-photo-batches-v1',2);request.onupgradeneeded=()=>{const meta=request.result.createObjectStore('metadata',{keyPath:'key'});meta.createIndex('scope','scope');request.result.createObjectStore('bytes');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  type Stored={key:string;scope:string;row:BatchPhoto;sequence:number};
  const read=()=>new Promise<Stored[]>((resolve,reject)=>{const request=db.transaction('metadata').objectStore('metadata').index('scope').getAll(scope);request.onsuccess=()=>resolve((request.result as Stored[]).sort((a,b)=>a.sequence-b.sequence));request.onerror=()=>reject(request.error);});
  const write=(run:(tx:IDBTransaction)=>void)=>new Promise<void>((resolve,reject)=>{const tx=db.transaction(['metadata','bytes'],'readwrite');run(tx);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('Chưa lưu được bộ ảnh.'));});
  return{
    async list(){return(await read()).map(r=>r.row);},
    async add(row,photo){const bytes=await photo.bytes();await write(tx=>{tx.objectStore('metadata').add({key:scope+'|'+row.id,scope,row,sequence:Date.now()});tx.objectStore('bytes').add(bytes,scope+'|'+row.id);});},
    async update(row){const old=(await read()).find(r=>r.row.id===row.id);if(!old)throw Error('Chưa đọc được bộ ảnh.');await write(tx=>{tx.objectStore('metadata').put({...old,row});});},
    async photo(row){const bytes=await new Promise<ArrayBuffer>((resolve,reject)=>{const request=db.transaction('bytes').objectStore('bytes').get(scope+'|'+row.id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});if(!bytes||bytes.byteLength!==row.size)throw Error('Chưa đọc được ảnh đã giữ.');const uri=URL.createObjectURL(new Blob([bytes],{type:'image/jpeg'}));return{uri,width:row.width,height:row.height,size:row.size,mimeType:'image/jpeg',bytes:async()=>bytes,dispose:()=>URL.revokeObjectURL(uri)};},
    async remove(id){await write(tx=>{tx.objectStore('metadata').delete(scope+'|'+id);tx.objectStore('bytes').delete(scope+'|'+id);});},
  };
}
