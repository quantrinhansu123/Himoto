import { PAYMENT_METHODS, type PaymentMethod } from './contract-payments';

export interface ContractCharge { name: string; amount: string; method?: PaymentMethod }
export interface ContractCollection { purpose: 'deposit' | 'rental'; amount: number; method: string; account: string; paid_at: string }
const MAX_MONEY = 9_999_999_999_999;

/** Blank lines are allowed in drafts; malformed values never become zero. */
export function chargeTotal(input: unknown): number | null {
  if (input === undefined) return 0;
  if (!Array.isArray(input) || input.length > 20) return null;
  let total = 0;
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key=>!['name','amount','method'].includes(key)) ||
      (item.method !== undefined && !PAYMENT_METHODS.some(method=>method.value===item.method)) || typeof item.name !== 'string' || item.name.length > 100 || typeof item.amount !== 'string' || (item.amount && !/^\d{1,13}$/.test(item.amount))) return null;
    const amount = Number(item.amount);
    if (!Number.isSafeInteger(amount) || amount > MAX_MONEY || total + amount > MAX_MONEY) return null;
    total += amount;
  }
  return total;
}

export function chargeErrors(charges: ContractCharge[] | undefined, issuing: boolean): Record<string,string> {
  if (chargeTotal(charges) === null) return { extra_charges:'Phí khác phải có số tiền nguyên không âm, tối đa 20 khoản.' };
  const errors: Record<string,string> = {};
  if (issuing) for (const [index,item] of (charges || []).entries()) {
    if (!item.name.trim() && !item.amount) continue;
    if (!item.name.trim()) errors[`charge_${index}_name`] = 'Nhập tên khoản phí.';
    if (!item.amount || Number(item.amount) <= 0) errors[`charge_${index}_amount`] = 'Nhập số tiền lớn hơn 0.';
  }
  return errors;
}
