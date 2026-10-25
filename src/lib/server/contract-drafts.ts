import 'server-only';
import { validDocumentRequirements } from '@/lib/management/contract-requirements';
import type { PoolClient } from 'pg';
import { loadCommissionStaff } from './commission-staff';
import { CUSTOMER_FIELDS, createContractDraft, dateTimeInput, emptyVehicle } from '@/lib/management/contract-document';
import { saveDraftRecord } from '@/lib/management/contract-drafts';
import { ContractEdits, ManagementDataset, ManagementRow } from '@/lib/management/types';
import { depositLateral, rentalPaidSql } from './contract-deposits';
import { BAD_DEBT_CUTOFF_SQL } from './contract-bad-debt';
import { chargeTotal } from '@/lib/management/contract-charges';
import { validOwnershipTerm } from '@/lib/management/contract-billing';
import { CONTRACT_TYPES } from '@/lib/management/config';
import { ContractTypeError, resolveDraftContractType, validContractTypeId } from './contract-types';
import type { ContractDraft } from '@/lib/management/contract-document';
import { dataAccess, usesScopedDatabase } from './access-context';
import { contractNumberError, paperContractNumber } from '@/lib/management/contract-number';
import { contractNumberAvailable } from './contract-number';
import { EFFECTIVE_RENTAL_TYPE_SQL,VEHICLE_ORDER_SQL } from './contract-classification';
import { contractVehicleDetailsSql } from './contract-vehicle-reads';

const CONTRACT_RETURN_ADJUSTMENT_SQL = `COALESCE((SELECT SUM(
    CASE WHEN (r.value->>'fee') ~ '^-?\\d+(\\.\\d+)?$' THEN (r.value->>'fee')::numeric ELSE 0 END)
  FROM jsonb_array_elements(COALESCE(o.draft_payload::jsonb #> '{management_composer,return_adjustments}','[]'::jsonb)) AS r(value)),0)`;
/** List/detail projection: omit per-row payment history (collections) and full draft blob for issued contracts. */
function contractListSql(compact = false) { return `SELECT o.id, o.contract_number, o.draft_reference,
  ${BAD_DEBT_CUTOFF_SQL} AS bad_debt_at,
  ${EFFECTIVE_RENTAL_TYPE_SQL} AS rental_type,
  o.draft_payload #>> '{management_composer,draft,contract_type_id}' AS contract_type_id,
  o.draft_payload #>> '{management_composer,draft,contract_type_name}' AS contract_type_name,
  o.draft_payload #>> '{management_composer,draft,contract_type_months}' AS contract_type_months,
  COALESCE(o.draft_payload #>> '{management_composer,profile,sales_staff_id}',o.draft_payload #>> '{management_composer,draft,sales_staff_id}') AS sales_staff_id,
  COALESCE(o.draft_payload #>> '{management_composer,profile_attribution,NVKD,name}',o.draft_payload #>> '{management_composer,sales_attribution,NVKD,name}') AS sales_staff_name,

  CASE WHEN o.order_status='renting' AND COALESCE(o.return_at,ov.end_date) < now() THEN 'overdue' ELSE o.order_status END AS status,
  o.customer_id, c.status AS customer_status, c.customer_type, c.nationality, c.contact_channel, c.contact_detail,
  COALESCE(c.name, o.customer_name) AS customer_name, COALESCE(c.phone, o.customer_phone) AS customer_phone,
  COALESCE(c.id_card, o.customer_idnumber) AS customer_id_card,
  COALESCE(c.address, o.customer_address) AS customer_address, c.email AS customer_email,
  c.id_card_issued_on, c.id_card_issued_by,
  c.driver_license_number AS customer_driver_license_number, c.driver_license_issued_on::text AS customer_driver_license_issued_on,
  c.relatives, c.warning AS warning_note,
  o.store_id, s.store_name, s.kind AS store_kind, COALESCE(o.rent_at, ov.start_date) AS start_date, COALESCE(o.return_at, ov.end_date) AS end_date,
  o.total AS total_amount, ${rentalPaidSql()} AS paid_amount, dep.paid AS deposit_paid, dep.refunded AS deposit_refunded,
  '[]'::json AS collections,
  CASE WHEN NULLIF(o.draft_payload->'management_composer'->'draft'->>'unit_price','') ~ '^-?\\d+(\\.\\d+)?$'
    THEN (o.draft_payload->'management_composer'->'draft'->>'unit_price')::numeric ELSE NULL END AS unit_price,
  o.draft_payload->'management_composer'->'draft'->>'package_name' AS package_name,
  o.draft_payload->'management_composer'->'draft'->>'payment_method' AS payment_method,
  o.draft_payload->'management_composer'->'draft'->>'deposit_payment_method' AS deposit_payment_method,
  COALESCE(company.paid_amount,0) AS company_paid_amount, COALESCE(company.payment_count,0) AS company_payment_count,
  CASE WHEN o.first_deposit_amount IS NULL AND o.additional_deposit_amount IS NULL THEN NULL
       ELSE COALESCE(o.first_deposit_amount, 0) + COALESCE(o.additional_deposit_amount, 0) END AS deposit_amount,
  ${CONTRACT_RETURN_ADJUSTMENT_SQL} AS return_adjustment_amount,
  o.note AS notes, o.created_at, o.updated_at, o.xmin::text AS draft_revision,
  staff.id AS staff_id, staff.full_name AS staff_name,
  COALESCE(NULLIF(trim(o.draft_payload->'management_composer'->'draft'->>'staff_name'),''),
    staff.full_name,
    saved_staff.full_name, fallback_staff.full_name) AS representative_name,
  CASE WHEN o.order_status='draft' THEN jsonb_build_object(
      'management_composer', o.draft_payload->'management_composer',
      'order_items', ${compact ? "'[]'::jsonb" : "o.draft_payload->'order_items'"})
    ELSE ${compact ? "'{}'::jsonb" : `jsonb_build_object('order_items', o.draft_payload->'order_items',
      'management_composer', jsonb_build_object(
        'installment_plan', o.draft_payload #> '{management_composer,installment_plan}',
        'profile', jsonb_strip_nulls(jsonb_build_object(
          'vehicle_store_id', o.draft_payload #> '{management_composer,draft,vehicle_store_id}',
          'staff_id', o.draft_payload #> '{management_composer,draft,staff_id}',
          'staff_name', o.draft_payload #> '{management_composer,draft,staff_name}',
          'sales_staff_id', o.draft_payload #> '{management_composer,draft,sales_staff_id}',
          'sales_staff_name', o.draft_payload #> '{management_composer,draft,sales_staff_name}',
          'tls_staff_id', o.draft_payload #> '{management_composer,draft,tls_staff_id}'
        )) || COALESCE(o.draft_payload::jsonb #> '{management_composer,profile}','{}'::jsonb),
        'sales_attribution', o.draft_payload #> '{management_composer,sales_attribution}',
        'profile_attribution', o.draft_payload #> '{management_composer,profile_attribution}'
      ))`} END AS draft_payload,
  o.contract_signed_on AS signed_on, o.contract_authorization_date AS authorization_date,

  o.contract_collateral_description AS collateral_description, o.customer_source, o.customer_source_url,
  COALESCE(ov.vehicles, '[]'::json) AS vehicles
  FROM himoto.orders o
  LEFT JOIN himoto.customers c ON c.id = o.customer_id
  LEFT JOIN himoto.stores s ON s.id = o.store_id
  ${depositLateral()}
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(value),0) AS paid_amount, COUNT(*)::int AS payment_count
    FROM himoto.transactions WHERE order_id=o.id AND type IN ('in','addon') AND status='approved' AND bank_owner_type='company'
  ) company ON true
  LEFT JOIN (
    SELECT DISTINCT ON (user_id,store_id) id,user_id,store_id,full_name FROM himoto.staff_account_attribution ORDER BY user_id,store_id,id
  ) staff ON staff.user_id=o.contract_responsible_user_id AND staff.store_id=CASE
        WHEN COALESCE(o.draft_payload->'management_composer'->'draft'->>'vehicle_store_id','') ~ '^[0-9]+$'
        THEN (o.draft_payload->'management_composer'->'draft'->>'vehicle_store_id')::bigint
        ELSE o.store_id END
  LEFT JOIN himoto.staff_profiles saved_staff ON saved_staff.id::text=o.draft_payload->'management_composer'->'draft'->>'staff_id'
  LEFT JOIN (SELECT DISTINCT ON (user_id) user_id,full_name FROM himoto.staff_account_attribution ORDER BY user_id,id) fallback_staff ON fallback_staff.user_id=o.contract_responsible_user_id
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object('id', v.id, 'name', v.name, 'license', v.license${compact ? '' : `,
      'brand', v.brand, 'type', v.type, 'year', v.year, 'color', v.color,
      'driver_name', d.driver_name, 'driver_license_number', d.driver_license_number,
      'driver_license_issued_on', d.driver_license_issued_on, 'borrow_hats', d.borrow_hats,
      'borrow_raincoats', d.borrow_raincoats, 'rent_at', d.rent_at, 'return_at', d.return_at, 'completed_at', d.completed_at`} ) ORDER BY d.id) AS vehicles,
      min(d.rent_at) AS start_date, max(d.return_at) AS end_date
    FROM himoto.order_vehicle_details d LEFT JOIN himoto.vehicles v ON v.id = d.vehicle_id
    WHERE d.order_id=o.id AND d.deleted_at IS NULL
  ) ov ON true
  WHERE o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}`; }

export const CONTRACT_LIST_SQL = contractListSql();
/** Filtering/summary fields only. Full document/customer/vehicle details are hydrated for the selected page. */
export function contractTableSql(scopeClause: string) {
  return `SELECT id,contract_number,draft_reference,rental_type,contract_type_id,contract_type_name,contract_type_months,sales_staff_id,sales_staff_name,
    status,customer_id,customer_status,customer_name,customer_phone,store_id,store_name,store_kind,start_date,end_date,
    total_amount,paid_amount,deposit_amount,return_adjustment_amount,company_paid_amount,company_payment_count,representative_name,draft_payload,vehicles
    FROM (${contractListSql(true)}${scopeClause}) listing`;
}
/**
 * Lean index for paged lists: enough fields to filter/sort/summarize without staff joins,
 * return-adjustment scans, or full vehicle/document payloads. Page rows are hydrated next.
 * Aggregates stay LATERAL so PostgreSQL never scans every transaction/vehicle first.
 */
export function contractIndexSql(scopeClause: string, options: { includeVehicleLabels?: boolean; includeCompany?: boolean; includePaid?: boolean } = {}) {
  const includeVehicleLabels = Boolean(options.includeVehicleLabels);
  const includeCompany = Boolean(options.includeCompany);
  const includePaid = Boolean(options.includePaid);
  return `SELECT o.id, o.contract_number, o.draft_reference,
    ${BAD_DEBT_CUTOFF_SQL} AS bad_debt_at,
    o.contract_signed_on AS signed_on,
    ${EFFECTIVE_RENTAL_TYPE_SQL} AS rental_type,
    o.draft_payload #>> '{management_composer,draft,contract_type_id}' AS contract_type_id,
    o.draft_payload #>> '{management_composer,draft,contract_type_name}' AS contract_type_name,
    o.draft_payload #>> '{management_composer,draft,contract_type_months}' AS contract_type_months,
    CASE WHEN o.order_status='renting' AND COALESCE(o.return_at${includeVehicleLabels ? ',ov.end_date' : ''}) < now() THEN 'overdue' ELSE o.order_status END AS status,
    o.customer_id, c.status AS customer_status,
    COALESCE(c.name, o.customer_name) AS customer_name, COALESCE(c.phone, o.customer_phone) AS customer_phone,
    COALESCE(c.id_card, o.customer_idnumber) AS customer_id_card,
    o.store_id, s.store_name, s.kind AS store_kind, ${includeVehicleLabels ? 'COALESCE(o.rent_at, ov.start_date) AS start_date, COALESCE(o.return_at, ov.end_date) AS end_date' : 'o.rent_at AS start_date, o.return_at AS end_date'},
    o.total AS total_amount, ${includePaid ? rentalPaidSql() : 'NULL::numeric'} AS paid_amount,
    CASE WHEN o.first_deposit_amount IS NULL AND o.additional_deposit_amount IS NULL THEN NULL
         ELSE COALESCE(o.first_deposit_amount, 0) + COALESCE(o.additional_deposit_amount, 0) END AS deposit_amount,
    ${includeCompany
      ? 'COALESCE(company.paid_amount,0) AS company_paid_amount, COALESCE(company.payment_count,0) AS company_payment_count'
      : '0::numeric AS company_paid_amount, 0 AS company_payment_count'},
    CASE WHEN o.draft_payload::jsonb #> '{management_composer,installment_plan}' IS NOT NULL
      THEN jsonb_build_object('management_composer', jsonb_build_object('installment_plan', o.draft_payload #> '{management_composer,installment_plan}'))
      ELSE '{}'::jsonb END AS draft_payload,
    ${includeVehicleLabels ? 'COALESCE(ov.vehicles, \'[]\'::json)' : '\'[]\'::json'} AS vehicles
    FROM himoto.orders o
    LEFT JOIN himoto.customers c ON c.id = o.customer_id
    LEFT JOIN himoto.stores s ON s.id = o.store_id
    ${includePaid ? depositLateral() : ''}
    ${includeCompany ? `LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(value),0) AS paid_amount, COUNT(*)::int AS payment_count
      FROM himoto.transactions WHERE order_id=o.id AND type IN ('in','addon') AND status='approved' AND bank_owner_type='company'
    ) company ON true` : ''}
    ${includeVehicleLabels ? `LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('id', v.id, 'name', v.name, 'license', v.license) ORDER BY d.id) AS vehicles,
        min(d.rent_at) AS start_date, max(d.return_at) AS end_date
      FROM himoto.order_vehicle_details d
      LEFT JOIN himoto.vehicles v ON v.id = d.vehicle_id
      WHERE d.order_id=o.id AND d.deleted_at IS NULL
    ) ov ON true` : ''}
    WHERE o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}${scopeClause}`;
}

export function contractListScopeClause(scope: string | null): string {
  switch (scope) {
    case 'drafts': return ` AND o.order_status='draft'`;
    case 'overdue': return ` AND (o.order_status IN ('overdue','bad_debt') OR o.order_status='renting' AND o.return_at < now())`;
    case 'vat': return ` AND EXISTS (SELECT 1 FROM himoto.transactions t WHERE t.order_id=o.id AND t.type IN ('in','addon') AND t.status='approved' AND t.bank_owner_type='company')`;
    case 'ownership': return ` AND (EXISTS (SELECT 1 FROM himoto.stores sx WHERE sx.id=o.store_id AND sx.kind='lease_to_own') OR COALESCE(NULLIF(o.order_type,''), o.draft_payload #>> '{management_composer,rental_type}') IN ('ownership','ownership_cd'))`;
    default: return '';
  }
}
export class DraftSaveError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function parseDraftEdits(input: unknown): ContractEdits {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DraftSaveError('Thông tin bản nháp không hợp lệ.');
  const edits = input as ContractEdits;
  const draft = edits.draft;
  if(draft?.backfill!==undefined){const value=draft.backfill;if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['note','returned_at'].includes(key))||typeof value.note!=='string'||value.note.length>1000||(value.returned_at!==undefined&&(typeof value.returned_at!=='string'||value.returned_at.length>16)))throw new DraftSaveError('Thông tin nhập bổ sung không hợp lệ.');}
  if (chargeTotal(draft?.extra_charges) === null) throw new DraftSaveError('Các khoản phí khác không hợp lệ.');
  if (!draft || typeof draft !== 'object' || Array.isArray(draft) || !draft.customer || typeof draft.customer !== 'object' || Array.isArray(draft.customer)) throw new DraftSaveError('Thông tin bản nháp không hợp lệ.');
  const defaults = createContractDraft({ stores: [], staff: [], customers: [], contracts: [], vehicles: [] }, 'all');
  for (const key of Object.keys(defaults)) {
    // These sales fields are optional and validated below. Older drafts and
    // already-open forms predate their defaults and must remain saveable.
    if (['customer', 'vehicles', 'customer_id', 'relatives', 'vehicle_store_id','sales_staff_id','sales_staff_name'].includes(key)) continue;
    const value = draft[key as keyof typeof draft];
    if (typeof value !== 'string' || value.length > 4000) throw new DraftSaveError('Thông tin bản nháp không hợp lệ.');
  }
  if (!Array.isArray(draft.relatives) || draft.relatives.length !== 2) throw new DraftSaveError('Hợp đồng cần đủ 2 người thân.');
  for (const relative of draft.relatives) {
    if (!relative || typeof relative !== 'object' || Array.isArray(relative)) throw new DraftSaveError('Thông tin người thân không hợp lệ.');
    for (const key of ['name', 'relationship', 'phone'] as const) if (typeof relative[key] !== 'string' || relative[key].length > 4000) throw new DraftSaveError('Thông tin người thân không hợp lệ.');
  }
  for (const key of CUSTOMER_FIELDS) if (typeof draft.customer[key] !== 'string' || draft.customer[key].length > 4000) throw new DraftSaveError('Thông tin khách hàng không hợp lệ.');
  if (draft.customer_lookup !== undefined && (typeof draft.customer_lookup !== 'string' || draft.customer_lookup.length > 100)) throw new DraftSaveError('Thông tin tra cứu không hợp lệ.');
  if (draft.customer_id !== null && (!Number.isSafeInteger(draft.customer_id) || draft.customer_id <= 0)) throw new DraftSaveError('ID khách hàng không hợp lệ.');
  if (draft.vehicle_store_id !== undefined && typeof draft.vehicle_store_id !== 'string') throw new DraftSaveError('Cửa hàng xe không hợp lệ.');
  if (draft.reservation !== undefined && typeof draft.reservation !== 'boolean') throw new DraftSaveError('Thông tin giữ xe không hợp lệ.');
  if (draft.ownership !== undefined && typeof draft.ownership !== 'boolean') throw new DraftSaveError('Thông tin thuê sở hữu không hợp lệ.');
  if (draft.contract_type_id !== undefined && !validContractTypeId(draft.contract_type_id)) throw new DraftSaveError('Loại hợp đồng không hợp lệ.');
  if (draft.contract_type_name !== undefined && (typeof draft.contract_type_name !== 'string' || draft.contract_type_name.length > 80)) throw new DraftSaveError('Tên loại hợp đồng không hợp lệ.');
  if (draft.contract_type_months !== undefined && (typeof draft.contract_type_months !== 'string' || draft.contract_type_months !== '' && (!/^\d{1,3}$/.test(draft.contract_type_months) || Number(draft.contract_type_months) < 1 || Number(draft.contract_type_months) > 120))) throw new DraftSaveError('Thời hạn loại hợp đồng không hợp lệ.');
  if (!draft.contract_type_id && (draft.contract_type_name || draft.contract_type_months)) throw new DraftSaveError('Chọn loại hợp đồng cho tên và thời hạn đã nhập.');
  if (draft.document_requirements !== undefined && !validDocumentRequirements(draft.document_requirements)) throw new DraftSaveError('Yêu cầu hồ sơ để in chưa hợp lệ.');
  for (const key of ['sales_staff_id','tls_staff_id'] as const) if (draft[key] !== undefined && (typeof draft[key] !== 'string' || draft[key] && (!/^[1-9]\d*$/.test(draft[key]) || !Number.isSafeInteger(Number(draft[key]))))) throw new DraftSaveError('Nhân viên ghi nhận doanh số chưa hợp lệ.');
  if (draft.sales_staff_name !== undefined && (typeof draft.sales_staff_name !== 'string' || draft.sales_staff_name.length>191)) throw new DraftSaveError('Tên NVKD tối đa 191 ký tự.');
  if (draft.ownership_term_months !== undefined && !validOwnershipTerm(draft.ownership_term_months)) throw new DraftSaveError('Thời hạn thuê sở hữu không hợp lệ.');
  if (draft.custom_installments !== undefined && (!Array.isArray(draft.custom_installments) || draft.custom_installments.length > 3659 || draft.custom_installments.some(item =>
      !item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['due_at','amount'].includes(key)) ||
      typeof item.due_at !== 'string' || item.due_at.length > 16 || typeof item.amount !== 'string' || !/^\d{0,13}$/.test(item.amount)))) throw new DraftSaveError('Lịch đóng tiền tùy chọn không hợp lệ.');
  for (const key of ['store_id', 'vehicle_store_id', 'staff_id'] as const) if (draft[key] && (!/^\d+$/.test(draft[key]) || !Number.isSafeInteger(Number(draft[key])) || Number(draft[key]) <= 0)) throw new DraftSaveError('ID cơ sở hoặc nhân sự không hợp lệ.');
  if (!Array.isArray(draft.vehicles) || !draft.vehicles.length || draft.vehicles.length > 20) throw new DraftSaveError('Bản nháp cần từ 1 đến 20 dòng xe.');
  for (const vehicle of draft.vehicles) {
    if (!vehicle || typeof vehicle !== 'object' || Array.isArray(vehicle)) throw new DraftSaveError('Thông tin xe không hợp lệ.');
    for (const key of Object.keys(emptyVehicle())) {
      const value = vehicle[key as keyof typeof vehicle];
      if (typeof value !== 'string' || value.length > 4000) throw new DraftSaveError('Thông tin xe không hợp lệ.');
    }
    if (vehicle.id && (!/^\d+$/.test(vehicle.id) || !Number.isSafeInteger(Number(vehicle.id)) || Number(vehicle.id) <= 0)) throw new DraftSaveError('ID xe không hợp lệ.');
    for (const key of ['stock_store_id','stock_store_name'] as const) if (vehicle[key] !== undefined && (typeof vehicle[key] !== 'string' || vehicle[key]!.length > 255)) throw new DraftSaveError('Thông tin cơ sở xe không hợp lệ.');
  }
  if (edits.status !== 'draft' || typeof edits.rental_type !== 'string' || typeof edits.notes !== 'string' || edits.notes.length > 4000 || draft.contract_number.length > 32) throw new DraftSaveError('Thông tin bản nháp không hợp lệ.');
  if (!CONTRACT_TYPES.some(option => option.value === edits.rental_type)) throw new DraftSaveError('Loại hợp đồng không hợp lệ.');
  if (edits.revision !== undefined && (typeof edits.revision !== 'string' || !/^\d+$/.test(edits.revision))) throw new DraftSaveError('Phiên bản bản nháp không hợp lệ.');
  return { draft: { ...structuredClone(draft), ...(edits.rental_type === 'ownership' || draft.ownership !== undefined ? {ownership: edits.rental_type === 'ownership'} : {}) }, status: 'draft', rental_type: edits.rental_type, notes: edits.notes,
    ...(edits.revision ? { revision: edits.revision } : {}) };
}

const nullable = (value: string) => value || null;
const localTimestamp = (value: string) => value ? `${value}:00+07:00` : null;

// Caller owns BEGIN/COMMIT/ROLLBACK. Only unfinished orders are changed here.
// No payment, deposit, vehicle state, or order_vehicle_details is written.
export async function saveDatabaseDraft(client: PoolClient, id: number | null, input: unknown) {
  const edits = parseDraftEdits(input);
  const numberError = contractNumberError(edits.draft.contract_number);
  if (numberError) throw new DraftSaveError(numberError);
  let previous: Record<string, unknown> | undefined;
  if (id !== null) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new DraftSaveError('ID bản nháp không hợp lệ.');
    const locked = await client.query('SELECT *, xmin::text AS draft_revision FROM himoto.orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id]);
    previous = locked.rows[0];
    if (!previous) throw new DraftSaveError('Không tìm thấy bản nháp.', 404);
    if (previous.order_status !== 'draft') throw new DraftSaveError('Chỉ được cập nhật hợp đồng đang lưu nháp.', 409);
    if (!edits.revision || previous.draft_revision !== edits.revision) throw new DraftSaveError('Bản nháp đã được người khác cập nhật. Đóng form và nhấn Làm mới trước khi sửa tiếp.', 409);
  }
  const priorComposer = (previous?.draft_payload as {management_composer?: {draft?: ContractDraft; rental_type?: string}} | undefined)?.management_composer;
  const priorDraft = priorComposer?.draft;
  const priorRentalType = priorComposer?.rental_type || String(previous?.order_type || '');
  try {
    await resolveDraftContractType(client, edits.draft, edits.rental_type, previous ? {
      contract_type_id: priorDraft?.contract_type_id || priorRentalType,
      contract_type_name: priorDraft?.contract_type_name || CONTRACT_TYPES.find(type => type.value === priorRentalType)?.label,
      contract_type_months: priorDraft?.contract_type_months ?? /^monthly_(\d+)$/.exec(priorRentalType)?.[1] ?? '',
    } : undefined);
  } catch (cause) { if (cause instanceof ContractTypeError) throw new DraftSaveError(cause.message, cause.status); throw cause; }
  const stores = await client.query('SELECT id, store_name FROM himoto.stores WHERE id = $1', [edits.draft.store_id || null]);
  // Vehicle store may be another branch; resolve via company directory, not RLS-scoped stores.
  const vehicleStores = edits.draft.vehicle_store_id && edits.draft.vehicle_store_id !== edits.draft.store_id
    ? await client.query('SELECT id, store_name FROM himoto.store_directory() WHERE id = $1', [edits.draft.vehicle_store_id])
    : stores;
  const staff = edits.draft.staff_id
    ? (usesScopedDatabase()
      ? await client.query('SELECT id, store_id, user_id, full_name FROM himoto.staff_for_contract($1)', [edits.draft.staff_id])
      : await client.query('SELECT id, store_id, user_id, full_name FROM himoto.staff_profiles WHERE id = $1', [edits.draft.staff_id]))
    : { rows: [] as { id: number; store_id: number; user_id: number; full_name: string }[] };
  if (staff.rows[0]) {
    if (!edits.draft.staff_name.trim()) edits.draft.staff_name=staff.rows[0].full_name;
  } else if (edits.draft.staff_id) {
    if (!edits.draft.staff_name.trim()) throw new DraftSaveError('Nhân sự đã thay đổi. Chọn lại hoặc tự nhập tên người làm hợp đồng.');
    edits.draft.staff_id='';
  }
  if (edits.draft.tls_staff_id || /^(tls|telesales?)$/i.test(edits.draft.customer_source.trim())) {
    edits.draft.customer_source='TLS';
    edits.draft.tls_staff_id='';
  }
  const attribution:Record<string,{staff_id:number|null;name:string}> = {};
  edits.draft.sales_staff_name=edits.draft.sales_staff_name?.trim() || '';
  for (const [key,role] of [['sales_staff_id','NVKD'],['tls_staff_id','TLS']] as const) {
    if (!edits.draft[key]) continue;
    const employee=await loadCommissionStaff(edits.draft[key], role);
    if (!employee) throw new DraftSaveError(`Chọn nhân viên ${role === 'NVKD' ? 'NVKD hoặc TPKD' : role} đang làm việc để ghi nhận doanh số.`,409);
    attribution[role]=employee;
    if(role==='NVKD')edits.draft.sales_staff_name=employee.name;
  }
  if(!edits.draft.sales_staff_id && edits.draft.sales_staff_name)attribution.NVKD={staff_id:null,name:edits.draft.sales_staff_name};
  const ids = edits.draft.vehicles.map(vehicle => vehicle.id).filter(Boolean);
  const vehicles = usesScopedDatabase()
    ? await client.query(`SELECT id, store_id, store_name FROM himoto.vehicle_inventory() WHERE id = ANY($1::bigint[])`, [ids])
    : await client.query(`SELECT v.id, COALESCE(v.current_store_id, v.store_id) AS store_id, s.store_name
    FROM himoto.vehicles v LEFT JOIN himoto.stores s ON s.id=COALESCE(v.current_store_id,v.store_id) WHERE v.id = ANY($1::bigint[])`, [ids]);
  if (edits.draft.customer_id) {
    const scope = dataAccess.getStore();
    // A branch may rent to a customer found by global lookup without acquiring
    // permission to edit that customer's source profile.
    const customers = await client.query(scope && scope.access_role !== 'admin' && !scope.scope_all
      ? 'SELECT himoto.lock_customer_for_rental($1) AS id'
      : 'SELECT id FROM himoto.customers WHERE id = $1 FOR SHARE', [edits.draft.customer_id]);
    if (!customers.rows[0]?.id) throw new DraftSaveError('Không tìm thấy hồ sơ khách hàng. Hãy tra cứu lại.');
  }
  const existingCode = previous ? String(previous.contract_number || previous.draft_reference || `#${id}`) : '';
  if (previous?.contract_number && edits.draft.contract_number.trim() !== String(previous.contract_number)) throw new DraftSaveError('Số hợp đồng đã cấp không thể thay đổi trong bản nháp.',409);
  const dataset: ManagementDataset = {
    stores: [...stores.rows, ...vehicleStores.rows].map(row => ({ ...row, id: Number(row.id) })) as ManagementRow[],
    staff: staff.rows.map(row => ({ ...row, id: Number(row.id) })) as ManagementRow[],
    vehicles: vehicles.rows.map(row => ({ ...row, id: Number(row.id) })) as ManagementRow[], customers: [],
    contracts: previous ? [{ id: id!, code: existingCode, name: existingCode, status: 'draft' }] : [],
  };
  try { saveDraftRecord(dataset, id, edits); }
  catch (error) { throw new DraftSaveError(error instanceof Error ? error.message : 'Thông tin bản nháp không hợp lệ.'); }
  // These values describe real receipts, never the amounts typed into a draft.
  delete edits.draft.collections; delete edits.draft.deposit_paid_amount;
  edits.draft.paid_amount='0';
  if (id !== null) {
    const collected = await client.query(`SELECT COALESCE(SUM(value),0) AS paid FROM himoto.transactions
      WHERE order_id=$1 AND status='approved' AND type IN ('in','addon') AND NOT (name='order:deposit' OR name LIKE 'order:deposit:%')`,[id]);
    edits.draft.paid_amount=String(collected.rows[0].paid);
  }
  for (const line of edits.draft.vehicles) {
    const stock = vehicles.rows.find(vehicle=>String(vehicle.id)===line.id);
    if (stock) { line.stock_store_id=String(stock.store_id); line.stock_store_name=String(stock.store_name || ''); }
  }
  if (!edits.draft.customer_source_url && stores.rows[0]?.store_name) edits.draft.customer_source_url=String(stores.rows[0].store_name);
  const requested = paperContractNumber(edits.draft.contract_number);
  const importReference = /^EXCEL-/i.test(String(previous?.draft_reference || edits.draft.contract_number)) ? String(previous?.draft_reference || edits.draft.contract_number).trim() : '';
  const reference = previous?.contract_number ? nullable(String(previous.draft_reference || '')) : requested || importReference || (id === null ? null : `NHAP-${id}`);
  if ((requested || importReference) && reference && !previous?.contract_number && !await contractNumberAvailable(client,reference,id)) throw new DraftSaveError('Số hợp đồng đã được sử dụng. Kiểm tra số HĐ giấy trước khi lưu.',409);
  edits.draft.contract_number = previous?.contract_number ? String(previous.contract_number) : requested;
  const oldPayload = previous?.draft_payload && typeof previous.draft_payload === 'object' ? previous.draft_payload as Record<string, unknown> : {};
  const oldItems = Array.isArray(oldPayload.order_items) ? oldPayload.order_items as Record<string, unknown>[] : [];
  const previousTime = (value: unknown) => dateTimeInput(value instanceof Date ? value.toISOString() : value);
  const keepStart = previousTime(previous?.rent_at) === edits.draft.start_date;
  const keepEnd = previousTime(previous?.return_at) === edits.draft.end_date;
  const payload = { ...oldPayload, management_composer: { version: 1, ...edits, ...(Object.keys(attribution).length ? {sales_attribution:attribution} : {}) },
    order_items: edits.draft.vehicles.map(vehicle => {
      const oldItem = oldItems.find(item => String(item.vehicle_id) === vehicle.id);
      return { ...oldItem,
      vehicle_id: vehicle.id ? Number(vehicle.id) : null,
      rent_at: keepStart && oldItem?.rent_at ? oldItem.rent_at : localTimestamp(edits.draft.start_date),
      return_at: keepEnd && oldItem?.return_at ? oldItem.return_at : localTimestamp(edits.draft.end_date),
      driver_name: vehicle.driver_name, driver_license_number: vehicle.driver_license_number,
      driver_license_issued_on: nullable(vehicle.driver_license_issued_on), borrow_hats: Number(vehicle.borrow_hats || 0), borrow_raincoats: Number(vehicle.borrow_raincoats || 0) };
    }) };
  const values = [nullable(edits.draft.store_id), edits.draft.customer_id, nullable(edits.draft.customer.name), nullable(edits.draft.customer.phone),
    nullable(edits.draft.customer.address), nullable(edits.draft.customer.id_card), nullable(edits.notes),
    localTimestamp(edits.draft.start_date), localTimestamp(edits.draft.end_date), JSON.stringify(payload), reference,
    staff.rows[0]?.user_id ?? null, nullable(edits.draft.signed_on), nullable(edits.draft.authorization_date),
    nullable(edits.draft.collateral_description), nullable(edits.draft.customer_source), nullable(edits.draft.customer_source_url), edits.rental_type];
  let savedId = id;
  if (id === null) {
    const inserted = await client.query(`INSERT INTO himoto.orders (store_id, customer_id, customer_name, customer_phone, customer_address,
      customer_idnumber, note, rent_at, return_at, draft_payload, draft_reference, contract_responsible_user_id, contract_signed_on,
      contract_authorization_date, contract_collateral_description, customer_source, customer_source_url, order_type, order_status, order_mode, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'draft','draft',now(),now()) RETURNING id`, values);
    savedId = Number(inserted.rows[0].id);
    if (!reference) await client.query("UPDATE himoto.orders SET draft_reference = 'NHAP-' || id::text WHERE id = $1", [savedId]);
  } else {
    // A draft can switch customers. Never retain the previous customer's
    // imported identity documents or separately captured driving licence.
    if(String(previous?.customer_id||'')!==String(edits.draft.customer_id||''))await client.query("DELETE FROM himoto.management_record_photos WHERE entity_type='contracts' AND entity_id=$1 AND (slot=ANY($2::text[]) OR slot ~ '^rental-document-')",[id,['customer-id-front','customer-id-back','customer-driver-license','driver-license']]);
    await client.query(`UPDATE himoto.orders SET store_id=$1, customer_id=$2, customer_name=$3, customer_phone=$4, customer_address=$5,
      customer_idnumber=$6, note=$7, rent_at=$8, return_at=$9, draft_payload=$10, draft_reference=$11, contract_responsible_user_id=$12,
      contract_signed_on=$13, contract_authorization_date=$14, contract_collateral_description=$15, customer_source=$16,
      customer_source_url=$17, order_type=$18, updated_at=now() WHERE id=$19 AND order_status='draft'`, [...values, id]);
  }
  const result = await client.query(contractVehicleDetailsSql(`${CONTRACT_LIST_SQL} AND o.id = $1`), [savedId]);
  return result.rows[0];
}
