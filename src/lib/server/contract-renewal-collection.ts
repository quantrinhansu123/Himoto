import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { RenewalInput, RenewalResult, RenewalVersion } from '@/lib/management/contract-renewals';
import { ContractRenewalError, parseRenewalInput, recordContractRenewal } from './contract-renewals';
import { findPaymentAccount, paymentAccountMatchesMethod } from '@/lib/management/contract-payments';
import { readPaymentContext, recordContractPayment } from './contract-payments';

// Caller owns the transaction: extending the date and receiving this renewal's
// exact fee either both succeed or both roll back. No general finance permission.
export async function renewContractAndCollect(db:Pick<PoolClient,'query'>,id:number,actor:number,raw:RenewalInput):Promise<RenewalResult> {
  const input = parseRenewalInput(raw);
  if (!input.request_id) return recordContractRenewal(db,id,actor,input);
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`contract-payment:${input.request_id}`]);
  const hash = createHash('sha256').update(JSON.stringify({id,actor,item:input.item_id,return_at:input.return_at,amount:input.amount,outside_amount:input.outside_amount??null,outside_name:input.outside_name??null,expected_amount:input.expected_amount??null,note:input.note,receipt:input.receipt??null,...(input.occurred_at?{occurred_at:input.occurred_at}:{})})).digest('hex');
  const order = (await db.query('SELECT draft_payload FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0];
  if (!order) throw new ContractRenewalError('Không tìm thấy hợp đồng.',404);
  const saved = order.draft_payload?.management_composer?.versions;
  const versions:RenewalVersion[] = Array.isArray(saved) ? saved : [];
  const previous = versions.find(v=>v.kind==='renewal'&&v.request_id===input.request_id);
  if (previous && previous.request_hash!==hash) throw new ContractRenewalError('Mã lần gia hạn đã dùng cho nội dung khác. Tải lại hợp đồng để kiểm tra.',409);
  const result:RenewalResult = previous
    ? {order_id:id,code:(await readPaymentContext(db,id)).code,version:previous.version,return_at:previous.return_at,total_amount:previous.total,amount:previous.amount,replayed:true}
    : await recordContractRenewal(db,id,actor,input);
  // Paid renewals need a saved transfer/cash bill before the receipt can complete.
  if (input.receipt && !previous) await requireRenewalPaymentEvidence(db,id,result.version);
  if (input.receipt && Number(input.amount) > 0) {
    const context = await readPaymentContext(db,id);
    result.payment = await recordContractPayment(db,id,actor,{...input.receipt,request_id:input.request_id,revision:context.revision,amount:input.amount,renewal_version:result.version,note:input.note||`Gia hạn hợp đồng_${result.code}`});
  }
  const outside = Number(input.outside_amount || 0);
  if (input.receipt && outside > 0) {
    if (!previous) await recordOutsideCollection(db,id,actor,input,result.code);
    result.outside_amount = outside;
    result.outside_collected = true;
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

async function requireRenewalPaymentEvidence(db:Pick<PoolClient,'query'>,orderId:number,version:number) {
  const primary = `renewal-${version}-document-1`;
  const found = await db.query(
    `SELECT 1 FROM himoto.management_record_photos
     WHERE entity_type='contracts' AND entity_id=$1
       AND (slot=$2 OR slot LIKE $3 OR regexp_replace(slot,'-extra-[1-9][0-9]{0,14}$','')=$2)
     LIMIT 1`,
    [orderId, primary, `renewal-${version}-document-%`],
  );
  if (!found.rowCount) {
    throw new ContractRenewalError('Cần lưu ảnh bill chuyển khoản hoặc tiền mặt trước khi hoàn thành gia hạn đã thu tiền.', 409);
  }
}

// Outside cash is a real receipt. It does not raise the contract total or the rental paid balance.
async function recordOutsideCollection(db:Pick<PoolClient,'query'>,id:number,actor:number,input:RenewalInput,code:string) {
  const context = await readPaymentContext(db,id);
  const receipt = input.receipt!;
  const table = receipt.method === 'cash' ? 'cash' : 'banks';
  await db.query(`SELECT id FROM himoto.${table} WHERE id=$1 FOR SHARE`,[receipt.account_id]);
  const account = findPaymentAccount(context,receipt.method,receipt.account_id);
  if (!account || !paymentAccountMatchesMethod(account,receipt.method)) throw new ContractRenewalError('Tài khoản nhận phí thu thêm không khớp hình thức (Tiền mặt = két; chuyển khoản = ngân hàng cá nhân).',409);
  const cash = receipt.method === 'cash';
  const note = `${input.outside_name} · thu ngoài, không cộng tiền hợp đồng ${code}`;
  await db.query(`INSERT INTO himoto.transactions
    (order_id,created_at,updated_at,name,type,value,note,status,user_id,store_id,bank_id,cash_id,payment_method,bank_owner_type,object_type,object_id)
    VALUES ($1,$2,now(),'order:outside','in',$3,$4,'approved',$5,$6,$7,$8,$9,$10,'order',$11)`,
  [id,`${receipt.paid_at}:00+07:00`,Number(input.outside_amount),note,actor,context.store_id,cash?null:account.id,cash?account.id:null,cash?1:2,cash?null:'personal',id]);
}
