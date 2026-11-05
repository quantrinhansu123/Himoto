import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool,ownerDatabase } from '@/lib/server/himoto-database';
import { dataAccess } from '@/lib/server/access-context';
import { isAdminAccount } from '@/lib/management/permissions';
import { readSelectedVehicleGps,selectedVehicleIds } from '@/lib/server/selected-vehicle-gps';
import {readGpsWorkspace,writeGpsMapping} from '@/lib/server/gps-workspace';
import { failureResponse } from '@/lib/server/public-failure';
export const runtime='nodejs';
export const GET=withAccessRequest(async(request:NextRequest)=>{
  if(request.nextUrl.searchParams.has('vehicle_ids')){
    let ids:number[];try{ids=selectedVehicleIds(request.nextUrl.searchParams.get('vehicle_ids')||'');}catch{return NextResponse.json({status:'error',message:'Chọn từ 1 đến 20 xe hợp lệ.'},{status:400});}
    try{return NextResponse.json({status:'success',data:{selected_vehicles:await readSelectedVehicleGps(himotoPool,ids)}},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failureResponse('Chưa tải được GPS của xe.',error);}
  }
  const store=request.nextUrl.searchParams.get('store')||'all';
  if(store!=='all'&&!/^[1-9]\d{0,14}$/.test(store))return NextResponse.json({status:'error',message:'Cơ sở không hợp lệ.'},{status:400});
  const source=request.nextUrl.searchParams.get('event_source')||'all',device=request.nextUrl.searchParams.get('event_device')||'';
  if(!['all','poll','history','webhook'].includes(source)||device&&!/^[1-9]\d{0,14}$/.test(device))return NextResponse.json({status:'error',message:'Bộ lọc nhật ký không hợp lệ.'},{status:400});
  try{
    const data=await readGpsWorkspace(himotoPool,store,source,device);
    return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failureResponse('Không tải được trạng thái GPS.',error);}
});
export const PATCH=withAccessRequest(async(request:NextRequest)=>{
  if(!isAdminAccount(dataAccess.getStore()))return NextResponse.json({status:'error',message:'Chỉ quản trị được ghép GPS với xe.'},{status:403});
  try{const raw=await request.text();if(raw.length>1024)throw Error();const body=JSON.parse(raw);if(!Number.isSafeInteger(body.device_id)||body.device_id<1||body.vehicle_id!==null&&(!Number.isSafeInteger(body.vehicle_id)||body.vehicle_id<1))throw Error();
    const result=await writeGpsMapping(ownerDatabase,body.device_id,body.vehicle_id);
    if(!result.rowCount)throw Error();return NextResponse.json({status:'success'});
  }catch(error){return error && typeof error==='object' && 'code' in error ? failureResponse('Không ghép được GPS với xe.',error) : NextResponse.json({status:'error',message:'Kiểm tra GPS và xe cần ghép.'},{status:400});}
});
