import 'server-only';
import type { NextRequest } from 'next/server';
import type { SessionUser } from './management-session';
import { dataAccess } from './access-context';
import { himotoPool } from './himoto-database';
import { readManagementTable, ManagementTableError } from './management-table';
import { mobileTableParams } from './mobile-catalogue';
import { readCollectionFollowups } from './collection-followups';
import { MANAGEMENT_CONFIG } from '@/lib/management/config';
import { compactContractConfig, VAT_CONTRACT_COLUMNS } from '@/lib/management/contract-monitoring-config';
import { buildManagementCsv,managementExportRows } from '@/lib/management/management-export';
import {mobileFilteredWorkbook} from './mobile-filtered-workbook';
import { hasPermission } from '@/lib/management/permissions';
import { MobileError } from './mobile-session';
import { isCatalogueExportKind, type MobileCatalogueExportKind, type MobileExportColumns } from '../../../shared/mobile-catalogue-export';
import type { MobileFileExport } from '../../../shared/mobile-export';

function selection(user: SessionUser, value: string, raw: URLSearchParams) {
  if (!isCatalogueExportKind(value)) throw new MobileError('Danh mục xuất không tồn tại.', 404);
  const kind = value;
  if (!hasPermission(user, kind === 'staff' ? 'hr.read' : kind === 'stores' ? 'contracts.read' : `${kind}.read`)) throw new MobileError('Không có quyền xuất danh mục này.', 403, 'FORBIDDEN');
  const params = new URLSearchParams(raw), position = params.get('position') || '', selected = params.get('columns');
  if (params.has('columns') && (params.getAll('columns').length !== 1 || !selected || selected.length > 2000)) throw new MobileError('Chọn các cột xuất hợp lệ.');
  params.delete('columns');
  if (params.has('position') && (kind !== 'staff' || params.getAll('position').length !== 1 || position.length > 100)) throw new MobileError('Bộ lọc chức vụ chưa hợp lệ.');
  params.delete('position');
  const query = mobileTableParams(params, kind === 'contracts' || kind === 'vehicles' ? kind : 'customers');
  if (position) query.set('filter_position', position);
  let config = MANAGEMENT_CONFIG[kind];
  if (kind === 'contracts') {
    const scope = query.get('scope'), monitoring = scope === 'ownership' || scope === 'overdue' || ['overdue', 'bad_debt'].includes(query.get('status') || '');
    const mode = scope === 'ownership' ? 'ownership' : monitoring ? 'monitoring' : scope === 'due' ? 'due' : 'rental';
    config = { ...config, columns: config.columns.map(c => c.key === 'rental_type' ? { ...c, key: 'contract_type_name', ...(scope === 'ownership' ? { hidden: false } : {}) } : c) };
    if (scope === 'vat') config = { ...config, columns: [...config.columns, ...VAT_CONTRACT_COLUMNS] };
    if (scope === 'due') config = { ...config, columns: [...config.columns, { key: 'billing_next_due_at', label: 'Ngày hẹn đóng tiền', format: 'date' }, { key: 'billing_due_amount', label: 'Tiền đến hạn còn thiếu', format: 'money', align: 'right' }] };
    if (scope === 'overdue') config = { ...config, columns: [config.columns[0], { key: 'overdue_minutes', label: 'Thời gian quá hạn', format: 'duration', align: 'right' }, { key: 'overdue_fee_estimate', label: 'Phí quá hạn (tạm tính)', format: 'money', align: 'right' }, { key: 'rental_debt_amount', label: 'Tiền thuê còn thiếu', format: 'money', align: 'right' }, ...config.columns.slice(1)] };
    config = compactContractConfig(config, mode);
    if (scope !== 'drafts') config = { ...config, columns: [...config.columns, { key: 'collection_notes', label: 'Ghi chú tình trạng khách', sortable: false }] };
  }
  const keys = selected?.split(',');
  if (keys && (new Set(keys).size !== keys.length || keys.some(k => !config.columns.some(c => c.key === k)))) throw new MobileError('Các cột xuất đã thay đổi. Mở lại màn chọn cột.');
  const columns = config.columns.filter(c => keys ? keys.includes(c.key) : !c.hidden);
  if (!columns.length) throw new MobileError('Chọn ít nhất một cột để xuất.');
  return { kind, query, config, columns };
}
export function mobileCatalogueExportColumns(user: SessionUser, kind: string, query: URLSearchParams): MobileExportColumns {
  const p = selection(user, kind, query);
  return { kind: p.kind, title: p.config.title, columns: p.config.columns.map(c => ({ key: c.key, label: c.label, selected: p.columns.includes(c) })) };
}
export async function exportMobileCatalogue(user: SessionUser, value: string, request: NextRequest): Promise<MobileFileExport> {
  if (request.headers.has('idempotency-key')) throw new MobileError('Xuất danh mục không dùng mã ghi.');
  const params=new URLSearchParams(request.nextUrl.searchParams),format=params.get('format')||'csv';
  if(params.getAll('format').length>1||!['csv','xlsx'].includes(format))throw new MobileError('Định dạng xuất chưa hợp lệ.');
  params.delete('format');
  const { kind, query, config, columns } = selection(user, value, params);
  // The web full-list reader supports contracts/customers. Other catalogues
  // use its paged plans, exhausted inside the same repeatable-read snapshot.
  if (kind === 'contracts' || kind === 'customers') query.set('all', '1');
  else query.set('size', '50');
  query.set('page', '1');
  return dataAccess.run({ ...user, store_id: user.store_id ?? null, scope_all: user.scope_all === true, operation: kind === 'vehicles' ? 'fleet_read' : '' }, async () => {
    const client = await himotoPool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); await client.query("SET LOCAL statement_timeout='45s'");
      const page = await readManagementTable(client, kind, query);
      let rows = page.rows;
      if (!query.has('all')) for (let i = 2; i <= page.pages; i++) {
        query.set('page', String(i)); const next = await readManagementTable(client, kind, query);
        if (next.total !== page.total || next.page !== i || next.pages !== page.pages) throw new MobileError('Danh sách xuất chưa ổn định. Thử lại.', 503, 'EXPORT_INCOMPLETE');
        rows = [...rows, ...next.rows];
      }
      if (rows.length !== page.total || new Set(rows.map(r => r.id)).size !== rows.length) throw new MobileError('Chưa đọc đủ danh sách để xuất. Thử lại với phạm vi nhỏ hơn.', 503, 'EXPORT_INCOMPLETE');
      if (kind === 'contracts' && columns.some(c => c.key === 'collection_notes') && rows.length) {
        const notes = new Map<number, string>();
        for (let i = 0; i < rows.length; i += 200) for (const r of await readCollectionFollowups(client, rows.slice(i, i + 200).map(r => r.id))) notes.set(r.id, r.followup.notes);
        rows = rows.map(r => ({ ...r, collection_notes: notes.get(r.id) || '' }));
      }
      if(format==='xlsx'){
        const workbook=await mobileFilteredWorkbook(`himoto-${kind}-${new Date().toISOString().slice(0,10)}`,columns.map(c=>c.label),managementExportRows(config,columns,rows));
        await client.query('COMMIT');return workbook;
      }
      const csv = buildManagementCsv(config, columns, rows);
      if (Buffer.byteLength(csv, 'utf8') > 12 * 1024 * 1024) throw new MobileError('File quá lớn. Thu hẹp bộ lọc rồi xuất lại; chưa xuất file bị cắt.', 413, 'EXPORT_TOO_LARGE');
      await client.query('COMMIT'); return { filename: `himoto-${kind}-${new Date().toISOString().slice(0,10)}.csv`,mimeType:'text/csv' as const,content:csv,rowCount:rows.length };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); if (error instanceof ManagementTableError) throw new MobileError(error.message); throw error; }
    finally { client.release(); }
  });
}
export type { MobileCatalogueExportKind };
