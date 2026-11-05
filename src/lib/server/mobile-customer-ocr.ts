import 'server-only';
import type {NextRequest} from 'next/server';
import type {SessionUser} from './management-session';
import {hasPermission} from '@/lib/management/permissions';
import {MobileError} from './mobile-session';
import {readPhotoBody,readPhotoBatchBody} from './photo-body';
import {RecordPhotoError} from './record-photos';
import {PhotoOcrError,limitPhotoOcr,extractPhoto} from './photo-ocr';
import {CUSTOMER_OCR_KINDS,isOcrRequestId,isMobileCustomerOcr,type CustomerOcrKind,type MobileCustomerOcr} from '../../../shared/mobile-customer-ocr';

export async function readMobileCustomerOcr(user:SessionUser,request:NextRequest):Promise<MobileCustomerOcr> {
  if(!hasPermission(user,'customers.write'))
    throw new MobileError('Tài khoản không có quyền đọc giấy tờ để nhập hồ sơ.',403,'FORBIDDEN');
  const kind=request.headers.get('x-photo-kind'),requestId=request.headers.get('x-ocr-request'),expectedIdentity=request.headers.get('x-expected-identity')||'';
  if(request.nextUrl.search||request.headers.has('idempotency-key')||!CUSTOMER_OCR_KINDS.includes(kind as CustomerOcrKind)||
    !isOcrRequestId(requestId)||expectedIdentity&&!/^[A-Z0-9-]{3,100}$/i.test(expectedIdentity))
    throw new MobileError('Loại giấy tờ hoặc mã đọc ảnh không hợp lệ.',400,'INVALID_OCR_REQUEST');
  try{
    limitPhotoOcr(user.id);
    const batch=request.headers.get('content-type')?.startsWith('multipart/form-data');
    if(batch&&kind!=='customer_documents')throw new MobileError('Bộ ảnh phải dùng chế độ đọc giấy tờ cùng một khách.',400,'INVALID_OCR_REQUEST');
    const photos=batch?await readPhotoBatchBody(request):[await readPhotoBody(request)];
    const result=await extractPhoto(kind as CustomerOcrKind,photos[0].mimeType,photos[0].data,request.signal,fetch,{additional:photos.slice(1),expectedIdentity});
    const response={requestId,kind:kind as CustomerOcrKind,expectedIdentity,fields:result.fields,warnings:result.warnings||[]};
    if(!isMobileCustomerOcr(response,requestId,kind as CustomerOcrKind,expectedIdentity))
      throw new MobileError('Kết quả đọc giấy tờ chưa hợp lệ. Giữ ảnh và nhập tay hoặc thử đọc lại.',502,'INVALID_OCR_RESPONSE');
    return response;
  }catch(error){
    if(error instanceof PhotoOcrError||error instanceof RecordPhotoError)
      throw new MobileError(error.message,error.status,error.status===422?'OCR_REVIEW_REQUIRED':'OCR_UNAVAILABLE');
    throw error;
  }
}
