import { SHIFT_DRAFT_NUMBERS,SHIFT_SUMMARY_FIELDS,type ShiftDraftField,type ShiftInput,type ShiftSummary } from './shift-reports';
import { validateOwnershipSubmission } from './ownership-report';

type Section='information'|'inventory'|'summary'|'accounts'|'safety'|'ownership';
type Inventory='vehicles'|'batteries'|'transfers';
export type ShiftFormIssue={message:string;section:Section;id?:string;inventory?:Inventory};
const labels:Record<typeof SHIFT_DRAFT_NUMBERS[number],{label:string;section:Section;inventory?:Inventory}> = {
  vehicles:{label:'Số xe lưu kho thực tế',section:'inventory',inventory:'vehicles'},
  daily_vehicles:{label:'Số xe đang thuê ngày',section:'inventory',inventory:'vehicles'},
  monthly_vehicles:{label:'Số xe đang thuê tháng',section:'inventory',inventory:'vehicles'},
  other_vehicles:{label:'Số xe khác / thuê sở hữu',section:'inventory',inventory:'vehicles'},
  batteries:{label:'Tổng số pin',section:'inventory',inventory:'batteries'},
  charged:{label:'Số pin đầy',section:'inventory',inventory:'batteries'},
  rented_batteries:{label:'Số pin đã cho thuê',section:'inventory',inventory:'batteries'},
  transfers:{label:'Số xe điều chuyển',section:'inventory',inventory:'transfers'},
  cash:{label:'Tiền mặt thực tế',section:'accounts'},
  personal:{label:'Số dư tài khoản cá nhân',section:'accounts'},
  company:{label:'Số dư tài khoản công ty',section:'accounts'},
};
const summaryKey = (key:ShiftDraftField) => key.slice('summary.'.length) as keyof ShiftSummary;

export function blankEndShiftFields(input:ShiftInput):ShiftInput {
  return {...input,...Object.fromEntries(SHIFT_DRAFT_NUMBERS.map(key=>[key,NaN]))};
}
export function restoreShiftDraft(input:ShiftInput):ShiftInput {
  const {draft_missing,draft_charged,draft_external,...saved}=input;
  const draft={...saved,summary:saved.summary?{...saved.summary}:undefined};
  for(const field of draft_missing||[]){
    if(field==='staff')draft.staff='';
    else if(field.startsWith('summary.')){if(draft.summary)draft.summary[summaryKey(field)]=NaN;}
    else if(field!=='external_vehicles')draft[field as typeof SHIFT_DRAFT_NUMBERS[number]]=NaN;
  }
  if(draft_charged!==undefined)draft.charged=draft_charged;
  if(draft_external)draft.external_vehicles=draft_external;
  return draft;
}
export function serializeShiftDraft(input:ShiftInput,stockPhotos:boolean,actorName:string):ShiftInput {
  const draft={...input,summary:input.summary?{...input.summary}:undefined};
  const missing:ShiftDraftField[]=[];
  if(!draft.staff.trim()){
    missing.push('staff');draft.staff=actorName.trim()||'Nhân sự chưa điền';
  }
  for(const key of SHIFT_DRAFT_NUMBERS){
    if(key==='vehicles'&&stockPhotos){draft.vehicles=0;continue;}
    if(Number.isNaN(draft[key])){missing.push(key);draft[key]=0;}
  }
  if(draft.summary){
    for(const [key] of SHIFT_SUMMARY_FIELDS){
      if(Number.isNaN(draft.summary[key])){missing.push(`summary.${key}`);draft.summary[key]=0;}
    }
  }
  if(draft.external_vehicles?.some(row=>!row.plate.trim()||!row.reason.trim())){
    missing.push('external_vehicles');
    draft.draft_external=draft.external_vehicles;
    draft.external_vehicles=draft.external_vehicles.filter(row=>row.plate.trim()&&row.reason.trim());
  }
  if(missing.includes('batteries')&&draft.charged>0){draft.draft_charged=draft.charged;draft.charged=0;}
  return {...draft,draft_missing:missing};
}

export function shiftFormIssues(input:ShiftInput,stockPhotos:boolean):ShiftFormIssue[] {
  const issues:ShiftFormIssue[]=[];
  if(!input.store_id)issues.push({message:'Chọn PGD.',section:'information',id:'shift-store'});
  if(!input.date)issues.push({message:'Chọn ngày báo cáo.',section:'information',id:'shift-date'});
  if(!input.staff.trim())issues.push({message:'Nhập nhân sự trực ca.',section:'information',id:'shift-staff'});
  for(const field of SHIFT_DRAFT_NUMBERS){
    if(field==='vehicles'&&stockPhotos)continue;
    const n=input[field],{label,...position}=labels[field];
    if(!Number.isSafeInteger(n)||Number(n)<0||Number(n)>(position.section==='accounts'?1e12:100000)){
      issues.push({message:`${label} cần là số nguyên không âm. Điền 0 nếu thực tế bằng 0.`,id:`shift-${field}`,...position});
    }
  }
  if(input.charged>input.batteries)issues.push({message:'Số pin đầy phải bằng hoặc nhỏ hơn tổng số pin.',section:'inventory',inventory:'batteries',id:'shift-charged'});
  if(input.summary){
    for(const [key,label,currency] of SHIFT_SUMMARY_FIELDS){
      const n=input.summary[key];
      if(!Number.isSafeInteger(n)||n<0||n>(currency?1e12:100000))issues.push({message:`Nhập ${label.toLowerCase()}.`,section:'summary',id:`shift-summary-${key}`});
    }
  }
  if(input.external_vehicles?.some(row=>!row.plate.trim()||!row.reason.trim())){
    issues.push({message:'Điền biển số và lý do cho từng xe giữ bên ngoài.',section:'inventory',inventory:'vehicles',id:'shift-external-vehicles'});
  }
  const plates=input.external_vehicles?.map(row=>row.plate.toUpperCase().replace(/[^A-Z0-9]/g,'')).filter(Boolean)??[];
  if(new Set(plates).size!==plates.length)issues.push({message:'Mỗi xe giữ bên ngoài cần một biển số riêng.',section:'inventory',inventory:'vehicles',id:'shift-external-vehicles'});
  if(!input.electricity_off)issues.push({message:'Xác nhận đã tắt các thiết bị điện.',section:'safety',id:'shift-electricity-off'});
  if(input.ownership_report){
    try{validateOwnershipSubmission(input.ownership_report);}
    catch(error){issues.push({message:(error as Error).message,section:'ownership'});}
  }
  return issues;
}
