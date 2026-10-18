import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';

export const runtime='nodejs';
export const GET=withAccessRequest(async(_request:NextRequest)=>{
  try {
    const result=await himotoPool.query('SELECT * FROM himoto.vehicle_inventory()');
    return NextResponse.json({status:'success',data:result.rows},{headers:{'Cache-Control':'private, no-store'}});
  }catch{
    return NextResponse.json({status:'error',message:'Không tải được kho xe chung. Bấm Làm mới để thử lại.'},{status:500});
  }
});
