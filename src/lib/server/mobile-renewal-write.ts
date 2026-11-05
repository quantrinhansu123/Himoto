import "server-only";
import type { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import type { SessionUser } from "./management-session";
import type { MobileRenewalReceipt } from "../../../shared/mobile-renewal-write";
import { isMobileRenewalReceipt } from "../../../shared/mobile-renewal-write";
import { validPaymentRevision } from "../../../shared/mobile-finance";
import { requireMobileRenewal, mobileRenewalBlockedReason, mobileRenewalItems } from "./mobile-renewals";
import { withMobileData } from "./mobile-context";
import { himotoPool } from "./himoto-database";
import { MobileError } from "./mobile-session";
import { mobileFinanceId } from "./mobile-finance";
import { idempotentMobileWrite, mobileBody, mobileRequestKey } from "./mobile-writes";
import { ContractRenewalError, parseRenewalInput } from "./contract-renewals";
import { ContractPaymentError, readPaymentContext } from "./contract-payments";
import { renewContractAndCollect } from "./contract-renewal-collection";
import { nextContractRenewalVersion } from "./contract-renewal-version";
import { queueContractNotification } from "./contract-notifications";
import { sameRenewalPeriod } from "./contract-notification-content";
import { validBackfillTime } from "../../../shared/contract-backfill";

async function transaction<T>(user:SessionUser,write:boolean,task:(client:PoolClient)=>Promise<T>){
  requireMobileRenewal(user);
  return withMobileData(user,"",async()=>{
    const client=await himotoPool.connect();
    try{
      await client.query(write?"BEGIN":"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout='20s'");await client.query("SET LOCAL lock_timeout='5s'");
      const result=await task(client);await client.query("COMMIT");return result;
    }catch(error){
      await client.query("ROLLBACK").catch(()=>{});
      if(error instanceof ContractRenewalError||error instanceof ContractPaymentError)
        throw new MobileError(error.message,error.status,error.status===409?"RENEWAL_CONFLICT":"INVALID_RENEWAL");
      throw error;
    }finally{client.release();}
  });
}
const stamp=(value:unknown)=>value instanceof Date?value.toISOString():new Date(String(value)).toISOString();
const time=(value:unknown)=>value instanceof Date?value.getTime():Date.parse(String(value));
async function receipt(client:PoolClient,user:SessionUser,key:string):Promise<MobileRenewalReceipt|null>{
  const row=(await client.query(`SELECT r.operation,r.resource_id,r.resource_revision,m.*
    FROM himoto.management_mobile_requests r LEFT JOIN himoto.management_mobile_renewals m
    ON m.user_id=r.user_id AND m.request_id=r.request_id AND m.order_id=r.resource_id
    WHERE r.user_id=$1 AND r.request_id=$2`,[user.id,key])).rows[0];
  if(!row||row.resource_id==null||!/^renewal\.record:[1-9]\d{0,14}$/.test(String(row.operation)))return null;
  const id=Number(row.resource_id);
  if(!Number.isSafeInteger(id)||id<=0||row.operation!==`renewal.record:${id}`)
    throw new MobileError("Kết quả gia hạn cần đối chiếu.",409,"INVALID_WRITE_RECEIPT");
  const order=(await client.query("SELECT draft_payload FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL",[id])).rows[0];
  if(!order)throw new MobileError("Hợp đồng đã ra ngoài phạm vi truy cập hiện tại.",403,"FORBIDDEN");
  if(row.renewal_version==null)throw new MobileError("Chưa có đủ kết quả gia hạn. Giữ mã để đối chiếu.",503,"INVALID_WRITE_RECEIPT");
  const transactionId=row.transaction_id==null?null:Number(row.transaction_id),outsideId=row.outside_transaction_id==null?null:Number(row.outside_transaction_id);
  const versions=order.draft_payload?.management_composer?.versions;
  const version=Array.isArray(versions)?versions.find(value=>value?.kind==="renewal"&&Number(value.version)===Number(row.renewal_version)):null;
  let current=!!version&&version.request_id===key&&Number(version.actor_id)===user.id&&Number(version.amount)===Number(row.amount)&&Number(version.outside_amount??0)===Number(row.outside_amount)&&time(version.return_at)===time(row.return_at);
  if(outsideId!==null)current=current&&Number(version?.outside_transaction_id)===outsideId;
  if(transactionId!==null){
    const linked=(await client.query(`SELECT renewal_payload FROM himoto.management_contract_payments
      WHERE request_id=$1 AND order_id=$2 AND transaction_id=$3 AND actor_id=$4`,[key,id,transactionId,user.id])).rows[0]?.renewal_payload;
    const beforeMatches=linked?.before_return_at==null&&version?.before_return_at==null||time(linked?.before_return_at)===time(version?.before_return_at);
    current=current&&!!linked&&Number(linked.version)===Number(row.renewal_version)&&Number(linked.amount)===Number(row.amount)&&
      time(linked.return_at)===time(row.return_at)&&Number(linked.item_id)===Number(version?.item_id)&&
      beforeMatches&&sameRenewalPeriod(linked,version);
  }
  const ids=[transactionId,outsideId].filter((value):value is number=>value!==null);
  if(ids.length){
    const payments=(await client.query("SELECT id,name,type,status,value,bank_id,cash_id,bank_owner_type,created_at FROM himoto.transactions WHERE order_id=$1 AND id=ANY($2::bigint[])",[id,ids])).rows;
    const matches=(target:number|null,amount:number,name:string)=>{
      if(target===null)return amount===0;
      const payment=payments.find(value=>Number(value.id)===target);
      return !!payment&&payment.name===name&&payment.type==="in"&&payment.status==="approved"&&Number(payment.value)===amount&&time(payment.created_at)===time(row.paid_at)&&
        (row.method==="cash"?Number(payment.cash_id)===Number(row.account_id)&&payment.bank_id==null:
          Number(payment.bank_id)===Number(row.account_id)&&payment.cash_id==null&&(row.method==="company_transfer"?payment.bank_owner_type==="company":payment.bank_owner_type!=="company"));
    };
    current=current&&matches(transactionId,Number(row.amount),"order:payment")&&matches(outsideId,Number(row.outside_amount),"order:outside");
  }
  const result:MobileRenewalReceipt={id,revision:String(row.resource_revision),replayed:true,version:Number(row.renewal_version),returnAt:stamp(row.return_at),amount:Number(row.amount),totalAmount:row.total_amount==null?null:Number(row.total_amount),
    collected:row.collected,collection:row.collected?{method:row.method,accountId:Number(row.account_id),paidAt:stamp(row.paid_at)}:null,
    transactionId,outsideAmount:Number(row.outside_amount),outsideTransactionId:outsideId,billRevision:row.bill_revision??null,warning:row.warning??null,current};
  if(!isMobileRenewalReceipt(result))throw new MobileError("Kết quả gia hạn cần đối chiếu.",409,"INVALID_WRITE_RECEIPT");
  return result;
}
export async function readMobileRenewalReceipt(user:SessionUser,key:string){
  requireMobileRenewal(user);mobileRequestKey(key);
  return transaction(user,false,async client=>({receipt:await receipt(client,user,key)}));
}
export async function recordMobileRenewal(user:SessionUser,value:string,request:NextRequest):Promise<MobileRenewalReceipt>{
  requireMobileRenewal(user);
  const id=mobileFinanceId(value),key=mobileRequestKey(request.headers.get("idempotency-key")),body=await mobileBody(request,16384);
  const version=body.expected_version,billRevision=body.bill_revision;
  if(Object.keys(body).some(name=>!["item_id","item_revision","order_revision","return_at","amount","expected_amount","outside_amount","outside_name","note","occurred_at","receipt","expected_version","bill_revision"].includes(name))||
    typeof version!=="number"||!Number.isSafeInteger(version)||version<2||version>999999999999999||
    (body.receipt!==undefined?!validPaymentRevision(billRevision):billRevision!==undefined))
    throw new MobileError("Thông tin gia hạn hoặc bill đã rà soát chưa hợp lệ.",400,"INVALID_RENEWAL");
  try{
    const fields={...body};delete fields.expected_version;delete fields.bill_revision;
    const input=parseRenewalInput({...fields,request_id:key});
    const paidAt = body.receipt && typeof body.receipt === "object" && !Array.isArray(body.receipt) ? (body.receipt as Record<string, unknown>).paid_at : undefined;
    if ((input.occurred_at && !validBackfillTime(input.occurred_at)) || (typeof paidAt === "string" && !validBackfillTime(paidAt)))
      throw new MobileError("Ngày giờ thực tế không được ở tương lai.",400,"INVALID_RENEWAL");
    return await transaction(user,true,async client=>{
      const saved=await idempotentMobileWrite(client,user.id,key,`renewal.record:${id}`,{id,version,billRevision:billRevision??null,input},async()=>{
        const order=(await client.query("SELECT xmin::text AS revision,draft_payload FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[id])).rows[0];
        if(!order)throw new MobileError("Không tìm thấy hợp đồng.",404,"NOT_FOUND");
        if(order.revision!==input.order_revision)throw new MobileError("Hợp đồng đã thay đổi. Đối chiếu và tải lại trước khi gia hạn.",409,"RENEWAL_CONFLICT");
        const options={page:1,size:0,asOf:Date.now()},context=await readPaymentContext(client,id,options),composer=order.draft_payload?.management_composer;
        const backfill=!!input.occurred_at,items=await mobileRenewalItems(client,id,context,backfill);
        const blocked=mobileRenewalBlockedReason(context,!!composer?.installment_plan,backfill,items.length);
        if(blocked)throw new MobileError(blocked,409,"RENEWAL_CONFLICT");
        if(input.occurred_at){
          const item=items.find(row=>row.id===input.item_id),at=Date.parse(`${input.occurred_at}:00+07:00`);
          if(item && (item.startedAt && at<Date.parse(item.startedAt) || item.completedAt && at>Date.parse(item.completedAt)))
            throw new MobileError("Ngày bắt đầu gia hạn phải từ lúc bắt đầu thuê và không sau lúc trả xe thực tế.",400,"INVALID_RENEWAL");
        }
        if(await nextContractRenewalVersion(client,id,composer?.versions)!==version)
          throw new MobileError("Phiên bản gia hạn đã thay đổi. Rà soát lại đúng phiên bản và bill trước khi lưu.",409,"RENEWAL_CONFLICT");
        if(input.receipt){
          const photo=(await client.query(`SELECT xmin::text AS revision,mime_type FROM himoto.management_record_photos
            WHERE entity_type='contracts' AND entity_id=$1 AND slot=$2 FOR SHARE`,[id,`renewal-${version}-document-1`])).rows[0];
          if(!photo||photo.revision!==billRevision||!["image/jpeg","image/png","image/webp"].includes(photo.mime_type))
            throw new MobileError("Bill đã thay đổi hoặc chưa được lưu. Rà soát ảnh hiện tại trước khi xác nhận đã thu.",409,"RENEWAL_CONFLICT");
        }
        const result=await renewContractAndCollect(client,id,user.id,input,options);
        if(result.version!==version)throw new MobileError("Phiên bản gia hạn vừa thay đổi. Yêu cầu chưa ghi; đối chiếu lại trước khi lưu.",409,"RENEWAL_CONFLICT");
        const final=(await client.query("SELECT xmin::text AS revision,draft_payload FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL",[id])).rows[0];
        const versions=final?.draft_payload?.management_composer?.versions;
        const recorded=Array.isArray(versions)?versions.find(row=>row?.kind==="renewal"&&Number(row.version)===version&&row.request_id===key):null;
        if(!recorded||!validPaymentRevision(final?.revision))throw new MobileError("Chưa xác nhận được kết quả gia hạn. Giữ mã để đối chiếu.",503,"INVALID_WRITE_RECEIPT");
        const proof:MobileRenewalReceipt={id,revision:final.revision,replayed:false,version,returnAt:stamp(result.return_at),amount:result.amount,totalAmount:result.total_amount,
          collected:!!input.receipt,collection:input.receipt?{method:input.receipt.method,accountId:input.receipt.account_id,paidAt:stamp(`${input.receipt.paid_at}:00+07:00`)}:null,
          transactionId:result.payment?.transaction_id??null,outsideAmount:Number(input.outside_amount??0),outsideTransactionId:result.outside_transaction_id??null,
          billRevision:input.receipt?String(billRevision):null,warning:typeof recorded.warning==="string"?recorded.warning:null,current:true};
        if(!isMobileRenewalReceipt(proof))throw new MobileError("Chưa xác nhận được phiếu gia hạn. Giữ mã để đối chiếu.",503,"INVALID_WRITE_RECEIPT");
        await client.query(`INSERT INTO himoto.management_mobile_renewals(user_id,request_id,order_id,renewal_version,return_at,amount,total_amount,collected,
          method,account_id,paid_at,transaction_id,outside_amount,outside_transaction_id,bill_revision,warning)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [user.id,key,id,version,proof.returnAt,proof.amount,proof.totalAmount,proof.collected,proof.collection?.method??null,proof.collection?.accountId??null,proof.collection?.paidAt??null,
            proof.transactionId,proof.outsideAmount,proof.outsideTransactionId,proof.billRevision,proof.warning]);
        return{id,revision:final.revision};
      });
      const found=await receipt(client,user,key);
      if(!found)throw new MobileError("Chưa tìm thấy kết quả gia hạn. Giữ mã để đối chiếu.",503,"INVALID_WRITE_RECEIPT");
      return{...found,replayed:saved.replayed};
    });
  }catch(error){
    if(error instanceof ContractRenewalError||error instanceof ContractPaymentError)throw new MobileError(error.message,error.status,"INVALID_RENEWAL");
    throw error;
  }
}

// Prepare only the existing manual outbox, after commit; never send a message.
export async function queueMobileRenewalEvent(user:SessionUser,id:number,version:number){
  try{await transaction(user,true,async client=>{
    await client.query("SET LOCAL statement_timeout='60s'");
    const order=(await client.query("SELECT draft_payload FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL",[id])).rows[0];
    const versions=order?.draft_payload?.management_composer?.versions;
    const saved=Array.isArray(versions)?versions.find(row=>row?.kind==="renewal"&&Number(row.version)===version):null;
    if(saved)await queueContractNotification(client,id,"renewal",`renewal:${id}:${version}`,user.id,`renewal-${version}`,saved);
  });}catch{console.error("Mobile renewal manual notification queue unavailable");}
}
