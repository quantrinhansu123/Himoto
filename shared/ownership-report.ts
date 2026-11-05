export const OWNERSHIP_REPORT_GROUPS=[
  {title:'1. Xe thuê sở hữu',fields:[['running','Xe đang chạy'],['stock','Kho xe sở hữu'],['term_24','Thuê 24 tháng'],['term_18','Thuê 18 tháng'],['term_12','Thuê 12 tháng'],['term_6','Thuê 6 tháng'],['term_other','Kỳ hạn khác'],['term_unknown','Chưa xác định kỳ hạn'],['reserved','Bảo lưu hợp đồng'],['bad_debt','Nợ xấu'],['returned_month','Khách trả xe trong tháng'],['bought_month','Khách mua xe trong tháng'],['new_day','HĐ mở mới trong ngày'],['new_month','Tổng HĐ mở mới trong tháng']]},
  {title:'2. Doanh thu sở hữu',fields:[['income_day','Tổng thu trong ngày'],['deposit_day','Thu cọc'],['refund_day','Trả cọc'],['rental_day','Lãi thuê xe'],['revenue_month','Tổng doanh thu tháng đến ngày báo cáo']]},
  {title:'3. Pin + sạc',fields:[['battery_revenue_month','Tổng doanh thu pin + sạc trong tháng'],['battery_income_day','Tổng thu trong ngày'],['battery_rental_day','Lãi thuê pin'],['battery_deposit_day','Thu cọc pin'],['battery_refund_day','Hoàn cọc pin'],['battery_sale_day','Bán pin'],['charger_sale_day','Bán sạc']]},
  {title:'4. Tài khoản và đối chiếu',fields:[['thu_actual','TK THU thực tế'],['company_actual','TK CTY thực tế'],['cash_actual','TM thực tế CH'],['book_income','Tổng thu trên sổ đối chiếu']]},
] as const;
export type OwnershipReportKey=typeof OWNERSHIP_REPORT_GROUPS[number]['fields'][number][0];
export type OwnershipValues=Record<OwnershipReportKey,number|null>;
export interface OwnershipReport {
  values:OwnershipValues;app:OwnershipValues;manual:OwnershipReportKey[];
  thu_balance:number|null;company_balance:number|null;read_at:string|null;sources:string[];
}
export const ownershipKeys=OWNERSHIP_REPORT_GROUPS.flatMap(group=>group.fields.map(([key])=>key));
export const emptyOwnershipValues=():OwnershipValues=>Object.fromEntries(ownershipKeys.map(key=>[key,null])) as OwnershipValues;
export const blankOwnershipReport=():OwnershipReport=>({values:emptyOwnershipValues(),app:emptyOwnershipValues(),manual:[],thu_balance:null,company_balance:null,read_at:null,sources:[]});
export function parseOwnershipReport(raw:unknown):OwnershipReport {
  const b=raw as OwnershipReport;
  const valid=(n:unknown)=>n===null||typeof n==='number'&&Number.isSafeInteger(n)&&Math.abs(n)<=1e12;
  if(!b||typeof b!=='object'||!b.values||!b.app||ownershipKeys.some(key=>!valid(b.values[key])||!valid(b.app[key]))||!valid(b.thu_balance)||!valid(b.company_balance)
    ||!Array.isArray(b.manual)||b.manual.some(key=>!ownershipKeys.includes(key))||b.read_at!==null&&(typeof b.read_at!=='string'||!Number.isFinite(Date.parse(b.read_at)))
    ||!Array.isArray(b.sources)||b.sources.length>30||b.sources.some(s=>typeof s!=='string'||s.length>1500))throw Error('Số liệu báo cáo thuê sở hữu không hợp lệ.');
  for(const key of OWNERSHIP_REPORT_GROUPS[0].fields.map(([key])=>key)){const n=b.values[key];if(n!==null&&(n<0||n>100000))throw Error('Số xe và hợp đồng phải là số nguyên từ 0 đến 100.000.');}
  for(const key of ownershipKeys){const n=b.values[key];if(n!==null&&n<0&&!['rental_day','revenue_month','battery_rental_day','battery_revenue_month'].includes(key))throw Error('Số tiền thực tế và thu / hoàn cọc không được âm.');}
  return {values:Object.fromEntries(ownershipKeys.map(k=>[k,b.values[k]])) as OwnershipValues,app:Object.fromEntries(ownershipKeys.map(k=>[k,b.app[k]])) as OwnershipValues,manual:[...new Set(b.manual)],thu_balance:b.thu_balance,company_balance:b.company_balance,read_at:b.read_at,sources:[...b.sources]};
}
export const reconciliation=(actual:number|null,app:number|null)=>actual===null||app===null?'Chưa đối chiếu':actual===app?'Khớp':`Lệch ${(actual-app).toLocaleString('vi-VN')}`;
export function ownershipReportText(date:string,report:OwnershipReport) {
  const v=report.values,m=(key:OwnershipReportKey)=>v[key]===null?'Chưa nhập / chưa có nguồn':v[key]!.toLocaleString('vi-VN'),month=Number(date.slice(5,7));
  return [`Em gửi a/c báo cáo ngày ${date.split('-').reverse().join('/')}`,
    `1. Xe thuê sở hữu đang chạy: ${m('running')} xe - Kho xe sở hữu ${m('stock')}`,
    ...(['24','18','12','6'] as const).map(term=>`+ Thuê ${term} tháng: ${m(`term_${term}`)}`),
    ...(v.term_other?[`+ Kỳ hạn khác: ${m('term_other')}`]:[]),...(v.term_unknown?[`+ Chưa xác định kỳ hạn: ${m('term_unknown')}`]:[]),
    `- Bảo lưu hợp đồng: ${m('reserved')}`,`- Nợ xấu: ${m('bad_debt')}`,`- Khách trả xe T${month}: ${m('returned_month')}`,`- Khách mua xe T${month}: ${m('bought_month')}`,
    `- HĐMM: ${m('new_day')} - Tổng HĐMM tháng ${month}: ${m('new_month')}`,
    '2. Doanh thu sở hữu:',`+ Tổng thu trong ngày: ${m('income_day')}`,`+ Thu cọc: ${m('deposit_day')}`,`+ Trả cọc: ${m('refund_day')}`,`+ Lãi thuê xe: ${m('rental_day')}`,`+ Tổng doanh thu: ${m('revenue_month')}`,
    `3. Tổng doanh thu thuê pin + sạc: ${m('battery_revenue_month')}`,`+ Tổng thu trong ngày: ${m('battery_income_day')}`,`+ Lãi thuê pin: ${m('battery_rental_day')}`,`+ Thu cọc: ${m('battery_deposit_day')}`,`+ Hoàn cọc: ${m('battery_refund_day')}`,`+ Bán pin: ${m('battery_sale_day')}`,`+ Bán sạc: ${m('charger_sale_day')}`,
    '4. Tài khoản:',`+ TK THU: ${m('thu_actual')} (${reconciliation(v.thu_actual,report.thu_balance)})`,`+ TK CTY: ${m('company_actual')} (${reconciliation(v.company_actual,report.company_balance)})`,`+ TM thực tế CH: ${m('cash_actual')}`,
    `- APP: ${report.app.income_day===null?'Chưa có nguồn':report.app.income_day.toLocaleString('vi-VN')} app và ${m('book_income')} sổ (${reconciliation(v.book_income,report.app.income_day)})`,
  ].join('\n');
}
export function validateOwnershipSubmission(report:OwnershipReport){
  const missing=ownershipKeys.filter(key=>report.values[key]===null);
  if(missing.length)throw Error('Nhập đủ các mục báo cáo thuê sở hữu; mục chưa có nguồn cần kiểm kê / đối chiếu thực tế.');
  const v=report.values;
  if(v.running!==v.term_24!+v.term_18!+v.term_12!+v.term_6!+v.term_other!+v.term_unknown!)throw Error('Tổng xe theo kỳ hạn chưa bằng xe đang chạy.');
}
