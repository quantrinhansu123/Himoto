'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, Search, UsersRound } from 'lucide-react';
import { formatDate } from '@/lib/formatters';
import { CONTRACT_STATUSES } from '@/lib/management/config';
import {
  filterNewCustomersBySource,
  loadNewCustomersBySource,
  type NewCustomerBySourceFilters,
  type NewCustomerBySourceReport,
  type NewCustomerBySourceRow,
} from '@/lib/management/new-customers-by-source';
import { csvCell } from '@/lib/management/table-utils';
import { Dialog } from './Dialog';

const EMPTY_FILTERS: NewCustomerBySourceFilters = { search: '', source: '', sourcePresence: '' };
const statusLabel = (value: string) => CONTRACT_STATUSES.find(option => option.value === value)?.label || value || '—';
const WITHOUT_SOURCE = '__without_source__';

type DetailScope =
  | { kind: 'all'; title: string }
  | { kind: 'with'; title: string }
  | { kind: 'without'; title: string }
  | { kind: 'source'; source: string; title: string };

function downloadCsv(rows: (string | number)[][], filename: string) {
  const data = rows.map(row => row.map(value => csvCell(String(value))).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', data], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function CustomerDetailTable({ rows }: { rows: NewCustomerBySourceRow[] }) {
  if (!rows.length) return <p className="mg-table-state">Không có khách hàng trong nhóm này.</p>;
  return (
    <div className="mg-table-scroll" tabIndex={0} role="region" aria-label="Chi tiết danh sách khách hàng mới">
      <table className="mg-table mg-source-sales-table">
        <thead>
          <tr>
            <th scope="col">Khách hàng</th>
            <th scope="col">Điện thoại</th>
            <th scope="col">CCCD</th>
            <th scope="col">Nguồn khách</th>
            <th scope="col">Cơ sở nguồn / doanh thu</th>
            <th scope="col">Ngày thuê lần đầu</th>
            <th scope="col">HĐ đầu</th>
            <th scope="col">Trạng thái HĐ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.customer_id} className={row.customer_source ? undefined : 'is-muted'}>
              <th scope="row">{row.customer_name || `Khách #${row.customer_id}`}</th>
              <td>{row.phone || '—'}</td>
              <td>{row.id_card || '—'}</td>
              <td>{row.customer_source || 'Chưa ghi nguồn'}</td>
              <td>{row.store_name || '—'}</td>
              <td>{formatDate(row.started_on)}</td>
              <td>{row.contract_code}</td>
              <td>{statusLabel(row.contract_status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function rowsForScope(report: NewCustomerBySourceReport, scope: DetailScope) {
  if (scope.kind === 'all') return report.rows;
  if (scope.kind === 'with') return report.rows.filter(row => Boolean(row.customer_source));
  if (scope.kind === 'without') return report.rows.filter(row => !row.customer_source);
  return report.rows.filter(row => row.customer_source === scope.source);
}

export function NewCustomersBySourcePanel({
  from, to, store, retry,
}: {
  from: string; to: string; store: string; retry: number;
}) {
  const [report, setReport] = useState<NewCustomerBySourceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<NewCustomerBySourceFilters>(EMPTY_FILTERS);
  const [detail, setDetail] = useState<DetailScope | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    loadNewCustomersBySource(from, to, store, controller.signal)
      .then(value => { if (!controller.signal.aborted) setReport(value); })
      .catch(cause => {
        if (!controller.signal.aborted) {
          setReport(null);
          setError(cause instanceof Error ? cause.message : 'Không tải được danh sách khách hàng mới.');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [from, to, store, retry]);

  const filtered = useMemo(
    () => (report ? filterNewCustomersBySource(report, filters) : null),
    [report, filters],
  );
  const ready = !loading && !error && filtered;
  const sourceOptions = report?.sources || [];
  const isFiltered = Boolean(filters.search || filters.source || filters.sourcePresence);
  const detailRows = ready && detail ? rowsForScope(filtered, detail) : [];
  const sourceRows = useMemo(() => {
    if (!filtered) return [];
    const rows: { key: string; name: string; customers: number; scope: DetailScope }[] = filtered.sources.map(item => ({
      key: item.name,
      name: item.name,
      customers: item.customers,
      scope: { kind: 'source', source: item.name, title: `Nguồn khách · ${item.name}` },
    }));
    if (filtered.totals.without_source > 0) {
      rows.push({
        key: WITHOUT_SOURCE,
        name: 'Chưa ghi nguồn',
        customers: filtered.totals.without_source,
        scope: { kind: 'without', title: 'Chưa ghi nguồn khách' },
      });
    }
    return rows;
  }, [filtered]);

  function exportCsv(rows: NewCustomerBySourceRow[], filename: string) {
    if (!rows.length) return;
    downloadCsv([
      ['Khách hàng', 'Điện thoại', 'CCCD', 'Nguồn khách', 'Cơ sở nguồn / doanh thu', 'Ngày thuê lần đầu', 'Mã HĐ đầu', 'Trạng thái HĐ'],
      ...rows.map(row => [
        row.customer_name, row.phone, row.id_card, row.customer_source || 'Chưa ghi nguồn',
        row.store_name || 'Chưa có cơ sở', row.started_on, row.contract_code, statusLabel(row.contract_status),
      ]),
    ], filename);
  }

  return (
    <div className="mg-source-sales mg-new-customers-source" aria-label="Danh sách khách hàng mới từ các nguồn khách" aria-busy={loading}>
      <div className="mg-source-sales-heading">
        <div>
          <h2>Danh sách Khách hàng mới từ các nguồn khách</h2>
          <p>Khách có hợp đồng thuê lần đầu bắt đầu trong kỳ đang chọn. Bấm một dòng nguồn khách để xem danh sách chi tiết.</p>
        </div>
        <button
          className="mg-button"
          type="button"
          disabled={!ready || !filtered.rows.length}
          onClick={() => exportCsv(filtered!.rows, `khach-moi-nguon-${from}-${to}.csv`)}
        >
          <ArrowDownToLine size={16} />Xuất CSV
        </button>
      </div>

      <div className="mg-revenue-ledger-filters" role="search" aria-label="Bộ lọc khách hàng mới">
        <label className="mg-report-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="Tìm khách hàng mới"
            placeholder="Tên, SĐT, CCCD, mã HĐ, nguồn…"
            value={filters.search}
            onChange={event => setFilters(current => ({ ...current, search: event.target.value }))}
          />
        </label>
        <label>
          <span>Nguồn khách</span>
          <select
            aria-label="Lọc theo nguồn khách"
            value={filters.source}
            onChange={event => setFilters(current => ({
              ...current,
              source: event.target.value,
              sourcePresence: event.target.value ? '' : current.sourcePresence,
            }))}
          >
            <option value="">Tất cả nguồn khách</option>
            {sourceOptions.map(item => (
              <option key={item.name} value={item.name}>{item.name} ({item.customers})</option>
            ))}
          </select>
        </label>
        <label>
          <span>Ghi nhận nguồn</span>
          <select
            aria-label="Lọc theo trạng thái ghi nhận nguồn khách"
            value={filters.sourcePresence}
            disabled={Boolean(filters.source)}
            title={filters.source ? 'Đang lọc một nguồn cụ thể; bỏ chọn nguồn để dùng bộ lọc ghi nhận.' : undefined}
            onChange={event => setFilters(current => ({
              ...current,
              sourcePresence: event.target.value as NewCustomerBySourceFilters['sourcePresence'],
            }))}
          >
            <option value="">Tất cả</option>
            <option value="with">Đã có nguồn khách</option>
            <option value="without">Chưa ghi nguồn</option>
          </select>
        </label>
        {isFiltered && (
          <button type="button" className="mg-button" onClick={() => setFilters(EMPTY_FILTERS)}>
            Xóa bộ lọc khách
          </button>
        )}
      </div>

      {loading ? <p role="status" className="mg-table-state">Đang tải danh sách khách hàng mới…</p>
        : error ? <p role="alert" className="mg-field-error">{error}</p>
        : ready ? <>
          <dl className="mg-revenue-ledger-metrics" aria-label="Bộ đếm khách hàng mới theo bộ lọc">
            {([
              {
                key: 'all',
                label: 'Tổng khách mới',
                value: filtered.totals.customers,
                hint: isFiltered ? 'Khớp bộ lọc khách hiện tại' : 'Trong kỳ và cơ sở đang chọn',
                scope: { kind: 'all' as const, title: 'Tất cả khách hàng mới' },
                disabledReason: !filtered.totals.customers ? 'Không có khách hàng mới để xem chi tiết.' : undefined,
              },
              {
                key: 'with',
                label: 'Đã có nguồn khách',
                value: filtered.totals.with_source,
                hint: `${filtered.sources.length.toLocaleString('vi-VN')} nguồn khác nhau`,
                scope: { kind: 'with' as const, title: 'Khách mới đã có nguồn' },
                disabledReason: !filtered.totals.with_source ? 'Không có khách nào đã ghi nguồn trong bộ lọc hiện tại.' : undefined,
              },
              {
                key: 'without',
                label: 'Chưa ghi nguồn',
                value: filtered.totals.without_source,
                hint: 'Hợp đồng đầu chưa điền nguồn khách',
                scope: { kind: 'without' as const, title: 'Chưa ghi nguồn khách' },
                disabledReason: !filtered.totals.without_source ? 'Không có khách nào chưa ghi nguồn trong bộ lọc hiện tại.' : undefined,
              },
            ]).map(card => (
              <div key={card.key}>
                <dt><UsersRound size={14} aria-hidden="true" /> {card.label}</dt>
                <dd>{card.value.toLocaleString('vi-VN')}</dd>
                <small>{card.hint}</small>
                <button
                  type="button"
                  className="mg-button"
                  disabled={Boolean(card.disabledReason)}
                  title={card.disabledReason}
                  onClick={() => setDetail(card.scope)}
                >
                  Xem danh sách
                </button>
              </div>
            ))}
          </dl>

          {!sourceRows.length
            ? <p className="mg-table-state">{isFiltered ? 'Không có khách hàng mới khớp bộ lọc.' : 'Không có khách hàng mới trong kỳ.'}</p>
            : <div className="mg-table-scroll" tabIndex={0} role="region" aria-label="Tổng hợp khách mới theo nguồn">
              <table className="mg-table mg-source-sales-table mg-new-customers-source-table">
                <thead>
                  <tr>
                    <th scope="col">Nguồn khách</th>
                    <th scope="col" className="mg-align-right">Số khách mới</th>
                    <th scope="col">Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceRows.map(row => (
                    <tr
                      key={row.key}
                      className={row.key === WITHOUT_SOURCE ? 'is-muted is-clickable' : 'is-clickable'}
                      tabIndex={0}
                      aria-label={`Xem danh sách ${row.customers} khách từ ${row.name}`}
                      onClick={() => setDetail(row.scope)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setDetail(row.scope);
                        }
                      }}
                    >
                      <th scope="row">{row.name}</th>
                      <td className="mg-align-right">{row.customers.toLocaleString('vi-VN')}</td>
                      <td>
                        <button
                          type="button"
                          className="mg-button"
                          aria-label={`Xem danh sách khách nguồn ${row.name}`}
                          onClick={event => { event.stopPropagation(); setDetail(row.scope); }}
                        >
                          Xem danh sách
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Tổng</th>
                    <td className="mg-align-right">{filtered.totals.customers.toLocaleString('vi-VN')}</td>
                    <td>
                      <button
                        type="button"
                        className="mg-button"
                        disabled={!filtered.totals.customers}
                        title={!filtered.totals.customers ? 'Không có khách hàng mới để xem chi tiết.' : undefined}
                        onClick={() => setDetail({ kind: 'all', title: 'Tất cả khách hàng mới' })}
                      >
                        Xem tất cả
                      </button>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>}
        </> : null}

      {detail && ready && (
        <Dialog
          className="mg-dialog-fullscreen"
          title={detail.title}
          subtitle={`${detailRows.length.toLocaleString('vi-VN')} khách · ${from} – ${to}`}
          onClose={() => setDetail(null)}
        >
          <div className="mg-dialog-body">
            <p className="mg-rental-revenue-note">Danh sách khách hàng mới thuộc nhóm đã chọn, sau khi áp dụng bộ lọc phía trên.</p>
            <CustomerDetailTable rows={detailRows} />
          </div>
          <div className="mg-dialog-footer">
            <button
              type="button"
              className="mg-button"
              disabled={!detailRows.length}
              onClick={() => exportCsv(detailRows, `khach-moi-${detail.kind}-${from}-${to}.csv`)}
            >
              <ArrowDownToLine size={16} />Xuất CSV nhóm này
            </button>
            <button type="button" className="mg-button" onClick={() => setDetail(null)}>Đóng</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
