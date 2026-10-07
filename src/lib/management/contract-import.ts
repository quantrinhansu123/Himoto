import type { Cell, Workbook } from 'exceljs';
import { importPhone, importText } from './customer-import';
import { ORDER_CUSTOMER_HEADERS } from './customer-order-excel';
import { vehiclePlate } from './vehicle-import';

export interface ContractExcelSource {
  filename: string; rowNumber: number; sourceId: string; storeId: number | null;
  createdAt: string; name: string; phone: string; originalPhone: string;
  vehicleName: string; license: string; start: string; end: string; note: string;
  paid: string; total: string; status: string; errors: string[];
}
export interface ContractImportCustomer { id: string | number; name: string; phone?: string | null; store_id?: string | number | null; id_card?: string | null; address?: string | null }
export interface ContractImportVehicle { id: string | number; name: string; license: string; status: string; store_id?: string | number | null; current_store_id?: string | number | null }
export interface ContractImportOrder {
  id: string | number; store_id?: string | number | null; customer_id?: string | number | null;
  customer_name?: string | null; customer_phone?: string | null; order_status: string;
  created_at?: string | Date | null; deleted_at?: string | Date | null; pid?: string | number | null;
  total?: string | number | null; metadata?: string | null; draft_payload?: unknown;
}
export interface ContractImportDetail {
  id: string | number; order_id?: string | number | null; vehicle_id?: string | number | null;
  rent_at?: string | Date | null; return_at?: string | Date | null;
  deleted_at?: string | Date | null; completed_at?: string | Date | null;
}
export interface ContractImportSnapshot {
  customers: ContractImportCustomer[]; vehicles: ContractImportVehicle[];
  stores: { id: string | number; name: string }[]; orders: ContractImportOrder[]; details: ContractImportDetail[];
}
export interface ContractImportPlan {
  sourceId: string; sources: ContractExcelSource[]; storeId: number | null; customerId: number | null;
  vehicleIds: number[]; targetId: number | null; state: 'new' | 'existing' | 'blocked';
  errors: string[]; warnings: string[];
}
export const CONTRACT_IMPORT_NAMESPACE = 'himoto-customer-workbooks-v1';
export const CONTRACT_IMPORT_LIMIT = 1000;

function text(cell: Cell) {
  const value = cell.value;
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'object' && 'richText' in value) return value.richText.map(item => item.text).join('').trim();
  throw new Error(`${cell.address}: thay công thức / dữ liệu không hỗ trợ bằng giá trị gốc.`);
}
// SQL DATETIME exports and Excel Date components are Vietnam wall time.
// No conversion through the host timezone, and no guessing missing times.
export function contractExcelDate(value: unknown) {
  const raw = value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 19).replace('T', ' ') : typeof value === 'string' ? value.trim() : '';
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(raw);
  if (!match) return '';
  const [, y, m, d, h, min, s] = match;
  const date = new Date(`${y}-${m}-${d}T${h}:${min}:${s}Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== `${y}-${m}-${d}T${h}:${min}:${s}`) return '';
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}
export const contractImportTimestamp = (value: string) => `${value.replace(' ', 'T')}+07:00`;
const validMoney = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 9999999999999;

export function parseContractOrderWorkbook(book: Workbook, filename: string, storeId: number | null): ContractExcelSource[] {
  const sheet = book.worksheets[0];
  if (!sheet || sheet.columnCount !== 12 || sheet.rowCount > 10001 || !ORDER_CUSTOMER_HEADERS.every((header, i) => importText(sheet.getRow(1).getCell(i + 1).text) === importText(header))) throw new Error(`${filename}: không khớp cấu trúc 12 cột xuất đơn thuê.`);
  const sources: ContractExcelSource[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || !row.hasValues) return;
    const errors: string[] = [];
    const read = (column: number) => { try { return text(row.getCell(column)); } catch (e) { errors.push((e as Error).message); return ''; } };
    const sourceId = read(1), name = read(3), originalPhone = read(4), vehicleName = read(5), license = read(6), note = read(9), paid = read(10), total = read(11), status = read(12);
    let phone = originalPhone.replace(/[\s.()-]/g, '');
    if (typeof row.getCell(4).value === 'number') {
      const value = row.getCell(4).value as number, format = row.getCell(4).numFmt;
      if (Number.isSafeInteger(value) && value >= 0 && /^0{9,13}$/.test(format)) phone = String(value).padStart(format.length, '0');
      else { phone = ''; errors.push('Điện thoại dạng số chưa xác minh số 0 đầu.'); }
    }
    const dates = [2, 7, 8].map(column => contractExcelDate(row.getCell(column).value));
    if (dates.some(date => !date)) errors.push('Ngày tạo / mượn / trả phải có ngày và giờ hợp lệ theo file gốc.');
    if (dates[1] && dates[2] && dates[2] <= dates[1]) errors.push('Ngày trả phải sau ngày mượn.');
    if (!/^\d+$/.test(sourceId) || !Number.isSafeInteger(Number(sourceId)) || Number(sourceId) <= 0) errors.push('ID đơn nguồn không hợp lệ.');
    if (!name || name.length > 191) errors.push('Tên khách thiếu hoặc vượt 191 ký tự.');
    if (!/^\+?\d{9,13}$/.test(phone)) errors.push('Điện thoại thiếu hoặc không hợp lệ.');
    if (!license || license.length > 25 || !/^[a-z0-9.\-\s]+$/i.test(license) || !vehiclePlate(license)) errors.push('Biển số thiếu hoặc không hợp lệ.');
    if (note.length > 191) errors.push('Ghi chú vượt 191 ký tự; cần đối chiếu trước khi nhập.');
    if (!validMoney(paid) || !validMoney(total)) errors.push('Tổng đã thu / tạm tính phải là số nguyên không âm trong giới hạn.');
    if (status !== 'renting') errors.push('Chỉ đối chiếu các dòng đang thuê (renting).');
    sources.push({ filename, rowNumber, sourceId, storeId, createdAt: dates[0], name, phone, originalPhone, vehicleName, license, start: dates[1], end: dates[2], note, paid, total, status, errors });
  });
  if (!sources.length || sources.length > CONTRACT_IMPORT_LIMIT) throw new Error(`${filename}: cần từ 1 đến ${CONTRACT_IMPORT_LIMIT} dòng.`);
  return sources;
}

const id = (value: unknown) => value == null ? null : Number(value);
const sameIds = (a: number[], b: number[]) => a.length === b.length && [...a].sort((x, y) => x - y).every((value, i) => value === [...b].sort((x, y) => x - y)[i]);
const isoWall = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 19).replace('T', ' ') : typeof value === 'string' ? value.slice(0, 19).replace('T', ' ') : '';
const instant = (value: string | Date | null | undefined) => value ? new Date(value).getTime() : NaN;
function importInfo(order: ContractImportOrder) {
  try { const data = JSON.parse(order.metadata || '{}'); return data?.excel_import?.namespace === CONTRACT_IMPORT_NAMESPACE ? data.excel_import : null; } catch { return null; }
}
function detailsForOrder(order: ContractImportOrder, details: ContractImportDetail[]): ContractImportDetail[] {
  if (order.order_status !== 'draft' || !importInfo(order)) return details.filter(detail => id(detail.order_id) === id(order.id));
  const payload = order.draft_payload as { order_items?: ContractImportDetail[] } | null;
  return Array.isArray(payload?.order_items) ? payload.order_items.map((detail, i) => ({ ...detail, id: detail.id ?? i, order_id: order.id })) : [];
}

export function planContractImport(sources: ContractExcelSource[], snapshot: ContractImportSnapshot): ContractImportPlan[] {
  if (!sources.length || sources.length > CONTRACT_IMPORT_LIMIT) throw new Error('Số dòng đối chiếu không hợp lệ.');
  const groups = new Map<string, ContractExcelSource[]>();
  for (const source of sources) groups.set(source.sourceId, [...(groups.get(source.sourceId) || []), source]);
  const liveDetails = snapshot.details.filter(detail => !detail.deleted_at);
  const activeOrders = snapshot.orders.filter(order => !order.deleted_at && !['completed', 'cancelled', 'draft'].includes(order.order_status));
  const plans = [...groups].map(([sourceId, all]): ContractImportPlan => {
    const first = all[0], errors = [...new Set(all.flatMap(source => source.errors))], warnings: string[] = [];
    const unique = all.filter((source, i) => all.findIndex(other => vehiclePlate(other.license) === vehiclePlate(source.license)) === i);
    const fields = ['storeId', 'createdAt', 'name', 'phone', 'paid', 'total', 'status', 'note'] as const;
    if (all.some(source => fields.some(field => String(source[field]) !== String(first[field])))) errors.push('Các dòng cùng ID đơn nguồn có thông tin khách / cơ sở / tiền khác nhau.');
    for (const source of all) {
      const other = unique.find(item => vehiclePlate(item.license) === vehiclePlate(source.license))!;
      if (source.start !== other.start || source.end !== other.end) errors.push('Cùng đơn và biển số có thời gian thuê khác nhau.');
    }
    if (!first.storeId || !snapshot.stores.some(store => id(store.id) === first.storeId)) errors.push('Chưa xác định cơ sở hiện có.');
    const customers = first.phone ? snapshot.customers.filter(customer => importPhone(customer.phone || '') === importPhone(first.phone) && importText(customer.name) === importText(first.name)) : [];
    const customer = customers.length === 1 ? customers[0] : undefined;
    if (!customer) errors.push('Chưa khớp được duy nhất khách hàng theo tên và điện thoại.');
    if (customer?.store_id != null && id(customer.store_id) !== first.storeId) errors.push('Khách hàng thuộc cơ sở khác; cần đối chiếu.');
    if (customer && (!customer.id_card || !customer.address)) warnings.push('Hồ sơ khách chưa đủ CCCD/địa chỉ; chưa đủ thông tin để phát hành bản hợp đồng.');
    const vehicleIds: number[] = [];
    for (const source of unique) {
      const candidates = snapshot.vehicles.filter(vehicle => vehiclePlate(vehicle.license) === vehiclePlate(source.license));
      if (candidates.length !== 1) { errors.push(`${source.license}: chưa có xe hoặc biển số trùng trong CSDL.`); continue; }
      const vehicle = candidates[0]; vehicleIds.push(Number(vehicle.id));
      if (id(vehicle.current_store_id ?? vehicle.store_id) !== first.storeId) errors.push(`${source.license}: cơ sở hiện tại của xe khác cơ sở trong file.`);
      if (!['ready', 'using', 'rent'].includes(vehicle.status)) errors.push(`${source.license}: xe đang ở trạng thái không thể khớp đơn thuê mới.`);
      if (importText(vehicle.name) !== importText(source.vehicleName)) warnings.push(`${source.license}: tên xe trong file khác danh mục; khớp theo biển số.`);
    }
    const customerId = customer ? Number(customer.id) : null;
    const matchingOrders = customer && vehicleIds.length === unique.length ? snapshot.orders.filter(order => {
      if (id(order.customer_id) !== customerId || id(order.store_id) !== first.storeId) return false;
      const details = detailsForOrder(order, liveDetails);
      if (!sameIds(details.map(detail => Number(detail.vehicle_id)), vehicleIds)) return false;
      // Never match by source ID alone. Verify branch, customer, full vehicle
      // set, rent start, and created wall time for a legacy ID match.
      if (String(importInfo(order)?.sourceId) === sourceId) return true;
      const startsMatch = unique.every(source => {
        const vehicleId = id(snapshot.vehicles.find(v => vehiclePlate(v.license) === vehiclePlate(source.license))?.id);
        return details.some(detail => id(detail.vehicle_id) === vehicleId &&
          (instant(detail.rent_at) === instant(contractImportTimestamp(source.start)) || (String(order.id) === sourceId && isoWall(detail.rent_at) === source.start)));
      });
      return startsMatch && (String(order.id) !== sourceId || isoWall(order.created_at) === first.createdAt);
    }) : [];
    const target = matchingOrders.length === 1 ? matchingOrders[0] : undefined;
    if (matchingOrders.length > 1) errors.push('Có nhiều hợp đồng cùng thông tin; không tự chọn.');
    if (target && (target.deleted_at || (target.order_status !== 'renting' && !(target.order_status === 'draft' && String(importInfo(target)?.sourceId) === sourceId)))) errors.push('Hợp đồng khớp đã đóng / xóa / đổi trạng thái; không tự mở lại.');
    if (target) {
      const info = importInfo(target), targetDetails = detailsForOrder(target, liveDetails);
      if (String(info?.sourcePaid ?? target.pid ?? '') !== first.paid || String(info?.sourceTotal ?? target.total ?? '') !== first.total) warnings.push('Số tiền trong Excel khác hợp đồng đang có; giữ nguyên, chờ đối chiếu chứng từ.');
      if (unique.some(source => !targetDetails.some(detail => id(detail.vehicle_id) === id(snapshot.vehicles.find(v => vehiclePlate(v.license) === vehiclePlate(source.license))?.id) && instant(detail.return_at) === instant(contractImportTimestamp(source.end))))) warnings.push('Thời gian trả trong Excel khác hợp đồng đang có; cần đối chiếu gia hạn và múi giờ.');
      if (target.order_status === 'draft') warnings.push('Đã nhập vào Log dưới dạng nháp; tiếp tục bổ sung tại bản nháp hiện có.');
    }
    for (const vehicleId of vehicleIds) {
      const conflicts = activeOrders.filter(order => id(order.id) !== id(target?.id) && liveDetails.some(detail => id(detail.order_id) === id(order.id) && id(detail.vehicle_id) === vehicleId && !detail.completed_at));
      if (conflicts.length) errors.push(`Xe #${vehicleId} đang gắn hợp đồng hoạt động khác (${conflicts.map(order => `#${order.id}`).slice(0, 5).join(', ')}).`);
    }
    if (vehicleIds.length > 20 || JSON.stringify(vehicleIds).length > 255) errors.push('Đơn có quá nhiều xe; cần tách đối chiếu.');
    if (!target) warnings.push('File chỉ có tổng đã thu; chưa có tiền cọc riêng, giá thuê từng xe hoặc chứng từ thu.');
    return { sourceId, sources: all, storeId: first.storeId, customerId, vehicleIds, targetId: target ? Number(target.id) : null,
      state: errors.length ? 'blocked' : target ? 'existing' : 'new', errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
  });
  const byPlate = new Map<string, Set<string>>();
  for (const plan of plans) for (const source of plan.sources) byPlate.set(vehiclePlate(source.license), new Set([...(byPlate.get(vehiclePlate(source.license)) || []), plan.sourceId]));
  for (const plan of plans) if (plan.sources.some(source => (byPlate.get(vehiclePlate(source.license))?.size || 0) > 1)) {
    plan.errors.push('Biển số xuất hiện ở nhiều đơn đang thuê trong bộ file; cần đối chiếu trước khi gộp / nhập.'); plan.state = 'blocked';
  }
  return plans;
}
