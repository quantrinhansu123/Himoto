export interface ContractType {
  id: string; label: string; rental_type: string; term_months: number | null; active: boolean; revision: string;
}
export interface ContractTypeInput { label: string; rental_type: 'daily' | 'monthly' | 'ownership'; term_months: number | null; active: boolean }
export const CONTRACT_TYPE_BILLING = [
  { value: 'daily', label: 'Thuê theo ngày / tuần' },
  { value: 'monthly', label: 'Thuê theo tháng' },
  { value: 'ownership', label: 'Thuê sở hữu, thu theo kỳ' },
] as const;

export class ContractTypeError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const validContractTypeId = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9_-]{1,80}$/.test(id);

export function parseContractType(input: unknown, editing = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ContractTypeError('Thông tin loại hợp đồng không hợp lệ.');
  const body = input as Record<string, unknown>;
  const allowed = editing ? ['id','revision','label','active'] : ['label','rental_type','term_months','active'];
  if (Object.keys(body).some(key => !allowed.includes(key)) || typeof body.label !== 'string' || typeof body.active !== 'boolean') throw new ContractTypeError('Thông tin loại hợp đồng không hợp lệ.');
  const label = body.label.trim().normalize('NFC');
  if (!label || label.length > 80 || [...label].some(char=>char.charCodeAt(0)<32 || char.charCodeAt(0)===127)) throw new ContractTypeError('Nhập tên loại hợp đồng từ 1 đến 80 ký tự.');
  if (editing) {
    if (!validContractTypeId(body.id) || typeof body.revision !== 'string' || !/^\d{1,20}$/.test(body.revision)) throw new ContractTypeError('Phiên bản loại hợp đồng không hợp lệ.');
    return { id: body.id, revision: body.revision, label, active: body.active };
  }
  if (!['daily','monthly','ownership'].includes(String(body.rental_type)) || body.term_months !== null && (!Number.isSafeInteger(body.term_months) || Number(body.term_months) < 1 || Number(body.term_months) > 120) || body.rental_type === 'daily' && body.term_months !== null) throw new ContractTypeError('Chọn cách tính tiền và thời hạn từ 1 đến 120 tháng, hoặc để trống thời hạn.');
  return { label, active: body.active, rental_type: String(body.rental_type), term_months: body.term_months as number | null };
}
