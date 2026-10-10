import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { ContractHistoryError, readCustomerCashflow } from '@/lib/server/contract-history';

export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new ContractHistoryError('Mã khách hàng không hợp lệ.');
    const data = await readCustomerCashflow(himotoPool, Number(id));
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof ContractHistoryError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    console.error('Customer payment history failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Không tải được lịch sử thanh toán của khách hàng.' }, { status: 500 });
  }
}
