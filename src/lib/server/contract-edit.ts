import 'server-only';
import type { PoolClient } from 'pg';
import { contractProfile } from '@/lib/management/contract-profile';
import { dateTimeInput } from '@/lib/management/contract-document';
import { chargeTotal } from '@/lib/management/contract-charges';
import { rentalLineRate } from '@/lib/management/contract-pricing';
import { parseDraftEdits, DraftSaveError } from './contract-drafts';
import { ContractProfileError, updateContractProfile } from './contract-profile';
import { resolveDraftContractType, ContractTypeError } from './contract-types';
import { usesScopedDatabase } from './access-context';
import { contractVehicleReadSource } from './contract-vehicle-reads';
import { checkOwnershipVehicleStock } from './ownership-stock';
import { rentalStockError } from '@/lib/management/rental-stock';
import { validIdentityIssueDate } from '@/lib/management/customer-identity';
import { createInstallmentPlan } from '@/lib/management/contract-billing';
import { CONTRACT_STATUSES, OWNERSHIP_CONTRACT_TYPES } from '@/lib/management/config';
import { contractBackfillErrors } from '@/lib/management/contract-backfill';

type Database = Pick<PoolClient, 'query'>;
const timestamp = (value:string) => `${value}:00+07:00`;
const validDate = (value:string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(timestamp(value))) && dateTimeInput(timestamp(value)) === value;

export function parseContractEdit(body:unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ContractProfileError('Thông tin hợp đồng chưa hợp lệ.');
  const input = body as Record<string,unknown>;
  if (Object.keys(input).some(key=>!['draft','revision','status','rental_type','notes'].includes(key)) ||
      typeof input.revision !== 'string' || !/^\d{1,20}$/.test(input.revision)) throw new ContractProfileError('Phiên bản hợp đồng chưa hợp lệ.');
  if(typeof input.status!=='string'||input.status==='draft'||!CONTRACT_STATUSES.some(option=>option.value===input.status)) throw new ContractProfileError('Trạng thái hợp đồng chưa hợp lệ.');
  let edits;
  try { edits = parseDraftEdits({...input,status:'draft'}); }
  catch (cause) { if(cause instanceof DraftSaveError)throw new ContractProfileError(cause.message,cause.status);throw cause; }
  const {draft} = edits;
  for (const key of ['deposit_amount','unit_price','total_amount'] as const) {
    if (!/^(0|[1-9]\d{0,12})$/.test(draft[key])) throw new ContractProfileError('Tiền cọc, đơn giá và tổng tiền phải là số nguyên VNĐ từ 0 đến 9.999.999.999.999.');
  }
  if (!validDate(draft.start_date) || !validDate(draft.end_date) || draft.end_date<=draft.start_date) throw new ContractProfileError('Ngày trả phải sau ngày thuê và thời gian phải hợp lệ.');
  const backfillError=Object.values(contractBackfillErrors(draft.backfill,draft.start_date))[0];
  if(backfillError)throw new ContractProfileError(backfillError);
  if (!['Theo ngày','Theo tuần','Theo tháng','Tùy chọn'].includes(draft.package_name)) throw new ContractProfileError('Gói thuê chưa hợp lệ.');
  if (!draft.store_id) throw new ContractProfileError('Chọn cơ sở trước khi lưu hợp đồng.');
  const ids = draft.vehicles.map(line=>Number(line.id));
  if (ids.some(id=>!Number.isSafeInteger(id)||id<=0) || new Set(ids).size!==ids.length) throw new ContractProfileError('Chọn xe cho từng dòng, không chọn trùng xe.');
  for(const line of draft.vehicles) {
    if (['borrow_hats','borrow_raincoats'].some(key=>!/^\d{0,2}$/.test(line[key as 'borrow_hats']))) throw new ContractProfileError('Số mũ và áo mưa phải từ 0 đến 99.');
    if(!validIdentityIssueDate(line.driver_license_issued_on)) throw new ContractProfileError('Ngày cấp GPLX của người lái chưa hợp lệ.');
  }
  const fees = chargeTotal(draft.extra_charges)!;
  if (fees>Number(draft.total_amount)) throw new ContractProfileError('Tổng tiền thuê và phí phải lớn hơn hoặc bằng phí khác.');
  return {...edits,status:input.status,revision:input.revision,fees,ids};
}

/** Caller owns the transaction: profile, rental lines, stock and totals commit together. */
export async function updateIssuedContract(db:Database,id:number,actor:number,body:unknown) {
  const input = parseContractEdit(body), {draft,ids} = input;
  // Reuse the profile service's permissions, revision check, customer validation and audit.
  await updateContractProfile(db,id,actor,{revision:input.revision,profile:contractProfile(draft),contract_number:draft.contract_number,notes:input.notes,status:input.status});
  const o = (await db.query('SELECT *,xmin::text AS revision FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0];
  const payload = structuredClone(o.draft_payload||{}), composer = payload.management_composer||{}, previous = composer.draft||{};
  if (!(await db.query('SELECT id FROM himoto.stores WHERE id=$1',[draft.store_id])).rowCount) throw new ContractProfileError('Cơ sở ngoài phạm vi được phân quyền.',403);
  if (draft.customer_id && !(await db.query('SELECT id FROM himoto.customers WHERE id=$1 AND deleted_at IS NULL',[draft.customer_id])).rowCount) throw new ContractProfileError('Không tìm thấy khách hàng trong phạm vi tài khoản.',404);
  try { await resolveDraftContractType(db,draft,input.rental_type,previous); }
  catch(cause) { if(cause instanceof ContractTypeError)throw new ContractProfileError(cause.message,cause.status);throw cause; }
  const lines = (await db.query('SELECT * FROM himoto.order_vehicle_details WHERE order_id=$1 AND deleted_at IS NULL ORDER BY id FOR UPDATE',[id])).rows;
  const datesChanged = dateTimeInput(o.rent_at)!==draft.start_date || dateTimeInput(o.return_at)!==draft.end_date;
  const returnChanged = draft.backfill!==undefined && draft.backfill.returned_at!==previous.backfill?.returned_at;
  const removed = lines.filter(line=>!ids.includes(Number(line.vehicle_id)));
  const added = ids.filter(vehicle=>!lines.some(line=>Number(line.vehicle_id)===vehicle));
  const selected = (await db.query(`SELECT * FROM ${contractVehicleReadSource()} WHERE id=ANY($1::bigint[]) ORDER BY id`,[ids])).rows;
  if(selected.length!==ids.length) throw new ContractProfileError('Không tìm thấy xe đã chọn.',404);
  const validateStock = String(o.store_id)!==draft.store_id || composer.rental_type!==input.rental_type ? selected : selected.filter(row=>added.includes(Number(row.id)));
  const historical = ['completed','cancelled','reserved','cancel_pending_settlement'].includes(String(o.order_status));
  const stockError = await checkOwnershipVehicleStock(db,input.rental_type,validateStock,historical);
  const branchError = rentalStockError(input.rental_type,draft.store_id,validateStock,historical);
  if(stockError||branchError) throw new ContractProfileError(stockError||branchError,409);
  // Serialize inventory changes with the same locks used by issuing contracts.
  const locked = usesScopedDatabase()
    ? (await db.query('SELECT * FROM himoto.lock_vehicles_for_contract($1::bigint[])',[ids])).rows
    : (await db.query('SELECT id,status FROM himoto.vehicles WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids])).rows;
  if(locked.length!==ids.length) throw new ContractProfileError('Xe đã chọn không còn tồn tại.',409);
  const active = !historical;
  const occupying = active && !['pending','deposit_contract'].includes(String(o.order_status));
  for(const vehicle of locked.filter(row=>added.includes(Number(row.id)))) {
    if(occupying && String(vehicle.status)!=='ready') throw new ContractProfileError('Xe mới phải đang Lưu kho trước khi thêm vào hợp đồng.',409);
  }
  if(datesChanged||added.length||returnChanged) {
    const conflicts = await db.query('SELECT * FROM himoto.vehicle_window_conflicts($1::bigint[],$2,$3::timestamptz,$4::timestamptz)',[ids,id,timestamp(draft.start_date),timestamp(draft.end_date)]);
    if(conflicts.rowCount) throw new ContractProfileError('Lịch thuê sau sửa chồng với hợp đồng khác của xe.',409);
  }
  if((await db.query("SELECT 1 FROM himoto.management_contract_notifications WHERE order_id=$1 AND status IN ('pending','sending','unknown') LIMIT 1",[id])).rowCount) throw new ContractProfileError('Telegram đang gửi hoặc chưa xác định kết quả. Xử lý lượt gửi trước khi lưu hợp đồng.',409);
  const packageType = draft.package_name==='Theo tháng'?'month':draft.package_name==='Theo tuần'?'week':'day';
  const before = {store_id:o.store_id,customer_id:o.customer_id,total:o.total,deposit:o.first_deposit_amount,additional_deposit:o.additional_deposit_amount,rent_at:o.rent_at,return_at:o.return_at,lines,draft:previous,approval:composer.approval,installment_plan:composer.installment_plan,versions:structuredClone(composer.versions),contract_snapshot:o.contract_snapshot};
  delete composer.approval;
  const amendedReceipts:unknown[]=[];
  if(datesChanged) {
    const payments = (await db.query('SELECT transaction_id,renewal_payload FROM himoto.management_contract_payments WHERE order_id=$1 AND renewal_payload IS NOT NULL FOR UPDATE',[id])).rows;
    for(const receipt of payments) {
      let changed=false;
      const amend=(version:Record<string,any>)=>{
        const line=lines.find(row=>Number(row.id)===Number(version.item_id)||Number(row.vehicle_id)===Number(version.vehicle_id));
        if(!line||!ids.includes(Number(line.vehicle_id))||!version.return_at||Date.parse(version.return_at)!==new Date(line.return_at).getTime())return version;
        if(version.before_return_at&&Date.parse(timestamp(draft.end_date))<=Date.parse(version.before_return_at))throw new ContractProfileError('Ngày trả mới phải sau mốc bắt đầu kỳ gia hạn đã thu.',409);
        changed=true;return {...version,return_at:timestamp(draft.end_date),...(version.rent_at?{rent_at:timestamp(draft.start_date)}:{})};
      };
      const renewal=structuredClone(receipt.renewal_payload);
      const updated=Array.isArray(renewal.items)?{...renewal,items:renewal.items.map(amend)}:amend(renewal);
      if(!changed)continue;
      if(Array.isArray(updated.items))updated.return_at=new Date(Math.max(...updated.items.map((item:{return_at:string})=>Date.parse(item.return_at)))).toISOString();
      amendedReceipts.push({transaction_id:receipt.transaction_id,renewal_payload:receipt.renewal_payload});
      await db.query('UPDATE himoto.management_contract_payments SET renewal_payload=$3::jsonb WHERE order_id=$1 AND transaction_id=$2',[id,receipt.transaction_id,JSON.stringify(updated)]);
    }
    composer.versions=(Array.isArray(composer.versions)?composer.versions:[]).map((version:Record<string,any>)=>{
      const line=lines.find(row=>Number(row.id)===Number(version.item_id));
      if(version.kind!=='renewal'||!line||!ids.includes(Number(line.vehicle_id))||Date.parse(version.return_at)!==new Date(line.return_at).getTime())return version;
      if(version.before_return_at&&Date.parse(timestamp(draft.end_date))<=Date.parse(version.before_return_at))throw new ContractProfileError('Ngày trả mới phải sau mốc bắt đầu của lần gia hạn.',409);
      return {...version,return_at:timestamp(draft.end_date),rent_at:timestamp(draft.start_date)};
    });
  }
  if(composer.installment_plan && (datesChanged||previous.unit_price!==draft.unit_price||previous.package_name!==draft.package_name||JSON.stringify(previous.custom_installments)!==JSON.stringify(draft.custom_installments))) {
    const plan=createInstallmentPlan(draft.start_date,draft.end_date,draft.package_name,Number(draft.unit_price),draft.custom_installments);
    if(!plan)throw new ContractProfileError('Thời gian, mức đóng hoặc lịch đóng tiền chưa hợp lệ. Kiểm tra trước khi lưu.',409);
    for(const key of ['stopped_at','paused_at'] as const) {
      const value=composer.installment_plan[key];
      if(value && (value<plan.start||value>plan.end))throw new ContractProfileError('Thời gian mới không bao gồm mốc dừng / bảo lưu đã ghi nhận.',409);
      if(value)plan[key]=value;
    }
    composer.installment_plan=plan;
  }
  if(!OWNERSHIP_CONTRACT_TYPES.has(input.rental_type))delete composer.installment_plan;
  if(composer.ownership_terms && (previous.unit_price!==draft.unit_price||previous.package_name!==draft.package_name)) {
    composer.ownership_terms={...composer.ownership_terms,daily_amount:draft.package_name==='Theo ngày'?Number(draft.unit_price):null};
  }
  // Removed lines stay in the audit history; release stock before retiring the line.
  for(const line of removed) {
    if(!line.completed_at) await db.query('UPDATE himoto.order_vehicle_details SET completed_at=now(),updated_at=now() WHERE id=$1',[line.id]);
    if(usesScopedDatabase()) await db.query('SELECT himoto.release_returned_contract_vehicle($1)',[line.id]);
    await db.query('UPDATE himoto.order_vehicle_details SET deleted_at=now(),updated_at=now() WHERE id=$1',[line.id]);
  }
  for(const [index,line] of draft.vehicles.entries()) {
    const matches = lines.filter(row=>Number(row.vehicle_id)===Number(line.id));
    const current = matches.find(row=>!row.completed_at)||matches[matches.length-1];
    const start = datesChanged||!current?timestamp(draft.start_date):current.rent_at;
    const end = datesChanged||!current?timestamp(draft.end_date):current.return_at;
    if(current?.completed_at && new Date(start).getTime()>=new Date(current.completed_at).getTime()) throw new ContractProfileError('Ngày thuê phải trước thời điểm thực tế trả xe.',409);
    const rate = rentalLineRate(Number(draft.unit_price),ids.length,index);
    const values = [Number(line.id),id,start,end,index===0?Number(draft.total_amount):0,rate,packageType,line.driver_name||null,line.driver_license_number||null,line.driver_license_issued_on||null,Number(line.borrow_hats||0),Number(line.borrow_raincoats||0)];
    if(current) {
      await db.query(`UPDATE himoto.order_vehicle_details SET rent_at=$3,return_at=$4,total_money=$5,hiring_fee=$6::numeric,type=$7,
        driver_name=$8,driver_license_number=$9,driver_license_issued_on=$10::date,borrow_hats=$11,borrow_raincoats=$12,
        substitute_unit_price=CASE WHEN $14::boolean THEN $6::numeric ELSE substitute_unit_price END,updated_at=now() WHERE id=$13 AND order_id=$2 AND vehicle_id=$1::bigint`,[...values,current.id,Boolean(payload.legacy_migration)]);
    } else {
      await db.query(`INSERT INTO himoto.order_vehicle_details(vehicle_id,order_id,rent_at,return_at,total_money,hiring_fee,type,driver_name,driver_license_number,
        driver_license_issued_on,borrow_hats,borrow_raincoats,price_id,status,handler_price,total_renewal_amount,completed_at,substitute_unit_price,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11,$12,0,1,0,0,$13::timestamptz,$14::numeric,now(),now())`,[...values,active?null:timestamp(draft.end_date),payload.legacy_migration?rate:null]);
    }
  }
  if(returnChanged) {
    await db.query('UPDATE himoto.order_vehicle_details SET completed_at=$2::timestamptz,updated_at=now() WHERE order_id=$1 AND deleted_at IS NULL',[id,draft.backfill?.returned_at?timestamp(draft.backfill.returned_at):null]);
    if(draft.backfill?.returned_at) {
      if(usesScopedDatabase()) {
        const returned=(await db.query('SELECT id FROM himoto.order_vehicle_details WHERE order_id=$1 AND deleted_at IS NULL',[id])).rows;
        for(const line of returned)await db.query('SELECT himoto.release_returned_contract_vehicle($1)',[line.id]);
      } else await db.query(`UPDATE himoto.vehicles v SET status='ready',updated_at=now() WHERE id=ANY($1::bigint[]) AND status IN('using','rent','bad_debt')
        AND NOT EXISTS(SELECT 1 FROM himoto.order_vehicle_details d WHERE d.vehicle_id=v.id AND d.completed_at IS NULL AND d.deleted_at IS NULL)`,[ids]);
    }
  }
  if(occupying && added.length) {
    if(usesScopedDatabase()) await db.query('SELECT himoto.mark_vehicles_using($1::bigint[])',[added]);
    else await db.query("UPDATE himoto.vehicles SET status='using',updated_at=now() WHERE id=ANY($1::bigint[])",[added]);
  }
  if(!usesScopedDatabase() && removed.length) await db.query(`UPDATE himoto.vehicles v SET status='ready',updated_at=now()
    WHERE id=ANY($1::bigint[]) AND status IN('using','rent','bad_debt') AND NOT EXISTS(
      SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
      WHERE d.vehicle_id=v.id AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
        AND o.order_status IN('renting','overdue','wait_payment','pending','bad_debt'))`,[removed.map(line=>Number(line.vehicle_id))]);
  // Receipt amounts are ledger data, never overwritten by values from an open form.
  const nextDraft = {...previous,...draft,paid_amount:previous.paid_amount,deposit_paid_amount:previous.deposit_paid_amount,collections:previous.collections};
  payload.management_composer = {...composer,draft:nextDraft,rental_type:input.rental_type,
    full_contract_edits:[...(Array.isArray(composer.full_contract_edits)?composer.full_contract_edits:[]),{at:new Date().toISOString(),actor_id:actor,before,renewal_payment_metadata_before:amendedReceipts,after:{draft:nextDraft,status:input.status,rental_type:input.rental_type}}]};
  const updated = await db.query(`UPDATE himoto.orders SET store_id=$2,customer_id=$3,order_type=$4,rent_at=$5,return_at=$6,
    total=$7,total_rental_fees=$8,first_deposit_amount=$9,additional_deposit_amount=0,contract_snapshot=NULL,draft_payload=$10::json,updated_at=now()
    WHERE id=$1 RETURNING xmin::text AS revision`,[id,Number(draft.store_id),draft.customer_id,input.rental_type,timestamp(draft.start_date),timestamp(draft.end_date),draft.total_amount,Number(draft.total_amount)-input.fees,draft.deposit_amount,JSON.stringify(payload)]);
  return {revision:String(updated.rows[0].revision),code:draft.contract_number.trim()};
}
