import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest } from 'next/server';
import { handleDutyRequest } from '@/lib/server/duty-roster-route';
export const runtime='nodejs';
const GETHandler=(request:NextRequest)=>handleDutyRequest(request,'GET');
const POSTHandler=(request:NextRequest)=>handleDutyRequest(request,'POST');

export const GET = withAccessRequest(GETHandler);
export const POST = withAccessRequest(POSTHandler);
