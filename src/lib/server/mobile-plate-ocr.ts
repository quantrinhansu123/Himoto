import 'server-only';
import type {NextRequest} from 'next/server';
import type {SessionUser} from './management-session';
import {hasPermission} from '@/lib/management/permissions';
import {MobileError} from './mobile-session';
import {readPhotoBody} from './photo-body';
import {RecordPhotoError} from './record-photos';
import {PhotoOcrError,limitPhotoOcr,extractPhoto} from './photo-ocr';
import {isOcrRequestId} from '../../../shared/mobile-customer-ocr';
import {isMobilePlateOcr,type MobilePlateOcr} from '../../../shared/mobile-plate-ocr';
export async function readMobilePlateOcr(user:SessionUser,request:NextRequest):Promise<MobilePlateOcr> {
  // Match the web photo-ocr wrapper: plate recognition uses customers.write.
  if(!hasPermission(user,'customers.write'))throw new MobileError('Tài khoản không có quyền đọc ảnh biển số.',403,'FORBIDDEN');
  const requestId=request.headers.get('x-ocr-request');
  if(request.nextUrl.search||request.headers.has('idempotency-key')||request.headers.has('x-expected-identity')||request.headers.get('x-photo-kind')!=='plate'||!isOcrRequestId(requestId))
    throw new MobileError('Yêu cầu đọc biển số không hợp lệ.',400,'INVALID_OCR_REQUEST');
  try{
    limitPhotoOcr(user.id);const image=await readPhotoBody(request),result=await extractPhoto('plate',image.mimeType,image.data,request.signal);
    const data={requestId,kind:'plate' as const,fields:result.fields,warnings:result.warnings||[]};
    if(!isMobilePlateOcr(data,requestId))throw new MobileError('Kết quả biển số cần kiểm tra lại. Giữ ảnh và chọn xe bằng tay.',502,'INVALID_OCR_RESPONSE');
    return data;
  }catch(error){if(error instanceof PhotoOcrError||error instanceof RecordPhotoError)throw new MobileError(error.message,error.status,error.status===422?'OCR_REVIEW_REQUIRED':'OCR_UNAVAILABLE');throw error;}
}
