import type {NextRequest} from 'next/server';
import sharp from 'sharp';
import jsQR from 'jsqr';
import {requireMobileSession,MobileError} from '@/lib/server/mobile-session';
import {withMobileData} from '@/lib/server/mobile-context';
import {himotoPool} from '@/lib/server/himoto-database';
import {mobileJson,mobileFailure} from '@/lib/server/mobile-response';
import {hasPermission} from '@/lib/management/permissions';
import {parseRefundQr,combineRefundRecipient} from '@/lib/management/refund-qr';
import {readPhotoBody} from '@/lib/server/photo-body';
import {extractPhoto,limitPhotoOcr} from '@/lib/server/photo-ocr';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{const{user}=await requireMobileSession(request),{id}=await params;
    if(!/^[1-9]\d{0,14}$/.test(id)||request.nextUrl.search)throw new MobileError('Hợp đồng không hợp lệ.');
    if(!hasPermission(user,'contracts.read')||!hasPermission(user,'contracts.return'))throw new MobileError('Không có quyền đọc QR hoàn cọc.',403,'FORBIDDEN');
    await withMobileData(user,'',async()=>{if(!(await himotoPool.query('SELECT id FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL',[Number(id)])).rowCount)throw new MobileError('Hợp đồng ngoài phạm vi tài khoản.',404,'NOT_FOUND');});
    limitPhotoOcr(user.id);const image=await readPhotoBody(request);
    const decoded=await sharp(image.data,{limitInputPixels:20000000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const qr=jsQR(new Uint8ClampedArray(decoded.data),decoded.info.width,decoded.info.height,{inversionAttempts:'attemptBoth'}),fields=qr?parseRefundQr(qr.data):undefined;
    let ai:Awaited<ReturnType<typeof extractPhoto>>|undefined;const warnings:string[]=[];
    try{ai=await extractPhoto('refund_qr',image.mimeType,image.data,request.signal);}catch{warnings.push('Chưa đọc được chữ trên ảnh. Kiểm tra và nhập thêm tên người nhận nếu cần.');}
    return mobileJson({fields:combineRefundRecipient(fields,ai?.fields??{}),warnings});
  }catch(error){return mobileFailure(error);}
}
