import 'server-only';
import type { PoolClient } from 'pg';
import { canApproveOwnershipContract,isOwnershipApprovalContract,type OwnershipApprovalState } from '@/lib/management/contract-approval';
import type { PermissionAccount } from '@/lib/management/permissions';
import { EFFECTIVE_RENTAL_TYPE_SQL,VEHICLE_ORDER_SQL } from './contract-classification';

type Database=Pick<PoolClient,'query'>;
export class ContractApprovalError extends Error {constructor(message:string,public status=400){super(message);}}
async function order(db:Database,id:number,lock=false) {
  if(!Number.isSafeInteger(id)||id<=0)throw new ContractApprovalError('Mã hợp đồng chưa hợp lệ.');
  const row=(await db.query(`SELECT o.*,o.xmin::text AS revision,s.kind AS store_kind,s.store_name,${EFFECTIVE_RENTAL_TYPE_SQL} AS rental_type,
    approver.name AS approved_by FROM himoto.orders o LEFT JOIN himoto.stores s ON s.id=o.store_id
    LEFT JOIN himoto.users approver ON approver.id=CASE WHEN (o.draft_payload #>> '{management_composer,approval,actor_id}') ~ '^[0-9]{1,15}$'
      THEN (o.draft_payload #>> '{management_composer,approval,actor_id}')::bigint END
    WHERE o.id=$1 AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}${lock?' FOR UPDATE OF o':''}`,[id])).rows[0];
  if(!row)throw new ContractApprovalError('Không tìm thấy hợp đồng trong phạm vi tài khoản.',404);
  if(!isOwnershipApprovalContract(row))throw new ContractApprovalError('Chỉ duyệt hợp đồng thuê sở hữu hoặc hợp đồng thuộc cơ sở thuê sở hữu.',409);
  return row;
}
const amount=(value:unknown)=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value);
function state(row:Record<string,any>,user:PermissionAccount):OwnershipApprovalState {
  const approval=row.draft_payload?.management_composer?.approval;
  return {id:Number(row.id),code:String(row.contract_number||row.draft_reference||`#${row.id}`),revision:String(row.revision),status:String(row.order_status),
    customer_name:String(row.customer_name||''),store_name:String(row.store_name||''),rental_type:String(row.rental_type||''),total_amount:amount(row.total),
    deposit_amount:row.first_deposit_amount==null&&row.additional_deposit_amount==null?null:Number(row.first_deposit_amount||0)+Number(row.additional_deposit_amount||0),
    approved_at:typeof approval?.at==='string'?approval.at:null,approved_by:row.approved_by||approval?.actor_name|| (approval?.actor_id?`#${approval.actor_id}`:null),
    can_approve:canApproveOwnershipContract(user)&&!['draft','cancelled'].includes(String(row.order_status))&&!approval?.at};
}
export async function readContractApproval(db:Database,id:number,user:PermissionAccount) {return state(await order(db,id),user);}
export async function approveIssuedContract(db:Database,id:number,user:PermissionAccount&{id:number},body:unknown) {
  if(!canApproveOwnershipContract(user))throw new ContractApprovalError('Chỉ quản lý hoặc quản trị viên được duyệt hợp đồng sở hữu.',403);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>key!=='revision')||typeof (body as {revision?:unknown}).revision!=='string'||!/^\d{1,20}$/.test((body as {revision:string}).revision))throw new ContractApprovalError('Phiên bản hợp đồng chưa hợp lệ.');
  await db.query("SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='15s'");
  const row=await order(db,id,true),payload=structuredClone(row.draft_payload||{}),composer=payload.management_composer||{};
  if(composer.approval?.at)return state(row,user);
  if(['draft','cancelled'].includes(row.order_status))throw new ContractApprovalError(row.order_status==='draft'?'Mở bản nháp để kiểm tra và duyệt phát hành hợp đồng.':'Hợp đồng đã hủy không thể duyệt.',409);
  if(row.revision!==(body as {revision:string}).revision)throw new ContractApprovalError('Hợp đồng đã thay đổi. Tải lại và kiểm tra trước khi duyệt.',409);
  const approval={at:new Date().toISOString(),actor_id:user.id,actor_role:user.access_role||null};
  payload.management_composer={...composer,approval,approval_history:[...(Array.isArray(composer.approval_history)?composer.approval_history:[]),{...approval,contract_number:row.contract_number,reviewed_revision:row.revision}]};
  const result=await db.query('UPDATE himoto.orders SET draft_payload=$2::json,updated_at=now() WHERE id=$1 RETURNING xmin::text AS revision',[id,JSON.stringify(payload)]);
  return state({...row,draft_payload:payload,revision:String(result.rows[0].revision),approved_by:(user as PermissionAccount&{name?:string}).name||`#${user.id}`},user);
}
