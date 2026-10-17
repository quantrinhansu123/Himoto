import { NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { syncGpsAccounts } from '@/lib/server/gps-sync';
export const runtime='nodejs';
export const maxDuration=60;
export const POST=withAccessRequest(async()=>{
  try{const result=await syncGpsAccounts();if(result.attempted>0&&result.succeeded===0)throw new Error();return NextResponse.json({status:'success'},{headers:{'Cache-Control':'no-store'}});}
  catch{return NextResponse.json({status:'error',message:'Chưa đồng bộ được GPS. Trạng thái gần nhất được giữ nguyên.'},{status:503});}
});
