import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
export const runtime='nodejs';
export const GET=withAccessRequest(async(_request:NextRequest)=>{
  const result=await himotoPool.query('SELECT id,full_name,position,status,store_id FROM himoto.staff_profiles ORDER BY id DESC');
  return NextResponse.json({status:'success',data:result.rows},{headers:{'Cache-Control':'no-store'}});
});
