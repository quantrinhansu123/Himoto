import 'server-only';
import type {NextRequest} from 'next/server';
import type {SessionUser} from './management-session';
import {hasPermission} from '@/lib/management/permissions';
import {SHIFT_PHOTOS} from '@/lib/management/shift-reports';
import {withMobileData} from './mobile-context';
import {himotoPool} from './himoto-database';
import {mobileBody,mobileRequestKey} from './mobile-writes';
import {MobileError} from './mobile-session';
import {mobileShiftId} from './mobile-shift-reports';
import {RecordPhotoError} from './record-photos';
import {signPhotoUpload} from './cloudinary-photos';
import {cloudflyVideosEnabled} from './cloudfly-videos';
import {browserVideosEnabled,signBrowserVideo,completeBrowserVideo,BrowserVideoCompatibilityError} from './browser-videos';
import {isMobileVideoSignature,MOBILE_SHIFT_VIDEO_SECONDS} from '../../../shared/mobile-video';
import {isMobileVideoBrowserReceipt,isMobileVideoDirectResult,validMobileDirectVideoBytes} from '../../../shared/mobile-video-upload';

export async function prepareMobileShiftVideo(user:SessionUser,rawId:string,request:NextRequest) {
  const id=mobileShiftId(rawId),key=mobileRequestKey(request.headers.get('idempotency-key')),body=await mobileBody(request,2048);
  const fields=['action','uploadId','revision','stage','category',...(body.action==='sign'?['bytes','sha256']:body.action==='verify'?['ticket']:[])];
  if(request.nextUrl.search||!['config','sign','verify','conversion'].includes(String(body.action))||Object.keys(body).some(k=>!fields.includes(k))||body.uploadId!==key||!Number.isSafeInteger(body.revision)||Number(body.revision)<1||!['pgd','audit'].includes(String(body.stage))||!SHIFT_PHOTOS.some(([slot])=>slot===body.category)||body.action==='sign'&&(!validMobileDirectVideoBytes(body.bytes)||typeof body.sha256!=='string'||!/^[a-f0-9]{64}$/.test(body.sha256)))throw new MobileError('Kiểm tra mục video và phiên bản báo cáo.',400,'INVALID_VIDEO');
  if(!hasPermission(user,'contracts.read')||!(body.stage==='audit'?hasPermission(user,'shift.review'):hasPermission(user,'contracts.draft')||hasPermission(user,'finance.write')))throw new MobileError('Không có quyền thay đổi video của phần này.',403,'FORBIDDEN');
  await withMobileData(user,'',async()=>{
    const db=await himotoPool.connect();try{
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const row=(await db.query('SELECT status,revision FROM himoto.management_shift_reports WHERE id=$1',[id])).rows[0];
      if(!row)throw new MobileError('Báo cáo không tồn tại hoặc ngoài phạm vi.',404,'NOT_FOUND');
      if(row.revision!==body.revision)throw new MobileError('Báo cáo đã thay đổi. Tải lại để rà soát video.',409,'SHIFT_REVIEW_REQUIRED');
      if(body.stage==='pgd'&&row.status!=='draft')throw new MobileError('PGD đã chốt, không thể bổ sung video kiểm kê.',409,'SHIFT_LOCKED');
      if(body.stage==='audit') {const audit=(await db.query('SELECT status FROM himoto.management_shift_audits WHERE report_id=$1',[id])).rows[0];if(row.status!=='submitted'||audit?.status==='confirmed')throw new MobileError('PGD chưa chốt hoặc KTNB đã xác nhận.',409,'SHIFT_LOCKED');}
      if((await db.query("SELECT count(*)::int AS n FROM himoto.management_shift_media WHERE report_id=$1 AND stage=$2 AND mime_type LIKE 'video/%'",[id,body.stage])).rows[0].n>=3)throw new MobileError('Mỗi phần PGD / KTNB tối đa 3 video.',400,'VIDEO_LIMIT');
      if((await db.query('SELECT operation FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2',[user.id,key])).rowCount)throw new MobileError('Mã này đã được xử lý. Đối chiếu thao tác gốc trước khi tải thêm.',409,'REQUEST_KEY_REUSED');
      await db.query('COMMIT');
    }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
  });
  try{
    if(body.action==='config')return{direct:browserVideosEnabled()};
    if(body.action==='conversion') {const signed={...signPhotoUpload(user.id,key,Date.now(),true),video_storage_provider:cloudflyVideosEnabled()?'cloudfly' as const:'cloudinary' as const};if(!isMobileVideoSignature(signed))throw new MobileError('Cấu hình tải video chưa hợp lệ.',503);return signed;}
    if(body.action==='sign') {const result=await signBrowserVideo(user.id,{upload_id:key,bytes:body.bytes,sha256:body.sha256,max_duration:MOBILE_SHIFT_VIDEO_SECONDS});if(!isMobileVideoDirectResult(result,user.id,key,String(body.sha256)))throw new MobileError('Nơi tải video chưa hợp lệ.',503,'INVALID_VIDEO_UPLOAD');return result;}
    const result=await completeBrowserVideo(user.id,body.ticket,Date.now(),{uploadId:key,maxDuration:MOBILE_SHIFT_VIDEO_SECONDS});if(!isMobileVideoBrowserReceipt(result.receipt)||result.receipt.upload_id!==key)throw new MobileError('Phiếu tải video không khớp.',503,'INVALID_VIDEO_UPLOAD');return result;
  }catch(error){if(error instanceof BrowserVideoCompatibilityError)throw new MobileError(error.message,error.status,'VIDEO_CONVERSION_REQUIRED');if(error instanceof RecordPhotoError)throw new MobileError(error.message,error.status,'VIDEO_UNAVAILABLE');throw error;}
}
