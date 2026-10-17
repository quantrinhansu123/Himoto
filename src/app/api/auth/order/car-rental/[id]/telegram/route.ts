import { after, NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { himotoPool } from '@/lib/server/himoto-database';
import { ContractTelegramError, readContractTelegram, saveContractTelegram } from '@/lib/server/contract-telegram';
import { dispatchContractNotifications } from '@/lib/server/contract-notifications';

export const runtime='nodejs';
type Params={params:Promise<{id:string}>};
async function handle(request:NextRequest,{params}:Params,writing:boolean) {
  let client;
  try {
    const {id}=await params,user=dataAccess.getStore()!;
    if(!/^[1-9]\d{0,14}$/.test(id)||!Number.isSafeInteger(Number(id)))throw new ContractTelegramError('Mã hợp đồng không hợp lệ.');
    client=await himotoPool.connect();
    await client.query(writing?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='15s'");
    if(writing) {
      const body=await request.text();if(body.length>2048)throw new ContractTelegramError('Yêu cầu quá lớn.',413);
      await saveContractTelegram(client,Number(id),user.id,user,JSON.parse(body));
    }
    const {state}=await readContractTelegram(client,Number(id),user.id,user);
    await client.query('COMMIT');
    if(writing)after(async()=>{await dispatchContractNotifications();});
    return NextResponse.json({status:'success',data:state},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error) {
    if(client)await client.query('ROLLBACK').catch(()=>{});
    return NextResponse.json({status:'error',message:error instanceof ContractTelegramError?error.message:'Không xử lý được Telegram của hợp đồng.'},{status:error instanceof ContractTelegramError?error.status:error instanceof SyntaxError?400:500});
  }finally{client?.release();}
}
export const GET=withAccessRequest((request:NextRequest,params:Params)=>handle(request,params,false));
export const POST=withAccessRequest((request:NextRequest,params:Params)=>handle(request,params,true));
