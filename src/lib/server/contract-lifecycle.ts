import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { installmentBalance,parseInstallmentPlan } from '@/lib/management/contract-billing';
import { canHoldContract,localLifecycleTime,resumeInstallmentPlan,resumedHoldEnd,validLifecycleTime,type ContractLifecycleContext,type ContractLifecycleInput,type LifecycleEvent } from '@/lib/management/contract-lifecycle';
import { usesScopedDatabase } from './access-context';
import { contractVehicleReadSource } from './contract-vehicle-reads';
import { EFFECTIVE_RENTAL_TYPE_SQL,VEHICLE_ORDER_SQL } from './contract-classification';
import { closeResolvedBadDebt,readContractResolution } from './contract-resolution';
import { depositReceiptSql } from './contract-deposits';

type Database=Pick<PoolClient,'query'>;
export class ContractLifecycleError extends Error {constructor(message:string,public status=400){super(message);}}
const iso=(value:unknown)=>value instanceof Date?value.toISOString():value==null?null:String(value);
const stamp=(value:string)=>value+':00+07:00';
async function overdueAtHold(db:Database,id:number,context:ContractLifecycleContext,at:string) {
  // A backdated hold uses receipts at that time, rather than repayments entered later.
  const later=(await db.query(`SELECT COALESCE(sum(CASE WHEN type IN('in','addon') AND NOT ${depositReceiptSql()} THEN value
    WHEN type='out' AND name='order:rental_refund' THEN -value ELSE 0 END),0) AS amount,
    COALESCE(sum(value) FILTER(WHERE type IN('in','addon') AND name='order:extra'),0) AS extra FROM himoto.transactions t
    WHERE order_id=$1 AND status='approved' AND created_at>$2::timestamptz`,[id,stamp(at)])).rows[0];
  const paid=context.paid_amount===null?null:Math.max(context.paid_amount-Number(later.amount),0);
  if(context.plan){
    const base=context.base_total===null?null:context.base_total-Number(later.extra);
    const balance=installmentBalance(context.plan,base,paid,Date.parse(stamp(at)));
    if(balance.accrued_total===null)throw new ContractLifecycleError('Chưa đối chiếu được tình trạng thanh toán lúc bắt đầu bảo lưu.',409);
    return {overdue:Number(balance.due_amount)>0&&Boolean(balance.overdue_at&&balance.overdue_at<at),paid,due:balance.due_amount};
  }
  return {overdue:context.items.some(item=>!item.completed_at&&item.return_at&&Date.parse(item.return_at)<Date.parse(stamp(at))),paid,due:context.remaining};
}
const orderSql=`SELECT o.id,o.order_status,o.draft_payload,o.total,o.rent_at,o.return_at,o.xmin::text AS revision,
  COALESCE(NULLIF(o.contract_number,''),o.draft_reference,'#'||o.id::text) AS code,${EFFECTIVE_RENTAL_TYPE_SQL} AS rental_type,
  o.draft_payload #>> '{management_composer,draft,contract_type_name}' AS contract_type_name,
  ${EFFECTIVE_RENTAL_TYPE_SQL} IN ('ownership','ownership_cd') AS ownership
  FROM himoto.orders o LEFT JOIN himoto.stores s ON s.id=o.store_id WHERE o.id=$1 AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}`;
export function parseContractLifecycle(raw:unknown):ContractLifecycleInput {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new ContractLifecycleError('Thông tin thao tác không hợp lệ.');
  const body=raw as Record<string,unknown>;
  if(Object.keys(body).some(key=>!['action','revision','request_id','note','at','confirmed','vehicle_ids','resume_end','resume_package','resume_amount','hold_until'].includes(key))||!['mark_bad_debt','settle','hold','resume','update_hold','complete_hold'].includes(String(body.action))||typeof body.revision!=='string'||!/^\d{1,20}$/.test(body.revision)||typeof body.request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id)||typeof body.note!=='string'||body.note.trim().length<5||body.note.trim().length>1000||!validLifecycleTime(body.at)||body.confirmed!==true)throw new ContractLifecycleError('Nhập ngày giờ, lý do ít nhất 5 ký tự và xác nhận đã đối chiếu.');
  if(new Date(stamp(body.at)).getTime()>Date.now()+5*60000)throw new ContractLifecycleError('Ngày giờ thao tác không được nằm trong tương lai.');
  if(body.action!=='resume'&&['vehicle_ids','resume_end','resume_package','resume_amount'].some(key=>key in body))throw new ContractLifecycleError('Chỉ chọn xe và lịch mới khi thuê lại từ bảo lưu.');
  if(['hold','update_hold'].includes(String(body.action))){if(!validLifecycleTime(body.hold_until)||body.action==='hold'&&body.hold_until<=body.at)throw new ContractLifecycleError('Nhập hạn kết thúc bảo lưu sau ngày bắt đầu bảo lưu.');}
  else if(body.hold_until!==undefined)throw new ContractLifecycleError('Chỉ nhập hạn bảo lưu khi bắt đầu hoặc sửa bảo lưu.');
  if(body.action==='resume'&&(!Array.isArray(body.vehicle_ids)||!body.vehicle_ids.length||body.vehicle_ids.length>20||body.vehicle_ids.some(id=>!Number.isSafeInteger(id)||Number(id)<=0)||new Set(body.vehicle_ids).size!==body.vehicle_ids.length))throw new ContractLifecycleError('Chọn đủ xe đang rảnh, không chọn trùng xe.');
  if(body.resume_end!==undefined&&!validLifecycleTime(body.resume_end)||body.resume_package!==undefined&&!['Theo ngày','Theo tuần','Theo tháng'].includes(String(body.resume_package))||body.resume_amount!==undefined&&(typeof body.resume_amount!=='string'||!/^\d{1,13}$/.test(body.resume_amount)))throw new ContractLifecycleError('Lịch đóng tiền còn lại không hợp lệ.');
  return {...body,note:body.note.trim(),request_id:body.request_id.toLowerCase()} as unknown as ContractLifecycleInput;
}
export async function readContractLifecycle(db:Database,id:number):Promise<ContractLifecycleContext>{
  const order=(await db.query(orderSql,[id])).rows[0];if(!order)throw new ContractLifecycleError('Không tìm thấy hợp đồng trong phạm vi tài khoản.',404);
  const state=await readContractResolution(db,id);if(!state)throw new ContractLifecycleError('Không đọc được đối chiếu hợp đồng.',409);
  const items=(await db.query(`SELECT d.id,d.vehicle_id,d.rent_at,d.return_at,d.completed_at,v.name,v.license
    FROM himoto.order_vehicle_details d LEFT JOIN ${contractVehicleReadSource()} v ON v.id=d.vehicle_id
    WHERE d.order_id=$1 AND d.deleted_at IS NULL ORDER BY d.id`,[id])).rows.map(row=>({id:Number(row.id),vehicle_id:Number(row.vehicle_id),name:String(row.name||''),license:String(row.license||''),rent_at:iso(row.rent_at),return_at:iso(row.return_at),completed_at:iso(row.completed_at)}));
  const rawPlan=order.draft_payload?.management_composer?.installment_plan,plan=rawPlan?parseInstallmentPlan(rawPlan):null;
  const balance=plan?installmentBalance(plan,state.base,state.paid):null;
  const lifecycle=order.draft_payload?.management_composer?.lifecycle||{};
  const overdue=['renting','overdue','wait_payment'].includes(order.order_status)&&(order.ownership&&rawPlan
    ?Boolean(balance&&Number(balance.due_amount)>0&&balance.overdue_at&&balance.overdue_at<localLifecycleTime())
    :items.some(item=>!item.completed_at&&item.return_at&&new Date(item.return_at).getTime()<Date.now())||order.order_status==='overdue'&&state.remaining!==null&&state.remaining>0&&Boolean(order.return_at&&new Date(order.return_at).getTime()<Date.now()));
  return {id:Number(order.id),code:String(order.code),status:order.order_status,revision:String(order.revision),ownership:Boolean(order.ownership),rental_type:String(order.rental_type||''),contract_type_name:String(order.contract_type_name||''),overdue,
    items,all_returned:state.all_returned,returned_count:state.returned_count,total_amount:state.total,paid_amount:state.paid,remaining:state.remaining,deposit_held:state.deposit_held,overpayment:state.overpayment,settled:state.settled,can_settle:state.can_settle,
    settlement_note:state.remaining===null?'Chưa đối chiếu được số tiền hợp đồng.':state.remaining>0?'Còn tiền thuê, phí hoặc kỳ thuê chưa thanh toán.':state.deposit_held>0?'Còn tiền cọc chưa có phiếu xử lý/hoàn cọc.':Number(state.overpayment)>0?'Còn tiền thu dư cần đối chiếu.':'Đủ số liệu tiền để xác nhận tất toán.',
    events:Array.isArray(lifecycle.events)?lifecycle.events:[],held_at:lifecycle.active_hold?.at||null,resume_vehicle_count:lifecycle.active_hold?.vehicle_ids?.length||0,plan,base_total:state.base,start_at:iso(order.rent_at)||items[0]?.rent_at||null,
    hold_until:lifecycle.active_hold?.until||null,hold_expired:order.order_status==='reserved'&&validLifecycleTime(lifecycle.active_hold?.until)&&Date.parse(stamp(lifecycle.active_hold.until))<=Date.now(),
    hold_can_resume:lifecycle.active_hold?.can_resume===true,hold_was_overdue:lifecycle.active_hold?.was_overdue===true,
    completed_from_hold:Boolean(lifecycle.hold_completion),waived_amount:lifecycle.hold_completion?.waived_amount,
    end_at:plan?stamp(plan.end):iso(order.return_at)||items.filter(item=>!item.completed_at&&item.return_at).map(item=>item.return_at!).sort().at(-1)||null};
}
export async function applyContractLifecycle(db:Database,id:number,actorId:number,raw:unknown){
  const input=parseContractLifecycle(raw);if(!Number.isSafeInteger(id)||id<=0)throw new ContractLifecycleError('Mã hợp đồng không hợp lệ.');
  await db.query("SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='20s'");
  const order=(await db.query(orderSql+' FOR UPDATE OF o',[id])).rows[0];if(!order)throw new ContractLifecycleError('Không tìm thấy hợp đồng trong phạm vi tài khoản.',404);
  const payload=structuredClone(order.draft_payload||{}),composer=payload.management_composer||{},lifecycle=composer.lifecycle||{};
  const events:LifecycleEvent[]=Array.isArray(lifecycle.events)?lifecycle.events:[];
  const hash=createHash('sha256').update(JSON.stringify({...input,actor_id:actorId})).digest('hex'),previous=events.find(event=>event.request_id===input.request_id);
  if(previous){if(previous.request_hash!==hash)throw new ContractLifecycleError('Mã thao tác đã dùng cho nội dung khác.',409);return readContractLifecycle(db,id);}
  if(String(order.revision)!==input.revision)throw new ContractLifecycleError('Hợp đồng đã thay đổi. Tải lại tình trạng trước khi xác nhận.',409);
  if(['draft','cancelled','completed'].includes(order.order_status))throw new ContractLifecycleError('Hợp đồng đã đóng, hủy hoặc chưa phát hành.',409);
  const context=await readContractLifecycle(db,id);
  let next=order.order_status;let extra:Record<string,unknown>={};
  if(input.action==='mark_bad_debt'){
    if(!context.overdue)throw new ContractLifecycleError('Chỉ chuyển hợp đồng đã thực sự quá hạn sang Nợ xấu.',409);
    const atMs=new Date(stamp(input.at)).getTime();
    if(context.plan){const balance=installmentBalance(context.plan,context.base_total,context.paid_amount,atMs);if(!balance.overdue_at||Number(balance.due_amount)<=0||balance.overdue_at>=input.at)throw new ContractLifecycleError('Thời điểm chuyển phải sau hạn của khoản tiền còn thiếu.',409);}
    else if(!context.items.some(item=>!item.completed_at&&item.return_at&&new Date(item.return_at).getTime()<atMs)&&!(order.order_status==='overdue'&&order.return_at&&new Date(order.return_at).getTime()<atMs))throw new ContractLifecycleError('Thời điểm chuyển phải sau hạn hợp đồng.',409);
    next='bad_debt';delete lifecycle.settlement;
    lifecycle.bad_debt={at:stamp(input.at),recorded_at:new Date().toISOString(),actor_id:actorId};
    if(context.plan)composer.installment_plan={...context.plan,stopped_at:input.at<context.plan.end?input.at:context.plan.end};
  }else if(input.action==='settle'){
    if(order.order_status!=='bad_debt')throw new ContractLifecycleError('Chỉ xác nhận tất toán ở luồng Nợ xấu.',409);
    if(!context.can_settle)throw new ContractLifecycleError(context.settlement_note,409);
    lifecycle.settlement={at:input.at,recorded_at:new Date().toISOString(),actor_id:actorId,note:input.note,total:context.total_amount,paid:context.paid_amount,deposit_held:context.deposit_held};
  }else if(input.action==='hold'){
    if(!order.ownership||!['renting','overdue','wait_payment'].includes(order.order_status))throw new ContractLifecycleError('Chỉ bảo lưu hợp đồng thuê sở hữu đang thuê hoặc chờ tất toán.',409);
    if(!canHoldContract(context))throw new ContractLifecycleError('Chỉ bảo lưu hợp đồng thuê sở hữu còn xe đang thuê.',409);
    const active=(await db.query('SELECT id,vehicle_id,rent_at FROM himoto.order_vehicle_details WHERE order_id=$1 AND deleted_at IS NULL AND completed_at IS NULL ORDER BY vehicle_id,id FOR UPDATE',[id])).rows;
    if(!active.length)throw new ContractLifecycleError('Không còn lượt xe đang thuê để ghi nhận thu hồi và bảo lưu.',409);
    if(active.some(item=>item.rent_at&&new Date(stamp(input.at)).getTime()<new Date(item.rent_at).getTime()))throw new ContractLifecycleError('Ngày bảo lưu không được trước ngày nhận xe.');
    const planValue=composer.installment_plan,plan=planValue?parseInstallmentPlan(planValue):null;
    if(planValue&&!plan)throw new ContractLifecycleError('Lịch đóng tiền chưa hợp lệ. Cần đối chiếu trước khi bảo lưu.',409);
    if(plan&&input.at<plan.start)throw new ContractLifecycleError('Ngày bảo lưu không được trước ngày bắt đầu lịch đóng tiền.');
    const prior=await overdueAtHold(db,id,context,input.at),deadline=context.end_at?Date.parse(context.end_at):NaN;
    lifecycle.active_hold={at:input.at,until:input.hold_until,item_ids:active.map(item=>Number(item.id)),vehicle_ids:active.map(item=>Number(item.vehicle_id)),plan:plan||null,prior_end:context.end_at,was_overdue:prior.overdue,paid_at_start:prior.paid,past_due_amount:prior.due,
      was_term_expired:!Number.isFinite(deadline)||deadline<=Date.parse(stamp(input.at)),can_resume:!prior.overdue&&Number.isFinite(deadline)&&deadline>Date.parse(stamp(input.at))};
    // Resume eligibility is fixed from the original state, never by the later wall clock.
    if(plan)composer.installment_plan={...plan,stopped_at:input.at<plan.end?input.at:plan.end,paused_at:input.at<plan.end?input.at:plan.end};
    for(const item of active){
      if(usesScopedDatabase())await db.query('SELECT himoto.complete_contract_vehicle_return($1,$2::timestamptz)',[item.id,stamp(input.at)]);
      else await db.query('UPDATE himoto.order_vehicle_details SET completed_at=$2::timestamptz,updated_at=now() WHERE id=$1 AND completed_at IS NULL',[item.id,stamp(input.at)]);
    }
    for(const item of active){
      if(usesScopedDatabase())await db.query('SELECT himoto.release_returned_contract_vehicle($1)',[item.id]);
      else await db.query(`UPDATE himoto.vehicles v SET status='ready',updated_at=now() WHERE v.id=$1 AND v.status IN('using','rent','bad_debt') AND NOT EXISTS(
        SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id WHERE d.vehicle_id=v.id AND d.completed_at IS NULL AND d.deleted_at IS NULL AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL} AND o.order_status IN('renting','overdue','wait_payment','pending','deposit_contract','bad_debt'))`,[item.vehicle_id]);
    }
    extra={items:lifecycle.active_hold.item_ids,stopped_at:composer.installment_plan?.stopped_at||null,hold_until:input.hold_until,was_overdue:prior.overdue,can_resume:lifecycle.active_hold.can_resume};next='reserved';delete lifecycle.settlement;
  }else if(input.action==='update_hold'){
    const hold=lifecycle.active_hold;
    if(!order.ownership||order.order_status!=='reserved'||!hold)throw new ContractLifecycleError('Hợp đồng không ở trạng thái Bảo lưu.',409);
    if(input.hold_until! <= hold.at)throw new ContractLifecycleError('Hạn bảo lưu phải sau ngày bắt đầu bảo lưu.');
    if(typeof hold.was_overdue!=='boolean'){
      const prior=await overdueAtHold(db,id,{...context,plan:hold.plan||null},hold.at),deadline=Date.parse(hold.prior_end||context.end_at||'');
      hold.was_overdue=prior.overdue;hold.can_resume=!prior.overdue&&Number.isFinite(deadline)&&deadline>Date.parse(stamp(hold.at));
      hold.paid_at_start=prior.paid;hold.past_due_amount=prior.due;
    }
    extra={previous_until:hold.until||null,hold_until:input.hold_until};hold.until=input.hold_until;
  }else if(input.action==='complete_hold'){
    const hold=lifecycle.active_hold;
    if(!order.ownership||order.order_status!=='reserved'||!hold||!context.all_returned)throw new ContractLifecycleError('Chỉ hoàn thành hợp đồng thuê sở hữu đang bảo lưu đã thu đủ xe.',409);
    if(!validLifecycleTime(hold.until)||input.at<hold.until)throw new ContractLifecycleError('Chưa hết thời hạn bảo lưu. Kiểm tra hạn bảo lưu trước khi hoàn thành.',409);
    if(context.total_amount===null||context.paid_amount===null)throw new ContractLifecycleError('Chưa đối chiếu được tiền thuê và tiền đã thu; cần kiểm tra trước khi hoàn thành.',409);
    const finalTotal=Math.min(context.total_amount,context.paid_amount),waived=Math.max(context.total_amount-context.paid_amount,0);
    lifecycle.hold_completion={at:stamp(input.at),recorded_at:new Date().toISOString(),actor_id:actorId,note:input.note,waived_amount:waived,original_total:context.total_amount,original_base:context.base_total,paid:context.paid_amount,deposit_held:context.deposit_held,overpayment:context.overpayment,hold,plan:composer.installment_plan||null};
    delete lifecycle.active_hold;delete lifecycle.settlement;delete composer.installment_plan;
    await db.query('UPDATE himoto.orders SET total=$2::text WHERE id=$1',[id,String(finalTotal)]);
    extra={waived_amount:waived,original_total:context.total_amount,final_total:finalTotal,hold_until:hold.until};next='completed';
  }else{
    const hold=lifecycle.active_hold;
    if(!order.ownership||order.order_status!=='reserved'||!hold||!context.all_returned)throw new ContractLifecycleError('Hợp đồng không ở trạng thái Bảo lưu đã thu hồi đủ xe.',409);
    if(!validLifecycleTime(hold.until)||input.at<hold.until)throw new ContractLifecycleError('Chưa hết thời hạn bảo lưu. Kiểm tra hạn bảo lưu trước khi tiếp tục thuê.',409);
    if(!hold.can_resume)throw new ContractLifecycleError('Hợp đồng đã quá hạn khi bảo lưu; chỉ được hoàn thành hợp đồng.',409);
    if(input.vehicle_ids!.length!==hold.vehicle_ids.length)throw new ContractLifecycleError(`Chọn đủ ${hold.vehicle_ids.length} xe cho lượt thuê lại.`,409);
    let nextPlan;const base=context.base_total;
    try{
      if(hold.plan){
        if(input.resume_end!==undefined||input.resume_amount!==undefined||input.resume_package!==undefined)throw Error('Lịch còn lại được dời theo thời gian bảo lưu; giữ nguyên số kỳ và số tiền gốc.');
        nextPlan=resumeInstallmentPlan(hold.plan,hold.at,input.at);
      }else if(input.resume_end!==undefined||input.resume_amount!==undefined||input.resume_package!==undefined)throw Error('Hạn trả được dời theo thời gian bảo lưu; không thêm gói thuê hoặc khoản tiền mới.');
    }catch(error){throw new ContractLifecycleError(error instanceof Error?error.message:'Không lập được lịch thuê lại.',409);}
    const nextEnd=nextPlan?.end||resumedHoldEnd(context,input.at);
    const ids=[...input.vehicle_ids!].sort((a,b)=>a-b),itemIds:number[]=[];
    // The scoped RPC locks and validates the same cross-branch stock used by issuance.
    if(usesScopedDatabase()){
      const rows=(await db.query('SELECT * FROM himoto.resume_reserved_vehicles($1,$2::bigint[],$3::timestamptz,$4::timestamptz)',[id,ids,stamp(input.at),stamp(nextEnd)])).rows;itemIds.push(...rows.map(row=>Number(row.item_id)));
    }else for(const vehicleId of ids){
        const vehicle=(await db.query('SELECT id,status FROM himoto.vehicles WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[vehicleId])).rows[0];
        if(!vehicle||vehicle.status!=='ready')throw new ContractLifecycleError('Xe đã chọn không còn Lưu kho. Tải lại kho và chọn xe đang rảnh.',409);
        const conflict=await db.query('SELECT * FROM himoto.vehicle_window_conflicts(ARRAY[$1::bigint],$2,$3::timestamptz,$4::timestamptz)',[vehicleId,id,stamp(input.at),stamp(nextEnd)]);
        if(conflict.rowCount)throw new ContractLifecycleError('Xe đang có hợp đồng khác hoặc trùng lịch thuê. Chọn xe khác.',409);
        const history=await db.query(`SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id WHERE d.vehicle_id=$1 AND d.order_id<>$2 AND d.deleted_at IS NULL AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL} AND o.order_status NOT IN('draft','cancelled') AND d.rent_at<$4::timestamptz AND COALESCE(d.completed_at,d.return_at)>$3::timestamptz LIMIT 1`,[vehicleId,id,stamp(input.at),stamp(nextEnd)]);
        if(history.rowCount)throw new ContractLifecycleError('Khoảng thuê lại trùng với lịch sử hợp đồng khác của xe.',409);
        const row=(await db.query(`INSERT INTO himoto.order_vehicle_details(vehicle_id,order_id,price_id,borrow_hats,borrow_raincoats,rent_at,return_at,total_money,hiring_fee,status,type,handler_price,total_renewal_amount,created_at,updated_at)
          VALUES($1,$2,0,0,0,$3::timestamptz,$4::timestamptz,0,0,1,'monthly',0,0,now(),now()) RETURNING id`,[vehicleId,id,stamp(input.at),stamp(nextEnd)])).rows[0];itemIds.push(Number(row.id));
        await db.query("UPDATE himoto.vehicles SET status='using',updated_at=now() WHERE id=$1",[vehicleId]);
    }
    if(nextPlan)composer.installment_plan=nextPlan;else delete composer.installment_plan;
    delete lifecycle.active_hold;delete lifecycle.settlement;
    await db.query('UPDATE himoto.orders SET return_at=$2::timestamptz,total=$3::text WHERE id=$1',[id,stamp(nextEnd),String(base)]);
    extra={item_ids:itemIds,vehicle_ids:ids,previous_plan:hold.plan||null,new_plan:nextPlan,held_at:hold.at,previous_end:context.end_at,new_end:stamp(nextEnd)};next='renting';
  }
  const actor=(await db.query('SELECT name FROM himoto.users WHERE id=$1',[actorId])).rows[0];
  lifecycle.events=[...events,{action:input.action,at:stamp(input.at),recorded_at:new Date().toISOString(),actor_id:actorId,actor_name:String(actor?.name||`#${actorId}`),note:input.note,from:order.order_status,to:next,request_id:input.request_id,request_hash:hash,...extra}];
  composer.lifecycle=lifecycle;payload.management_composer=composer;
  await db.query('UPDATE himoto.orders SET order_status=$2,draft_payload=$3::json,updated_at=now() WHERE id=$1',[id,next,JSON.stringify(payload)]);
  if(input.action==='settle')await closeResolvedBadDebt(db,id,actorId);
  return readContractLifecycle(db,id);
}
