import 'server-only';
import type { Pool } from 'pg';
import { himotoPool } from './himoto-database';
import { CASHBOOK_COLUMNS } from '@/lib/management/cashbook';
import { normalize } from '@/lib/management/table-utils';

// Shared with the legacy full-list endpoint so voucher fields keep the same meaning.
export const CASHBOOK_LIST_SQL = `SELECT t.id, t.created_at, t.type, t.user_id, u.name AS user_name, t.store_id, s.store_name,
  CASE WHEN t.name='battery:rental' THEN 'Thu tiền thuê pin' WHEN t.name='battery:renewal' THEN 'Thu gia hạn pin / sạc' WHEN t.name='battery:deposit' THEN 'Thu cọc thuê pin' WHEN t.name='order:payment' THEN 'Thanh toán hợp đồng' WHEN t.name='order:renewal' THEN 'Thu tiền gia hạn' WHEN t.name='order:extra' THEN 'Phiếu thu thêm hợp đồng' WHEN t.name='order:deposit_refund' OR t.name LIKE 'order:complete:%' THEN 'Trả cọc cho khách' WHEN t.name LIKE 'order:deposit%' THEN 'Thu tiền cọc' WHEN t.name LIKE 'order:rental_fees%' THEN 'Thu tiền thuê xe' ELSE t.name END AS reason,
  COALESCE(t."desc", t.note) AS content, t.value AS amount, t.order_id,
  COALESCE(o.contract_number,o.draft_reference,bc.code,'#' || t.order_id::text) AS contract_code,
  CASE WHEN t.payment_method=3 THEN 'Tiền mặt + Chuyển khoản'
       WHEN t.bank_id IS NOT NULL AND t.bank_owner_type='company' THEN 'CK tài khoản công ty'
       WHEN t.bank_id IS NOT NULL OR t.payment_method=2 THEN 'Chuyển khoản'
       WHEN t.cash_id IS NOT NULL OR t.payment_method=1 THEN 'Tiền mặt' END AS payment_method,
  CASE WHEN t.cash_id IS NOT NULL THEN COALESCE(NULLIF(cb.name, ''), 'Két tiền mặt #' || t.cash_id::text)
       ELSE b.bank_name || ' · ' || b.owner_name || ' · ' || b.account_number END AS account
  FROM himoto.transactions t
  LEFT JOIN himoto.cash cb ON cb.id=t.cash_id
  LEFT JOIN himoto.users u ON u.id=t.user_id
  LEFT JOIN himoto.orders o ON o.id=t.order_id
  LEFT JOIN himoto.battery_contracts bc ON t.object_type='battery_contract' AND bc.id=t.object_id
  LEFT JOIN himoto.stores s ON s.id=t.store_id
  LEFT JOIN himoto.banks b ON b.id=t.bank_id
  WHERE t.status='approved'`;

export class CashbookQueryError extends Error {}
const invalid = () => new CashbookQueryError('Bộ lọc hoặc phân trang sổ quỹ không hợp lệ.');
const numeric = (value: string, min: number, max: number) => {
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < min || number > max) throw invalid();
  return number;
};
const date = (value: string) => {
  if (!value) return '';
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw invalid();
  return value;
};
// Use code-point ranges rather than the database's linguistic regex collation.
const folded = (expression: string) => `lower(translate(regexp_replace(normalize(COALESCE(${expression},''), NFD) COLLATE "C", '[\u0300-\u036f]', '', 'g'), 'đĐ', 'dD'))`;

export async function listCashbook(params: URLSearchParams, database: Pick<Pool, 'query'> = himotoPool) {
  const values: (number | string)[] = [];
  const bind = (value: number | string) => { values.push(value); return `$${values.length}`; };
  const where = ["v.type IN ('in','addon','out')"];
  const store = params.get('store_id') || '';
  if (store && store !== 'all') where.push(`v.store_id=${bind(numeric(store, 1, Number.MAX_SAFE_INTEGER))}`);
  const actor = params.get('actor') || '';
  if (actor.startsWith('id:')) where.push(`v.user_id=${bind(numeric(actor.slice(3), 1, Number.MAX_SAFE_INTEGER))}`);
  else if (actor.startsWith('name:') && actor.length > 5) where.push(`v.user_id IS NULL AND v.user_name=${bind(actor.slice(5))}`);
  else if (actor) throw invalid();
  const from = date(params.get('from') || ''), to = date(params.get('to') || '');
  if (from && to && from > to) throw invalid();
  if (from) where.push(`v.created_at >= (${bind(from)}::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`);
  if (to) where.push(`v.created_at < ((${bind(to)}::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`);
  const search = normalize(params.get('search') || '');
  if (search.length > 300 || search.includes('\u0001')) throw invalid();
  if (search) {
    const needle = bind(search);
    const fields = ['v.id::text', 'v.user_name', 'v.reason', 'v.content', 'v.contract_code', 'v.payment_method', 'v.account', 'v.store_name', "CASE WHEN v.type='out' THEN 'Phiếu chi' ELSE 'Phiếu thu' END"];
    // A separator prevents a keyword matching across adjacent fields. Normalize once per voucher.
    where.push(`strpos(${folded(`concat_ws(chr(1),${fields.join(',')})`)},${needle})>0`);
  }
  const mode = params.get('mode') || 'page';
  if (!['page', 'all', 'ids'].includes(mode)) throw invalid();
  const type = params.get('type');
  if (type && type !== 'income' && type !== 'expense') throw invalid();
  const typeWhere = (kind: string) => kind === 'expense' ? "v.type='out'" : "v.type IN ('in','addon')";
  const filteredSql = `WITH vouchers AS (${CASHBOOK_LIST_SQL})`;
  const condition = where.join(' AND ');
  if (mode !== 'page') {
    const result = await database.query(`${filteredSql} SELECT ${mode === 'ids' ? 'v.id,v.amount' : 'v.*'} FROM vouchers v WHERE ${condition}${type ? ` AND ${typeWhere(type)}` : ''} ORDER BY v.id DESC`, values);
    return result.rows;
  }
  const paging = (kind: 'income' | 'expense') => {
    const page = numeric(params.get(`${kind}_page`) || '1', 1, 1_000_000);
    const pageSize = numeric(params.get(`${kind}_limit`) || '5', 1, 50);
    const key = params.get(`${kind}_sort`) || 'date';
    const direction = params.get(`${kind}_direction`) || 'desc';
    if (!CASHBOOK_COLUMNS.some(column => column.key === key) || !['asc', 'desc'].includes(direction)) throw invalid();
    const expression = key === 'date' ? 'v.created_at' : key === 'time' ? "(v.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time" : key === 'actor_name' ? 'v.user_name' : `v.${key}`;
    return { page, pageSize, order: `${expression} ${direction} NULLS LAST, v.id ${direction}` };
  };
  const income = paging('income'), expense = paging('expense');
  // One statement gives counts and both pages the same snapshot. Only IDs and amounts
  // are materialized; joined details are returned for the requested pages alone.
  const summarySql = `SELECT
    count(*) FILTER (WHERE v.type IN ('in','addon'))::int AS income_count,
    count(*) FILTER (WHERE v.type='out')::int AS expense_count,
    COALESCE(sum(v.amount) FILTER (WHERE v.type IN ('in','addon')),0) AS income_amount,
    COALESCE(sum(v.amount) FILTER (WHERE v.type='out'),0) AS expense_amount,
    (SELECT count(*)::int FROM himoto.transactions WHERE status='approved' AND type IN ('in','addon','out')) AS total
    FROM matched v`;
  const pageSql = (kind: 'income' | 'expense', config: typeof income) => {
    const limit = bind(config.pageSize), requestedPage = bind(config.page);
    return `SELECT v.* FROM vouchers v JOIN matched m ON m.id=v.id WHERE ${typeWhere(kind)} ORDER BY ${config.order}
      LIMIT ${limit} OFFSET (SELECT (LEAST(${requestedPage},GREATEST(1,ceil(${kind}_count::numeric/${limit})))::int-1)*${limit} FROM summary)`;
  };
  const incomeSql = pageSql('income', income), expenseSql = pageSql('expense', expense);
  const actorStore = store && store !== 'all' ? ` AND t.store_id=${bind(Number(store))}` : '';
  const result = await database.query(`WITH vouchers AS NOT MATERIALIZED (${CASHBOOK_LIST_SQL}),
    matched AS MATERIALIZED (SELECT v.id,v.type,v.amount FROM vouchers v WHERE ${condition}),
    summary AS (${summarySql}), income_page AS (${incomeSql}), expense_page AS (${expenseSql}),
    actors AS (SELECT DISTINCT t.user_id AS id,u.name FROM himoto.transactions t JOIN himoto.users u ON u.id=t.user_id
      WHERE t.status='approved' AND t.type IN ('in','addon','out') AND NULLIF(u.name,'') IS NOT NULL${actorStore} ORDER BY u.name,t.user_id)
    SELECT summary.*,
      COALESCE((SELECT json_agg(v) FROM income_page v),'[]'::json) AS income_rows,
      COALESCE((SELECT json_agg(v) FROM expense_page v),'[]'::json) AS expense_rows,
      COALESCE((SELECT json_agg(json_build_array('id:'||id,name||' · #'||id)) FROM actors),'[]'::json) AS actors
    FROM summary`, values);
  const counts = result.rows[0];
  const page = (kind: 'income' | 'expense', config: typeof income) => ({ rows: counts[`${kind}_rows`], total: counts[`${kind}_count`], amount: Number(counts[`${kind}_amount`]), page: Math.min(config.page, Math.max(1, Math.ceil(counts[`${kind}_count`] / config.pageSize))), pageSize: config.pageSize });
  return { total: counts.total, income: page('income', income), expense: page('expense', expense), actors: counts.actors };
}
