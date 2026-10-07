export const CUSTOMER_IMPORT_LIMIT = 1000;
export const CUSTOMER_EXCEL_MAX_BYTES = 5 * 1024 * 1024;
export const CUSTOMER_IMPORT_COLUMNS = [
  { key: 'name', label: 'Họ và tên', required: true, width: 28, max: 191 },
  { key: 'phone', label: 'Số điện thoại', required: true, width: 20, max: 32 },
  { key: 'id_card', label: 'CCCD / CMND', required: true, width: 22, max: 12 },
  { key: 'email', label: 'Email', required: false, width: 30, max: 191 },
  { key: 'address', label: 'Địa chỉ', required: true, width: 45, max: 191 },
  { key: 'store', label: 'Cơ sở', required: true, width: 30, max: 255 },
  { key: 'status', label: 'Trạng thái hồ sơ', required: false, width: 30, max: 100 },
  { key: 'warning_note', label: 'Ghi chú / cảnh báo', required: false, width: 45, max: 191 },
] as const;
export type CustomerImportField = (typeof CUSTOMER_IMPORT_COLUMNS)[number]['key'];
export type CustomerImportValues = Record<CustomerImportField, string>;
export interface CustomerImportInput { rowNumber: number; values: CustomerImportValues; errors?: string[] }
export interface CustomerImportStore { id: number; name: string; code?: string }
export interface CustomerImportExisting { id: number; phone?: string | null; id_card?: string | null }
export interface CustomerImportRow {
  rowNumber: number;
  values: CustomerImportValues;
  store_id: number | null;
  state: 'valid' | 'invalid' | 'duplicate';
  errors: string[];
  warnings: string[];
}
export interface CustomerImportResult {
  rows: CustomerImportRow[];
  total: number;
  valid: number;
  invalid: number;
  duplicate: number;
  incomplete: number;
  imported: number;
  committed: boolean;
}

export function importText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[\s*/_-]+/g, ' ').trim();
}
export function importPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (/^84\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^0084\d{9}$/.test(digits)) return `0${digits.slice(4)}`;
  return digits;
}
const statuses: Record<string, string> = {
  active: 'active', 'binh thuong': 'active', warning: 'warning', 'can luu y': 'warning',
  blacklist: 'blacklist', 'blacklist (khach no xau)': 'blacklist', 'no xau': 'blacklist', 'bad debt': 'blacklist',
  draft: 'draft', 'chua hoan tat': 'draft',
};

export function validateCustomerImport(inputs: CustomerImportInput[], stores: CustomerImportStore[], existing: CustomerImportExisting[], allowIncomplete = false): CustomerImportResult {
  const seenCards = new Map<string, number[]>(), seenPhones = new Map<string, number[]>();
  for (const input of inputs) {
    for (const [map, value] of [[seenCards, input.values.id_card.replace(/\s/g, '')], [seenPhones, importPhone(input.values.phone)]] as const) {
      if (value) map.set(value, [...(map.get(value) || []), input.rowNumber]);
    }
  }
  const existingCards = new Map<string, number>(), existingPhones = new Map<string, number>();
  for (const row of existing) {
    if (row.id_card) existingCards.set(row.id_card.replace(/\s/g, ''), row.id);
    if (row.phone) existingPhones.set(importPhone(row.phone), row.id);
  }
  const rows: CustomerImportRow[] = inputs.map(input => {
    const values = Object.fromEntries(CUSTOMER_IMPORT_COLUMNS.map(column => [column.key, input.values[column.key].trim()])) as CustomerImportValues;
    values.phone = values.phone.replace(/[\s.()-]/g, '');
    values.id_card = values.id_card.replace(/\s/g, '');
    values.status = values.status ? statuses[importText(values.status)] || values.status : 'active';
    const incompleteAllowed = allowIncomplete && values.status === 'draft';
    if (values.warning_note && (values.status === 'active' || (values.status === 'draft' && !incompleteAllowed))) values.status = 'warning';
    const errors = [...(input.errors || [])];
    const warnings: string[] = [];
    for (const column of CUSTOMER_IMPORT_COLUMNS) {
      if (column.required && !values[column.key]) {
        if (incompleteAllowed && ['id_card', 'address'].includes(column.key)) warnings.push(`Chưa có ${column.label.toLowerCase()}; cần bổ sung hồ sơ sau khi nhập.`);
        else errors.push(`Thiếu ${column.label.toLowerCase()}.`);
      }
      if (values[column.key].length > column.max) errors.push(`${column.label} vượt ${column.max} ký tự.`);
    }
    if (values.phone && !/^\+?\d{9,13}$/.test(values.phone)) errors.push('Số điện thoại cần 9–13 chữ số.');
    if (values.id_card && !/^(\d{9}|\d{12})$/.test(values.id_card)) errors.push('CCCD cần 12 chữ số; CMND cần 9 chữ số. Kiểm tra số 0 đầu.');
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.push('Email chưa đúng định dạng.');
    if (!['active', 'warning', 'blacklist', 'draft'].includes(values.status)) errors.push('Trạng thái hồ sơ chưa được hỗ trợ.');
    if (values.status === 'warning' && !values.warning_note) errors.push('Hồ sơ Cần lưu ý phải có ghi chú / cảnh báo.');
    const matches = stores.filter(store => String(store.id) === values.store || importText(store.name) === importText(values.store) || (store.code && importText(store.code) === importText(values.store)));
    const storeId = matches.length === 1 ? Number(matches[0].id) : null;
    if (values.store && storeId === null) errors.push('Cơ sở không tồn tại hoặc tên bị trùng. Dùng ID tại sheet Cơ sở.');
    const duplicates: string[] = [];
    for (const [label, key, seen, current] of [
      ['CCCD/CMND', values.id_card, seenCards, existingCards],
      ['Số điện thoại', importPhone(values.phone), seenPhones, existingPhones],
    ] as const) {
      if (!key) continue;
      const otherRows = (seen.get(key) || []).filter(number => number !== input.rowNumber);
      if (otherRows.length) duplicates.push(`${label} trùng trong file (dòng ${otherRows.slice(0, 5).join(', ')}${otherRows.length > 5 ? ', …' : ''}).`);
      if (current.has(key)) duplicates.push(`${label} đã có ở khách hàng #${current.get(key)}.`);
    }
    return { rowNumber: input.rowNumber, values, store_id: storeId, state: errors.length ? 'invalid' : duplicates.length ? 'duplicate' : 'valid', errors: [...errors, ...duplicates], warnings };
  });
  return { rows, total: rows.length, valid: rows.filter(row => row.state === 'valid').length,
    invalid: rows.filter(row => row.state === 'invalid').length, duplicate: rows.filter(row => row.state === 'duplicate').length,
    incomplete: rows.filter(row => row.state === 'valid' && row.warnings.length).length, imported: 0, committed: false };
}
