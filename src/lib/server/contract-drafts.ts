import 'server-only';
import type { PoolClient } from 'pg';
import { CUSTOMER_FIELDS, createContractDraft, dateTimeInput, emptyVehicle } from '@/lib/management/contract-document';
import { saveDraftRecord } from '@/lib/management/contract-drafts';
import { ContractEdits, ManagementDataset, ManagementRow } from '@/lib/management/types';

export const CONTRACT_LIST_SQL = `SELECT o.id, o.contract_number, o.draft_reference,
  o.order_type AS rental_type, o.order_status AS status, o.customer_id,
  COALESCE(c.name, o.customer_name) AS customer_name, COALESCE(c.phone, o.customer_phone) AS customer_phone,
  COALESCE(c.id_card, o.customer_idnumber) AS customer_id_card,
  COALESCE(c.address, o.customer_address) AS customer_address, c.email AS customer_email,
  c.id_card_issued_on, c.id_card_issued_by, c.relatives, c.warning AS warning_note,
  o.store_id, s.store_name, COALESCE(o.rent_at, ov.start_date) AS start_date, COALESCE(o.return_at, ov.end_date) AS end_date,
  o.total AS total_amount, o.pid AS paid_amount,
  COALESCE(company.paid_amount,0) AS company_paid_amount, COALESCE(company.payment_count,0) AS company_payment_count,
  CASE WHEN o.first_deposit_amount IS NULL AND o.additional_deposit_amount IS NULL THEN NULL
       ELSE COALESCE(o.first_deposit_amount, 0) + COALESCE(o.additional_deposit_amount, 0) END AS deposit_amount,
  o.note AS notes, o.created_at, o.updated_at, o.xmin::text AS draft_revision,
  (SELECT p.id FROM himoto.staff_profiles p WHERE p.user_id = o.contract_responsible_user_id
    AND p.store_id = o.store_id ORDER BY p.id LIMIT 1) AS staff_id,
  o.draft_payload, o.contract_signed_on AS signed_on, o.contract_authorization_date AS authorization_date,
  o.contract_collateral_description AS collateral_description, o.customer_source, o.customer_source_url,
  COALESCE(ov.vehicles, '[]'::json) AS vehicles
  FROM himoto.orders o
  LEFT JOIN himoto.customers c ON c.id = o.customer_id
  LEFT JOIN himoto.stores s ON s.id = o.store_id
  LEFT JOIN (
    SELECT order_id, SUM(value) AS paid_amount, COUNT(*)::int AS payment_count
    FROM himoto.transactions WHERE type IN ('in','addon') AND status='approved' AND bank_owner_type='company'
    GROUP BY order_id
  ) company ON company.order_id=o.id
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object('id', v.id, 'name', v.name, 'license', v.license,
      'driver_name', d.driver_name, 'driver_license_number', d.driver_license_number,
      'driver_license_issued_on', d.driver_license_issued_on, 'borrow_hats', d.borrow_hats,
      'borrow_raincoats', d.borrow_raincoats) ORDER BY d.id) AS vehicles,
      min(d.rent_at) AS start_date, max(d.return_at) AS end_date
    FROM himoto.order_vehicle_details d LEFT JOIN himoto.vehicles v ON v.id = d.vehicle_id
    WHERE d.order_id = o.id AND d.deleted_at IS NULL
  ) ov ON true
  WHERE o.deleted_at IS NULL`;

export class DraftSaveError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function parseDraftEdits(input: unknown): ContractEdits {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DraftSaveError('Thông tin bản nháp không hợp lệ.');
  const edits = input as ContractEdits;
  const draft = edits.draft;
  if (!draft || typeof draft !== 'object' || Array.isArray(draft) || !draft.customer || typeof draft.customer !== 'object' || Array.isArray(draft.customer)) throw new DraftSaveError('Thông tin bản nháp không hợp lệ.');
  const defaults = createContractDraft({ stores: [], staff: [], customers: [], contracts: [], vehicles: [] }, 'all');
  for (const key of Object.keys(defaults)) {
    if (['customer', 'vehicles', 'customer_id', 'relatives'].includes(key)) continue;
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
  for (const key of ['store_id', 'staff_id'] as const) if (draft[key] && (!/^\d+$/.test(draft[key]) || !Number.isSafeInteger(Number(draft[key])) || Number(draft[key]) <= 0)) throw new DraftSaveError('ID cơ sở hoặc nhân sự không hợp lệ.');
  if (!Array.isArray(draft.vehicles) || !draft.vehicles.length || draft.vehicles.length > 20) throw new DraftSaveError('Bản nháp cần từ 1 đến 20 dòng xe.');
  for (const vehicle of draft.vehicles) {
    if (!vehicle || typeof vehicle !== 'object' || Array.isArray(vehicle)) throw new DraftSaveError('Thông tin xe không hợp lệ.');
    for (const key of Object.keys(emptyVehicle())) if (typeof vehicle[key as keyof typeof vehicle] !== 'string' || vehicle[key as keyof typeof vehicle].length > 4000) throw new DraftSaveError('Thông tin xe không hợp lệ.');
    if (vehicle.id && (!/^\d+$/.test(vehicle.id) || !Number.isSafeInteger(Number(vehicle.id)) || Number(vehicle.id) <= 0)) throw new DraftSaveError('ID xe không hợp lệ.');
  }
  if (edits.status !== 'draft' || typeof edits.rental_type !== 'string' || typeof edits.notes !== 'string' || edits.notes.length > 4000 || draft.contract_number.length > 32) throw new DraftSaveError('Thông tin bản nháp không hợp lệ.');
  if (edits.revision !== undefined && (typeof edits.revision !== 'string' || !/^\d+$/.test(edits.revision))) throw new DraftSaveError('Phiên bản bản nháp không hợp lệ.');
  return { draft: structuredClone(draft), status: 'draft', rental_type: edits.rental_type, notes: edits.notes,
    ...(edits.revision ? { revision: edits.revision } : {}) };
}

const nullable = (value: string) => value || null;
const localTimestamp = (value: string) => value ? `${value}:00+07:00` : null;

// Caller owns BEGIN/COMMIT/ROLLBACK. Only unfinished orders are changed here.
// No payment, deposit, vehicle state, or order_vehicle_details is written.
export async function saveDatabaseDraft(client: PoolClient, id: number | null, input: unknown) {
  const edits = parseDraftEdits(input);
  let previous: Record<string, unknown> | undefined;
  if (id !== null) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new DraftSaveError('ID bản nháp không hợp lệ.');
    const locked = await client.query('SELECT *, xmin::text AS draft_revision FROM himoto.orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id]);
    previous = locked.rows[0];
    if (!previous) throw new DraftSaveError('Không tìm thấy bản nháp.', 404);
    if (previous.order_status !== 'draft') throw new DraftSaveError('Chỉ được cập nhật hợp đồng đang lưu nháp.', 409);
    if (!edits.revision || previous.draft_revision !== edits.revision) throw new DraftSaveError('Bản nháp đã được người khác cập nhật. Đóng form và nhấn Làm mới trước khi sửa tiếp.', 409);
  }
  const stores = await client.query('SELECT id FROM himoto.stores WHERE id = $1', [edits.draft.store_id || null]);
  const staff = await client.query('SELECT id, store_id, user_id FROM himoto.staff_profiles WHERE id = $1', [edits.draft.staff_id || null]);
  const ids = edits.draft.vehicles.map(vehicle => vehicle.id).filter(Boolean);
  const vehicles = await client.query('SELECT id, COALESCE(current_store_id, store_id) AS store_id FROM himoto.vehicles WHERE id = ANY($1::bigint[])', [ids]);
  if (edits.draft.customer_id) {
    const keepExistingCustomer = previous && String(previous.customer_id) === String(edits.draft.customer_id) && String(previous.store_id) === edits.draft.store_id;
    const customers = await client.query(`SELECT c.id FROM himoto.customers c WHERE c.id = $1 AND ($3::boolean OR c.store_id = $2 OR
      (c.store_id IS NULL AND EXISTS (SELECT 1 FROM himoto.orders o WHERE o.customer_id = c.id AND o.store_id = $2 AND o.deleted_at IS NULL)))`, [edits.draft.customer_id, edits.draft.store_id || null, Boolean(keepExistingCustomer)]);
    if (!customers.rowCount) throw new DraftSaveError('Khách hàng không thuộc cơ sở đã chọn. Hãy tra cứu lại.');
  }
  const existingCode = previous ? String(previous.contract_number || previous.draft_reference || `#${id}`) : '';
  const dataset: ManagementDataset = {
    stores: stores.rows.map(row => ({ ...row, id: Number(row.id) })) as ManagementRow[],
    staff: staff.rows.map(row => ({ ...row, id: Number(row.id) })) as ManagementRow[],
    vehicles: vehicles.rows.map(row => ({ ...row, id: Number(row.id) })) as ManagementRow[], customers: [],
    contracts: previous ? [{ id: id!, code: existingCode, name: existingCode, status: 'draft' }] : [],
  };
  try { saveDraftRecord(dataset, id, edits); }
  catch (error) { throw new DraftSaveError(error instanceof Error ? error.message : 'Thông tin bản nháp không hợp lệ.'); }
  const reference = previous ? nullable(String(previous.draft_reference || '')) : nullable(edits.draft.contract_number.trim());
  const duplicate = reference ? await client.query('SELECT id FROM himoto.orders WHERE (draft_reference = $1 OR contract_number = $1) AND ($2::bigint IS NULL OR id <> $2)', [reference, id]) : null;
  if (duplicate?.rowCount) throw new DraftSaveError('Mã bản nháp đã được sử dụng.', 409);
  const oldPayload = previous?.draft_payload && typeof previous.draft_payload === 'object' ? previous.draft_payload as Record<string, unknown> : {};
  const oldItems = Array.isArray(oldPayload.order_items) ? oldPayload.order_items as Record<string, unknown>[] : [];
  const previousTime = (value: unknown) => dateTimeInput(value instanceof Date ? value.toISOString() : value);
  const keepStart = previousTime(previous?.rent_at) === edits.draft.start_date;
  const keepEnd = previousTime(previous?.return_at) === edits.draft.end_date;
  const payload = { ...oldPayload, management_composer: { version: 1, ...edits },
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
    nullable(edits.draft.collateral_description), nullable(edits.draft.customer_source), nullable(edits.draft.customer_source_url)];
  let savedId = id;
  if (id === null) {
    const inserted = await client.query(`INSERT INTO himoto.orders (store_id, customer_id, customer_name, customer_phone, customer_address,
      customer_idnumber, note, rent_at, return_at, draft_payload, draft_reference, contract_responsible_user_id, contract_signed_on,
      contract_authorization_date, contract_collateral_description, customer_source, customer_source_url, order_status, order_mode, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'draft','draft',now(),now()) RETURNING id`, values);
    savedId = Number(inserted.rows[0].id);
    if (!reference) await client.query("UPDATE himoto.orders SET draft_reference = 'NHAP-' || id::text WHERE id = $1", [savedId]);
  } else {
    await client.query(`UPDATE himoto.orders SET store_id=$1, customer_id=$2, customer_name=$3, customer_phone=$4, customer_address=$5,
      customer_idnumber=$6, note=$7, rent_at=$8, return_at=$9, draft_payload=$10, draft_reference=$11, contract_responsible_user_id=$12,
      contract_signed_on=$13, contract_authorization_date=$14, contract_collateral_description=$15, customer_source=$16,
      customer_source_url=$17, updated_at=now() WHERE id=$18 AND order_status='draft'`, [...values, id]);
  }
  const result = await client.query(`${CONTRACT_LIST_SQL} AND o.id = $1`, [savedId]);
  return result.rows[0];
}
