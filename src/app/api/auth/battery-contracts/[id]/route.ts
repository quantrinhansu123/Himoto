import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest } from 'next/server';
import { handleBatteryContractRequest } from '@/lib/server/battery-contracts-route';
export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string }> };
const PATCHHandler = async (request: NextRequest, { params }: Params) => handleBatteryContractRequest(request, 'PATCH', (await params).id);
const DELETEHandler = async (request: NextRequest, { params }: Params) => handleBatteryContractRequest(request, 'DELETE', (await params).id);

export const PATCH = withAccessRequest(PATCHHandler);
export const DELETE = withAccessRequest(DELETEHandler);
