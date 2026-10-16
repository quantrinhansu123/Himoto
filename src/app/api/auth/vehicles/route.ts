import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest } from 'next/server';
import { saveVehicle } from '@/lib/server/vehicle-route';

export const runtime = 'nodejs';
async function POSTHandler(request: NextRequest) { return saveVehicle(request, null); }

export const POST = withAccessRequest(POSTHandler);
