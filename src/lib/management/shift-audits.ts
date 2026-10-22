import type { ShiftInput } from './shift-reports';

export const AUDIT_FIELDS = [
  ['daily_vehicles','Xe thuê ngày',false], ['monthly_vehicles','Xe thuê tháng',false],
  ['vehicles','Xe tại PGD',false], ['external_vehicles','Xe giữ bên ngoài',false], ['batteries','Pin cửa hàng',false],
  ['other_vehicles','Xe khác / thuê sở hữu',false],
  ['cash','Tiền mặt',true], ['personal','TK cá nhân',true], ['company','TK công ty',true],
  ['revenue_day','Doanh thu thuê xe trong ngày',true], ['revenue_month','Doanh thu thuê xe lũy kế tháng',true],
] as const;
export type AuditKey = typeof AUDIT_FIELDS[number][0];
export type AuditValues = Record<AuditKey,number|null>;
export const emptyAuditValues = (): AuditValues => Object.fromEntries(AUDIT_FIELDS.map(([key])=>[key,null])) as AuditValues;
export type ExternalVehicle = { plate:string; reason:string };
export type AuditTransfer = { plate:string; from:string; to:string };
export interface AuditInput {
  book: AuditValues; actual: AuditValues; explanations: Partial<Record<AuditKey|'assets_total'|'transfers',string>>;
  external: ExternalVehicle[]; transfers: AuditTransfer[]; notes:string;
}
export interface ShiftSnapshot {
  captured_at:string; date:string; fingerprint:string; values:AuditValues; assets_total:number|null;
  revenue:{rental:number;renewal:number;late:number;early:number;revenue:number}|null; unclassified_count:number|null;inventory_only?:boolean;
  transfers:AuditTransfer[]; inventory_note:string; accounts_note:string;
}
export interface ShiftAudit {
  revision:number; status:'draft'|'confirmed'; input:AuditInput; snapshot:ShiftSnapshot;
  reviewer_name:string; updated_at:string; confirmed_at:string|null; result:'matched'|'explained'|'pending';
}
export interface ShiftMedia {
  id:string; category:string; stage:'pgd'|'audit'; mime_type:string; url:string; filename:string;
}
export const emptyAuditInput = ():AuditInput=>({book:emptyAuditValues(),actual:emptyAuditValues(),explanations:{},external:[],transfers:[],notes:''});
export const assetTotal = (v:AuditValues):number|null => [v.daily_vehicles,v.monthly_vehicles,v.vehicles,v.external_vehicles,v.other_vehicles].every(n=>n!==null)
  ? v.daily_vehicles!+v.monthly_vehicles!+v.vehicles!+v.external_vehicles!+v.other_vehicles! : null;
export function pgdAuditValues(input:ShiftInput):AuditValues {
  const s=input.summary;
  return {...emptyAuditValues(),daily_vehicles:input.daily_vehicles??null,monthly_vehicles:input.monthly_vehicles??null,
    vehicles:input.vehicles,external_vehicles:input.external_vehicles?.length??0,batteries:input.batteries,cash:input.cash,personal:input.personal,company:input.company,
    other_vehicles:input.other_vehicles??0,
    revenue_day:s?s.income_renewal+s.income_rental+s.late_penalty-s.early_refund:null};
}
const isObject=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const note=(v:unknown,max=3000)=>{if(typeof v!=='string'||v.length>max)throw Error('Kiểm tra nội dung giải trình.');return v.trim();};
export function parseExternalVehicles(value:unknown):ExternalVehicle[] {
  if(!Array.isArray(value)||value.length>100)throw Error('Danh sách xe giữ bên ngoài không hợp lệ.');
  const rows=value.map(v=>{if(!isObject(v))throw Error('Kiểm tra xe giữ bên ngoài.');return {plate:note(v.plate,30).toUpperCase(),reason:note(v.reason,500)};});
  if(rows.some(v=>!v.plate||!v.reason)||new Set(rows.map(v=>v.plate.replace(/[^A-Z0-9]/g,''))).size!==rows.length)throw Error('Mỗi xe bên ngoài cần biển số riêng và lý do.');
  return rows;
}
export function parseAuditInput(raw:unknown):AuditInput {
  if(!isObject(raw))throw Error('Thông tin đối soát không hợp lệ.');
  const parseValues=(v:unknown):AuditValues=>{
    if(!isObject(v))throw Error('Nhập số liệu sổ và KTNB kiểm tra.');
    return Object.fromEntries(AUDIT_FIELDS.map(([key,,currency])=>{
      const n=v[key];const signed=['personal','company','revenue_day','revenue_month'].includes(key);
      if(n!==null&&(!Number.isSafeInteger(n)||Math.abs(Number(n))>(currency?1e12:100000)||!signed&&Number(n)<0))throw Error('Số lượng / số tiền đối soát không hợp lệ. Để trống khi chưa có số liệu.');
      return [key,n];
    })) as AuditValues;
  };
  if(!isObject(raw.explanations)||!Array.isArray(raw.transfers)||raw.transfers.length>100)throw Error('Giải trình hoặc điều chuyển không hợp lệ.');
  const explanations=Object.fromEntries([...AUDIT_FIELDS.map(([key])=>key),'assets_total','transfers'].filter(key=>raw.explanations && Object.hasOwn(raw.explanations as object,key)).map(key=>[key,note((raw.explanations as Record<string,unknown>)[key])])) as AuditInput['explanations'];
  const transfers=raw.transfers.map(v=>{if(!isObject(v))throw Error('Kiểm tra dòng điều chuyển.');const row={plate:note(v.plate,30).toUpperCase(),from:note(v.from,191),to:note(v.to,191)};if(!row.plate||!row.from||!row.to||row.from===row.to)throw Error('Điều chuyển cần biển số, nơi đi và nơi đến khác nhau.');return row;});
  const input={book:parseValues(raw.book),actual:parseValues(raw.actual),explanations,external:parseExternalVehicles(raw.external),transfers,notes:note(raw.notes,5000)};
  if(input.actual.external_vehicles!==null&&input.actual.external_vehicles!==input.external.length)throw Error('Số xe bên ngoài phải bằng danh sách biển số bên dưới.');
  return input;
}
export function auditComparisons(pgd:ShiftInput,input:AuditInput,snapshot:ShiftSnapshot) {
  const p=pgdAuditValues(pgd);
  const rows:{key:AuditKey|'assets_total';label:string;currency:boolean;pgd:number|null;app:number|null;book:number|null;actual:number|null}[]=AUDIT_FIELDS.map(([key,label,currency])=>({key,label,currency,pgd:p[key]??null,app:snapshot.values[key]??null,book:input.book[key]??null,actual:input.actual[key]??null}));
  rows.splice(4,0,{key:'assets_total',label:'Tổng tài sản xe',currency:false,pgd:assetTotal(p),app:snapshot.assets_total,book:assetTotal(input.book),actual:assetTotal(input.actual)});
  return rows.map(row=>{
    const known=[row.pgd,row.app,row.book,row.actual].filter((n):n is number=>n!==null);
    const different=new Set(known).size>1;
    const missing=row.book===null||row.actual===null;
    const unavailable=row.app===null&&!['external_vehicles','batteries','daily_vehicles','monthly_vehicles','other_vehicles'].includes(row.key);
    return {...row,different,missing,unavailable,delta:row.actual!==null&&row.book!==null?row.actual-row.book:null,
      delta_pgd:row.actual!==null&&row.pgd!==null?row.actual-row.pgd:null,delta_app:row.actual!==null&&row.app!==null?row.actual-row.app:null};
  });
}
const transferKey=(rows:AuditTransfer[])=>JSON.stringify(rows.map(v=>[v.plate.toUpperCase().replace(/[^A-Z0-9]/g,''),v.from.trim(),v.to.trim()]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
export function validateAuditConfirmation(pgd:ShiftInput,input:AuditInput,snapshot:ShiftSnapshot):'matched'|'explained' {
  const rows=auditComparisons(pgd,input,snapshot);
  if(rows.some(row=>row.missing))throw Error('Điền đủ số liệu Sổ và KTNB trước khi xác nhận.');
  const issues=rows.filter(row=>row.different||row.unavailable);
  if(issues.some(row=>!input.explanations[row.key]?.trim()))throw Error('Cần giải trình từng khoản chênh lệch hoặc thiếu nguồn app trước khi xác nhận.');
  const transferDiff=transferKey(input.transfers)!==transferKey(snapshot.transfers);
  if(transferDiff&&!input.explanations.transfers?.trim())throw Error('Cần giải trình điều chuyển khác dữ liệu app.');
  if((snapshot.unclassified_count??0)>0&&!input.notes)throw Error('Có giao dịch chưa phân loại doanh thu; cần ghi kết quả kiểm tra trong ghi chú.');
  return issues.length||transferDiff||(snapshot.unclassified_count??0)>0?'explained':'matched';
}
const amount=(value:number|null)=>value===null?'Chưa ghi nhận':new Intl.NumberFormat('vi-VN').format(value);
export function auditReportText(store:string,date:string,audit:ShiftAudit,pgd?:ShiftInput):string {
  const {actual,book,external,transfers,explanations,notes}=audit.input;
  const lines=[`BÁO CÁO KTNB ĐỐI SOÁT PGD ${store.toUpperCase()} – NGÀY ${date.split('-').reverse().join('/')}`,
    `Trạng thái: ${audit.status==='confirmed'?(audit.result==='matched'?'Đã xác nhận – khớp':'Đã xác nhận – có giải trình'):'Bản nháp'}`,
    '',`1. Tổng tài sản xe: ${amount(assetTotal(actual))} xe`,`- Thuê ngày: ${amount(actual.daily_vehicles)} | Thuê tháng: ${amount(actual.monthly_vehicles)}`,
    `- Xe tại PGD: ${amount(actual.vehicles)} | Giữ bên ngoài: ${amount(actual.external_vehicles)}`,`- Pin cửa hàng: ${amount(actual.batteries)}`,
    `- Xe khác / thuê sở hữu: ${amount(actual.other_vehicles)}`,
    ...external.map(v=>`  ${v.plate}: ${v.reason}`),'','2. Điều chuyển xe:',...(transfers.length?transfers.map(v=>`${v.plate}: ${v.from} → ${v.to}`):['Không ghi nhận']),
    '',`3. Doanh thu thuê xe (theo tiền thu/hoàn thực tế, không gồm cọc):`,`- Trong ngày: ${amount(actual.revenue_day)} đồng`,
    `- App: ${amount(audit.snapshot.values.revenue_day)} | Sổ: ${amount(book.revenue_day)}`,`- Lũy kế tháng: ${amount(actual.revenue_month)} đồng`,
    `- TK cá nhân: ${amount(actual.personal)} đồng`,`- TK công ty: ${amount(actual.company)} đồng`,`- Tiền mặt: ${amount(actual.cash)} đồng`,
    '', '4. Chênh lệch và giải trình:',...(pgd?auditComparisons(pgd,audit.input,audit.snapshot).filter(row=>row.different).map(row=>`${row.label}: PGD ${amount(row.pgd)} | App ${amount(row.app)} | Sổ ${amount(row.book)} | KTNB ${amount(row.actual)}${row.delta_pgd!==null?` | KTNB − PGD: ${amount(row.delta_pgd)}`:''}`):[]),
    ...Object.entries(explanations).filter(([,value])=>value).map(([key,value])=>`${key==='assets_total'?'Tổng tài sản':key==='transfers'?'Điều chuyển':AUDIT_FIELDS.find(([field])=>field===key)?.[1]||key}: ${value}`),
    ...(notes?[`Kết luận / ghi chú: ${notes}`]:[]),'',`Người đối soát: ${audit.reviewer_name}`,`Thời điểm: ${new Date(audit.confirmed_at||audit.updated_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}`];
  return lines.join('\n');
}
