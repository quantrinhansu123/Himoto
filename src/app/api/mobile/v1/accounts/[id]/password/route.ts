import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { mobileJson,mobileFailure } from '@/lib/server/mobile-response';
import { revealMobileManagedPassword } from '@/lib/server/mobile-managed-accounts';
export const runtime='nodejs';
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){try{const{user}=await requireMobileSession(request);return mobileJson(await revealMobileManagedPassword(user,(await context.params).id,request));}catch(error){return mobileFailure(error);}}
