import 'server-only';
import { createHash } from 'node:crypto';
import { contractVehicleReadSource } from './contract-vehicle-reads';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import type { PoolClient } from 'pg';
import type { BadDebtRecoveryInput, BadDebtRecoveryResult, ReturnableContractItem, ReturnInput, ReturnResult } from '@/lib/management/contract-returns';
import { dailyPriceSql, depositLateral, rentalPaid, rentalPaidSql } from './contract-deposits';
import { installmentBalance, parseInstallmentPlan } from '@/lib/management/contract-billing';
import { usesScopedDatabase } from './access-context';
import { lateReturnFee } from '@/lib/management/return-fees';
import { closeResolvedBadDebt } from './contract-resolution';

type Database = Pick<PoolClient, 'query'>;
export class ContractReturnError extends Error { constructor(message: string, public status = 400) { super(message); } }
const MAX_RETURN_RATE = 5_000_000;
const MAX_MONEY = 9_999_999_999_999;
const localTimestamp = (value: string) => `${value}:00+07:00`;
function toIso(value: unknown): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function parseReturnBatch(body: unknown): ReturnInput[] {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'items' in body) {
    const { items, settlements: _settlements, ...rest } = body as Record<string, unknown>;void _settlements;
    if (Object.keys(rest).length || !Array.isArray(items) || !items.length || items.length > 20) throw new ContractReturnError('Chọn từ 1 đến 20 xe cần trả.');
    const parsed = items.map(parseReturnInput);
    if (new Set(parsed.map(item => item.item_id)).size !== parsed.length) throw new ContractReturnError('Mỗi xe chỉ được trả một lần.');
    return parsed;
  }
  return [parseReturnInput(body)];
}

export function parseReturnInput(body: unknown): ReturnInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ContractReturnError('Thông tin trả xe không hợp lệ.');
  const input = body as Record<string, unknown>;
  if(input.repair_fee!==undefined&&(typeof input.repair_fee!=='string'||!/^\d{1,13}$/.test(input.repair_fee)||Number(input.repair_fee)>MAX_MONEY))throw new ContractReturnError('Tiền sửa chữa phải là số nguyên VNĐ không âm.');
  if(input.repair_note!==undefined&&(typeof input.repair_note!=='string'||input.repair_note.trim().length>1000))throw new ContractReturnError('Nội dung sửa chữa tối đa 1.000 ký tự.');
  if(Number(input.repair_fee)>0&&!(typeof input.repair_note==='string'&&input.repair_note.trim()))throw new ContractReturnError('Ghi rõ hư hỏng / nội dung thu phí sửa chữa.');
  if (input.early_discount !== undefined && (typeof input.early_discount !== 'string' || !/^\d{1,13}$/.test(input.early_discount) || Number(input.early_discount) > MAX_MONEY)) throw new ContractReturnError('Số tiền giảm doanh thu khi trả sớm không hợp lệ.');
  if (Object.keys(input).some(key => !['item_id', 'item_revision', 'returned_at', 'hourly_rate', 'fee_override', 'early_discount','repair_fee','repair_note'].includes(key)) ||
      !Number.isSafeInteger(input.item_id) || Number(input.item_id) <= 0 || typeof input.item_revision !== 'string' || !/^\d{1,20}$/.test(input.item_revision) ||
      typeof input.returned_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.returned_at) ||
      typeof input.hourly_rate !== 'string' || !/^\d{1,7}$/.test(input.hourly_rate) || Number(input.hourly_rate) > MAX_RETURN_RATE ||
      (input.fee_override !== undefined && (typeof input.fee_override !== 'string' || !/^\d{1,13}$/.test(input.fee_override) || Number(input.fee_override) > MAX_MONEY))) throw new ContractReturnError('Kiểm tra giờ trả, đơn giá trễ và phí trả xe.');
  const returned = new Date(localTimestamp(input.returned_at));
  if (!Number.isFinite(returned.getTime()) || new Date(returned.getTime() + 7 * 3_600_000).toISOString().slice(0, 16) !== input.returned_at) throw new ContractReturnError('Thời gian trả xe không hợp lệ.');
  if (returned.getTime() > Date.now() + 5 * 60_000) throw new ContractReturnError('Thời gian trả xe không được nằm trong tương lai.');
  return { item_id: Number(input.item_id), item_revision: input.item_revision, returned_at: input.returned_at, hourly_rate: input.hourly_rate,
    ...(input.fee_override === undefined ? {} : { fee_override: input.fee_override as string }),
    ...(input.early_discount === undefined ? {} : { early_discount: input.early_discount as string }),...(input.repair_fee===undefined?{}:{repair_fee:input.repair_fee as string,repair_note:String(input.repair_note||'').trim()}) };
}

const RETURNABLE_SQL = `SELECT d.id AS item_id,o.id AS order_id,
  COALESCE(NULLIF(o.contract_number,''),NULLIF(o.draft_reference,''),'#'||o.id::text) AS contract_code,
  CASE WHEN o.order_status='renting' AND d.return_at < now() THEN 'overdue' ELSE o.order_status END AS order_status,
  COALESCE(c.name,o.customer_name,'') AS customer_name,COALESCE(c.id_card::text,o.customer_idnumber::text,'') AS customer_id_card,
  v.id AS vehicle_id,v.name AS vehicle_name,v.license, o.store_id,s.store_name,
  d.rent_at AS scheduled_start_at,d.return_at AS scheduled_return_at,d.completed_at,d.xmin::text AS item_revision,o.xmin::text AS order_revision,
  NULLIF(o.total::text,'')::numeric AS total_amount,o.draft_payload,${rentalPaidSql()} AS paid_amount,dep.paid AS deposit_paid,dep.paid-dep.refunded AS deposit_held,
  (d.completed_at IS NULL AND d.return_at < now()) AS overdue,
  ${dailyPriceSql()} AS daily_price
  FROM himoto.order_vehicle_details d
  JOIN himoto.orders o ON o.id=d.order_id
  JOIN himoto.vehicles v ON v.id=d.vehicle_id
  LEFT JOIN himoto.customers c ON c.id=o.customer_id
  LEFT JOIN himoto.stores s ON s.id=o.store_id
  ${depositLateral()}
  WHERE d.deleted_at IS NULL AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
    AND o.order_status IN ('renting','overdue','wait_payment','completed','bad_debt')`;

const returnableSql = (includeBadDebt=false) => RETURNABLE_SQL.replace('JOIN himoto.vehicles v', `JOIN ${contractVehicleReadSource()} v`)+(includeBadDebt?'':" AND o.order_status<>'bad_debt'");

function mapReturnableRows(rows: Record<string, unknown>[]): ReturnableContractItem[] {
  return rows.map(row => {
    const value = (row.draft_payload as {management_composer?: {installment_plan?: unknown}} | undefined)?.management_composer?.installment_plan;
    const plan = value ? parseInstallmentPlan(value) : null;
    if (value && !plan) throw new ContractReturnError('Lịch đóng tiền chưa hợp lệ. Cần đối chiếu hợp đồng.', 409);
    const baseTotal = row.total_amount == null ? null : Number(row.total_amount), paid = row.paid_amount == null ? null : Number(row.paid_amount);
    const reconciliations=(row.draft_payload as {management_composer?:{vehicle_reconciliations?:{item_id:number;actual_recovery_at:string|null}[]}}|undefined)?.management_composer?.vehicle_reconciliations;
    const returnReconciled=Array.isArray(reconciliations)&&reconciliations.some(item=>Number(item.item_id)===Number(row.item_id)&&item.actual_recovery_at===null);
    const total = plan && (row.order_status !== 'completed' || plan.stopped_at) ? installmentBalance(plan, baseTotal, paid).accrued_total : baseTotal;
    return { item_id: Number(row.item_id), order_id: Number(row.order_id), contract_code: String(row.contract_code),
    order_status: String(row.order_status), customer_name: String(row.customer_name), customer_id_card: String(row.customer_id_card),
    vehicle_id: Number(row.vehicle_id), vehicle_name: String(row.vehicle_name || ''), license: String(row.license || ''),
    store_id: Number(row.store_id), store_name: String(row.store_name || ''), scheduled_start_at: toIso(row.scheduled_start_at), scheduled_return_at: toIso(row.scheduled_return_at), completed_at: toIso(row.completed_at),
    item_revision: String(row.item_revision), order_revision: String(row.order_revision),
    total_amount: total, paid_amount: paid, overdue: Boolean(row.overdue),
    daily_price: Number(row.daily_price) > 0 ? Number(row.daily_price) : null,
    deposit_paid: Number(row.deposit_paid) || 0, deposit_held: Math.max(Number(row.deposit_held) || 0, 0), ...(returnReconciled?{return_reconciled:true}:{}) };
  });
}

export async function searchReturnableItems(client: Database, query: string): Promise<ReturnableContractItem[]> {
  const text = query.trim().slice(0, 100);
  if (!text) return [];
  const pattern = `%${text.replace(/[\\%_]/g, '\\$&')}%`;
  const digits = text.replace(/\D/g, '');
  const plate = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const result = await client.query(`${returnableSql()}
    AND (COALESCE(NULLIF(o.contract_number,''),NULLIF(o.draft_reference,''),'#'||o.id::text) ILIKE $1 ESCAPE '\\'
      OR ($2 <> '' AND regexp_replace(COALESCE(c.id_card::text,o.customer_idnumber::text,''),'\\D','','g')=$2)
      OR ($2 <> '' AND regexp_replace(COALESCE(NULLIF(c.phone,''),o.customer_phone,''),'\\D','','g')=$2)
      OR o.id IN (
        SELECT matched.order_id FROM himoto.order_vehicle_details matched
        JOIN ${contractVehicleReadSource()} matched_vehicle ON matched_vehicle.id=matched.vehicle_id
        WHERE matched.deleted_at IS NULL
          AND (matched_vehicle.license ILIKE $1 ESCAPE '\\'
            OR ($3 <> '' AND regexp_replace(upper(COALESCE(matched_vehicle.license,'')),'[^A-Z0-9]','','g') LIKE '%'||$3||'%'))))
    ORDER BY (d.completed_at IS NULL) DESC,d.rent_at DESC NULLS LAST,d.id DESC LIMIT 100`, [pattern, digits, plate]);
  return mapReturnableRows(result.rows);
}

export async function loadContractReturnableItems(client: Database, orderId: number, includeBadDebt=false): Promise<ReturnableContractItem[]> {
  if (!Number.isSafeInteger(orderId) || orderId <= 0) return [];
  const result = await client.query(`${returnableSql(includeBadDebt)} AND o.id=$1 ORDER BY (d.completed_at IS NULL) DESC,d.return_at ASC NULLS LAST,d.id`, [orderId]);
  return mapReturnableRows(result.rows);
}

export function parseBadDebtRecovery(body:unknown):BadDebtRecoveryInput {
  if(!body||typeof body!=='object'||Array.isArray(body))throw new ContractReturnError('Thông tin thu hồi xe không hợp lệ.');
  const input=body as Record<string,unknown>;
  if(Object.keys(input).some(key=>!['item_id','item_revision','request_id','recovered_at','note'].includes(key))||!Number.isSafeInteger(input.item_id)||Number(input.item_id)<=0||typeof input.item_revision!=='string'||!/^\d{1,20}$/.test(input.item_revision)||typeof input.request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.request_id)||typeof input.recovered_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.recovered_at)||typeof input.note!=='string'||input.note.trim().length<5||input.note.trim().length>1000)throw new ContractReturnError('Chọn xe, ngày giờ thực tế thu hồi và ghi chú ít nhất 5 ký tự.');
  const date=new Date(localTimestamp(input.recovered_at));
  if(!Number.isFinite(date.getTime())||new Date(date.getTime()+7*3600000).toISOString().slice(0,16)!==input.recovered_at||date.getTime()>Date.now()+5*60000)throw new ContractReturnError('Ngày giờ thu hồi không hợp lệ hoặc nằm trong tương lai.');
  return {item_id:Number(input.item_id),item_revision:input.item_revision,request_id:input.request_id.toLowerCase(),recovered_at:input.recovered_at,note:input.note.trim()};
}

/** Physical recovery only: preserve old bad debt, totals, deposits and all receipts. */
export async function recordBadDebtRecovery(client:Database,actorId:number,raw:BadDebtRecoveryInput):Promise<BadDebtRecoveryResult> {
  const input=parseBadDebtRecovery(raw);
  await client.query("SET LOCAL lock_timeout = '5s'");
  const row=(await client.query(`SELECT d.id,d.order_id,d.vehicle_id,d.rent_at,d.completed_at,d.xmin::text AS item_revision,o.draft_payload,o.order_status
    FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
    WHERE d.id=$1 AND d.deleted_at IS NULL AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
      AND o.order_status IN('bad_debt','completed') FOR UPDATE OF d,o`,[input.item_id])).rows[0];
  if(!row)throw new ContractReturnError('Không tìm thấy xe trong hợp đồng nợ xấu thuộc phạm vi tài khoản.',404);
  const payload=structuredClone(row.draft_payload||{}),composer=payload.management_composer||{};
  const events=Array.isArray(composer.vehicle_recoveries)?composer.vehicle_recoveries:[];
  const hash=createHash('sha256').update(JSON.stringify({...input,actor_id:actorId})).digest('hex');
  const previous=events.find((event:{request_id?:string})=>event.request_id===input.request_id);
  const result={item_id:input.item_id,order_id:Number(row.order_id),vehicle_id:Number(row.vehicle_id),recovered_at:localTimestamp(input.recovered_at)};
  if(previous){if(previous.request_hash!==hash)throw new ContractReturnError('Mã lần thu hồi đã dùng cho thông tin khác.',409);return {...result,replayed:true};}
  if(row.order_status!=='bad_debt')throw new ContractReturnError('Hợp đồng đã đóng; không ghi thêm lượt thu hồi.',409);
  if(row.completed_at)throw new ContractReturnError('Xe đã được ghi nhận trả/thu hồi. Tải lại để kiểm tra kho.',409);
  if(String(row.item_revision)!==input.item_revision)throw new ContractReturnError('Dòng xe đã thay đổi. Mở lại hợp đồng trước khi xác nhận.',409);
  if(row.rent_at&&new Date(result.recovered_at).getTime()<new Date(row.rent_at).getTime())throw new ContractReturnError('Ngày thu hồi không được trước ngày bắt đầu thuê.');
  if(usesScopedDatabase())await client.query('SELECT himoto.complete_contract_vehicle_return($1,$2::timestamptz)',[input.item_id,result.recovered_at]);
  else await client.query('UPDATE himoto.order_vehicle_details SET completed_at=$2::timestamptz,updated_at=now() WHERE id=$1',[input.item_id,result.recovered_at]);
  composer.vehicle_recoveries=[...events,{...result,request_id:input.request_id,request_hash:hash,recorded_at:new Date().toISOString(),actor_id:actorId,note:input.note}];
  if(composer.installment_plan){
    const plan=parseInstallmentPlan(composer.installment_plan);
    if(!plan)throw new ContractReturnError('Lịch đóng tiền chưa hợp lệ. Cần đối chiếu trước khi thu hồi.',409);
    const returned=(await client.query('SELECT count(*) FILTER(WHERE completed_at IS NULL)::int AS remaining,max(completed_at) AS latest FROM himoto.order_vehicle_details WHERE order_id=$1 AND deleted_at IS NULL',[row.order_id])).rows[0];
    if(Number(returned.remaining)===0){const at=new Date(new Date(returned.latest).getTime()+7*3600000).toISOString().slice(0,16);composer.installment_plan={...plan,stopped_at:at<plan.end?at:plan.end};}
  }
  payload.management_composer=composer;
  await client.query('UPDATE himoto.orders SET draft_payload=$2,updated_at=now() WHERE id=$1',[row.order_id,JSON.stringify(payload)]);
  if(usesScopedDatabase())await client.query('SELECT himoto.release_returned_contract_vehicle($1)',[input.item_id]);
  else {
    const open=await client.query(`SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
      WHERE d.vehicle_id=$1 AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
        AND o.order_status IN('renting','overdue','wait_payment','pending','bad_debt') LIMIT 1`,[row.vehicle_id]);
    if(!open.rowCount)await client.query("UPDATE himoto.vehicles SET status='ready',updated_at=now() WHERE id=$1 AND status IN('using','rent','bad_debt')",[row.vehicle_id]);
  }
  if(composer.lifecycle?.settlement)await closeResolvedBadDebt(client,Number(row.order_id),actorId);
  return {...result,replayed:false};
}

export async function recordVehicleReturn(client: Database, actorId: number, input: ReturnInput): Promise<ReturnResult> {
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '15s'");
  const itemResult = await client.query(`SELECT d.id,d.order_id,d.vehicle_id,d.rent_at,d.return_at,d.xmin::text AS item_revision,
      o.order_status,o.total,o.pid,o.draft_payload,o.xmin::text AS order_revision,${dailyPriceSql()} AS daily_price,
      COALESCE(NULLIF(o.contract_number,''),o.draft_reference,'#'||o.id::text) AS contract_code
    FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
    WHERE d.id=$1 AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
      AND o.order_status IN ('renting','overdue','wait_payment') FOR UPDATE OF d,o`, [input.item_id]);
  const item = itemResult.rows[0];
  if (!item) throw new ContractReturnError('Không tìm thấy xe đang thuê cần trả.', 404);
  if (String(item.item_revision) !== input.item_revision) throw new ContractReturnError('Chi tiết xe đã thay đổi. Tải lại danh sách trước khi trả.', 409);
  if (!item.return_at) throw new ContractReturnError('Hợp đồng chưa có hạn trả xe. Cập nhật hợp đồng trước khi ghi nhận trả xe.', 409);
  const scheduledMs = new Date(toIso(item.return_at)!).getTime();
  const returnedMs = new Date(localTimestamp(input.returned_at)).getTime();
  const lateMinutes = Math.max(0, Math.ceil((returnedMs - scheduledMs) / 60_000));
  const chargeableHours = Math.ceil(lateMinutes / 60);
  const hourlyRate = Number(input.hourly_rate);
  if(item.rent_at&&returnedMs<new Date(toIso(item.rent_at)!).getTime())throw new ContractReturnError('Giờ bàn giao thực tế không được trước giờ nhận xe.');
  if (input.fee_override !== undefined && chargeableHours === 0) throw new ContractReturnError('Chỉ có thể điều chỉnh phí khi xe trả trễ hạn.');
  const earlyDiscount = input.early_discount === undefined ? 0 : Number(input.early_discount);
  if (earlyDiscount && returnedMs >= scheduledMs) throw new ContractReturnError('Chỉ giảm doanh thu khi xe trả sớm hơn hạn.');
  const suggested=lateReturnFee(lateMinutes,hourlyRate,Number(item.daily_price)>0?Number(item.daily_price):null);
  if(input.fee_override===undefined&&suggested.amount===null)throw new ContractReturnError('Chưa xác định giá thuê ngày của xe. Nhập phí trả muộn đã đối chiếu trước khi xác nhận.',409);
  const lateFee = input.fee_override === undefined ? suggested.amount! : Number(input.fee_override);
  if (!Number.isSafeInteger(lateFee) || lateFee > MAX_MONEY) throw new ContractReturnError('Tiền trả muộn vượt giới hạn lưu trữ.');
  const repairFee=Number(input.repair_fee||0);
  const fee = lateFee + repairFee - earlyDiscount;
  if(!Number.isSafeInteger(fee)||Math.abs(fee)>MAX_MONEY)throw new ContractReturnError('Tổng phí trả xe vượt giới hạn lưu trữ.');
  const baseTotal = item.total == null || item.total === '' ? null : Number(item.total);
  const planValue = item.draft_payload?.management_composer?.installment_plan;
  const plan = planValue ? parseInstallmentPlan(planValue) : null;
  if (planValue && !plan) throw new ContractReturnError('Lịch đóng tiền chưa hợp lệ. Cần đối chiếu hợp đồng.', 409);
  if (plan && input.returned_at < plan.start) throw new ContractReturnError('Ngày trả không được trước ngày bắt đầu thuê sở hữu.', 409);
  if (plan && earlyDiscount) throw new ContractReturnError('Thuê sở hữu cần đối chiếu lịch đóng tiền khi giảm doanh thu trả sớm; không tự trừ vào tiền kỳ đầu.', 409);
  const paid = await rentalPaid(client, Number(item.order_id), item.pid) ?? 0;
  const oldTotal = plan ? installmentBalance(plan, baseTotal, paid, returnedMs).accrued_total : baseTotal;
  if (fee && (oldTotal === null || !Number.isSafeInteger(oldTotal) || oldTotal + fee > MAX_MONEY)) throw new ContractReturnError('Chưa có tổng phí hợp đồng hợp lệ để điều chỉnh khi trả xe.', 409);
  if (oldTotal !== null && oldTotal + fee < 0) throw new ContractReturnError('Số tiền giảm khi trả sớm vượt tổng tiền thuê của hợp đồng.');

  const actual = localTimestamp(input.returned_at);
  if(usesScopedDatabase())await client.query('SELECT himoto.complete_contract_vehicle_return($1,$2::timestamptz)',[input.item_id,actual]);
  else await client.query('UPDATE himoto.order_vehicle_details SET completed_at=$2::timestamptz,updated_at=now() WHERE id=$1', [input.item_id, actual]);
  const open = await client.query(`SELECT count(*)::int AS count, bool_or(d.return_at < now()) AS has_overdue
    FROM himoto.order_vehicle_details d WHERE d.order_id=$1 AND d.deleted_at IS NULL AND d.completed_at IS NULL`, [item.order_id]);
  const remainingItems = Number(open.rows[0].count);
  const nextTotal = oldTotal === null ? null : oldTotal + fee;
  const nextStatus = remainingItems
    ? (open.rows[0].has_overdue ? 'overdue' : item.order_status === 'wait_payment' ? 'wait_payment' : 'renting')
    : nextTotal !== null && nextTotal > paid ? 'wait_payment' : 'completed';
  const returnAdjustment = { item_id: input.item_id, vehicle_id: Number(item.vehicle_id), scheduled_return_at: toIso(item.return_at),
    actual_return_at: actual, late_minutes: lateMinutes, chargeable_hours: chargeableHours, hourly_rate: hourlyRate, fee,
    late_fee:lateFee,late_days:suggested.days,late_hours:suggested.hours,daily_price:item.daily_price==null?null:Number(item.daily_price),fee_overridden:input.fee_override!==undefined,repair_fee:repairFee,...(repairFee?{repair_note:input.repair_note}:{}),...(earlyDiscount ? { early_discount: earlyDiscount } : {}), actor_id: actorId };
  await client.query(`UPDATE himoto.orders SET
      total=CASE WHEN $2::bigint=0 THEN total ELSE ($3::numeric)::text END,
      draft_payload=jsonb_set(COALESCE(draft_payload::jsonb,'{}'::jsonb),'{management_composer}',
        jsonb_set(CASE WHEN jsonb_typeof(draft_payload::jsonb->'management_composer')='object'
          THEN draft_payload::jsonb->'management_composer' ELSE '{}'::jsonb END,'{return_adjustments}',
          COALESCE(draft_payload::jsonb #> '{management_composer,return_adjustments}','[]'::jsonb) || $5::jsonb,true),true)::json,
      order_status=$4,updated_at=now() WHERE id=$1`, [item.order_id,fee,plan ? (baseTotal ?? 0)+fee : nextTotal ?? 0,nextStatus,JSON.stringify([returnAdjustment])]);
  if (plan && !remainingItems) await client.query(`UPDATE himoto.orders SET draft_payload=jsonb_set(draft_payload::jsonb,
    '{management_composer,installment_plan,stopped_at}',to_jsonb($2::text),true)::json WHERE id=$1`, [item.order_id,input.returned_at < plan.end ? input.returned_at : plan.end]);
  if(usesScopedDatabase())await client.query('SELECT himoto.release_returned_contract_vehicle($1)',[input.item_id]);
  else {
    const vehicleOpen=await client.query(`SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
      WHERE d.vehicle_id=$1 AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
      AND o.order_status IN('renting','overdue','wait_payment','pending','bad_debt') LIMIT 1`,[item.vehicle_id]);
    if(!vehicleOpen.rowCount)await client.query(`UPDATE himoto.vehicles SET status=CASE WHEN status IN ('using','rent') THEN 'ready' ELSE status END,updated_at=now() WHERE id=$1`,[item.vehicle_id]);
  }
  return { item_id: input.item_id, contract_code: String(item.contract_code), returned_at: actual, scheduled_return_at: toIso(item.return_at)!,
    late_minutes: lateMinutes, chargeable_hours: chargeableHours, hourly_rate: hourlyRate, fee,late_fee:lateFee,repair_fee:repairFee, total_amount: nextTotal, status: nextStatus };
}

export async function replaceContractVehicle(client: Database, actorId: number, input: { item_id: number; item_revision: string; vehicle_id: number }) {
  await client.query("SET LOCAL lock_timeout = '5s'");
  const result = await client.query(`SELECT d.id,d.order_id,d.vehicle_id,d.xmin::text AS item_revision,o.store_id,o.draft_payload
    FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
    WHERE d.id=$1 AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
      AND o.order_status IN ('renting','overdue','wait_payment') FOR UPDATE OF d,o`, [input.item_id]);
  const item = result.rows[0];
  if (!item) throw new ContractReturnError('Không tìm thấy xe đang thuê cần đổi.', 404);
  if (String(item.item_revision) !== input.item_revision) throw new ContractReturnError('Chi tiết xe đã thay đổi. Tải lại danh sách trước khi đổi.', 409);
  if (Number(item.vehicle_id) === input.vehicle_id) throw new ContractReturnError('Biển số xe đang chọn không thay đổi.');
  const newVehicle = await client.query(`SELECT v.id,v.name,v.license,v.brand,v.type,v.color,v.year,v.store_id,s.store_name
    FROM himoto.vehicles v LEFT JOIN himoto.stores s ON s.id=v.store_id
    WHERE v.id=$1 AND v.status='ready' FOR UPDATE OF v`, [input.vehicle_id]);
  if (!newVehicle.rowCount) throw new ContractReturnError('Xe mới phải đang Lưu kho.', 409);
  const openRental = await client.query(`SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
    WHERE d.vehicle_id=$1 AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
      AND o.order_status IN ('renting','overdue','wait_payment','pending','deposit_contract') LIMIT 1`, [input.vehicle_id]);
  if (openRental.rowCount || usesScopedDatabase()&&(await client.query('SELECT himoto.vehicle_has_open_rental($1) AS blocked',[input.vehicle_id])).rows[0]?.blocked) throw new ContractReturnError('Xe mới đang thuộc hợp đồng mở, không thể dùng để thay xe.', 409);
  const duplicate = await client.query(`SELECT 1 FROM himoto.order_vehicle_details
    WHERE order_id=$1 AND vehicle_id=$2 AND id<>$3 AND deleted_at IS NULL AND completed_at IS NULL LIMIT 1`, [item.order_id,input.vehicle_id,input.item_id]);
  if (duplicate.rowCount) throw new ContractReturnError('Xe mới đã nằm trong hợp đồng này.', 409);
  const oldVehicle = await client.query('SELECT license FROM himoto.vehicles WHERE id=$1 FOR UPDATE', [item.vehicle_id]);
  await client.query('UPDATE himoto.order_vehicle_details SET vehicle_id=$2,updated_at=now() WHERE id=$1', [input.item_id,input.vehicle_id]);
  const swap = await client.query(`INSERT INTO himoto.management_contract_vehicle_swaps(order_id,order_item_id,from_vehicle_id,to_vehicle_id,actor_id)
    VALUES ($1,$2,$3,$4,$5) RETURNING id`, [item.order_id,input.item_id,item.vehicle_id,input.vehicle_id,actorId]);
  const oldOpen = await client.query(`SELECT 1 FROM himoto.order_vehicle_details WHERE vehicle_id=$1 AND deleted_at IS NULL AND completed_at IS NULL LIMIT 1`, [item.vehicle_id]);
  const foreignOldOpen=usesScopedDatabase()&&(await client.query('SELECT himoto.vehicle_has_open_rental($1) AS blocked',[item.vehicle_id])).rows[0]?.blocked;
  if (!oldOpen.rowCount&&!foreignOldOpen) await client.query(`UPDATE himoto.vehicles SET status=CASE WHEN status IN ('using','rent') THEN 'ready' ELSE status END,updated_at=now() WHERE id=$1`, [item.vehicle_id]);
  await client.query(`UPDATE himoto.vehicles SET status='using',updated_at=now() WHERE id=$1`, [input.vehicle_id]);

  // Keep printed/contract draft vehicle fields in sync with the live rental line.
  const next = newVehicle.rows[0];
  const nextId = String(next.id);
  const oldId = String(item.vehicle_id);
  const typeCode = String(next.type) === 'electric' ? 'xe_dien' : String(next.type || '');
  const typeLabel = ({ xega: 'Xe ga', xeso: 'Xe số', xecon: 'Xe côn tay', xesh: 'Xe SH', xe_dien: 'Xe điện' } as Record<string, string>)[typeCode] || typeCode;
  const payload = item.draft_payload && typeof item.draft_payload === 'object' && !Array.isArray(item.draft_payload)
    ? structuredClone(item.draft_payload) as Record<string, unknown> : {};
  const orderItems = Array.isArray(payload.order_items) ? payload.order_items as Record<string, unknown>[] : [];
  if (orderItems.length) {
    payload.order_items = orderItems.map(line => String(line.vehicle_id) === oldId
      ? { ...line, vehicle_id: Number(next.id) } : line);
  }
  const composer = payload.management_composer && typeof payload.management_composer === 'object' && !Array.isArray(payload.management_composer)
    ? payload.management_composer as Record<string, unknown> : null;
  const draft = composer?.draft && typeof composer.draft === 'object' && !Array.isArray(composer.draft)
    ? composer.draft as Record<string, unknown> : null;
  const draftVehicles = Array.isArray(draft?.vehicles) ? draft.vehicles as Record<string, unknown>[] : [];
  if (draft && draftVehicles.length) {
    draft.vehicles = draftVehicles.map(vehicle => String(vehicle.id) === oldId ? {
      ...vehicle, id: nextId, name: String(next.name || ''), license: String(next.license || ''),
      brand: String(next.brand || ''), type_text: typeLabel, color: String(next.color || ''), year: String(next.year || ''),
      stock_store_id: next.store_id == null ? vehicle.stock_store_id : String(next.store_id),
      stock_store_name: next.store_name == null ? vehicle.stock_store_name : String(next.store_name || ''),
    } : vehicle);
    payload.management_composer = { ...composer, draft };
  }
  if (orderItems.length || (draft && draftVehicles.length)) {
    await client.query('UPDATE himoto.orders SET draft_payload=$2::json,updated_at=now() WHERE id=$1',
      [item.order_id, JSON.stringify(payload)]);
  }

  return { item_id: input.item_id, order_id: Number(item.order_id), swap_id: Number(swap.rows[0].id),
    old_license: String(oldVehicle.rows[0]?.license || ''), new_license: String(next.license || '') };
}
