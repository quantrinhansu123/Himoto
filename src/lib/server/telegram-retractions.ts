import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ownerDatabase } from './himoto-database';
import { openIntegrationSecret } from './integration-secrets';
import { canSendContractEvent,type ContractEventType } from '@/lib/management/contract-telegram';
import type { PermissionAccount } from '@/lib/management/permissions';

type Database=Pick<PoolClient,'query'>;
export interface DeliveryTarget {chat_id:string;thread_id?:number|null;bot_id:string;started_at:string}
export interface Retraction {state:'pending'|'processing'|'failed'|'done';request_id:string;actor_id:number;reason:string;requested_at:string;attempt_at?:string;deleted_ids:number[];error?:string;finished_at?:string}
export interface RetractableNotice {id:string;event_type:ContractEventType;status:string;message_ids:number[];delivery_target?:DeliveryTarget|null;retraction?:Retraction|null}
export class TelegramRetractionError extends Error {constructor(message:string,public status=400){super(message);}}
export const telegramBotIdentity=(token:string)=>createHash('sha256').update(token.split(':')[0]).digest('hex');
const validIds=(ids:unknown):ids is number[]=>Array.isArray(ids)&&ids.length>0&&ids.length<=5000&&ids.every(id=>Number.isSafeInteger(id)&&id>0)&&new Set(ids).size===ids.length;
export function retractionEligibility(notice:RetractableNotice,user:PermissionAccount,now=Date.now()) {
  const target=notice.delivery_target,start=Date.parse(target?.started_at||'');
  const expires=Number.isFinite(start)?start+48*3600_000:null;
  const reason=!canSendContractEvent(user,notice.event_type)?'Tài khoản chưa có quyền thu hồi giao dịch này.'
    :notice.retraction?.state==='done'?'Đã thu hồi lần gửi này.'
    :['pending','processing'].includes(notice.retraction?.state||'')?'Đang thu hồi. Chờ kết quả từ Telegram.'
    :notice.status!=='sent'?'Chỉ thu hồi lần gửi đã được Telegram xác nhận đầy đủ.'
    :!validIds(notice.message_ids)?'Lần gửi này thiếu mã tin; cần quản trị nhóm đối chiếu.'
    :!target||!/^-[0-9]{5,18}$/.test(target.chat_id)||!/^[0-9a-f]{64}$/.test(target.bot_id)||expires===null?'Tin cũ chưa lưu chính xác nhóm nhận; nhờ quản trị nhóm xóa trực tiếp.'
    :start>now||expires<=now+60_000?'Đã sát hoặc quá giới hạn thu hồi 48 giờ; nhờ quản trị nhóm xóa trực tiếp.':'';
  return {can_retract:!reason,blocked_reason:reason,expires_at:expires?new Date(expires).toISOString():null};
}
export async function queueTelegramRetraction(db:Database,orderId:number,actorId:number,user:PermissionAccount,input:Record<string,unknown>) {
  const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  if(Object.keys(input).some(key=>!['action','notice_id','event_key','request_id','reason','confirmed'].includes(key))||typeof input.notice_id!=='string'||!uuid.test(input.notice_id)
    ||typeof input.request_id!=='string'||!uuid.test(input.request_id)||typeof input.event_key!=='string'||input.event_key.length>256||input.confirmed!==true
    ||typeof input.reason!=='string'||input.reason.length>500)throw new TelegramRetractionError('Chọn đúng lần gửi, xác nhận thu hồi; lý do tối đa 500 ký tự.');
  const order=await db.query('SELECT id FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[orderId]);
  if(!order.rowCount)throw new TelegramRetractionError('Không tìm thấy hợp đồng.',404);
  const row=(await db.query(`SELECT id,event_type,status,message_ids,delivery_target,retraction,COALESCE(root_event_key,event_key) AS root_key
    FROM himoto.management_contract_notifications WHERE id=$1 AND order_id=$2 FOR UPDATE`,[input.notice_id,orderId])).rows[0];
  if(!row||row.root_key!==input.event_key)throw new TelegramRetractionError('Lần gửi không thuộc giao dịch của hợp đồng này.',404);
  if(!canSendContractEvent(user,row.event_type))throw new TelegramRetractionError('Tài khoản chưa có quyền thu hồi giao dịch này.',403);
  if(row.retraction?.state==='done'||['pending','processing'].includes(row.retraction?.state))return;
  if((await db.query(`SELECT id FROM himoto.management_contract_notifications WHERE order_id=$1
    AND COALESCE(root_event_key,event_key)=$2 AND status IN ('pending','sending') LIMIT 1`,[orderId,row.root_key])).rowCount)
    throw new TelegramRetractionError('Giao dịch đang gửi Telegram. Chờ gửi xong rồi chọn đúng lần cần thu hồi.',409);
  const eligibility=retractionEligibility(row,user);
  if(!eligibility.can_retract)throw new TelegramRetractionError(eligibility.blocked_reason,409);
  const retraction:Retraction={state:'pending',request_id:input.request_id,actor_id:actorId,reason:input.reason.trim(),requested_at:new Date().toISOString(),deleted_ids:row.retraction?.deleted_ids||[]};
  await db.query(`UPDATE himoto.management_contract_notifications SET retraction=$2::jsonb,
    delivery_review=delivery_review||$3::jsonb WHERE id=$1`,[row.id,JSON.stringify(retraction),JSON.stringify([{outcome:'retraction_requested',...retraction}])]);
}
export function retractionErrorText(code?:string) {
  return code==='BOT_CHANGED'?'Bot đã thay đổi. Cần quản trị nhóm xóa trực tiếp.'
    :code==='TELEGRAM_403'?'Bot không có quyền xóa tin trong nhóm. Nhờ quản trị nhóm kiểm tra quyền bot rồi thử lại.'
    :code==='TELEGRAM_400'?'Telegram chưa cho xóa tin: có thể đã quá hạn hoặc bot không còn quyền trong nhóm. Nhờ quản trị nhóm kiểm tra.'
    :code==='EXPIRED'?'Đã quá 48 giờ. Nhờ quản trị nhóm xóa trực tiếp.'
    :code==='NOT_CONFIGURED'?'Chưa có cấu hình bot. Nhờ quản trị kiểm tra.'
    :'Chưa xác nhận thu hồi đủ tin. Có thể thử lại; hệ thống bỏ qua các tin đã gỡ thành công.';
}
/** Committed queue, atomic claim, idempotent Telegram deleteMessages and per-batch checkpoints. */
export async function dispatchTelegramRetractions(send:typeof fetch=fetch,limit=3,database:Database=ownerDatabase,orderIds?:number[],deadline=Date.now()+90_000) {
  let completed=0;
  for(let index=0;index<limit&&Date.now()+20_000<deadline;index++){
    const row=(await database.query(`WITH retraction_candidate AS (SELECT id FROM himoto.management_contract_notifications
      WHERE order_id IS NOT NULL AND ($1::bigint[] IS NULL OR order_id=ANY($1))
        AND (retraction->>'state'='pending' OR retraction->>'state'='processing' AND (retraction->>'attempt_at')::timestamptz<now()-interval '2 minutes')
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE himoto.management_contract_notifications n SET retraction=n.retraction||jsonb_build_object('state','processing','attempt_at',now())
      FROM retraction_candidate c WHERE n.id=c.id RETURNING n.*`,[orderIds||null])).rows[0];
    if(!row)break;
    const retraction=row.retraction as Retraction,target=row.delivery_target as DeliveryTarget;
    const deleted=[...retraction.deleted_ids];let failure='';
    try{
      if(!validIds(row.message_ids)||!target||!/^-[0-9]{5,18}$/.test(target.chat_id))throw new Error('INVALID_TARGET');
      const settings=(await database.query('SELECT bot_cipher FROM himoto.management_telegram_settings WHERE singleton=true')).rows[0];
      if(!settings?.bot_cipher)throw new Error('NOT_CONFIGURED');
      const {token}=openIntegrationSecret<{token:string}>(settings.bot_cipher);
      if(telegramBotIdentity(token)!==target.bot_id)throw new Error('BOT_CHANGED');
      const remaining=(row.message_ids as number[]).filter(id=>!deleted.includes(id));
      for(let offset=0;offset<remaining.length;offset+=100){
        if(Date.parse(target.started_at)+48*3600_000<=Date.now()+15_000)throw new Error('EXPIRED');
        if(Date.now()+20_000>deadline)throw new Error('DEADLINE');
        const batch=remaining.slice(offset,offset+100);
        const response=await send(`https://api.telegram.org/bot${token}/deleteMessages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:target.chat_id,message_ids:batch}),signal:AbortSignal.timeout(15_000),redirect:'error',cache:'no-store'});
        const result=await response.json();
        if(!response.ok||result?.ok!==true||result.result!==true)throw new Error(result?.ok===false&&Number.isInteger(result.error_code)?`TELEGRAM_${result.error_code}`:'INVALID_RESPONSE');
        deleted.push(...batch);
        await database.query(`UPDATE himoto.management_contract_notifications SET retraction=retraction||jsonb_build_object('deleted_ids',$2::jsonb) WHERE id=$1`,[row.id,JSON.stringify(deleted)]);
      }
    }catch(error){const code=error instanceof Error?error.message:'';failure=/^(BOT_CHANGED|NOT_CONFIGURED|INVALID_TARGET|EXPIRED|DEADLINE|INVALID_RESPONSE|TELEGRAM_\d+)$/.test(code)?code:'NETWORK';}
    const outcome={...retraction,state:failure?'failed':'done',deleted_ids:deleted,...(failure?{error:failure}:{}),finished_at:new Date().toISOString()};
    await database.query(`UPDATE himoto.management_contract_notifications SET retraction=$2::jsonb,delivery_review=delivery_review||$3::jsonb WHERE id=$1`,[row.id,JSON.stringify(outcome),JSON.stringify([{outcome:failure?'retraction_failed':'retracted',...outcome}])]);
    if(!failure)completed++;
  }
  return {completed};
}
