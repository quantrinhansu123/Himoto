import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { dataAccess } from '@/lib/server/access-context';
import { closeReservationNoShow,ReservationNoShowError } from '@/lib/server/reservation-no-show';
import { failureResponse } from '@/lib/server/public-failure';
export const runtime='nodejs';
export const POST=withAccessRequest(async(request:NextRequest,{params}:{params:Promise<{id:string}>})=>{
 let client;
 try{const {id}=await params;if(!/^[1-9]\d{0,14}$/.test(id))throw new ReservationNoShowError('Mã hợp đồng không hợp lệ.');const input=await request.json();client=await himotoPool.connect();await client.query('BEGIN');const data=await closeReservationNoShow(client,Number(id),dataAccess.getStore()!.id,input);await client.query('COMMIT');return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});return error instanceof ReservationNoShowError?NextResponse.json({status:'error',message:error.message},{status:error.status}):error instanceof SyntaxError?NextResponse.json({status:'error',message:'Thông tin không hợp lệ.'},{status:400}):failureResponse('Không chốt được khách không đến. Tải lại để kiểm tra.',error);}finally{client?.release();}
});
