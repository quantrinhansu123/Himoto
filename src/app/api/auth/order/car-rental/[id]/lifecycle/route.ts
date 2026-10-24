import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { himotoPool } from '@/lib/server/himoto-database';
import { applyContractLifecycle,ContractLifecycleError,readContractLifecycle } from '@/lib/server/contract-lifecycle';
import { failureResponse } from '@/lib/server/public-failure';
export const runtime='nodejs';
type Params={params:Promise<{id:string}>};
async function handle(request:NextRequest,{params}:Params,writing:boolean){let client;try{
  const {id}=await params;if(!/^[1-9]\d{0,14}$/.test(id)||!Number.isSafeInteger(Number(id)))throw new ContractLifecycleError('Mã hợp đồng không hợp lệ.');
  let input:unknown;if(writing){const raw=await request.text();if(raw.length>16384)throw new ContractLifecycleError('Thông tin thao tác vượt giới hạn.',413);input=JSON.parse(raw);}
  client=await himotoPool.connect();await client.query(writing?'BEGIN':'BEGIN READ ONLY');
  const data=writing?await applyContractLifecycle(client,Number(id),dataAccess.getStore()!.id,input):await readContractLifecycle(client,Number(id));
  await client.query('COMMIT');return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});
  if(error instanceof ContractLifecycleError)return NextResponse.json({status:'error',message:error.message},{status:error.status});
  if(error instanceof SyntaxError)return NextResponse.json({status:'error',message:'Thông tin thao tác không hợp lệ.'},{status:400});
  if(error&&typeof error==='object'&&'code'in error&&['42501','P0001','55P03','40P01','23505'].includes(String(error.code)))return NextResponse.json({status:'error',message:'Xe hoặc hợp đồng đã thay đổi, đang được xử lý hoặc trùng lịch. Tải lại tình trạng và chọn xe đang rảnh.'},{status:409});
  return failureResponse('Chưa ghi nhận được tình trạng hợp đồng. Giữ thông tin và thử lại.',error);
}finally{client?.release();}}
export const GET=withAccessRequest((request:NextRequest,params:Params)=>handle(request,params,false));
export const POST=withAccessRequest((request:NextRequest,params:Params)=>handle(request,params,true));
