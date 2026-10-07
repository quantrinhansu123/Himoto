import type { Cell, Workbook } from 'exceljs';
import { importText, CustomerImportStore } from './customer-import';
import { VEHICLE_EXCEL_MAX_BYTES, VEHICLE_IMPORT_COLUMNS, VEHICLE_IMPORT_LIMIT, VehicleImportField, VehicleImportInput, VehicleImportValues } from './vehicle-import';

const legacyHeaders = ['Tên', 'Brand', 'Loại xe', 'Đời xe', 'Biển số', 'Màu sắc', 'Cửa hàng', 'Giá mua', 'Giá bán', 'Trạng thái', 'Ngày tạo'];
// Verified against all 21 source columns, the legacy exporter and matching DB IDs.
const legacyColumns: Record<VehicleImportField, number> = { id: 1, name: 2, brand: 3, type: 4, year: 5, store: 6, license: 7, chassis: 8, engine: 9, status: 10, color: 17, odometer: 21 };
export interface VehicleWorkbook { rows: VehicleImportInput[]; legacy: boolean; ignoredColumns: string[] }
async function workbook() { const excel = await import('exceljs'); return new excel.Workbook(); }
const aliases: Record<string, VehicleImportField> = { ten: 'name', brand: 'brand', 'doi xe': 'year', 'bien so xe': 'license', 'cua hang': 'store', 'id co so': 'store', 'store id': 'store', 'current store id': 'store', 'kilomet': 'odometer' };

function cellText(cell: Cell, field: VehicleImportField, errors: string[], warnings: string[]) {
  const raw = cell.value;
  if (raw == null) return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (!Number.isSafeInteger(raw)) errors.push(`${cell.address}: số không nguyên hoặc đã mất độ chính xác.`);
    if (field === 'license') errors.push(`${cell.address}: biển số phải là văn bản, không phải số.`);
    if (field === 'chassis' || field === 'engine') warnings.push(`${cell.address}: số khung / máy là ô số; cần đối chiếu số 0 đầu với bản gốc.`);
    return String(raw);
  }
  if (typeof raw === 'object' && 'richText' in raw) return raw.richText.map(part => part.text).join('').trim();
  errors.push(`${cell.address}: không nhận công thức, ngày, lỗi Excel hoặc kiểu dữ liệu khác trong cột ${field}.`);
  return '';
}

export function parseVehicleWorkbook(book: Workbook): VehicleWorkbook {
  const sheet = book.getWorksheet('Xe') || book.worksheets[0];
  if (!sheet || sheet.rowCount > 10001 || sheet.columnCount > 100) throw new Error('Sheet xe không hợp lệ hoặc quá lớn.');
  const header = sheet.getRow(1);
  const legacy = sheet.columnCount === 21 && legacyHeaders.every((value, i) => importText(String(header.getCell(i + 1).value || '')) === importText(value)) && Array.from({ length: 10 }, (_, i) => header.getCell(i + 12).value).every(value => value == null);
  const columns = new Map<VehicleImportField, number>();
  const ignoredColumns: string[] = [];
  if (legacy) {
    Object.entries(legacyColumns).forEach(([key, index]) => columns.set(key as VehicleImportField, index));
    ignoredColumns.push('K: Giá mua', 'L: Giá bán', 'M: Khoảng giá', 'N: Người tạo', 'O: Ngày tạo', 'P: Ngày sửa', 'R: Loại dịch vụ', 'S/T: Giá min/max');
  } else {
    for (let i = 1; i <= sheet.columnCount; i++) {
      const text = importText(String(header.getCell(i).value || ''));
      const column = VEHICLE_IMPORT_COLUMNS.find(column => importText(column.label) === text || importText(column.key) === text);
      const key = column?.key || aliases[text];
      if (!key) { ignoredColumns.push(`${header.getCell(i).address}: ${String(header.getCell(i).value || '(không có tiêu đề)')}`); continue; }
      if (columns.has(key)) throw new Error(`Tiêu đề ${column?.label || key} xuất hiện hai lần. Kiểm tra lại file.`);
      columns.set(key, i);
    }
    // Color must have a named column even when individual colors are unknown.
    const missing = VEHICLE_IMPORT_COLUMNS.filter(column => (column.required || column.key === 'color') && !columns.has(column.key));
    if (missing.length) throw new Error(`Thiếu cột: ${missing.map(column => column.label).join(', ')}. Tải mẫu Excel mới.`);
  }
  const rows: VehicleImportInput[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const errors: string[] = [], warnings: string[] = [];
    const values = Object.fromEntries(VEHICLE_IMPORT_COLUMNS.map(column => [column.key, columns.has(column.key) ? cellText(row.getCell(columns.get(column.key)!), column.key, errors, warnings) : ''])) as VehicleImportValues;
    if (!Object.values(values).some(Boolean) && !errors.length) return;
    if (legacy) {
      if (!/^\d+$/.test(values.id) || !/^\d{4}$/.test(values.year) || !/^\d+$/.test(values.store) || typeof row.getCell(7).value !== 'string' || ![15, 16].every(index => row.getCell(index).value instanceof Date || (typeof row.getCell(index).value === 'string' && Number.isFinite(Date.parse(String(row.getCell(index).value)))))) throw new Error(`Dòng ${rowNumber} không khớp cấu trúc 21 cột của Kho xe tổng. Cần kiểm tra thủ công.`);
      values.store = `Cơ sở cũ #${values.store}`;
    }
    rows.push({ rowNumber, values, errors, warnings });
  });
  if (!rows.length || rows.length > VEHICLE_IMPORT_LIMIT) throw new Error(`File phải có từ 1 đến ${VEHICLE_IMPORT_LIMIT} xe.`);
  return { rows, legacy, ignoredColumns };
}

export async function createVehicleTemplate(stores: CustomerImportStore[], rows: VehicleImportInput[] = []) {
  const book = await workbook(); book.creator = 'HIMOTO';
  const sheet = book.addWorksheet('Xe', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = VEHICLE_IMPORT_COLUMNS.map(column => ({ header: `${column.label}${column.required ? ' *' : ''}`, key: column.key, width: column.width, style: { numFmt: '@' } }));
  sheet.getRow(1).height = 30;
  sheet.getRow(1).eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB5121B' } }; cell.alignment = { vertical: 'middle', wrapText: true }; });
  sheet.autoFilter = 'A1:L1';
  rows.forEach(row => sheet.addRow(row.values));
  const branches = book.addWorksheet('Cơ sở');
  branches.columns = [{ header: 'ID cơ sở', key: 'id', width: 16 }, { header: 'Mã cơ sở', key: 'code', width: 20 }, { header: 'Tên cơ sở', key: 'name', width: 40 }];
  stores.forEach(store => branches.addRow(store));
  if (stores.length) book.definedNames.add(`'Cơ sở'!$C$2:$C$${stores.length + 1}`, 'HimotoVehicleStores');
  for (let i = 2; i <= VEHICLE_IMPORT_LIMIT + 1; i++) {
    for (let j = 1; j <= VEHICLE_IMPORT_COLUMNS.length; j++) sheet.getCell(i, j).numFmt = '@';
    if (stores.length) sheet.getCell(i, 10).dataValidation = { type: 'list', allowBlank: false, formulae: ['HimotoVehicleStores'], showErrorMessage: true, error: 'Chọn cơ sở hiện có.' };
    sheet.getCell(i, 4).dataValidation = { type: 'list', allowBlank: false, formulae: ['"Xe ga,Xe số,Xe côn tay,Xe SH,Xe điện"'], showErrorMessage: true, error: 'Chọn loại xe.' };
    sheet.getCell(i, 11).dataValidation = { type: 'list', allowBlank: false, formulae: ['"Sẵn sàng,Đang thuê,Bảo dưỡng,Đặt trước,Đã bán,Nợ xấu,Hỏng,Đang điều chuyển"'], showErrorMessage: true, error: 'Chọn trạng thái.' };
  }
  const guide = book.addWorksheet('Hướng dẫn'); guide.getColumn(1).width = 120;
  [
    'HIMOTO – MẪU NHẬP XE',
    'Điền sheet Xe từ dòng 2. Biển số, số khung, số máy và ID dùng định dạng Text để giữ số 0 đầu.',
    'ID xe: để trống đối với xe mới; giữ ID từ file xuất cũ khi đồng bộ. Không tự đặt lại ID đã thuộc xe khác.',
    'Màu sắc có cột riêng. Màu chưa xác định được để trống và có cảnh báo; màu dạng số phải xác nhận và sửa.',
    'Cơ sở dùng tên, mã hoặc ID tại sheet Cơ sở. Mã cơ sở cũ cần khớp lại; không tự chọn một cơ sở thay thế.',
    'Đồng bộ giữ ID và lịch sử, cơ sở, trạng thái và các trường giá của xe đã có; không xóa xe vắng mặt trong Excel.',
    'Thay toàn bộ / Xóa hết bị chặn khi có hợp đồng, ảnh, điều chuyển, bảo dưỡng hoặc dữ liệu liên quan.',
    'Cột thừa được liệt kê và bỏ qua. Không tự suy đoán số như 2, 4 là giá, trạng thái hay cơ sở.',
    'Hệ thống kiểm tra toàn bộ file, không bỏ qua dòng lỗi. Mỗi lần ghi đều sao lưu bảng xe trong cùng giao dịch.',
    'Tối đa 1.000 xe / 5 MB. Có lỗi hoặc dữ liệu thay đổi sau kiểm tra thì hủy toàn bộ lần nhập.',
  ].forEach(text => guide.addRow([text]));
  return book.xlsx.writeBuffer();
}
export async function readVehicleExcel(file: File) {
  if (!/\.xlsx$/i.test(file.name) || !file.size || file.size > VEHICLE_EXCEL_MAX_BYTES) throw new Error('Chỉ nhận file .xlsx có dữ liệu, tối đa 5 MB.');
  const book = await workbook();
  try { await book.xlsx.load(await file.arrayBuffer()); } catch { throw new Error('Không đọc được Excel. Kiểm tra file hỏng hoặc có mật khẩu.'); }
  return parseVehicleWorkbook(book);
}
export function downloadVehicleExcel(buffer: Awaited<ReturnType<typeof createVehicleTemplate>>, filename = 'HIMOTO-mau-xe.xlsx') {
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
