import type { Cell, Workbook } from 'exceljs';
import { CUSTOMER_EXCEL_MAX_BYTES, CUSTOMER_IMPORT_COLUMNS, CUSTOMER_IMPORT_LIMIT, CustomerImportField, CustomerImportInput, CustomerImportStore, CustomerImportValues, importText } from './customer-import';

async function newWorkbook() {
  const excel = await import('exceljs');
  return new excel.Workbook();
}

export async function createCustomerTemplate(stores: CustomerImportStore[]) {
  const workbook = await newWorkbook();
  workbook.creator = 'HIMOTO';
  const sheet = workbook.addWorksheet('Khách hàng', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = CUSTOMER_IMPORT_COLUMNS.map(column => ({ header: `${column.label}${column.required ? ' *' : ''}`, key: column.key, width: column.width, style: { numFmt: '@' } }));
  sheet.getRow(1).height = 30;
  sheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB5121B' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  sheet.autoFilter = 'A1:H1';
  const branches = workbook.addWorksheet('Cơ sở');
  branches.columns = [{ header: 'ID cơ sở', key: 'id', width: 15 }, { header: 'Mã cơ sở', key: 'code', width: 20 }, { header: 'Tên cơ sở', key: 'name', width: 40 }];
  stores.forEach(store => branches.addRow(store));
  if (stores.length) workbook.definedNames.add(`'Cơ sở'!$C$2:$C$${stores.length + 1}`, 'HimotoStores');
  for (let row = 2; row <= CUSTOMER_IMPORT_LIMIT + 1; row++) {
    // Materialize Text formatting on blank cells for Excel and other readers.
    for (let column = 1; column <= CUSTOMER_IMPORT_COLUMNS.length; column++) sheet.getCell(row, column).numFmt = '@';
    if (stores.length) sheet.getCell(row, 6).dataValidation = { type: 'list', allowBlank: false, formulae: ['HimotoStores'], showErrorMessage: true, errorTitle: 'Cơ sở không hợp lệ', error: 'Chọn cơ sở trong danh sách.' };
    sheet.getCell(row, 7).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Bình thường,Cần lưu ý,Blacklist (khách nợ xấu),Chưa hoàn tất"'], showErrorMessage: true, error: 'Chọn trạng thái trong danh sách.' };
  }
  const guide = workbook.addWorksheet('Hướng dẫn');
  guide.getColumn(1).width = 115;
  [
    'HIMOTO – NHẬP KHÁCH HÀNG TỪ EXCEL',
    'Nhập dữ liệu tại sheet Khách hàng từ dòng 2. Cột có dấu * là bắt buộc. Không đổi tên cột.',
    'Số điện thoại và CCCD/CMND phải để dạng Text để giữ số 0 đầu. Không dùng công thức.',
    'CCCD có 12 chữ số; CMND có 9 chữ số. Không tự thêm số 0 nếu số giấy tờ đã bị Excel làm mất.',
    'Cơ sở: chọn tên trong danh sách, hoặc nhập ID / mã tại sheet Cơ sở.',
    'Trạng thái để trống sẽ là Bình thường. Cần lưu ý bắt buộc có ghi chú / cảnh báo.',
    'Có ghi chú / cảnh báo sẽ hiển thị Cần lưu ý; hồ sơ Blacklist vẫn giữ trạng thái Blacklist.',
    'Tối đa 1.000 khách hàng mỗi file, dung lượng tối đa 5 MB; chỉ nhận .xlsx.',
    'Tải file lên để xem trước. Chỉ những dòng hợp lệ được nhập; dòng lỗi và trùng được bỏ qua.',
    'Trùng CCCD/CMND hoặc số điện thoại trong file / hệ thống sẽ được báo. Không cập nhật đè hồ sơ đã có.',
    'Số điện thoại +84 và 0 được đối chiếu cùng một số. File mẫu không chứa dữ liệu khách hàng thật.',
  ].forEach(text => guide.addRow([text]));
  return workbook.xlsx.writeBuffer();
}

function cellText(cell: Cell, field: CustomerImportField, errors: string[]) {
  const value = cell.value;
  if (value == null) return '';
  if (cell.type === 6 || (typeof value === 'object' && ('formula' in value || 'sharedFormula' in value))) {
    errors.push(`${cell.address}: thay công thức bằng giá trị Text.`); return '';
  }
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') {
    if (field === 'phone' || field === 'id_card') {
      if (Number.isSafeInteger(value) && value >= 0 && /^0{9,13}$/.test(cell.numFmt)) return String(value).padStart(cell.numFmt.length, '0');
      errors.push(`${cell.address}: ${field === 'phone' ? 'số điện thoại' : 'CCCD/CMND'} phải là Text để giữ số 0 đầu.`);
    }
    return String(value);
  }
  if (typeof value === 'object' && 'richText' in value) return value.richText.map(part => part.text).join('').trim();
  if (typeof value === 'object' && 'text' in value) return String(value.text).trim();
  errors.push(`${cell.address}: giá trị không được hỗ trợ.`); return '';
}

export function parseCustomerWorkbook(workbook: Workbook): CustomerImportInput[] {
  const sheet = workbook.getWorksheet('Khách hàng') || workbook.worksheets[0];
  if (!sheet) throw new Error('File Excel không có sheet dữ liệu.');
  if (sheet.columnCount > 30 || sheet.actualRowCount > CUSTOMER_IMPORT_LIMIT + 1 || sheet.rowCount > 10000) throw new Error(`File vượt giới hạn ${CUSTOMER_IMPORT_LIMIT.toLocaleString('vi-VN')} dòng hoặc có quá nhiều cột.`);
  const columns = new Map<CustomerImportField, number>();
  sheet.getRow(1).eachCell((cell, index) => {
    const header = importText(cell.text);
    if (!header) return;
    const column = CUSTOMER_IMPORT_COLUMNS.find(item => importText(item.label) === header || importText(item.key) === header || (item.key === 'store' && header === 'store id') || (item.key === 'id_card' && header === 'giay to dinh danh'));
    if (!column) throw new Error(`Cột “${cell.text.slice(0, 80)}” không thuộc mẫu khách hàng. Hãy dùng file mẫu.`);
    if (columns.has(column.key)) throw new Error(`Cột ${column.label} xuất hiện nhiều lần.`);
    columns.set(column.key, index);
  });
  const missing = CUSTOMER_IMPORT_COLUMNS.filter(column => column.required && !columns.has(column.key));
  if (missing.length) throw new Error(`Thiếu cột: ${missing.map(column => column.label).join(', ')}. Tải mẫu Excel để khớp định dạng.`);
  const rows: CustomerImportInput[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || !row.hasValues) return;
    const errors: string[] = [];
    const values = Object.fromEntries(CUSTOMER_IMPORT_COLUMNS.map(column => [column.key, columns.has(column.key) ? cellText(row.getCell(columns.get(column.key)!), column.key, errors) : ''])) as CustomerImportValues;
    if (!Object.values(values).some(Boolean) && !errors.length) return;
    row.eachCell((cell, index) => { if (cell.value != null && ![...columns.values()].includes(index)) errors.push(`${cell.address}: dữ liệu nằm ngoài các cột có tiêu đề.`); });
    rows.push({ rowNumber, values, errors });
  });
  if (!rows.length) throw new Error('File chưa có khách hàng. Nhập dữ liệu từ dòng 2 trong sheet Khách hàng.');
  if (rows.length > CUSTOMER_IMPORT_LIMIT) throw new Error(`Chỉ nhập tối đa ${CUSTOMER_IMPORT_LIMIT} khách hàng mỗi lần.`);
  return rows;
}

export async function readCustomerExcel(file: File) {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Chỉ nhận file Excel .xlsx. Hãy tải mẫu Excel hoặc lưu lại file ở định dạng .xlsx.');
  if (!file.size || file.size > CUSTOMER_EXCEL_MAX_BYTES) throw new Error('File phải có dữ liệu và không vượt quá 5 MB.');
  const workbook = await newWorkbook();
  try { await workbook.xlsx.load(await file.arrayBuffer()); }
  catch { throw new Error('Không đọc được file Excel. Kiểm tra file có bị hỏng hoặc đặt mật khẩu không.'); }
  return parseCustomerWorkbook(workbook);
}

export function downloadCustomerExcel(buffer: Awaited<ReturnType<typeof createCustomerTemplate>>, filename = 'HIMOTO-mau-khach-hang.xlsx') {
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
