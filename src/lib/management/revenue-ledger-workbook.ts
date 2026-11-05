import { REVENUE_LEDGER_CATEGORIES, type RevenueLedgerMethod, type RevenueLedgerReport, type RevenueLedgerRow } from './revenue-ledger';

const day = (value: string) => value.split('-').reverse().join('/');
const time = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
const signed = (row: RevenueLedgerRow) => row.type === 'out' ? -row.amount : row.amount;
const methodAmount = (row: RevenueLedgerRow, method: RevenueLedgerMethod | 'other') =>
  (method === 'other' ? ['mixed', 'unknown'].includes(row.method) : row.method === method) ? signed(row) : 0;
const methodTotal = (report: RevenueLedgerReport, method: RevenueLedgerMethod | 'other') => method === 'other'
  ? report.totals.methods.mixed.income - report.totals.methods.mixed.expense + report.totals.methods.unknown.income - report.totals.methods.unknown.expense
  : report.totals.methods[method].income - report.totals.methods[method].expense;
const methodColumns = [['cash', 'Tiền mặt'], ['personal', 'TK cá nhân'], ['company', 'TK công ty'], ['other', 'Chưa tách / chưa rõ']] as const;

export { day as ledgerDay, time as ledgerTime, signed as ledgerSigned, methodAmount as ledgerMethodAmount, methodTotal as ledgerMethodTotal, methodColumns as ledgerMethodColumns };

/** Same workbook builder for web and authenticated mobile export. No I/O or credentials. */
export async function buildRevenueLedgerWorkbook(from: string, to: string, incomeAll: RevenueLedgerReport, expenseAll: RevenueLedgerReport) {
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
  return buffer;
}
