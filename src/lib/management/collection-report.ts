export const CONTACT_STATUSES={uncontacted:'Chưa liên hệ',contacted:'Đã liên hệ',unreachable:'Không nghe máy',promised:'Hẹn thanh toán'} as const;
export const HANDLING_STATUSES={branch:'PGD xử lý',escalated:'Chuyển XLN',resolved:'Đã xử lý'} as const;
export const COLLECTION_FOLLOWUP_SAVED='himoto:collection-followup-saved';
export interface CollectionFollowup {
  contact_status:keyof typeof CONTACT_STATUSES;handling_status:keyof typeof HANDLING_STATUSES;
  customer_condition:string;notes:string;revision:number;updated_at?:string;
}
export interface CollectionRow {
  id:number;code:string;customer:string;phone:string;store_id:number;store_name:string;vehicle:string;
  started_at:string;due_at:string;days:number;amount:number|null;late_fee:number|null;
  gps:string[];customer_status:string;followup:CollectionFollowup;
}
export async function loadCollectionFollowups(ids:number[],signal?:AbortSignal):Promise<{id:number;followup:CollectionFollowup}[]> {
  const result:{id:number;followup:CollectionFollowup}[]=[];
  for(let start=0;start<ids.length;start+=200){
    const response=await fetch(`/api/auth/order/car-rental/followups?ids=${ids.slice(start,start+200).join(',')}`,{signal,cache:'no-store',credentials:'same-origin'});
    const body=await response.json();
    if(!response.ok||!Array.isArray(body.data))throw Error(body.message||'Không tải được ghi chú hợp đồng.');
    result.push(...body.data);
  }
  return result;
}
export function parseCollectionFollowup(raw:unknown):CollectionFollowup&{order_id:number} {
  const b=raw as Record<string,unknown>;
  if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(key=>!['order_id','revision','contact_status','handling_status','customer_condition','notes'].includes(key))
    ||!Number.isSafeInteger(b.order_id)||Number(b.order_id)<1||!Number.isSafeInteger(b.revision)||Number(b.revision)<0
    ||!Object.hasOwn(CONTACT_STATUSES,String(b.contact_status))||!Object.hasOwn(HANDLING_STATUSES,String(b.handling_status))
    ||typeof b.customer_condition!=='string'||b.customer_condition.length>300||typeof b.notes!=='string'||b.notes.length>3000)throw new Error('Kiểm tra tình trạng khách, ghi chú và phiên bản báo cáo.');
  return {order_id:Number(b.order_id),revision:Number(b.revision),contact_status:b.contact_status as CollectionFollowup['contact_status'],handling_status:b.handling_status as CollectionFollowup['handling_status'],customer_condition:b.customer_condition.trim(),notes:b.notes.trim()};
}
