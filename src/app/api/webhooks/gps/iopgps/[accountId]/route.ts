import { NextRequest,NextResponse } from 'next/server';
import { receiveIopGpsWebhook,validGpsWebhookKey } from '@/lib/server/gps-webhooks';
export const runtime='nodejs';
export const maxDuration=30;
type Context={params:Promise<{accountId:string}>};
async function authenticated(request:NextRequest,context:Context) {
  const {accountId}=await context.params;
  const key=request.headers.get('authorization')?.replace(/^Bearer /,'')||request.nextUrl.searchParams.get('key');
  return await validGpsWebhookKey(accountId,key)?accountId:null;
}
export async function GET(request:NextRequest,context:Context) {
  try{const allowed=await authenticated(request,context);return NextResponse.json({status:allowed?'success':'error'},{status:allowed?200:401,headers:{'Cache-Control':'no-store'}});}
  catch{return NextResponse.json({status:'error'},{status:503});}
}
export async function POST(request:NextRequest,context:Context) {
  try {
    const accountId=await authenticated(request,context);
    if(!accountId)return NextResponse.json({status:'error'},{status:401});
    const reader=request.body?.getReader();if(!reader)return NextResponse.json({status:'error'},{status:400});
    const chunks:Uint8Array[]=[];let length=0;
    while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.byteLength;if(length>65536){await reader.cancel();return NextResponse.json({status:'error'},{status:413});}chunks.push(chunk.value);}
    let raw:unknown;try{raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return NextResponse.json({status:'error'},{status:400});}
    const result=await receiveIopGpsWebhook(accountId,raw);
    return NextResponse.json({status:'success',result:result.status},{headers:{'Cache-Control':'no-store'}});
  }catch(error){const invalid=error instanceof Error&&/^GPS_(WEBHOOK|EVENT)_/.test(error.message);return NextResponse.json({status:'error'},{status:invalid?400:503});}
}
