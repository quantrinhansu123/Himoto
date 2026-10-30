import 'server-only';
import type { PoolClient } from 'pg';
import { VEHICLE_ORDER_SQL } from './contract-classification';

/** Expand draft payload vehicle lines into soft holds for the picker (never inventory blockers). */
const DRAFT_VEHICLE_LINES_SQL = `jsonb_array_elements(
  CASE WHEN jsonb_typeof(o.draft_payload::jsonb #> '{management_composer,draft,vehicles}')='array'
    THEN o.draft_payload::jsonb #> '{management_composer,draft,vehicles}' ELSE '[]'::jsonb END
)`;

const draftPickupSql = `COALESCE(NULLIF(line->>'rent_at',''),NULLIF(o.draft_payload #>> '{management_composer,draft,start_date}',''))`;
const draftReturnSql = `COALESCE(NULLIF(line->>'return_at',''),NULLIF(o.draft_payload #>> '{management_composer,draft,end_date}',''))`;

export type DraftVehicleRental = {
  vehicle_id: number;
  order_id: number;
  code: string;
  status: 'draft';
  customer: string;
  store_name: string;
  rent_at: string | null;
  return_at: string | null;
};

/** Soft draft holds for a vehicle id set (inventory / picker). */
export async function readDraftVehicleRentals(client: Pick<PoolClient, 'query'>, vehicleIds: number[]): Promise<DraftVehicleRental[]> {
  const ids = [...new Set(vehicleIds.filter(id => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return [];
  const result = await client.query(`SELECT (line->>'id')::bigint AS vehicle_id, o.id AS order_id,
      COALESCE(NULLIF(o.contract_number,''),NULLIF(o.draft_reference,''),'#'||o.id::text) AS code,
      COALESCE(c.name,o.customer_name,'') AS customer,
      COALESCE(s.store_name,'') AS store_name,
      ${draftPickupSql} AS rent_at,
      ${draftReturnSql} AS return_at
    FROM himoto.orders o
    LEFT JOIN himoto.customers c ON c.id=o.customer_id
    LEFT JOIN himoto.stores s ON s.id=o.store_id
    CROSS JOIN LATERAL ${DRAFT_VEHICLE_LINES_SQL} AS line
    WHERE o.deleted_at IS NULL AND o.order_status='draft' AND ${VEHICLE_ORDER_SQL}
      AND NULLIF(line->>'id','') ~ '^[1-9]\\d{0,14}$'
      AND (line->>'id')::bigint = ANY($1::bigint[])
    ORDER BY rent_at DESC NULLS LAST, o.id DESC`, [ids]);
  return result.rows.map(row => ({
    vehicle_id: Number(row.vehicle_id),
    order_id: Number(row.order_id),
    code: String(row.code || ''),
    status: 'draft' as const,
    customer: String(row.customer || ''),
    store_name: String(row.store_name || ''),
    rent_at: row.rent_at != null ? String(row.rent_at) : null,
    return_at: row.return_at != null ? String(row.return_at) : null,
  }));
}

/** MATERIALIZED CTE rows of draft soft-holds for the full vehicle list. */
export const DRAFT_VEHICLE_HOLDS_CTE_SQL = `draft_vehicle_holds AS MATERIALIZED (
  SELECT (line->>'id')::bigint AS vehicle_id, o.id AS order_id,
    COALESCE(NULLIF(o.contract_number,''),NULLIF(o.draft_reference,''),'#'||o.id::text) AS code,
    COALESCE(c.name,o.customer_name,'') AS customer,
    COALESCE(s.store_name,'') AS store_name,
    ${draftPickupSql} AS rent_at,
    ${draftReturnSql} AS return_at
  FROM himoto.orders o
  LEFT JOIN himoto.customers c ON c.id=o.customer_id
  LEFT JOIN himoto.stores s ON s.id=o.store_id
  CROSS JOIN LATERAL ${DRAFT_VEHICLE_LINES_SQL} AS line
  WHERE o.deleted_at IS NULL AND o.order_status='draft' AND ${VEHICLE_ORDER_SQL}
    AND NULLIF(line->>'id','') ~ '^[1-9]\\d{0,14}$'
), draft_vehicle_rentals AS MATERIALIZED (
  SELECT vehicle_id, jsonb_agg(jsonb_build_object(
    'order_id',order_id,'code',code,'status','draft','customer',customer,'store_name',store_name,
    'rent_at',rent_at,'return_at',return_at
  ) ORDER BY rent_at DESC NULLS LAST, order_id DESC) AS draft_rentals
  FROM draft_vehicle_holds GROUP BY vehicle_id
)`;

/** Per-vehicle LATERAL for hydrate-by-id pages (`$1::bigint[]`). */
export function draftVehicleRentalsLateralSql(vehicleExpr = 'v.id') {
  return `LEFT JOIN LATERAL (
    SELECT COALESCE(json_agg(json_build_object(
      'order_id',o.id,
      'code',COALESCE(NULLIF(o.contract_number,''),NULLIF(o.draft_reference,''),'#'||o.id::text),
      'status','draft',
      'customer',COALESCE(c.name,o.customer_name,''),
      'store_name',COALESCE(s.store_name,''),
      'rent_at',${draftPickupSql},
      'return_at',${draftReturnSql}
    ) ORDER BY ${draftPickupSql} DESC NULLS LAST, o.id DESC),'[]'::json) AS draft_rentals
    FROM himoto.orders o
    LEFT JOIN himoto.customers c ON c.id=o.customer_id
    LEFT JOIN himoto.stores s ON s.id=o.store_id
    CROSS JOIN LATERAL ${DRAFT_VEHICLE_LINES_SQL} AS line
    WHERE o.deleted_at IS NULL AND o.order_status='draft' AND ${VEHICLE_ORDER_SQL}
      AND NULLIF(line->>'id','') ~ '^[1-9]\\d{0,14}$'
      AND (line->>'id')::bigint=${vehicleExpr}
  ) draft_holds ON true`;
}
