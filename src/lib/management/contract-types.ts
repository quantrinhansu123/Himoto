import { CONTRACT_TYPES } from './config';

import type { ContractType } from '../../../shared/contract-types';
export { CONTRACT_TYPE_BILLING,type ContractType,type ContractTypeInput } from '../../../shared/contract-types';
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
