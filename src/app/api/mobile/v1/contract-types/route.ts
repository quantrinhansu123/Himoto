import { NextRequest } from 'next/server';
import { requireMobileSession } from '@/lib/server/mobile-session';
import { mobileJson,mobileFailure } from '@/lib/server/mobile-response';
import { readMobileContractTypes,saveMobileContractType } from '@/lib/server/mobile-contract-types';
export const runtime='nodejs';
export async function GET(request:NextRequest){try{const{user}=await requireMobileSession(request);return mobileJson(await readMobileContractTypes(user));}catch(error){return mobileFailure(error);}}
export async function POST(request:NextRequest){try{const{user}=await requireMobileSession(request);return mobileJson(await saveMobileContractType(user,request));}catch(error){return mobileFailure(error);}}
export async function PATCH(request:NextRequest){try{const{user}=await requireMobileSession(request);return mobileJson(await saveMobileContractType(user,request,true));}catch(error){return mobileFailure(error);}}
