import 'server-only';
import type { PoolClient } from 'pg';
import { contractProfile } from '@/lib/management/contract-profile';
import { createContractDraft,emptyVehicle,dateTimeInput } from '@/lib/management/contract-document';
import { chargeTotal } from '@/lib/management/contract-charges';
import { rentalLineRate } from '@/lib/management/contract-pricing';
import { parseDraftEdits, DraftSaveError } from './contract-drafts';
import { ContractProfileError, updateContractProfile } from './contract-profile';
import { usesScopedDatabase } from './access-context';
import { contractVehicleReadSource } from './contract-vehicle-reads';
import { validIdentityIssueDate } from '@/lib/management/customer-identity';
import { createInstallmentPlan } from '@/lib/management/contract-billing';
import { CONTRACT_STATUSES, OWNERSHIP_CONTRACT_TYPES } from '@/lib/management/config';

type Database = Pick<PoolClient, 'query'>;
const timestamp = (value:string) => value ? `${value}:00+07:00` : null;
const validDate = (value:string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(timestamp(value)!)) && dateTimeInput(timestamp(value)) === value;

export function parseContractEdit(body:unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ContractProfileError('Thông tin hợp đồng chưa hợp lệ.');
  const input = body as Record<string,unknown>;
  if (Object.keys(input).some(key=>!['draft','revision','status','rental_type','notes'].includes(key))) throw new ContractProfileError('Phiên bản hợp đồng chưa hợp lệ.');
  if(typeof input.status!=='string'||input.status==='draft'||!CONTRACT_STATUSES.some(option=>option.value===input.status)) throw new ContractProfileError('Trạng thái hợp đồng chưa hợp lệ.');
  const defaults=createContractDraft({stores:[],staff:[],customers:[],contracts:[],vehicles:[]},'all');
  const raw=input.draft as typeof defaults;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new ContractProfileError('Thông tin hợp đồng chưa hợp lệ.');
  const normalized={...defaults,...raw,customer:{...defaults.customer,...raw.customer},relatives:raw.relatives||defaults.relatives,vehicles:raw.vehicles?.length?raw.vehicles:[emptyVehicle()]};
  for(const key of ['unit_price','deposit_amount','total_amount'] as const)if(normalized[key]==='')normalized[key]='0';
  let edits;
  try { edits = parseDraftEdits({...input,revision:undefined,draft:normalized,status:'draft'}); }
  catch (cause) { if(cause instanceof DraftSaveError)throw new ContractProfileError(cause.message,cause.status);throw cause; }
  const {draft} = edits;
  for (const key of ['deposit_amount','unit_price','total_amount'] as const) {
    if (!/^(0|[1-9]\d{0,12})$/.test(draft[key])) throw new ContractProfileError('Tiền cọc, đơn giá và tổng tiền phải là số nguyên VNĐ từ 0 đến 9.999.999.999.999.');
  }
  if (draft.start_date&&!validDate(draft.start_date) || draft.end_date&&!validDate(draft.end_date)) throw new ContractProfileError('Ngày trả phải sau ngày thuê và thời gian phải hợp lệ.');
  if (!['Theo ngày','Theo tuần','Theo tháng','Tùy chọn'].includes(draft.package_name)) throw new ContractProfileError('Gói thuê chưa hợp lệ.');
  if (!draft.store_id) throw new ContractProfileError('Chọn cơ sở trước khi lưu hợp đồng.');
  draft.vehicles=[...new Map(draft.vehicles.filter(line=>line.id).map(line=>[line.id,line])).values()];
  const ids = draft.vehicles.map(line=>Number(line.id));
  if (ids.some(id=>!Number.isSafeInteger(id)||id<=0) || new Set(ids).size!==ids.length) throw new ContractProfileError('Chọn xe cho từng dòng, không chọn trùng xe.');
  for(const line of draft.vehicles) {
    if (['borrow_hats','borrow_raincoats'].some(key=>!/^\d{0,2}$/.test(line[key as 'borrow_hats']))) throw new ContractProfileError('Số mũ và áo mưa phải từ 0 đến 99.');
    if(!validIdentityIssueDate(line.driver_license_issued_on)) throw new ContractProfileError('Ngày cấp GPLX của người lái chưa hợp lệ.');
  }
  const fees = chargeTotal(draft.extra_charges)!;
  return {...edits,status:input.status,revision:typeof input.revision==='string'&&/^\d{1,20}$/.test(input.revision)?input.revision:'0',fees,ids};
}

/** Caller owns the transaction: profile, rental lines, stock and totals commit together. */
export async function updateIssuedContract(db:Database,id:number,actor:number,body:unknown) {
  const input = parseContractEdit(body), {draft,ids} = input;
  // Corrections use the latest locked row and keep an audit without issuance prerequisites.
  await updateContractProfile(db,id,actor,{revision:input.revision,profile:contractProfile(draft),contract_number:draft.contract_number,notes:input.notes,status:input.status},{allowIncomplete:true,overwrite:true});
  const o = (await db.query('SELECT *,xmin::text AS revision FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0];
  const payload = structuredClone(o.draft_payload||{}), composer = payload.management_composer||{}, previous = composer.draft||{};
  const lines = (await db.query('SELECT * FROM himoto.order_vehicle_details WHERE order_id=$1 AND deleted_at IS NULL ORDER BY id FOR UPDATE',[id])).rows;
  const datesChanged = dateTimeInput(o.rent_at)!==draft.start_date || dateTimeInput(o.return_at)!==draft.end_date;
  const returnChanged = draft.backfill!==undefined && draft.backfill.returned_at!==previous.backfill?.returned_at;
  const removed = lines.filter(line=>!ids.includes(Number(line.vehicle_id)));
  const added = ids.filter(vehicle=>!lines.some(line=>Number(line.vehicle_id)===vehicle));
  const selected = (await db.query(`SELECT * FROM ${contractVehicleReadSource()} WHERE id=ANY($1::bigint[]) ORDER BY id`,[ids])).rows;
  if(selected.length!==ids.length) throw new ContractProfileError('Không tìm thấy xe đã chọn.',404);
  const historical = ['completed','cancelled','reserved','cancel_pending_settlement'].includes(String(o.order_status));
  // Serialize inventory changes with the same locks used by issuing contracts.
  const locked = usesScopedDatabase()
    ? (await db.query('SELECT * FROM himoto.lock_vehicles_for_contract($1::bigint[])',[ids])).rows
    : (await db.query('SELECT id,status FROM himoto.vehicles WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids])).rows;
  if(locked.length!==ids.length) throw new ContractProfileError('Xe đã chọn không còn tồn tại.',409);
  const active = !historical;
  const occupying = active && !['pending','deposit_contract'].includes(String(o.order_status));
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
        changed=true;return {...version,return_at:timestamp(draft.end_date),...(version.rent_at?{rent_at:timestamp(draft.start_date)}:{})};
      };
      const renewal=structuredClone(receipt.renewal_payload);
      const updated=Array.isArray(renewal.items)?{...renewal,items:renewal.items.map(amend)}:amend(renewal);
      if(!changed)continue;
      if(Array.isArray(updated.items)) {
        const ends=updated.items.map((item:{return_at:string|null})=>item.return_at?Date.parse(item.return_at):NaN).filter(Number.isFinite);
        updated.return_at=ends.length?new Date(Math.max(...ends)).toISOString():null;
      }
      amendedReceipts.push({transaction_id:receipt.transaction_id,renewal_payload:receipt.renewal_payload});
      await db.query('UPDATE himoto.management_contract_payments SET renewal_payload=$3::jsonb WHERE order_id=$1 AND transaction_id=$2',[id,receipt.transaction_id,JSON.stringify(updated)]);
    }
    composer.versions=(Array.isArray(composer.versions)?composer.versions:[]).map((version:Record<string,any>)=>{
      const line=lines.find(row=>Number(row.id)===Number(version.item_id));
      if(version.kind!=='renewal'||!line||!ids.includes(Number(line.vehicle_id))||Date.parse(version.return_at)!==new Date(line.return_at).getTime())return version;
      return {...version,return_at:timestamp(draft.end_date),rent_at:timestamp(draft.start_date)};
    });
  }
  if(composer.installment_plan && (datesChanged||previous.unit_price!==draft.unit_price||previous.package_name!==draft.package_name||JSON.stringify(previous.custom_installments)!==JSON.stringify(draft.custom_installments))) {
    const plan=createInstallmentPlan(draft.start_date,draft.end_date,draft.package_name,Number(draft.unit_price),draft.custom_installments);
    if(!plan)delete composer.installment_plan;
    if(plan)for(const key of ['stopped_at','paused_at'] as const) {
      const value=composer.installment_plan[key];
      if(value && (value<plan.start||value>plan.end))continue;
      if(value)plan[key]=value;
    }
    if(plan)composer.installment_plan=plan;
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
    total=$7,total_rental_fees=$8,first_deposit_amount=$9,additional_deposit_amount=0,contract_snapshot=NULL,draft_payload=$10::json,
    contract_authorization_date=NULLIF($11,'')::date,contract_collateral_description=$12,customer_source_url=$13,updated_at=now()
    WHERE id=$1 RETURNING xmin::text AS revision`,[id,Number(draft.store_id),draft.customer_id,input.rental_type,timestamp(draft.start_date),timestamp(draft.end_date),draft.total_amount,Math.max(Number(draft.total_amount)-input.fees,0),draft.deposit_amount,JSON.stringify(payload),draft.authorization_date,draft.collateral_description,draft.customer_source_url]);
  return {revision:String(updated.rows[0].revision),code:draft.contract_number.trim()};
}
