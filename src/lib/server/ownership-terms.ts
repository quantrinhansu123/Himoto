import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { validOwnershipTerm } from '@/lib/management/contract-billing';
import { canEditOwnershipTerms,type OwnershipTermsInput,type OwnershipTermsState } from '@/lib/management/ownership-terms';
import { hasPermission,isAdminAccount,type PermissionAccount } from '@/lib/management/permissions';
import { OWNERSHIP_CONTRACT_TYPES } from '@/lib/management/config';
import { EFFECTIVE_RENTAL_TYPE_SQL,VEHICLE_ORDER_SQL } from './contract-classification';

type Database=Pick<PoolClient,'query'>;
export class OwnershipTermsError extends Error {constructor(message:string,public status=400){super(message);}}
const money=(value:unknown)=>value!==null&&value!==undefined&&String(value).trim()!==''&&/^\d{1,13}$/.test(String(value))&&Number.isSafeInteger(Number(value))&&Number(value)>0&&Number(value)<=9_999_999_999_999?Number(value):null;
const object=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
export function parseOwnershipTerms(body:unknown):OwnershipTermsInput {
  if(!body||typeof body!=='object'||Array.isArray(body))throw new OwnershipTermsError('Thông tin thuê sở hữu chưa hợp lệ.');
  const input=body as Record<string,unknown>;
  if(Object.keys(input).some(key=>!['revision','request_id','term_months','daily_amount'].includes(key))||typeof input.revision!=='string'||!/^\d{1,20}$/.test(input.revision)
    ||typeof input.request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.request_id)||!validOwnershipTerm(input.term_months)
    ||input.daily_amount!==null&&(typeof input.daily_amount!=='string'||money(input.daily_amount)===null))throw new OwnershipTermsError('Chọn thời hạn và nhập số tiền mỗi ngày là số nguyên VNĐ lớn hơn 0; để trống nếu chưa xác định.');
  return {revision:input.revision,request_id:input.request_id.toLowerCase(),term_months:input.term_months,daily_amount:input.daily_amount as string|null};
}
async function readRow(db:Database,id:number,user:PermissionAccount,lock=false) {
  if(!Number.isSafeInteger(id)||id<=0)throw new OwnershipTermsError('Mã hợp đồng chưa hợp lệ.');
  const row=(await db.query(`SELECT o.id,o.order_status,o.store_id,o.contract_number,o.draft_reference,o.draft_payload,o.xmin::text AS revision,${EFFECTIVE_RENTAL_TYPE_SQL} AS rental_type
    FROM himoto.orders o WHERE o.id=$1 AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}${lock?' FOR UPDATE OF o':''}`,[id])).rows[0];
  if(!row)throw new OwnershipTermsError('Không tìm thấy hợp đồng trong phạm vi tài khoản.',404);
  if(!isAdminAccount(user)&&!user.scope_all&&(!(Number(user.store_id)>0)||Number(row.store_id)!==Number(user.store_id)))throw new OwnershipTermsError('Không tìm thấy hợp đồng trong phạm vi tài khoản.',404);
  if(!OWNERSHIP_CONTRACT_TYPES.has(String(row.rental_type)))throw new OwnershipTermsError('Chỉ cập nhật thời hạn và mức đóng cho hợp đồng thuê sở hữu.',409);
  return row;
}
async function state(db:Database,row:Record<string,any>,user:PermissionAccount):Promise<OwnershipTermsState> {
  const composer=object(object(row.draft_payload).management_composer),profile=object(composer.profile),draft=object(composer.draft),terms=object(composer.ownership_terms);
  const savedTerm=profile.ownership_term_months??draft.ownership_term_months;
  let daily:number|null;
  if(Object.hasOwn(terms,'daily_amount'))daily=money(terms.daily_amount);
  else {
    const lines=(await db.query('SELECT substitute_unit_price,type FROM himoto.order_vehicle_details WHERE order_id=$1 AND deleted_at IS NULL ORDER BY id',[row.id])).rows;
    const values=lines.map(line=>line.type==='day'?money(line.substitute_unit_price):null);
    if(lines.length&&lines.every(line=>line.type==='day')&&draft.package_name==='Theo ngày'&&money(draft.unit_price)!==null)daily=money(draft.unit_price)!*lines.length;
    else daily=values.length&&values.every(value=>value!==null)?values.reduce<number>((sum,value)=>sum+value!,0):null;
    if(daily!==null&&(!Number.isSafeInteger(daily)||daily>9_999_999_999_999))daily=null;
  }
  const edits=Array.isArray(composer.ownership_terms_history)?composer.ownership_terms_history:[];
  return {id:Number(row.id),code:String(row.contract_number||row.draft_reference||`#${row.id}`),revision:String(row.revision),status:String(row.order_status),
    term_months:validOwnershipTerm(savedTerm)?savedTerm:'custom',daily_amount:daily,can_edit:canEditOwnershipTerms(user)&&!['draft','cancelled'].includes(String(row.order_status)),
    history:edits.map((edit:Record<string,any>)=>({at:String(edit.at),actor:String(edit.actor_name||`#${edit.actor_id}`),before:edit.before,after:edit.after})).reverse()};
}
export async function readOwnershipTerms(db:Database,id:number,user:PermissionAccount) {
  if(!hasPermission(user,'contracts.read'))throw new OwnershipTermsError('Tài khoản không có quyền xem hợp đồng.',403);
  return state(db,await readRow(db,id,user),user);
}
export async function updateOwnershipTerms(db:Database,id:number,user:PermissionAccount,raw:unknown) {
  if(!Number.isSafeInteger(Number(user.id))||Number(user.id)<=0||!canEditOwnershipTerms(user))throw new OwnershipTermsError('Chỉ quản lý Thuê sở hữu hoặc quản trị viên được sửa thời hạn và mức đóng.',403);
  const input=parseOwnershipTerms(raw);await db.query("SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='15s'");
  const row=await readRow(db,id,user,true);
  if(['draft','cancelled'].includes(String(row.order_status)))throw new OwnershipTermsError('Hợp đồng chưa phát hành hoặc đã hủy. Sửa bản nháp bằng luồng lập hợp đồng.',409);
  const payload=object(row.draft_payload),composer=object(payload.management_composer),history=Array.isArray(composer.ownership_terms_history)?composer.ownership_terms_history:[];
  const after={term_months:input.term_months,daily_amount:input.daily_amount===null?null:Number(input.daily_amount)};
  const hash=createHash('sha256').update(JSON.stringify({actor_id:user.id,...after})).digest('hex');
  const prior=history.find((edit:Record<string,any>)=>edit.request_id===input.request_id);
  if(prior){if(prior.hash!==hash)throw new OwnershipTermsError('Mã lưu đã được dùng cho nội dung khác.',409);return state(db,row,user);}
  if(String(row.revision)!==input.revision)throw new OwnershipTermsError('Hợp đồng đã thay đổi. Tải lại thời hạn và mức đóng trước khi lưu.',409);
  const current=await state(db,row,user),before={term_months:current.term_months,daily_amount:current.daily_amount};
  if(before.term_months===after.term_months&&before.daily_amount===after.daily_amount)return current;
  const at=new Date().toISOString(),actor_name=String((user as PermissionAccount&{name?:string}).name||`#${user.id}`);
  const updated={...payload,management_composer:{...composer,profile:{...object(composer.profile),ownership_term_months:after.term_months},
    ownership_terms:{version:1,daily_amount:after.daily_amount,updated_at:at,updated_by:user.id},
    ownership_terms_history:[...history,{at,actor_id:user.id,actor_name,request_id:input.request_id,hash,before,after}]}};
  const result=await db.query('UPDATE himoto.orders SET draft_payload=$2::json,updated_at=now() WHERE id=$1 RETURNING xmin::text AS revision',[id,JSON.stringify(updated)]);
  return state(db,{...row,draft_payload:updated,revision:result.rows[0].revision},user);
}
