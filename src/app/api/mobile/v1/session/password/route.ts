import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { mobileJson,mobileFailure } from '@/lib/server/mobile-response';
import { changeMobileOwnPassword } from '@/lib/server/mobile-managed-accounts';
export const runtime='nodejs';
export async function POST(request:NextRequest){try{const{user}=await requireMobileSession(request);return mobileJson(await changeMobileOwnPassword(user,request));}catch(error){return mobileFailure(error);}}
