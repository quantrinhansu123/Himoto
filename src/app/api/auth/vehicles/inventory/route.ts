import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { readVehicleInventory } from '@/lib/server/vehicle-inventory';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime='nodejs';
export const GET=withAccessRequest(async(_request:NextRequest)=>{
  try {
    const data=await readVehicleInventory(himotoPool);
    return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    return failureResponse('Không tải được kho xe chung.',error);
  }
});
