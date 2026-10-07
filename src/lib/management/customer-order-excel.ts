import type { Cell, Workbook } from 'exceljs';
import { importPhone, importText } from './customer-import';

export const ORDER_CUSTOMER_HEADERS = ['ID', 'Ngày tạo', 'Tên khách hàng', 'SĐT khách hàng', 'Tên xe', 'Biển số', 'Thời gian mượn', 'Thời gian trả', 'Ghi chú', 'Đặt cọc', 'Tạm tính', 'Trạng thái'];
export interface OrderCustomerSource {
  filename: string; rowNumber: number; orderId: string; name: string; phone: string;
  originalPhone: string; errors: string[];
}
export interface OrderCustomerGroup {
  name: string; phone: string; sources: OrderCustomerSource[]; errors: string[];
}

function readText(cell: Cell) {
  const value = cell.value;
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'object' && 'richText' in value) return value.richText.map(part => part.text).join('').trim();
  throw new Error(`${cell.address}: không nhận công thức, ngày hoặc kiểu dữ liệu khác cho thông tin khách hàng.`);
}

export function parseOrderCustomerWorkbook(book: Workbook, filename: string): OrderCustomerSource[] {
  const sheet = book.worksheets[0];
  if (!sheet || sheet.columnCount !== ORDER_CUSTOMER_HEADERS.length || sheet.rowCount > 10001 || !ORDER_CUSTOMER_HEADERS.every((text, i) => importText(sheet.getRow(1).getCell(i + 1).text) === importText(text))) throw new Error(`${filename}: file không khớp 12 cột xuất đơn thuê; cần đối chiếu thủ công.`);
  const sources: OrderCustomerSource[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || !row.hasValues) return;
    const errors: string[] = [];
    const name = readText(row.getCell(3)), originalPhone = readText(row.getCell(4));
    let phone = originalPhone.replace(/[\s.()-]/g, '');
    if (typeof row.getCell(4).value === 'number') {
      const number = row.getCell(4).value as number;
      const format = row.getCell(4).numFmt;
      if (Number.isSafeInteger(number) && number >= 0 && /^0{9,13}$/.test(format)) phone = String(number).padStart(format.length, '0');
      else { errors.push('Điện thoại là ô số, chưa xác định được số 0 đầu. Cần đối chiếu bản gốc.'); phone = ''; }
    }
    if (!name || name.length > 191) errors.push('Tên khách hàng thiếu hoặc vượt 191 ký tự.');
    if (!phone || !/^\+?\d{9,13}$/.test(phone)) errors.push('Số điện thoại thiếu hoặc không đúng định dạng 9–13 chữ số.');
    sources.push({ filename, rowNumber, orderId: readText(row.getCell(1)), name, phone, originalPhone, errors });
  });
  if (!sources.length || sources.length > 1000) throw new Error(`${filename}: cần từ 1 đến 1.000 dòng dữ liệu.`);
  return sources;
}

export function groupOrderCustomers(sources: OrderCustomerSource[]): OrderCustomerGroup[] {
  const groups = new Map<string, OrderCustomerGroup>();
  for (const source of sources) {
    // Unconfirmed numeric phones group by their original value, never by blank.
    const identity = importPhone(source.phone || source.originalPhone);
    const key = identity ? `${importText(source.name)}\0${identity}` : `unresolved\0${source.filename}\0${source.rowNumber}`;
    const current = groups.get(key);
    if (current) {
      current.sources.push(source);
      current.errors = [...new Set([...current.errors, ...source.errors])];
    } else groups.set(key, { name: source.name, phone: source.phone, sources: [source], errors: [...source.errors] });
  }
  const phones = new Map<string, Set<string>>();
  for (const group of groups.values()) {
    const phone = importPhone(group.phone || group.sources[0].originalPhone);
    if (!phone) continue;
    phones.set(phone, new Set([...(phones.get(phone) || []), importText(group.name)]));
  }
  for (const group of groups.values()) {
    const phone = importPhone(group.phone || group.sources[0].originalPhone);
    if (!phone) continue;
    if ((phones.get(phone)?.size || 0) > 1) group.errors.push('Cùng số điện thoại có nhiều tên khách hàng. Cần xác nhận trước khi gộp / nhập.');
  }
  if (groups.size > 1000) throw new Error('Chỉ đối chiếu tối đa 1.000 khách hàng mỗi lần.');
  return [...groups.values()];
}
