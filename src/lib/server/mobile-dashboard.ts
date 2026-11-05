import 'server-only';
import type {SessionUser} from './management-session';
import {hasPermission} from '@/lib/management/permissions';
import {withMobileData} from './mobile-context';
import {himotoPool} from './himoto-database';
import {MobileError} from './mobile-session';
import {readDashboardSummary} from './dashboard';
import {RentalReportError} from './rental-reports';
import {isMobileDashboard,dashboardCsv} from '../../../shared/mobile-dashboard';
import type {MobileCsvExport} from '../../../shared/mobile-export';
export async function readMobileDashboard(user:SessionUser,params:URLSearchParams){
  if(!hasPermission(user,'contracts.read'))throw new MobileError('Không có quyền xem Tổng quan giao dịch.',403,'FORBIDDEN');
  if([...params.keys()].some(k=>!['from','to','store_id'].includes(k)||params.getAll(k).length!==1))throw new MobileError('Bộ lọc Tổng quan chưa hợp lệ.');
  const query=new URLSearchParams(params);if(query.get('store_id')==='all')query.delete('store_id');
  return withMobileData(user,'',async()=>{const db=await himotoPool.connect();try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='60s'");const report=await readDashboardSummary(db,query);if(!isMobileDashboard(report))throw new MobileError('Số liệu Tổng quan chưa khớp tổng. Tải lại để đối chiếu.',503,'INVALID_REPORT');await db.query('COMMIT');return report;}catch(error){await db.query('ROLLBACK').catch(()=>{});if(error instanceof RentalReportError)throw new MobileError(error.message);throw error;}finally{db.release();}});
}
export async function exportMobileDashboard(user:SessionUser,params:URLSearchParams):Promise<MobileCsvExport>{const report=await readMobileDashboard(user,params);return{filename:`himoto-dashboard-giao-dich-${report.from}-${report.to}.csv`,mimeType:'text/csv',content:dashboardCsv(report),rowCount:report.rows.length};}
