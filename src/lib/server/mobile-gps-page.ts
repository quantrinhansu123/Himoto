import 'server-only';
import type { PoolClient } from 'pg';
import { GPS_LONG_STOP_MS, GPS_SYNC_STALE_MS } from '../../../shared/gps';
import type { MobileGpsQuery, MobileGpsWorkspace } from '../../../shared/mobile-gps';

/** Same device/evidence rules as shared/gps; page in PostgreSQL, not Node memory. */
export async function readMobileGpsPage(db: Pick<PoolClient, 'query'>, query: MobileGpsQuery, now: number) {
  const result = await db.query(`WITH devices AS (
    SELECT d.id,d.vehicle_id,d.provider,d.external_device_id,d.provider_device_name,d.mapping_status,
      CASE WHEN d.provider_status='not_visible_in_account' THEN 'unavailable' ELSE d.management_status END AS management_status,
      CASE WHEN d.provider_status='not_visible_in_account' THEN d.sync_received_at ELSE COALESCE(a.last_success_at,d.sync_received_at) END AS sync_received_at,
      d.heartbeat_at,d.last_latitude,d.last_longitude,d.last_speed,d.provider_reported_at,d.position_recorded_at,d.last_ignition,
      d.stopped_since,d.provider_stopped_since,v.license,COALESCE(v.current_store_id,v.store_id) AS store_id,s.store_name
    FROM himoto.gps_devices d LEFT JOIN himoto.management_gps_accounts a ON a.id=d.source_account_id
    LEFT JOIN himoto.vehicles v ON v.id=d.vehicle_id LEFT JOIN himoto.stores s ON s.id=COALESCE(v.current_store_id,v.store_id)
    WHERE (d.vehicle_id IS NULL OR v.id IS NOT NULL AND v.deleted_at IS NULL)
      AND ($1::bigint IS NULL OR COALESCE(v.current_store_id,v.store_id)=$1)
    UNION ALL
    SELECT -v.id,v.id,NULL::text,''::text,''::text,'unmapped'::text,'none'::text,
      NULL::timestamptz,NULL::timestamptz,NULL::numeric,NULL::numeric,NULL::numeric,
      NULL::timestamptz,NULL::timestamptz,NULL::boolean,NULL::timestamptz,NULL::timestamptz,
      v.license,COALESCE(v.current_store_id,v.store_id),s.store_name
    FROM himoto.vehicles v LEFT JOIN himoto.stores s ON s.id=COALESCE(v.current_store_id,v.store_id)
    WHERE v.deleted_at IS NULL AND ($1::bigint IS NULL OR COALESCE(v.current_store_id,v.store_id)=$1)
      AND NOT EXISTS(SELECT 1 FROM himoto.gps_devices d WHERE d.vehicle_id=v.id)
  ), base AS (
    SELECT *,CASE WHEN management_status IN ('unavailable','none') THEN management_status
      WHEN sync_received_at IS NULL OR $2::timestamptz-sync_received_at>($3::double precision*interval '1 millisecond') THEN 'stale'
      ELSE COALESCE(management_status,'warning') END AS base_state,
      CASE WHEN provider='protrack' AND provider_stopped_since>=timestamptz '2000-01-01'
        AND provider_stopped_since<=$2::timestamptz AND provider_stopped_since<=sync_received_at THEN provider_stopped_since
        WHEN stopped_since>=timestamptz '2000-01-01' AND stopped_since<=$2::timestamptz AND stopped_since<=sync_received_at THEN stopped_since
        ELSE NULL END AS stop_evidence
    FROM devices
  ), long_vehicles AS (
    SELECT vehicle_id FROM base WHERE vehicle_id IS NOT NULL AND COALESCE(management_status,'') NOT IN ('unavailable','none')
    GROUP BY vehicle_id HAVING bool_and(COALESCE(base_state='stopped' AND $2::timestamptz-stop_evidence>($4::double precision*interval '1 millisecond'),false))
  ), projected AS (
    SELECT base.*,CASE WHEN base_state='stopped' AND vehicle_id IN (SELECT vehicle_id FROM long_vehicles)
      THEN 'long_stopped' ELSE base_state END AS "displayState" FROM base
  ), filtered AS (
    SELECT * FROM projected WHERE ($5::text='all' OR provider=$5) AND ($6::text='all' OR "displayState"=$6)
      AND (position($7::text in lower(COALESCE(license,'')))>0 OR position($7::text in lower(COALESCE(provider_device_name,'')))>0
        OR position($7::text in lower(COALESCE(external_device_id,'')))>0 OR position($7::text in lower(COALESCE(store_name,'')))>0)
  ), bounds AS (
    SELECT count(*)::integer AS total,LEAST($8::integer,GREATEST(1,CEIL(count(*)/25.0)::integer)) AS page FROM filtered
  ) SELECT (SELECT total FROM bounds) AS total,(SELECT page FROM bounds) AS page,
    COALESCE((SELECT jsonb_agg(to_jsonb(p)-'base_state'-'stop_evidence' ORDER BY (p.id<0),p.sync_received_at DESC NULLS LAST,p.id DESC)
      FROM (SELECT * FROM filtered ORDER BY (id<0),sync_received_at DESC NULLS LAST,id DESC LIMIT 25 OFFSET (SELECT (page-1)*25 FROM bounds)) p),'[]'::jsonb) AS rows,
    (SELECT jsonb_build_object('fleet',count(DISTINCT vehicle_id),'unmapped',count(*) FILTER(WHERE vehicle_id IS NULL),'devices',count(*),
      'states',jsonb_build_object('online',count(*) FILTER(WHERE "displayState"='online'),'stopped',count(*) FILTER(WHERE "displayState"='stopped'),
        'long_stopped',(SELECT count(*) FROM long_vehicles),'offline',count(*) FILTER(WHERE "displayState"='offline'),
        'warning',count(*) FILTER(WHERE "displayState"='warning'),'stale',count(*) FILTER(WHERE "displayState"='stale'),
        'none',count(*) FILTER(WHERE "displayState"='none'),'unavailable',count(*) FILTER(WHERE "displayState"='unavailable'))) FROM projected) AS summary,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'label',COALESCE(NULLIF(license,''),NULLIF(provider_device_name,''),external_device_id))
      ORDER BY sync_received_at DESC NULLS LAST,id DESC) FROM devices WHERE id>0),'[]'::jsonb) AS "eventDevices"`,
  [query.store === 'all' ? null : Number(query.store), new Date(now).toISOString(), GPS_SYNC_STALE_MS, GPS_LONG_STOP_MS,
    query.provider, query.state, query.search.toLowerCase(), query.page]);
  const row = result.rows[0];
  const events = await db.query(`SELECT e.id,e.vehicle_id,e.from_status,e.to_status,e.observed_at,e.event_kind,e.source,
    CASE WHEN e.source='poll' THEN e.observed_at ELSE COALESCE(e.provider_recorded_at,e.observed_at) END AS event_at,
    COALESCE(v.license,d.provider_device_name,d.external_device_id) AS license
    FROM himoto.management_gps_status_events e JOIN himoto.gps_devices d ON d.id=e.gps_device_id LEFT JOIN himoto.vehicles v ON v.id=e.vehicle_id
    WHERE ($1::bigint IS NULL OR COALESCE(v.current_store_id,v.store_id)=$1)
      AND ($2::text IS NULL OR e.source=$2) AND ($3::bigint IS NULL OR e.gps_device_id=$3)
    ORDER BY event_at DESC,e.id DESC LIMIT 100`, [query.store === 'all' ? null : Number(query.store), query.event_source === 'all' ? null : query.event_source, query.event_device ? Number(query.event_device) : null]);
  const stores = await db.query('SELECT id,store_name FROM himoto.stores ORDER BY store_name,id');
  const iso = (value: unknown) => value == null ? null : value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
  const dates = ['sync_received_at','heartbeat_at','provider_reported_at','position_recorded_at','stopped_since','provider_stopped_since'];
  return {
    query, page: row.page, pageSize: 25 as const, total: row.total, hasMore: row.page * 25 < row.total,
    rows: row.rows.map((item: Record<string, unknown>) => ({ ...item, ...Object.fromEntries(dates.map(key => [key, iso(item[key])])) })),
    summary: row.summary, eventDevices: row.eventDevices,
    stores: stores.rows.map(s => ({ id: Number(s.id), name: String(s.store_name || '') })),
    events: events.rows.map(e => ({ id: Number(e.id), vehicleId: e.vehicle_id == null ? null : Number(e.vehicle_id), fromStatus: e.from_status ?? null,
      toStatus: String(e.to_status || ''), kind: String(e.event_kind || ''), source: e.source, eventAt: iso(e.event_at)!, observedAt: iso(e.observed_at)!, label: String(e.license || '') })),
    observedAt: new Date(now).toISOString(),
  } as Omit<MobileGpsWorkspace, 'canMap'>;
}
