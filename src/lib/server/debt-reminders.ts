import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { PAYABLE_STATUSES,MAX_PAYMENT_AMOUNT } from '@/lib/management/contract-payments';
import { branchQrAccounts,defaultBranchQrAccount } from '@/lib/management/sepay';
import { debtReminderMessage,normalizeReminderPhone,type DebtReminderContext,type DebtReminderInput,type ReminderStatus } from '@/lib/management/debt-reminders';
import { readPaymentContext } from './contract-payments';
import { ownerDatabase } from './himoto-database';

type Database=Pick<PoolClient,'query'>;
type Pool=Database&{connect:()=>Promise<PoolClient>};
export class DebtReminderError extends Error {constructor(message:string,public status=400){super(message);}}
export function parseDebtReminderInput(raw:unknown):DebtReminderInput {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new DebtReminderError('Thông tin nhắc nợ không hợp lệ.');
  const input=raw as Record<string,unknown>;
  if(Object.keys(input).some(key=>!['request_id','order_id','revision','amount','phone','message'].includes(key))||
    typeof input.request_id!=='string'||!(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.request_id))||
    !Number.isSafeInteger(input.order_id)||Number(input.order_id)<1||typeof input.revision!=='string'||!/^\d{1,20}$/.test(input.revision)||
    !Number.isSafeInteger(input.amount)||Number(input.amount)<=0||Number(input.amount)>MAX_PAYMENT_AMOUNT||
    typeof input.phone!=='string'||input.phone.length>30||!normalizeReminderPhone(input.phone)||typeof input.message!=='string'||
    !input.message.trim()||input.message.trim().length>4000||Array.from(input.message).some(char=>{const code=char.charCodeAt(0);return code===127||code<32&&![9,10,13].includes(code);}))throw new DebtReminderError('Kiểm tra hợp đồng, số điện thoại di động và nội dung (tối đa 4.000 ký tự).');
  return {request_id:input.request_id.toLowerCase(),order_id:Number(input.order_id),revision:input.revision,amount:Number(input.amount),phone:normalizeReminderPhone(input.phone)!,message:input.message.trim()};
}
export async function readDebtReminderContext(client:Database,id:number):Promise<DebtReminderContext> {
  const payment=await readPaymentContext(client,id);
  // Installment contracts only remind for money already due, not future installments.
  const amount=payment.billing?payment.billing.due_amount:payment.remaining;
  if(!PAYABLE_STATUSES.includes(payment.status)||amount===null||amount<=0)throw new DebtReminderError('Hợp đồng chưa phát hành, đã hủy hoặc không còn khoản đến hạn cần nhắc.',409);
  const result=await client.query(`SELECT COALESCE(NULLIF(c.name,''),o.customer_name,'') AS customer_name,
      COALESCE(NULLIF(c.phone,''),o.customer_phone,'') AS phone,s.store_name
    FROM himoto.orders o LEFT JOIN himoto.customers c ON c.id=o.customer_id LEFT JOIN himoto.stores s ON s.id=o.store_id
    WHERE o.id=$1 AND o.deleted_at IS NULL`,[id]);
  if(!result.rowCount)throw new DebtReminderError('Không tìm thấy hợp đồng.',404);
  const row=result.rows[0],phone=normalizeReminderPhone(String(row.phone));
  if(!phone)throw new DebtReminderError('Số điện thoại khách trên hợp đồng chưa hợp lệ để gửi Zalo. Cập nhật hồ sơ khách hàng trước.',409);
  const context={id,code:payment.code,store_id:payment.store_id,store_name:String(row.store_name||''),customer_name:String(row.customer_name),phone,
    revision:payment.revision,amount,due_at:payment.billing?.next_due_at??payment.end_date,
    bank:defaultBranchQrAccount(branchQrAccounts(payment.accounts,payment.store_id))};
  return {...context,message:debtReminderMessage(context)};
}
export function reminderWebhookUrl(env:Record<string,string|undefined>=process.env) {
  let url:URL;try{url=new URL(env.ZALO_REMINDER_WEBHOOK_URL||'');}catch{throw new DebtReminderError('Chưa cấu hình kết nối gửi nhắc nợ Zalo.',503);}
  if(url.protocol!=='https:'||url.username||url.password||url.hash)throw new DebtReminderError('Cấu hình kết nối Zalo không hợp lệ.',503);
  return url.toString();
}
export async function configuredReminderWebhookUrl(database:Database=ownerDatabase) {
  if(process.env.ZALO_REMINDER_WEBHOOK_URL)return reminderWebhookUrl();
  const result=await database.query('SELECT webhook_url FROM himoto.management_zalo_settings WHERE singleton=true');
  return reminderWebhookUrl({ZALO_REMINDER_WEBHOOK_URL:result.rows[0]?.webhook_url});
}
/** No automatic retries: a timeout may occur after the provider has already sent the message. */
export async function deliverReminder(url:string,input:Pick<DebtReminderInput,'phone'|'message'>,send:typeof fetch=fetch):Promise<{status:ReminderStatus;provider_status:number|null}> {
  try {
    const response=await send(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({phone:input.phone,message:input.message}).toString(),redirect:'error',signal:AbortSignal.timeout(15000),cache:'no-store'});
    const body:unknown=await response.json().catch(()=>null);
    const record=body&&typeof body==='object'?body as Record<string,unknown>:null;
    const rejected=record&&(record.success===false||record.status==='error'||record.status==='failed'||Boolean(record.error));
    return {status:response.ok&&!rejected?'accepted':'failed',provider_status:response.status};
  } catch {return {status:'unknown',provider_status:null};}
}
/** Reserve and commit before network I/O. Replayed UUIDs never call the provider again. */
export async function sendDebtReminder(pool:Pool,actorId:number,raw:unknown,send:typeof fetch=fetch) {
  const input=parseDebtReminderInput(raw),url=await configuredReminderWebhookUrl();
  if(!Number.isSafeInteger(actorId)||actorId<1)throw new DebtReminderError('Người gửi không hợp lệ.',403);
  const fingerprint=createHash('sha256').update(JSON.stringify([actorId,input.order_id,input.revision,input.amount,input.phone,input.message])).digest('hex');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`debt-reminder-request:${input.request_id}`]);
    const previous=(await client.query('SELECT fingerprint,status FROM himoto.management_debt_reminders WHERE request_id=$1',[input.request_id])).rows[0];
    if(previous){if(previous.fingerprint!==fingerprint)throw new DebtReminderError('Mã lần gửi đã dùng cho thông tin khác.',409);await client.query('COMMIT');return {request_id:input.request_id,status:previous.status as ReminderStatus,replayed:true};}
    const locked=await client.query('SELECT id FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR SHARE',[input.order_id]);
    if(!locked.rowCount)throw new DebtReminderError('Không tìm thấy hợp đồng.',404);
    const context=await readDebtReminderContext(client,input.order_id);
    if(context.revision!==input.revision||context.amount!==input.amount||context.phone!==input.phone)throw new DebtReminderError('Công nợ hoặc số điện thoại đã thay đổi. Đóng form rồi mở lại trước khi gửi.',409);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`debt-reminder-order:${input.order_id}`]);
    const recent=await client.query("SELECT request_id FROM himoto.management_debt_reminders WHERE order_id=$1 AND status IN('pending','accepted','unknown') AND created_at>now()-interval '60 seconds' LIMIT 1",[input.order_id]);
    if(recent.rowCount)throw new DebtReminderError('Hợp đồng vừa được nhắc trong vòng 60 giây. Kiểm tra lịch sử gửi trước khi tạo lần mới.',429);
    await client.query(`INSERT INTO himoto.management_debt_reminders(request_id,order_id,store_id,actor_id,fingerprint,contract_code,customer_name,phone,message,amount)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[input.request_id,input.order_id,context.store_id,actorId,fingerprint,context.code,context.customer_name,input.phone,input.message,input.amount]);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  const result=await deliverReminder(url,input,send);
  await pool.query('UPDATE himoto.management_debt_reminders SET status=$2,provider_status=$3,updated_at=now() WHERE request_id=$1 AND status=\'pending\'',[input.request_id,result.status,result.provider_status]);
  return {request_id:input.request_id,status:result.status,replayed:false};
}
export async function listDebtReminders(client:Database,store:string,page:number) {
  if(store!=='all'&&(!/^[1-9]\d*$/.test(store)||!Number.isSafeInteger(Number(store)))||!Number.isSafeInteger(page)||page<1||page>1000000)throw new DebtReminderError('Bộ lọc lịch sử không hợp lệ.');
  const storeId=store==='all'?null:Number(store),size=20;
  const count=await client.query('SELECT count(*)::int AS total FROM himoto.management_debt_reminders WHERE ($1::bigint IS NULL OR store_id=$1)',[storeId]);
  const rows=await client.query(`SELECT r.request_id,r.order_id,r.store_id,r.contract_code,r.customer_name,r.phone,r.message,r.amount,r.status,r.created_at,s.store_name,u.name AS actor_name
    FROM himoto.management_debt_reminders r LEFT JOIN himoto.stores s ON s.id=r.store_id LEFT JOIN himoto.users u ON u.id=r.actor_id
    WHERE ($1::bigint IS NULL OR r.store_id=$1) ORDER BY r.created_at DESC,r.request_id LIMIT $2 OFFSET $3`,[storeId,size,(page-1)*size]);
  return {rows:rows.rows.map(row=>({...row,order_id:Number(row.order_id),store_id:Number(row.store_id),amount:Number(row.amount)})),total:Number(count.rows[0].total),page,pages:Math.max(1,Math.ceil(Number(count.rows[0].total)/size))};
}
