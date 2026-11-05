'use client';
import { useEffect, useState } from 'react';
import { loadRentalRevenue, type RentalRevenueReport } from '@/lib/management/rental-revenue';
import { loadEstimatedSales, type EstimatedSalesReport } from '@/lib/management/estimated-sales';
import { formatMoney } from '@/lib/formatters';

const labels = [['rental', 'Phí thuê đã thu'], ['renewal', 'Gia hạn đã thu'], ['early', 'Đã hoàn do trả sớm']] as const;

export function RentalRevenuePanel({
  from, to, store, retry,
  debt, debtContracts, overdueDebt, overdueContracts, badDebt, debtLoading, debtError,
}: {
  from: string; to: string; store: string; retry: number;
  debt: number; debtContracts: number; overdueDebt: number; overdueContracts: number; badDebt: number;
  debtLoading: boolean; debtError: string;
}) {
  const [report, setReport] = useState<RentalRevenueReport | null>(null);
  const [estimate, setEstimate] = useState<EstimatedSalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [estimateLoading, setEstimateLoading] = useState(true);
  const [error, setError] = useState('');
  const [estimateError, setEstimateError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    loadRentalRevenue(from, to, store, controller.signal)
      .then(value => { if (!controller.signal.aborted) setReport(value); })
      .catch(cause => {
        if (!controller.signal.aborted) {
          setReport(null);
          setError(cause instanceof Error ? cause.message : 'Không tải được doanh thu.');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [from, to, store, retry]);

  useEffect(() => {
    const controller = new AbortController();
    setEstimateLoading(true);
    setEstimateError('');
    loadEstimatedSales(from, to, store, controller.signal)
      .then(value => { if (!controller.signal.aborted) setEstimate(value); })
      .catch(cause => {
        if (!controller.signal.aborted) {
          setEstimate(null);
          setEstimateError(cause instanceof Error ? cause.message : 'Không tải được doanh số.');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setEstimateLoading(false); });
    return () => controller.abort();
  }, [from, to, store, retry]);

  const ready = !loading && !error && report;
  const estimateReady = !estimateLoading && !estimateError && estimate;
  const debtReady = !debtLoading && !debtError;

  return (
    <section className="mg-rental-revenue" aria-label="Doanh số, doanh thu và công nợ thuê xe" aria-busy={loading || estimateLoading || debtLoading}>
      <div className="mg-revenue-pair">
        <article className="mg-data-panel mg-revenue-card is-sales" aria-label="Doanh số theo giá trị hợp đồng">
          <div className="mg-rental-revenue-heading">
            <div>
              <h2>Doanh số</h2>
              <p>Tiền thuê xe của HĐ bắt đầu trong bộ lọc, không gồm VAT và phí khác</p>
            </div>
            <strong data-sales-total>{estimateReady ? formatMoney(estimate!.sales) : '—'}</strong>
          </div>
          <dl className="mg-rental-revenue-formula mg-revenue-card-metrics">
            <div><dt>Hợp đồng trong kỳ</dt><dd>{estimateReady ? estimate!.contracts.toLocaleString('vi-VN') : '—'}</dd></div>
            <div><dt>Đang thuê (chưa trả)</dt><dd>{estimateReady ? estimate!.active_contracts.toLocaleString('vi-VN') : '—'}</dd></div>
            <div><dt>Đã trả</dt><dd>{estimateReady ? estimate!.finished_contracts.toLocaleString('vi-VN') : '—'}</dd></div>
            <div><dt>Số xe trong hợp đồng</dt><dd>{estimateReady ? estimate!.vehicles.toLocaleString('vi-VN') : '—'}</dd></div>
          </dl>
          {estimateLoading ? <p className="mg-rental-revenue-note" role="status">Đang tải doanh số…</p>
            : estimateError ? <p className="mg-field-error" role="alert" style={{ margin: '0 16px 12px' }}>{estimateError}</p>
            : <p className="mg-rental-revenue-note">Cộng toàn bộ giá trị mỗi hợp đồng bắt đầu thuê trong bộ lọc, mỗi hợp đồng một lần. Không chia theo ngày; hợp đồng nhiều xe không bị cộng trùng.</p>}
        </article>

        <article className="mg-data-panel mg-revenue-card is-revenue" aria-label="Doanh thu thuê xe thực thu">
          <div className="mg-rental-revenue-heading">
            <div>
              <h2>Doanh thu</h2>
              <p>Thực thu trong kỳ của HĐ theo bộ lọc · Chưa trừ chi phí</p>
            </div>
            <strong data-revenue-total>{ready ? formatMoney(report!.total.revenue) : '—'}</strong>
          </div>
          <dl className="mg-rental-revenue-formula">
            {labels.map(([key, label]) => (
              <div key={key}>
                <dt>{key === 'early' ? '− ' : '+ '}{label}</dt>
                <dd data-revenue={key}>{ready ? formatMoney(report!.total[key]) : '—'}</dd>
              </div>
            ))}
          </dl>
          {loading ? <p className="mg-rental-revenue-note" role="status">Đang tải doanh thu…</p>
            : error ? <p className="mg-field-error" role="alert" style={{ margin: '0 16px 12px' }}>{error}</p>
            : <p className="mg-rental-revenue-note">Doanh thu thuê xe = tiền thuê + gia hạn − tiền thuê đã hoàn. Gia hạn ghi nhận cho Công ty và cơ sở, không phân bổ cho nhân viên. VAT, sửa xe, trả muộn và phí khác thuộc Công ty, không cộng vào doanh số nhân viên hay cơ sở.</p>}
        </article>

        <article className="mg-data-panel mg-revenue-card" aria-label="Phí khác của Công ty">
          <div className="mg-rental-revenue-heading"><div><h2>Phí khác · Công ty</h2><p>VAT, sửa xe, trả muộn và các phí khác đã thu trong bộ lọc</p></div><strong>{ready ? formatMoney(report!.company_fees) : '—'}</strong></div>
          <p className="mg-rental-revenue-note">Theo dõi riêng cho Công ty; không cộng vào doanh số thuê xe của nhân viên hoặc cơ sở.</p>
        </article>

        <article className="mg-data-panel mg-revenue-card is-debt" aria-label="Công nợ thuê xe">
          <div className="mg-rental-revenue-heading">
            <div>
              <h2>Công nợ</h2>
              <p>Tiền thuê còn thiếu của HĐ bắt đầu trong kỳ</p>
            </div>
            <strong data-debt-total>{debtReady ? formatMoney(debt) : '—'}</strong>
          </div>
          <dl className="mg-rental-revenue-formula mg-revenue-card-metrics">
            <div><dt>Hợp đồng còn thiếu tiền</dt><dd>{debtReady ? debtContracts.toLocaleString('vi-VN') : '—'}</dd></div>
            <div><dt>Trong đó quá hạn chưa thu</dt><dd>{debtReady ? overdueContracts.toLocaleString('vi-VN') : '—'}</dd></div>
          </dl>
          {debtLoading ? <p className="mg-rental-revenue-note" role="status">Đang tải công nợ…</p>
            : debtError ? <p className="mg-field-error" role="alert" style={{ margin: '0 16px 12px' }}>{debtError}</p>
            : <p className="mg-rental-revenue-note">Gồm đơn đang thuê, quá hạn, chờ tất toán, bảo lưu và nợ xấu. Không gồm cọc.</p>}
        </article>

        <article className="mg-data-panel mg-revenue-card is-overdue" aria-label="Nợ quá hạn">
          <div className="mg-rental-revenue-heading">
            <div>
              <h2>Nợ quá hạn</h2>
              <p>Hợp đồng quá hạn còn thiếu tiền · Chưa ghi nhận thu đủ</p>
            </div>
            <strong data-overdue-total>{debtReady ? formatMoney(overdueDebt) : '—'}</strong>
          </div>
          <dl className="mg-rental-revenue-formula mg-revenue-card-metrics">
            <div><dt>Hợp đồng quá hạn chưa thu đủ</dt><dd>{debtReady ? overdueContracts.toLocaleString('vi-VN') : '—'}</dd></div>
            <div><dt>Nợ xấu (riêng)</dt><dd>{debtReady ? formatMoney(badDebt) : '—'}</dd></div>
          </dl>
          {debtLoading ? <p className="mg-rental-revenue-note" role="status">Đang tải nợ quá hạn…</p>
            : debtError ? <p className="mg-field-error" role="alert" style={{ margin: '0 16px 12px' }}>{debtError}</p>
            : <p className="mg-rental-revenue-note">Tổng tiền thuê còn thiếu của HĐ đang Quá hạn trong kỳ; không gồm Nợ xấu và cọc.</p>}
        </article>
      </div>

      {ready && report!.unclassified_count > 0 && (
        <div className="mg-data-panel mg-rental-revenue-detail">
          <p className="mg-rental-revenue-note is-incomplete" role="status">
            Có {report!.unclassified_count} phiếu chưa xác định được loại thu / chi ({formatMoney(report!.unclassified_amount)}). Chưa cộng vào doanh thu; cần đối chiếu Sổ quỹ trước khi chốt KPI.
          </p>
        </div>
      )}
    </section>
  );
}
