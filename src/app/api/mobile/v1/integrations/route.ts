import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { mobileJson,mobileFailure } from '@/lib/server/mobile-response';
import { readMobileIntegrations,saveMobileIntegration } from '@/lib/server/mobile-integrations';
export const runtime='nodejs';
export async function GET(request:NextRequest){try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileIntegrations(user));}catch(error){return mobileFailure(error);}}
export async function POST(request:NextRequest){try{const{user}=await requireMobileSession(request);return mobileJson(await saveMobileIntegration(user,request));}catch(error){return mobileFailure(error);}}
