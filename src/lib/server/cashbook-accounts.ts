import { NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { failureResponse } from './public-failure';

const json = (status: number, message: string) => NextResponse.json({ status: 'error', message }, { status });

/** Parses `cashbook/accounts/{bank|cash}/{id}`; returns null when the path is not an account item. */
export function parseAccountPath(path: string[], suffix?: string): { kind: 'bank' | 'cash'; id: number } | null {
  if (suffix ? path.length !== 5 || path[4] !== suffix : path.length !== 4) return null;
  if ( path[0] !== 'cashbook' || path[1] !== 'accounts' || (path[2] !== 'bank' && path[2] !== 'cash') || !/^\d+$/.test(path[3])) return null;
  const id = Number(path[3]);
  return Number.isSafeInteger(id) && id > 0 ? { kind: path[2], id } : null;
}

const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max + 1) : '';

/** Parses `cashbook/accounts/{bank|cash}` for creating an account. */
export function parseAccountCollectionPath(path: string[]): 'bank' | 'cash' | null {
  return path.length === 3 && path[0] === 'cashbook' && path[1] === 'accounts' && (path[2] === 'bank' || path[2] === 'cash') ? path[2] : null;
}

type AccountValues = { storeId: number; status: 'Active' | 'Inactive'; opening: number; ownerType: 'company' | 'unknown'; bankName: string; ownerName: string; accountNumber: string; name: string };

// A company account can belong to a branch; store_id 0 retains legacy shared accounts.
async function readAccountValues(kind: 'bank' | 'cash', request: Request): Promise<AccountValues | NextResponse> {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
    body = parsed as Record<string, unknown>;
  } catch { return json(400, 'Thông tin tài khoản không hợp lệ.'); }
  const status = body.status === 'inactive' ? 'Inactive' : body.status === 'active' ? 'Active' : '';
  const opening = Number(body.opening_balance ?? 0);
  if (!status || !Number.isSafeInteger(opening) || Math.abs(opening) > 1e13) return json(400, 'Kiểm tra trạng thái và số dư đầu kỳ (số nguyên, đơn vị đồng).');
  const ownerType = kind === 'bank' && body.owner_type === 'company' ? 'company' : 'unknown';
  const bankName = text(body.bank_name, 191), ownerName = text(body.owner_name, 191), accountNumber = text(body.account_number, 191);
  if (kind === 'bank' && (!bankName || !ownerName || !accountNumber || bankName.length > 191 || ownerName.length > 191 || accountNumber.length > 191)) return json(400, 'Nhập đủ ngân hàng, chủ tài khoản và số tài khoản.');
  const name = kind === 'cash' ? text(body.name, 191) : '';
  if (name.length > 191) return json(400, 'Tên két tối đa 191 ký tự.');
  const storeId = body.store_id == null || body.store_id === '' ? 0 : Number(body.store_id);
  if (storeId !== 0 || ownerType !== 'company') {
    if (!Number.isSafeInteger(storeId) || storeId <= 0) return json(400, 'Chọn cơ sở cho tài khoản.');
    const store = await himotoPool.query('SELECT 1 FROM himoto.stores WHERE id=$1', [storeId]);
    if (!store.rowCount) return json(400, 'Cơ sở đã chọn không còn tồn tại.');
  }
  return { storeId, status, opening, ownerType, bankName, ownerName, accountNumber, name };
}

export async function createAccount(kind: 'bank' | 'cash', request: Request) {
  try {
    const values = await readAccountValues(kind, request);
    if (values instanceof NextResponse) return values;
    const result = kind === 'cash'
      ? await himotoPool.query('INSERT INTO himoto.cash (store_id, opening_balance, status, name, created_at, updated_at) VALUES ($1,$2,$3,NULLIF($4,\'\'),now(),now()) RETURNING id',
        [values.storeId, values.opening, values.status, values.name])
      : await himotoPool.query(`INSERT INTO himoto.banks (store_id, bank_name, account_number, owner_name, opening_balance, account_type, status, owner_type, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,1,$6,$7,now(),now()) RETURNING id`,
        [values.storeId, values.bankName, values.accountNumber, values.ownerName, values.opening, values.status, values.ownerType]);
    return NextResponse.json({ status: 'success', data: { id: result.rows[0].id } }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failureResponse('Không tạo được tài khoản.', error);
  }
}

export async function updateAccount(kind: 'bank' | 'cash', id: number, request: Request) {
  try {
    const values = await readAccountValues(kind, request);
    if (values instanceof NextResponse) return values;
    if (kind === 'cash') {
      const result = await himotoPool.query('UPDATE himoto.cash SET store_id=$2, status=$3, opening_balance=$4, name=NULLIF($5,\'\'), updated_at=now() WHERE id=$1 RETURNING id',
        [id, values.storeId, values.status, values.opening, values.name]);
      if (!result.rowCount) return json(404, 'Không tìm thấy két tiền mặt.');
    } else {
      const result = await himotoPool.query(`UPDATE himoto.banks SET store_id=$2, owner_type=$3, bank_name=$4, owner_name=$5, account_number=$6, status=$7, opening_balance=$8, updated_at=now()
          WHERE id=$1 RETURNING id`,
        [id, values.storeId, values.ownerType, values.bankName, values.ownerName, values.accountNumber, values.status, values.opening]);
      if (!result.rowCount) return json(404, 'Không tìm thấy tài khoản ngân hàng.');
    }
    return NextResponse.json({ status: 'success', data: null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failureResponse('Không lưu được thay đổi tài khoản.', error);
  }
}

export async function deleteAccount(kind: 'bank' | 'cash', id: number) {
  const table = kind === 'cash' ? 'cash' : 'banks', column = kind === 'cash' ? 'cash_id' : 'bank_id';
  const client = await himotoPool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`SELECT id FROM himoto.${table} WHERE id=$1 FOR UPDATE`, [id]);
    if (!found.rowCount) { await client.query('ROLLBACK'); return json(404, 'Không tìm thấy tài khoản cần xóa.'); }
    const used = await client.query(`SELECT count(*)::int AS count FROM himoto.transactions WHERE ${column}=$1`, [id]);
    const count = Number(used.rows[0]?.count || 0);
    if (count > 0) {
      await client.query('ROLLBACK');
      return json(409, `Không thể xóa vì đã có ${count} phiếu thu/chi gắn với tài khoản này. Hãy chuyển sang “Ngừng sử dụng” để giữ lịch sử.`);
    }
    await client.query(`DELETE FROM himoto.${table} WHERE id=$1`, [id]);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data: null });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return failureResponse('Không xóa được tài khoản.', error);
  } finally { client.release(); }
}

/** Archive only changes availability. Existing balances, transactions and account details stay intact. */
export async function setAccountStatus(kind:'bank'|'cash',id:number,request:Request){
  let body:Record<string,unknown>;
  try{body=await request.json();if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>key!=='status')||!['active','inactive'].includes(String(body.status)))throw Error();}
  catch{return json(400,'Trạng thái tài khoản không hợp lệ.');}
  const table=kind==='cash'?'cash':'banks';
  try{const result=await himotoPool.query(`UPDATE himoto.${table} SET status=$2,updated_at=now() WHERE id=$1 RETURNING id`,[id,body.status==='active'?'Active':'Inactive']);
    return result.rowCount?NextResponse.json({status:'success',data:null}):json(404,'Không tìm thấy tài khoản.');
  }catch(error){return failureResponse('Không đổi được trạng thái tài khoản.',error);}
}

const dateParam = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

export async function listAccountTransactions(kind: 'bank' | 'cash', id: number, params: URLSearchParams) {
  const from = dateParam(params.get('from')), to = dateParam(params.get('to'));
  if ((params.get('from') && !from) || (params.get('to') && !to) || (from && to && from > to)) return json(400, 'Khoảng ngày không hợp lệ.');
  const column = kind === 'cash' ? 'cash_id' : 'bank_id';
  try {
    const result = await himotoPool.query(
      `SELECT t.id, t.created_at, t.type, t.value AS amount, u.name AS user_name,
              COALESCE(o.contract_number, o.draft_reference, bc.code, CASE WHEN t.order_id IS NOT NULL THEN '#' || t.order_id::text END) AS contract_code,
              COALESCE(t."desc", t.note) AS content
       FROM himoto.transactions t LEFT JOIN himoto.users u ON u.id = t.user_id LEFT JOIN himoto.orders o ON o.id = t.order_id
       LEFT JOIN himoto.battery_contracts bc ON t.object_type='battery_contract' AND bc.id=t.object_id
       WHERE t.${column} = $1 AND t.status = 'approved'
         AND ($2::date IS NULL OR (t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= $2::date)
         AND ($3::date IS NULL OR (t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= $3::date)
       ORDER BY t.created_at DESC, t.id DESC LIMIT 2000`, [id, from, to]);
    return NextResponse.json({ status: 'success', data: result.rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failureResponse('Không tải được danh sách thu chi của tài khoản.', error);
  }
}
