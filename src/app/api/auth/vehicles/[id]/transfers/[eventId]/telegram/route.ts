import { after,NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { readVehicleTransferTelegram,saveVehicleTransferTelegram,VehicleTransferTelegramError } from '@/lib/server/vehicle-transfer-telegram';
import { dispatchContractNotifications } from '@/lib/server/contract-notifications';
export const runtime='nodejs';
export const maxDuration=300;
type Params={params:Promise<{id:string;eventId:string}>};
async function handle(request:NextRequest,{params}:Params,writing:boolean){
  let client;
  try{
    const {id,eventId}=await params;
    if(![id,eventId].every(value=>/^[1-9]\d{0,14}$/.test(value)&&Number.isSafeInteger(Number(value))))throw new VehicleTransferTelegramError('Mã xe/lượt chuyển không hợp lệ.');
    if(writing){const raw=await request.text();let body;try{body=raw.length<=100?JSON.parse(raw):null;}catch{body=null;}if(!body||body.action!=='send'||Object.keys(body).length!==1)throw new VehicleTransferTelegramError('Chọn thao tác gửi hợp lệ.');}
    client=await ownerDatabase.connect();await client.query(writing?'BEGIN':'BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout='15s'");
    const user=dataAccess.getStore()!;
    const state=writing?await saveVehicleTransferTelegram(client,Number(id),Number(eventId),user):(await readVehicleTransferTelegram(client,Number(id),Number(eventId),user)).state;
    await client.query('COMMIT');
    if(writing)after(async()=>{await dispatchContractNotifications(undefined,1,undefined,undefined,[Number(eventId)]);});
    return NextResponse.json({status:'success',data:state},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});return NextResponse.json({status:'error',message:error instanceof VehicleTransferTelegramError?error.message:'Không xử lý được Telegram của lượt chuyển xe.'},{status:error instanceof VehicleTransferTelegramError?error.status:500});}
  finally{client?.release();}
}
export const GET=withAccessRequest((request:NextRequest,params:Params)=>handle(request,params,false));
export const POST=withAccessRequest((request:NextRequest,params:Params)=>handle(request,params,true));
