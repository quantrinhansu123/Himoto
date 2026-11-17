import type {NextRequest} from 'next/server';
import {requireMobileSession,MobileError} from '@/lib/server/mobile-session';
import {isAdminAccount} from '@/lib/management/permissions';
import {mobileJson,mobileFailure} from '@/lib/server/mobile-response';
import {readIntegrationHealth} from '@/lib/server/integration-health';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:NextRequest){try{
  const{user}=await requireMobileSession(request);
  if(!isAdminAccount(user))throw new MobileError('Chỉ quản trị được xem tình trạng tích hợp.',403,'FORBIDDEN');
  return mobileJson(await readIntegrationHealth());
}catch(error){return mobileFailure(error);}}
