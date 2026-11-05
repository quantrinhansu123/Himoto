import type {ShiftReport} from './shift-reports';
import {auditReportText} from './shift-audits';
import type {MobileTextExport} from './mobile-export';
export function mobileShiftAuditExport(report:ShiftReport):MobileTextExport {
  if(!report.audit)throw Error('Chưa có bản đối soát KTNB đã lưu. Lưu nháp hoặc xác nhận trước khi xuất.');
  return{filename:`himoto-ktnb-${report.id}-r${report.audit.revision}.txt`,mimeType:'text/plain',content:auditReportText(report.store_name,report.payload.date,report.audit,report.payload),rowCount:1};
}
