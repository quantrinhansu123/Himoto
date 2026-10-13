import { NextRequest } from 'next/server';
import { handleBatteryContractRequest } from '@/lib/server/battery-contracts-route';
export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string }> };
export const PATCH = async (request: NextRequest, { params }: Params) => handleBatteryContractRequest(request, 'PATCH', (await params).id);
export const DELETE = async (request: NextRequest, { params }: Params) => handleBatteryContractRequest(request, 'DELETE', (await params).id);
