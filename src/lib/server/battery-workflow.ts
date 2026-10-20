import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { BatteryContractError, readBatteryContract } from './battery-contracts';
import type { BatteryActionInput, BatteryReceipt, BatteryWorkflowAccount, BatteryWorkflowContext, BatteryWorkflowEvent } from '@/lib/management/battery-workflow';

type Database = Pick<PoolClient, 'query'>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function localTime(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + '+07:00')) && new Date(Date.parse(value + '+07:00') + 7 * 3600000).toISOString().slice(0, 16) === value;
}
export function parseBatteryAction(raw: unknown): BatteryActionInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BatteryContractError('Thao tác hợp đồng pin chưa hợp lệ.');
  const b = raw as Record<string, unknown>;
  const extra = b.action === 'renew' ? ['ends_at', 'amount', 'receipt'] : b.action === 'collect_renewal' ? ['renewal_id', 'amount', 'receipt'] : b.action === 'return' ? ['returned_at'] : [];
  if (!extra.length || Object.keys(b).some(k => !['action', 'revision', 'request_id', 'note', ...extra].includes(k)) ||
    typeof b.revision !== 'string' || !/^\d{1,20}$/.test(b.revision) || typeof b.request_id !== 'string' || !UUID.test(b.request_id) ||
    typeof b.note !== 'string' || b.note.trim().length > 2000) throw new BatteryContractError('Kiểm tra thao tác, phiên bản và ghi chú hợp đồng pin.');
  const common = { revision: b.revision, request_id: b.request_id.toLowerCase(), note: b.note.trim() };
  if (b.action === 'return') {
    if (!localTime(b.returned_at) || Date.parse(b.returned_at + '+07:00') > Date.now() + 60000) throw new BatteryContractError('Ngày giờ nhận lại pin / sạc chưa hợp lệ hoặc ở tương lai.');
    return { ...common, action: 'return', returned_at: b.returned_at };
  }
  if (!Number.isSafeInteger(b.amount) || Number(b.amount) < (b.action === 'collect_renewal' ? 1 : 0) || Number(b.amount) > 1e12) throw new BatteryContractError('Phí gia hạn phải là số nguyên không âm, tối đa 1.000 tỷ đồng.');
  let receipt: BatteryReceipt | undefined;
  if (b.receipt !== undefined) {
    const r = b.receipt as Record<string, unknown>;
    if (!r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).some(k => !['method', 'account_id', 'paid_at'].includes(k)) ||
      !['cash', 'transfer', 'company_transfer'].includes(String(r.method)) || !Number.isSafeInteger(r.account_id) || Number(r.account_id) <= 0 ||
      !localTime(r.paid_at) || Date.parse(r.paid_at + '+07:00') > Date.now() + 60000 || Number(b.amount) <= 0) throw new BatteryContractError('Kiểm tra hình thức, tài khoản và thời điểm đã thực nhận tiền.');
    receipt = { method: r.method as BatteryReceipt['method'], account_id: Number(r.account_id), paid_at: r.paid_at };
  }
  if (b.action === 'collect_renewal') {
    if (!receipt || typeof b.renewal_id !== 'string' || !UUID.test(b.renewal_id)) throw new BatteryContractError('Chọn khoản gia hạn chưa thu và tài khoản thực nhận.');
    return { ...common, action: 'collect_renewal', renewal_id: b.renewal_id.toLowerCase(), amount: Number(b.amount), receipt };
  }
  if (!localTime(b.ends_at)) throw new BatteryContractError('Nhập ngày giờ kết thúc mới hợp lệ.');
  return { ...common, action: 'renew', ends_at: b.ends_at, amount: Number(b.amount), ...(receipt ? { receipt } : {}) };
}

export async function readBatteryWorkflow(db: Database, id: number, withAccounts = true): Promise<BatteryWorkflowContext> {
  const contract = await readBatteryContract(db, id);
  const row = (await db.query('SELECT workflow_history FROM himoto.battery_contracts WHERE id=$1 AND deleted_at IS NULL', [id])).rows[0];
  const events: BatteryWorkflowEvent[] = Array.isArray(row?.workflow_history) ? row.workflow_history : [];
  const ids = events.flatMap(e => e.transaction_id ? [e.transaction_id] : []);
  const receipts = ids.length ? (await db.query(`SELECT id,value FROM himoto.transactions WHERE id=ANY($1::bigint[]) AND object_type='battery_contract'
    AND object_id=$2 AND name='battery:renewal' AND type='in' AND status='approved'`, [ids, id])).rows : [];
  const received = (e: BatteryWorkflowEvent) => Number(receipts.find(t => Number(t.id) === e.transaction_id)?.value || 0);
  const history = events.map(e => {
    if (e.action !== 'renew') return { ...e, collected: received(e) };
    const collected = received(e) + events.filter(t => t.action === 'collect_renewal' && t.renewal_id === e.request_id).reduce((s, t) => s + received(t), 0);
    return { ...e, collected, remaining: Math.max(Number(e.amount || 0) - collected, 0) };
  });
  const renewal_amount = history.filter(e => e.action === 'renew').reduce((s, e) => s + Number(e.amount || 0), 0);
  const renewal_collected = history.filter(e => e.action === 'renew').reduce((s, e) => s + Number(e.collected || 0), 0);
  const accounts: BatteryWorkflowAccount[] = withAccounts ? (await db.query(`SELECT id,'cash' AS kind,store_id,'' AS owner_type,status,COALESCE(NULLIF(name,''),'Két tiền mặt') AS label
    FROM himoto.cash WHERE store_id=$1 AND lower(status)='active'
    UNION ALL SELECT id,'bank' AS kind,store_id,owner_type,status,concat_ws(' · ',bank_name,owner_name,account_number) AS label
    FROM himoto.banks WHERE lower(status)='active' AND (store_id=$1 OR owner_type='company') ORDER BY kind,id`, [contract.store_id])).rows.map(a => ({ ...a, id: Number(a.id), store_id: Number(a.store_id) })) : [];
  return { contract, history, accounts, renewal_amount, renewal_collected, renewal_remaining: Math.max(renewal_amount - renewal_collected, 0) };
}

// The route owns BEGIN/COMMIT: date, history and actual receipt change together.
export async function applyBatteryAction(db: Database, id: number, actorId: number, raw: unknown) {
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(actorId) || actorId <= 0) throw new BatteryContractError('Mã hợp đồng hoặc người thực hiện không hợp lệ.');
  const input = parseBatteryAction(raw);
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query("SET LOCAL statement_timeout='15s'");
  // Match the editor/create lock order before taking a row lock.
  await db.query('LOCK TABLE himoto.battery_contracts IN SHARE ROW EXCLUSIVE MODE');
  const locked = (await db.query('SELECT workflow_history FROM himoto.battery_contracts WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [id])).rows[0];
  if (!locked) throw new BatteryContractError('Không tìm thấy hợp đồng pin.', 404);
  const hash = createHash('sha256').update(JSON.stringify({ id, actorId, ...input })).digest('hex');
  const context = await readBatteryWorkflow(db, id, false);
  const old = context.history.find(e => e.request_id === input.request_id);
  if (old) {
    if (old.request_hash !== hash) throw new BatteryContractError('Mã thao tác đã dùng cho nội dung khác. Tải lại để kiểm tra.', 409);
    return context;
  }
  const b = context.contract;
  if (b.revision !== input.revision) throw new BatteryContractError('Hợp đồng pin vừa được cập nhật. Đóng và mở lại để xem dữ liệu mới.', 409);
  if (input.action !== 'collect_renewal' && b.status !== 'renting' || input.action === 'collect_renewal' && b.status === 'cancelled') throw new BatteryContractError('Trạng thái hợp đồng không cho phép thao tác này.', 409);
  if (input.action === 'renew' && input.ends_at <= (b.ends_at || b.starts_at)) throw new BatteryContractError('Ngày kết thúc mới phải sau hạn hiện tại.', 409);
  if (input.action === 'return' && input.returned_at < b.starts_at) throw new BatteryContractError('Ngày nhận lại pin không được trước ngày bắt đầu thuê.', 409);
  if (input.action === 'collect_renewal') {
    const renewal = context.history.find(e => e.action === 'renew' && e.request_id === input.renewal_id);
    if (!renewal || input.amount > Number(renewal.remaining || 0)) throw new BatteryContractError('Số thu vượt công nợ gia hạn còn thiếu. Tải lại để kiểm tra.', 409);
  }
  const actor = (await db.query('SELECT name FROM himoto.users WHERE id=$1', [actorId])).rows[0];
  const event: BatteryWorkflowEvent = { request_id: input.request_id, request_hash: hash, action: input.action, at: new Date().toISOString(), actor_id: actorId, actor_name: String(actor?.name || `#${actorId}`), note: input.note,
    ...(input.action === 'renew' ? { before_ends_at: b.ends_at, ends_at: input.ends_at, amount: input.amount } : input.action === 'return' ? { returned_at: input.returned_at } : { renewal_id: input.renewal_id, amount: input.amount }) };
  const receipt = 'receipt' in input ? input.receipt : undefined;
  if (receipt && 'amount' in input) {
    if (Number(b.paid_amount || 0) + input.amount > 1e12) throw new BatteryContractError('Tổng tiền đã thu vượt giới hạn.', 409);
    const cash = receipt.method === 'cash';
    const account = (await db.query(`SELECT id,store_id,${cash ? "''::text" : 'owner_type'} AS owner_type FROM himoto.${cash ? 'cash' : 'banks'} WHERE id=$1 AND lower(status)='active' FOR SHARE`, [receipt.account_id])).rows[0];
    if (!account || (receipt.method === 'company_transfer' ? account.owner_type !== 'company' : Number(account.store_id) !== b.store_id || !cash && account.owner_type === 'company')) throw new BatteryContractError('Tài khoản nhận không hoạt động hoặc không khớp hình thức / cơ sở thuê pin.', 409);
    const tx = await db.query(`INSERT INTO himoto.transactions(created_at,updated_at,name,type,value,note,status,user_id,store_id,bank_id,cash_id,payment_method,bank_owner_type,object_type,object_id)
      VALUES($1,now(),'battery:renewal','in',$2,$3,'approved',$4,$5,$6,$7,$8,$9,'battery_contract',$10) RETURNING id`,
    [receipt.paid_at + ':00+07:00', input.amount, `Thu gia hạn pin / sạc_${b.code}${input.note ? ' · ' + input.note : ''}`, actorId, b.store_id, cash ? null : receipt.account_id, cash ? receipt.account_id : null, cash ? 1 : 2, cash ? null : receipt.method === 'company_transfer' ? 'company' : 'personal', id]);
    event.transaction_id = Number(tx.rows[0].id); event.receipt = receipt;
  }
  const history = [...(Array.isArray(locked.workflow_history) ? locked.workflow_history : []), event];
  await db.query(`UPDATE himoto.battery_contracts SET workflow_history=$2::jsonb,ends_at=CASE WHEN $3::text IS NULL THEN ends_at ELSE $3::timestamptz END,
    status=CASE WHEN $4 THEN 'returned' ELSE status END,paid_amount=CASE WHEN $5::bigint=0 THEN paid_amount ELSE COALESCE(paid_amount,0)+$5 END,
    updated_at=now(),updated_by=$6 WHERE id=$1`, [id, JSON.stringify(history), input.action === 'renew' ? input.ends_at + ':00+07:00' : null, input.action === 'return', event.transaction_id && 'amount' in input ? input.amount : 0, actorId]);
  return readBatteryWorkflow(db, id, false);
}
