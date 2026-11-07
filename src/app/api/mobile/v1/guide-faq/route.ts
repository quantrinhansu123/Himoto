import { NextRequest } from 'next/server';
import { mobileSupport } from '@/lib/server/mobile-support';
import { handleGuideFaq } from '@/lib/server/guide-faq-handler';
export const runtime='nodejs';
export const maxDuration=30;
export const GET=(request:NextRequest)=>mobileSupport(request,(input,user)=>handleGuideFaq(input,user,true));
export const POST=GET;
