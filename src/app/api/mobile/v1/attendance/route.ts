import { NextRequest } from 'next/server';
import { mobileSupport } from '@/lib/server/mobile-support';
import { handleAttendance } from '@/lib/server/attendance-handler';
export const runtime='nodejs';
export const maxDuration=30;
export const GET=(request:NextRequest)=>mobileSupport(request,handleAttendance);
export const POST=GET;
