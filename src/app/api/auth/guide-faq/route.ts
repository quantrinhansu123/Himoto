import { NextRequest } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { handleGuideFaq } from '@/lib/server/guide-faq-handler';
export const runtime = 'nodejs';
async function handle(request:NextRequest) {
  return handleGuideFaq(request, dataAccess.getStore()! as NonNullable<ReturnType<typeof dataAccess.getStore>> & {name:string});
}
export const GET=withAccessRequest(handle);
export const POST=withAccessRequest(handle);
