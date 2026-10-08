import { NextRequest } from 'next/server';
import { handleDutyRequest } from '@/lib/server/duty-roster-route';
export const runtime='nodejs';
export const GET=(request:NextRequest)=>handleDutyRequest(request,'GET');
export const POST=(request:NextRequest)=>handleDutyRequest(request,'POST');
