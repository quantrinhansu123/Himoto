import type {NextRequest} from 'next/server';
import {NextResponse} from 'next/server';
import {dataAccess} from './access-context';
import {batteryMedia} from './battery-media';
import {MobileError} from './mobile-session';
import {failureResponse} from './public-failure';
export async function handleBatteryMedia(request:NextRequest,{params}:{params:Promise<{id:string;eventKey:string;fileId?:string}>}){
  try{const actor=dataAccess.getStore()!;const user={id:actor.id,name:'',email:'',role:actor.role||'',role_slug:actor.role_slug||'',access_role:actor.access_role||undefined,permissions:actor.permissions,store_id:actor.store_id,scope_all:actor.scope_all};const result=await batteryMedia(user,await params,request);return result instanceof Response?result:NextResponse.json({status:'success',data:result},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return error instanceof MobileError?NextResponse.json({status:'error',message:error.message},{status:error.status}):failureResponse('Không xử lý được ảnh pin. Giữ bộ ảnh và thử lại.',error);}
}
