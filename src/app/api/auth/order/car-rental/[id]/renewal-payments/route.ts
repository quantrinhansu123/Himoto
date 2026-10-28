import { NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { himotoPool } from '@/lib/server/himoto-database';
import { ContractPaymentError } from '@/lib/server/contract-payments';
import { parseRenewalPaymentCorrection, updateRenewalPayment } from '@/lib/server/renewal-payment-corrections';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
async function PATCHHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let client;
  try {
    const { id } = await params;
    if (!/^[1-9]\d{0,14}$/.test(id) || !Number.isSafeInteger(Number(id))) throw new ContractPaymentError('Mã hợp đồng không hợp lệ.');
    const input = parseRenewalPaymentCorrection(await request.json());
    const actor = dataAccess.getStore();
    if (!actor) return NextResponse.json({status:'error',message:'Phiên đăng nhập đã hết hạn.'},{status:401});
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const data = await updateRenewalPayment(client,Number(id),actor.id,input);
    await client.query('COMMIT');
    return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof ContractPaymentError) return NextResponse.json({status:'error',message:error.message},{status:error.status});
    if (error instanceof SyntaxError) return NextResponse.json({status:'error',message:'Thông tin sửa thanh toán không hợp lệ.'},{status:400});
    return failureResponse('Chưa xác nhận được sửa thanh toán. Tải lại phiếu để kiểm tra.',error);
  } finally { client?.release(); }
}
export const PATCH = withAccessRequest(PATCHHandler);
