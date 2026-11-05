import {NextRequest} from 'next/server';
import {requireMobileSession,MobileError} from '@/lib/server/mobile-session';
import {readCustomerPhotoCopyReceipt} from '@/lib/server/mobile-customer-photo-copy';
import {mobileFailure,mobileJson} from '@/lib/server/mobile-response';
export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string;key:string}>}){
  try{const {user}=await requireMobileSession(request),{id,key}=await params;if(request.nextUrl.search)throw new MobileError('Không hỗ trợ bộ lọc phiếu lấy giấy tờ.',400,'INVALID_QUERY');return mobileJson(await readCustomerPhotoCopyReceipt(user,id,key));}catch(error){return mobileFailure(error);}
}
