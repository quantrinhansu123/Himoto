import "server-only";
import type { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { hasPermission, canSendDebtReminder } from "@/lib/management/permissions";
import { DebtReminderError, listDebtReminders, readDebtReminderContext, sendDebtReminder, parseDebtReminderInput, type ReminderReservation } from "./debt-reminders";
import { ContractPaymentError } from "./contract-payments";
import { himotoPool } from "./himoto-database";
import { withMobileData } from "./mobile-context";
import { MobileError } from "./mobile-session";
import type { SessionUser } from "./management-session";
import { idempotentMobileWrite, mobileBody, mobileRequestKey } from "./mobile-writes";
import { readManagementTable, ManagementTableError } from "./management-table";
import { mobileRecord } from "./mobile-catalogue";
import { reminderOperation, type DebtReminderRow, type MobileReminderHistory, type MobileReminderResult } from "../../../shared/mobile-debt-reminders";
import {readAllExportRows} from './mobile-filtered-workbook';

function allowed(user:SessionUser,write=false) {
  if(!hasPermission(user,"contracts.read")||write&&!canSendDebtReminder(user))throw new MobileError("Tài khoản không có quyền thực hiện nhắc nợ.",403,"FORBIDDEN");
}
function orderId(raw:string) { if(!/^[1-9]\d{0,14}$/.test(raw))throw new MobileError("Mã hợp đồng không hợp lệ.");return Number(raw); }
function failure(error:unknown):never { if(error instanceof DebtReminderError||error instanceof ContractPaymentError)throw new MobileError(error.message,error.status);if(error instanceof ManagementTableError)throw new MobileError(error.message);throw error; }
async function read<T>(user:SessionUser,run:(client:PoolClient)=>Promise<T>) {
  allowed(user);return withMobileData(user,"",async()=>{const client=await himotoPool.connect();try{await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");const result=await run(client);await client.query("COMMIT");return result;}catch(error){await client.query("ROLLBACK").catch(()=>{});return failure(error);}finally{client.release();}});
}
function query(raw:URLSearchParams,search=false) {
  for(const[k]of raw)if(!["store","page",...(search?["search"]:[])].includes(k)||raw.getAll(k).length!==1)throw new MobileError("Bộ lọc nhắc nợ không hợp lệ.");
  const store=raw.get("store")||"all",page=raw.get("page")||"1",term=raw.get("search")||"";
  if(store!=="all"&&!/^[1-9]\d{0,14}$/.test(store)||!/^[1-9]\d{0,5}$/.test(page)||term.length>200)throw new MobileError("Bộ lọc nhắc nợ không hợp lệ.");return {store,page:Number(page),term};
}
function row(raw:Record<string,unknown>):DebtReminderRow { return {request_id:String(raw.request_id),order_id:Number(raw.order_id),store_id:Number(raw.store_id),contract_code:String(raw.contract_code),store_name:String(raw.store_name||""),customer_name:String(raw.customer_name),phone:String(raw.phone),message:String(raw.message),amount:Number(raw.amount),status:raw.status as DebtReminderRow["status"],created_at:new Date(raw.created_at as string).toISOString(),actor_name:String(raw.actor_name||"")}; }
export function readMobileReminderOptions(user:SessionUser) { return read(user,async client=>({canSend:canSendDebtReminder(user),stores:(await client.query("SELECT id,store_name FROM himoto.stores ORDER BY store_name,id")).rows.map(s=>({id:Number(s.id),name:String(s.store_name||"")}))})); }
export function readMobileReminderHistory(user:SessionUser,raw:URLSearchParams):Promise<MobileReminderHistory> { const q=query(raw);return read(user,async client=>{const data=await listDebtReminders(client,q.store,q.page);return {...data,rows:data.rows.map(row)};}); }
export function readMobileReminderExportRows(user:SessionUser,raw:URLSearchParams) {
  const q=query(raw);return read(user,async client=>{
    await client.query("SET LOCAL statement_timeout='60s'");
    return readAllExportRows(async page=>{const data=await listDebtReminders(client,q.store,page);return {...data,size:20,rows:data.rows.map(row)};},r=>r.request_id);
  });
}
export function readMobileReminderContracts(user:SessionUser,raw:URLSearchParams) {
  allowed(user,true);const q=query(raw,true);return read(user,async client=>{const data=await readManagementTable(client,"contracts",new URLSearchParams({store:q.store,page:String(q.page),size:"20",search:q.term,scope:"remindable",sort:"code",direction:"desc"}));return {...data,rows:data.rows.map(r=>mobileRecord("contracts",r)),updatedAt:new Date().toISOString()};});
}
export function readMobileReminderContext(user:SessionUser,rawId:string) { allowed(user,true);const id=orderId(rawId);return read(user,client=>readDebtReminderContext(client,id)); }
export async function sendMobileReminder(user:SessionUser,request:NextRequest,send:typeof fetch=fetch) {
  allowed(user,true);const key=mobileRequestKey(request.headers.get("Idempotency-Key")),body=await mobileBody(request,24576);
  if("request_id" in body)throw new MobileError("Mã lần gửi chỉ lấy từ header.");
  let input;try{input=parseDebtReminderInput({...body,request_id:key});}catch(error){return failure(error);}
  return withMobileData(user,"",async()=>{try{
    return await sendDebtReminder(himotoPool,user.id,input,send,async(client,normalized,reserve)=>{
      let reservation:ReminderReservation|undefined;
      const receipt=await idempotentMobileWrite(client,user.id,key,reminderOperation(input.order_id),normalized,async()=>{reservation=await reserve();return {id:input.order_id,revision:input.revision};});
      if(reservation)return reservation;
      const existing=(await client.query("SELECT status FROM himoto.management_debt_reminders WHERE request_id=$1 AND actor_id=$2 AND order_id=$3",[key,user.id,receipt.id])).rows[0];
      if(!existing)throw new MobileError("Chưa tìm thấy lịch sử của mã gốc. Giữ mã để đối chiếu.",409);
      return {status:existing.status,replayed:true};
    });
  }catch(error){return failure(error);}});
}
export function readMobileReminderResult(user:SessionUser,key:string):Promise<MobileReminderResult> {
  mobileRequestKey(key);return read(user,async client=>{
    const record=(await client.query(`SELECT r.*,s.store_name,u.name AS actor_name FROM himoto.management_debt_reminders r
      JOIN himoto.management_mobile_requests m ON m.user_id=r.actor_id AND m.request_id=r.request_id AND m.operation='reminder.send:'||r.order_id::text AND m.resource_id=r.order_id
      LEFT JOIN himoto.stores s ON s.id=r.store_id LEFT JOIN himoto.users u ON u.id=r.actor_id
      WHERE r.request_id=$1 AND r.actor_id=$2`,[key,user.id])).rows[0];
    if(!record)throw new MobileError("Chưa có lịch sử gửi trong phạm vi hiện tại. Giữ mã để đối chiếu.",404,"NOT_FOUND");return {key,receipt:row(record)};
  });
}
