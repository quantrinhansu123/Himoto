import { NextRequest } from 'next/server';
import { handleBatteryContractRequest } from '@/lib/server/battery-contracts-route';
export const runtime = 'nodejs';
export const GET = (request: NextRequest) => handleBatteryContractRequest(request, 'GET');
export const POST = (request: NextRequest) => handleBatteryContractRequest(request, 'POST');
