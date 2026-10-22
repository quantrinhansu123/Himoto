import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { failureResponse } from '@/lib/server/public-failure';
export const runtime='nodejs';
export const GET=withAccessRequest(async(_request:NextRequest)=>{
  try{return NextResponse.json({status:'success',data:(await himotoPool.query('SELECT * FROM himoto.store_directory()')).rows},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return failureResponse('Không tải được danh sách cơ sở.',error);}
});
