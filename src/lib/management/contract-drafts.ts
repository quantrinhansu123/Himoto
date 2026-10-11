import { CONTRACT_TYPES } from './config';
import { ContractDraft } from './contract-document';
import { ContractEdits, ManagementDataset, ManagementRow } from './types';
import { chargeErrors } from './contract-charges';

// Drafts may be incomplete. Validate values that were entered, without applying
// the requirements for printing or issuing an operational rental contract.
export function validateDraftSave(draft: ContractDraft, dataset: ManagementDataset) {
  const errors: Record<string, string> = {};
  Object.assign(errors,chargeErrors(draft.extra_charges,false));
  if (draft.store_id && !dataset.stores.some(row => String(row.id) === draft.store_id)) errors.store_id = 'Cơ sở đã chọn không còn tồn tại.';
  if (draft.staff_id && !dataset.staff.some(row => String(row.id) === draft.staff_id && String(row.store_id) === draft.store_id)) errors.staff_id = 'Nhân sự phải thuộc cơ sở đã chọn.';
  const vehicleIds = new Set<string>();
  draft.vehicles.forEach((vehicle, index) => {
    if (vehicle.id && !dataset.vehicles.some(row => String(row.id) === vehicle.id)) errors[`vehicle_${index}`] = 'Xe đã chọn không còn tồn tại.';
    if (vehicle.id && vehicleIds.has(vehicle.id)) errors[`vehicle_${index}`] = 'Xe này đã được chọn trên bản nháp.';
    if (vehicle.id) vehicleIds.add(vehicle.id);
    for (const key of ['borrow_hats', 'borrow_raincoats'] as const) if (vehicle[key] && !/^\d+$/.test(vehicle[key])) errors[`vehicle_${index}_${key}`] = 'Nhập số nguyên không âm.';
  });
  for (const key of ['unit_price', 'total_amount', 'paid_amount', 'deposit_amount'] as const) {
    if (draft[key] && (!/^\d+$/.test(draft[key]) || !Number.isSafeInteger(Number(draft[key])))) errors[key] = 'Nhập số tiền nguyên không âm.';
  }
  for (const key of ['start_date', 'end_date'] as const) {
    if (draft[key] && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(draft[key])) errors[key] = 'Thời gian chưa đúng định dạng.';
  }
  if (draft.start_date && draft.end_date && draft.end_date <= draft.start_date) errors.end_date = 'Thời gian hẹn trả phải sau thời gian bắt đầu.';
  return errors;
}

export function saveDraftRecord(dataset: ManagementDataset, id: number | null, edits: ContractEdits): ManagementRow {
  const existing = id === null ? undefined : dataset.contracts.find(row => row.id === id);
  if (id !== null && !existing) throw new Error('Không tìm thấy bản nháp cần chỉnh sửa.');
  if (existing && existing.status !== 'draft') throw new Error('Chỉ cập nhật bản nháp. Không chuyển hợp đồng đã phát hành thành nháp.');
  const errors = validateDraftSave(edits.draft, dataset);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  if (!CONTRACT_TYPES.some(option => option.value === edits.rental_type)) throw new Error('Loại hợp đồng không hợp lệ.');
  const recordId = existing?.id ?? Math.max(0, ...dataset.contracts.map(row => row.id)) + 1;
  const code = existing?.code || edits.draft.contract_number.trim() || `NHAP-${String(recordId).padStart(4, '0')}`;
  if (dataset.contracts.some(row => row.id !== recordId && row.code === code)) throw new Error('Số hợp đồng đã được sử dụng.');
  if (existing && edits.draft.contract_number !== existing.code) throw new Error('Mã bản nháp đã được cấp, không thể thay đổi.');
  const draft = { ...structuredClone(edits.draft), contract_number: code };
  const amount = (input: string) => input === '' ? undefined : Number(input);
  return { ...existing, id: recordId, code, name: code, status: 'draft', rental_type: edits.rental_type, notes: edits.notes,
    created_at: existing?.created_at || new Date().toISOString(), updated_at: new Date().toISOString(),
    store_id: draft.store_id ? Number(draft.store_id) : undefined,
    store_name: dataset.stores.find(store => String(store.id) === draft.store_id)?.name,
    staff_id: draft.staff_id ? Number(draft.staff_id) : undefined, customer_id: draft.customer_id ?? undefined,
    customer_name: draft.customer.name, customer_phone: draft.customer.phone, customer_id_card: draft.customer.id_card,
    vehicle_id: draft.vehicles[0]?.id ? Number(draft.vehicles[0].id) : undefined,
    vehicle_name: draft.vehicles.map(vehicle => vehicle.name).filter(Boolean).join(', '),
    license: draft.vehicles.map(vehicle => vehicle.license).filter(Boolean).join(', '),
    start_date: draft.start_date, end_date: draft.end_date, total_amount: amount(draft.total_amount),
    paid_amount: amount(draft.paid_amount), deposit_amount: amount(draft.deposit_amount), draft_json: JSON.stringify(draft) };
}

export const DEMO_DRAFT_STORAGE_KEY = 'himoto-management:demo-contract-drafts:v1';
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readDemoDrafts(storage: DraftStorage): ManagementRow[] {
  const saved = storage.getItem(DEMO_DRAFT_STORAGE_KEY);
  if (!saved) return [];
  try {
    const payload = JSON.parse(saved);
    if (payload.version !== 1 || !Array.isArray(payload.rows)) throw new Error('Invalid format');
    const ids = new Set<number>(), codes = new Set<string>();
    for (const row of payload.rows) {
      if (!Number.isSafeInteger(row.id) || row.id <= 0 || typeof row.code !== 'string' || !row.code || row.status !== 'draft' || typeof row.draft_json !== 'string') throw new Error('Invalid record');
      const draft = JSON.parse(row.draft_json);
      if (!draft.customer || !Array.isArray(draft.vehicles) || !draft.vehicles.length || ids.has(row.id) || codes.has(row.code)) throw new Error('Invalid snapshot');
      ids.add(row.id); codes.add(row.code);
    }
    return payload.rows;
  } catch { throw new Error('Không đọc được bản nháp đã lưu trong trình duyệt. Dữ liệu lưu vẫn được giữ nguyên.'); }
}

export function writeDemoDrafts(storage: DraftStorage, dataset: ManagementDataset) {
  storage.setItem(DEMO_DRAFT_STORAGE_KEY, JSON.stringify({ version: 1, rows: dataset.contracts.filter(row => row.status === 'draft' && row.draft_json) }));
}
