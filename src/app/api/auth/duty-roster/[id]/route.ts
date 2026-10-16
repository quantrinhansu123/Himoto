import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest } from 'next/server';
import { handleDutyRequest } from '@/lib/server/duty-roster-route';
export const runtime='nodejs';
type Params={params:Promise<{id:string}>};
const PATCHHandler=async(request:NextRequest,{params}:Params)=>handleDutyRequest(request,'PATCH',(await params).id);
const DELETEHandler=async(request:NextRequest,{params}:Params)=>handleDutyRequest(request,'DELETE',(await params).id);

export const PATCH = withAccessRequest(PATCHHandler);
export const DELETE = withAccessRequest(DELETEHandler);
