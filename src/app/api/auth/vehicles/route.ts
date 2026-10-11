import { NextRequest } from 'next/server';
import { saveVehicle } from '@/lib/server/vehicle-route';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) { return saveVehicle(request, null); }
