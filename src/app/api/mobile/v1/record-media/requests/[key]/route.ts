import {NextRequest} from 'next/server';
import {requireMobileSession,MobileError} from '@/lib/server/mobile-session';
import {readMobileMediaReceipt} from '@/lib/server/mobile-record-media-write';
import {mobileFailure,mobileJson} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{key:string}>}) {
  try{
    const {user}=await requireMobileSession(request),{key}=await params;
    if(request.nextUrl.search)throw new MobileError('Không hỗ trợ bộ lọc phiếu lưu ảnh.',400,'INVALID_QUERY');
    return mobileJson(await readMobileMediaReceipt(user,key));
  }catch(error){return mobileFailure(error);}
}
