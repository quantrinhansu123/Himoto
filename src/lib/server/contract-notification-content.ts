import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { ContractEventType } from '@/lib/management/contract-telegram';
import { contractPhotoSlots,contractDocumentSlots,CONTRACT_CUSTOMER_PHOTO_SLOTS,type ContractPhotoPhase } from '@/lib/management/contract-photos';

export interface Attachment {slot:string;mime_type:string;bytes:string|null;cloudinary_public_id:string|null;cloudinary_cloud_name:string|null;cloudinary_version:number|null}
export interface RenewalNotice {version?:number;amount:number;before_return_at:string|null;return_at:string;license:string;vehicle_name:string;transaction_id?:number;items?:RenewalNotice[]}
export interface NotificationPayload {
  code:string;customer:string;phone:string;store:string;actor:string;vehicles:string;total:string;at:string;photos:Attachment[];
  vehicle_names?:string;days?:number|null;deposit?:number|null;rental_fee?:number|null;grand_total?:number|null;
  refunded?:number;method?:string;deposit_method?:string;renewal?:RenewalNotice;
}
type Database=Pick<PoolClient,'query'>;
const money=(value:unknown)=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?'Chưa đối chiếu':Number(value).toLocaleString('vi-VN');
const day=(value:string|null)=>value?new Date(value).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric'}):'Chưa đối chiếu';
export function contractNotificationText(kind:ContractEventType,p:NotificationPayload) {
  const method=p.method||'Chưa ghi nhận thanh toán';
  const vehicle=[`Bsx: ${p.renewal?.license||p.vehicles||'—'}`,`Loại xe: ${p.renewal?.vehicle_name||p.vehicle_names||'—'}`];
  const lines=kind==='return'?[`Khách trả xe: ${p.customer}`,...vehicle,`Tiền cọc: ${money(p.deposit)}`,`Tổng hoàn: ${money(p.refunded)}`,`Hình thức thanh toán: ${p.method||'Chưa ghi nhận phiếu hoàn'}`]
    :kind==='renewal'?[`Khách gia hạn: ${p.customer}`,...vehicle,
      ...(p.renewal?.items?.length?p.renewal.items.map(item=>`Gia hạn ${item.license}: ${day(item.before_return_at)} - ${day(item.return_at)}`):[`Gia hạn: ${day(p.renewal?.before_return_at||null)} - ${day(p.renewal?.return_at||null)}`]),
      `Phí gia hạn: ${money(p.renewal?.amount)} đ`,`Hình thức thanh toán: ${method}`]
    :[`${kind==='reservation'?'Khách đặt cọc giữ xe':kind==='handover'?'Khách nhận xe':'Khách thuê xe'}: ${p.customer}`,...vehicle,
      `Tiền thuê xe: ${money(p.rental_fee??p.total)}`,`Số ngày thuê: ${p.days??'Chưa đối chiếu'}`,`Tiền cọc: ${money(p.deposit)}`,
      ...(p.rental_fee!=null&&p.total!=null&&Number(p.total)!==p.rental_fee?[`Phí khác / điều chỉnh: ${money(Number(p.total)-p.rental_fee)}`]:[]),
      `Tổng tiền: ${money(p.grand_total)}`,`Hình thức thanh toán: ${method}`,
      ...(p.deposit_method&&p.deposit_method!==p.method?[`Hình thức thanh toán cọc: ${p.deposit_method}`]:[])];
  return [...lines,`Cơ sở: ${p.store}`,`Hợp đồng: ${p.code}`,`Người thực hiện: ${p.actor}`,`Thời gian: ${new Date(p.at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}`].join('\n').slice(0,4000);
}
export function notificationHash(kind:ContractEventType,p:NotificationPayload) {
  // Delivery timestamps and the operator clicking Send do not make identical content a new message.
  const {at: _at,actor: _actor,...content}=p;
  void _at;void _actor;
  const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
  return createHash('sha256').update(JSON.stringify(canonical({kind,...content}))).digest('hex');
}
export async function notificationPhotos(db:Database,orderId:number,phases:string[]):Promise<Attachment[]> {
  const slots=[...new Set(phases.flatMap(phase=>[...contractPhotoSlots(phase as ContractPhotoPhase),...contractDocumentSlots(phase as ContractPhotoPhase),...(phase==='rental'?[...CONTRACT_CUSTOMER_PHOTO_SLOTS,{key:'driver-license'}]:[])].map(slot=>slot.key)))];
  const result=await db.query(`SELECT slot,mime_type,encode(data,'base64') AS bytes,cloudinary_public_id,cloudinary_cloud_name,cloudinary_version
    FROM himoto.management_record_photos WHERE entity_type='contracts' AND entity_id=$1 AND slot=ANY($2::text[]) ORDER BY slot`,
    [orderId,slots]);
  const photos=result.rows.sort((a,b)=>slots.indexOf(a.slot)-slots.indexOf(b.slot)) as Attachment[];
  const licence=photos.find(photo=>photo.slot==='driver-license');
  // A licence captured again in the composer may reuse the profile upload.
  return photos.filter(photo=>!(licence&&photo.slot==='customer-driver-license'&&(photo.cloudinary_public_id?photo.cloudinary_public_id===licence.cloudinary_public_id&&photo.cloudinary_version===licence.cloudinary_version:photo.bytes&&photo.bytes===licence.bytes)));
}
export async function notificationPayload(db:Database,orderId:number,kind:ContractEventType,actorId:number,phases:string[],renewal?:RenewalNotice):Promise<NotificationPayload&{store_id:number}> {
  const returnIds=kind==='return'?phases.map(phase=>phase.match(/^return-([1-9]\d*)$/)?.[1]).filter(Boolean):[];
  const o=(await db.query(`SELECT o.store_id,COALESCE(NULLIF(o.contract_number,''),o.draft_reference,'#'||o.id::text) AS code,
    COALESCE(NULLIF(c.name,''),o.customer_name,'') AS customer,COALESCE(NULLIF(c.phone,''),o.customer_phone,'') AS phone,
    s.store_name AS store,u.name AS actor,o.total::text,o.total_rental_fees,o.first_deposit_amount,o.additional_deposit_amount,o.rent_at,o.return_at,o.draft_payload,
    (SELECT string_agg(DISTINCT COALESCE(NULLIF(v.license,''),v.name),', ') FROM himoto.order_vehicle_details d JOIN himoto.vehicles v ON v.id=d.vehicle_id WHERE d.order_id=o.id AND d.deleted_at IS NULL AND ($3::bigint[] IS NULL OR d.id=ANY($3))) AS vehicles,
    (SELECT string_agg(DISTINCT v.name,', ') FROM himoto.order_vehicle_details d JOIN himoto.vehicles v ON v.id=d.vehicle_id WHERE d.order_id=o.id AND d.deleted_at IS NULL AND ($3::bigint[] IS NULL OR d.id=ANY($3))) AS vehicle_names
    FROM himoto.orders o LEFT JOIN himoto.customers c ON c.id=o.customer_id LEFT JOIN himoto.stores s ON s.id=o.store_id LEFT JOIN himoto.users u ON u.id=$2
    WHERE o.id=$1 AND o.deleted_at IS NULL`,[orderId,actorId,returnIds.length?returnIds:null])).rows[0];
  if(!o)throw Error('Không tạo được thông báo hợp đồng.');
  const tx=(await db.query(`SELECT t.id,t.name,t.type,t.value,t.created_at,t.order_item_id,r.renewal_payload,
    CASE WHEN t.cash_id IS NOT NULL THEN 'Tiền mặt' WHEN t.bank_owner_type='company' THEN 'CK TK công ty'
      WHEN t.bank_owner_type='personal' THEN 'CK TK cá nhân' WHEN t.bank_id IS NOT NULL OR t.payment_method=2 THEN 'Chuyển khoản (chưa phân loại TK)' ELSE 'Chưa xác định' END AS method
    FROM himoto.transactions t LEFT JOIN himoto.management_contract_payments r ON r.transaction_id=t.id WHERE t.order_id=$1 AND t.status='approved' ORDER BY t.created_at,t.id`,[orderId])).rows;
  const draft=o.draft_payload?.management_composer?.draft;
  const depositTx=tx.filter(t=>['in','addon'].includes(t.type)&&/^order:deposit(?::|$)/.test(t.name));
  const refunds=tx.filter(t=>t.type==='out'&&/^(order:deposit_refund$|order:complete:)/.test(t.name));
  const rental=tx.filter(t=>['in','addon'].includes(t.type)&&!/^order:deposit(?::|$)/.test(t.name));
  // Date changes are not receipts. Only an explicitly associated renewal receipt supplies a payment method.
  const renewalTx=renewal?tx.filter(t=>Number(t.id)===renewal.transaction_id || t.renewal_payload && (
    t.renewal_payload.return_at===renewal.return_at && t.renewal_payload.license===renewal.license)):[];
  const selected=kind==='return'?refunds:kind==='renewal'?renewalTx:rental;
  const methods=(rows:typeof tx)=>[...new Set(rows.map(t=>String(t.method)))].sort().join(', ');
  const fee=o.total_rental_fees==null?null:Number(o.total_rental_fees);
  const deposit=o.first_deposit_amount==null&&o.additional_deposit_amount==null?null:Number(o.first_deposit_amount||0)+Number(o.additional_deposit_amount||0);
  const rentalFee=fee??(o.total==null?null:Number(o.total));
  const start=draft?.start_date?`${draft.start_date}:00+07:00`:o.rent_at;
  const end=draft?.end_date?`${draft.end_date}:00+07:00`:o.return_at;
  const duration=start&&end?Math.ceil((new Date(end).getTime()-new Date(start).getTime())/86400000):NaN;
  const effectiveDeposit=kind==='return'?depositTx.reduce((sum,t)=>sum+Number(t.value),0):deposit;
  return {store_id:Number(o.store_id),code:o.code,customer:o.customer,phone:o.phone,store:o.store,actor:o.actor,vehicles:o.vehicles||'',vehicle_names:o.vehicle_names||'',total:o.total,
    at:new Date().toISOString(),photos:await notificationPhotos(db,orderId,phases),days:Number.isFinite(duration)&&duration>0?duration:null,
    deposit:effectiveDeposit,rental_fee:rentalFee,grand_total:o.total==null||deposit===null?null:Number(o.total)+deposit,
    refunded:refunds.reduce((sum,t)=>sum+Number(t.value),0),method:methods(selected),deposit_method:methods(depositTx),...(renewal?{renewal}:{})};
}
