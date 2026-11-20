import {NextRequest, NextResponse} from 'next/server';
import {withAccessRequest, withAccessUser} from '@/lib/server/access-request';
import {himotoPool} from '@/lib/server/himoto-database';
import {readShiftStockCheck, mobileShiftStockPhotos as writeShiftStockPhotos} from '@/lib/server/shift-stock-photos';
import {ShiftRequestError} from '@/lib/server/shift-report-requests';
import {MobileError} from '@/lib/server/mobile-session';

export const runtime = 'nodejs';
export const maxDuration = 90;
type Context = {params:Promise<{id:string}>};

export const GET = withAccessRequest(async (request:NextRequest, {params}:Context) => {
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

const write = withAccessUser<Context>(async (request, {params}, user) => {
  const rawId = (await params).id;
  if (!/^[1-9]\d{0,14}$/.test(rawId)) {
    return NextResponse.json({message:'Báo cáo kiểm kê không hợp lệ.'},{status:400});
  }
  try {
    const data = await writeShiftStockPhotos(request,user,Number(rawId));
    return NextResponse.json({data},{headers:{'Cache-Control':'private, no-store'}});
  } catch (error) {
    if (error instanceof MobileError) {
      return NextResponse.json({message:error.message,code:error.code},{status:error.status});
    }
    throw error;
  }
});

export const PUT = write;
export const DELETE = write;
