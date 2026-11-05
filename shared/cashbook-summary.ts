export const CASHBOOK_BREAKDOWN_KEYS = ["deposit_income", "rental_income", "renewal_income", "late_fee_income", "repair_income", "extra_income", "other_income", "deposit_refund_expense", "rental_refund_expense", "other_expense"] as const;
export type CashbookBreakdown = Record<typeof CASHBOOK_BREAKDOWN_KEYS[number], number>;
export function cashbookRentalTotals(detail: CashbookBreakdown) {
  const receipts = detail.rental_income + detail.renewal_income + detail.late_fee_income;
  return { revenue: detail.rental_income + detail.renewal_income - detail.rental_refund_expense, income: detail.deposit_income + receipts, expense: detail.deposit_refund_expense + detail.rental_refund_expense };
}
