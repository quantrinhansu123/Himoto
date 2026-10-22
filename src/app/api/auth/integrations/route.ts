import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { isAdminAccount } from '@/lib/management/permissions';
import { readIntegrationSettings,saveIntegrationSettings,IntegrationSettingsError } from '@/lib/server/integration-settings';
import { failureResponse } from '@/lib/server/public-failure';
export const runtime='nodejs';
export const GET=withAccessRequest(async()=>{
  if(!isAdminAccount(dataAccess.getStore()))return NextResponse.json({status:'error',message:'Chỉ quản trị được cấu hình tích hợp.'},{status:403});
  try{return NextResponse.json({status:'success',data:await readIntegrationSettings()},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return failureResponse('Không tải được cấu hình tích hợp.',error);}
});
export const POST=withAccessRequest(async(request:NextRequest)=>{
  if(!isAdminAccount(dataAccess.getStore()))return NextResponse.json({status:'error',message:'Chỉ quản trị được cấu hình tích hợp.'},{status:403});
  try{const text=await request.text();if(Buffer.byteLength(text)>20000)throw new IntegrationSettingsError('Cấu hình quá lớn.');let raw;try{raw=JSON.parse(text);}catch{throw new IntegrationSettingsError('Dữ liệu cấu hình không hợp lệ.');}await saveIntegrationSettings(raw);return NextResponse.json({status:'success'});}
  catch(error){return error instanceof IntegrationSettingsError?NextResponse.json({status:'error',message:error.message},{status:error.status}):failureResponse('Không lưu được cấu hình tích hợp.',error);}
});
