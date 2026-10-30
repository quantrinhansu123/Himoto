import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { ContractEventType } from '@/lib/management/contract-telegram';
import { CONTRACT_CUSTOMER_PHOTO_SLOTS,isContractTransactionPhoto } from '@/lib/management/contract-photos';
import { contractVehicleLabelSource,contractVehicleReadSource } from './contract-vehicle-reads';
import { OWNERSHIP_ORDER_SQL } from './contract-telegram-routing';

export interface Attachment {slot:string;mime_type:string;bytes:string|null;cloudinary_public_id:string|null;cloudinary_cloud_name:string|null;cloudinary_version:number|null;object_bucket?:string|null;object_key?:string|null;object_etag?:string|null}
export interface RenewalNotice {version?:number;item_id?:number;created_at?:string;amount:number;before_return_at:string|null;return_at:string;license:string;vehicle_name:string;transaction_id?:number;outside_amount?:number;outside_name?:string;items?:RenewalNotice[]}
export interface PaymentAmount {method:string;amount:number}
export interface NotificationPaymentAmounts {
  rental?:PaymentAmount[];deposit?:PaymentAmount[];renewal?:PaymentAmount[];
  deposit_refund?:PaymentAmount[];rental_refund?:PaymentAmount[];return_fees?:PaymentAmount[];battery_swap?:PaymentAmount[];
}
export interface NotificationPayload {
  code:string;customer:string;phone:string;store:string;actor:string;vehicles:string;total:string;at:string;photos:Attachment[];contract_staff?:string;
  vehicle_names?:string;days?:number|null;deposit?:number|null;rental_fee?:number|null;grand_total?:number|null;
  refunded?:number;rental_refunded?:number;method?:string;deposit_method?:string;renewal?:RenewalNotice;
  payment_amounts?:NotificationPaymentAmounts;
  ownership_renewal_note?:string;
  rental_correction?:{request_id:string;start_at:string;end_at:string};
  return_fees?:{late:number;repair:number;early_discount:number;collected:number;method:string;returned_at?:string};
  return_details?:{note:string;returned_at:string[];rental_refund_recipient?:{bank?:string;account?:string;name?:string}};
  refund_recipient?:{bank?:string;account?:string;name?:string};
  refund_pending?:{amount:number;bank?:string;account?:string;name?:string};
  battery_swap?:{percentage:number;fee:number;collected:number;license:string;vehicle_name:string};
  vehicle_swap?:{from_license:string;from_name:string;to_license:string;to_name:string};
  transfer?:{from:string;to:string;note:string;received:boolean;ownership?:boolean};
}
type Database=Pick<PoolClient,'query'>;
const money=(value:unknown)=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?'Chưa đối chiếu':Number(value).toLocaleString('vi-VN');
const day=(value:string|null)=>value?new Date(value).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric'}):'Chưa đối chiếu';
const renewalClock=(value:string|null|undefined)=>value?`${day(value)} ${new Date(value).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}`:'Chưa đối chiếu';
/** Rental coverage and receipt creation are separate clocks, including late collections. */
export function renewalPeriodStart(item:Pick<RenewalNotice,'created_at'|'before_return_at'>&{occurred_at?:string}) {
  return item.before_return_at || item.occurred_at || item.created_at || null;
}
const renewalPeriod=(item:RenewalNotice)=>`${renewalClock(renewalPeriodStart(item))} - ${renewalClock(item.return_at)}`;
export function sameRenewalPeriod(a:Partial<RenewalNotice>,b:Partial<RenewalNotice>) {
  if(a.item_id&&b.item_id&&Number(a.item_id)!==Number(b.item_id))return false;
  if(a.created_at&&b.created_at)return Date.parse(a.created_at)===Date.parse(b.created_at);
  return ['before_return_at','return_at'].every(key=>{
    const x=a[key as 'return_at'],y=b[key as 'return_at'];return !x||!y||new Date(x).getTime()===new Date(y).getTime();
  });
}
export function renewalDurationText(item:RenewalNotice) {
  const minutes=Math.ceil((Date.parse(item.return_at)-Date.parse(renewalPeriodStart(item)||''))/60_000);
  if(!Number.isFinite(minutes)||minutes<=0)return '';
  return [Math.floor(minutes/1440)?`${Math.floor(minutes/1440)} ngày`:'',Math.floor(minutes%1440/60)?`${Math.floor(minutes%1440/60)} giờ`:'',minutes%60?`${minutes%60} phút`:''].filter(Boolean).join(' ');
}
const telegramClock=(at:string)=>new Date(at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
/** Sum verified receipts, never infer a split from a draft label or contract
 * total. Historical mixed vouchers keep their explicitly unknown split. */
export function notificationPaymentAmounts(rows:{method:string;value:unknown;payment_method?:unknown}[]):PaymentAmount[] {
  const totals=new Map<string,number>();
  for(const row of rows){
    const amount=row.value==null||String(row.value).trim()===''?NaN:Number(row.value);
    if(!Number.isSafeInteger(amount)||amount<0)throw Error('Số tiền phiếu không hợp lệ để tách hình thức thanh toán.');
    if(!amount)continue;
    const method=Number(row.payment_method)===3?'Tiền mặt + CK (chưa tách số tiền)':row.method||'Chưa xác định';
    const total=(totals.get(method)||0)+amount;
    if(!Number.isSafeInteger(total))throw Error('Tổng tiền theo hình thức thanh toán vượt giới hạn.');
    totals.set(method,total);
  }
  const priority=['Tiền mặt','CK TK cá nhân','CK TK công ty'];
  const rank=(method:string)=>{const index=priority.indexOf(method);return index<0?priority.length:index;};
  return [...totals].sort(([a],[b])=>rank(a)-rank(b)||a.localeCompare(b,'vi')).map(([method,amount])=>({method,amount}));
}
const amountLine=(label:string,amounts?:PaymentAmount[])=>amounts?.length?[`${label}: ${amounts.map(row=>`${row.method}: ${money(row.amount)} đ`).join(' · ')}`]:[];
/** Cuối mọi tin Telegram: NV xuất tin, rồi Thời gian là dòng cuối cùng. */
function withTelegramFooter(body:string,actor:string,at:string){
  const sender=`Nhân viên xuất tin Telegram: ${actor?.trim()||'Chưa ghi nhận'}`;
  const time=`Thời gian: ${telegramClock(at)}`;
  const rows=body.replace(/\n+$/,'').split('\n').filter(row=>!/^Nhân viên xuất tin Telegram:/.test(row)&&!/^Thời gian:/.test(row));
  return [...rows,sender,time].join('\n').slice(0,4000);
}
export function contractNotificationText(kind:ContractEventType|'vehicle_transfer'|'vehicle_receive'|'battery_return'|'battery_renewal',p:NotificationPayload) {
  if(kind==='battery_return')return withTelegramFooter([`Khách trả pin / sạc: ${p.customer}`,`Pin / sạc: ${p.vehicle_names||'—'}`,`Mã HĐ: ${p.code}`,`Cơ sở: ${p.store}`,
    `Nhận lại lúc: ${p.return_details?.returned_at?.[0]?telegramClock(p.return_details.returned_at[0]):telegramClock(p.at)}`,`Cọc: ${money(p.deposit)}`,
    ...(Number(p.total)>0?[`Nợ gia hạn còn: ${money(p.total)}`]:[]),...(p.return_details?.note?[`Ghi chú: ${p.return_details.note}`]:[])].join('\n'),p.actor,p.at);
  if(kind==='vehicle_swap')return withTelegramFooter([`Khách đổi xe: ${p.customer}`,`Xe cũ: ${p.vehicle_swap?.from_license||'—'} · ${p.vehicle_swap?.from_name||'—'}`,
    `Xe mới: ${p.vehicle_swap?.to_license||'—'} · ${p.vehicle_swap?.to_name||'—'}`,`Cơ sở: ${p.store}`,`Hợp đồng: ${p.code}`].join('\n'),p.actor,p.at);
  if(kind==='vehicle_transfer'||kind==='vehicle_receive')return withTelegramFooter([`${kind==='vehicle_receive'?'ĐÃ NHẬN XE':'ĐIỀU CHUYỂN XE'}${p.transfer?.ownership===false?'':' SỞ HỮU'}`,`Bsx: ${p.vehicles}`,`Loại xe: ${p.vehicle_names||'—'}`,`Cơ sở chuyển đi: ${p.transfer?.from||'—'}`,`Cơ sở nhận: ${p.transfer?.to||'—'}`,`Trạng thái: ${kind==='vehicle_receive'?'Đã nhận · Lưu kho':'Chờ cơ sở đích xác nhận nhận xe'}`,`Người thực hiện: ${p.actor}`,`Mã lượt: ${p.code}`,...(p.transfer?.note?[`Ghi chú: ${p.transfer.note}`]:[])].join('\n'),p.actor,p.at);
  const method=p.method||'Chưa ghi nhận thanh toán';
  const vehicle=[`Bsx: ${p.renewal?.license||p.vehicles||'—'}`,`Loại xe: ${p.renewal?.vehicle_name||p.vehicle_names||'—'}`];
  const refundedAmount=Number(p.refunded||0);
  const depositAmount=Number(p.deposit||0);
  const pendingRecipient=[p.refund_pending?.bank,p.refund_pending?.account,p.refund_pending?.name].filter(Boolean).join(' · ')
    ||((p.photos||[]).some(photo=>/^return-[1-9]\d*-document-[1-9]\d*$/.test(photo.slot))?'Theo ảnh QR / hồ sơ đính kèm':'Chưa có QR/STK — cần bổ sung trước khi hoàn');
  const lines=kind==='battery_swap'?[`Khách đổi pin: ${p.customer}`,`Bsx: ${p.battery_swap?.license||p.vehicles}`,`Loại xe: ${p.battery_swap?.vehicle_name||p.vehicle_names||'—'}`,`Pin lúc nhận: ${p.battery_swap?.percentage??'—'}%`,`Phí pin dưới 20%: ${money(p.battery_swap?.fee)}`,`Đã thu: ${money(p.battery_swap?.collected)}`,`Hình thức thu: ${method}`]:kind==='return'?[`Khách trả xe: ${p.customer}`,`Biển số: ${p.vehicles||'—'}`,`Xe: ${p.vehicle_names||'—'}`,
    `Cọc: ${money(p.deposit)}`,`Quá hạn: ${money(p.return_fees?.late)}`,
    ...(p.return_fees?.repair?[`Sửa chữa: ${money(p.return_fees.repair)}`]:[]),
    ...(p.return_fees?.early_discount?[`Trả sớm: −${money(p.return_fees.early_discount)}`]:[]),
    ...(p.return_fees?.collected?[`Đã thu phí / công nợ: ${money(p.return_fees.collected)}${p.return_fees.method?' · '+p.return_fees.method:''}`]:[]),
    `Hoàn cọc: ${money(p.refunded)}`,
    ...(p.rental_refunded?[`Hoàn tiền thuê trả sớm: ${money(p.rental_refunded)}`,`Tổng tiền hoàn: ${money(refundedAmount+p.rental_refunded)}`]:[]),
    ...(refundedAmount>0||Number(p.rental_refunded)>0
      ?[`Hình thức thanh toán: ${p.method||'Chưa xác định'}`]
      :!p.refund_pending&&depositAmount>0
        ?['Hoàn cọc: chưa ghi nhận phiếu hoàn — tick «Đã hoàn cọc» khi trả xe hoặc ghi phiếu chi sổ quỹ']
        :[]),
    ...(p.refund_pending?[`Chờ kế toán hoàn cọc: ${money(p.refund_pending.amount)}`,`Thông tin nhận hoàn: ${pendingRecipient}`]:[])]
    :kind==='renewal'?[`Khách gia hạn: ${p.customer}`,...vehicle,
      ...(p.renewal?.items?.length?p.renewal.items.map(item=>`Gia hạn ${item.license}: ${renewalPeriod(item)}${renewalDurationText(item)?` (${renewalDurationText(item)})`:''}`):[p.renewal?`Gia hạn: ${renewalPeriod(p.renewal)}${renewalDurationText(p.renewal)?` (${renewalDurationText(p.renewal)})`:''}`:'Gia hạn: Chưa đối chiếu']),
      `Phí gia hạn: ${money(p.renewal?.amount)} đ`,
      ...(Number(p.renewal?.outside_amount)>0?[`Phí thu thêm (thu ngoài): ${money(p.renewal?.outside_amount)} đ${p.renewal?.outside_name?` · ${p.renewal.outside_name}`:''}`]:[]),
      `Hình thức thanh toán: ${method}`,
      ...(p.ownership_renewal_note?[`Ghi chú: ${p.ownership_renewal_note}`]:[])]
    :[`${kind==='reservation'?'Khách đặt cọc giữ xe':kind==='handover'?'Khách nhận xe':'Khách thuê xe'}: ${p.customer}`,...vehicle,
      `Tiền thuê xe: ${money(p.rental_fee??p.total)}`,`Số ngày thuê: ${p.days??'Chưa đối chiếu'}`,
      ...(p.rental_correction?[`Khoảng thuê đã sửa: ${renewalClock(p.rental_correction.start_at)} - ${renewalClock(p.rental_correction.end_at)}`]:[]),`Tiền cọc: ${money(p.deposit)}`,
      ...(p.rental_fee!=null&&p.total!=null&&Number(p.total)!==p.rental_fee?[`Phí khác / điều chỉnh: ${money(Number(p.total)-p.rental_fee)}`]:[]),
      `Tổng tiền: ${money(p.grand_total)}`,`Hình thức thanh toán: ${method}`];
  const amounts=p.payment_amounts;
  const paymentLines=kind==='return'?[
    ...amountLine('Thu phí / công nợ theo hình thức',amounts?.return_fees),
    ...amountLine('Hoàn cọc theo hình thức',amounts?.deposit_refund),...amountLine('Hoàn tiền thuê theo hình thức',amounts?.rental_refund)]
    :kind==='renewal'?amountLine('Đã thu gia hạn',amounts?.renewal)
    :kind==='battery_swap'?amountLine('Đã thu theo hình thức',amounts?.battery_swap)
    :[...amountLine(kind==='reservation'?'Đã thu cọc giữ xe':'Đã thu tiền thuê / phí',amounts?.rental),...amountLine('Đã thu tiền cọc',amounts?.deposit)];
  lines.push(...paymentLines);
  if(kind==='return')return withTelegramFooter([...lines,...(p.return_details?[`Giờ trả: ${p.return_details.returned_at.map(at=>new Date(at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})).join(' · ')}`,
    ...(p.refund_recipient&&[p.refund_recipient.bank,p.refund_recipient.account,p.refund_recipient.name].some(Boolean)?[`Nhận hoàn cọc: ${[p.refund_recipient.bank,p.refund_recipient.account,p.refund_recipient.name].filter(Boolean).join(' · ')}`]:[]),
    ...(p.return_details.rental_refund_recipient?[`Nhận hoàn tiền thuê: ${[p.return_details.rental_refund_recipient.bank,p.return_details.rental_refund_recipient.account,p.return_details.rental_refund_recipient.name].filter(Boolean).join(' · ')}`]:[]),
    ...(p.return_details.note?[`Ghi chú: ${p.return_details.note}`]:[])]:[]),`HĐ: ${p.code}`].join('\n'),p.actor,p.at);
  // Mọi loại tin (thuê / cọc giữ / nhận xe / gia hạn / đổi pin…): cuối = NV xuất tin, rồi Thời gian.
  return withTelegramFooter([...lines,`Cơ sở: ${p.store}`,`Hợp đồng: ${p.code}`,`Nhân viên làm hợp đồng: ${p.contract_staff||'Chưa ghi nhận'}`,
    ...(!['rental','reservation'].includes(kind)?[`Người thực hiện: ${p.actor}`]:[])].join('\n'),p.actor,p.at);
}
export function notificationHash(kind:ContractEventType,p:NotificationPayload) {
  // Delivery timestamps and the operator clicking Send do not make identical content a new message.
  const {at: _at,actor: _actor,...content}=p;
  void _at;void _actor;
  const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
  return createHash('sha256').update(JSON.stringify(canonical({kind,...content}))).digest('hex');
}
/** A display upgrade must not unlock another send for a legacy delivered
 * snapshot. New snapshots hash amounts so real split corrections still count. */
export function notificationContentMatches(kind:ContractEventType,current:NotificationPayload,saved:NotificationPayload,savedHash?:string|null) {
  const expected=savedHash||notificationHash(kind,saved);
  if(notificationHash(kind,current)===expected)return true;
  if(Object.hasOwn(saved,'payment_amounts'))return false;
  const {payment_amounts:_amounts,...legacy}=current;void _amounts;
  return notificationHash(kind,legacy)===expected;
}
export async function notificationPhotos(db:Database,orderId:number,phases:string[]):Promise<Attachment[]> {
  // Queue only slot / Cloudinary refs. Embedding multi-MB base64 blobs here made finalize roll back
  // under statement_timeout when staff attached hồ sơ photos. Dispatch reloads bytes by slot.
  const result=await db.query(`SELECT slot,mime_type,NULL::text AS bytes,cloudinary_public_id,cloudinary_cloud_name,cloudinary_version,object_bucket,object_key,object_etag
    FROM himoto.management_record_photos WHERE entity_type='contracts' AND entity_id=$1 AND
      (slot ~ ANY($2::text[]) OR ($3 AND regexp_replace(slot,'-extra-[1-9][0-9]{0,14}$','') ~ '^plate-[1-9][0-9]{0,14}$' AND EXISTS
        (SELECT 1 FROM himoto.order_vehicle_details d WHERE d.order_id=$1 AND d.vehicle_id::text=substring(regexp_replace(slot,'-extra-[1-9][0-9]{0,14}$','') from 7) AND d.deleted_at IS NULL))) ORDER BY slot`,
    [orderId,phases.map(phase=>`^${phase}-(?:[1-9][0-9]{0,14}|video-[1-3]|document-[1-9][0-9]{0,14})(?:-extra-[1-9][0-9]{0,14})?$`).concat(phases.includes('rental')?['^rental-signed-[1-9][0-9]{0,14}$','^(driver-license|customer-id-front|customer-id-back|customer-driver-license)(-extra-[1-9][0-9]{0,14})?$']:[]),phases.includes('rental')]);
  // Preserve the legacy payload shape/hash when an attachment has no object reference.
  const photos=(result.rows as Attachment[]).map<Attachment>(({object_bucket,object_key,object_etag,...photo})=>object_key?{...photo,object_bucket,object_key,object_etag}:photo)
    .filter(photo=>photo.slot.startsWith('plate-')||isContractTransactionPhoto(photo.slot));
  photos.sort((a,b)=>{
    const rank=(slot:string)=>slot==='driver-license'?1000:CONTRACT_CUSTOMER_PHOTO_SLOTS.some(p=>p.key===slot)?1001:slot.startsWith('plate-')?999:phases.findIndex(phase=>slot.startsWith(`${phase}-`));
    return rank(a.slot)-rank(b.slot)||a.slot.localeCompare(b.slot,'en',{numeric:true});
  });
  const seen=new Set<string>();
  return photos.filter(photo=>{
    const key=photo.mime_type+':'+(photo.object_key?`${photo.object_bucket}/${photo.object_key}/${photo.object_etag}`:photo.cloudinary_public_id?`${photo.cloudinary_cloud_name}/${photo.cloudinary_public_id}/${photo.cloudinary_version}`:`slot:${photo.slot}`);
    if(seen.has(key))return false;seen.add(key);return true;
  });
}
/** Resolve photo bytes at Telegram send time for queue rows that only stored slot refs. */
export async function hydrateNotificationPhotos(db:Database,orderId:number|null,photos:Attachment[]):Promise<Attachment[]> {
  if(!orderId||!photos.length)return photos;
  const need=photos.filter(photo=>!photo.object_key&&!photo.cloudinary_public_id&&!photo.bytes).map(photo=>photo.slot);
  if(!need.length)return photos;
  const rows=await db.query(`SELECT slot,mime_type,encode(data,'base64') AS bytes,cloudinary_public_id,cloudinary_cloud_name,cloudinary_version,object_bucket,object_key,object_etag
    FROM himoto.management_record_photos WHERE entity_type='contracts' AND entity_id=$1 AND slot=ANY($2::text[])`,[orderId,need]);
  const bySlot=new Map(rows.rows.map(row=>[String(row.slot),row as Attachment]));
  return photos.map(photo=>{
    if(photo.object_key||photo.cloudinary_public_id||photo.bytes)return photo;
    const loaded=bySlot.get(photo.slot);
    return loaded?{...photo,...loaded}:photo;
  });
}
export async function notificationPayload(db:Database,orderId:number,kind:ContractEventType,actorId:number,phases:string[],renewal?:RenewalNotice):Promise<NotificationPayload&{store_id:number}> {
  const returnIds=kind==='return'?phases.map(phase=>phase.match(/^return-([1-9]\d*)$/)?.[1]).filter(Boolean):[];
  const swapId=kind==='battery_swap'?phases[0]?.match(/^battery-swap-([1-9]\d*)$/)?.[1]:undefined;
  const labels=contractVehicleLabelSource(),fleet=contractVehicleReadSource();
  const swap=swapId?(await db.query(`SELECT s.*,v.license,v.name AS vehicle_name FROM himoto.management_contract_battery_swaps s JOIN ${labels} v ON v.id=s.vehicle_id WHERE s.id=$1 AND s.order_id=$2 AND s.status='confirmed'`,[swapId,orderId])).rows[0]:undefined;
  if(kind==='battery_swap'&&!swap)throw Error('Không tìm thấy lượt đổi pin đã xác nhận.');
  const o=(await db.query(`SELECT o.store_id,COALESCE(NULLIF(o.contract_number,''),o.draft_reference,'#'||o.id::text) AS code,
    COALESCE(NULLIF(trim(o.customer_name),''),NULLIF(trim(c.name),''),'') AS customer,COALESCE(NULLIF(trim(o.customer_phone),''),NULLIF(trim(c.phone),''),'') AS phone,
    s.store_name AS store,u.name AS actor,${OWNERSHIP_ORDER_SQL} AS ownership,
    COALESCE(NULLIF(trim(o.draft_payload->'management_composer'->'profile'->>'staff_name'),''),
      NULLIF(trim(o.draft_payload->'management_composer'->'draft'->>'staff_name'),''),
      (SELECT full_name FROM himoto.staff_profiles WHERE id::text=o.draft_payload->'management_composer'->'draft'->>'staff_id'),
      (SELECT full_name FROM himoto.staff_account_attribution WHERE user_id=o.contract_responsible_user_id ORDER BY CASE WHEN store_id=o.store_id THEN 0 ELSE 1 END,id LIMIT 1),
      -- Prefer the login account tied to the contract, then who issued it, then the viewer sending Telegram.
      (SELECT name FROM himoto.users WHERE id=o.contract_responsible_user_id),
      (SELECT name FROM himoto.users WHERE o.draft_payload#>>'{management_composer,finalized,actor_id}' ~ '^[1-9][0-9]{0,14}$'
        AND id=(o.draft_payload#>>'{management_composer,finalized,actor_id}')::bigint),
      NULLIF(trim(u.name),'')) AS contract_staff,
    o.total::text,o.total_rental_fees,o.first_deposit_amount,o.additional_deposit_amount,o.rent_at,o.return_at,o.draft_payload,
    NOT EXISTS(SELECT 1 FROM himoto.order_vehicle_details d WHERE d.order_id=o.id AND d.deleted_at IS NULL AND NOT(d.id=ANY($3::bigint[]))) AS return_covers_order,
    (SELECT string_agg(DISTINCT COALESCE(NULLIF(v.license,''),v.name),', ') FROM himoto.order_vehicle_details d JOIN ${labels} v ON v.id=d.vehicle_id WHERE d.order_id=o.id AND d.deleted_at IS NULL AND ($3::bigint[] IS NULL OR d.id=ANY($3))) AS vehicles,
    (SELECT string_agg(DISTINCT v.name,', ') FROM himoto.order_vehicle_details d JOIN ${labels} v ON v.id=d.vehicle_id WHERE d.order_id=o.id AND d.deleted_at IS NULL AND ($3::bigint[] IS NULL OR d.id=ANY($3))) AS vehicle_names
    FROM himoto.orders o LEFT JOIN himoto.customers c ON c.id=o.customer_id LEFT JOIN himoto.stores s ON s.id=o.store_id LEFT JOIN himoto.users u ON u.id=$2
    WHERE o.id=$1 AND o.deleted_at IS NULL`,[orderId,actorId,returnIds.length?returnIds:null])).rows[0];
  if(!o)throw Error('Không tạo được thông báo hợp đồng.');
  if(kind==='vehicle_swap'){
    const id=phases.length===1?phases[0].match(/^vehicle-swap-([1-9]\d{0,14})$/)?.[1]:undefined;
    const changed=id?(await db.query(`SELECT w.created_at,old.license AS from_license,old.name AS from_name,
      next.license AS to_license,next.name AS to_name,u.name AS actor
      FROM himoto.management_contract_vehicle_swaps w JOIN ${fleet} old ON old.id=w.from_vehicle_id
      JOIN ${fleet} next ON next.id=w.to_vehicle_id LEFT JOIN himoto.users u ON u.id=w.actor_id
      WHERE w.id=$1 AND w.order_id=$2`,[id,orderId])).rows[0]:undefined;
    if(!changed)throw Error('Không tìm thấy lượt đổi xe của hợp đồng.');
    // actor = tài khoản đang gửi Telegram (JOIN users $2); người đổi xe vẫn hiện qua Người thực hiện nếu khác.
    return {store_id:Number(o.store_id),code:o.code,customer:o.customer,phone:o.phone,store:o.store,actor:o.actor||changed.actor||'',
      vehicles:changed.to_license||'',vehicle_names:changed.to_name||'',total:o.total,at:new Date(changed.created_at).toISOString(),
      photos:await notificationPhotos(db,orderId,phases),vehicle_swap:{from_license:changed.from_license||'',from_name:changed.from_name||'',to_license:changed.to_license||'',to_name:changed.to_name||''}};
  }
  const tx=(await db.query(`SELECT t.id,t.name,t.type,t.value,t.created_at,t.order_item_id,t.payment_method,r.renewal_payload,
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
  const isDeposit=(name:string)=>/^order:deposit(?::|$)/.test(name)||name==='order:additional_deposit';
  const depositTx=tx.filter(t=>['in','addon'].includes(t.type)&&isDeposit(t.name));
  const refunds=tx.filter(t=>t.type==='out'&&/^(order:deposit_refund$|order:complete:)/.test(t.name));
  const settlement=kind==='return'&&Array.isArray(composer?.return_settlements)?composer.return_settlements.findLast((entry:{item_ids:number[]})=>Array.isArray(entry.item_ids)&&entry.item_ids.length===returnIds.length&&entry.item_ids.every(id=>returnIds.includes(String(id)))):undefined;
  // Prefer the settlement-linked refund voucher; otherwise include any deposit refund on the order (e.g. cashbook after return).
  const eventRefunds=settlement?.refund_transaction_id!=null
    ?refunds.filter(t=>Number(t.id)===Number(settlement.refund_transaction_id))
    :refunds;
  const rentalRefunds=kind==='return'?tx.filter(t=>t.type==='out'&&t.name==='order:rental_refund'):[];
  const eventRentalRefunds=rentalRefunds.filter(t=>o.return_covers_order||Number(t.id)===Number(settlement?.rental_refund_transaction_id)
    ||t.order_item_id!=null&&returnIds.includes(String(t.order_item_id)));
  const feeReceipts=settlement?tx.filter(t=>t.type!=='out'&&settlement.transaction_ids?.includes(Number(t.id))):[];
  const adjustments=kind==='return'&&Array.isArray(composer?.return_adjustments)?composer.return_adjustments.filter((entry:{item_id:number})=>returnIds.includes(String(entry.item_id))):[];
  const corrected=kind==='return'&&Array.isArray(composer?.return_corrections)&&composer.return_corrections.some((entry:{item_ids:number[]})=>entry.item_ids?.some(id=>returnIds.includes(String(id))));
  const rental=tx.filter(t=>['in','addon'].includes(t.type)&&!isDeposit(t.name));
  // Date changes are not receipts. Only an explicitly associated renewal receipt supplies a payment method.
  const renewalTx=renewal?tx.filter(t=>['in','addon'].includes(t.type)&&Number(t.value)>0&&(
    renewal.transaction_id!==undefined?Number(t.id)===Number(renewal.transaction_id)
      :renewal.version!==undefined?Number(t.renewal_payload?.version)===Number(renewal.version)&&sameRenewalPeriod(t.renewal_payload||{},renewal)
        :t.renewal_payload&&t.renewal_payload.version===undefined&&
          new Date(t.renewal_payload.return_at).getTime()===new Date(renewal.return_at).getTime()&&t.renewal_payload.license===renewal.license)):[];
  // Rental/handover: cọc + thuê. Reservation (cọc giữ xe) records advance as order:rental_fees, not order:deposit.
  const selected=kind==='battery_swap'?tx.filter(t=>Number(t.id)===Number(swap?.transaction_id)):kind==='return'?[...eventRefunds,...eventRentalRefunds]:kind==='renewal'?renewalTx
    :kind==='reservation'?rental:[...depositTx,...rental];
  // Native issue snapshots retain exact original receipt IDs. Later renewals
  // must not change the amount split shown on the original rental event.
  const originalIds=Array.isArray(composer?.finalized?.transaction_ids)?new Set(composer.finalized.transaction_ids.map(Number)):null;
  const originalRental=originalIds?rental.filter(t=>originalIds.has(Number(t.id))):rental;
  const originalDeposit=originalIds?depositTx.filter(t=>originalIds.has(Number(t.id))):depositTx;
  const paymentAmounts:NotificationPaymentAmounts=kind==='return'?{
    deposit_refund:notificationPaymentAmounts(eventRefunds),rental_refund:notificationPaymentAmounts(eventRentalRefunds),return_fees:notificationPaymentAmounts(feeReceipts)}
    :kind==='renewal'?{renewal:notificationPaymentAmounts(renewalTx)}
    :kind==='battery_swap'?{battery_swap:notificationPaymentAmounts(selected)}
    :{rental:notificationPaymentAmounts(originalRental),deposit:notificationPaymentAmounts(originalDeposit)};
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
    payment_amounts:paymentAmounts,
    ...(!['return','renewal','battery_swap'].includes(kind)&&composer?.rental_terms_history?.length?{rental_correction:{request_id:composer.rental_terms_history.at(-1).request_id,start_at:new Date(start).toISOString(),end_at:new Date(end).toISOString()}}:{}),
    ...(renewalNote?{ownership_renewal_note:renewalNote}:{}),
    ...(corrected?{return_details:{note:String(settlement?.note||''),returned_at:[...new Set<string>(adjustments.map((a:{actual_return_at:string})=>a.actual_return_at))].sort(),...(eventRentalRefunds.length&&settlement?.rental_refund_recipient?.account?{rental_refund_recipient:settlement.rental_refund_recipient}:{})}}:{}),
    deposit:effectiveDeposit,rental_fee:rentalFee,grand_total:o.total==null||deposit===null?null:Number(o.total)+deposit,
    refunded:eventRefunds.reduce((sum,t)=>sum+Number(t.value),0),method:methods(selected),deposit_method:methods(depositTx),...(renewal?{renewal}:{}),...(pendingRefund?{refund_pending:pendingRefund}:{}),
    ...(eventRentalRefunds.length?{rental_refunded:eventRentalRefunds.reduce((sum,t)=>sum+Number(t.value),0)}:{}),
    ...(adjustments.length?{return_fees:{returned_at:adjustments.map((entry:{actual_return_at:string})=>entry.actual_return_at).sort().at(-1),late:adjustments.reduce((sum:number,entry:{late_fee?:number;fee:number;repair_fee?:number;early_discount?:number})=>sum+Number(entry.late_fee??Math.max(entry.fee+(entry.early_discount||0)-(entry.repair_fee||0),0)),0),repair:adjustments.reduce((sum:number,entry:{repair_fee?:number})=>sum+Number(entry.repair_fee||0),0),early_discount:adjustments.reduce((sum:number,entry:{early_discount?:number})=>sum+Number(entry.early_discount||0),0),collected:feeReceipts.reduce((sum,t)=>sum+Number(t.value),0),method:methods(feeReceipts)}}:{}),...(settlement?.recipient?.account?{refund_recipient:settlement.recipient}:{}),
    ...(swap?{battery_swap:{percentage:Number(swap.battery_percent),fee:Number(swap.fee),collected:selected.reduce((sum,t)=>sum+Number(t.value),0),license:swap.license,vehicle_name:swap.vehicle_name}}:{})};
}
