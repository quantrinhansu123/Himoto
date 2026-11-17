import type { Workbook as ExcelWorkbook } from 'exceljs';

/** Export literal cell values, preserving phone numbers and other leading zeros. */
export function addFilteredExcelSheet(book: ExcelWorkbook, name: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const sheet = book.addWorksheet(name);
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row.map(value => value ?? ''));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: headers.length } };
  sheet.columns.forEach((column, index) => { column.width = Math.min(50, Math.max(18, headers[index].length + 4)); });
}
export async function buildFilteredExcel(headers: string[], rows: (string | number | null | undefined)[][]) {
  const { Workbook } = await import('exceljs');
  const book = new Workbook();
  addFilteredExcelSheet(book, 'Dữ liệu', headers, rows);
  return new Uint8Array(await book.xlsx.writeBuffer());
}
export async function downloadFilteredExcel(headers: string[], rows: (string | number | null | undefined)[][], filename: string) {
  downloadExcel(await buildFilteredExcel(headers, rows), filename);
}
export function downloadExcel(bytes: Uint8Array<ArrayBuffer>, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename.replace(/\.xlsx$/i, '')}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
