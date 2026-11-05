import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { mobileJson,mobileFailure } from '@/lib/server/mobile-response';
import { readMobileManagedAccountOptions } from '@/lib/server/mobile-managed-accounts';
export const runtime='nodejs';
export async function GET(request:NextRequest){try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileManagedAccountOptions(user));}catch(error){return mobileFailure(error);}}
