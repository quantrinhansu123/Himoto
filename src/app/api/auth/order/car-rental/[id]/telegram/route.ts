import { after, NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { himotoPool } from '@/lib/server/himoto-database';
import { ContractTelegramError, readContractTelegram, saveContractTelegram } from '@/lib/server/contract-telegram';
import { dispatchContractNotifications } from '@/lib/server/contract-notifications';
import { dispatchTelegramRetractions,TelegramRetractionError } from '@/lib/server/telegram-retractions';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime='nodejs';
export const maxDuration=300;
type Params={params:Promise<{id:string}>};
async function handle(request:NextRequest,{params}:Params,writing:boolean) {
  let client,action='',queued=false;
  try {
    const {id}=await params,user=dataAccess.getStore()!;
    if(!/^[1-9]\d{0,14}$/.test(id)||!Number.isSafeInteger(Number(id)))throw new ContractTelegramError('Mã hợp đồng không hợp lệ.');
    client=await himotoPool.connect();
    await client.query(writing?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("SET LOCAL lock_timeout='3s'");
    if(writing) {
      const body=await request.text();if(body.length>2048)throw new ContractTelegramError('Yêu cầu quá lớn.',413);
      const input=JSON.parse(body);action=input?.action||'';
      const outcome=await saveContractTelegram(client,Number(id),user.id,user,input);
      if(outcome==='retract')action='retract';
      // Persist the outbox and release the order lock before refreshing history.
      // A slow preview must not undo an accepted send or prevent its worker.
      await client.query('COMMIT');
      queued=true;
      after(async()=>{if(action==='retract')await dispatchTelegramRetractions(undefined,1,undefined,[Number(id)]);else await dispatchContractNotifications(undefined,1,undefined,[Number(id)]);});
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout='15s'");
    }
    const {state}=await readContractTelegram(client,Number(id),user.id,user);
    await client.query('COMMIT');
    const pending=state.events.some(event=>event.status==='pending'||event.status==='sending');
    const retracting=state.events.some(event=>event.status==='retracting');
    if(!writing&&(pending||retracting))after(async()=>{if(retracting&&!pending)await dispatchTelegramRetractions(undefined,1,undefined,[Number(id)]);else await dispatchContractNotifications(undefined,1,undefined,[Number(id)]);});
    return NextResponse.json({status:'success',data:state},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error) {
    if(client)await client.query('ROLLBACK').catch(()=>{});
    if(queued)return NextResponse.json({status:'error',message:'Đã lưu yêu cầu Telegram nhưng chưa tải được trạng thái mới. Bấm Làm mới nội dung và ảnh để kiểm tra kết quả trước khi gửi lại.'},{status:503});
    const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
    if(code==='55P03'||code==='57014')return NextResponse.json({status:'error',message:'Hợp đồng đang bận hoặc tải nội dung quá lâu. Yêu cầu này chưa được lưu. Bấm Làm mới nội dung và ảnh để kiểm tra rồi thử lại.'},{status:code==='55P03'?409:504});
    const known=error instanceof ContractTelegramError||error instanceof TelegramRetractionError;
    if(known)return NextResponse.json({status:'error',message:error.message},{status:error.status});
    if(error instanceof SyntaxError)return NextResponse.json({status:'error',message:'Thông tin Telegram không hợp lệ.'},{status:400});
    return failureResponse('Không xử lý được Telegram của hợp đồng.',error);
  }finally{client?.release();}
}
export const GET=withAccessRequest((request:NextRequest,params:Params)=>handle(request,params,false));
export const POST=withAccessRequest((request:NextRequest,params:Params)=>handle(request,params,true));
