import 'server-only';
import {createHash} from 'node:crypto';
import type {NextRequest} from 'next/server';
import type {PoolClient} from 'pg';
import type {SessionUser} from './management-session';
import {hasPermission} from '@/lib/management/permissions';
import {readContractTelegram,saveContractTelegram,ContractTelegramError} from './contract-telegram';
import {readVehicleTransferTelegram,saveVehicleTransferTelegram,VehicleTransferTelegramError} from './vehicle-transfer-telegram';
import {TelegramRetractionError} from './telegram-retractions';
import {readPendingContractTelegram} from './contract-telegram-pending';
import {withMobileData} from './mobile-context';
import {himotoPool,ownerDatabase} from './himoto-database';
import {MobileError} from './mobile-session';
import {mobileBody,mobileRequestKey,idempotentMobileWrite} from './mobile-writes';
import {isTelegramOperation,isMobileContractTelegram,isMobileTransferTelegram,isMobileTelegramResult,type MobileTelegramAction,type MobileTransferTelegram,type MobileTelegramResult} from '../../../shared/mobile-telegram';
import type {MobileWriteResolution} from '../../../shared/mobile-write-recovery';

const actions:MobileTelegramAction[]=['send','resume','retry_confirmed_absent','retract'];
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function id(raw:string){if(!/^[1-9]\d{0,14}$/.test(raw)||!Number.isSafeInteger(Number(raw)))throw new MobileError('Mã hồ sơ Telegram chưa hợp lệ.');return Number(raw);}
function permission(user:SessionUser,transfer=false){if(!hasPermission(user,transfer?'vehicles.read':'contracts.read'))throw new MobileError('Không có quyền xem Telegram của hồ sơ này.',403,'FORBIDDEN');}
async function transaction<T>(user:SessionUser,transfer:boolean,write:boolean,task:(db:PoolClient)=>Promise<T>){
  permission(user,transfer);return withMobileData(user,'',async()=>{const db=await(transfer?ownerDatabase:himotoPool).connect();try{await db.query(write?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='30s'");await db.query("SET LOCAL lock_timeout='5s'");const result=await task(db);await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK').catch(()=>{});if(error instanceof ContractTelegramError||error instanceof VehicleTransferTelegramError||error instanceof TelegramRetractionError)throw new MobileError(error.message,error.status,error.status===403?'FORBIDDEN':'TELEGRAM_REVIEW_REQUIRED');throw error;}finally{db.release();}});
}
async function contract(db:PoolClient,user:SessionUser,target:number){const state=(await readContractTelegram(db,target,user.id,user)).state;if(!isMobileContractTelegram(state))throw new MobileError('Nội dung Telegram cần cập nhật ứng dụng trước khi xem.',503,'INVALID_TELEGRAM');return state;}
async function transfer(db:PoolClient,user:SessionUser,vehicleId:number,eventId:number):Promise<MobileTransferTelegram>{const read=await readVehicleTransferTelegram(db,vehicleId,eventId,user),value={...read.state,kind:read.kind==='vehicle_receive'?'receive' as const:'transfer' as const,review:digest({payload:read.payload,destinations:read.destinations})};if(!isMobileTransferTelegram(value))throw new MobileError('Thông báo điều chuyển chưa đầy đủ.',503,'INVALID_TELEGRAM');return value;}
export function readMobileContractTelegram(user:SessionUser,rawId:string){permission(user);const target=id(rawId);return transaction(user,false,false,db=>contract(db,user,target));}
export function readMobilePendingTelegram(user:SessionUser,params:URLSearchParams){permission(user);const store=params.get('store')||'all',page=params.get('page')||'1';if([...params.keys()].some(k=>!['store','page'].includes(k)||params.getAll(k).length!==1)||store!=='all'&&!/^[1-9]\d{0,14}$/.test(store)||!/^[1-9]\d{0,3}$/.test(page))throw new MobileError('Bộ lọc Telegram chưa hợp lệ.');return transaction(user,false,false,async db=>{let data=await readPendingContractTelegram(db,store==='all'?null:Number(store),Number(page));const pages=Math.max(1,Math.ceil(data.total/30));if(data.page>pages)data=await readPendingContractTelegram(db,store==='all'?null:Number(store),pages);return{...data,pages};});}
export function readMobileTransferTelegram(user:SessionUser,rawId:string,rawEvent:string){permission(user,true);const vehicleId=id(rawId),eventId=id(rawEvent);return transaction(user,true,false,db=>transfer(db,user,vehicleId,eventId));}
async function result(db:PoolClient,user:SessionUser,key:string,row:Record<string,unknown>,replayed=true):Promise<MobileTelegramResult>{
  const operation=String(row.operation),target=id(String(row.resource_id)),code=String(row.resource_revision),action=actions[Number(code)-1];
  if(!isTelegramOperation(operation)||operation.split(':')[1]!==String(target)||!/^[1-4]$/.test(code)||!action)throw new MobileError('Xác nhận Telegram cần đối chiếu mã gốc.',409,'INVALID_WRITE_RECEIPT');
  let value:MobileTelegramResult;
  if(operation.startsWith('telegram.contract:'))value={key,operation,receipt:{id:target,revision:code,replayed},action,id:target,eventId:null,contract:await contract(db,user,target),transfer:null};
  else{permission(user,true);const e=(await db.query('SELECT vehicle_id FROM himoto.vehicle_location_events WHERE id=$1',[target])).rows[0];if(!e)throw new MobileError('Lượt điều chuyển không còn trong phạm vi.',404,'NOT_FOUND');value={key,operation,receipt:{id:target,revision:code,replayed},action,id:Number(e.vehicle_id),eventId:target,contract:null,transfer:await transfer(db,user,Number(e.vehicle_id),target)};}
  if(!isMobileTelegramResult(value))throw new MobileError('Xác nhận Telegram chưa hợp lệ.',409,'INVALID_WRITE_RECEIPT');return value;
}
export async function writeMobileContractTelegram(user:SessionUser,rawId:string,request:NextRequest){
  permission(user);const target=id(rawId),key=mobileRequestKey(request.headers.get('idempotency-key')),body=await mobileBody(request,4096),action=String(body.action) as MobileTelegramAction;
  if(request.nextUrl.search||!actions.includes(action)||Object.keys(body).some(k=>!['action','event_key','hash','notice_id','confirmed_absent','reason','confirmed'].includes(k)))throw new MobileError('Chọn đúng thao tác Telegram cần thực hiện.');
  return transaction(user,false,true,async db=>{
    const operation=`telegram.contract:${target}`,receipt=await idempotentMobileWrite(db,user.id,key,operation,body,async()=>{await saveContractTelegram(db,target,user.id,user,{...body,request_id:key});return{id:target,revision:String(actions.indexOf(action)+1)};});
    return result(db,user,key,{operation,resource_id:target,resource_revision:receipt.revision},receipt.replayed);
  });
}
export async function writeMobileTransferTelegram(user:SessionUser,rawId:string,rawEvent:string,request:NextRequest){
  permission(user,true);const vehicleId=id(rawId),eventId=id(rawEvent),key=mobileRequestKey(request.headers.get('idempotency-key')),body=await mobileBody(request,1024);
  if(request.nextUrl.search||Object.keys(body).some(k=>!['action','review'].includes(k))||body.action!=='send'||typeof body.review!=='string'||!/^[a-f0-9]{64}$/.test(body.review))throw new MobileError('Rà soát đúng lượt chuyển/nhận trước khi gửi.');
  return transaction(user,true,true,async db=>{
    const operation=`telegram.transfer:${eventId}`,receipt=await idempotentMobileWrite(db,user.id,key,operation,{vehicleId,eventId,...body},async()=>{
      await db.query('SELECT id FROM himoto.vehicle_location_events WHERE id=$1 AND vehicle_id=$2 FOR UPDATE',[eventId,vehicleId]);
      const current=await transfer(db,user,vehicleId,eventId);if(current.review!==body.review)throw new MobileError('Nội dung, ảnh hoặc nơi nhận đã đổi. Tải lại trước khi gửi.',409,'TELEGRAM_REVIEW_REQUIRED');
      await saveVehicleTransferTelegram(db,vehicleId,eventId,user);return{id:eventId,revision:'1'};
    });
    return result(db,user,key,{operation,resource_id:eventId,resource_revision:receipt.revision},receipt.replayed);
  });
}
export async function readMobileTelegramResult(user:SessionUser,key:string){
  mobileRequestKey(key);
  // Transfer uses the same owner-domain scope checks as the web. The ledger
  // lookup is actor-bound; raw rows and payloads never leave this adapter.
  const row=await withMobileData(user,'',async()=>(await ownerDatabase.query("SELECT operation,resource_id,resource_revision FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2 AND operation ~ '^telegram[.](contract|transfer):[1-9][0-9]*$'",[user.id,key])).rows[0]);
  if(!row?.resource_id)return{result:null};const isTransfer=String(row.operation).startsWith('telegram.transfer:');return transaction(user,isTransfer,false,async db=>({result:await result(db,user,key,row)}));
}
export async function resolveMobileTelegram(user:SessionUser,key:string,operation:string):Promise<MobileWriteResolution>{
  if(!isTelegramOperation(operation))throw new MobileError('Loại thao tác Telegram chưa hợp lệ.');mobileRequestKey(key);const target=id(operation.split(':')[1]),isTransfer=operation.startsWith('telegram.transfer:');
  return transaction(user,isTransfer,true,async db=>{
    // Check current domain visibility even for a cancellation, before touching
    // the original ledger. Never infer contract scope from fleet visibility.
    if(isTransfer){const e=(await db.query('SELECT vehicle_id FROM himoto.vehicle_location_events WHERE id=$1',[target])).rows[0];if(!e)throw new MobileError('Không tìm thấy lượt chuyển/nhận.',404,'NOT_FOUND');await transfer(db,user,Number(e.vehicle_id),target);}else await contract(db,user,target);
    const cancelled=`cancelled:${operation}`;await db.query('INSERT INTO himoto.management_mobile_requests(user_id,request_id,operation,fingerprint) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,request_id) DO NOTHING',[user.id,key,cancelled,digest(cancelled)]);
    const row=(await db.query('SELECT operation,resource_id,resource_revision FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2 FOR UPDATE',[user.id,key])).rows[0];
    if(!row||row.operation!==operation&&row.operation!==cancelled)throw new MobileError('Mã Telegram đã dùng cho thao tác khác.',409,'REQUEST_KEY_REUSED');
    if(row.operation===cancelled&&row.resource_id===null)return{key,operation,status:'cancelled',receipt:null};
    const proof=await result(db,user,key,row);return{key,operation,status:'committed',receipt:proof.receipt};
  });
}
