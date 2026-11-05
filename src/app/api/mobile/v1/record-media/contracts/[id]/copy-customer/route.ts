import {NextRequest} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {readCustomerPhotoCopyReview,copyMobileCustomerPhotos} from '@/lib/server/mobile-customer-photo-copy';
import {mobileFailure,mobileJson} from '@/lib/server/mobile-response';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function GET(request:NextRequest,{params}:Context){
  try{const {user}=await requireMobileSession(request);return mobileJson(await readCustomerPhotoCopyReview(user,(await params).id,request));}catch(error){return mobileFailure(error);}
}
export async function POST(request:NextRequest,{params}:Context){
  try{const {user}=await requireMobileSession(request);return mobileJson(await copyMobileCustomerPhotos(user,(await params).id,request));}catch(error){return mobileFailure(error);}
}
