import 'server-only';
import type { PoolClient } from 'pg';
import { installmentBalance,parseInstallmentPlan } from '@/lib/management/contract-billing';
import { badDebtClock,badDebtCutoff } from '@/lib/management/contract-bad-debt';
import { depositLateral,rentalPaidSql } from './contract-deposits';

type Database=Pick<PoolClient,'query'>;
export async function readContractResolution(db:Database,id:number){
  const row=(await db.query(`SELECT o.order_status,o.draft_payload,o.total,${rentalPaidSql()} AS paid,
    dep.paid AS deposit_paid,dep.refunded AS deposit_refunded,
    (SELECT count(*)::int FROM himoto.order_vehicle_details d WHERE d.order_id=o.id AND d.deleted_at IS NULL) AS item_count,
    (SELECT count(*)::int FROM himoto.order_vehicle_details d WHERE d.order_id=o.id AND d.deleted_at IS NULL AND d.completed_at IS NOT NULL) AS returned_count
    FROM himoto.orders o ${depositLateral()} WHERE o.id=$1 AND o.deleted_at IS NULL`,[id])).rows[0];
  if(!row)return null;
  const money=(value:unknown)=>value===null||value===undefined||String(value).trim()===''||!Number.isSafeInteger(Number(value))||Number(value)<0?null:Number(value);
  const base=money(row.total),paid=money(row.paid),rawPlan=row.draft_payload?.management_composer?.installment_plan;
  const plan=rawPlan?parseInstallmentPlan(rawPlan):null;
  const clock=badDebtClock(row.order_status,badDebtCutoff(row.draft_payload)||plan?.stopped_at&&`${plan.stopped_at}:00+07:00`,Date.now());
  const balance=plan&&clock!==undefined?installmentBalance(plan,base,paid,clock):null;
  const total=rawPlan&&(!plan||clock===undefined)?null:balance?balance.accrued_total:base;
  // Before return, settlement also covers future contractual installments.
  const target=balance&&plan&&!plan.stopped_at&&row.order_status!=='bad_debt'&&base!==null?base+balance.expected_total-plan.amount:total;
  const remaining=target===null||paid===null?null:Math.max(target-paid,0);
  const overpayment=target===null||paid===null?null:Math.max(paid-target,0);
  const depositHeld=Math.max(Number(row.deposit_paid)-Number(row.deposit_refunded),0);
  const allReturned=Number(row.item_count)>0&&Number(row.item_count)===Number(row.returned_count);
  const clear=remaining===0&&overpayment===0&&depositHeld===0;
  const settlement=row.draft_payload?.management_composer?.lifecycle?.settlement;
  return {total,paid,remaining,overpayment,deposit_held:depositHeld,all_returned:allReturned,returned_count:Number(row.returned_count),
    can_settle:clear,settled:Boolean(settlement)&&clear,base,plan,status:String(row.order_status)};
}
/** Called inside the operation transaction; no receipt or balance is invented. */
export async function closeResolvedBadDebt(db:Database,id:number,actorId:number){
  const row=(await db.query('SELECT order_status,draft_payload FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0];
  if(row?.order_status!=='bad_debt'||!row.draft_payload?.management_composer?.lifecycle?.settlement)return false;
  const state=await readContractResolution(db,id);if(!state?.all_returned||!state.settled)return false;
  const payload=structuredClone(row.draft_payload),lifecycle=payload.management_composer.lifecycle,at=new Date().toISOString();
  lifecycle.events=[...(Array.isArray(lifecycle.events)?lifecycle.events:[]),{action:'closed',at,recorded_at:at,actor_id:actorId,actor_name:`#${actorId}`,note:'Đã trả/thu hồi tất cả xe và đối chiếu tất toán đủ tiền thuê, phí, cọc.',from:'bad_debt',to:'completed'}];
  await db.query("UPDATE himoto.orders SET order_status='completed',draft_payload=$2::json,updated_at=now() WHERE id=$1 AND order_status='bad_debt'",[id,JSON.stringify(payload)]);return true;
}
