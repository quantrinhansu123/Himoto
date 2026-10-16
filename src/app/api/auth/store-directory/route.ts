import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
export const runtime='nodejs';
export const GET=withAccessRequest(async(_request:NextRequest)=>NextResponse.json({status:'success',data:(await himotoPool.query('SELECT * FROM himoto.store_directory()')).rows},{headers:{'Cache-Control':'no-store'}}));
