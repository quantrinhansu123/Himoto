import {NextRequest,NextResponse} from 'next/server';
import {withAccessRequest} from '@/lib/server/access-request';
import {himotoPool} from '@/lib/server/himoto-database';
import {revenueLedger,RevenueLedgerError} from '@/lib/server/revenue-ledger';
import {failureResponse} from '@/lib/server/public-failure';
export const runtime='nodejs';
export const maxDuration=60;
export const GET=withAccessRequest(async(request:NextRequest)=>{
 let client;
 try{client=await himotoPool.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='30s'");
   const data=await revenueLedger(client,request.nextUrl.searchParams);await client.query('COMMIT');return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});return error instanceof RevenueLedgerError?NextResponse.json({status:'error',message:error.message},{status:error.status}):failureResponse('Không tải được sổ giao dịch doanh thu.',error);}
 finally{client?.release();}
});
