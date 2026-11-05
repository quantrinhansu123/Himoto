import 'server-only';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {NextRequest} from 'next/server';
import type {SessionUser} from './management-session';
import type {ReturnInput} from '@/lib/management/contract-returns';
import {installmentBalance,parseInstallmentPlan} from '@/lib/management/contract-billing';
import {ContractPaymentError,readPaymentContext} from './contract-payments';
import {ContractReturnError,calculateVehicleReturn,loadContractReturnableSelection,parseReturnBatch} from './contract-returns';
import {requireMobileReturn} from './mobile-returns';
import {mobileFinanceId} from './mobile-finance';
import {mobileBody} from './mobile-writes';
import {himotoPool} from './himoto-database';
import {withMobileData} from './mobile-context';
import {MobileError} from './mobile-session';
import {isMobileReturnPreview,type MobileReturnPreview} from '../../../shared/mobile-returns';

const MAX_MONEY=9999999999999;
const money=(value:unknown):number|null=>value===null||value===undefined||String(value).trim()===''?null:
  Number.isSafeInteger(Number(value))&&Number(value)>=0&&Number(value)<=MAX_MONEY?Number(value):null;
const conflict=(message:string)=>new MobileError(message,409,'RETURN_REVIEW_REQUIRED');

function parsePreview(body:Record<string,unknown>) {
  if(Object.keys(body).some(key=>!['revision','items'].includes(key))||typeof body.revision!=='string'||!/^[1-9]\d{0,19}$/.test(body.revision)||!Array.isArray(body.items))
    throw new MobileError('Chọn phiên bản hợp đồng và các xe cần xem phí trả.',400,'INVALID_RETURN_PREVIEW');
  return{revision:body.revision,items:parseReturnBatch({items:body.items})};
}

/** No reservation, stock change, sequence allocation, receipt or money write. */
export async function readMobileReturnPreview(user:SessionUser,value:string,request:NextRequest):Promise<MobileReturnPreview> {
  requireMobileReturn(user);
  const id=mobileFinanceId(value);
  if([...request.nextUrl.searchParams].length)throw new MobileError('Không hỗ trợ bộ lọc khi xem phí trả xe.',400,'INVALID_QUERY');
  try{
    const input=parsePreview(await mobileBody(request,98304));
    return await withMobileData(user,'',async()=>{
      const client=await himotoPool.connect();
      try{
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await client.query("SET LOCAL statement_timeout='20s'");await client.query("SET LOCAL lock_timeout='5s'");
        const result=await readReturnFeePreview(client,user,id,input);
        await client.query('COMMIT');return result;
      }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
    });
  }catch(error){
    if(error instanceof ContractPaymentError||error instanceof ContractReturnError)
      throw new MobileError(error.message,error.status,error.status===404?'NOT_FOUND':'RETURN_REVIEW_REQUIRED');
    throw error;
  }
}

/** The future writer must recompute this inside its locked transaction. A hash
 * is a review fingerprint, never authorization or a claim that money was paid. */
export async function readReturnFeePreview(client:Pick<PoolClient,'query'>,user:SessionUser,id:number,input:{revision:string;items:ReturnInput[]},clock=Date.now()):Promise<MobileReturnPreview> {
  requireMobileReturn(user);
  const context=await readPaymentContext(client,id,{page:1,size:0,asOf:clock});
  if(context.revision!==input.revision)throw conflict('Hợp đồng đã thay đổi. Tải lại trước khi xem phí trả xe.');
  if(context.status==='bad_debt')throw conflict('Nợ xấu cần bước thu hồi xe riêng, không ghi trả xe thông thường.');
  if(!['renting','overdue','wait_payment'].includes(context.status)||!context.items.length)throw conflict('Không còn xe đang thuê phù hợp để ghi trả.');
  if(context.total_amount===null||context.paid_amount===null||context.remaining===null)throw conflict('Số dư hợp đồng cần đối chiếu trước khi trả xe.');
  const order=(await client.query('SELECT total,draft_payload,order_status FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL',[id])).rows[0];
  if(!order)throw new MobileError('Không tìm thấy hợp đồng.',404,'NOT_FOUND');
  const composer=order.draft_payload?.management_composer,planValue=composer?.installment_plan;
  let plan=planValue?parseInstallmentPlan(planValue):null,baseTotal=money(order.total);
  if(planValue&&!plan||baseTotal===null)throw conflict('Tổng phí hoặc lịch đóng tiền cần đối chiếu trước khi trả xe.');
  const rows=await loadContractReturnableSelection(client,id,input.items.map(row=>row.item_id));
  if(rows.length!==input.items.length)throw conflict('Có xe không thuộc hợp đồng hoặc không còn trong phạm vi trả.');
  const cashbook=(await client.query(`SELECT md5(COALESCE(string_agg(t.id::text||':'||t.xmin::text,',' ORDER BY t.id),'')) AS stamp,
    COALESCE(sum(t.value) FILTER(WHERE t.type='out' AND t.name='order:rental_refund' AND t.status='approved'),0)::text AS rental_refunded
    FROM himoto.transactions t WHERE t.order_id=$1`,[id])).rows[0];
  const refunded=money(cashbook.rental_refunded),adjustments=composer?.return_adjustments;
  if(adjustments!==undefined&&!Array.isArray(adjustments)||refunded===null)throw conflict('Lịch sử hoàn tiền thuê cần đối chiếu.');
  let credit=(Array.isArray(adjustments)?adjustments:[]).reduce((sum:number,row:{early_discount?:unknown})=>sum+(money(row?.early_discount)??0),0)-refunded;
  if(!Number.isSafeInteger(credit))throw conflict('Số tiền giảm thuê trước đây vượt giới hạn.');
  const remaining=new Map(context.items.map(row=>[row.id,row]));
  const projected:MobileReturnPreview['items']=[];
  let status=String(order.order_status);
  for(const item of [...input.items].sort((a,b)=>a.item_id-b.item_id)){
    const row=rows.find(row=>row.item_id===item.item_id)!;
    if(row.item_revision!==item.item_revision||row.completed_at||row.return_reconciled||!row.scheduled_return_at||!remaining.has(item.item_id))
      throw conflict('Dòng xe đã thay đổi, đã trả, đã đối soát hoặc thiếu hạn trả. Tải lại trước khi tiếp tục.');
    const calculated=calculateVehicleReturn({startsAt:row.scheduled_start_at,returnAt:row.scheduled_return_at,dailyPrice:row.daily_price,baseTotal,paid:context.paid_amount,plan},item);
    baseTotal=calculated.storedTotalAfter;credit+=calculated.earlyDiscount;remaining.delete(item.item_id);
    status=remaining.size?[...remaining.values()].some(row=>row.return_at&&Date.parse(row.return_at)<clock)?'overdue':status==='wait_payment'?'wait_payment':'renting':
      calculated.nextTotal!==null&&calculated.nextTotal>context.paid_amount?'wait_payment':'completed';
    if(plan&&!remaining.size){
      plan=parseInstallmentPlan({...plan,stopped_at:item.returned_at<plan.end?item.returned_at:plan.end});
      if(!plan)throw conflict('Trả xe ảnh hưởng lịch đang bảo lưu. Cần đối chiếu lịch trước khi chốt.');
    }
    projected.push({id:row.item_id,vehicleId:row.vehicle_id,revision:row.item_revision,name:row.vehicle_name.slice(0,4000),license:row.license.slice(0,4000),
      returnAt:row.scheduled_return_at,returnedAt:calculated.actual,lateMinutes:calculated.lateMinutes,chargeableHours:calculated.chargeableHours,
      lateDays:calculated.suggested.days,lateHours:calculated.suggested.hours,hourlyRate:calculated.hourlyRate,dailyPrice:row.daily_price,
      suggestedLateFee:calculated.suggested.amount,lateFee:calculated.lateFee,repairFee:calculated.repairFee,repairNote:item.repair_note??'',
      earlyDiscount:calculated.earlyDiscount,fee:calculated.fee,overridden:item.fee_override!==undefined});
  }
  const total=plan?installmentBalance(plan,baseTotal,context.paid_amount,clock).accrued_total:baseTotal;
  if(total===null||!Number.isSafeInteger(credit))throw conflict('Số dư sau trả xe cần đối chiếu trước khi tiếp tục.');
  const rentalRemaining=Math.max(total-context.paid_amount,0);
  // A settlement always reconciles the final closed status against its balance.
  if(!remaining.size)status=rentalRemaining===0?'completed':'wait_payment';
  const before={totalAmount:context.total_amount,rentalPaid:context.paid_amount,rentalRemaining:context.remaining,depositHeld:context.deposit_held,rentalRefundable:context.rental_refundable??0};
  const after={totalAmount:total,rentalPaid:context.paid_amount,rentalRemaining,depositHeld:context.deposit_held,
    rentalRefundable:Math.max(Math.min(credit,context.paid_amount-total),0),remainingItems:remaining.size,closesRental:remaining.size===0,
    depositRefundEligible:remaining.size===0&&rentalRemaining===0&&context.deposit_held>0,status};
  const totals=projected.reduce((sum,row)=>({lateFee:sum.lateFee+row.lateFee,repairFee:sum.repairFee+row.repairFee,earlyDiscount:sum.earlyDiscount+row.earlyDiscount,fee:sum.fee+row.fee}),{lateFee:0,repairFee:0,earlyDiscount:0,fee:0});
  const snapshot=createHash('sha256').update(JSON.stringify({id,revision:input.revision,base:order.total,plan:planValue??null,
    cashbook:cashbook.stamp,items:projected,notes:input.items.map(row=>[row.item_id,row.repair_note??'']).sort((a,b)=>Number(a[0])-Number(b[0])),
    remaining:[...remaining.values()].map(row=>[row.id,row.revision,row.return_at]),before,after,totals})).digest('hex');
  const result:MobileReturnPreview={phase:'fees',id,code:context.code,revision:context.revision,snapshot,ownership:!!planValue,items:projected,before,after,totals,observedAt:new Date(clock).toISOString()};
  if(!isMobileReturnPreview(result))throw conflict('Kết quả phí trả xe cần đối chiếu trước khi tiếp tục.');
  return result;
}
