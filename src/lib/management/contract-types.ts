import { CONTRACT_TYPES } from './config';

export interface ContractType {
  id: string; label: string; rental_type: string; term_months: number | null; active: boolean; revision: string;
}
export interface ContractTypeInput { label: string; rental_type: 'daily' | 'monthly' | 'ownership'; term_months: number | null; active: boolean }
export const CONTRACT_TYPE_BILLING = [
  { value: 'daily', label: 'Thuê theo ngày / tuần' },
  { value: 'monthly', label: 'Thuê theo tháng' },
  { value: 'ownership', label: 'Thuê sở hữu, thu theo kỳ' },
] as const;
export const initialContractTypes = (): ContractType[] => CONTRACT_TYPES.map(type => ({
  id: type.value, label: type.label, rental_type: type.value,
  term_months: /^monthly_(\d+)$/.test(type.value) ? Number(type.value.split('_')[1]) : null,
  active: ['daily', 'monthly', 'ownership'].includes(type.value), revision: '1',
}));

export async function contractTypeRequest(method = 'GET', input?: unknown): Promise<ContractType[]> {
  const response = await fetch('/api/auth/contract-types', { method, credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', ...(input ? { 'Content-Type': 'application/json' } : {}) }, ...(input ? { body: JSON.stringify(input) } : {}) });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== 'success' || !Array.isArray(result.data)) throw new Error(result?.message || 'Không tải hoặc lưu được loại hợp đồng.');
  return result.data;
}
