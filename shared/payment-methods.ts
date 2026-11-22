export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'transfer', label: 'Chuyển khoản' },
  { value: 'company_transfer', label: 'CK tài khoản công ty' },
] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number]['value'];
export const paymentMethodLabel = (method: PaymentMethod) =>
  method === 'transfer' ? 'CK tài khoản cá nhân' : PAYMENT_METHODS.find(item => item.value === method)?.label || method;

export function vietnamPaymentTime(now = new Date()) {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
