import 'server-only';
import type { PoolClient } from 'pg';
import { defaultTransferHistoryQuery, TRANSFER_HISTORY_SIZE, type TransferHistoryQuery, type TransferHistoryResult } from '@/lib/management/vehicle-transfer-history';
import { readVehicleAudit } from './vehicle-audit';

export class TransferHistoryError extends Error {}
export function parseTransferHistory(params: URLSearchParams): TransferHistoryQuery {
  const defaults = defaultTransferHistoryQuery();
  const from = params.get('from') ?? defaults.from, to = params.get('to') ?? defaults.to;
  for (const date of [from, to]) {
    const time = Date.parse(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date) {
      throw new TransferHistoryError('Chọn ngày hợp lệ.');
    }
  }
  if (from > to) throw new TransferHistoryError('Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.');
  const id = (key: string, fallback: string) => {
    const value = params.get(key) ?? fallback;
    if (value !== fallback && (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))) throw new TransferHistoryError('Cơ sở không hợp lệ.');
    return value;
  };
  const action = params.get('action') || '', search = (params.get('search') || '').trim(), page = params.get('page') || '1';
  if (!['', 'transfer', 'receive'].includes(action) || search.length > 200) throw new TransferHistoryError('Bộ lọc không hợp lệ.');
  if (!/^[1-9]\d*$/.test(page) || Number(page) > 1000000) throw new TransferHistoryError('Phân trang không hợp lệ.');
  return { from, to, fromStore: id('from_store', ''), toStore: id('to_store', ''), store: id('store', 'all'),
    action: action as TransferHistoryQuery['action'], search, page: Number(page) };
}

/** Dates in location events are stored as Vietnam wall time; filter before converting to timestamptz. */
export async function readTransferHistory(client: Pick<PoolClient, 'query'>, params: URLSearchParams): Promise<TransferHistoryResult> {
  const input = parseTransferHistory(params), values: unknown[] = [input.from, input.to];
  const bind = (value: unknown) => { values.push(value); return `$${values.length}`; };
  const filters: string[] = [];
  if (input.fromStore) filters.push(`from_store_id=${bind(input.fromStore)}::bigint`);
  if (input.toStore) filters.push(`to_store_id=${bind(input.toStore)}::bigint`);
  const store = input.store === 'all' ? '' : bind(input.store);
  if (input.action) filters.push(`action=${bind(input.action)}`);
  if (input.search) filters.push(`strpos(lower(concat_ws(' ',license,vehicle_name,from_store,to_store,actor,note)),lower(${bind(input.search)}))>0`);
  const offset = bind((input.page - 1) * TRANSFER_HISTORY_SIZE);
  const result = await client.query(`WITH scoped AS MATERIALIZED (
    SELECT e.*,COALESCE(original.from_store_id,e.from_store_id) AS origin_store_id,original.audit_snapshot AS origin_snapshot
    FROM himoto.vehicle_location_events e
    LEFT JOIN LATERAL (
      SELECT p.from_store_id,p.audit_snapshot FROM himoto.vehicle_location_events p
      WHERE e.event_type='status_change' AND p.vehicle_id=e.vehicle_id AND p.id<e.id
        AND p.event_type='manual_transfer' AND p.to_store_id=e.to_store_id ORDER BY p.id DESC LIMIT 1
    ) original ON true
    WHERE (e.event_type IN ('manual_transfer','manual_transfer_receive','transfer_dispatch','transfer_receive')
      OR (e.event_type='status_change' AND e.ref_type='ready' AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e.audit_snapshot->'changes')='array' THEN e.audit_snapshot->'changes' ELSE '[]'::jsonb END) change
        WHERE change->>'field'='status' AND change->>'from_value'='in_transit' AND change->>'to_value'='ready'
      )))${store?` AND (COALESCE(original.from_store_id,e.from_store_id)=${store}::bigint OR e.to_store_id=${store}::bigint)`:''}
  ), listed AS (
    SELECT e.id,e.vehicle_id,e.audit_snapshot,e.event_type,
      COALESCE(NULLIF(e.audit_snapshot->>'vehicle_name',''),v.name,'') AS vehicle_name,
      COALESCE(NULLIF(e.audit_snapshot->>'license',''),v.license,'') AS license,
      e.origin_store_id AS from_store_id,e.to_store_id,
      COALESCE(NULLIF(e.origin_snapshot->>'from_store_name',''),NULLIF(e.audit_snapshot->>'from_store_name',''),fs.store_name,'') AS from_store,
      COALESCE(NULLIF(e.audit_snapshot->>'to_store_name',''),ts.store_name,'') AS to_store,
      CASE WHEN e.event_type IN ('manual_transfer','transfer_dispatch') THEN 'transfer' ELSE 'receive' END AS action,
      e.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS at,
      COALESCE(NULLIF(e.audit_snapshot->>'actor_name',''),u.name,'') AS actor,
      concat_ws(' · ',NULLIF(t.transfer_code,''),NULLIF(t.reason,''),NULLIF(e.notes,'')) AS note
    FROM scoped e
    LEFT JOIN himoto.vehicles v ON v.id=e.vehicle_id
    LEFT JOIN himoto.stores fs ON fs.id=e.origin_store_id
    LEFT JOIN himoto.stores ts ON ts.id=e.to_store_id
    LEFT JOIN himoto.users u ON u.id=e.created_by
    LEFT JOIN himoto.vehicle_transfers t ON e.ref_type='vehicle_transfers' AND t.id=e.ref_id
    WHERE e.created_at >= $1::date AND e.created_at < $2::date + INTERVAL '1 day'
  ), filtered AS (SELECT * FROM listed ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}),
  paged AS (SELECT * FROM filtered ORDER BY at DESC NULLS LAST,id DESC LIMIT ${TRANSFER_HISTORY_SIZE} OFFSET ${offset})
  SELECT (SELECT count(*) FROM scoped)::int AS scope_count,(SELECT count(*) FROM filtered)::int AS total,
    COALESCE(jsonb_agg(paged ORDER BY at DESC NULLS LAST,id DESC),'[]'::jsonb) AS rows FROM paged`, values);
  const row = result.rows[0];
  if(!Number.isSafeInteger(row.scope_count)||row.scope_count<0)throw new Error('Không đọc được tổng lịch sử luân chuyển.');
  return { total: Number(row.total), scopeCount:row.scope_count, page: input.page, size: TRANSFER_HISTORY_SIZE,
    rows: row.rows.map((event: Record<string, unknown>) => ({ id: Number(event.id), vehicle_id: Number(event.vehicle_id),
      ...(['manual_transfer','manual_transfer_receive'].includes(String(event.event_type))?{telegram_event_id:Number(event.id)}:{}),
      vehicle_name: String(event.vehicle_name), license: String(event.license), from_store_id: event.from_store_id == null ? null : Number(event.from_store_id),
      to_store_id: event.to_store_id == null ? null : Number(event.to_store_id), from_store: String(event.from_store), to_store: String(event.to_store),
      action: event.action === 'transfer' ? 'transfer' : 'receive', label: event.action === 'transfer' ? 'Chuyển xe' : 'Nhận xe',
      at: event.at == null ? null : String(event.at), actor: String(event.actor), note: String(event.note),
      changes: readVehicleAudit(event.audit_snapshot)?.changes || [],
    })) };
}
