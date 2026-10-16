import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest } from 'next/server';
import { handleBatteryContractRequest } from '@/lib/server/battery-contracts-route';
export const runtime = 'nodejs';
const GETHandler = (request: NextRequest) => handleBatteryContractRequest(request, 'GET');
const POSTHandler = (request: NextRequest) => handleBatteryContractRequest(request, 'POST');

export const GET = withAccessRequest(GETHandler);
export const POST = withAccessRequest(POSTHandler);
