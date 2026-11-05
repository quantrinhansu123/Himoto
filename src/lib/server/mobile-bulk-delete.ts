import 'server-only';
import {createHash} from 'node:crypto';
import type {NextRequest} from 'next/server';
import type {PoolClient} from 'pg';
import type {SessionUser} from './management-session';
import {requestPermission} from './access-request';
import {hasPermission} from '@/lib/management/permissions';
import {withMobileData} from './mobile-context';
import {himotoPool} from './himoto-database';
import {MobileError} from './mobile-session';
import {bulkDelete,parseBulkDelete,BulkDeleteError} from './bulk-delete';
import {mobileBody,mobileRequestKey,idempotentMobileWrite} from './mobile-writes';
import {isMobileBulkKind,bulkDeleteOperation,isBulkDeleteOperation,type MobileBulkKind,type MobileBulkReview,type MobileBulkDeletion} from '../../../shared/mobile-bulk-delete';
import type {MobileWriteResolution} from '../../../shared/mobile-write-recovery';
function kind(raw:string){if(!isMobileBulkKind(raw))throw new MobileError('Danh mục không hỗ trợ xóa hàng loạt.',404,'NOT_FOUND');return raw;}
function allowed(user:SessionUser,target:MobileBulkKind){const permission=requestPermission(`/api/auth/bulk-delete/${target}`,'DELETE');if(!permission||!hasPermission(user,permission))throw new MobileError('Không có quyền xóa danh sách này.',403,'FORBIDDEN');}
function selectedIds(target:MobileBulkKind,body:unknown){try{return parseBulkDelete(target,body).ids.sort((a,b)=>a-b);}catch(error){if(error instanceof BulkDeleteError)throw new MobileError(error.message,error.status);throw error;}}
const tables:Record<MobileBulkKind,string>={staff:'staff_profiles',stores:'stores',customers:'customers',vehicles:'vehicles'};
const names:Record<MobileBulkKind,string>={staff:'full_name',stores:'store_name',customers:'name',vehicles:'name'};
async function transaction<T>(user:SessionUser,read:boolean,task:(db:PoolClient)=>Promise<T>){return withMobileData(user,'',async()=>{const db=await himotoPool.connect();try{await db.query(read?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');await db.query("SET LOCAL statement_timeout='30s'");await db.query("SET LOCAL lock_timeout='5s'");const result=await task(db);await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK').catch(()=>{});if(error instanceof BulkDeleteError)throw new MobileError(error.message,error.status,error.status===409?'CONFLICT':'INVALID_REQUEST');throw error;}finally{db.release();}});}
async function selection(db:PoolClient,user:SessionUser,target:MobileBulkKind,ids:number[],lock=false):Promise<MobileBulkReview>{
  const rows=(await db.query(`SELECT p.id,p.xmin::text AS revision,p.${names[target]} AS name,p.status,${target==='staff'?'p.staff_code':target==='vehicles'?'p.license':'p.id::text'} AS code,
    ${target==='stores'?'p.store_name':'(SELECT s.store_name FROM himoto.stores s WHERE s.id=p.store_id)'} AS store_name
    FROM himoto.${tables[target]} p WHERE p.id=ANY($1::bigint[]) ORDER BY p.id${lock?' FOR UPDATE OF p':''}`,[ids])).rows;
  if(rows.length!==ids.length)throw new MobileError('Có hồ sơ đã xóa hoặc ngoài phạm vi hiện tại. Tải lại danh sách.',409,'CONFLICT');
  return{kind:target,review:createHash('sha256').update(JSON.stringify({actor:user.id,kind:target,rows})).digest('hex'),rows:rows.map(r=>({id:Number(r.id),name:String(r.name||''),status:String(r.status||''),code:String(r.code||r.id),storeName:String(r.store_name||'')}))};
}
export async function reviewMobileBulkDelete(user:SessionUser,rawKind:string,request:NextRequest){const target=kind(rawKind);allowed(user,target);if(request.nextUrl.searchParams.size)throw new MobileError('Xác nhận xóa không nhận bộ lọc.');const body=await mobileBody(request,20000);if(Object.keys(body).some(k=>k!=='ids'))throw new MobileError('Danh sách cần xóa chưa hợp lệ.');const ids=selectedIds(target,body);return transaction(user,true,db=>selection(db,user,target,ids));}
function deletion(key:string,target:MobileBulkKind,count:number,version:string,replayed:boolean):MobileBulkDeletion{if(!Number.isSafeInteger(count)||count<1||count>500||version!=='1')throw new MobileError('Xác nhận xóa chưa hợp lệ. Giữ mã để đối chiếu.',409,'INVALID_WRITE_RECEIPT');return{key,kind:target,operation:bulkDeleteOperation(target),deletedCount:count,receiptVersion:1,replayed};}
export async function deleteMobileBulk(user:SessionUser,rawKind:string,request:NextRequest){
  const target=kind(rawKind);allowed(user,target);const key=mobileRequestKey(request.headers.get('Idempotency-Key')),body=await mobileBody(request,22000);
  if(request.nextUrl.searchParams.size||Object.keys(body).some(k=>!['ids','review'].includes(k))||typeof body.review!=='string'||!/^[a-f0-9]{64}$/.test(body.review))throw new MobileError('Danh sách hoặc phiên bản xác nhận xóa chưa hợp lệ.');
  const ids=selectedIds(target,body);
  return transaction(user,false,async db=>{const receipt=await idempotentMobileWrite(db,user.id,key,bulkDeleteOperation(target),{ids,review:body.review},async()=>{
    if(target==='vehicles'||target==='stores')await db.query(`LOCK TABLE himoto.${tables[target]} IN SHARE ROW EXCLUSIVE MODE`);
    const reviewed=await selection(db,user,target,ids,true);if(reviewed.review!==body.review)throw new MobileError('Hồ sơ đã thay đổi sau khi rà soát. Tải lại xác nhận trước khi xóa.',409,'CONFLICT');
    const deleted=await bulkDelete(db,target,ids);return{id:deleted.length,revision:'1'};
  });return deletion(key,target,receipt.id,receipt.revision,receipt.replayed);});
}
export async function readMobileBulkDeletion(user:SessionUser,key:string){mobileRequestKey(key);return transaction(user,true,async db=>{const row=(await db.query('SELECT operation,resource_id,resource_revision FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2',[user.id,key])).rows[0];if(!row||!isBulkDeleteOperation(row.operation))throw new MobileError('Chưa có xác nhận xóa. Giữ mã để đối chiếu.',404,'NOT_FOUND');const target=kind(String(row.operation).split('.')[1]);allowed(user,target);return deletion(key,target,Number(row.resource_id),String(row.resource_revision),true);});}
export async function resolveMobileBulkDelete(user:SessionUser,key:string,operation:string):Promise<MobileWriteResolution>{
  const target=kind(operation.split('.')[1]);allowed(user,target);mobileRequestKey(key);
  return transaction(user,false,async db=>{const cancelled=`cancelled:${operation}`;await db.query('INSERT INTO himoto.management_mobile_requests(user_id,request_id,operation,fingerprint)VALUES($1,$2,$3,$4)ON CONFLICT(user_id,request_id)DO NOTHING',[user.id,key,cancelled,createHash('sha256').update(cancelled).digest('hex')]);
    const row=(await db.query('SELECT operation,resource_id,resource_revision FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2 FOR UPDATE',[user.id,key])).rows[0];if(!row)throw new MobileError('Chưa đối chiếu được yêu cầu xóa.',503);if(row.operation===cancelled&&row.resource_id==null)return{key,operation,status:'cancelled',receipt:null};if(row.operation!==operation)throw new MobileError('Mã thao tác không khớp yêu cầu xóa.',409,'REQUEST_KEY_REUSED');const proof=deletion(key,target,Number(row.resource_id),String(row.resource_revision),true);return{key,operation,status:'committed',receipt:{id:proof.deletedCount,revision:'1',replayed:true}};
  });
}
