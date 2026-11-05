export interface StoreManager { id: number; name: string }
export interface StoreEdits { name: string; phone: string; address: string; status: string; user_id: number | null; revision: string }
export type StoreCreation = Omit<StoreEdits, 'revision'> & { code: string; kind: string };
export const STORE_KINDS = [{ value: 'physical', label: 'Cơ sở cho thuê' }, { value: 'lease_to_own', label: 'Kho thuê mua' }];

export function validateStoreEdits(edits: Omit<StoreEdits, 'revision'>) {
  const errors: Record<string, string> = {};
  if (!edits.name.trim()) errors.name = 'Nhập tên cơ sở.';
  for (const key of ['name', 'phone', 'address'] as const) if ([...edits[key]].length > 255) errors[key] = 'Tối đa 255 ký tự.';
  if (edits.phone && !/^\+?\d{9,13}$/.test(edits.phone.replace(/[\s.()-]/g, ''))) errors.phone = 'Số điện thoại cần 9–13 chữ số.';
  if (!['active', 'inactive'].includes(edits.status)) errors.status = 'Chọn trạng thái cơ sở hợp lệ.';
  if (edits.user_id !== null && (!Number.isSafeInteger(edits.user_id) || edits.user_id <= 0)) errors.user_id = 'Chọn tài khoản phụ trách hợp lệ.';
  return errors;
}

export function validateStoreCreation(store: StoreCreation) {
  const errors = validateStoreEdits(store);
  if (store.code && !/^[A-Z0-9][A-Z0-9_-]{0,190}$/i.test(store.code.trim())) errors.code = 'Mã tối đa 191 ký tự, gồm chữ không dấu, số, dấu - hoặc _.';
  if (!STORE_KINDS.some(kind => kind.value === store.kind)) errors.kind = 'Chọn loại cơ sở hợp lệ.';
  return errors;
}
