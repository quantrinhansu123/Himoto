import {NextRequest} from 'next/server';
import {requireMobileSession,MobileError} from '@/lib/server/mobile-session';
import {readMediaDeleteReceipt} from '@/lib/server/mobile-media-delete';
import {mobileFailure,mobileJson} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{entity:string;id:string;key:string}>}){
  try{const {user}=await requireMobileSession(request),{entity,id,key}=await params;if(request.nextUrl.search)throw new MobileError('Không hỗ trợ bộ lọc phiếu xóa ảnh.',400,'INVALID_QUERY');return mobileJson(await readMediaDeleteReceipt(user,entity,id,key));}
  catch(error){return mobileFailure(error);}
}
