import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { CONTRACT_IMPORT_NAMESPACE, ContractExcelSource, ContractImportPlan, ContractImportSnapshot, contractImportTimestamp, planContractImport } from '@/lib/management/contract-import';
import { createContractDraft, CUSTOMER_FIELDS, emptyVehicle } from '@/lib/management/contract-document';
import { saveDatabaseDraft } from './contract-drafts';

type Client = Pick<PoolClient, 'query'>;
export const contractSnapshotHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)).digest('hex');
export class ContractImportError extends Error {}

export async function previewDatabaseContracts(client: Client, sources: ContractExcelSource[]) {
  const snapshot = {} as ContractImportSnapshot;
  for (const [key, table] of [['customers', 'customers'], ['vehicles', 'vehicles'], ['orders', 'orders'], ['details', 'order_vehicle_details']] as const) snapshot[key] = (await client.query(`SELECT * FROM himoto.${table} ORDER BY id`)).rows;
  snapshot.stores = (await client.query('SELECT *,store_name AS name FROM himoto.stores ORDER BY id')).rows;
  const plans = planContractImport(sources, snapshot);
  return { snapshot, plans, revision: contractSnapshotHash({ sources, snapshot }) };
}

function draftForPlan(plan: ContractImportPlan, snapshot: ContractImportSnapshot) {
  const source = plan.sources[0];
  const draft = createContractDraft({ stores: [], staff: [], customers: [], vehicles: [], contracts: [] }, 'all');
  draft.contract_number = `EXCEL-${plan.sourceId}`;
  draft.signed_on = ''; draft.authorization_date = ''; draft.package_name = '';
  draft.store_id = String(plan.storeId); draft.customer_id = plan.customerId;
  const customer = snapshot.customers.find(customer => Number(customer.id) === plan.customerId)!;
  const fields = customer as unknown as Record<string, unknown>;
  for (const key of CUSTOMER_FIELDS) draft.customer[key] = fields[key] == null ? '' : String(fields[key]);
  draft.customer.name = customer.name; draft.customer.phone = customer.phone || '';
  draft.vehicles = plan.vehicleIds.map(vehicleId => {
    const vehicle = snapshot.vehicles.find(vehicle => Number(vehicle.id) === vehicleId)!;
    return { ...emptyVehicle(), id: String(vehicleId), name: vehicle.name, license: vehicle.license };
  });
  const dates = plan.sources.map(source => ({ start: source.start, end: source.end }));
  draft.start_date = dates.map(item => item.start).sort()[0].replace(' ', 'T').slice(0, 16);
  draft.end_date = dates.map(item => item.end).sort().at(-1)!.replace(' ', 'T').slice(0, 16);
  draft.total_amount = source.total; draft.paid_amount = source.paid;
  draft.deposit_amount = ''; draft.unit_price = ''; draft.payment_method = ''; draft.deposit_payment_method = '';
  return draft;
}

// Caller owns the transaction and verified local backup. This imports only
// drafts, using the existing draft writer; no rental/payment/vehicle operation.
export async function importDatabaseContractDrafts(client: PoolClient, sources: ContractExcelSource[], expectedRevision: string, expectedAdded: number, actorId: number) {
  if (!/^[a-f0-9]{64}$/.test(expectedRevision) || !Number.isSafeInteger(expectedAdded) || expectedAdded < 1 || !Number.isSafeInteger(actorId) || actorId <= 0) throw new ContractImportError('Invalid revision, count or actor');
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL statement_timeout='30s'");
  await client.query('LOCK TABLE himoto.orders,himoto.order_vehicle_details,himoto.vehicles,himoto.customers,himoto.stores IN SHARE ROW EXCLUSIVE MODE');
  const preview = await previewDatabaseContracts(client, sources);
  if (preview.revision !== expectedRevision) throw new ContractImportError('Data changed after preview; prepare and check again before importing');
  const eligible = preview.plans.filter(plan => plan.state === 'new');
  if (eligible.length !== expectedAdded) throw new ContractImportError('Eligible count changed; nothing imported');
  const references = eligible.map(plan => `EXCEL-${plan.sourceId}`);
  const conflicts = await client.query('SELECT id FROM himoto.orders WHERE contract_number = ANY($1::text[]) OR draft_reference = ANY($1::text[])', [references]);
  if (conflicts.rowCount) throw new ContractImportError('A draft reference already exists; nothing imported');
  const added: { sourceId: string; id: number }[] = [];
  for (const plan of eligible) {
    const draft = draftForPlan(plan, preview.snapshot);
    const notes = plan.sources[0].note;
    const saved = await saveDatabaseDraft(client, null, { draft, status: 'draft', rental_type: 'rental', notes });
    const payload = saved.draft_payload as { order_items: Record<string, unknown>[] };
    for (const item of payload.order_items) {
      const vehicle = preview.snapshot.vehicles.find(vehicle => String(vehicle.id) === String(item.vehicle_id))!;
      const source = plan.sources.find(source => source.license.trim().toUpperCase().replace(/[\s.-]/g, '') === vehicle.license.trim().toUpperCase().replace(/[\s.-]/g, ''))!;
      item.rent_at = contractImportTimestamp(source.start); item.return_at = contractImportTimestamp(source.end);
    }
    const source = plan.sources[0];
    const metadata = { excel_import: { namespace: CONTRACT_IMPORT_NAMESPACE, sourceId: plan.sourceId, sourceStatus: source.status,
      sourceCreatedAt: source.createdAt, sourcePaid: source.paid, sourceTotal: source.total, importedBy: actorId, financialReconciled: false,
      sources: plan.sources.map(item => ({ filename: item.filename, rowNumber: item.rowNumber })), warnings: plan.warnings } };
    const updated = await client.query(`UPDATE himoto.orders SET metadata=$2,rent_at=$3::timestamptz,return_at=$4::timestamptz,draft_payload=$5::json
      WHERE id=$1 AND order_status='draft' RETURNING id`, [saved.id, JSON.stringify(metadata),
      contractImportTimestamp(plan.sources.map(source => source.start).sort()[0]), contractImportTimestamp(plan.sources.map(source => source.end).sort().at(-1)!), JSON.stringify(payload)]);
    if (updated.rowCount !== 1) throw new ContractImportError('New draft was not saved completely; roll back the batch');
    added.push({ sourceId: plan.sourceId, id: Number(saved.id) });
  }
  return { added, plans: preview.plans, snapshot: preview.snapshot };
}
