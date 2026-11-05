import 'server-only';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {NextRequest} from 'next/server';
import type {SessionUser} from './management-session';
import {isMobileReturnReceipt,type MobileReturnReceipt,type MobileReturnRecordInput} from '../../../shared/mobile-return-write';
import {ContractPaymentError,readPaymentContext} from './contract-payments';
import {ContractReturnError} from './contract-returns';
import {completeReturnBatch,parseReturnSettlements} from './return-settlements';
import {parseMobileReturnSettlement,readReturnSettlementPreview} from './mobile-return-settlement';
import {requireMobileReturn} from './mobile-returns';
import {mobileFinanceId} from './mobile-finance';
import {idempotentMobileWrite,mobileBody,mobileRequestKey} from './mobile-writes';
import {himotoPool} from './himoto-database';
import {withMobileData} from './mobile-context';
import {MobileError} from './mobile-session';

const conflict=(message:string)=>new MobileError(message,409,'RETURN_REVIEW_REQUIRED');
const invalidReceipt=()=>new MobileError('Chưa xác nhận được phiếu trả xe. Giữ mã để đối chiếu.',503,'INVALID_WRITE_RECEIPT');
const iso=(v:unknown)=>v instanceof Date?v.toISOString():new Date(String(v)).toISOString();
const transactionNames={late_fee:'order:return_late',repair_fee:'order:return_repair',rental_debt:'order:payment',rental_refund:'order:rental_refund',deposit_refund:'order:deposit_refund'};
async function transaction<T>(user:SessionUser,write:boolean,task:(db:PoolClient)=>Promise<T>) {
  requireMobileReturn(user);
  return withMobileData(user,'',async()=>{
    const db=await himotoPool.connect();
    try{
      await db.query(write?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await db.query("SET LOCAL statement_timeout='30s'");await db.query("SET LOCAL lock_timeout='5s'");
      const result=await task(db);await db.query('COMMIT');return result;
    }catch(error){
      await db.query('ROLLBACK').catch(()=>{});
      if(error instanceof ContractPaymentError||error instanceof ContractReturnError)
        throw new MobileError(error.message,error.status,error.status===404?'NOT_FOUND':'RETURN_REVIEW_REQUIRED');
      throw error;
    }finally{db.release();}
  });
}
async function receipt(db:PoolClient,user:SessionUser,key:string):Promise<MobileReturnReceipt|null> {
  const row=(await db.query(`SELECT r.operation,r.resource_id,r.resource_revision,m.proof
    FROM himoto.management_mobile_requests r LEFT JOIN himoto.management_mobile_returns m
      ON m.user_id=r.user_id AND m.request_id=r.request_id AND m.order_id=r.resource_id
    WHERE r.user_id=$1 AND r.request_id=$2`,[user.id,key])).rows[0];
  if(!row||row.resource_id==null||!String(row.operation).startsWith('return.record:'))return null;
  if(row.operation!==`return.record:${row.resource_id}`||!isMobileReturnReceipt(row.proof)||row.proof.id!==Number(row.resource_id)||
    row.proof.revision!==row.resource_revision||row.proof.requestId!==key)throw invalidReceipt();
  const result:MobileReturnReceipt={...row.proof,replayed:true};
  const order=(await db.query('SELECT xmin::text AS revision FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL',[result.id])).rows[0];
  if(!order)throw new MobileError('Hợp đồng đã ra ngoài phạm vi truy cập hiện tại.',403,'FORBIDDEN');
  const items=(await db.query(`SELECT id,vehicle_id,completed_at,deleted_at,xmin::text AS revision FROM himoto.order_vehicle_details
    WHERE order_id=$1 AND id=ANY($2::bigint[])`,[result.id,result.returnedItems.map(item=>item.id)])).rows;
  result.itemsCurrent=result.returnedItems.every(item=>items.some(row=>Number(row.id)===item.id&&Number(row.vehicle_id)===item.vehicleId&&
    row.deleted_at==null&&row.completed_at!=null&&iso(row.completed_at)===item.returnedAt&&row.revision===item.revision));
  const payments=(await db.query(`SELECT t.id,t.xmin::text AS revision,t.name,t.type,t.status,t.value,t.created_at,t.user_id,t.bank_id,t.cash_id,t.bank_owner_type,
    p.request_id,p.xmin::text AS payment_revision FROM himoto.transactions t
    LEFT JOIN himoto.management_contract_payments p ON p.transaction_id=t.id AND p.order_id=t.order_id AND p.actor_id=$3
    WHERE t.order_id=$1 AND t.id=ANY($2::bigint[])`,[result.id,result.transactions.map(p=>p.id),user.id])).rows;
  result.paymentsCurrent=result.transactions.every(payment=>payments.some(row=>Number(row.id)===payment.id&&row.revision===payment.revision&&row.payment_revision===payment.paymentRevision&&
    row.request_id===payment.requestId&&Number(row.user_id)===user.id&&row.status==='approved'&&row.name===transactionNames[payment.kind]&&
    row.type===(payment.kind.endsWith('refund')?'out':'in')&&Number(row.value)===payment.amount&&iso(row.created_at)===payment.paidAt&&
    (payment.method==='cash'?Number(row.cash_id)===payment.accountId&&row.bank_id==null:Number(row.bank_id)===payment.accountId&&row.cash_id==null&&
      (payment.method==='company_transfer'?row.bank_owner_type==='company':row.bank_owner_type!=='company'))));
  result.contractCurrent=order.revision===result.revision;
  try{
    const context=await readPaymentContext(db,result.id,{page:1,size:0}),expected=result.review.after;
    result.contractCurrent=result.contractCurrent&&context.total_amount===expected.totalAmount&&context.paid_amount===expected.rentalPaid&&
      context.remaining===expected.rentalRemaining&&context.deposit_held===expected.depositHeld&&context.rental_refundable===expected.rentalRefundable&&
      context.items.length===expected.remainingItems&&context.status===expected.status;
  }catch(error){if(error instanceof ContractPaymentError)result.contractCurrent=false;else throw error;}
  result.current=result.itemsCurrent&&result.paymentsCurrent&&result.contractCurrent;
  return result;
}
export async function readMobileReturnReceipt(user:SessionUser,key:string) {
  requireMobileReturn(user);mobileRequestKey(key);
  return transaction(user,false,async db=>({receipt:await receipt(db,user,key)}));
}
export async function recordMobileReturn(user:SessionUser,value:string,request:NextRequest):Promise<MobileReturnReceipt> {
  requireMobileReturn(user);
  if([...request.nextUrl.searchParams].length)throw new MobileError('Không hỗ trợ bộ lọc khi ghi trả xe.',400,'INVALID_QUERY');
  const id=mobileFinanceId(value),key=mobileRequestKey(request.headers.get('idempotency-key')),body=await mobileBody(request,98304);
  const {settlement_snapshot,...fields}=body;
  if(typeof settlement_snapshot!=='string'||!/^[a-f0-9]{64}$/.test(settlement_snapshot))throw new MobileError('Thiếu phiên quyết toán đã rà soát.',400,'INVALID_RETURN_SETTLEMENT');
  let input:MobileReturnRecordInput;
  try{input={...parseMobileReturnSettlement(fields),settlement_snapshot};}
  catch(error){if(error instanceof ContractReturnError||error instanceof ContractPaymentError)throw new MobileError(error.message,error.status,'INVALID_RETURN_SETTLEMENT');throw error;}
  return transaction(user,true,async db=>{
    const saved=await idempotentMobileWrite(db,user.id,key,`return.record:${id}`,{id,input},async()=>{
      const locked=(await db.query('SELECT xmin::text AS revision FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0];
      if(!locked)throw new MobileError('Không tìm thấy hợp đồng.',404,'NOT_FOUND');
      if(locked.revision!==input.revision)throw conflict('Hợp đồng đã thay đổi. Rà soát lại trước khi trả xe.');
      // Lock the complete remaining set in deterministic order. A selection may
      // span pages, and final deposit eligibility depends on every active line.
      await db.query('SELECT id FROM himoto.order_vehicle_details WHERE order_id=$1 AND deleted_at IS NULL ORDER BY id FOR UPDATE',[id]);
      const reviewed=await readReturnSettlementPreview(db,user,id,input);
      if(reviewed.snapshot!==input.settlement_snapshot)throw conflict('Quyết toán đã thay đổi. Rà soát lại tiền thu/hoàn trước khi ghi.');
      if(reviewed.overpayment&&!reviewed.overpaymentAcknowledged)
        throw new MobileError('Cần xác nhận khoản thực thu vượt tiền còn thiếu và tác động vào tổng hợp đồng.',409,'OVERPAYMENT_ACK_REQUIRED');
      // Child UUIDs exist only after the parent request and business rows are
      // locked and both review fingerprints have been checked.
      const childKeys:string[]=[],child=<T extends object>(payment:T)=>{const request_id=randomUUID();childKeys.push(request_id);return{...payment,request_id};};
      const settlement=reviewed.settlement;
      const wire={order_id:id,revision:input.revision,receipts:settlement.receipts.map(child),
        ...(settlement.rental_refund?{rental_refund:child(settlement.rental_refund)}:{}),
        ...(settlement.refund?{refund:child(settlement.refund)}:{}),...(settlement.refund_deferred?{refund_deferred:true}:{}),
        ...(settlement.refund_recipient?{refund_recipient:settlement.refund_recipient}:{})};
      await completeReturnBatch(db,user.id,input.items,parseReturnSettlements([wire]));
      const after=await readPaymentContext(db,id,{page:1,size:0,asOf:Date.parse(reviewed.observedAt)}),expected=reviewed.after;
      if(after.total_amount!==expected.totalAmount||after.paid_amount!==expected.rentalPaid||after.remaining!==expected.rentalRemaining||
        after.deposit_held!==expected.depositHeld||after.rental_refundable!==expected.rentalRefundable||after.items.length!==expected.remainingItems||after.status!==expected.status)
        throw invalidReceipt();
      const lines=(await db.query(`SELECT id,vehicle_id,completed_at,xmin::text AS revision FROM himoto.order_vehicle_details
        WHERE order_id=$1 AND deleted_at IS NULL AND id=ANY($2::bigint[]) ORDER BY id`,[id,input.items.map(item=>item.item_id)])).rows;
      const transactions=(await db.query(`SELECT t.id,t.name,t.type,t.status,t.value,t.created_at,t.cash_id,t.bank_id,t.bank_owner_type,t.xmin::text AS revision,
        p.request_id,p.xmin::text AS payment_revision FROM himoto.management_contract_payments p
        JOIN himoto.transactions t ON t.id=p.transaction_id AND t.order_id=p.order_id
        WHERE p.order_id=$1 AND p.actor_id=$2 AND p.request_id=ANY($3::uuid[])`,[id,user.id,childKeys])).rows;
      const proof:MobileReturnReceipt={id,revision:after.revision,requestId:key,replayed:false,review:reviewed,recordedAt:new Date().toISOString(),
        returnedItems:lines.map(row=>({id:Number(row.id),vehicleId:Number(row.vehicle_id),revision:row.revision,returnedAt:iso(row.completed_at)})),
        transactions:childKeys.map((childKey,i)=>{
          const row=transactions.find(t=>t.request_id===childKey),intent=reviewed.payments[i];
          if(!row||row.name!==transactionNames[intent.kind]||row.type!==(intent.kind.endsWith('refund')?'out':'in')||row.status!=='approved'||Number(row.value)!==Number(intent.amount)||
            iso(row.created_at)!==iso(`${intent.paid_at}:00+07:00`)||(intent.method==='cash'?Number(row.cash_id)!==intent.account_id||row.bank_id!=null:
              Number(row.bank_id)!==intent.account_id||row.cash_id!=null||(intent.method==='company_transfer'?row.bank_owner_type!=='company':row.bank_owner_type==='company')))throw invalidReceipt();
          return{id:Number(row.id),requestId:childKey,revision:row.revision,paymentRevision:row.payment_revision,kind:intent.kind,amount:Number(row.value),
            method:intent.method,accountId:intent.account_id,paidAt:iso(row.created_at)};
        }),itemsCurrent:true,paymentsCurrent:true,contractCurrent:true,current:true};
      if(!isMobileReturnReceipt(proof))throw invalidReceipt();
      await db.query('INSERT INTO himoto.management_mobile_returns(user_id,request_id,order_id,proof) VALUES($1,$2,$3,$4::jsonb)',[user.id,key,id,JSON.stringify(proof)]);
      return{id,revision:after.revision};
    });
    const found=await receipt(db,user,key);if(!found)throw invalidReceipt();
    return{...found,replayed:saved.replayed};
  });
}
