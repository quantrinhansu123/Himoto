import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { isAdminAccount } from '@/lib/management/permissions';
import { readIntegrationSettings,saveIntegrationSettings,IntegrationSettingsError } from '@/lib/server/integration-settings';
export const runtime='nodejs';
export const GET=withAccessRequest(async()=>{
  if(!isAdminAccount(dataAccess.getStore()))return NextResponse.json({status:'error',message:'Chỉ quản trị được cấu hình tích hợp.'},{status:403});
  try{return NextResponse.json({status:'success',data:await readIntegrationSettings()},{headers:{'Cache-Control':'no-store'}});}
  catch{return NextResponse.json({status:'error',message:'Không tải được cấu hình tích hợp.'},{status:500});}
});
export const POST=withAccessRequest(async(request:NextRequest)=>{
  if(!isAdminAccount(dataAccess.getStore()))return NextResponse.json({status:'error',message:'Chỉ quản trị được cấu hình tích hợp.'},{status:403});
  try{const text=await request.text();if(Buffer.byteLength(text)>20000)throw new IntegrationSettingsError('Cấu hình quá lớn.');let raw;try{raw=JSON.parse(text);}catch{throw new IntegrationSettingsError('Dữ liệu cấu hình không hợp lệ.');}await saveIntegrationSettings(raw);return NextResponse.json({status:'success'});}
  catch(error){return NextResponse.json({status:'error',message:error instanceof IntegrationSettingsError?error.message:'Không lưu được cấu hình tích hợp.'},{status:error instanceof IntegrationSettingsError?error.status:500});}
});
