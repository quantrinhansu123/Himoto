import { NextRequest,NextResponse } from 'next/server';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { isSePayConnectivityTest,parseSePayPayload,processSePayEvent,sepayConfig,SePayError,validSePayAuthorization } from '@/lib/server/sepay';
import { publicFailure } from '@/lib/server/public-failure';
export const runtime='nodejs';
export async function POST(request:NextRequest){let client;
  try{const config=sepayConfig();if(!validSePayAuthorization(request.headers.get('authorization'),config.secret))return NextResponse.json({success:false},{status:401});
    const text=await request.text();if(Buffer.byteLength(text)>65536)throw new SePayError('Webhook quá lớn.',413);
    let raw;try{raw=JSON.parse(text);}catch{throw new SePayError('JSON không hợp lệ.');}
    if(isSePayConnectivityTest(raw))return NextResponse.json({success:true},{headers:{'Cache-Control':'no-store'}});
    const input=parseSePayPayload(raw);client=await ownerDatabase.connect();await client.query('BEGIN');const result=await processSePayEvent(client,input,config);await client.query('COMMIT');
    return NextResponse.json({success:true,...result},{headers:{'Cache-Control':'no-store'}});
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});return NextResponse.json({success:false,message:error instanceof SePayError?error.message:publicFailure('Chưa ghi nhận được giao dịch. Hệ thống sẽ nhận lại khi SePay thử lại.',error)},{status:error instanceof SePayError?error.status:500});}
  finally{client?.release();}
}
