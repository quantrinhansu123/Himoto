import { after, NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { BatteryTelegramError, readBatteryTelegram, saveBatteryTelegram } from '@/lib/server/battery-telegram';
import { dispatchContractNotifications } from '@/lib/server/contract-notifications';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
export const maxDuration = 300;
type Params = { params: Promise<{ id: string }> };

async function handle(request: NextRequest, { params }: Params, writing: boolean) {
  let client;
  try {
    const { id } = await params;
    if (!/^[1-9]\d{0,14}$/.test(id) || !Number.isSafeInteger(Number(id))) throw new BatteryTelegramError('Mã hợp đồng pin không hợp lệ.');
    let requestId = request.nextUrl.searchParams.get('request_id') || '';
    if (writing) {
      const raw = await request.text();
      let body: Record<string, unknown> | null;
      try { body = raw.length <= 200 ? JSON.parse(raw) : null; } catch { body = null; }
      if (!body || body.action !== 'send' || typeof body.request_id !== 'string' || Object.keys(body).length !== 2) {
        throw new BatteryTelegramError('Chọn thao tác gửi hợp lệ.');
      }
      requestId = body.request_id;
    }
    if (!requestId) throw new BatteryTelegramError('Thiếu mã lượt trả pin / sạc.');
    client = await ownerDatabase.connect();
    await client.query(writing ? 'BEGIN' : 'BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout='15s'");
    const user = dataAccess.getStore()!;
    const state = writing
      ? await saveBatteryTelegram(client, Number(id), requestId, user)
      : (await readBatteryTelegram(client, Number(id), requestId, user)).state;
    await client.query('COMMIT');
    if (writing || ['pending', 'sending'].includes(state.status || '')) {
      after(async () => { await dispatchContractNotifications(undefined, 2, undefined, undefined, undefined, undefined, [Number(id)]); });
    }
    return NextResponse.json({ status: 'success', data: state }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return error instanceof BatteryTelegramError
      ? NextResponse.json({ status: 'error', message: error.message }, { status: error.status })
      : failureResponse('Không xử lý được Telegram của hợp đồng pin.', error);
  } finally { client?.release(); }
}

export const GET = withAccessRequest((request: NextRequest, params: Params) => handle(request, params, false));
export const POST = withAccessRequest((request: NextRequest, params: Params) => handle(request, params, true));
