import 'server-only';
import type { NextRequest } from 'next/server';
import type { SessionUser } from './management-session';
import { hasPermission } from '@/lib/management/permissions';
import { paymentAccounts } from '@/lib/management/contract-payments';
import { ContractPaymentError,readPaymentContext } from './contract-payments';
import { ContractReturnError,loadContractReturnablePage } from './contract-returns';
import { mobileFinanceId } from './mobile-finance';
import { himotoPool } from './himoto-database';
import { withMobileData } from './mobile-context';
import { MobileError } from './mobile-session';
import { isMobileReturnPreparation,type MobileReturnPreparation } from '../../../shared/mobile-returns';

export async function readMobileReturnPreparation(user:SessionUser,value:string,request:NextRequest):Promise<MobileReturnPreparation> {
  requireMobileReturn(user);
  const id=mobileFinanceId(value),params=request.nextUrl.searchParams,rawPage=params.get('page')??'1';
  if([...params].some(([name])=>name!=='page')||params.getAll('page').length>1||!/^[1-9]\d{0,5}$/.test(rawPage)||Number(rawPage)>100000)
    throw new MobileError('Trang xe trả không hợp lệ.',400,'INVALID_QUERY');
  return withMobileData(user,'',async()=>{
    const client=await himotoPool.connect();
    try{
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout='20s'");await client.query("SET LOCAL lock_timeout='5s'");
      const context=await readPaymentContext(client,id,{page:1,size:0,asOf:Date.now()});
      const page=await loadContractReturnablePage(client,id,Number(rawPage));
      const blockedReason=context.status==='bad_debt'?'Nợ xấu cần bước thu hồi xe riêng, không ghi trả xe thông thường.'
        :!['renting','overdue','wait_payment'].includes(context.status)?'Trạng thái hợp đồng chưa cho phép ghi trả xe.'
        :page.total===0?'Hợp đồng không có dòng xe phù hợp để ghi nhận trả.'
        :!context.items.some(row=>row.return_at!==null)?'Không còn xe có hạn trả rõ ràng để ghi nhận trả.'
        :context.total_amount===null||context.paid_amount===null||context.remaining===null?'Số dư hợp đồng cần đối chiếu trước khi quyết toán trả xe.':null;
      const result:MobileReturnPreparation={id,code:context.code,status:context.status,storeId:context.store_id,revision:context.revision,
        available:blockedReason===null,blockedReason,ownership:!!context.billing,holdActive:context.hold_active===true,completedFromHold:context.completed_from_hold===true,
        totalAmount:context.total_amount,rentalPaid:context.paid_amount,rentalRemaining:context.remaining,depositHeld:context.deposit_held,rentalRefundable:context.rental_refundable??0,
        items:{...page,rows:page.rows.map(row=>{
          const reason=blockedReason??(row.completed_at!==null?'Xe đã được ghi nhận trả.':row.return_reconciled?'Xe đã đối soát trả, cần kiểm tra bước thu hồi thực tế.':!row.scheduled_return_at?'Xe chưa có hạn trả rõ ràng.':null);
          return{id:row.item_id,vehicleId:row.vehicle_id,name:row.vehicle_name.slice(0,4000),license:row.license.slice(0,4000),revision:row.item_revision,
            startsAt:row.scheduled_start_at,returnAt:row.scheduled_return_at,completedAt:row.completed_at,dailyPrice:row.daily_price,overdue:row.overdue,reconciled:row.return_reconciled===true,available:reason===null,blockedReason:reason};
        })},accounts:(['cash','transfer','company_transfer'] as const).flatMap(method=>paymentAccounts(context,method).map(row=>({id:row.id,method,label:row.label}))),observedAt:new Date().toISOString()};
      if(!isMobileReturnPreparation(result))throw new MobileError('Dữ liệu trả xe cần đối chiếu trước khi tiếp tục.',409,'RETURN_REVIEW_REQUIRED');
      await client.query('COMMIT');return result;
    }catch(error){
      await client.query('ROLLBACK').catch(()=>{});
      if(error instanceof ContractPaymentError||error instanceof ContractReturnError)
        throw new MobileError(error.message,error.status,error.status===404?'NOT_FOUND':'RETURN_REVIEW_REQUIRED');
      throw error;
    }finally{client.release();}
  });
}

export function requireMobileReturn(user:SessionUser) {
  if(!hasPermission(user,'contracts.read')||!hasPermission(user,'contracts.return'))
    throw new MobileError('Tài khoản cần quyền trả/đổi xe để chuẩn bị trả xe.',403,'FORBIDDEN');
}
