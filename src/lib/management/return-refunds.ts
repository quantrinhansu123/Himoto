// Account numbers copied from bank screens often contain grouping dots/spaces.
// Keep the same canonical value in the form and the return API.
export const normalizeRefundAccount = (value: string) => value.trim().replace(/[\s.]/g, '');
export const validRefundAccount = (value: string) => /^[A-Z0-9-]{3,34}$/i.test(normalizeRefundAccount(value));

// Preview only: the server rechecks the actual refundable balance after recording
// every return adjustment. A discount on unpaid rent does not create cash to refund.
export function returnRentalRefundable(context:{total_amount:number|null;paid_amount:number|null;rental_refundable?:number},earlyDiscount:number,netAdjustment:number) {
  if(context.total_amount===null||context.paid_amount===null)return 0;
  return Math.max(Math.min((context.rental_refundable||0)+earlyDiscount,context.paid_amount-context.total_amount-netAdjustment),0);
}
