import 'server-only';
import sharp from 'sharp';
import type { DepositRefundDecision } from '@/lib/management/deposit-refunds';
import { MAX_PHOTO_BYTES } from '@/lib/management/record-photos';
import { ContractPaymentError } from './contract-payments';
import { refundItemId, refundRequestId, type DepositRefundSubmission } from './deposit-refunds';

export async function readDepositRefundSubmission(request: Request): Promise<DepositRefundSubmission> {
  const max = MAX_PHOTO_BYTES + 16_384;
  const contentType = request.headers.get('content-type') || '';
  if (!/^multipart\/form-data\s*;/i.test(contentType)) throw new ContractPaymentError('Thông tin và ảnh chứng từ hoàn cọc chưa hợp lệ.', 415);
  if (Number(request.headers.get('content-length')) > max) throw new ContractPaymentError('Ảnh chứng từ tối đa 2 MB.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ContractPaymentError('Chọn ảnh chứng từ hoàn cọc.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new ContractPaymentError('Ảnh chứng từ tối đa 2 MB.', 413);
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(Buffer.concat(chunks)), { headers: { 'Content-Type': contentType } }).formData();
  } catch {
    throw new ContractPaymentError('Thông tin và ảnh chứng từ hoàn cọc chưa hợp lệ.');
  }
  const allowed = ['id', 'item_id', 'amount', 'method', 'account_id', 'paid_at', 'reason', 'evidence', 'replaces_id', 'replaces_revision'];
  if ([...form.keys()].some(key => !allowed.includes(key) || form.getAll(key).length !== 1)) {
    throw new ContractPaymentError('Thông tin hoàn cọc bị trùng hoặc chưa hợp lệ.');
  }
  const file = form.get('evidence');
  if (!file || typeof file === 'string' || file.size < 1 || file.size > MAX_PHOTO_BYTES) {
    throw new ContractPaymentError('Chọn ảnh chứng từ hợp lệ, tối đa 2 MB.');
  }
  const reason = String(form.get('reason') || '').trim();
  if (!reason || reason.length > 500) throw new ContractPaymentError('Nhập lý do bổ sung, tối đa 500 ký tự.');
  const replaces = form.get('replaces_id');
  const replacesRevision = String(form.get('replaces_revision') || '');
  if (replaces && !/^\d{1,20}$/.test(replacesRevision)) throw new ContractPaymentError('Tải lại phiếu chi cần sửa.');
  let evidence: Buffer;
  try {
    evidence = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 8_000_000 })
      .rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#fff' }).jpeg({ quality: 87 }).toBuffer();
  } catch {
    throw new ContractPaymentError('Không đọc được ảnh chứng từ. Chọn lại ảnh JPG hoặc PNG.');
  }
  if (evidence.length > MAX_PHOTO_BYTES) throw new ContractPaymentError('Ảnh chứng từ sau khi xử lý vượt 2 MB.');
  return {
    id: refundRequestId(form.get('id')), item_id: refundItemId(form.get('item_id')),
    amount: String(form.get('amount') || ''), method: form.get('method'),
    account_id: Number(form.get('account_id')), paid_at: String(form.get('paid_at') || ''),
    reason, evidence, replaces_id: replaces ? refundItemId(replaces) : null,
    replaces_revision: replaces ? replacesRevision : null,
  };
}

export function parseDepositRefundDecision(raw: unknown): { decision: DepositRefundDecision; note: string } {
  const input = raw as { decision?: unknown; note?: unknown } | null;
  const decision = input?.decision;
  const note = typeof input?.note === 'string' ? input.note.trim() : '';
  if (decision !== 'approve' && decision !== 'reject' || note.length > 500 || decision === 'reject' && !note) {
    throw new ContractPaymentError('Chọn duyệt hoặc từ chối. Khi từ chối, nhập lý do tối đa 500 ký tự.');
  }
  return { decision, note };
}
