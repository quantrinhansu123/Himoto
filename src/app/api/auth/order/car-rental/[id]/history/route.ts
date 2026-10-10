import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { ContractHistoryError, readContractHistory } from '@/lib/server/contract-history';

export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  let client;
  try {
    const { id } = await params;
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new ContractHistoryError('Mã hợp đồng không hợp lệ.');
    client = await himotoPool.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const data = await readContractHistory(client, Number(id));
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof ContractHistoryError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    console.error('Contract history request failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Không tải được lịch sử hợp đồng.' }, { status: 500 });
  } finally { client?.release(); }
}
