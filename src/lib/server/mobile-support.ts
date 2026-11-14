import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import type { SessionUser } from './management-session';
import { requireMobileSession, MobileError } from './mobile-session';
import { mobileJson, mobileFailure, MOBILE_HEADERS } from './mobile-response';

export async function mobileSupport(request:NextRequest, handler:(request:NextRequest,user:SessionUser)=>Promise<NextResponse>) {
  try {
    const {user}=await requireMobileSession(request);
    const response=await handler(request,user);
    if(response.headers.get('content-type')?.startsWith('image/')) {
      const headers=new Headers(response.headers);
      for(const [key,value] of Object.entries(MOBILE_HEADERS))headers.set(key,value);
      return new NextResponse(response.body,{status:response.status,headers});
    }
    const payload=await response.json();
    if(!response.ok||payload.status!=='success')throw new MobileError(payload.message||'Không thực hiện được thao tác.',response.status,response.status===409?'REVIEW_REQUIRED':'SUPPORT_UNAVAILABLE');
    return mobileJson(payload.data||{success:true});
  }catch(error){return mobileFailure(error);}
}
