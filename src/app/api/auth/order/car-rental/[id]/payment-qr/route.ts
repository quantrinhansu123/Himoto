import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { readContractQr,SePayError } from '@/lib/server/sepay';
import { failureResponse } from '@/lib/server/public-failure';
export const runtime='nodejs';
export const GET=withAccessRequest(async(request:NextRequest,{params}:{params:Promise<{id:string}>})=>{
  try{const {id}=await params,raw=request.nextUrl.searchParams.get('amount'),account=request.nextUrl.searchParams.get('account_id');if(!/^[1-9]\d*$/.test(id)||raw!==null&&!/^\d{1,13}$/.test(raw)||account!==null&&!/^[1-9]\d{0,15}$/.test(account))throw new SePayError('Hợp đồng, tài khoản hoặc số tiền không hợp lệ.');
    return NextResponse.json({status:'success',data:await readContractQr(himotoPool,Number(id),raw===null?undefined:Number(raw),account===null?undefined:Number(account))},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return error instanceof SePayError?NextResponse.json({status:'error',message:error.message},{status:error.status}):failureResponse('Không tải được thông tin QR của hợp đồng.',error);}
});
