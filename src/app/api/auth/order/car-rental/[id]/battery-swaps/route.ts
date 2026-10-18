import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { dataAccess } from '@/lib/server/access-context';
import { BatterySwapError,ContractPaymentError,readBatterySwaps,writeBatterySwap } from '@/lib/server/battery-swaps';
import { queueContractNotification } from '@/lib/server/contract-notifications';
export const runtime='nodejs';
async function handler(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 let client;
 try{const raw=await params;if(!/^[1-9]\d{0,14}$/.test(raw.id))throw new BatterySwapError('Mã hợp đồng chưa hợp lệ.');const id=Number(raw.id);
  if(request.method==='GET')return NextResponse.json({status:'success',data:await readBatterySwaps(himotoPool,id)},{headers:{'Cache-Control':'private, no-store'}});
  const body=await request.json();client=await himotoPool.connect();await client.query('BEGIN');
  const result=await writeBatterySwap(client,id,dataAccess.getStore()!.id,body);
  if(result.status==='confirmed')await queueContractNotification(client,id,'battery_swap',`battery-swap:${id}:${result.id}`,dataAccess.getStore()!.id,`battery-swap-${result.id}`);
  await client.query('COMMIT');
  return NextResponse.json({status:'success',data:{...result,id:Number(result.id),item_id:Number(result.item_id),fee:Number(result.fee)}},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});const known=error instanceof BatterySwapError||error instanceof ContractPaymentError;return NextResponse.json({status:'error',message:known?error.message:'Không ghi được lượt đổi pin. Tải lại để kiểm tra.'},{status:known?error.status:error instanceof SyntaxError?400:500});}finally{client?.release();}
}
export const GET=withAccessRequest(handler);export const POST=withAccessRequest(handler);
