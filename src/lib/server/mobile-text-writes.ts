import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { MobileError } from './mobile-session';
import { isContractTypeOperation,isContractTypeReceipt,type ContractTypeOperation,type MobileContractTypeReceipt } from '../../../shared/mobile-contract-types';

// Caller owns the same scoped transaction as the actual catalogue writer.
// resource_key is the actual text primary key; resource_id stays NULL.
export async function idempotentContractTypeWrite(client:PoolClient,userId:number,key:string,operation:ContractTypeOperation,normalized:unknown,write:()=>Promise<{typeId:string;revision:string}>):Promise<MobileContractTypeReceipt>{
  if(!isContractTypeOperation(operation))throw new MobileError('Loại xác nhận danh mục chưa hợp lệ.');
  const fingerprint=createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  await client.query(`INSERT INTO himoto.management_mobile_requests(user_id,request_id,operation,fingerprint) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,request_id) DO NOTHING`,[userId,key,operation,fingerprint]);
  const previous=(await client.query(`SELECT operation,fingerprint,resource_key,resource_id,resource_revision FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2 FOR UPDATE`,[userId,key])).rows[0];
  if(!previous)throw new MobileError('Chưa xác nhận được lần lưu danh mục.',503);
  if(String(previous.operation).startsWith('cancelled:'))throw new MobileError('Mã danh mục đã hủy. Đối chiếu mã gốc trong Tài khoản trước khi lưu tiếp.',409,'REQUEST_CANCELLED');
  if(previous.operation!==operation||previous.fingerprint!==fingerprint)throw new MobileError('Mã danh mục có nội dung khác. Giữ mã gốc để đối chiếu.',409,'REQUEST_KEY_REUSED');
  if(previous.resource_key!==null){const receipt={typeId:previous.resource_key,revision:previous.resource_revision,replayed:true};if(previous.resource_id!==null||!isContractTypeReceipt(receipt))throw new MobileError('Xác nhận danh mục chưa hợp lệ.',409,'INVALID_WRITE_RECEIPT');return receipt;}
  if(previous.resource_id!==null||previous.resource_revision!==null)throw new MobileError('Xác nhận danh mục chưa hợp lệ.',409,'INVALID_WRITE_RECEIPT');
  const saved=await write(),receipt={...saved,replayed:false};if(!isContractTypeReceipt(receipt))throw new MobileError('Chưa xác nhận được kết quả danh mục.',503,'INVALID_WRITE_RECEIPT');
  await client.query(`UPDATE himoto.management_mobile_requests SET resource_key=$3,resource_revision=$4 WHERE user_id=$1 AND request_id=$2`,[userId,key,saved.typeId,saved.revision]);return receipt;
}
