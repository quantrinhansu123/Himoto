import { importText } from './customer-import';
import type { CustomerImportStore } from './customer-import';

export const VEHICLE_IMPORT_LIMIT = 1000;
export const VEHICLE_EXCEL_MAX_BYTES = 5 * 1024 * 1024;
export const VEHICLE_IMPORT_COLUMNS = [
  { key: 'id', label: 'ID xe', required: false, width: 15, max: 16 },
  { key: 'name', label: 'Tên xe', required: true, width: 30, max: 255 },
  { key: 'brand', label: 'Hãng xe', required: true, width: 18, max: 255 },
  { key: 'type', label: 'Loại xe', required: true, width: 20, max: 25 },
  { key: 'year', label: 'Năm sản xuất', required: true, width: 18, max: 4 },
  { key: 'license', label: 'Biển số', required: true, width: 22, max: 25 },
  { key: 'color', label: 'Màu sắc', required: false, width: 24, max: 255 },
  { key: 'chassis', label: 'Số khung', required: false, width: 30, max: 255 },
  { key: 'engine', label: 'Số máy', required: false, width: 28, max: 255 },
  { key: 'store', label: 'Cơ sở', required: true, width: 32, max: 255 },
  { key: 'status', label: 'Trạng thái', required: true, width: 24, max: 255 },
  { key: 'odometer', label: 'Số km', required: false, width: 18, max: 16 },
  { key: 'daily_price', label: 'Đơn giá thuê / ngày (VNĐ)', required: false, width: 26, max: 16 },
  { key: 'monthly_price', label: 'Đơn giá thuê / tháng (VNĐ)', required: false, width: 28, max: 16 },
] as const;
export type VehicleImportField = (typeof VEHICLE_IMPORT_COLUMNS)[number]['key'];
export type VehicleImportValues = Record<VehicleImportField, string>;
export type VehicleImportMode = 'sync' | 'replace';
export interface VehicleImportInput { rowNumber: number; values: VehicleImportValues; errors?: string[]; warnings?: string[] }
export interface VehicleImportExisting { id: string | number; license: string; color?: string | null; store_id?: string | number; current_store_id?: string | number | null; status?: string }
export interface VehicleImportRow extends VehicleImportInput { state: 'valid' | 'invalid' | 'skipped'; action: 'update' | 'insert'; targetId: number | null; storeId: number | null; errors: string[]; warnings: string[] }
export interface VehicleReference { table: string; column: string; count: number }
export interface VehicleImportResult {
  rows: VehicleImportRow[]; total: number; valid: number; invalid: number; skipped: number; inserted: number; updated: number;
  blankColors: number; retained: number; existing: number; revision: string; committed: boolean;
  blocking: string[]; references: VehicleReference[]; backupId?: string;
}
export interface VehicleResetPreview { total: number; revision: string; references: VehicleReference[]; blocking: string[] }
export const vehiclePlate = (value: string) => value.trim().toUpperCase().replace(/[\s.-]/g, '');
const types: Record<string, string> = { xega: 'xega', 'xe ga': 'xega', xeso: 'xeso', 'xe so': 'xeso', xecon: 'xecon', 'xe con tay': 'xecon', xesh: 'xesh', 'xe sh': 'xesh', 'xe dien': 'xe_dien', electric: 'xe_dien' };
const statuses: Record<string, string> = { ready: 'ready', 'san sang': 'ready', using: 'using', rent: 'using', 'dang thue': 'using', repairing: 'repairing', maintenance: 'repairing', 'bao duong': 'repairing', pending: 'pending', holding: 'pending', 'dat truoc': 'pending', sold: 'sold', 'da ban': 'sold', 'bad debt': 'bad_debt', 'no xau': 'bad_debt', broken: 'broken', hong: 'broken', 'in transit': 'in_transit', 'dang dieu chuyen': 'in_transit' };
const validId = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;

export function validateVehicleImport(inputs: VehicleImportInput[], stores: CustomerImportStore[], existing: VehicleImportExisting[], mode: VehicleImportMode, skipUnknownStores = false): VehicleImportRow[] {
  const resolveStores = (source: string) => {
    const legacyId = skipUnknownStores ? source.match(/^Cơ sở cũ #(\d+)$/)?.[1] : undefined;
    const value = legacyId || source;
    return stores.filter(store => String(store.id) === value || importText(store.name) === importText(value) || (store.code && importText(store.code) === importText(value)));
  };
  const skipping = (input: VehicleImportInput) => skipUnknownStores && Boolean(input.values.store.trim()) && resolveStores(input.values.store.trim()).length === 0;
  const plates = new Map<string, number[]>(), ids = new Map<string, number[]>();
  for (const input of inputs.filter(input => !skipping(input))) {
    for (const [map, value] of [[plates, vehiclePlate(input.values.license)], [ids, input.values.id.trim() ? String(Number(input.values.id)) : '']] as const) {
      if (value) map.set(value, [...(map.get(value) || []), input.rowNumber]);
    }
  }
  return inputs.map(input => {
    const values = Object.fromEntries(VEHICLE_IMPORT_COLUMNS.map(column => [column.key, input.values[column.key].trim()])) as VehicleImportValues;
    values.license = values.license.toUpperCase();
    values.type = types[importText(values.type)] || values.type;
    values.status = statuses[importText(values.status)] || values.status;
    if (skipping(input)) return { rowNumber: input.rowNumber, values, errors: ['Bỏ qua: cơ sở trong file không nằm trong danh sách hiện có.'], warnings: [], state: 'skipped', action: 'insert', targetId: null, storeId: null };
    const errors = [...(input.errors || [])], warnings = [...(input.warnings || [])];
    const byId = values.id ? existing.find(row => String(row.id) === String(Number(values.id))) : undefined;
    const byPlate = existing.filter(row => vehiclePlate(row.license) === vehiclePlate(values.license));
    if (byPlate.length > 1) errors.push('Biển số đang trùng trong CSDL; cần xử lý trước khi đồng bộ.');
    if (byId && vehiclePlate(byId.license) !== vehiclePlate(values.license)) errors.push('ID xe thuộc biển số khác trong CSDL. Không được ghi đè.');
    if (byPlate.length === 1 && values.id && String(byPlate[0].id) !== String(Number(values.id))) errors.push('Biển số đã có với ID khác. Kiểm tra lại ID xe.');
    const current = byId || byPlate[0];
    const updating = mode === 'sync' && Boolean(current);
    for (const column of VEHICLE_IMPORT_COLUMNS) {
      if (column.required && !values[column.key] && !(updating && column.key === 'store')) errors.push(`Thiếu ${column.label.toLowerCase()}.`);
      if (values[column.key].length > column.max) errors.push(`${column.label} vượt ${column.max} ký tự.`);
    }
    if (values.id && !validId(values.id)) errors.push('ID xe phải là số nguyên dương, không vượt giới hạn an toàn.');
    if (!/^\d{4}$/.test(values.year) || Number(values.year) < 1900 || Number(values.year) > new Date().getFullYear() + 1) errors.push('Năm sản xuất phải là năm gồm 4 chữ số.');
    if (!['xega', 'xeso', 'xecon', 'xesh', 'xe_dien'].includes(values.type)) errors.push('Loại xe không hợp lệ.');
    if (!['ready', 'using', 'repairing', 'pending', 'sold', 'bad_debt', 'broken', 'in_transit'].includes(values.status)) errors.push('Trạng thái xe không hợp lệ.');
    if (!vehiclePlate(values.license) || !/^[A-Z0-9.\-\s]+$/.test(values.license)) errors.push('Biển số phải gồm chữ, số, dấu chấm hoặc dấu gạch ngang.');
    if (values.color && /^\d+(?:\.\d+)?$/.test(values.color)) errors.push('Màu sắc đang là số; cần xác nhận và sửa trước khi nhập.');
    if (!values.color) warnings.push(updating && current?.color ? 'Màu sắc trống: giữ màu đang có trong CSDL.' : 'Chưa có màu sắc; để trống, cần bổ sung sau.');
    if (values.odometer && (!/^\d+$/.test(values.odometer) || !Number.isSafeInteger(Number(values.odometer)))) errors.push('Số km phải là số nguyên không âm trong giới hạn an toàn.');
    for (const key of ['daily_price', 'monthly_price'] as const) if (values[key] && (!/^\d+$/.test(values[key]) || !Number.isSafeInteger(Number(values[key])))) errors.push(`${key === 'daily_price' ? 'Đơn giá ngày' : 'Đơn giá tháng'} phải là số nguyên không âm trong giới hạn an toàn.`);
    for (const [label, value, map] of [['Biển số', vehiclePlate(values.license), plates], ['ID xe', values.id ? String(Number(values.id)) : '', ids]] as const) {
      if (value && (map.get(value)?.length || 0) > 1) errors.push(`${label} trùng trong file (dòng ${map.get(value)!.slice(0, 6).join(', ')}).`);
    }
    const matches = resolveStores(values.store);
    const storeId = matches.length === 1 ? Number(matches[0].id) : null;
    if (!updating && storeId === null) errors.push('Chưa khớp cơ sở. Chọn lại cơ sở hiện có; không tự suy ra mã cũ.');
    if (updating) warnings.push('Giữ ID, cơ sở, trạng thái và dữ liệu giá hiện có của xe.');
    return { rowNumber: input.rowNumber, values, errors, warnings, state: errors.length ? 'invalid' : 'valid', action: updating ? 'update' : 'insert', targetId: current ? Number(current.id) : values.id && validId(values.id) ? Number(values.id) : null, storeId };
  });
}
