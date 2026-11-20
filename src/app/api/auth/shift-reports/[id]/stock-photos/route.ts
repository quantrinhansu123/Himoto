import {NextRequest, NextResponse} from 'next/server';
import {withAccessRequest} from '@/lib/server/access-request';
import {himotoPool} from '@/lib/server/himoto-database';
import {readShiftStockCheck} from '@/lib/server/shift-stock-photos';
import {ShiftRequestError} from '@/lib/server/shift-report-requests';

export const runtime = 'nodejs';

export const GET = withAccessRequest(async (request:NextRequest, {params}:{params:Promise<{id:string}>}) => {
  const rawId = (await params).id;
  const id = Number(rawId);
  if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(id) || request.nextUrl.search) {
    return NextResponse.json({message:'Báo cáo kiểm kê không hợp lệ.'},{status:400});
  }
  const client = await himotoPool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const data = await readShiftStockCheck(client,id);
    await client.query('COMMIT');
    return NextResponse.json({data},{headers:{'Cache-Control':'private, no-store'}});
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>{});
    if (error instanceof ShiftRequestError) return NextResponse.json({message:error.message},{status:error.status});
    throw error;
  } finally {
    client.release();
  }
});
