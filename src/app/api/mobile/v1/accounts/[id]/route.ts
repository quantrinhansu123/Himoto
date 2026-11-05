import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { mobileJson,mobileFailure } from '@/lib/server/mobile-response';
import { readMobileManagedAccount,saveMobileManagedAccount } from '@/lib/server/mobile-managed-accounts';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function GET(request:NextRequest,context:Context){try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileManagedAccount(user,(await context.params).id));}catch(error){return mobileFailure(error);}}
export async function PATCH(request:NextRequest,context:Context){try{const{user}=await requireMobileSession(request);return mobileJson(await saveMobileManagedAccount(user,request,'PATCH',(await context.params).id));}catch(error){return mobileFailure(error);}}
export async function DELETE(request:NextRequest,context:Context){try{const{user}=await requireMobileSession(request);return mobileJson(await saveMobileManagedAccount(user,request,'DELETE',(await context.params).id));}catch(error){return mobileFailure(error);}}
