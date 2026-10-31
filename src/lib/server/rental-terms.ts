import 'server-only';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {canEditIssuedContract} from '@/lib/management/contract-profile';
import type {PermissionAccount} from '@/lib/management/permissions';
import type {RentalTermsInput,RentalTermsState} from '@/lib/management/rental-terms';
import {OWNERSHIP_CONTRACT_TYPES} from '@/lib/management/config';
import {EFFECTIVE_RENTAL_TYPE_SQL,VEHICLE_ORDER_SQL} from './contract-classification';
import {contractVehicleLabelSource} from './contract-vehicle-reads';
import {dailyPriceSql,depositLateral,rentalPaidSql} from './contract-deposits';

type Database=Pick<PoolClient,'query'>;
export class RentalTermsError extends Error {constructor(message:string,public status=400){super(message);}}
const local=(value:unknown)=>value?new Date(new Date(String(value)).getTime()+7*3600000).toISOString().slice(0,16):'';
const utc=(value:string)=>`${value}:00+07:00`;
function validDate(value:unknown):value is string {return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)&&Number.isFinite(Date.parse(utc(value)))&&local(utc(value))===value;}
export function parseRentalTerms(body:unknown):RentalTermsInput {
  if(!body||typeof body!=='object'||Array.isArray(body))throw new RentalTermsError('Nhập tiền / ngày thuê và lý do sửa.');
  const v=body as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['request_id','revision','item_id','item_revision','start_at','end_at','unit_price','total_amount','reason'].includes(k))||typeof v.request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.request_id)||typeof v.revision!=='string'||!/^\d{1,20}$/.test(v.revision)||!Number.isSafeInteger(v.item_id)||Number(v.item_id)<=0||typeof v.item_revision!=='string'||!/^\d{1,20}$/.test(v.item_revision)||!validDate(v.start_at)||!validDate(v.end_at)||Date.parse(utc(v.end_at))<=Date.parse(utc(v.start_at)))throw new RentalTermsError('Chọn đúng xe, phiên bản mới nhất và khoảng ngày thuê hợp lệ; ngày trả phải sau ngày thuê.');
  for(const key of ['unit_price','total_amount'])if(typeof v[key]!=='string'||!(key==='unit_price'&&v[key]==='')&&!/^(0|[1-9]\d{0,12})$/.test(v[key] as string))throw new RentalTermsError('Đơn giá và tiền thuê hợp đồng phải là số nguyên VNĐ từ 0 đến 9.999.999.999.999.');
  if(typeof v.reason!=='string'||!v.reason.trim()||v.reason.trim().length>500)throw new RentalTermsError('Nhập lý do sửa tiền / ngày thuê (tối đa 500 ký tự).');
  return {...v,request_id:v.request_id.toLowerCase(),reason:v.reason.trim()} as unknown as RentalTermsInput;
}
async function order(db:Database,id:number,user:PermissionAccount&{id:number},lock=false) {
  if(!Number.isSafeInteger(id)||id<=0)throw new RentalTermsError('Mã hợp đồng không hợp lệ.');
  const row=(await db.query(`SELECT o.*,o.xmin::text AS revision,${EFFECTIVE_RENTAL_TYPE_SQL} AS effective_type
    FROM himoto.orders o WHERE o.id=$1 AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}${lock?' FOR UPDATE OF o':''}`,[id])).rows[0];
  if(!row)throw new RentalTermsError('Không tìm thấy hợp đồng trong cơ sở được phân quyền.',404);
  if(!canEditIssuedContract(user,row.store_id))throw new RentalTermsError('Tài khoản chưa được cấp quyền sửa hợp đồng (tiền / ngày thuê).',403);
  if(['draft','cancelled'].includes(row.order_status))throw new RentalTermsError('Hợp đồng nháp cần sửa trong form lập hợp đồng; hợp đồng đã hủy không được sửa tiền / ngày thuê.',409);
  if(OWNERSHIP_CONTRACT_TYPES.has(row.effective_type)||row.draft_payload?.management_composer?.installment_plan)throw new RentalTermsError('Hợp đồng thuê sở hữu cần sửa trong mục thời hạn / lịch đóng tiền.',409);
  if(row.total===null||row.total===''||!Number.isSafeInteger(Number(row.total)))throw new RentalTermsError('Tiền hợp đồng chưa được đối chiếu; cần xác minh số gốc trước khi sửa.',409);
  return row;
}
export async function readRentalTerms(db:Database,id:number,user:PermissionAccount&{id:number}):Promise<RentalTermsState> {
  const o=await order(db,id,user);
  const items=(await db.query(`SELECT d.id,d.xmin::text AS revision,d.vehicle_id,v.license,d.rent_at,d.return_at,d.completed_at,${dailyPriceSql()} AS unit_price
    FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id LEFT JOIN ${contractVehicleLabelSource()} v ON v.id=d.vehicle_id
    WHERE d.order_id=$1 AND d.deleted_at IS NULL ORDER BY d.id`,[id])).rows;
  const paid=(await db.query(`SELECT ${rentalPaidSql()} AS paid FROM himoto.orders o ${depositLateral()} WHERE o.id=$1`,[id])).rows[0]?.paid;
  return {revision:o.revision,code:o.contract_number||o.draft_reference||`#${id}`,total_amount:Number(o.total),paid_amount:paid==null?null:Number(paid),items:items.map(d=>({id:Number(d.id),revision:d.revision,vehicle_id:Number(d.vehicle_id),license:d.license||'',start_at:local(d.rent_at),end_at:local(d.return_at),unit_price:d.unit_price==null?null:Number(d.unit_price),completed_at:d.completed_at?new Date(d.completed_at).toISOString():null}))};
}
export async function updateRentalTerms(db:Database,id:number,user:PermissionAccount&{id:number},body:unknown) {
  const input=parseRentalTerms(body);await db.query("SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='20s'");
  const o=await order(db,id,user,true),payload=structuredClone(o.draft_payload||{}),composer=payload.management_composer||{},history=Array.isArray(composer.rental_terms_history)?composer.rental_terms_history:[];
  const hash=createHash('sha256').update(JSON.stringify({actor:user.id,...input,revision:undefined,item_revision:undefined})).digest('hex');
  const previous=history.find((h:{request_id:string})=>h.request_id===input.request_id);
  if(previous){if(previous.hash!==hash)throw new RentalTermsError('Mã lần sửa đã dùng cho nội dung khác. Tải lại trước khi sửa tiếp.',409);return readRentalTerms(db,id,user);}
  if(o.revision!==input.revision)throw new RentalTermsError('Hợp đồng vừa thay đổi. Tải lại tiền / ngày thuê trước khi sửa.',409);
  const d=(await db.query('SELECT *,xmin::text AS revision FROM himoto.order_vehicle_details WHERE id=$1 AND order_id=$2 AND deleted_at IS NULL FOR UPDATE',[input.item_id,id])).rows[0];
  if(!d||d.revision!==input.item_revision)throw new RentalTermsError('Dòng xe vừa thay đổi hoặc không thuộc hợp đồng này. Tải lại để kiểm tra.',409);
  if(d.completed_at&&Date.parse(utc(input.start_at))>=new Date(d.completed_at).getTime())throw new RentalTermsError('Ngày thuê phải trước thời điểm thực tế đã trả xe.',409);
  const datesChanged=local(d.rent_at)!==input.start_at||local(d.return_at)!==input.end_at;
  if(datesChanged){
    let conflicts;
    try{
      conflicts=await db.query('SELECT vehicle_id FROM himoto.vehicle_history_conflict_ids($1::bigint[],$2,$3::timestamptz,$4::timestamptz)',[[Number(d.vehicle_id)],id,utc(input.start_at),d.completed_at||utc(input.end_at)]);
    }catch(cause){
      const message=cause instanceof Error?cause.message:'';
      if(/not authorized/i.test(message)||(cause&&typeof cause==='object'&&'code' in cause&&String((cause as {code?:unknown}).code)==='42501'))
        throw new RentalTermsError('Không kiểm tra được lịch xe trên cơ sở đang đăng nhập. Cần chạy SQL cập nhật hàm kiểm tra chồng lịch (sửa tiền/ngày thuê HĐ đang thuê).',403);
      throw cause;
    }
    if(conflicts.rowCount)throw new RentalTermsError('Khoảng thuê sau sửa chồng với lượt thuê khác của xe. Đối chiếu lịch xe trước khi lưu.',409);
  }
  const sending=await db.query("SELECT 1 FROM himoto.management_contract_notifications WHERE order_id=$1 AND status IN ('pending','sending','unknown') LIMIT 1",[id]);
  if(sending.rowCount)throw new RentalTermsError('Telegram đang gửi hoặc chưa xác định kết quả. Xử lý lượt gửi trước khi sửa tiền / ngày thuê.',409);
  const oldRate=payload.legacy_migration?d.substitute_unit_price:d.hiring_fee;
  const before={item_id:Number(d.id),start_at:local(d.rent_at),end_at:local(d.return_at),unit_price:oldRate==null?null:Number(oldRate),total_amount:Number(o.total)};
  const after={item_id:input.item_id,start_at:input.start_at,end_at:input.end_at,unit_price:input.unit_price===''?before.unit_price:Number(input.unit_price),total_amount:Number(input.total_amount)};
  if(JSON.stringify(before)===JSON.stringify(after))throw new RentalTermsError('Tiền và ngày thuê chưa thay đổi.');
  const amendedVersions:unknown[]=[],amendedReceipts:unknown[]=[];
  if(datesChanged){
    composer.versions=(Array.isArray(composer.versions)?composer.versions:[]).map((v:{kind:string;item_id:number;return_at:string;before_return_at:string;rent_at?:string})=>{
      if(v.kind!=='renewal'||Number(v.item_id)!==Number(d.id)||Date.parse(v.return_at)!==new Date(d.return_at).getTime())return v;
      if(Date.parse(utc(input.end_at))<=Date.parse(v.before_return_at))throw new RentalTermsError('Hẹn trả sau sửa phải sau mốc bắt đầu của lần gia hạn đã ghi. Đối chiếu lần gia hạn trước khi rút ngắn tiếp.',409);
      amendedVersions.push(structuredClone(v));return {...v,rent_at:utc(input.start_at),return_at:utc(input.end_at)};
    });
    const payments=(await db.query('SELECT transaction_id,renewal_payload FROM himoto.management_contract_payments WHERE order_id=$1 AND renewal_payload IS NOT NULL FOR UPDATE',[id])).rows;
    for(const receipt of payments){
      let changed=false;const renew=structuredClone(receipt.renewal_payload);
      const amend=(v:{item_id?:number;vehicle_id?:number;return_at:string;before_return_at?:string;rent_at?:string})=>{
        if((Number(v.item_id)!==Number(d.id)&&Number(v.vehicle_id)!==Number(d.vehicle_id))||Date.parse(v.return_at)!==new Date(d.return_at).getTime())return v;
        if(v.before_return_at&&Date.parse(utc(input.end_at))<=Date.parse(v.before_return_at))throw new RentalTermsError('Hẹn trả mới phải sau mốc bắt đầu kỳ gia hạn trên phiếu đã thu.',409);
        changed=true;return {...v,return_at:utc(input.end_at),...(v.rent_at?{rent_at:utc(input.start_at)}:{})};
      };
      const updated=Array.isArray(renew.items)?{...renew,items:renew.items.map(amend)}:amend(renew);
      if(!changed)continue;
      if(Array.isArray(updated.items))updated.return_at=new Date(Math.max(...updated.items.map((v:{return_at:string})=>Date.parse(v.return_at)))).toISOString();
      amendedReceipts.push({transaction_id:receipt.transaction_id,renewal_payload:receipt.renewal_payload});
      await db.query('UPDATE himoto.management_contract_payments SET renewal_payload=$3::jsonb WHERE order_id=$1 AND transaction_id=$2',[id,receipt.transaction_id,JSON.stringify(updated)]);
    }
  }
  await db.query(`UPDATE himoto.order_vehicle_details SET rent_at=$3::timestamptz,return_at=$4::timestamptz,
    hiring_fee=CASE WHEN $6::boolean OR $5::bigint IS NULL THEN hiring_fee ELSE $5::bigint END,
    substitute_unit_price=CASE WHEN $6::boolean AND $5::numeric IS NOT NULL THEN $5::numeric ELSE substitute_unit_price END,updated_at=now() WHERE id=$1 AND order_id=$2`,[d.id,id,utc(input.start_at),utc(input.end_at),input.unit_price===''?null:input.unit_price,Boolean(payload.legacy_migration)]);
  const span=(await db.query(`SELECT min(rent_at) AS start_at,COALESCE(max(return_at) FILTER(WHERE completed_at IS NULL),max(return_at)) AS end_at FROM himoto.order_vehicle_details WHERE order_id=$1 AND deleted_at IS NULL`,[id])).rows[0];
  const at=new Date().toISOString(),edit={request_id:input.request_id,hash,at,actor_id:user.id,reason:input.reason,before,after,original_contract_snapshot:o.contract_snapshot,renewal_versions_before:amendedVersions,payment_metadata_before:amendedReceipts};
  payload.management_composer={...composer,draft:{...composer.draft,start_date:local(span.start_at),end_date:local(span.end_at),total_amount:input.total_amount,...(d.type==='day'&&input.unit_price!==''?{unit_price:input.unit_price}:{})},rental_terms_history:[...history,edit]};
  await db.query(`UPDATE himoto.orders SET total=$2,total_rental_fees=CASE WHEN total_rental_fees IS NULL THEN NULL ELSE GREATEST(total_rental_fees+$3::numeric,0) END,
    rent_at=$4::timestamptz,return_at=$5::timestamptz,contract_snapshot=NULL,draft_payload=$6::json,updated_at=now() WHERE id=$1`,[id,input.total_amount,Number(input.total_amount)-Number(o.total),span.start_at,span.end_at,JSON.stringify(payload)]);
  return readRentalTerms(db,id,user);
}
