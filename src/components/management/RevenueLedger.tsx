'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowDownToLine, ChevronLeft, ChevronRight, LoaderCircle, ReceiptText, Search } from 'lucide-react';
import { formatMoney } from '@/lib/formatters';
import {
  loadRevenueLedger,
  REVENUE_LEDGER_CATEGORIES,
  REVENUE_LEDGER_METHODS,
  type RevenueLedgerMethod,
  type RevenueLedgerReport,
  type RevenueLedgerRow,
} from '@/lib/management/revenue-ledger';

const day = (value: string) => value.split('-').reverse().join('/');
const time = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
const signed = (row: RevenueLedgerRow) => row.type === 'out' ? -row.amount : row.amount;
const methodAmount = (row: RevenueLedgerRow, method: RevenueLedgerMethod | 'other') =>
  (method === 'other' ? ['mixed', 'unknown'].includes(row.method) : row.method === method) ? signed(row) : 0;
const methodTotal = (report: RevenueLedgerReport, method: RevenueLedgerMethod | 'other') => method === 'other'
  ? report.totals.methods.mixed.income - report.totals.methods.mixed.expense + report.totals.methods.unknown.income - report.totals.methods.unknown.expense
  : report.totals.methods[method].income - report.totals.methods[method].expense;
const moneyCell = (value: number) => value === 0 ? '—' : formatMoney(value);
const methodColumns = [['cash', 'Tiền mặt'], ['personal', 'TK cá nhân'], ['company', 'TK công ty'], ['other', 'Chưa tách / chưa rõ']] as const;

type Side = 'in' | 'out';

function LedgerTable({
  side,
  data,
  loading,
  error,
  page,
  size,
  onPage,
  onSize,
  onRetry,
}: {
  side: Side;
  data: RevenueLedgerReport | null;
  loading: boolean;
  error: string;
  page: number;
  size: number;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
  onRetry: () => void;
}) {
  const income = side === 'in';
  const title = income ? 'Phiếu thu' : 'Phiếu chi';
  const ready = !loading && !error && data;
  return (
    <article className={`mg-revenue-ledger-panel ${income ? 'is-income' : 'is-expense'}`} aria-label={title} aria-busy={loading}>
      <div className="mg-revenue-ledger-panel-heading">
        <h4>{title} <span>{ready ? data.total.toLocaleString('vi-VN') : '—'} phiếu</span></h4>
        {ready && (
          <strong>
            {formatMoney(income ? data.totals.income : data.totals.expense)}
            <small>
              {income
                ? `gồm ${formatMoney(data.totals.deposit)} cọc`
                : `gồm ${formatMoney(data.totals.deposit_refund)} hoàn cọc`}
            </small>
          </strong>
        )}
      </div>
      {loading ? <p role="status" className="mg-table-state">Đang tải {title.toLowerCase()}…</p>
        : error ? (
          <div className="mg-revenue-ledger-error">
            <p role="alert" className="mg-field-error">{error}</p>
            <button type="button" className="mg-button" onClick={onRetry}>Thử tải lại</button>
          </div>
        ) : data && (
          <>
            <div className="mg-table-scroll mg-revenue-ledger-scroll" role="region" tabIndex={0} aria-label={`Bảng ${title.toLowerCase()}`}>
              <table className="mg-table mg-revenue-ledger-table">
                <thead>
                  <tr>
                    <th scope="col">Phiếu / Thời gian</th>
                    <th scope="col">Khách hàng / Hợp đồng</th>
                    <th scope="col">Nghiệp vụ</th>
                    {methodColumns.map(([key, label]) => <th scope="col" className="mg-align-right" key={key}>{label}</th>)}
                    <th scope="col" className="mg-align-right">{income ? 'Doanh thu' : 'Ảnh hưởng DT'}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(row => (
                    <tr key={row.id}>
                      <th scope="row">
                        <span className={`mg-ledger-type${row.type === 'out' ? ' is-expense' : ''}`}>
                          {row.type === 'out' ? 'Chi' : 'Thu'} #{row.id}
                        </span>
                        <time dateTime={row.at}>{time(row.at)} · {day(row.day)}</time>
                      </th>
                      <td>
                        <strong className="mg-ledger-customer">{row.customer || 'Chưa ghi nhận khách'}</strong>
                        <Link href={`/contracts?contract_id=${row.order_id}`} className="mg-ledger-contract">HĐ {row.code}</Link>
                        {row.vehicles && <small>{row.vehicles}</small>}
                        <details className="mg-ledger-row-details">
                          <summary>Thông tin phiếu</summary>
                          <dl>
                            <div><dt>Cơ sở</dt><dd>{row.store_name || 'Chưa ghi nhận'}</dd></div>
                            <div><dt>NVKD</dt><dd>{row.staff_name || 'Chưa phân công'}</dd></div>
                            <div><dt>Người ghi nhận</dt><dd>{row.actor_name || 'Chưa ghi nhận'}</dd></div>
                            <div><dt>Ghi chú</dt><dd>{row.note || '—'}</dd></div>
                          </dl>
                        </details>
                      </td>
                      <td>
                        <span>{REVENUE_LEDGER_CATEGORIES[row.category]}</span>
                        <small>{REVENUE_LEDGER_METHODS[row.method]}</small>
                        {row.revenue === 0 && <small className="mg-ledger-excluded">Không tính doanh thu</small>}
                        {row.category === 'rental' && row.revenue !== row.amount && <small>Đã tách phí ngoài tiền thuê</small>}
                      </td>
                      {methodColumns.map(([key]) => (
                        <td key={key} className={`mg-align-right${row.type === 'out' && methodAmount(row, key) ? ' is-expense' : ''}`}>
                          {moneyCell(methodAmount(row, key))}
                        </td>
                      ))}
                      <td className={`mg-align-right mg-ledger-row-revenue${row.revenue < 0 ? ' is-expense' : ''}`}>{moneyCell(row.revenue)}</td>
                    </tr>
                  ))}
                  {!data.rows.length && <tr><td colSpan={8}>Không có {income ? 'phiếu thu' : 'phiếu chi'} khớp bộ lọc trong kỳ.</td></tr>}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={3}>Tổng {data.total} phiếu · Toàn bộ kết quả lọc</th>
                    {methodColumns.map(([key]) => <td className="mg-align-right" key={key}>{formatMoney(methodTotal(data, key))}</td>)}
                    <td className="mg-align-right">{formatMoney(data.totals.revenue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="mg-revenue-ledger-pagination">
              <label>
                Hiển thị{' '}
                <select aria-label={`Số ${title.toLowerCase()} mỗi trang`} value={size} onChange={event => onSize(Number(event.target.value))}>
                  {[20, 50, 100].map(n => <option key={n} value={n}>{n} phiếu</option>)}
                </select>
              </label>
              <span role="status">
                {data.total ? `${(page - 1) * data.page_size + 1}–${(page - 1) * data.page_size + data.rows.length}` : '0'} / {data.total} phiếu
              </span>
              <div>
                <button type="button" className="mg-button" aria-label={`${title} trang trước`} disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>
                  <ChevronLeft size={17} />
                </button>
                <span>Trang {data.page}/{data.pages}</span>
                <button type="button" className="mg-button" aria-label={`${title} trang sau`} disabled={data.page >= data.pages} onClick={() => onPage(data.page + 1)}>
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </>
        )}
    </article>
  );
}

export function RevenueLedger({ from, to, store, retry }: { from: string; to: string; store: string; retry: number }) {
  const [income, setIncome] = useState<RevenueLedgerReport | null>(null);
  const [expense, setExpense] = useState<RevenueLedgerReport | null>(null);
  const [incomeLoading, setIncomeLoading] = useState(true);
  const [expenseLoading, setExpenseLoading] = useState(true);
  const [incomeError, setIncomeError] = useState('');
  const [expenseError, setExpenseError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [method, setMethod] = useState('');
  const [incomePage, setIncomePage] = useState(1);
  const [expensePage, setExpensePage] = useState(1);
  const [incomeSize, setIncomeSize] = useState(20);
  const [expenseSize, setExpenseSize] = useState(20);
  const [incomeRefresh, setIncomeRefresh] = useState(0);
  const [expenseRefresh, setExpenseRefresh] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setIncomeLoading(true);
    setIncomeError('');
    setIncome(null);
    setExportError('');
    const timer = setTimeout(() => {
      void loadRevenueLedger({ from, to, store, search, category, method, page: incomePage, size: incomeSize, side: 'in' }, controller.signal)
        .then(value => { if (!controller.signal.aborted) setIncome(value); })
        .catch(cause => { if (!controller.signal.aborted) setIncomeError(cause instanceof Error ? cause.message : 'Không tải được phiếu thu.'); })
        .finally(() => { if (!controller.signal.aborted) setIncomeLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [from, to, store, search, category, method, incomePage, incomeSize, retry, incomeRefresh]);

  useEffect(() => {
    const controller = new AbortController();
    setExpenseLoading(true);
    setExpenseError('');
    setExpense(null);
    setExportError('');
    const timer = setTimeout(() => {
      void loadRevenueLedger({ from, to, store, search, category, method, page: expensePage, size: expenseSize, side: 'out' }, controller.signal)
        .then(value => { if (!controller.signal.aborted) setExpense(value); })
        .catch(cause => { if (!controller.signal.aborted) setExpenseError(cause instanceof Error ? cause.message : 'Không tải được phiếu chi.'); })
        .finally(() => { if (!controller.signal.aborted) setExpenseLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [from, to, store, search, category, method, expensePage, expenseSize, retry, expenseRefresh]);

  const ready = !incomeLoading && !expenseLoading && !incomeError && !expenseError && income && expense;
  const totalCount = (income?.total || 0) + (expense?.total || 0);
  const revenueTotal = (income?.totals.revenue || 0) + (expense?.totals.revenue || 0);
  const contractHint = Math.max(income?.totals.contracts || 0, expense?.totals.contracts || 0);

  async function exportExcel() {
    if (!ready || exporting) return;
    setExporting(true);
    setExportError('');
    try {
      const [incomeAll, expenseAll] = await Promise.all([
        loadRevenueLedger({ from, to, store, search, category, method, page: 1, size: incomeSize, side: 'in' }, undefined, true),
        loadRevenueLedger({ from, to, store, search, category, method, page: 1, size: expenseSize, side: 'out' }, undefined, true),
      ]);
      const ExcelJS = await import('exceljs');
      const book = new ExcelJS.Workbook();
      book.creator = 'HIMOTO';

      function addSheet(name: string, report: RevenueLedgerReport, incomeSide: boolean) {
        const sheet = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 4, xSplit: 3, showGridLines: false }] });
        sheet.columns = [{ width: 15 }, { width: 13 }, { width: 10 }, { width: 14 }, { width: 30 }, { width: 24 }, { width: 22 }, { width: 22 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 22 }, { width: 20 }, { width: 28 }, { width: 28 }, { width: 48 }];
        sheet.mergeCells('A1:P1');
        sheet.getCell('A1').value = `HIMOTO · ${name.toUpperCase()} THUÊ XE`;
        sheet.getRow(1).height = 34;
        sheet.getCell('A1').font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFFFF' } };
        sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: incomeSide ? '1D4ED8' : 'B91C1C' } };
        sheet.mergeCells('A2:P2');
        sheet.getCell('A2').value = `${day(from)} – ${day(to)} · ${report.total} phiếu · ${report.totals.contracts} hợp đồng · Phiếu đã duyệt · Giờ Việt Nam`;
        sheet.getRow(2).height = 26;
        sheet.mergeCells('A3:P3');
        sheet.getCell('A3').value = incomeSide
          ? 'Cột hình thức thanh toán là số thu (+). Cọc không tính doanh thu.'
          : 'Cột hình thức thanh toán là số chi (−). Hoàn cọc không tính doanh thu; hoàn tiền thuê làm giảm doanh thu.';
        sheet.getRow(3).height = 25;
        sheet.getRow(4).values = ['Mã phiếu', 'Ngày', 'Giờ', 'Hợp đồng', 'Khách hàng', 'Biển số', 'Cơ sở', 'Nghiệp vụ', 'Tiền mặt', 'TK cá nhân', 'TK công ty', 'Chưa tách / chưa rõ', 'Tính doanh thu', 'NVKD', 'Người ghi nhận', 'Ghi chú'];
        sheet.getRow(4).height = 28;
        sheet.getRow(4).eachCell(cell => {
          cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D82232' } };
          cell.alignment = { vertical: 'middle', wrapText: true };
        });
        for (const row of report.rows) {
          const line = sheet.addRow([
            `#${row.id}`, day(row.day), time(row.at), row.code, row.customer, row.vehicles, row.store_name,
            REVENUE_LEDGER_CATEGORIES[row.category],
            ...methodColumns.map(([key]) => methodAmount(row, key)),
            row.revenue, row.staff_name, row.actor_name, row.note,
          ]);
          line.height = 30;
          line.eachCell((cell, column) => {
            cell.font = { name: 'Calibri', size: 11 };
            cell.alignment = { vertical: 'middle', wrapText: true };
            if (line.number % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
            if (column >= 9 && column <= 13) {
              cell.numFmt = '#,##0;[Red](#,##0);"—"';
              cell.alignment = { vertical: 'middle', horizontal: 'right' };
            }
          });
        }
        const total = sheet.addRow([
          'TỔNG TOÀN BỘ KẾT QUẢ', `${report.total} phiếu`, '', '', '', '', '', `${report.totals.contracts} hợp đồng`,
          ...methodColumns.map(([key]) => methodTotal(report, key)),
          report.totals.revenue,
        ]);
        total.height = 30;
        total.eachCell((cell, column) => {
          cell.font = { name: 'Calibri', size: 11, bold: true };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
          if (column >= 9 && column <= 13) cell.numFmt = '#,##0;[Red](#,##0);"—"';
        });
        sheet.autoFilter = `A4:P${4 + report.rows.length}`;
        sheet.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:4' };
      }

      addSheet('Phiếu thu', incomeAll, true);
      addSheet('Phiếu chi', expenseAll, false);
      const buffer = await book.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `HIMOTO-so-thu-chi-${from}-${to}.xlsx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'Không xuất được sổ giao dịch.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="mg-revenue-ledger" aria-label="Sổ giao dịch thu chi" aria-busy={incomeLoading || expenseLoading}>
      <div className="mg-revenue-ledger-heading">
        <div>
          <h3>
            <ReceiptText size={19} aria-hidden="true" />
            Sổ thu / chi <span>{ready ? totalCount.toLocaleString('vi-VN') : '—'} phiếu</span>
          </h3>
          <p>Tách riêng phiếu thu và phiếu chi đã duyệt. Xuất Excel gồm 2 sheet Thu / Chi.</p>
        </div>
        <button type="button" className="mg-button" disabled={!ready || !totalCount || exporting} onClick={() => void exportExcel()}>
          {exporting ? <LoaderCircle size={16} className="mg-spin" /> : <ArrowDownToLine size={16} />}
          {exporting ? 'Đang xuất…' : 'Xuất sổ Excel'}
        </button>
      </div>

      <div className="mg-revenue-ledger-filters">
        <label className="mg-report-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="Tìm giao dịch"
            placeholder="Khách, mã HĐ, biển số, mã phiếu…"
            value={search}
            onChange={event => { setSearch(event.target.value); setIncomePage(1); setExpensePage(1); }}
          />
        </label>
        <label>
          <span>Nghiệp vụ</span>
          <select
            aria-label="Lọc nghiệp vụ giao dịch"
            value={category}
            onChange={event => { setCategory(event.target.value); setIncomePage(1); setExpensePage(1); }}
          >
            <option value="">Tất cả nghiệp vụ</option>
            <option value="revenue">Chỉ phiếu tính doanh thu</option>
            {Object.entries(REVENUE_LEDGER_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>Hình thức thanh toán</span>
          <select
            aria-label="Lọc hình thức giao dịch"
            value={method}
            onChange={event => { setMethod(event.target.value); setIncomePage(1); setExpensePage(1); }}
          >
            <option value="">Tất cả hình thức</option>
            {Object.entries(REVENUE_LEDGER_METHODS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        {(search || category || method) && (
          <button type="button" className="mg-button" onClick={() => { setSearch(''); setCategory(''); setMethod(''); setIncomePage(1); setExpensePage(1); }}>
            Xóa bộ lọc giao dịch
          </button>
        )}
      </div>

      {ready && (
        <>
          <dl className="mg-revenue-ledger-metrics" aria-label="Tổng giao dịch theo bộ lọc">
            <div>
              <dt>Phiếu thu</dt>
              <dd>{formatMoney(income.totals.income)}</dd>
              <small>{income.totals.income_count} phiếu · gồm {formatMoney(income.totals.deposit)} cọc</small>
            </div>
            <div>
              <dt>Phiếu chi</dt>
              <dd>{formatMoney(expense.totals.expense)}</dd>
              <small>{expense.totals.expense_count} phiếu · gồm {formatMoney(expense.totals.deposit_refund)} hoàn cọc</small>
            </div>
            <div>
              <dt>Tính vào doanh thu</dt>
              <dd data-ledger-revenue>{formatMoney(revenueTotal)}</dd>
              <small>
                {(income.totals.revenue_count + expense.totals.revenue_count).toLocaleString('vi-VN')} phiếu · {contractHint} hợp đồng có giao dịch
              </small>
            </div>
          </dl>
          <p className="mg-revenue-ledger-help">
            Bảng trái: phiếu thu (+). Bảng phải: phiếu chi (−). Cọc / hoàn cọc không tính doanh thu; hoàn tiền thuê làm giảm doanh thu.
          </p>
        </>
      )}

      <div className="mg-revenue-ledger-split">
        <LedgerTable
          side="in"
          data={income}
          loading={incomeLoading}
          error={incomeError}
          page={incomePage}
          size={incomeSize}
          onPage={setIncomePage}
          onSize={size => { setIncomeSize(size); setIncomePage(1); }}
          onRetry={() => setIncomeRefresh(value => value + 1)}
        />
        <LedgerTable
          side="out"
          data={expense}
          loading={expenseLoading}
          error={expenseError}
          page={expensePage}
          size={expenseSize}
          onPage={setExpensePage}
          onSize={size => { setExpenseSize(size); setExpensePage(1); }}
          onRetry={() => setExpenseRefresh(value => value + 1)}
        />
      </div>

      {exportError && <p role="alert" className="mg-field-error">{exportError}</p>}
    </section>
  );
}
