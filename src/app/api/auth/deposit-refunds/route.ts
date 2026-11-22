import { NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { himotoPool } from '@/lib/server/himoto-database';
import { ContractPaymentError } from '@/lib/server/contract-payments';
import {
  decideDepositRefund, listDepositRefundRequests, readDepositRefundEvidence, readDepositRefundState,
  refundItemId, refundRequestId, submitDepositRefund,
} from '@/lib/server/deposit-refunds';
import { failureResponse } from '@/lib/server/public-failure';
import { parseDepositRefundDecision, readDepositRefundSubmission } from '@/lib/server/deposit-refund-input';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

async function handle(request: NextRequest) {
  const actor = dataAccess.getStore()!;
  const params = request.nextUrl.searchParams;
  const read = request.method === 'GET';
  let client;
  try {
    const input = request.method === 'POST' ? await readDepositRefundSubmission(request) : null;
    const review = request.method === 'PATCH' ? await request.json() : null;
    const evidenceId = read ? params.get('evidence') : null;
    client = await himotoPool.connect();
    await client.query(read ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='20s'");
    if (evidenceId !== null) {
      const proof = await readDepositRefundEvidence(client, actor, refundRequestId(evidenceId));
      await client.query('COMMIT');
      return new NextResponse(new Uint8Array(proof), { headers: { ...headers, 'Content-Type': 'image/jpeg' } });
    }
    let data;
    if (input) data = await submitDepositRefund(client, actor, input);
    else if (!read) {
      const { decision, note } = parseDepositRefundDecision(review);
      data = await decideDepositRefund(client, actor, refundRequestId(review.id), decision, note);
    } else if (params.has('item_id')) {
      data = await readDepositRefundState(client, actor, refundItemId(params.get('item_id')));
    } else {
      const page = Number(params.get('page') ?? '1');
      if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) throw new ContractPaymentError('Trang chờ duyệt không hợp lệ.');
      data = await listDepositRefundRequests(client, actor, page);
    }
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data }, { headers });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof ContractPaymentError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status, headers });
    if (error instanceof SyntaxError || error instanceof TypeError && /formdata/i.test(error.message)) {
      return NextResponse.json({ status: 'error', message: 'Thông tin hoàn cọc hoặc ảnh chứng từ không hợp lệ.' }, { status: 400, headers });
    }
    return failureResponse('Chưa xử lý được yêu cầu hoàn cọc. Tải lại để đối chiếu trước khi thử lại.', error);
  } finally {
    client?.release();
  }
}

export const GET = withAccessRequest(handle);
export const POST = withAccessRequest(handle);
export const PATCH = withAccessRequest(handle);
