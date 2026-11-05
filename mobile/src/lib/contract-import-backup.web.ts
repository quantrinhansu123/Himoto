import type {MobileContractImportPreview} from '../../../shared/mobile-contract-import';
import type {MobileJsonExport} from '../../../shared/mobile-export';
export interface ContractBackupScope {origin:string;actorId:number}
const key=(scope:ContractBackupScope,batch:string)=>`${scope.origin}:${scope.actorId}:${batch}`;
async function database(){return new Promise<IDBDatabase>((resolve,reject)=>{const open=indexedDB.open('himoto-contract-import-backups-v1',1);open.onupgradeneeded=()=>open.result.createObjectStore('backups');open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(Error('Không mở được bộ nhớ sao lưu.'));});}
async function access(scope:ContractBackupScope,batch:string,content?:string):Promise<string>{
  const db=await database();try{return await new Promise<string>((resolve,reject)=>{const tx=db.transaction('backups',content===undefined?'readonly':'readwrite'),store=tx.objectStore('backups'),read=store.get(key(scope,batch));let saved='';
    read.onsuccess=()=>{if(typeof read.result==='string'){saved=read.result;if(content!==undefined&&saved!==content)tx.abort();}else if(content!==undefined){saved=content;store.add(content,key(scope,batch));}};
    tx.oncomplete=()=>saved?resolve(saved):reject(Error('Bản sao lưu không có trên trình duyệt này.'));tx.onerror=tx.onabort=()=>reject(Error('Chưa lưu được bản sao lưu đầy đủ. Kiểm tra dung lượng bộ nhớ.'));
  });}finally{db.close();}
}
export async function verifyContractImportBackup(scope:ContractBackupScope,preview:MobileContractImportPreview):Promise<string>{
  await access(scope,preview.batchId,preview.backup.content);const saved=await access(scope,preview.batchId),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(saved))),b=>b.toString(16).padStart(2,'0')).join('');
  if(saved!==preview.backup.content||hash!==preview.backupSha)throw Error('Bản sao lưu đọc lại chưa khớp. Chưa cho phép nhập hợp đồng.');return hash;
}
export async function readContractImportBackup(scope:ContractBackupScope,batch:string):Promise<MobileJsonExport>{
  const content=await access(scope,batch),value=JSON.parse(content);if(value.batchId!==batch||value.actorId!==scope.actorId||!Array.isArray(value.snapshot?.orders))throw Error('Bản sao lưu không đúng tài khoản hoặc lần nhập.');
  return{filename:`HIMOTO-contracts-backup-${batch}.json`,mimeType:'application/json',content,rowCount:value.snapshot.orders.length};
}
