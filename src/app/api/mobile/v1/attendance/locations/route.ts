import type { NextRequest } from 'next/server';
import { mobileSupport } from '@/lib/server/mobile-support';
import { handleAttendanceLocations } from '@/lib/server/attendance-locations-handler';
export const runtime = 'nodejs';
export const GET = (request: NextRequest) => mobileSupport(request, handleAttendanceLocations);
export const PUT = GET;
