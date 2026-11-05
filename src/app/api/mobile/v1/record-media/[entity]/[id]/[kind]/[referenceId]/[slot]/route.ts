import {NextRequest,NextResponse} from 'next/server';
import {requireMobileSession} from '@/lib/server/mobile-session';
import {readMobileRecordMediaImage,readMobileMediaSlotInfo} from '@/lib/server/mobile-record-media';
import {uploadMobileRecordMedia} from '@/lib/server/mobile-record-media-write';
import {deleteMobileRecordMedia} from '@/lib/server/mobile-media-delete';
import {mobileFailure,mobileJson,MOBILE_HEADERS} from '@/lib/server/mobile-response';
export const runtime='nodejs';
type Params={params:Promise<{entity:string;id:string;kind:string;referenceId:string;slot:string}>};
export async function GET(request:NextRequest,{params}:Params) {
  try{
    const {user}=await requireMobileSession(request),raw=await params;
    if(!request.nextUrl.searchParams.has('revision'))return mobileJson(await readMobileMediaSlotInfo(user,raw,raw.slot,request));
    const image=await readMobileRecordMediaImage(user,raw,raw.slot,request);
    return new NextResponse(new Uint8Array(image.data),{headers:{...MOBILE_HEADERS,'Content-Type':image.mimeType,'Content-Length':String(image.data.byteLength),
      'Content-Disposition':'inline; filename=record-photo','ETag':`"${image.revision}"`}});
  }catch(error){return mobileFailure(error);}
}
export async function PUT(request:NextRequest,{params}:Params) {
  try{const {user}=await requireMobileSession(request),raw=await params;return mobileJson(await uploadMobileRecordMedia(user,raw,raw.slot,request));}
  catch(error){return mobileFailure(error);}
}
export async function DELETE(request:NextRequest,{params}:Params){
  try{const {user}=await requireMobileSession(request),raw=await params;return mobileJson(await deleteMobileRecordMedia(user,raw,raw.slot,request));}
  catch(error){return mobileFailure(error);}
}
