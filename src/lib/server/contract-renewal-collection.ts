import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { RenewalInput, RenewalResult, RenewalVersion } from '@/lib/management/contract-renewals';
import { ContractRenewalError, parseRenewalInput, recordContractRenewal } from './contract-renewals';
import { readPaymentContext, recordContractPayment } from './contract-payments';

// Caller owns the transaction: extending the date and receiving this renewal's
// exact fee either both succeed or both roll back. No general finance permission.
export async function renewContractAndCollect(db:Pick<PoolClient,'query'>,id:number,actor:number,raw:RenewalInput):Promise<RenewalResult> {
  const input = parseRenewalInput(raw);
  if (!input.request_id) return recordContractRenewal(db,id,actor,input);
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`contract-payment:${input.request_id}`]);
  const hash = createHash('sha256').update(JSON.stringify({id,actor,item:input.item_id,return_at:input.return_at,amount:input.amount,expected_amount:input.expected_amount??null,note:input.note,receipt:input.receipt??null})).digest('hex');
  const order = (await db.query('SELECT draft_payload FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0];
  if (!order) throw new ContractRenewalError('Không tìm thấy hợp đồng.',404);
  const saved = order.draft_payload?.management_composer?.versions;
  const versions:RenewalVersion[] = Array.isArray(saved) ? saved : [];
  const previous = versions.find(v=>v.kind==='renewal'&&v.request_id===input.request_id);
  if (previous && previous.request_hash!==hash) throw new ContractRenewalError('Mã lần gia hạn đã dùng cho nội dung khác. Tải lại hợp đồng để kiểm tra.',409);
  const result:RenewalResult = previous
    ? {order_id:id,code:(await readPaymentContext(db,id)).code,version:previous.version,return_at:previous.return_at,total_amount:previous.total,amount:previous.amount,replayed:true}
    : await recordContractRenewal(db,id,actor,input);
  if (input.receipt) {
    const context = await readPaymentContext(db,id);
    result.payment = await recordContractPayment(db,id,actor,{...input.receipt,request_id:input.request_id,revision:context.revision,amount:input.amount,renewal_version:result.version,note:input.note||`Gia hạn hợp đồng_${result.code}`});
  }
  if (!previous) {
    await db.query(`UPDATE himoto.orders SET draft_payload=jsonb_set(draft_payload::jsonb,'{management_composer,versions}',
      (SELECT jsonb_agg(CASE WHEN v->>'version'=$2::text THEN v||$3::jsonb ELSE v END ORDER BY position)
       FROM jsonb_array_elements(draft_payload::jsonb #> '{management_composer,versions}') WITH ORDINALITY AS entries(v,position)))::json WHERE id=$1`,
    [id,result.version,JSON.stringify({request_id:input.request_id,request_hash:hash})]);
    // The metadata update changes xmin: return the final revision to the caller.
    if (result.payment) result.payment.context = await readPaymentContext(db,id);
  }
  return result;
}
