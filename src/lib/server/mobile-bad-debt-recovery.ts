import 'server-only';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {NextRequest} from 'next/server';
import type {SessionUser} from './management-session';
import {badDebtCutoff} from '@/lib/management/contract-bad-debt';
import {requiresOwnershipApproval} from '@/lib/management/contract-approval';
import {badDebtRecoveryPlan,ContractReturnError,parseBadDebtRecoveryDetails} from './contract-returns';
import {readContractResolution} from './contract-resolution';
import {contractVehicleLabelSource} from './contract-vehicle-reads';
import {EFFECTIVE_RENTAL_TYPE_SQL,VEHICLE_ORDER_SQL} from './contract-classification';
import {requireMobileReturn} from './mobile-returns';
import {mobileFinanceId} from './mobile-finance';
import {withMobileData} from './mobile-context';
import {himotoPool} from './himoto-database';
import {mobileBody} from './mobile-writes';
import {MobileError} from './mobile-session';
import {isMobileRecoveryPreparation,isMobileRecoveryPreview,type MobileRecoveryAmounts,type MobileRecoveryInput,type MobileRecoveryItem,type MobileRecoveryPreparation,type MobileRecoveryPreview} from '../../../shared/mobile-bad-debt-recovery';

type Database=Pick<PoolClient,'query'>;
export const recoveryConflict=(message:string)=>new MobileError(message,409,'RECOVERY_REVIEW_REQUIRED');
const text=(v:unknown)=>v==null?'':String(v).slice(0,4000);
const iso=(v:unknown)=>v==null?null:new Date(v instanceof Date?v:String(v)).toISOString();
export async function withMobileRecovery<T>(user:SessionUser,task:(db:PoolClient)=>Promise<T>,write=false) {
  requireMobileReturn(user);
  return withMobileData(user,'',async()=>{
    const db=await himotoPool.connect();
    try{
      await db.query(write?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await db.query("SET LOCAL statement_timeout='20s'");await db.query("SET LOCAL lock_timeout='5s'");
      const result=await task(db);await db.query('COMMIT');return result;
    }catch(error){
      await db.query('ROLLBACK').catch(()=>{});
      if(error instanceof ContractReturnError)throw new MobileError(error.message,error.status,error.status===404?'NOT_FOUND':'RECOVERY_REVIEW_REQUIRED');
      throw error;
    }finally{db.release();}
  });
}
export function parseMobileRecoveryInput(body:Record<string,unknown>):MobileRecoveryInput {
  const {revision,...details}=body;
  if(typeof revision!=='string'||!/^[1-9]\d{0,19}$/.test(revision)||typeof details.item_revision!=='string'||!/^[1-9]\d{0,19}$/.test(details.item_revision)||
    typeof details.item_id!=='number'||!Number.isSafeInteger(details.item_id)||details.item_id<=0||details.item_id>999999999999999)
    throw new MobileError('Chọn hợp đồng và phiên bản dòng xe cần thu hồi.',400,'INVALID_RECOVERY');
  try{return{revision,...parseBadDebtRecoveryDetails(details)};}
  catch(error){if(error instanceof ContractReturnError)throw new MobileError(error.message,error.status,'INVALID_RECOVERY');throw error;}
}
async function readRecoveryOrder(db:Database,id:number) {
  const order=(await db.query('SELECT o.id,o.store_id,o.order_status,o.xmin::text AS revision,o.draft_payload,'+
    "COALESCE(NULLIF(o.contract_number,''),o.draft_reference,'#'||o.id::text) AS code,"+EFFECTIVE_RENTAL_TYPE_SQL+' AS rental_type '+
    'FROM himoto.orders o WHERE o.id=$1 AND o.deleted_at IS NULL AND '+VEHICLE_ORDER_SQL,[id])).rows[0];
  if(!order)throw new MobileError('Không tìm thấy hợp đồng.',404,'NOT_FOUND');
  const resolution=await readContractResolution(db,id);
  if(!resolution)throw recoveryConflict('Chưa đọc được số dư nợ gốc.');
  const count=(await db.query('SELECT count(*)::int AS total,count(*) FILTER(WHERE completed_at IS NULL)::int AS remaining '+
    'FROM himoto.order_vehicle_details WHERE order_id=$1 AND deleted_at IS NULL',[id])).rows[0];
  let reason=order.order_status!=='bad_debt'?'Chỉ thu hồi riêng ở hợp đồng Nợ xấu.':Number(count.remaining)===0?'Tất cả xe đã ghi nhận trả hoặc thu hồi.':null;
  let stopped:string|null=null;
  try{const planned=badDebtRecoveryPlan(order.draft_payload);stopped=planned.frozenStop?iso(planned.frozenStop+':00+07:00'):null;}
  catch(error){if(error instanceof ContractReturnError)reason=reason??error.message;else throw error;}
  const amounts:MobileRecoveryAmounts={totalAmount:resolution.total,rentalPaid:resolution.paid,rentalRemaining:resolution.remaining,
    rentalOverpayment:resolution.overpayment,depositHeld:resolution.deposit_held};
  return{order,resolution,total:Number(count.total),remaining:Number(count.remaining),reason,amounts,stopped,
    badDebtAt:iso(badDebtCutoff(order.draft_payload)??null),ownership:requiresOwnershipApproval(order.rental_type),hasInstallmentPlan:!!order.draft_payload?.management_composer?.installment_plan};
}
const lineSql=()=> 'SELECT d.id,d.vehicle_id,d.xmin::text AS revision,d.rent_at,d.completed_at,v.name,v.license '+
  'FROM himoto.order_vehicle_details d LEFT JOIN '+contractVehicleLabelSource()+' v ON v.id=d.vehicle_id '+
  'WHERE d.order_id=$1 AND d.deleted_at IS NULL';
function line(row:Record<string,unknown>,reason:string|null):MobileRecoveryItem {
  const blocked=reason??(row.completed_at!=null?'Xe đã được ghi nhận trả hoặc thu hồi.':null);
  return{id:Number(row.id),vehicleId:Number(row.vehicle_id),revision:text(row.revision),name:text(row.name),license:text(row.license),
    startsAt:iso(row.rent_at),completedAt:iso(row.completed_at),available:blocked===null,blockedReason:blocked};
}
export async function readMobileRecoveryPreparation(user:SessionUser,value:string,request:NextRequest):Promise<MobileRecoveryPreparation> {
  requireMobileReturn(user);const id=mobileFinanceId(value),params=request.nextUrl.searchParams,page=params.get('page')??'1';
  if([...params.keys()].some(k=>k!=='page'||params.getAll(k).length!==1)||!/^[1-9]\d{0,5}$/.test(page)||Number(page)>100000)
    throw new MobileError('Trang xe thu hồi không hợp lệ.',400,'INVALID_QUERY');
  return withMobileRecovery(user,async db=>{
    const ctx=await readRecoveryOrder(db,id),pages=Math.max(1,Math.ceil(ctx.total/25));
    if(!Number.isSafeInteger(ctx.total)||ctx.total<0||ctx.total>1000000||Number(page)>pages)throw new MobileError('Trang xe không còn tồn tại. Tải lại danh sách.',400,'INVALID_QUERY');
    const rows=(await db.query(lineSql()+' ORDER BY (d.completed_at IS NULL) DESC,d.id LIMIT 25 OFFSET $2',[id,(Number(page)-1)*25])).rows;
    const result:MobileRecoveryPreparation={id,code:text(ctx.order.code),storeId:Number(ctx.order.store_id),revision:ctx.order.revision,status:ctx.order.order_status,
      ownership:ctx.ownership,hasInstallmentPlan:ctx.hasInstallmentPlan,available:ctx.reason===null,blockedReason:ctx.reason,
      badDebtAt:ctx.badDebtAt,billingStoppedAt:ctx.stopped,remainingItems:ctx.remaining,amounts:ctx.amounts,settled:ctx.resolution.settled,
      items:{page:Number(page),pages,total:ctx.total,rows:rows.map(row=>line(row,ctx.reason))},observedAt:new Date().toISOString()};
    if(!isMobileRecoveryPreparation(result))throw recoveryConflict('Dữ liệu thu hồi cần đối chiếu.');return result;
  });
}
/** Recomputed by a future writer under its locks; snapshot grants no authority. */
export async function readRecoveryPreview(db:Database,id:number,input:MobileRecoveryInput):Promise<MobileRecoveryPreview> {
  const ctx=await readRecoveryOrder(db,id);
  if(ctx.reason)throw recoveryConflict(ctx.reason);
  if(ctx.order.revision!==input.revision)throw recoveryConflict('Hợp đồng đã thay đổi. Tải lại trước khi thu hồi.');
  const row=(await db.query(lineSql()+' AND d.id=$2',[id,input.item_id])).rows[0];
  if(!row)throw recoveryConflict('Xe không thuộc hợp đồng hoặc đã ra ngoài phạm vi thu hồi.');
  const item=line(row,null);
  if(!item.available||item.revision!==input.item_revision)throw recoveryConflict('Dòng xe đã thay đổi hoặc đã thu hồi. Tải lại để kiểm tra.');
  const recoveredAt=iso(input.recovered_at+':00+07:00')!;
  if(item.startsAt&&Date.parse(recoveredAt)<Date.parse(item.startsAt))throw recoveryConflict('Ngày thu hồi không được trước ngày bắt đầu thuê.');
  const after:MobileRecoveryPreview['after']={...ctx.amounts,remainingItems:ctx.remaining-1,status:ctx.remaining===1&&ctx.resolution.settled?'completed':'bad_debt'};
  const ledger=(await db.query("SELECT md5(COALESCE(string_agg(id::text||':'||xmin::text,',' ORDER BY id),'')) AS stamp FROM himoto.transactions WHERE order_id=$1",[id])).rows[0].stamp;
  const snapshot=createHash('sha256').update(JSON.stringify({id,input,payload:ctx.order.draft_payload,item,ledger,before:ctx.amounts,after})).digest('hex');
  const result:MobileRecoveryPreview={id,code:text(ctx.order.code),storeId:Number(ctx.order.store_id),revision:ctx.order.revision,status:'bad_debt',
    ownership:ctx.ownership,hasInstallmentPlan:ctx.hasInstallmentPlan,item,recoveredAt,note:input.note,badDebtAt:ctx.badDebtAt,billingStoppedAt:ctx.stopped,
    before:ctx.amounts,after,settled:ctx.resolution.settled,snapshot,observedAt:new Date().toISOString()};
  if(!isMobileRecoveryPreview(result))throw recoveryConflict('Kết quả rà soát thu hồi cần đối chiếu.');return result;
}
export async function readMobileRecoveryPreview(user:SessionUser,value:string,request:NextRequest) {
  requireMobileReturn(user);const id=mobileFinanceId(value);
  if([...request.nextUrl.searchParams].length||request.headers.has('idempotency-key'))throw new MobileError('Rà soát thu hồi không dùng bộ lọc hoặc mã ghi.',400,'INVALID_QUERY');
  const input=parseMobileRecoveryInput(await mobileBody(request,8192));
  return withMobileRecovery(user,db=>readRecoveryPreview(db,id,input));
}
