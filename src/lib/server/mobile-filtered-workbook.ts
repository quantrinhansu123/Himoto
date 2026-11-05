import 'server-only';
import {buildFilteredExcel} from '@/lib/management/excel-export';
import {MobileError} from './mobile-session';
import type {MobileWorkbookExport} from '../../../shared/mobile-export';
/** All pages must come from the caller's single read-only snapshot. */
export async function readAllExportRows<T>(read:(page:number)=>Promise<{rows:T[];total:number;page:number;size:number}>, key:(row:T)=>string|number) {
  const first=await read(1),rows=[...first.rows];
  if(!Number.isSafeInteger(first.total)||first.total<0||!Number.isSafeInteger(first.size)||first.size<1||first.page!==1)throw new MobileError('Chưa đối chiếu được số dòng xuất.',503,'EXPORT_INCOMPLETE');
  for(let page=2;page<=Math.ceil(first.total/first.size);page++){
    const next=await read(page);
    if(next.page!==page||next.total!==first.total||next.size!==first.size)throw new MobileError('Danh sách xuất chưa ổn định. Tải lại.',503,'EXPORT_INCOMPLETE');
    rows.push(...next.rows);
  }
  if(rows.length!==first.total||new Set(rows.map(key)).size!==rows.length)throw new MobileError('Chưa đọc đủ danh sách. Thu hẹp bộ lọc và thử lại.',503,'EXPORT_INCOMPLETE');
  return rows;
}
export async function mobileFilteredWorkbook(filename:string,headers:string[],rows:(string|number|null|undefined)[][]):Promise<MobileWorkbookExport> {
  const bytes=await buildFilteredExcel(headers,rows);
  if(bytes.byteLength>12*1024*1024)throw new MobileError('File quá lớn. Thu hẹp bộ lọc rồi xuất lại; chưa xuất file bị cắt.',413,'EXPORT_TOO_LARGE');
  return{filename:filename+'.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',contentBase64:Buffer.from(bytes).toString('base64'),rowCount:rows.length};
}
