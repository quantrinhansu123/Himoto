import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { ContractPaymentError } from '@/lib/server/contract-payments';
import { DebtReminderError,readDebtReminderContext } from '@/lib/server/debt-reminders';
import { failureResponse } from '@/lib/server/public-failure';
export const runtime='nodejs';
export const GET=withAccessRequest(async(_request:NextRequest,{params}:{params:Promise<{id:string}>})=>{
  try {const {id}=await params;if(!/^[1-9]\d{0,15}$/.test(id))throw new DebtReminderError('Hợp đồng không hợp lệ.');
    return NextResponse.json({status:'success',data:await readDebtReminderContext(himotoPool,Number(id))},{headers:{'Cache-Control':'no-store'}});
  }catch(error){const known=error instanceof DebtReminderError||error instanceof ContractPaymentError;return known?NextResponse.json({status:'error',message:error.message},{status:error.status}):failureResponse('Không tải được thông tin nhắc nợ.',error);}
});
