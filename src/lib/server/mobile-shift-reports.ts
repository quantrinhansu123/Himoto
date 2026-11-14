import "server-only";
import type { PoolClient } from "pg";
import type { NextRequest } from "next/server";
import type { SessionUser } from "./management-session";
import { hasPermission } from "@/lib/management/permissions";
import { withMobileData } from "./mobile-context";
import { himotoPool } from "./himoto-database";
import { MobileError } from "./mobile-session";
import { listShiftReports,saveShiftReport } from "./shift-report-domain";
import { readShiftAuditSnapshot,saveShiftAudit } from "./shift-audit-domain";
import { ShiftRequestError } from "./shift-report-requests";
import { readShiftTelegram,retryShiftTelegram } from "./shift-telegram-domain";
import { ShiftAutofillError,parseShiftAutofill,readShiftAutofill } from "./shift-autofill";
import { idempotentMobileWrite,mobileBody,mobileRequestKey } from "./mobile-writes";
import { parseShiftInput,type ShiftReport,type MobileShiftSave,type MobileAuditSave,type MobileShiftResult } from "../../../shared/mobile-shift-reports";
function permission(user:SessionUser,action:"read"|"write"|"audit"="read") {
  if(!hasPermission(user,"contracts.read")||action==="write"&&!hasPermission(user,"contracts.draft")&&!hasPermission(user,"finance.write")||action==="audit"&&!hasPermission(user,"shift.review"))throw new MobileError("Tài khoản không có quyền thực hiện báo cáo ca.",403,"FORBIDDEN");
}
export function mobileShiftId(id:string){if(!/^[1-9]\d{0,14}$/.test(id))throw new MobileError("Mã báo cáo không hợp lệ.");return Number(id);}
function fields(raw:URLSearchParams,keys:string[]){for(const[k]of raw)if(!keys.includes(k)||raw.getAll(k).length!==1)throw new MobileError("Bộ lọc báo cáo ca không hợp lệ.");}
async function transaction<T>(user:SessionUser,read:boolean,run:(client:PoolClient)=>Promise<T>) {
  permission(user);return withMobileData(user,"",async()=>{const client=await himotoPool.connect();try{
    await client.query(read?"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY":"BEGIN");await client.query("SET LOCAL lock_timeout='5s'");const result=await run(client);await client.query("COMMIT");return result;
  }catch(error){await client.query("ROLLBACK").catch(()=>{});if(error instanceof ShiftRequestError||error instanceof ShiftAutofillError)throw new MobileError(error.message,error.status);if((error as {code?:string}).code==='23505')throw new MobileError("Cơ sở đã có báo cáo ngày này. Mở lại từ danh sách.",409);throw error;}finally{client.release();}});
}
function report(row:ShiftReport):ShiftReport {return {...row,updated_at:new Date(row.updated_at).toISOString(),media:row.media?.map(m=>({...m,url:`/api/mobile/v1/shift-reports/${row.id}/media/${m.id}`}))};}
async function current(client:PoolClient,id:number) {const row=(await listShiftReports(client,null,null,id))[0];if(!row)throw new MobileError("Báo cáo không tồn tại hoặc ngoài phạm vi truy cập.",404,"NOT_FOUND");return report(row);}
export function readMobileShiftOptions(user:SessionUser){return transaction(user,true,async client=>({canWrite:hasPermission(user,"contracts.draft")||hasPermission(user,"finance.write"),canReview:hasPermission(user,"shift.review"),stores:(await client.query("SELECT id,store_name,kind FROM himoto.stores ORDER BY store_name,id")).rows.map(s=>({id:Number(s.id),name:String(s.store_name||""),kind:String(s.kind||"")}))}));}
export function readMobileShifts(user:SessionUser,params:URLSearchParams){fields(params,["store_id","date"]);return transaction(user,true,async client=>({rows:(await listShiftReports(client,params.get("store_id"),params.get("date"))).map(report)}));}
export function readMobileShift(user:SessionUser,rawId:string){const id=mobileShiftId(rawId);return transaction(user,true,client=>current(client,id));}
export function readMobileShiftAutofill(user:SessionUser,params:URLSearchParams){fields(params,["store_id","date","section"]);const input=parseShiftAutofill(params);if(!user.scope_all&&input.store_id!==user.store_id)throw new MobileError("PGD ngoài phạm vi được phân công.",403,"FORBIDDEN");return transaction(user,true,client=>readShiftAutofill(client,input));}
export async function saveMobileShift(user:SessionUser,request:NextRequest){
  permission(user,"write");const key=mobileRequestKey(request.headers.get("Idempotency-Key")),body=await mobileBody(request,65536);
  if(Object.keys(body).some(k=>!["payload","id","revision","status"].includes(k)))throw new MobileError("Thông tin báo cáo không hợp lệ.");
  let input;try{input=parseShiftInput(body.payload);}catch(error){throw new MobileError((error as Error).message);}
  const raw={...body,payload:input} as unknown as MobileShiftSave;const operation=raw.id==null?"shift.create":`shift.update:${mobileShiftId(String(raw.id))}`;
  const receipt=await transaction(user,false,client=>idempotentMobileWrite(client,user.id,key,operation,raw,async()=>{const saved=await saveShiftReport(client,{...user,store_id:user.store_id??null,scope_all:user.scope_all===true},raw,key);return{id:Number(saved.id),revision:String(saved.revision)};}));
  return {key,operation,receipt,deliveryKey:raw.status==="submitted"?`shift:${receipt.id}`:null};
}
export function readMobileShiftSnapshot(user:SessionUser,id:string){mobileShiftId(id);return transaction(user,true,client=>readShiftAuditSnapshot(client,id));}
export function readMobileShiftTelegram(user:SessionUser,id:string,stage='pgd'){mobileShiftId(id);return transaction(user,true,client=>readShiftTelegram(client,id,stage));}
export function retryMobileShiftTelegram(user:SessionUser,id:string,stage='pgd'){permission(user,stage==='audit'?'audit':'write');mobileShiftId(id);return transaction(user,true,client=>retryShiftTelegram(client,id,stage));}
export async function saveMobileShiftAudit(user:SessionUser,id:string,request:NextRequest){
  permission(user,"audit");mobileShiftId(id);const key=mobileRequestKey(request.headers.get("Idempotency-Key")),raw=await mobileBody(request,131072);
  if(Object.keys(raw).some(k=>!["input","revision","report_revision","status","fingerprint"].includes(k)))throw new MobileError("Thông tin đối soát không hợp lệ.");
  return transaction(user,false,client=>idempotentMobileWrite(client,user.id,key,`shift.audit:${id}`,raw,async()=>{const saved=await saveShiftAudit(client,{...user,store_id:user.store_id??null,scope_all:user.scope_all===true},id,raw as unknown as MobileAuditSave,key);return{id:Number(saved.id),revision:String(saved.revision)};}));
}
export function readMobileShiftResult(user:SessionUser,key:string):Promise<MobileShiftResult>{mobileRequestKey(key);return transaction(user,true,async client=>{const row=(await client.query("SELECT operation,resource_id,resource_revision FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2 AND operation ~ '^shift[.](create|(update|audit|media):[1-9][0-9]*)$'",[user.id,key])).rows[0];if(!row?.resource_id)throw new MobileError("Chưa có xác nhận báo cáo ca. Giữ mã để đối chiếu.",404,"NOT_FOUND");return {key,operation:String(row.operation),receipt:{id:Number(row.resource_id),revision:String(row.resource_revision)},current:await current(client,Number(row.resource_id))};});}
