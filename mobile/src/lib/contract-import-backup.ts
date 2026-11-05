import {Directory,File,Paths} from 'expo-file-system';
import {uuid} from 'expo';
import type {MobileContractImportPreview} from '../../../shared/mobile-contract-import';
import type {MobileJsonExport} from '../../../shared/mobile-export';
export interface ContractBackupScope {origin:string;actorId:number}
function destination(scope:ContractBackupScope,batch:string){
  if(!Number.isSafeInteger(scope.actorId)||scope.actorId<1||!/^[a-f0-9-]{36}$/.test(batch))throw Error('Phạm vi sao lưu chưa hợp lệ.');
  const folder=new Directory(Paths.document,'himoto-contract-import-backups',scope.origin.replace(/[^a-z0-9]/gi,'_'),String(scope.actorId));folder.create({idempotent:true,intermediates:true});return new File(folder,`${batch}.json`);
}
export async function verifyContractImportBackup(scope:ContractBackupScope,preview:MobileContractImportPreview):Promise<string>{
  const file=destination(scope,preview.batchId);
  if(!file.exists){const temporary=new File(file.parentDirectory,`${preview.batchId}.pending-${uuid.v4()}.json`),temporaryUri=temporary.uri;try{temporary.create();await temporary.write(preview.backup.content);if(await temporary.text()!==preview.backup.content||await temporary.digest('SHA-256')!==preview.backupSha)throw Error('Bản sao lưu tạm chưa đầy đủ.');if(!file.exists)temporary.move(file);}finally{const pending=new File(temporaryUri);if(pending.exists)pending.delete();}}
  if(await file.text()!==preview.backup.content||await file.digest('SHA-256')!==preview.backupSha)throw Error('Bản sao lưu đọc lại chưa khớp. Chưa cho phép nhập hợp đồng.');
  return preview.backupSha;
}
export async function readContractImportBackup(scope:ContractBackupScope,batch:string):Promise<MobileJsonExport>{
  const file=destination(scope,batch);if(!file.exists)throw Error('Bản sao lưu gốc không có trên thiết bị này.');
  const content=await file.text(),value=JSON.parse(content);
  if(value.batchId!==batch||value.actorId!==scope.actorId||!Array.isArray(value.snapshot?.orders))throw Error('Bản sao lưu không đúng lần nhập hoặc tài khoản.');
  return{filename:`HIMOTO-contracts-backup-${batch}.json`,mimeType:'application/json',content,rowCount:value.snapshot.orders.length};
}
