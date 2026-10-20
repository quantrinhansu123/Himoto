import { NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { himotoPool } from '@/lib/server/himoto-database';
import { BatteryContractError } from '@/lib/server/battery-contracts';
import { applyBatteryAction, readBatteryWorkflow } from '@/lib/server/battery-workflow';
export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string }> };
async function handle(request: NextRequest, { params }: Params) {
  let client;
  try {
    const rawId = (await params).id, id = Number(rawId);
    if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(id)) throw new BatteryContractError('Mã hợp đồng pin không hợp lệ.');
    const raw = request.method === 'GET' ? null : await request.json();
    client = await himotoPool.connect();
    await client.query(request.method === 'GET' ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
    const data = request.method === 'GET' ? await readBatteryWorkflow(client, id) : await applyBatteryAction(client, id, dataAccess.getStore()!.id, raw);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof BatteryContractError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thao tác chưa hợp lệ.' }, { status: 400 });
    console.error('Battery workflow failed:', error instanceof Error ? error.name : 'Unknown error');
    return NextResponse.json({ status: 'error', message: 'Chưa xác nhận được thao tác. Tải lại lịch sử để kiểm tra trước khi thử lại.' }, { status: 500 });
  } finally { client?.release(); }
}
export const GET = withAccessRequest(handle);
export const POST = withAccessRequest(handle);
