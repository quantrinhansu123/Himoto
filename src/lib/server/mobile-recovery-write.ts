import 'server-only';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {NextRequest} from 'next/server';
import type {SessionUser} from './management-session';
import {isMobileRecoveryReceipt,type MobileRecoveryReceipt,type MobileRecoveryRecordInput,type MobileRecoveryAmounts} from '../../../shared/mobile-bad-debt-recovery';
import {parseMobileRecoveryInput,readRecoveryPreview,recoveryConflict,withMobileRecovery} from './mobile-bad-debt-recovery';
import {recordBadDebtRecovery} from './contract-returns';
import {readContractResolution} from './contract-resolution';
import {requireMobileReturn} from './mobile-returns';
import {mobileFinanceId} from './mobile-finance';
import {mobileBody,mobileRequestKey,idempotentMobileWrite} from './mobile-writes';
import {MobileError} from './mobile-session';

const invalid=()=>new MobileError('Chưa xác nhận được phiếu thu hồi. Giữ mã để đối chiếu.',503,'INVALID_WRITE_RECEIPT');
const iso=(v:unknown)=>new Date(v instanceof Date?v:String(v)).toISOString();
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function eventProof(event:Record<string,unknown>):MobileRecoveryReceipt['event'] {
  return{itemId:Number(event.item_id),vehicleId:Number(event.vehicle_id),recoveredAt:iso(event.recovered_at),recordedAt:iso(event.recorded_at),
    actorId:Number(event.actor_id),note:String(event.note??''),requestHash:String(event.request_hash??'')};
}
async function financialState(db:PoolClient,id:number) {
  const base=(await db.query('SELECT total,pid,first_deposit_amount,additional_deposit_amount,total_rental_fees,rent_at,return_at FROM himoto.orders WHERE id=$1',[id])).rows[0];
  const ledger=(await db.query("SELECT md5(COALESCE(string_agg(id::text||':'||xmin::text,',' ORDER BY id),'')) AS stamp FROM himoto.transactions WHERE order_id=$1",[id])).rows[0].stamp;
  const payments=(await db.query("SELECT md5(COALESCE(string_agg(request_id::text||':'||xmin::text,',' ORDER BY request_id),'')) AS stamp FROM himoto.management_contract_payments WHERE order_id=$1",[id])).rows[0].stamp;
  const state=await readContractResolution(db,id);
  if(!base||!state)throw invalid();
  const amounts:MobileRecoveryAmounts={totalAmount:state.total,rentalPaid:state.paid,rentalRemaining:state.remaining,rentalOverpayment:state.overpayment,depositHeld:state.deposit_held};
  return{fingerprint:hash({base,ledger,payments}),amounts,status:state.status};
}
async function receipt(db:PoolClient,user:SessionUser,key:string):Promise<MobileRecoveryReceipt|null> {
  const parent=(await db.query('SELECT r.operation,r.resource_id,r.resource_revision,m.proof FROM himoto.management_mobile_requests r '+
    'LEFT JOIN himoto.management_mobile_recoveries m ON m.user_id=r.user_id AND m.request_id=r.request_id AND m.order_id=r.resource_id '+
    'WHERE r.user_id=$1 AND r.request_id=$2',[user.id,key])).rows[0];
  if(!parent||parent.resource_id==null||!String(parent.operation).startsWith('return.recover:'))return null;
  if(parent.operation!=='return.recover:'+parent.resource_id||!isMobileRecoveryReceipt(parent.proof)||parent.proof.id!==Number(parent.resource_id)||
    parent.proof.revision!==parent.resource_revision||parent.proof.requestId!==key||parent.proof.actorId!==user.id)throw invalid();
  const proof:MobileRecoveryReceipt={...parent.proof,replayed:true};
  // Old actor proof remains readable for an archived order, subject to its
  // current order RLS. Never elevate to fleet_read or widen branch scope.
  const order=(await db.query('SELECT xmin::text AS revision,deleted_at,draft_payload FROM himoto.orders WHERE id=$1',[proof.id])).rows[0];
  if(!order)throw new MobileError('Hợp đồng đã ra ngoài phạm vi truy cập hiện tại.',403,'FORBIDDEN');
  const item=(await db.query('SELECT vehicle_id,completed_at,deleted_at,xmin::text AS revision FROM himoto.order_vehicle_details WHERE id=$1 AND order_id=$2',[proof.review.item.id,proof.id])).rows[0];
  proof.itemCurrent=!!item&&item.deleted_at==null&&item.completed_at!=null&&Number(item.vehicle_id)===proof.review.item.vehicleId&&
    item.revision===proof.itemRevision&&iso(item.completed_at)===proof.review.recoveredAt;
  const events=order.draft_payload?.management_composer?.vehicle_recoveries;
  const matches=Array.isArray(events)?events.filter((e:{request_id?:unknown})=>e?.request_id===key):[];
  proof.historyCurrent=false;
  if(matches.length===1){try{
    const current=eventProof(matches[0]),original=proof.event;
    proof.historyCurrent=Number(matches[0].order_id)===proof.id&&(Object.keys(current) as (keyof typeof current)[]).every(k=>current[k]===original[k]);
  }catch{proof.historyCurrent=false;}}
  proof.contractCurrent=order.deleted_at==null&&order.revision===proof.revision;
  proof.moneyCurrent=false;
  if(order.deleted_at==null){
    const money=await financialState(db,proof.id),expected=proof.review.after;
    proof.moneyCurrent=money.fingerprint===proof.financialFingerprint&&Object.keys(money.amounts).every(k=>money.amounts[k as keyof MobileRecoveryAmounts]===expected[k as keyof MobileRecoveryAmounts]);
  }
  proof.current=proof.itemCurrent&&proof.historyCurrent&&proof.moneyCurrent&&proof.contractCurrent;
  return proof;
}
export async function readMobileRecoveryReceipt(user:SessionUser,key:string) {
  requireMobileReturn(user);mobileRequestKey(key);
  return withMobileRecovery(user,db=>receipt(db,user,key).then(saved=>({receipt:saved})));
}
export async function recordMobileRecovery(user:SessionUser,value:string,request:NextRequest):Promise<MobileRecoveryReceipt> {
  requireMobileReturn(user);
  if([...request.nextUrl.searchParams].length)throw new MobileError('Không hỗ trợ bộ lọc khi ghi thu hồi.',400,'INVALID_QUERY');
  const id=mobileFinanceId(value),key=mobileRequestKey(request.headers.get('idempotency-key')),body=await mobileBody(request,8192);
  const {review_snapshot,...fields}=body;
  if(typeof review_snapshot!=='string'||!/^[a-f0-9]{64}$/.test(review_snapshot))throw new MobileError('Thiếu phiên thu hồi đã rà soát.',400,'INVALID_RECOVERY');
  const input:MobileRecoveryRecordInput={...parseMobileRecoveryInput(fields),review_snapshot};
  return withMobileRecovery(user,async db=>{
    const saved=await idempotentMobileWrite(db,user.id,key,'return.recover:'+id,{id,input},async()=>{
      const order=(await db.query('SELECT xmin::text AS revision FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0];
      if(!order)throw new MobileError('Không tìm thấy hợp đồng.',404,'NOT_FOUND');
      if(order.revision!==input.revision)throw recoveryConflict('Hợp đồng đã thay đổi. Rà soát lại trước khi thu hồi.');
      await db.query('SELECT id FROM himoto.order_vehicle_details WHERE id=$1 AND order_id=$2 AND deleted_at IS NULL FOR UPDATE',[input.item_id,id]);
      const {review_snapshot:expected,...details}=input;
      const reviewed=await readRecoveryPreview(db,id,details);
      if(reviewed.snapshot!==expected)throw recoveryConflict('Dòng xe hoặc số dư đã thay đổi. Rà soát lại trước khi thu hồi.');
      const before=await financialState(db,id);
      const result=await recordBadDebtRecovery(db,user.id,{item_id:input.item_id,item_revision:input.item_revision,recovered_at:input.recovered_at,note:input.note,request_id:key});
      if(result.replayed||result.order_id!==id||result.item_id!==input.item_id||result.vehicle_id!==reviewed.item.vehicleId)throw invalid();
      const after=await financialState(db,id);
      if(after.fingerprint!==before.fingerprint||hash(after.amounts)!==hash(before.amounts)||after.status!==reviewed.after.status)throw invalid();
      const stored=(await db.query('SELECT xmin::text AS revision,draft_payload FROM himoto.orders WHERE id=$1',[id])).rows[0];
      const item=(await db.query('SELECT xmin::text AS revision,vehicle_id,completed_at FROM himoto.order_vehicle_details WHERE id=$1 AND order_id=$2',[input.item_id,id])).rows[0];
      const events=stored?.draft_payload?.management_composer?.vehicle_recoveries;
      const matches=Array.isArray(events)?events.filter((e:{request_id?:unknown})=>e?.request_id===key):[];
      if(!item||item.completed_at==null||Number(item.vehicle_id)!==result.vehicle_id||iso(item.completed_at)!==reviewed.recoveredAt||matches.length!==1||Number(matches[0].order_id)!==id)throw invalid();
      const event=eventProof(matches[0]);
      const proof:MobileRecoveryReceipt={id,revision:stored.revision,requestId:key,replayed:false,review:reviewed,itemRevision:item.revision,
        actorId:user.id,actorName:String(user.name||'#'+user.id).slice(0,4000),recordedAt:event.recordedAt,event,financialFingerprint:after.fingerprint,
        itemCurrent:true,historyCurrent:true,moneyCurrent:true,contractCurrent:true,current:true};
      if(!isMobileRecoveryReceipt(proof))throw invalid();
      await db.query('INSERT INTO himoto.management_mobile_recoveries(user_id,request_id,order_id,proof) VALUES($1,$2,$3,$4::jsonb)',[user.id,key,id,JSON.stringify(proof)]);
      return{id,revision:stored.revision};
    });
    const original=await receipt(db,user,key);
    if(!original||original.id!==saved.id||original.revision!==saved.revision)throw invalid();
    return{...original,replayed:saved.replayed};
  },true);
}
