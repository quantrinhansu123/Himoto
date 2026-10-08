import { NextRequest } from 'next/server';
import { handleDutyRequest } from '@/lib/server/duty-roster-route';
export const runtime='nodejs';
type Params={params:Promise<{id:string}>};
export const PATCH=async(request:NextRequest,{params}:Params)=>handleDutyRequest(request,'PATCH',(await params).id);
export const DELETE=async(request:NextRequest,{params}:Params)=>handleDutyRequest(request,'DELETE',(await params).id);
