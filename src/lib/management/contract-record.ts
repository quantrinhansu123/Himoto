import { createContractDraft, validateContractDraft } from './contract-document';
import { CONTRACT_STATUSES, CONTRACT_TYPES } from './config';
import { ContractEdits, ManagementDataset, ManagementRow } from './types';

export function cloneContractRecord(dataset: ManagementDataset, sourceId: number): ManagementRow {
  const source = dataset.contracts.find(row => row.id === sourceId);
  if (!source) throw new Error('Không tìm thấy hợp đồng cần sao chép.');
  const id = Math.max(0, ...dataset.contracts.map(row => row.id)) + 1;
  // The demo allocator is synchronous. Production IDs must be allocated by the existing backend.
  let sequence = id;
  const prefix = source.code.replace(/\d+$/, '') || 'HD-';
  let code = `${prefix}${String(sequence).padStart(3, '0')}`;
  while (dataset.contracts.some(row => row.code === code)) code = `${prefix}${String(++sequence).padStart(3, '0')}`;
  const draft = createContractDraft(dataset, String(source.store_id || 'all'), source);
  return { ...structuredClone(source), id, code, name: source.name === source.code ? code : source.name,
    draft_json: JSON.stringify({ ...draft, contract_number: code }) };
}

export function updateContractRecord(dataset: ManagementDataset, id: number, edits: ContractEdits): ManagementRow {
  const source = dataset.contracts.find(row => row.id === id);
  if (!source) throw new Error('Không tìm thấy hợp đồng cần chỉnh sửa.');
  const { draft } = edits;
  const errors = validateContractDraft(draft, dataset, dataset.staff, 'demo');
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  if (!CONTRACT_STATUSES.some(option => option.value === edits.status)) throw new Error('Trạng thái hợp đồng không hợp lệ.');
  if (!CONTRACT_TYPES.some(option => option.value === edits.rental_type)) throw new Error('Loại hợp đồng không hợp lệ.');
  if (draft.contract_number !== source.code) throw new Error('Mã hợp đồng đã được cấp, không thể thay đổi.');
  const amount = (input: string) => input === '' ? undefined : Number(input);
  return { ...source, status: edits.status, rental_type: edits.rental_type, notes: edits.notes,
    store_id: Number(draft.store_id), store_name: dataset.stores.find(store => String(store.id) === draft.store_id)?.name,
    staff_id: draft.staff_id ? Number(draft.staff_id) : undefined, customer_id: draft.customer_id!, customer_name: draft.customer.name,
    customer_phone: draft.customer.phone, customer_id_card: draft.customer.id_card,
    vehicle_id: Number(draft.vehicles[0].id), vehicle_name: draft.vehicles.map(vehicle => vehicle.name).join(', '),
    license: draft.vehicles.map(vehicle => vehicle.license).join(', '),
    start_date: draft.start_date, end_date: draft.end_date, total_amount: amount(draft.total_amount),
    deposit_amount: amount(draft.deposit_amount), paid_amount: amount(draft.paid_amount),
    draft_json: JSON.stringify(structuredClone(draft)) };
}
