import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { ContractEventType } from '@/lib/management/contract-telegram';
import { CONTRACT_CUSTOMER_PHOTO_SLOTS,isContractTransactionPhoto } from '@/lib/management/contract-photos';
import { OWNERSHIP_ORDER_SQL } from './contract-telegram-routing';

export interface Attachment {slot:string;mime_type:string;bytes:string|null;cloudinary_public_id:string|null;cloudinary_cloud_name:string|null;cloudinary_version:number|null}
export interface RenewalNotice {version?:number;amount:number;before_return_at:string|null;return_at:string;license:string;vehicle_name:string;transaction_id?:number;items?:RenewalNotice[]}
export interface NotificationPayload {
  code:string;customer:string;phone:string;store:string;actor:string;vehicles:string;total:string;at:string;photos:Attachment[];contract_staff?:string;
  vehicle_names?:string;days?:number|null;deposit?:number|null;rental_fee?:number|null;grand_total?:number|null;
  refunded?:number;method?:string;deposit_method?:string;renewal?:RenewalNotice;
  ownership_renewal_note?:string;
  return_fees?:{late:number;repair:number;early_discount:number;collected:number;method:string;returned_at?:string};
  refund_recipient?:{bank?:string;account?:string;name?:string};
  refund_pending?:{amount:number;bank?:string;account?:string;name?:string};
  battery_swap?:{percentage:number;fee:number;collected:number;license:string;vehicle_name:string};
  transfer?:{from:string;to:string;note:string;received:boolean};
}
type Database=Pick<PoolClient,'query'>;
const money=(value:unknown)=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?'Chưa đối chiếu':Number(value).toLocaleString('vi-VN');
const day=(value:string|null)=>value?new Date(value).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric'}):'Chưa đối chiếu';
export function contractNotificationText(kind:ContractEventType|'vehicle_transfer'|'vehicle_receive',p:NotificationPayload) {
  if(kind==='vehicle_transfer'||kind==='vehicle_receive')return [kind==='vehicle_receive'?'ĐÃ NHẬN XE SỞ HỮU':'ĐIỀU CHUYỂN XE SỞ HỮU',`Bsx: ${p.vehicles}`,`Loại xe: ${p.vehicle_names||'—'}`,`Cơ sở chuyển đi: ${p.transfer?.from||'—'}`,`Cơ sở nhận: ${p.transfer?.to||'—'}`,`Trạng thái: ${kind==='vehicle_receive'?'Đã nhận · Lưu kho':'Chờ cơ sở đích xác nhận nhận xe'}`,`Người thực hiện: ${p.actor}`,`Mã lượt: ${p.code}`,...(p.transfer?.note?[`Ghi chú: ${p.transfer.note}`]:[]),`Thời gian: ${new Date(p.at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}`].join('\n').slice(0,4000);
  const method=p.method||'Chưa ghi nhận thanh toán';
  const vehicle=[`Bsx: ${p.renewal?.license||p.vehicles||'—'}`,`Loại xe: ${p.renewal?.vehicle_name||p.vehicle_names||'—'}`];
  const refundedAmount=Number(p.refunded||0);
  const depositAmount=Number(p.deposit||0);
  const pendingRecipient=[p.refund_pending?.bank,p.refund_pending?.account,p.refund_pending?.name].filter(Boolean).join(' · ')
    ||((p.photos||[]).some(photo=>/^return-[1-9]\d*-document-[1-9]\d*$/.test(photo.slot))?'Theo ảnh QR / hồ sơ đính kèm':'Chưa có QR/STK — cần bổ sung trước khi hoàn');
  const lines=kind==='battery_swap'?[`Khách đổi pin: ${p.customer}`,`Bsx: ${p.battery_swap?.license||p.vehicles}`,`Loại xe: ${p.battery_swap?.vehicle_name||p.vehicle_names||'—'}`,`Pin lúc nhận: ${p.battery_swap?.percentage??'—'}%`,`Phí pin dưới 20%: ${money(p.battery_swap?.fee)}`,`Đã thu: ${money(p.battery_swap?.collected)}`,`Hình thức thu: ${method}`]:kind==='return'?[`Khách trả xe: ${p.customer}`,...vehicle,
    ...(p.return_fees?[...(p.return_fees.returned_at?[`Bàn giao thực tế: ${new Date(p.return_fees.returned_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}`]:[]),`Phí quá hạn: ${money(p.return_fees.late)}`,`Phí sửa chữa: ${money(p.return_fees.repair)}`,...(p.return_fees.early_discount?[`Giảm tiền thuê trả sớm: ${money(p.return_fees.early_discount)}`]:[]),`Đã thu phí / công nợ: ${money(p.return_fees.collected)}`,...(p.return_fees.method?[`Hình thức thu: ${p.return_fees.method}`]:[])]:[]),
    `Tiền cọc: ${money(p.deposit)}`,
    ...(p.deposit_method?[`Hình thức thu cọc: ${p.deposit_method}`]:[]),
    `Tổng hoàn cọc: ${money(p.refunded)}`,
    ...(refundedAmount>0
      ?[`Hình thức hoàn cọc: ${p.method||'Chưa xác định'}`]
      :!p.refund_pending&&depositAmount>0
        ?['Hoàn cọc: chưa ghi nhận phiếu hoàn — tick «Đã hoàn cọc» khi trả xe hoặc ghi phiếu chi sổ quỹ']
        :[]),
    ...(p.refund_pending?[`Chờ kế toán hoàn cọc: ${money(p.refund_pending.amount)}`,`Thông tin nhận hoàn: ${pendingRecipient}`]:[]),
    ...(!p.refund_pending&&p.refund_recipient?.account?[`Khách nhận hoàn: ${[p.refund_recipient.bank,p.refund_recipient.account,p.refund_recipient.name].filter(Boolean).join(' · ')}`]:[])]
    :kind==='renewal'?[`Khách gia hạn: ${p.customer}`,...vehicle,
      ...(p.renewal?.items?.length?p.renewal.items.map(item=>`Gia hạn ${item.license}: ${day(item.before_return_at)} - ${day(item.return_at)}`):[`Gia hạn: ${day(p.renewal?.before_return_at||null)} - ${day(p.renewal?.return_at||null)}`]),
      `Phí gia hạn: ${money(p.renewal?.amount)} đ`,`Hình thức thanh toán: ${method}`,
      ...(p.ownership_renewal_note?[`Ghi chú: ${p.ownership_renewal_note}`]:[])]
    :[`${kind==='reservation'?'Khách đặt cọc giữ xe':kind==='handover'?'Khách nhận xe':'Khách thuê xe'}: ${p.customer}`,...vehicle,
      `Tiền thuê xe: ${money(p.rental_fee??p.total)}`,`Số ngày thuê: ${p.days??'Chưa đối chiếu'}`,`Tiền cọc: ${money(p.deposit)}`,
      ...(p.rental_fee!=null&&p.total!=null&&Number(p.total)!==p.rental_fee?[`Phí khác / điều chỉnh: ${money(Number(p.total)-p.rental_fee)}`]:[]),
      `Tổng tiền: ${money(p.grand_total)}`,`Hình thức thanh toán: ${method}`];
  return [...lines,`Cơ sở: ${p.store}`,`Hợp đồng: ${p.code}`,`Nhân viên làm hợp đồng: ${p.contract_staff||'Chưa ghi nhận'}`,...(!['rental','reservation'].includes(kind)?[`Người thực hiện: ${p.actor}`]:[]),`Thời gian: ${new Date(p.at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}`].join('\n').slice(0,4000);
}
export function notificationHash(kind:ContractEventType,p:NotificationPayload) {
  // Delivery timestamps and the operator clicking Send do not make identical content a new message.
  const {at: _at,actor: _actor,...content}=p;
  void _at;void _actor;
  const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
  return createHash('sha256').update(JSON.stringify(canonical({kind,...content}))).digest('hex');
}
export async function notificationPhotos(db:Database,orderId:number,phases:string[]):Promise<Attachment[]> {
  // Queue only slot / Cloudinary refs. Embedding multi-MB base64 blobs here made finalize roll back
  // under statement_timeout when staff attached hồ sơ photos. Dispatch reloads bytes by slot.
  const result=await db.query(`SELECT slot,mime_type,NULL::text AS bytes,cloudinary_public_id,cloudinary_cloud_name,cloudinary_version
    FROM himoto.management_record_photos WHERE entity_type='contracts' AND entity_id=$1 AND
      (slot ~ ANY($2::text[]) OR ($3 AND slot ~ '^plate-[1-9][0-9]{0,14}$' AND EXISTS
        (SELECT 1 FROM himoto.order_vehicle_details d WHERE d.order_id=$1 AND d.vehicle_id::text=substring(slot from 7) AND d.deleted_at IS NULL))) ORDER BY slot`,
    [orderId,phases.map(phase=>`^${phase}-(?:[1-9][0-9]{0,14}|video-[1-3]|document-[1-9][0-9]{0,14})$`).concat(phases.includes('rental')?['^(driver-license|customer-id-front|customer-id-back|customer-driver-license)$']:[]),phases.includes('rental')]);
  const photos=(result.rows as Attachment[]).filter(photo=>photo.slot.startsWith('plate-')||isContractTransactionPhoto(photo.slot));
  photos.sort((a,b)=>{
    const rank=(slot:string)=>slot==='driver-license'?1000:CONTRACT_CUSTOMER_PHOTO_SLOTS.some(p=>p.key===slot)?1001:slot.startsWith('plate-')?999:phases.findIndex(phase=>slot.startsWith(`${phase}-`));
    return rank(a.slot)-rank(b.slot)||a.slot.localeCompare(b.slot,'en',{numeric:true});
  });
  const seen=new Set<string>();
  return photos.filter(photo=>{
    const key=photo.mime_type+':'+(photo.cloudinary_public_id?`${photo.cloudinary_cloud_name}/${photo.cloudinary_public_id}/${photo.cloudinary_version}`:`slot:${photo.slot}`);
    if(seen.has(key))return false;seen.add(key);return true;
  });
}
/** Resolve photo bytes at Telegram send time for queue rows that only stored slot refs. */
export async function hydrateNotificationPhotos(db:Database,orderId:number|null,photos:Attachment[]):Promise<Attachment[]> {
  if(!orderId||!photos.length)return photos;
  const need=photos.filter(photo=>!photo.cloudinary_public_id&&!photo.bytes).map(photo=>photo.slot);
  if(!need.length)return photos;
  const rows=await db.query(`SELECT slot,mime_type,encode(data,'base64') AS bytes,cloudinary_public_id,cloudinary_cloud_name,cloudinary_version
    FROM himoto.management_record_photos WHERE entity_type='contracts' AND entity_id=$1 AND slot=ANY($2::text[])`,[orderId,need]);
  const bySlot=new Map(rows.rows.map(row=>[String(row.slot),row as Attachment]));
  return photos.map(photo=>{
    if(photo.cloudinary_public_id||photo.bytes)return photo;
    const loaded=bySlot.get(photo.slot);
    return loaded?{...photo,...loaded}:photo;
  });
}
export async function notificationPayload(db:Database,orderId:number,kind:ContractEventType,actorId:number,phases:string[],renewal?:RenewalNotice):Promise<NotificationPayload&{store_id:number}> {
  const returnIds=kind==='return'?phases.map(phase=>phase.match(/^return-([1-9]\d*)$/)?.[1]).filter(Boolean):[];
  const swapId=kind==='battery_swap'?phases[0]?.match(/^battery-swap-([1-9]\d*)$/)?.[1]:undefined;
  const swap=swapId?(await db.query(`SELECT s.*,v.license,v.name AS vehicle_name FROM himoto.management_contract_battery_swaps s JOIN himoto.vehicles v ON v.id=s.vehicle_id WHERE s.id=$1 AND s.order_id=$2 AND s.status='confirmed'`,[swapId,orderId])).rows[0]:undefined;
  if(kind==='battery_swap'&&!swap)throw Error('Không tìm thấy lượt đổi pin đã xác nhận.');
  const o=(await db.query(`SELECT o.store_id,COALESCE(NULLIF(o.contract_number,''),o.draft_reference,'#'||o.id::text) AS code,
    COALESCE(NULLIF(c.name,''),o.customer_name,'') AS customer,COALESCE(NULLIF(c.phone,''),o.customer_phone,'') AS phone,
    s.store_name AS store,u.name AS actor,${OWNERSHIP_ORDER_SQL} AS ownership,
    COALESCE(NULLIF(trim(o.draft_payload->'management_composer'->'profile'->>'staff_name'),''),
      NULLIF(trim(o.draft_payload->'management_composer'->'draft'->>'staff_name'),''),
      (SELECT full_name FROM himoto.staff_profiles WHERE id::text=o.draft_payload->'management_composer'->'draft'->>'staff_id'),
      (SELECT full_name FROM himoto.staff_profiles WHERE user_id=o.contract_responsible_user_id ORDER BY CASE WHEN store_id=o.store_id THEN 0 ELSE 1 END,id LIMIT 1)) AS contract_staff,
    o.total::text,o.total_rental_fees,o.first_deposit_amount,o.additional_deposit_amount,o.rent_at,o.return_at,o.draft_payload,
    (SELECT string_agg(DISTINCT COALESCE(NULLIF(v.license,''),v.name),', ') FROM himoto.order_vehicle_details d JOIN himoto.vehicles v ON v.id=d.vehicle_id WHERE d.order_id=o.id AND d.deleted_at IS NULL AND ($3::bigint[] IS NULL OR d.id=ANY($3))) AS vehicles,
    (SELECT string_agg(DISTINCT v.name,', ') FROM himoto.order_vehicle_details d JOIN himoto.vehicles v ON v.id=d.vehicle_id WHERE d.order_id=o.id AND d.deleted_at IS NULL AND ($3::bigint[] IS NULL OR d.id=ANY($3))) AS vehicle_names
    FROM himoto.orders o LEFT JOIN himoto.customers c ON c.id=o.customer_id LEFT JOIN himoto.stores s ON s.id=o.store_id LEFT JOIN himoto.users u ON u.id=$2
    WHERE o.id=$1 AND o.deleted_at IS NULL`,[orderId,actorId,returnIds.length?returnIds:null])).rows[0];
  if(!o)throw Error('Không tạo được thông báo hợp đồng.');
  const tx=(await db.query(`SELECT t.id,t.name,t.type,t.value,t.created_at,t.order_item_id,r.renewal_payload,
    CASE WHEN t.bank_id IS NOT NULL AND t.bank_owner_type='company' THEN 'CK TK công ty'
      WHEN t.bank_id IS NOT NULL THEN 'CK TK cá nhân'
      WHEN t.cash_id IS NOT NULL OR t.payment_method=1 THEN 'Tiền mặt'
      WHEN t.payment_method=2 THEN 'Chuyển khoản (chưa phân loại TK)' ELSE 'Chưa xác định' END AS method
    FROM himoto.transactions t LEFT JOIN himoto.management_contract_payments r ON r.transaction_id=t.id WHERE t.order_id=$1 AND t.status='approved' ORDER BY t.created_at,t.id`,[orderId])).rows;
  const draft=o.draft_payload?.management_composer?.draft;
  const composer=o.draft_payload?.management_composer;
  const renewalNote=kind==='renewal'&&o.ownership===true&&renewal
    ? String((renewal as RenewalNotice & {note?:string}).note ||
      (Array.isArray(composer?.versions)?composer.versions.find((v:{kind:string;version:number})=>v.kind==='renewal'&&v.version===renewal.version)?.note:'') || '').trim() : '';
  const depositTx=tx.filter(t=>['in','addon'].includes(t.type)&&/^order:deposit(?::|$)/.test(t.name));
  const refunds=tx.filter(t=>t.type==='out'&&/^(order:deposit_refund$|order:complete:)/.test(t.name));
  const settlement=kind==='return'&&Array.isArray(composer?.return_settlements)?composer.return_settlements.findLast((entry:{item_ids:number[]})=>Array.isArray(entry.item_ids)&&entry.item_ids.length===returnIds.length&&entry.item_ids.every(id=>returnIds.includes(String(id)))):undefined;
  // Prefer the settlement-linked refund voucher; otherwise include any deposit refund on the order (e.g. cashbook after return).
  const eventRefunds=settlement?.refund_transaction_id!=null
    ?refunds.filter(t=>Number(t.id)===Number(settlement.refund_transaction_id))
    :refunds;
  const feeReceipts=settlement?tx.filter(t=>t.type!=='out'&&settlement.transaction_ids?.includes(Number(t.id))):[];
  const adjustments=kind==='return'&&Array.isArray(composer?.return_adjustments)?composer.return_adjustments.filter((entry:{item_id:number})=>returnIds.includes(String(entry.item_id))):[];
  const rental=tx.filter(t=>['in','addon'].includes(t.type)&&!/^order:deposit(?::|$)/.test(t.name));
  // Date changes are not receipts. Only an explicitly associated renewal receipt supplies a payment method.
  const renewalTx=renewal?tx.filter(t=>['in','addon'].includes(t.type)&&Number(t.value)>0&&(
    renewal.transaction_id!==undefined?Number(t.id)===Number(renewal.transaction_id)
      :renewal.version!==undefined?Number(t.renewal_payload?.version)===Number(renewal.version)
        :t.renewal_payload&&t.renewal_payload.version===undefined&&
          new Date(t.renewal_payload.return_at).getTime()===new Date(renewal.return_at).getTime()&&t.renewal_payload.license===renewal.license)):[];
  // Rental/handover: cọc + thuê. Reservation (cọc giữ xe) records advance as order:rental_fees, not order:deposit.
  const selected=kind==='battery_swap'?tx.filter(t=>Number(t.id)===Number(swap?.transaction_id)):kind==='return'?eventRefunds:kind==='renewal'?renewalTx
    :kind==='reservation'?rental:[...depositTx,...rental];
  const methods=(rows:typeof tx)=>[...new Set(rows.map(t=>String(t.method)).filter(method=>method&&method!=='Chưa xác định'))].sort().join(', ');
  const fee=o.total_rental_fees==null?null:Number(o.total_rental_fees);
  const deposit=o.first_deposit_amount==null&&o.additional_deposit_amount==null?null:Number(o.first_deposit_amount||0)+Number(o.additional_deposit_amount||0);
  const rentalFee=fee??(o.total==null?null:Number(o.total));
  const start=draft?.start_date?`${draft.start_date}:00+07:00`:o.rent_at;
  const end=draft?.end_date?`${draft.end_date}:00+07:00`:o.return_at;
  const duration=start&&end?Math.ceil((new Date(end).getTime()-new Date(start).getTime())/86400000):NaN;
  const effectiveDeposit=kind==='return'?depositTx.reduce((sum,t)=>sum+Number(t.value),0):deposit;
  const heldDeposit=Math.max(Number(effectiveDeposit||0)-refunds.reduce((sum,t)=>sum+Number(t.value),0),0);
  const pendingRefund=kind==='return'&&settlement?.refund_deferred&&heldDeposit>0
    ?{...(settlement.recipient||{}),amount:Math.min(Number(settlement.refund_pending_amount)||heldDeposit,heldDeposit)}:undefined;
  return {store_id:Number(o.store_id),code:o.code,customer:o.customer,phone:o.phone,store:o.store,actor:o.actor,contract_staff:o.contract_staff||'',vehicles:o.vehicles||'',vehicle_names:o.vehicle_names||'',total:o.total,
    at:new Date().toISOString(),photos:await notificationPhotos(db,orderId,phases),days:Number.isFinite(duration)&&duration>0?duration:null,
    ...(renewalNote?{ownership_renewal_note:renewalNote}:{}),
    deposit:effectiveDeposit,rental_fee:rentalFee,grand_total:o.total==null||deposit===null?null:Number(o.total)+deposit,
    refunded:eventRefunds.reduce((sum,t)=>sum+Number(t.value),0),method:methods(selected),deposit_method:methods(depositTx),...(renewal?{renewal}:{}),...(pendingRefund?{refund_pending:pendingRefund}:{}),
    ...(adjustments.length?{return_fees:{returned_at:adjustments.map((entry:{actual_return_at:string})=>entry.actual_return_at).sort().at(-1),late:adjustments.reduce((sum:number,entry:{late_fee?:number;fee:number;repair_fee?:number;early_discount?:number})=>sum+Number(entry.late_fee??Math.max(entry.fee+(entry.early_discount||0)-(entry.repair_fee||0),0)),0),repair:adjustments.reduce((sum:number,entry:{repair_fee?:number})=>sum+Number(entry.repair_fee||0),0),early_discount:adjustments.reduce((sum:number,entry:{early_discount?:number})=>sum+Number(entry.early_discount||0),0),collected:feeReceipts.reduce((sum,t)=>sum+Number(t.value),0),method:methods(feeReceipts)}}:{}),...(settlement?.recipient?.account?{refund_recipient:settlement.recipient}:{}),
    ...(swap?{battery_swap:{percentage:Number(swap.battery_percent),fee:Number(swap.fee),collected:selected.reduce((sum,t)=>sum+Number(t.value),0),license:swap.license,vehicle_name:swap.vehicle_name}}:{})};
}
