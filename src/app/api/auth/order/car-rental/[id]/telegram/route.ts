import { after, NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { himotoPool } from '@/lib/server/himoto-database';
import { ContractTelegramError, readContractTelegram, saveContractTelegram } from '@/lib/server/contract-telegram';
import { dispatchContractNotifications } from '@/lib/server/contract-notifications';
import { dispatchTelegramRetractions,TelegramRetractionError } from '@/lib/server/telegram-retractions';

export const runtime='nodejs';
export const maxDuration=300;
type Params={params:Promise<{id:string}>};
async function handle(request:NextRequest,{params}:Params,writing:boolean) {
  let client,action='';
  try {
    const {id}=await params,user=dataAccess.getStore()!;
    if(!/^[1-9]\d{0,14}$/.test(id)||!Number.isSafeInteger(Number(id)))throw new ContractTelegramError('Mã hợp đồng không hợp lệ.');
    client=await himotoPool.connect();
    await client.query(writing?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='15s'");
    if(writing) {
      const body=await request.text();if(body.length>2048)throw new ContractTelegramError('Yêu cầu quá lớn.',413);
      const input=JSON.parse(body);action=input?.action||'';
      await saveContractTelegram(client,Number(id),user.id,user,input);
    }
    const {state}=await readContractTelegram(client,Number(id),user.id,user);
    await client.query('COMMIT');
    const pending=state.events.some(event=>event.status==='pending'||event.status==='sending');
    if(writing||pending)after(async()=>{if(action==='retract')await dispatchTelegramRetractions(undefined,1,undefined,[Number(id)]);else await dispatchContractNotifications(undefined,1,undefined,[Number(id)]);});
    return NextResponse.json({status:'success',data:state},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error) {
    if(client)await client.query('ROLLBACK').catch(()=>{});
    const known=error instanceof ContractTelegramError||error instanceof TelegramRetractionError;
    return NextResponse.json({status:'error',message:known?error.message:'Không xử lý được Telegram của hợp đồng.'},{status:known?error.status:error instanceof SyntaxError?400:500});
  }finally{client?.release();}
}
export const GET=withAccessRequest((request:NextRequest,params:Params)=>handle(request,params,false));
export const POST=withAccessRequest((request:NextRequest,params:Params)=>handle(request,params,true));
