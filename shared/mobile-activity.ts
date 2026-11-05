export const ACTIVITY_KINDS = ['contract_created','renewal','return','payment','transfer'] as const;
export type MobileActivityKind = typeof ACTIVITY_KINDS[number];
export const ACTIVITY_LABELS: Record<MobileActivityKind,string> = {
  contract_created:'Tạo hợp đồng', renewal:'Gia hạn hợp đồng', return:'Trả xe',
  payment:'Thu tiền hợp đồng', transfer:'Điều chuyển xe',
};
export type MobileTransferAction='sent'|'received'|'rejected'|'cancelled';
export interface MobileActivity {id:number;kind:MobileActivityKind;action:MobileTransferAction|null;resourceId:number;resourceLabel:string;createdAt:string}
export function activityLabel(row:MobileActivity):string {
  if(row.kind==='transfer')return ({sent:'Chuyển xe',received:'Nhận xe điều chuyển',rejected:'Từ chối nhận xe',cancelled:'Hủy điều chuyển'} as const)[row.action!]||ACTIVITY_LABELS.transfer;
  return ACTIVITY_LABELS[row.kind];
}
export interface MobileActivityPage {rows:MobileActivity[];nextBefore:number|null}
export function isMobileActivityPage(value:unknown):value is MobileActivityPage {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const page=value as MobileActivityPage;
  return Array.isArray(page.rows)&&page.rows.length<=20&&page.rows.every(row=>row&&ACTIVITY_KINDS.includes(row.kind)&&
    (row.kind==='transfer'?typeof row.action==='string'&&['sent','received','rejected','cancelled'].includes(row.action):row.action===null)&&
    Number.isSafeInteger(row.id)&&row.id>0&&Number.isSafeInteger(row.resourceId)&&row.resourceId>0&&typeof row.resourceLabel==='string'&&row.resourceLabel.length>0&&row.resourceLabel.length<=400&&
    typeof row.createdAt==='string'&&Number.isFinite(Date.parse(row.createdAt)))&&
    (page.nextBefore===null||Number.isSafeInteger(page.nextBefore)&&page.nextBefore>0)&&
    new Set(page.rows.map(row=>row.id)).size===page.rows.length;
}
