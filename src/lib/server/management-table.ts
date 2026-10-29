import 'server-only';
import type { PoolClient } from 'pg';
import { MANAGEMENT_CONFIG } from '@/lib/management/config';
import { mapApiRow } from '@/lib/management/repository';
import { EMPTY_QUERY, filterRows,sortRows } from '@/lib/management/table-utils';
import { projectManagementTable, type ManagementTableInput, type TableKind } from '@/lib/management/management-table';
import { CONTRACT_LIST_SQL, contractListScopeClause } from './contract-drafts';
import { BAD_DEBT_CUTOFF_SQL } from './contract-bad-debt';
import { CUSTOMER_PROFILE_SQL } from './customer-search';
import { contractVehicleDetailsSql,contractVehicleReadSource,contractVehicleLabelSource } from './contract-vehicle-reads';
import { dailyPriceSql,depositLateral,rentalPaidSql } from './contract-deposits';
import { CONTRACT_REVIEW_SQL,EFFECTIVE_RENTAL_TYPE_SQL,VEHICLE_ORDER_SQL } from './contract-classification';
import { VEHICLE_GPS_JOIN_SQL } from './vehicle-gps-query';
import { VEHICLE_TRANSFER_JOIN_SQL } from './vehicle-transfers';
import { STORE_SELECT_SQL } from './store-management';
import { applyInstallmentBilling } from '@/lib/management/contract-billing';
import { OWNERSHIP_HOLD_FIELDS_SQL } from './ownership-hold-fields';
import { OVERDUE_BUCKETS,withContractMonitoring,type OverdueBucket } from '@/lib/management/contract-overdue';
import {contractStatisticsSql,mapContractStatistics,fastContractStatistics} from './contract-table-stats';
import { legacyOwnershipFeeReader } from './legacy-ownership-overdue';
import {contractWarehouseJoinSql,contractWarehouseStoreSql} from './contract-warehouses';

export class ManagementTableError extends Error {}
export function parseManagementTable(kind:TableKind,params:URLSearchParams):ManagementTableInput {
  const integer=(key:string,fallback:number,max:number)=>{const value=params.get(key);if(value===null)return fallback;if(!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>max)throw new ManagementTableError('Phân trang không hợp lệ.');return Number(value);};
  const page=integer('page',1,1000000),size=integer('size',10,50),direction=params.get('direction')||'asc',scope=params.get('scope')||'';
  if(!['asc','desc'].includes(direction)||!['','drafts','vat','overdue','ownership','due','renewable','remindable'].includes(scope)||kind!=='contracts'&&scope)throw new ManagementTableError('Phạm vi hoặc sắp xếp không hợp lệ.');
  const sort=params.get('sort')||'code',allowed=new Set([...MANAGEMENT_CONFIG[kind].columns.map(column=>column.key),'code','contract_type_name','overdue_days','overdue_minutes','overdue_fee_estimate','rental_debt_amount','contract_signed_at','monitoring_amount','contract_gps_status','billing_next_due_at','billing_due_amount','company_paid_amount']);
  if(!allowed.has(sort))throw new ManagementTableError('Cột sắp xếp không hợp lệ.');
  const store=params.get('store')||'all';if(store!=='all'&&(!/^[1-9]\d*$/.test(store)||!Number.isSafeInteger(Number(store))))throw new ManagementTableError('Cơ sở không hợp lệ.');
  const storeBasis=params.get('store_basis')||'source';
  if(!['source','warehouse'].includes(storeBasis)||storeBasis==='warehouse'&&kind!=='contracts')throw new ManagementTableError('Cách lọc cơ sở không hợp lệ.');
  const filters:Record<string,string>={};const keys=new Set([...MANAGEMENT_CONFIG[kind].filters.map(filter=>filter.key),'contract_type_id','customer_id','id']);
  for(const[key,value]of params)if(key.startsWith('filter_')){const field=key.slice(7);if(!keys.has(field)||value.length>100)throw new ManagementTableError('Bộ lọc không hợp lệ.');filters[field]=value;}
  const from=params.get('from')||'',to=params.get('to')||'';for(const date of [from,to])if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))))throw new ManagementTableError('Khoảng ngày không hợp lệ.');
  const search=params.get('search')||'',status=params.get('status')||'',days=params.get('overdue_days')||'',compare=params.get('overdue_compare')||'eq';
  const recent=params.get('recent')||'';
  const bucket=params.get('overdue_bucket')||'';
  if(bucket&&(kind!=='contracts'||!OVERDUE_BUCKETS.some(item=>item.key===bucket)))throw new ManagementTableError('Nhóm quá hạn không hợp lệ.');
  if(search.length>500||status.length>100||days&&!/^\d{1,5}$/.test(days)||!['eq','gt','lt'].includes(compare)||params.has('all')&&params.get('all')!=='1')throw new ManagementTableError('Bộ lọc không hợp lệ.');
  if(recent&&(!/^[1-9]\d{0,3}$/.test(recent)||Number(recent)>3660))throw new ManagementTableError('Khoảng ngày gần đây không hợp lệ.');
  return {kind,page,size,sort,direction:direction as 'asc'|'desc',scope,store,...(storeBasis==='warehouse'?{storeBasis:'warehouse' as const}:{}),...(recent?{recentDays:Number(recent)}:{}),query:{...EMPTY_QUERY,filters,search,status,startDate:from,endDate:to,overdueDays:days,overdueCompare:compare as 'eq'|'gt'|'lt',...(bucket?{overdueBucket:bucket as OverdueBucket}:{})}};
}
function contractScopeClause(scope:string):string {
  // Return dates can live only on legacy vehicle lines. Hydrated monitoring
  // applies the actual overdue test; filtering by the header first loses them.
  if(scope==='overdue')return contractPageScopeClause(scope);
  return scope==='due' ? ` AND o.order_status IN ('renting','overdue','wait_payment','bad_debt') AND o.draft_payload::jsonb #> '{management_composer,installment_plan}' IS NOT NULL`
    : scope==='renewable' ? ` AND o.order_status IN ('renting','overdue') AND o.draft_payload::jsonb #> '{management_composer,installment_plan}' IS NULL` : contractListScopeClause(scope);
}
function contractPageScopeClause(scope:string):string {
  if(scope==='overdue')return ` AND o.order_status IN ('overdue','renting','wait_payment','bad_debt')`;
  if(scope==='due'||scope==='renewable')return contractScopeClause(scope);
  return contractListScopeClause(scope);
}
function contractPageStatusClause(status:string) {
  if(!status)return '';
  // Đang thuê = còn hạn; quá hạn (kể cả order_status=renting nhưng đã quá giờ trả) vào tab Quá hạn.
  if(status==='renting')return ` AND o.order_status='renting' AND (o.return_at IS NULL OR o.return_at >= now())`;
  if(status==='overdue')return ` AND o.order_status IN ('overdue','renting','wait_payment')`;
  if(!/^[a-z][a-z0-9_]{0,63}$/.test(status))throw new ManagementTableError('Bộ lọc không hợp lệ.');
  return ` AND o.order_status='${status}'`;
}
/** Only the overdue list needs per-line dates/prices. Reuse the return screen's price source. */
function overdueDetailsSql(sql:string) {
  return `SELECT listing.*, (SELECT COALESCE(json_agg(json_build_object(
    'return_at',d.return_at,'daily_price',${dailyPriceSql()},'vehicle_type',v.type,'price_type',d.type,
    'substitute_unit_price',d.substitute_unit_price,'handler_price',d.handler_price ) ORDER BY d.id),'[]'::json)
    FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
    LEFT JOIN ${contractVehicleLabelSource()} v ON v.id=d.vehicle_id
    WHERE d.order_id=listing.id AND d.deleted_at IS NULL AND d.completed_at IS NULL) AS overdue_items
    FROM (${sql}) listing`;
}
/** Push status tabs into SQL so Đang thuê does not index every open/historical row first. */
export function contractStatusClause(status:string) {
  if(!status)return '';
  if(status==='renting')return ` AND o.order_status='renting' AND (o.return_at IS NULL OR o.return_at >= now())`;
  if(status==='overdue')return ` AND (o.order_status='overdue' OR o.order_status='renting' AND o.return_at < now()
    OR o.order_status IN ('renting','wait_payment') AND o.draft_payload::jsonb #> '{management_composer,installment_plan}' IS NOT NULL)`;
  if(!/^[a-z][a-z0-9_]{0,63}$/.test(status))throw new ManagementTableError('Bộ lọc không hợp lệ.');
  return ` AND o.order_status='${status}'`;
}
/** Recent created/started rentals plus every still-open contract so operations are never hidden. */
export function contractRecentClause(days:number) {
  return ` AND (
    o.order_status IN ('draft','renting','overdue','wait_payment','deposit_contract','pending','bad_debt')
    OR o.created_at >= (timezone('Asia/Ho_Chi_Minh', now()) - interval '${days} days')
    OR o.rent_at >= (timezone('Asia/Ho_Chi_Minh', now()) - interval '${days} days')
  )`;
}
function contractStoreSql(store:string) {
  return store==='all' ? '' : ` AND o.store_id=${Number(store)}`;
}
function contractDateSql(query:ManagementTableInput['query']) {
  // Dates are validated YYYY-MM-DD literals. Resolve legacy line dates in SQL
  // so a one-day filter never hydrates the entire contract history over hundreds
  // of network round trips before it can return its first ten matches.
  if(!query.startDate&&!query.endDate)return '';
  const started=`COALESCE(o.rent_at,(SELECT min(d.rent_at) FROM himoto.order_vehicle_details d WHERE d.order_id=o.id AND d.deleted_at IS NULL))`;
  return `${query.startDate?` AND ${started}>=('${query.startDate}'::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`:''}${query.endDate?` AND ${started}<(('${query.endDate}'::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`:''}`;
}
function likeNeedle(search:string) {
  return `%${search.trim().replace(/[%_\\]/g,'')}%`;
}
const foldedSql=(value:string)=>`lower(translate(regexp_replace(normalize(COALESCE(${value},''),NFD) COLLATE "C",'[\u0300-\u036f]','','g'),'đĐ','dD'))`;
function contractSearchSql(search:string) {
  if(!search.trim())return {sql:'',value:undefined as string|undefined};
  return {sql:` AND (o.contract_number ILIKE $3 OR o.draft_reference ILIKE $3 OR ${foldedSql('o.customer_name')} LIKE ${foldedSql('$3')} OR COALESCE(o.customer_phone,'') ILIKE $3
    OR EXISTS (SELECT 1 FROM himoto.customers linked_customer WHERE linked_customer.id=o.customer_id
      AND (${foldedSql('linked_customer.name')} LIKE ${foldedSql('$3')} OR COALESCE(linked_customer.phone,'') ILIKE $3))
    OR EXISTS (SELECT 1 FROM himoto.order_vehicle_details d JOIN ${contractVehicleReadSource()} v ON v.id=d.vehicle_id
      WHERE d.order_id=o.id AND d.deleted_at IS NULL AND (v.license ILIKE $3
        OR regexp_replace(upper(COALESCE(v.license,'')),'[^A-Z0-9]','','g') LIKE '%'||regexp_replace(upper($3),'[^A-Z0-9]','','g')||'%')))`,
    value:likeNeedle(search)};
}
function contractFilterSql(filters:Record<string,string>) {
  let sql='';
  if(/^[1-9]\d{0,14}$/.test(filters.customer_id||''))sql+=` AND o.customer_id=${Number(filters.customer_id)}`;
  if(/^[1-9]\d{0,14}$/.test(filters.id||''))sql+=` AND o.id=${Number(filters.id)}`;
  if(/^[1-9]\d{0,14}$/.test(filters.store_id||''))sql+=` AND o.store_id=${Number(filters.store_id)}`;
  const type=filters.contract_type_id||filters.rental_type;
  if(type)sql+=` AND COALESCE(NULLIF(o.draft_payload #>> '{management_composer,draft,contract_type_id}',''),${EFFECTIVE_RENTAL_TYPE_SQL})='${type.replaceAll("'","''")}'`;
  if(filters.ownership_term_months)sql+=` AND ${EFFECTIVE_RENTAL_TYPE_SQL}='ownership'
    AND COALESCE(NULLIF(o.draft_payload #>> '{management_composer,profile,ownership_term_months}',''),NULLIF(o.draft_payload #>> '{management_composer,draft,ownership_term_months}',''),'custom')='${filters.ownership_term_months.replaceAll("'","''")}'`;
  return sql;
}
export function contractPageSql(scopeClause:string,includeTotal=false) {
  return `SELECT ${includeTotal?'count(*) OVER()::int AS __total_count, ':''}o.id, o.contract_number, o.draft_reference,
    CASE WHEN o.order_status='renting' AND o.return_at < now() THEN 'overdue' ELSE o.order_status END AS status,
    o.customer_id, o.customer_name, o.customer_phone,
    o.store_id, s.store_name, s.kind AS store_kind, o.rent_at AS start_date, o.return_at AS end_date,
    o.total AS total_amount, '[]'::json AS vehicles,
    o.xmin::text AS draft_revision,
    CASE WHEN o.order_status='draft' THEN o.draft_payload ELSE NULL END AS draft_payload
    FROM himoto.orders o
    LEFT JOIN himoto.stores s ON s.id = o.store_id
    WHERE o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}${scopeClause}`;
}
function customerSearchSql(search:string) {
  if(!search.trim())return {sql:'',value:undefined as string|undefined};
  return {sql:` AND (${foldedSql('c.name')} LIKE ${foldedSql('$3')} OR COALESCE(c.phone,'') ILIKE $3 OR COALESCE(c.id_card,'') ILIKE $3 OR ${foldedSql('c.address')} LIKE ${foldedSql('$3')})`,
    value:likeNeedle(search)};
}
function customerPageClause(store:string,status:string) {
  const storeSql=store==='all'?'':` AND c.store_id=${Number(store)}`;
  const statusSql=status==='blacklist'||status==='bad_debt'?` AND c.status=2`
    :status==='draft'?` AND c.status=0`
    :status==='warning'?` AND NULLIF(BTRIM(c.warning),'') IS NOT NULL`
    :status==='active'?` AND c.status NOT IN (0,2) AND NULLIF(BTRIM(c.warning),'') IS NULL`:'';
  return `${storeSql}${statusSql}`;
}
export function customerPageSql(scopeClause:string) {
  return `SELECT c.id, c.name, c.phone, c.id_card, c.address,
    CASE WHEN c.status = 2 THEN 'bad_debt' WHEN c.status = 0 THEN 'draft'
         WHEN NULLIF(BTRIM(c.warning), '') IS NOT NULL THEN 'warning' ELSE 'active' END AS status,
    c.warning, c.store_id, s.store_name, COALESCE(oc.contract_count,0) AS contract_count
    FROM himoto.customers c
    LEFT JOIN himoto.stores s ON s.id = c.store_id
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS contract_count FROM himoto.orders o WHERE o.customer_id=c.id AND o.deleted_at IS NULL
    ) oc ON true
    WHERE true${scopeClause}`;
}
function contractHydrateSql() {
  // Legacy imports often have only customer_id. Resolve the linked profile on
  // this bounded page, using the same customer fields as CONTRACT_LIST_SQL.
  return `SELECT o.id, o.contract_number, o.draft_reference,
    o.created_at, o.updated_at, o.contract_signed_on::text AS signed_on,
    ${OWNERSHIP_HOLD_FIELDS_SQL},
    ${CONTRACT_REVIEW_SQL},
    ${BAD_DEBT_CUTOFF_SQL} AS bad_debt_at,
    CASE WHEN o.order_status='renting' AND COALESCE(o.return_at,ov.end_date) < now() THEN 'overdue' ELSE o.order_status END AS status,
    o.customer_id, c.status AS customer_status,
    COALESCE(c.name,o.customer_name) AS customer_name, COALESCE(c.phone,o.customer_phone) AS customer_phone,
    o.store_id, s.store_name, s.kind AS store_kind,
    COALESCE(o.rent_at,ov.start_date) AS start_date, COALESCE(o.return_at,ov.end_date) AS end_date, o.total AS total_amount,
    ${rentalPaidSql()} AS paid_amount, dep.paid AS deposit_paid, dep.refunded AS deposit_refunded,
    CASE WHEN o.first_deposit_amount IS NULL AND o.additional_deposit_amount IS NULL THEN NULL
      ELSE COALESCE(o.first_deposit_amount,0)+COALESCE(o.additional_deposit_amount,0) END AS deposit_amount,
    COALESCE(staff.full_name, saved_staff.full_name, fallback_staff.full_name) AS staff_name,
    ${EFFECTIVE_RENTAL_TYPE_SQL} AS rental_type,
    o.draft_payload #>> '{management_composer,draft,contract_type_id}' AS contract_type_id,
    o.draft_payload #>> '{management_composer,draft,contract_type_name}' AS contract_type_name,
    o.draft_payload #>> '{management_composer,draft,contract_type_months}' AS contract_type_months,
    COALESCE(o.draft_payload #>> '{management_composer,profile,ownership_term_months}',o.draft_payload #>> '{management_composer,draft,ownership_term_months}') AS ownership_term_months,
    o.note AS notes, o.xmin::text AS draft_revision,
    CASE WHEN o.order_status='draft' THEN jsonb_build_object(
      'management_composer', o.draft_payload::jsonb->'management_composer',
      'order_items', COALESCE(o.draft_payload::jsonb->'order_items','[]'::jsonb))
    ELSE jsonb_build_object('management_composer',jsonb_build_object('installment_plan',o.draft_payload #> '{management_composer,installment_plan}')) END AS draft_payload,
    ov.vehicles
    FROM himoto.orders o
    LEFT JOIN himoto.customers c ON c.id=o.customer_id
    LEFT JOIN himoto.stores s ON s.id = o.store_id
    ${depositLateral()}
    LEFT JOIN (SELECT DISTINCT ON (user_id,store_id) id,user_id,store_id,full_name FROM himoto.staff_account_attribution ORDER BY user_id,store_id,id) staff
      ON staff.user_id=o.contract_responsible_user_id AND staff.store_id=o.store_id
    LEFT JOIN himoto.staff_profiles saved_staff ON saved_staff.id::text=o.draft_payload->'management_composer'->'draft'->>'staff_id'
    LEFT JOIN (SELECT DISTINCT ON (user_id) user_id,full_name FROM himoto.staff_account_attribution ORDER BY user_id,id) fallback_staff
      ON fallback_staff.user_id=o.contract_responsible_user_id
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('id', v.id, 'name', v.name, 'license', v.license,
        'brand', v.brand, 'type', v.type, 'year', v.year, 'color', v.color,
        'warehouse_store_id',warehouse.store_id,'warehouse_store_name',warehouse.store_name,'completed_at',d.completed_at) ORDER BY d.id) AS vehicles,
        min(d.rent_at) AS start_date, max(d.return_at) AS end_date
      FROM himoto.order_vehicle_details d LEFT JOIN himoto.vehicles v ON v.id = d.vehicle_id
      ${contractWarehouseJoinSql()}
      WHERE d.order_id=o.id AND d.deleted_at IS NULL
    ) ov ON true
    WHERE o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL} AND o.id=ANY($1::bigint[])`;
}
function vehicleSearchSql(search:string) {
  if(!search.trim())return {sql:'',value:undefined as string|undefined};
  const plate=search.replace(/[^a-z0-9]/gi,'');
  return {sql:` AND (${foldedSql('v.name')} LIKE ${foldedSql('$3')} OR v.license ILIKE $3 OR v.brand ILIKE $3
    ${/\d/.test(plate)?`OR regexp_replace(upper(COALESCE(v.license,'')),'[^A-Z0-9]','','g') LIKE '%'||regexp_replace(upper($3),'[^A-Z0-9]','','g')||'%'`:''}
    OR EXISTS (SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
      LEFT JOIN himoto.customers c ON c.id=o.customer_id WHERE d.vehicle_id=v.id AND d.deleted_at IS NULL AND d.completed_at IS NULL
      AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL} AND o.order_status IN ('renting','overdue','wait_payment','pending','deposit_contract')
      AND ${foldedSql('COALESCE(c.name,o.customer_name)')} LIKE ${foldedSql('$3')}))`,value:likeNeedle(search)};
}
function vehicleOverdueSql() {
  return `COALESCE((SELECT GREATEST(0,floor(extract(epoch FROM (now()-min(d.return_at)))/86400))::int
    FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
    WHERE d.vehicle_id=v.id AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
      AND ${VEHICLE_ORDER_SQL} AND o.order_status IN ('renting','overdue','wait_payment','pending','deposit_contract')),0)`;
}
function vehicleRentalSql(field:'customer'|'store') {
  return `(SELECT ${field==='customer'?"COALESCE(c.name,o.customer_name,'')":'o.store_id'}
    FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
    ${field==='customer'?'LEFT JOIN himoto.customers c ON c.id=o.customer_id':''}
    WHERE d.vehicle_id=v.id AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
      AND ${VEHICLE_ORDER_SQL} AND o.order_status IN ('renting','overdue','wait_payment','pending','deposit_contract')
    ORDER BY d.rent_at DESC,d.id DESC LIMIT 1)`;
}
const vehicleBeneficiarySql=()=>`rental_source.store_id`;
const VEHICLE_RENTAL_SOURCE_JOIN_SQL=`LEFT JOIN himoto.vehicle_rental_sources(ARRAY(SELECT id FROM himoto.vehicles WHERE deleted_at IS NULL AND COALESCE(current_store_id,store_id)>0)) rental_source ON rental_source.vehicle_id=v.id`;
function vehicleDerivedClause(query:ManagementTableInput['query']) {
  const op=query.overdueCompare==='gt'?'>':query.overdueCompare==='lt'?'<':'=';
  const days=query.overdueDays?` AND ${vehicleOverdueSql()}${op}${Number(query.overdueDays)}`:'';
  return days;
}
export function vehiclePageClause(store:string,status:string,filters:Record<string,string>) {
  const storeSql=store==='all'?'':` AND (COALESCE(v.current_store_id,v.store_id)=${Number(store)} OR himoto.ownership_may_use_headquarters_vehicle(COALESCE(v.current_store_id,v.store_id)))`;
  const mapped:Record<string,string>={using:"'using','rent'",repairing:"'repairing','maintenance'",pending:"'pending','holding'"};
  const statusSql=!status?'':mapped[status]?` AND v.status IN (${mapped[status]})`
    :/^[a-z][a-z0-9_]{0,63}$/.test(status)?` AND v.status='${status}'`:'';
  const type=filters.type||'';
  const typeSql=!type?'':type==='xe_dien'?` AND v.type IN ('xe_dien','electric')`
    :/^[a-z0-9_]+$/.test(type)?` AND v.type='${type}'`:'';
  const beneficiary=filters.beneficiary_store_id||'';
  const beneficiarySql=/^[1-9]\d{0,14}$/.test(beneficiary)?` AND ${vehicleBeneficiarySql()}=${Number(beneficiary)}`:'';
  return `${storeSql}${statusSql}${typeSql}${beneficiarySql}`;
}
export function vehiclePageSql(scopeClause:string) {
  return `SELECT v.id, v.name, v.brand, v.type, v.year, v.status, v.license, v.odometer,
    v.color, v.chassis, v.engine, v.store_id, v.current_store_id, s.store_name,
    v.xmin::text AS vehicle_revision
    FROM himoto.vehicles v
    LEFT JOIN himoto.stores s ON s.id=COALESCE(v.current_store_id,v.store_id)
    ${VEHICLE_RENTAL_SOURCE_JOIN_SQL}
    WHERE v.deleted_at IS NULL AND COALESCE(v.current_store_id,v.store_id)>0${scopeClause}`;
}
function vehicleHydrateSql() {
  return `SELECT v.id, v.name, v.brand, v.type, v.year, v.license, v.odometer,
    NULL::numeric AS daily_price, NULL::numeric AS monthly_price,
    v.color, v.chassis, v.engine, v.store_id, v.current_store_id, s.store_name, v.xmin::text AS vehicle_revision,
    pending_transfer.id AS transfer_event_id,pending_transfer.from_store_id AS transfer_from_store_id,
    pending_transfer.to_store_id AS transfer_to_store_id,pending_transfer.from_store_name AS transfer_from_store_name,
    pending_transfer.to_store_name AS transfer_to_store_name,pending_transfer.receivable AS transfer_receivable,
    r.rentals, COALESCE(r.rentals,'[]'::json) AS rental_blockers,
    rental_source.store_id AS beneficiary_store_id,
    bs.store_name AS beneficiary_store_name,
    NULLIF(r.rentals #>> '{0,customer}', '') AS holder_name,
    CASE WHEN r.rentals IS NOT NULL AND json_typeof(r.rentals)='array' AND json_array_length(r.rentals)>0
      AND v.status IN ('ready') THEN 'using'
      WHEN v.status='rent' THEN 'using' WHEN v.status='maintenance' THEN 'repairing' WHEN v.status='holding' THEN 'pending'
      ELSE v.status END AS status,
    gps.has_device AS gps_has_device, gps.normalized_status AS gps_normalized_status, gps.last_at AS gps_last_at,
    gps.latitude AS gps_latitude, gps.longitude AS gps_longitude, gps.synced_at AS gps_last_sync, gps.provider AS gps_provider,
    gps.heartbeat_at AS gps_heartbeat_at, gps.position_recorded_at AS gps_position_at,
    gps.provider_reported_at AS gps_reported_at, gps.last_ignition AS gps_ignition
    FROM himoto.vehicles v
    LEFT JOIN himoto.stores s ON s.id=COALESCE(v.current_store_id,v.store_id)
    ${VEHICLE_TRANSFER_JOIN_SQL}
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('order_id', o.id,
               'code', COALESCE(NULLIF(o.contract_number, ''), NULLIF(o.draft_reference, ''), '#' || o.id::text),
               'status', CASE WHEN o.order_status = 'renting' AND d.return_at < now() THEN 'overdue' ELSE o.order_status END,
               'customer', COALESCE(c.name, o.customer_name, ''), 'rent_at', d.rent_at, 'return_at', d.return_at) ORDER BY d.rent_at DESC) AS rentals,
             (array_agg(o.store_id ORDER BY d.rent_at DESC))[1] AS store_id
      FROM himoto.order_vehicle_details d
      JOIN himoto.orders o ON o.id = d.order_id
      LEFT JOIN himoto.customers c ON c.id = o.customer_id
      WHERE d.vehicle_id = v.id AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
        AND o.order_status IN ('renting', 'overdue', 'wait_payment', 'pending', 'deposit_contract')
    ) r ON true
    LEFT JOIN himoto.vehicle_rental_sources($1::bigint[]) rental_source ON rental_source.vehicle_id=v.id
    LEFT JOIN himoto.stores bs ON bs.id=rental_source.store_id
    ${VEHICLE_GPS_JOIN_SQL}
    WHERE v.id=ANY($1::bigint[])`;
}
function staffSearchSql(search:string) {
  if(!search.trim())return {sql:'',value:undefined as string|undefined};
  return {sql:` AND (${foldedSql('p.full_name')} LIKE ${foldedSql('$3')} OR COALESCE(p.phone,'') ILIKE $3 OR COALESCE(p.staff_code,'') ILIKE $3)`,value:likeNeedle(search)};
}
function staffPageClause(store:string,status:string,filters:Record<string,string>) {
  const storeSql=store==='all'?'':` AND p.store_id=${Number(store)}`;
  const statusSql=status==='active'?` AND p.status IN ('active','1')`:status==='inactive'?` AND p.status IN ('inactive','0')`
    :status&&/^[a-z][a-z0-9_]{0,63}$/.test(status)?` AND p.status='${status}'`:'';
  const position=filters.position||'';
  const positionSql=position.length&&position.length<=100?` AND p.position='${position.replace(/'/g,"''")}'`:'';
  return `${storeSql}${statusSql}${positionSql}`;
}
export function staffPageSql(scopeClause:string) {
  return `SELECT p.id, p.staff_code, p.full_name, p.phone, p.email, p.position,
    p.store_id, s.store_name, p.status, p.joined_at, p.notes, p.user_id
    FROM himoto.staff_profiles p
    LEFT JOIN himoto.stores s ON s.id = p.store_id
    WHERE true${scopeClause}`;
}
function storeSearchSql(search:string) {
  if(!search.trim())return {sql:'',value:undefined as string|undefined};
  return {sql:` AND (${foldedSql('s.store_name')} LIKE ${foldedSql('$3')} OR COALESCE(s.code,'') ILIKE $3 OR ${foldedSql('s.store_address')} LIKE ${foldedSql('$3')})`,value:likeNeedle(search)};
}
function storePageClause(status:string) {
  return status==='active'?` AND s.status IN ('active','opening','1')`:status==='inactive'?` AND s.status IN ('inactive','0')`
    :status&&/^[a-z][a-z0-9_]{0,63}$/.test(status)?` AND s.status='${status}'`:'';
}
export function storePageSql(scopeClause:string) {
  return `${STORE_SELECT_SQL} WHERE true${scopeClause}`;
}
function catalogueOrder(input:ManagementTableInput) {
  const columns:Record<string,Record<string,string>>={
    customers:{code:'c.id',name:'c.name',phone:'c.phone',id_card:'c.id_card',address:'c.address',store_name:'s.store_name',contract_count:'oc.contract_count',status:'c.status'},
    vehicles:{code:'v.id',name:'v.name',license:'v.license',brand:'v.brand',type:'v.type',year:'v.year',color:'v.color',chassis:'v.chassis',engine:'v.engine',odometer:'v.odometer',store_name:'s.store_name',status:'v.status',overdue_days:vehicleOverdueSql(),holder_name:`COALESCE(NULLIF(${vehicleRentalSql('customer')},''),'Lưu kho')`,beneficiary_store_name:`(SELECT bs.store_name FROM himoto.stores bs WHERE bs.id=${vehicleBeneficiarySql()})`,location_status:`(SELECT COALESCE(gps.normalized_status,'none') FROM (SELECT 1) anchor ${VEHICLE_GPS_JOIN_SQL})`},
    staff:{code:'p.staff_code',name:'p.full_name',phone:'p.phone',email:'p.email',position:'p.position',store_name:'s.store_name',status:'p.status',hire_date:'p.joined_at'},
    stores:{code:'s.code',name:'s.store_name',phone:'s.store_phone',address:'s.store_address',manager_name:'u.name',vehicle_count:'vc.n',staff_count:'pc.n',status:'s.status'},
  };
  const id=input.kind==='customers'?'c.id':input.kind==='vehicles'?'v.id':input.kind==='staff'?'p.id':'s.id';
  const expression=columns[input.kind]?.[input.sort]||id;
  const direction=input.direction==='desc'?'DESC':'ASC';
  return `${expression} ${direction} NULLS LAST,${id} ${direction}`;
}
/** Count lightweight records under the same RLS/store rules as their list.
 * Search and category filters affect tab counts; the selected status affects
 * pagination only. The heading always counts the entire permitted catalogue.
 */
async function readCatalogueCounts(client:Pick<PoolClient,'query'>,input:ManagementTableInput,search:{sql:string;value:string|undefined}) {
  const {kind,store,query}=input;
  const source=kind==='customers'?'himoto.customers c':kind==='vehicles'?'himoto.vehicles v':kind==='staff'?'himoto.staff_profiles p':'himoto.stores s';
  const scope=kind==='customers'?customerPageClause(store,'')
    :kind==='vehicles'?` AND v.deleted_at IS NULL AND COALESCE(v.current_store_id,v.store_id)>0${vehiclePageClause(store,'',{})}`
    :kind==='staff'?staffPageClause(store,'',{}):'';
  const filters=kind==='vehicles'?`${vehiclePageClause('all','',query.filters)}${vehicleDerivedClause(query)}`:kind==='staff'?staffPageClause('all','',query.filters):'';
  const selected=kind==='customers'?customerPageClause('all',query.status)
    :kind==='vehicles'?vehiclePageClause('all',query.status,{})
    :kind==='staff'?staffPageClause('all',query.status,{}):storePageClause(query.status);
  const status=kind==='customers'?`CASE WHEN c.status=2 THEN 'blacklist' WHEN c.status=0 THEN 'draft' WHEN NULLIF(BTRIM(c.warning),'') IS NOT NULL THEN 'warning' ELSE 'active' END`
    :kind==='vehicles'?`CASE v.status WHEN 'rent' THEN 'using' WHEN 'maintenance' THEN 'repairing' WHEN 'holding' THEN 'pending' ELSE v.status END`
    :kind==='staff'?`CASE p.status WHEN '1' THEN 'active' WHEN '0' THEN 'inactive' ELSE p.status END`
    :`CASE s.status WHEN '1' THEN 'active' WHEN 'opening' THEN 'active' WHEN '0' THEN 'inactive' ELSE s.status END`;
  const result=await client.query(`WITH counted AS MATERIALIZED (
    SELECT ${status} AS status,(true${filters}${search.sql.replaceAll('$3','$1')}) AS matches,(true${selected}) AS selected
    FROM ${source} ${kind==='vehicles'&&query.filters.beneficiary_store_id?VEHICLE_RENTAL_SOURCE_JOIN_SQL:''} WHERE true${scope}
  ) SELECT count(*)::int AS scope_count,count(*) FILTER (WHERE matches)::int AS tab_count,
    count(*) FILTER (WHERE matches AND selected)::int AS total,
    COALESCE((SELECT jsonb_agg(jsonb_build_array(status,n) ORDER BY status) FROM (
      SELECT status,count(*)::int AS n FROM counted WHERE matches GROUP BY status
    ) grouped),'[]'::jsonb) AS status_counts FROM counted`,search.value?[search.value]:[]);
  const row=result.rows[0];
  if(!row||['scope_count','tab_count','total'].some(key=>!Number.isSafeInteger(row[key])||row[key]<0)
    ||!Array.isArray(row.status_counts))throw new Error('Không đọc được tổng số bản ghi. Vui lòng thử lại.');
  return {scopeCount:row.scope_count as number,tabCount:row.tab_count as number,total:row.total as number,statusCounts:row.status_counts as [string,number][]};
}
function mapManagementRows(kind:TableKind,rows:unknown[]) {
  const mapped=[];
  for(const row of rows){
    try { mapped.push(mapApiRow(kind,row as Parameters<typeof mapApiRow>[1])); }
    catch (error) { console.error('Skipping unreadable management row', error); }
  }
  return mapped;
}
export async function readManagementTable(client:Pick<PoolClient,'query'>,kind:TableKind,params:URLSearchParams) {
  const input=parseManagementTable(kind,params);
  const all=params.get('all')==='1';
  const statusClause=kind==='contracts'?(all?contractStatusClause(input.query.status):contractPageStatusClause(input.query.status)):'';
  const monitoring=kind==='contracts'&&(input.scope==='overdue'||input.scope==='ownership'||input.query.status==='overdue'||input.query.status==='bad_debt'||Boolean(input.query.overdueBucket));
  const recentDays=input.recentDays&&!input.scope&&!input.query.search.trim()&&!input.query.startDate&&!input.query.endDate
    &&!input.query.filters.customer_id&&!input.query.filters.id ? input.recentDays : undefined;
  const storeSql=kind==='contracts'?(input.storeBasis==='warehouse'?contractWarehouseStoreSql(input.store):contractStoreSql(input.store)):'';
  const listWindow=all&&recentDays?contractRecentClause(recentDays):'';
  const clause=kind==='contracts'
    ? `${all?contractScopeClause(input.scope):contractPageScopeClause(input.scope)}${statusClause}${listWindow}${storeSql}${contractFilterSql(input.query.filters)}${all?'':contractDateSql(input.query)}`
    : '';
  const now=Date.now();
  const legacyFees=legacyOwnershipFeeReader(client);
  const overdueSql=(sql:string)=>monitoring?overdueDetailsSql(sql):sql;
  if(!all){
    // Count the permitted list without hydrating other tabs or applying search.
    let scopeCount:number|undefined;
    const separateScopeCount=Boolean(input.query.search.trim()||input.query.status||input.query.startDate||input.query.endDate||input.query.overdueDays||input.query.overdueBucket||Object.values(input.query.filters).some(Boolean)||input.scope==='due');
    if(kind==='contracts'&&params.get('scope_count')==='1'&&separateScopeCount){
      const counted=await client.query(`SELECT count(*)::int AS scope_count FROM himoto.orders o WHERE o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}${contractPageScopeClause(input.scope)}${storeSql}`);
      scopeCount=Number(counted.rows[0]?.scope_count);
      if(!Number.isSafeInteger(scopeCount)||scopeCount<0)throw new Error('Không đọc được tổng toàn bộ hợp đồng. Vui lòng thử lại.');
    }
    // Installment overdue state and age groups depend on the hydrated balance.
    // Read candidates for this tab in bounded batches and filter BEFORE paging;
    // otherwise a paid/not-yet-due rental can occupy an overdue result slot.
    const filterBeforePaging=kind==='contracts'&&Boolean(input.scope==='due'||input.query.status==='overdue'||input.query.overdueBucket||input.query.overdueDays||input.query.startDate||input.query.endDate);
    const take=filterBeforePaging?250:input.size;
    const search=kind==='contracts'?contractSearchSql(input.query.search)
      :kind==='customers'?customerSearchSql(input.query.search)
      :kind==='vehicles'?vehicleSearchSql(input.query.search)
      :kind==='staff'?staffSearchSql(input.query.search)
      :storeSearchSql(input.query.search);
    const catalogue=kind==='contracts'?null:await readCatalogueCounts(client,input,search);
    if(catalogue)scopeCount=catalogue.scopeCount;
    let total=catalogue?.total??0,page=catalogue?Math.min(input.page,Math.max(1,Math.ceil(total/input.size))):input.page;
    const offset=(page-1)*input.size;
    // Count only this tab's matching orders, before LIMIT. Do not hydrate history
    // or query the other tabs merely to obtain a real page count.
    const pageSql=kind==='contracts'?`${contractPageSql(clause,!filterBeforePaging)}${search.sql} ORDER BY o.id DESC LIMIT $1 OFFSET $2`
      :kind==='customers'?`${customerPageSql(customerPageClause(input.store,input.query.status))}${search.sql} ORDER BY ${catalogueOrder(input)} LIMIT $1 OFFSET $2`
      :kind==='vehicles'?`${vehiclePageSql(vehiclePageClause(input.store,input.query.status,input.query.filters))}${vehicleDerivedClause(input.query)}${search.sql} ORDER BY ${catalogueOrder(input)} LIMIT $1 OFFSET $2`
      :kind==='staff'?`${staffPageSql(staffPageClause(input.store,input.query.status,input.query.filters))}${search.sql} ORDER BY ${catalogueOrder(input)} LIMIT $1 OFFSET $2`
      :`${storePageSql(storePageClause(input.query.status))}${search.sql} ORDER BY ${catalogueOrder(input)} LIMIT $1 OFFSET $2`;
    const matches:ReturnType<typeof mapManagementRows>=[];
    let candidateOffset=filterBeforePaging?0:offset,moreCandidates=false;
    const readPage=(limit:number,start:number)=>client.query(pageSql,search.value?[limit,start,search.value]:[limit,start]);
    do {
      let indexed=await readPage(take,candidateOffset);
      if(kind==='contracts'&&!filterBeforePaging){
        // A deletion or changed filter can leave a requested page out of range.
        // Read one index row to recover the total, then return the actual last page.
        if(!indexed.rows.length&&candidateOffset>0){
          const first=await readPage(1,0);
          total=first.rows.length?Number(first.rows[0].__total_count):0;
          if(!Number.isSafeInteger(total)||total<0)throw new Error('Không đọc được tổng số hợp đồng. Vui lòng thử lại.');
          page=Math.max(1,Math.ceil(total/input.size));
          candidateOffset=(page-1)*input.size;
          indexed=total?await readPage(take,candidateOffset):first;
        }else total=indexed.rows.length?Number(indexed.rows[0].__total_count):0;
        if(!Number.isSafeInteger(total)||total<0)throw new Error('Không đọc được tổng số hợp đồng. Vui lòng thử lại.');
      }
      moreCandidates=indexed.rows.length===take;
      candidateOffset+=indexed.rows.length;
      let batch=mapManagementRows(kind,indexed.rows.slice(0,filterBeforePaging?take:input.size));
      if(batch.length&&(kind==='contracts'||kind==='vehicles')){
        const ids=batch.map(row=>row.id);
        // A failed detail query must fail this read, not silently turn balances,
        // vehicle labels or rental dates into missing/incorrect information.
        const details=await client.query(kind==='contracts'?overdueSql(contractVehicleDetailsSql(contractHydrateSql())):vehicleHydrateSql(),[ids]);
        const mapped=new Map(mapManagementRows(kind,details.rows).map(record=>[record.id,record]));
        batch=batch.map(row=>mapped.get(row.id)||row);
      }
      if(kind==='contracts'){
        batch=batch.map(row=>applyInstallmentBilling(row,now));
        if(monitoring)batch=(await legacyFees(batch)).map(row=>withContractMonitoring(row,now));
        if(input.scope==='due')batch=batch.filter(row=>row.billing_overdue_at&&Number(row.billing_due_amount)>0);
      }
      if(filterBeforePaging)batch=filterRows(batch,{...input.query,search:''},'all');
      matches.push(...batch);
    }while(filterBeforePaging&&moreCandidates);
    // Derived overdue filters must finish counting the selected candidate
    // set; stopping at one extra match is not a total and hides older pages.
    if(filterBeforePaging){total=matches.length;page=Math.min(input.page,Math.max(1,Math.ceil(total/input.size)));}
    const pageOffset=(page-1)*input.size;
    const rows=filterBeforePaging?sortRows(matches,input.sort,input.direction).slice(pageOffset,pageOffset+input.size):matches;
    const pages=Math.max(1,Math.ceil(total/input.size));
    let stats;
    if(kind==='contracts'&&params.get('status_counts')==='1'){
      const statsClause=`${contractPageScopeClause(input.scope)}${storeSql}${contractFilterSql(input.query.filters)}`;
      stats=await fastContractStatistics(client,input,statsClause,now);
      if(!stats){
      const base=`${contractStatisticsSql(statsClause,input.scope==='vat')}${search.sql.replaceAll('$3','$1')}`;
      const result=await client.query(monitoring||input.query.overdueDays?overdueDetailsSql(base):base,search.value?[search.value]:[]);
      const index=(await legacyFees(result.rows.map(mapContractStatistics))).map(row=>['renting','overdue','wait_payment','bad_debt'].includes(row.status)||row.billing_plan_json||input.query.overdueDays?withContractMonitoring(applyInstallmentBilling(row,now),now):row);
      // Search is already bound/applied in SQL, including customer and plate
      // EXISTS checks. Those labels need not travel back for a second search.
      stats=projectManagementTable(index,{...input,...(input.storeBasis==='warehouse'?{store:'all'}:{}),query:{...input.query,search:''},page:1,size:1},true,now);
      }
    }
    return {
      rows,total,scopeCount:scopeCount??total,tabCount:stats?.tabCount??catalogue?.tabCount??total,page,pages,
      statusCounts:stats?.statusCounts??catalogue?.statusCounts??[],statuses:stats?.statuses??(catalogue?catalogue.statusCounts.map(([status])=>status):[...new Set(rows.map(row=>row.status))].sort()),dueCount:stats?.dueCount??0,
      summary:stats?.summary??(kind==='contracts'?{contractCount:total,blacklistCount:0,totalAmount:null,receivableAmount:null,badDebtAmount:null}:null),
      ...(stats?.overdueCounts?{overdueCounts:stats.overdueCounts}:{}),
      recentDays:kind==='contracts'?recentDays??null:undefined,
    };
  }
  const fullSql=kind==='contracts' ? `${CONTRACT_LIST_SQL}${clause}` : CUSTOMER_PROFILE_SQL;
  const result=await client.query(kind==='contracts' ? overdueSql(contractVehicleDetailsSql(fullSql)) : fullSql);
  const mapped=mapManagementRows(kind,result.rows);
  return projectManagementTable(monitoring?await legacyFees(mapped):mapped,input,all,now);
}
