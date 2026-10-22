import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest,SESSION_COOKIE,userFromSession } from '@/lib/server/management-session';
import { readPhotoBody } from '@/lib/server/photo-body';
import { RecordPhotoError } from '@/lib/server/record-photos';
import { extractPhoto,limitPhotoOcr,PhotoOcrError } from '@/lib/server/photo-ocr';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime='nodejs';
export const maxDuration=45;
async function POSTHandler(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const denied=await protectDatabaseRequest(request);if(denied)return denied;
  const headers={'Cache-Control':'private, no-store'};
  try{
    const {id}=await params;
    if(!/^[1-9]\d{0,14}$/.test(id)||!Number.isSafeInteger(Number(id)))throw new PhotoOcrError('Mã hợp đồng không hợp lệ.');
    const user=await userFromSession(request.cookies.get(SESSION_COOKIE)?.value);
    if(!user)return NextResponse.json({status:'error',message:'Phiên đăng nhập đã hết hạn.'},{status:401,headers});
    // This uses the request's branch scope; a guessed contract id cannot invoke OCR.
    const order=await himotoPool.query('SELECT id FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL',[Number(id)]);
    if(!order.rowCount)throw new PhotoOcrError('Không tìm thấy hợp đồng trong phạm vi tài khoản.',404);
    limitPhotoOcr(user.id);
    const photo=await readPhotoBody(request);
    const data=await extractPhoto('refund_qr',photo.mimeType,photo.data,request.signal);
    return NextResponse.json({status:'success',data},{headers});
  }catch(error){
    if(error instanceof PhotoOcrError||error instanceof RecordPhotoError)return NextResponse.json({status:'error',message:error.message},{status:error.status,headers});
    return failureResponse('Không đọc được ảnh nhận hoàn. Thử lại hoặc nhập tay.',error);
  }
}
export const POST=withAccessRequest(POSTHandler);
