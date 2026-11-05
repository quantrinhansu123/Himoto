import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { mobileJson,mobileFailure } from '@/lib/server/mobile-response';
import { readMobileManagedAccounts,saveMobileManagedAccount } from '@/lib/server/mobile-managed-accounts';
export const runtime='nodejs';
export async function GET(request:NextRequest){try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileManagedAccounts(user,request.nextUrl.searchParams));}catch(error){return mobileFailure(error);}}
export async function POST(request:NextRequest){try{const{user}=await requireMobileSession(request);return mobileJson(await saveMobileManagedAccount(user,request,'POST'));}catch(error){return mobileFailure(error);}}
